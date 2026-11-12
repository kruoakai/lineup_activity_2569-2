const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const config = require('../config');
const db = require('../db');
const clock = require('../clock');
const tokens = require('../services/tokens');
const passwords = require('../services/passwords');
const crypto = require('crypto');
const mailer = require('../services/mailer');
const { honorificOf } = require('../services/honorific');
const line = require('../services/lineAuth');
const { authenticate, HttpError, effectiveProxy, peerCheck } = require('../middleware/auth');

const router = express.Router();
const COOKIE = 'lineup_rt';
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 10);

function setRefreshCookie(res, raw, expires, persistent = true) {
  res.cookie(COOKIE, raw, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'strict',
    path: '/api/auth',
    ...(persistent ? { expires } : {}), // ไม่มี expires = session cookie
  });
}

async function publicUser(u) {
  return {
    id: u.id,
    employee_code: u.employee_code,
    email: u.email,
    full_name: u.full_name,
    department_id: u.department_id,
    department_name: u.department_name,
    position_title: u.position_title || '',
    honorific: honorificOf(u),
    phone: u.phone || '',
    has_avatar: !!u.avatar_path,
    has_signature: !!u.signature_path,
    role: u.role,
    can_proxy: effectiveProxy(u),
    peer_check: u.peer_check !== undefined ? !!u.peer_check : await peerCheck(u),
    proxy_until: u.proxy_until || null,
    must_assemble: !!u.must_assemble,
    must_change_password: !!u.must_change_password,
    consented: !!u.consent_at,
    line_linked: !!u.line_user_id,
    line_name: u.line_user_id ? u.line_name || '' : '',
  };
}

// ครูทั้งวิทยาลัยอาจใช้ Wi-Fi/NAT เดียวกัน (IP เดียว) จึงจำกัดต่อ "ชื่อผู้ใช้ + IP" เป็นหลัก
// และมีเพดานรวมต่อ IP ที่สูงพอสำหรับทั้งวิทยาลัย
const isTest = process.env.NODE_ENV === 'test';
const loginPerUser = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: isTest ? 1000 : 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => `${req.ip}|${String(req.body?.username || '').trim().toLowerCase().slice(0, 64)}`,
  message: { error: 'ใส่รหัสผ่านผิดหลายครั้งเกินไป กรุณารอ 10 นาที หรือติดต่อผู้ดูแลระบบ' },
});
const loginPerIp = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: isTest ? 10000 : 600,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'มีการเข้าสู่ระบบจากเครือข่ายนี้มากเกินไป กรุณารอสักครู่' },
});
const loginLimiter = [loginPerIp, loginPerUser];

// เข้าสู่ระบบด้วยรหัสพนักงาน หรืออีเมล
router.post('/login', loginLimiter, async (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  if (!username || !password) throw new HttpError(400, 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน');
  const [u] = await db.query(
    `SELECT u.*, d.name AS department_name FROM users u LEFT JOIN departments d ON d.id = u.department_id
      WHERE u.employee_code = ? OR u.email = ? LIMIT 1`,
    [username, username.toLowerCase()],
  );
  // เทียบรหัสเสมอแม้ไม่พบผู้ใช้ เพื่อไม่ให้เดาได้จากเวลาตอบสนอง
  const ok = await bcrypt.compare(password, u ? u.password_hash : DUMMY_HASH);
  if (!u || !ok) throw new HttpError(401, 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
  if (!u.active) throw new HttpError(403, 'บัญชีถูกระงับ ติดต่อผู้ดูแลระบบ');
  const deviceId = typeof req.body.deviceId === 'string' ? req.body.deviceId.slice(0, 64) : null;
  const remember = req.body.remember !== false;
  const rt = await tokens.issueRefresh(u.id, deviceId, remember);
  setRefreshCookie(res, rt.raw, rt.expires, remember);
  res.json({ accessToken: tokens.accessToken(u), user: await publicUser(u) });
});

router.post('/refresh', async (req, res) => {
  const next = await tokens.rotateRefresh(req.cookies?.[COOKIE]);
  if (!next) {
    res.clearCookie(COOKIE, { path: '/api/auth' });
    throw new HttpError(401, 'กรุณาเข้าสู่ระบบใหม่', 'REFRESH_INVALID');
  }
  const [u] = await db.query(
    'SELECT u.*, d.name AS department_name FROM users u LEFT JOIN departments d ON d.id = u.department_id WHERE u.id = ?',
    [next.userId],
  );
  if (!u || !u.active) throw new HttpError(401, 'บัญชีถูกระงับ', 'INACTIVE');
  setRefreshCookie(res, next.raw, next.expires, next.persistent);
  res.json({ accessToken: tokens.accessToken(u), user: await publicUser(u) });
});

router.post('/logout', async (req, res) => {
  await tokens.revokeRefresh(req.cookies?.[COOKIE]);
  res.clearCookie(COOKIE, { path: '/api/auth' });
  res.json({ ok: true });
});

router.get('/me', authenticate, async (req, res) => {
  res.json({ user: await publicUser(req.user) });
});

router.post('/change-password', authenticate, async (req, res) => {
  const current = String(req.body?.currentPassword || '');
  const next = String(req.body?.newPassword || '');
  if (next.length < 8) throw new HttpError(400, 'รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร');
  if (next.length > 72) throw new HttpError(400, 'รหัสผ่านยาวเกินไป');
  if (/^\d+$/.test(next) && new Set(next).size <= 2) throw new HttpError(400, 'รหัสผ่านเดาง่ายเกินไป');
  if (passwords.isWeak(next)) throw new HttpError(400, 'ห้ามใช้รหัสผ่านเริ่มต้นหรือรหัสที่เดาง่าย กรุณาตั้งรหัสใหม่');
  const [row] = await db.query('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
  if (!(await bcrypt.compare(current, row.password_hash))) throw new HttpError(400, 'รหัสผ่านปัจจุบันไม่ถูกต้อง');
  if (current === next) throw new HttpError(400, 'รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสเดิม');
  const hash = await bcrypt.hash(next, 10);
  await db.query('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?', [hash, req.user.id]);
  // ออกจากระบบอุปกรณ์อื่นทั้งหมด แล้วออก token ใหม่ให้อุปกรณ์นี้
  await tokens.revokeAllForUser(req.user.id);
  const rt = await tokens.issueRefresh(req.user.id, null);
  setRefreshCookie(res, rt.raw, rt.expires);
  res.json({ ok: true, accessToken: tokens.accessToken(req.user) });
});

router.post('/consent', authenticate, async (req, res) => {
  if (req.body?.accept !== true) throw new HttpError(400, 'ต้องยอมรับเงื่อนไขเพื่อใช้งาน');
  await db.query('UPDATE users SET consent_at = ? WHERE id = ?', [clock.now(), req.user.id]);
  res.json({ ok: true });
});

// ---------- ลืมรหัสผ่าน: ส่งลิงก์รีเซ็ตทางอีเมล ----------
const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');
const RESET_MINUTES = 30;

const forgotLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isTest ? 1000 : 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => `${req.ip}|${String(req.body?.identifier || '').trim().toLowerCase().slice(0, 64)}`,
  message: { error: 'ขอรีเซ็ตรหัสผ่านบ่อยเกินไป กรุณารอ 15 นาที' },
});

router.get('/options', (_req, res) => {
  res.json({ mailEnabled: mailer.enabled(), lineEnabled: line.enabled() });
});

// ตอบข้อความเดียวกันเสมอ ไม่บอกว่ามีบัญชี/อีเมลนี้หรือไม่
router.post('/forgot', forgotLimiter, async (req, res) => {
  if (!mailer.enabled()) {
    throw new HttpError(503, 'ระบบยังไม่ได้ตั้งค่าการส่งอีเมล กรุณาติดต่อผู้ดูแลระบบเพื่อรีเซ็ตรหัสผ่าน', 'MAIL_DISABLED');
  }
  const id = String(req.body?.identifier || '').trim();
  const generic = { ok: true, message: 'ถ้าข้อมูลถูกต้อง ระบบได้ส่งลิงก์ตั้งรหัสผ่านใหม่ไปที่อีเมลที่ลงทะเบียนไว้แล้ว (ลิงก์ใช้ได้ 30 นาที)' };
  if (!id) throw new HttpError(400, 'กรุณากรอกรหัสพนักงานหรืออีเมล');
  const [u] = await db.query(
    'SELECT id, full_name, email FROM users WHERE (employee_code = ? OR email = ?) AND active = 1 LIMIT 1',
    [id, id.toLowerCase()],
  );
  if (u && u.email) {
    const raw = crypto.randomBytes(32).toString('base64url');
    const expires = new Date(clock.now().getTime() + RESET_MINUTES * 60_000);
    await db.query('UPDATE password_resets SET used_at = ? WHERE user_id = ? AND used_at IS NULL', [clock.now(), u.id]);
    await db.query('INSERT INTO password_resets (user_id, token_hash, expires_at, ip) VALUES (?, ?, ?, ?)',
      [u.id, sha256(raw), expires, req.ip]);
    const link = `${mailer.appUrl()}/reset?token=${raw}`;
    try {
      await mailer.send({
        to: u.email,
        subject: 'ตั้งรหัสผ่านใหม่ — ระบบเช็กชื่อเข้าแถว วิทยาลัยเทคนิคชัยภูมิ',
        text: `เรียน ${u.full_name}\n\nมีการขอตั้งรหัสผ่านใหม่สำหรับบัญชีของท่าน กดลิงก์นี้ภายใน ${RESET_MINUTES} นาที:\n${link}\n\nถ้าท่านไม่ได้ขอ ไม่ต้องทำอะไร รหัสผ่านเดิมยังใช้ได้\n\nระบบเช็กชื่อเข้าแถว วิทยาลัยเทคนิคชัยภูมิ`,
        html: `<p>เรียน ${u.full_name.replace(/[<>&]/g, '')}</p><p>มีการขอตั้งรหัสผ่านใหม่สำหรับบัญชีของท่าน กดปุ่มด้านล่างภายใน ${RESET_MINUTES} นาที</p><p><a href="${link}" style="display:inline-block;padding:12px 20px;background:#1d4e89;color:#fff;border-radius:8px;text-decoration:none">ตั้งรหัสผ่านใหม่</a></p><p style="color:#666">ถ้าท่านไม่ได้ขอ ไม่ต้องทำอะไร รหัสผ่านเดิมยังใช้ได้</p><p style="color:#666">ระบบเช็กชื่อเข้าแถว วิทยาลัยเทคนิคชัยภูมิ</p>`,
      });
    } catch (e) {
      console.error('reset mail failed', e.message);
    }
  }
  res.json(generic);
});

router.post('/reset', async (req, res) => {
  const raw = String(req.body?.token || '');
  const next = String(req.body?.newPassword || '');
  if (next.length < 8) throw new HttpError(400, 'รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร');
  if (next.length > 72) throw new HttpError(400, 'รหัสผ่านยาวเกินไป');
  if (passwords.isWeak(next)) throw new HttpError(400, 'ห้ามใช้รหัสผ่านเริ่มต้นหรือรหัสที่เดาง่าย กรุณาตั้งรหัสใหม่');
  const [row] = await db.query('SELECT * FROM password_resets WHERE token_hash = ?', [sha256(raw)]);
  if (!row || row.used_at || new Date(row.expires_at) < clock.now()) {
    throw new HttpError(400, 'ลิงก์หมดอายุหรือถูกใช้ไปแล้ว กรุณาขอลิงก์ใหม่', 'RESET_INVALID');
  }
  await db.query('UPDATE password_resets SET used_at = ? WHERE id = ?', [clock.now(), row.id]);
  await db.query('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?', [await bcrypt.hash(next, 10), row.user_id]);
  await tokens.revokeAllForUser(row.user_id);
  res.json({ ok: true, message: 'ตั้งรหัสผ่านใหม่แล้ว เข้าสู่ระบบด้วยรหัสใหม่ได้เลย' });
});

// ---------- เข้าสู่ระบบด้วย LINE ----------
const lineLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: isTest ? 10000 : 120, standardHeaders: 'draft-7', legacyHeaders: false,
  message: { error: 'ลองหลายครั้งเกินไป กรุณารอสักครู่' } });

// ปุ่ม "เข้าสู่ระบบด้วย LINE" → ไปหน้า LINE
router.get('/line/start', lineLimiter, (req, res) => {
  if (!line.enabled()) return res.redirect('/login?line_error=LINE_DISABLED');
  const s = line.start('login');
  res.cookie(line.STATE_COOKIE, s.cookie, line.cookieOptions());
  res.redirect(s.url);
});

// ผูกบัญชี LINE กับผู้ใช้ที่เข้าระบบอยู่ (จากหน้าโปรไฟล์) — คืน URL ให้หน้าเว็บพาไป
router.post('/line/link', lineLimiter, authenticate, (req, res) => {
  const s = line.start('link', req.user.id);
  res.cookie(line.STATE_COOKIE, s.cookie, line.cookieOptions());
  res.json({ url: s.url });
});

router.get('/line/callback', lineLimiter, async (req, res) => {
  const cookie = req.cookies?.[line.STATE_COOKIE];
  res.clearCookie(line.STATE_COOKIE, { path: '/api/auth/line' });
  if (req.query.error) return res.redirect('/login?line_error=CANCELLED');
  let r;
  try {
    r = await line.finish({ code: String(req.query.code || ''), state: String(req.query.state || ''), cookie });
  } catch (e) {
    return res.redirect(`/login?line_error=${encodeURIComponent(e.code || 'LINE_FAILED')}`);
  }
  if (r.mode === 'link') {
    const [u] = await db.query('SELECT id, active FROM users WHERE id = ?', [r.uid]);
    if (!u || !u.active) return res.redirect('/login?line_error=INACTIVE');
    const [taken] = await db.query('SELECT id FROM users WHERE line_user_id = ? AND id <> ?', [r.lineUserId, u.id]);
    if (taken) return res.redirect('/profile?line_error=LINE_TAKEN');
    await db.query('UPDATE users SET line_user_id = ?, line_name = ?, line_linked_at = ? WHERE id = ?', [r.lineUserId, r.lineName, clock.now(), u.id]);
    return res.redirect('/profile?line=linked');
  }
  const [u] = await db.query('SELECT id, active FROM users WHERE line_user_id = ?', [r.lineUserId]);
  if (!u) return res.redirect('/login?line_error=NOT_LINKED');
  if (!u.active) return res.redirect('/login?line_error=INACTIVE');
  const rt = await tokens.issueRefresh(u.id, null, true);
  setRefreshCookie(res, rt.raw, rt.expires, true);
  res.redirect('/?line=login');
});

// ยกเลิกการผูก LINE ของตนเอง
router.delete('/line', authenticate, async (req, res) => {
  await db.query('UPDATE users SET line_user_id = NULL, line_name = NULL, line_linked_at = NULL WHERE id = ?', [req.user.id]);
  res.json({ ok: true });
});

module.exports = router;
module.exports.publicUser = publicUser;
