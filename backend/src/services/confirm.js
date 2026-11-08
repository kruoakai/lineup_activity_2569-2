const bcrypt = require('bcryptjs');
const db = require('../db');
const { HttpError } = require('../middleware/auth');

// ยืนยันรหัสผ่านของผู้ใช้ปัจจุบันก่อนทำรายการสำคัญ (ล้างข้อมูล สำรองข้อมูล ลงนาม ฯลฯ)
async function confirmPassword(userId, password) {
  if (!password) throw new HttpError(400, 'กรุณายืนยันด้วยรหัสผ่านของท่าน', 'PASSWORD_REQUIRED');
  const [row] = await db.query('SELECT password_hash FROM users WHERE id = ?', [userId]);
  if (!row || !(await bcrypt.compare(String(password), row.password_hash))) {
    throw new HttpError(403, 'รหัสผ่านยืนยันไม่ถูกต้อง', 'PASSWORD_WRONG');
  }
}

// ตรวจชื่อผู้ใช้ + รหัสผ่านของผู้ดูแลระบบ (ใช้อนุมัติบนเครื่องของผู้อื่น)
async function verifyAdmin(username, password) {
  const u = String(username || '').trim();
  if (!u || !password) throw new HttpError(400, 'กรุณากรอกชื่อผู้ใช้และรหัสผ่านของผู้ดูแลระบบ');
  const [row] = await db.query(
    "SELECT id, full_name, password_hash FROM users WHERE (employee_code = ? OR email = ?) AND role = 'admin' AND active = 1",
    [u, u.toLowerCase()],
  );
  if (!row || !(await bcrypt.compare(String(password), row.password_hash))) {
    throw new HttpError(403, 'ชื่อผู้ใช้หรือรหัสผ่านผู้ดูแลระบบไม่ถูกต้อง', 'ADMIN_WRONG');
  }
  return { id: row.id, full_name: row.full_name };
}

module.exports = { confirmPassword, verifyAdmin };
