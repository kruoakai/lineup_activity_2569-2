const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../db');

class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// สิทธิ์เช็กแทน = ได้รับมอบหมายถาวร หรือได้รับอนุมัติชั่วคราวจากผู้ดูแล (proxy_until ยังไม่หมดเวลา)
function effectiveProxy(u) {
  const clock = require('../clock');
  return Boolean(u.can_proxy) || Boolean(u.proxy_until && new Date(u.proxy_until) > clock.now());
}

// โหมดเช็กแทนกันได้ทั้งแผนก (ผู้ดูแลเปิดที่หน้าตั้งค่า): ทุกคนที่มีแผนกเช็ก "มาเข้าแถว" ให้คนในแผนกเดียวกันได้
async function peerCheck(u) {
  if (!u.department_id || !u.active) return false;
  const s = await require('../services/settings').getAll();
  return s.group_checkin === '1';
}

// ตรวจ access token (Authorization: Bearer ...) แล้วโหลดผู้ใช้จากฐานข้อมูลทุกครั้ง
// เพื่อให้การปิดบัญชีหรือเปลี่ยนสิทธิ์มีผลทันที
async function authenticate(req, _res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return next(new HttpError(401, 'กรุณาเข้าสู่ระบบ', 'NO_TOKEN'));
  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    return next(new HttpError(401, 'เซสชันหมดอายุ', 'TOKEN_EXPIRED'));
  }
  const [user] = await db.query(
    `SELECT u.id, u.employee_code, u.email, u.full_name, u.position_title, u.phone, u.avatar_path,
            u.signature_path, u.department_id, u.role, u.can_proxy, u.proxy_until, u.honorific,
            u.must_assemble, u.active, u.must_change_password, u.consent_at, u.line_user_id, u.line_name, d.name AS department_name
       FROM users u LEFT JOIN departments d ON d.id = u.department_id WHERE u.id = ?`,
    [payload.sub],
  );
  if (!user || !user.active) return next(new HttpError(401, 'บัญชีถูกระงับ', 'INACTIVE'));
  user.can_proxy = effectiveProxy(user);
  user.peer_check = await peerCheck(user);
  req.user = user;
  next();
}

// ต้องเปลี่ยนรหัสผ่านและยอมรับเงื่อนไขก่อนจึงใช้งาน API อื่นได้
function requireReady(req, _res, next) {
  if (req.user.must_change_password) return next(new HttpError(403, 'กรุณาเปลี่ยนรหัสผ่านก่อนใช้งาน', 'MUST_CHANGE_PASSWORD'));
  if (!req.user.consent_at) return next(new HttpError(403, 'กรุณายอมรับเงื่อนไขการใช้ข้อมูลก่อนใช้งาน', 'MUST_CONSENT'));
  next();
}

function requireRole(...roles) {
  return (req, _res, next) => {
    if (!roles.includes(req.user.role)) return next(new HttpError(403, 'ไม่มีสิทธิ์ใช้งานส่วนนี้', 'FORBIDDEN'));
    next();
  };
}

module.exports = { authenticate, requireReady, requireRole, HttpError, effectiveProxy, peerCheck };
