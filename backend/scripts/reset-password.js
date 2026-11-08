/**
 * รีเซ็ตรหัสผ่านผู้ใช้จากเซิร์ฟเวอร์ (ใช้เมื่อลืมรหัส admin)
 *   docker compose exec app node scripts/reset-password.js admin
 * ตั้งรหัสสุ่มใหม่ บังคับเปลี่ยนรหัสเมื่อเข้าครั้งถัดไป ออกจากระบบทุกอุปกรณ์ แล้วพิมพ์รหัสใหม่ออกหน้าจอ
 */
const bcrypt = require('bcryptjs');
const db = require('../src/db');
const passwords = require('../src/services/passwords');
const tokens = require('../src/services/tokens');

async function main(code) {
  if (!code) throw new Error('ใช้: node scripts/reset-password.js <รหัสพนักงาน>');
  const [u] = await db.query('SELECT id, full_name FROM users WHERE employee_code = ?', [code]);
  if (!u) throw new Error(`ไม่พบผู้ใช้ ${code}`);
  const pw = passwords.generate(12);
  await db.query('UPDATE users SET password_hash = ?, must_change_password = 1, active = 1 WHERE id = ?', [await bcrypt.hash(pw, 10), u.id]);
  await tokens.revokeAllForUser(u.id);
  console.log(`รีเซ็ตรหัสผ่าน ${u.full_name} (${code}) แล้ว\nรหัสผ่านชั่วคราว: ${pw}\nต้องเปลี่ยนรหัสเมื่อเข้าสู่ระบบครั้งถัดไป`);
}

main(process.argv[2]).then(() => db.close()).catch((e) => { console.error(e.message); process.exit(1); });
