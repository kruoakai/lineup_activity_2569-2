const crypto = require('crypto');
const config = require('../config');
const clock = require('../clock');

// QR แบบหมุนเวียน: token = <slot>.<hmac> โดย slot = floor(เวลา / interval)
// ยอมรับ token ย้อนหลังได้ไม่เกิน 120 วินาที (เผื่อเวลาเปิดลิงก์และเข้าสู่ระบบ)
const MAX_AGE_S = 120;

function sign(slot) {
  return crypto.createHmac('sha256', config.qrSecret).update(`lineup:${slot}`).digest('base64url').slice(0, 22);
}

function current(intervalS, at = clock.now()) {
  const slot = Math.floor(at.getTime() / 1000 / intervalS);
  const expiresAt = (slot + 1) * intervalS * 1000;
  return { token: `${slot}.${sign(slot)}`, expiresInMs: expiresAt - at.getTime(), intervalS };
}

function verify(token, intervalS, at = clock.now()) {
  if (typeof token !== 'string' || token.length > 64) return false;
  const m = /^(\d+)\.([A-Za-z0-9_-]{22})$/.exec(token);
  if (!m) return false;
  const slot = Number(m[1]);
  const expected = sign(slot);
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(m[2]))) return false;
  const nowSlot = Math.floor(at.getTime() / 1000 / intervalS);
  const maxBack = Math.ceil(MAX_AGE_S / intervalS);
  return slot <= nowSlot && slot >= nowSlot - maxBack;
}

module.exports = { current, verify };
