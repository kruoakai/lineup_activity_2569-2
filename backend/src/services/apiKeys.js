/**
 * กุญแจ API สำหรับระบบภายนอก (เช่น ระบบบุคลากร/สารบรรณของวิทยาลัย)
 * รูปแบบกุญแจ: lu_<prefix 8 ตัว>_<ความลับ 40 ตัว> — เก็บเฉพาะ SHA-256 ในฐานข้อมูล
 */
const crypto = require('crypto');
const db = require('../db');
const clock = require('../clock');
const { HttpError } = require('../middleware/auth');

const SCOPES = {
  'users:read': 'อ่านรายชื่อผู้ใช้และแผนก',
  'users:write': 'เพิ่ม/แก้ไข/ระงับผู้ใช้',
  'attendance:read': 'อ่านผลการเข้าแถวและสรุปร้อยละ',
};
const RATE_PER_MIN = 120;
const hits = new Map();

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
function randomText(n) {
  const bytes = crypto.randomBytes(n);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

function parseIps(text) {
  const ips = String(text || '').split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
  for (const ip of ips) if (!/^[0-9a-fA-F:.]{2,45}$/.test(ip)) throw new HttpError(400, `IP "${ip}" ไม่ถูกต้อง`);
  return ips.join(',').slice(0, 500);
}

async function create({ name, scopes, allowedIps, expiresDays, actorId }) {
  const n = String(name || '').trim().slice(0, 100);
  if (!n) throw new HttpError(400, 'กรุณาตั้งชื่อกุญแจ เช่น ชื่อระบบที่จะเชื่อมต่อ');
  const sc = [...new Set(Array.isArray(scopes) ? scopes : [])].filter((s) => SCOPES[s]);
  if (!sc.length) throw new HttpError(400, 'เลือกสิทธิ์อย่างน้อย 1 อย่าง');
  const days = Number(expiresDays) || 0;
  if (days < 0 || days > 3650) throw new HttpError(400, 'อายุกุญแจไม่ถูกต้อง');
  const prefix = randomText(8);
  const key = `lu_${prefix}_${randomText(40)}`;
  const expires = days ? new Date(clock.now().getTime() + days * 86400_000) : null;
  const r = await db.query(
    'INSERT INTO api_keys (name, prefix, key_hash, scopes, allowed_ips, created_by, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [n, prefix, sha256(key), sc.join(','), parseIps(allowedIps), actorId, expires]);
  return { id: r.insertId, key, prefix, name: n, scopes: sc };
}

async function list() {
  const rows = await db.query(
    `SELECT k.id, k.name, k.prefix, k.scopes, k.allowed_ips, k.created_at, k.expires_at, k.revoked_at,
            k.last_used_at, k.last_used_ip, k.use_count, u.full_name AS created_by_name
       FROM api_keys k LEFT JOIN users u ON u.id = k.created_by ORDER BY k.revoked_at IS NOT NULL, k.created_at DESC`);
  const now = clock.now();
  return rows.map((k) => ({
    ...k,
    scopes: k.scopes.split(','),
    status: k.revoked_at ? 'revoked' : k.expires_at && new Date(k.expires_at) <= now ? 'expired' : 'active',
  }));
}

async function revoke(id) {
  const r = await db.query('UPDATE api_keys SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL', [clock.now(), Number(id)]);
  if (!r.affectedRows) throw new HttpError(404, 'ไม่พบกุญแจ หรือถูกยกเลิกไปแล้ว');
}

/** middleware: ตรวจกุญแจจาก Authorization: Bearer <key> หรือ X-API-Key */
async function authenticateKey(req, _res, next) {
  const h = req.headers.authorization || '';
  const key = h.startsWith('Bearer ') ? h.slice(7).trim() : String(req.headers['x-api-key'] || '').trim();
  if (!/^lu_[A-Za-z0-9]{8}_[A-Za-z0-9]{40}$/.test(key)) return next(new HttpError(401, 'ต้องส่งกุญแจ API ที่ถูกต้อง', 'API_KEY_REQUIRED'));
  const [k] = await db.query('SELECT * FROM api_keys WHERE key_hash = ?', [sha256(key)]);
  const now = clock.now();
  if (!k || k.revoked_at || (k.expires_at && new Date(k.expires_at) <= now)) {
    return next(new HttpError(401, 'กุญแจ API ไม่ถูกต้อง หมดอายุ หรือถูกยกเลิก', 'API_KEY_INVALID'));
  }
  const ips = k.allowed_ips ? k.allowed_ips.split(',') : [];
  const ip = String(req.ip || '').replace(/^::ffff:/, '');
  if (ips.length && !ips.includes(ip)) return next(new HttpError(403, `ไม่อนุญาตให้เรียกจาก IP ${ip}`, 'API_IP_DENIED'));

  // จำกัดจำนวนครั้งต่อนาทีต่อกุญแจ
  const minute = Math.floor(Date.now() / 60000);
  const hk = `${k.id}:${minute}`;
  const n = (hits.get(hk) || 0) + 1;
  hits.set(hk, n);
  if (hits.size > 1000) for (const key2 of hits.keys()) if (!key2.endsWith(`:${minute}`)) hits.delete(key2);
  if (n > RATE_PER_MIN) return next(new HttpError(429, `เรียกเกิน ${RATE_PER_MIN} ครั้งต่อนาที`, 'RATE_LIMIT'));

  await db.query('UPDATE api_keys SET last_used_at = ?, last_used_ip = ?, use_count = use_count + 1 WHERE id = ?', [now, ip.slice(0, 64), k.id]);
  req.apiKey = { id: k.id, name: k.name, scopes: k.scopes.split(','), createdBy: k.created_by };
  return next();
}

function requireScope(scope) {
  return (req, _res, next) => (req.apiKey?.scopes.includes(scope)
    ? next()
    : next(new HttpError(403, `กุญแจนี้ไม่มีสิทธิ์ ${scope}`, 'API_SCOPE')));
}

module.exports = { SCOPES, RATE_PER_MIN, create, list, revoke, authenticateKey, requireScope };
