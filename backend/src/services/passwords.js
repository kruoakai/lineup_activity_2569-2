const crypto = require('crypto');

// รหัสผ่านเริ่มต้นแบบสุ่ม อ่านง่าย (ตัด 0/O, 1/l/I ออก) ผู้ใช้ต้องเปลี่ยนเมื่อเข้าสู่ระบบครั้งแรก
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

function generate(length = 8) {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

// รหัสผ่านเริ่มต้นของบุคลากร (ตามที่วิทยาลัยกำหนด) — ระบบบังคับให้เปลี่ยนทันทีเมื่อเข้าสู่ระบบครั้งแรก
// เปลี่ยนได้ด้วยตัวแปร INITIAL_PASSWORD ใน deploy/.env
const DEFAULT = process.env.INITIAL_PASSWORD || '12345678';
const initial = () => DEFAULT;

// รหัสผ่านที่ห้ามตั้งเป็นรหัสใหม่ (รหัสเริ่มต้นและรหัสที่เดาง่าย)
const WEAK = new Set([DEFAULT, '12345678', '123456789', '1234567890', '87654321', '11111111', '00000000', '12341234',
  'password', 'password1', 'qwerty12', 'qwertyui', 'abcd1234', '1q2w3e4r', 'ccollege', 'lineup12']);
function isWeak(pw) {
  return WEAK.has(String(pw).toLowerCase());
}

module.exports = { generate, initial, isWeak, DEFAULT };
