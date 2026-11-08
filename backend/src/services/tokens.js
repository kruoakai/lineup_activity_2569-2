const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../db');
const clock = require('../clock');

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

function accessToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, config.jwtSecret, { expiresIn: config.accessTokenTtl });
}

async function issueRefresh(userId, deviceId, persistent = true) {
  const raw = crypto.randomBytes(32).toString('base64url');
  // เซสชันแบบไม่จำ: ฝั่งเซิร์ฟเวอร์ให้อายุสูงสุด 12 ชั่วโมง
  const ms = persistent ? config.refreshTokenDays * 86400_000 : 12 * 3600_000;
  const expires = new Date(clock.now().getTime() + ms);
  await db.query('INSERT INTO refresh_tokens (user_id, token_hash, device_id, expires_at, persistent) VALUES (?, ?, ?, ?, ?)',
    [userId, sha256(raw), deviceId || null, expires, persistent ? 1 : 0]);
  return { raw, expires, persistent };
}

// หมุนเวียน refresh token: ใช้ได้ครั้งเดียว ถ้าพบการนำ token ที่ถูกเพิกถอนแล้วมาใช้ซ้ำ ให้เพิกถอนทุกเซสชันของผู้ใช้
async function rotateRefresh(raw) {
  if (!raw) return null;
  const [row] = await db.query('SELECT * FROM refresh_tokens WHERE token_hash = ?', [sha256(raw)]);
  if (!row) return null;
  if (row.revoked_at) {
    // เผื่อเครือข่ายช้าแล้วแอปส่งซ้ำ: ยอมให้ช่วงผ่อนผัน 30 วินาที
    if (clock.now() - new Date(row.revoked_at) > 30_000) {
      await db.query('UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL', [clock.now(), row.user_id]);
    }
    return null;
  }
  if (new Date(row.expires_at) < clock.now()) return null;
  await db.query('UPDATE refresh_tokens SET revoked_at = ? WHERE id = ?', [clock.now(), row.id]);
  const next = await issueRefresh(row.user_id, row.device_id, row.persistent !== 0);
  return { userId: row.user_id, ...next };
}

async function revokeRefresh(raw) {
  if (!raw) return;
  await db.query('UPDATE refresh_tokens SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL', [clock.now(), sha256(raw)]);
}

async function revokeAllForUser(userId) {
  await db.query('UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL', [clock.now(), userId]);
}

module.exports = { accessToken, issueRefresh, rotateRefresh, revokeRefresh, revokeAllForUser };
