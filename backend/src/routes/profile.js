const express = require('express');
const db = require('../db');
const files = require('../services/files');
const { confirmPassword } = require('../services/confirm');
const { authenticate, requireReady, HttpError } = require('../middleware/auth');
const { publicUser } = require('./auth');

const router = express.Router();
router.use(authenticate, requireReady);

async function me(id) {
  const [u] = await db.query(
    'SELECT u.*, d.name AS department_name FROM users u LEFT JOIN departments d ON d.id = u.department_id WHERE u.id = ?',
    [id],
  );
  return publicUser(u);
}

router.get('/', async (req, res) => {
  res.json({ user: await me(req.user.id) });
});

// ข้อมูลเบื้องต้นที่แก้เองได้ (ชื่อ-สกุลและแผนก ผู้ดูแลเป็นผู้แก้ เพื่อให้ตรงกับทะเบียนบุคลากร)
router.put('/', async (req, res) => {
  const position = String(req.body?.position_title ?? req.user.position_title ?? '').trim().slice(0, 150);
  const phone = String(req.body?.phone ?? req.user.phone ?? '').trim();
  if (phone && !/^[0-9+\-\s()]{6,30}$/.test(phone)) throw new HttpError(400, 'เบอร์โทรศัพท์ไม่ถูกต้อง');
  await db.query('UPDATE users SET position_title = ?, phone = ? WHERE id = ?', [position, phone, req.user.id]);
  res.json({ user: await me(req.user.id) });
});

// เปลี่ยนอีเมล (ใช้รับลิงก์รีเซ็ตรหัสผ่าน) ต้องยืนยันรหัสผ่าน
router.put('/email', async (req, res) => {
  await confirmPassword(req.user.id, req.body?.password);
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'อีเมลไม่ถูกต้อง');
  try {
    await db.query('UPDATE users SET email = ? WHERE id = ?', [email || null, req.user.id]);
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'อีเมลนี้มีผู้ใช้อื่นแล้ว');
    throw e;
  }
  res.json({ user: await me(req.user.id) });
});

async function replaceFile(column, dataUrl, opts) {
  return async (req) => {
    const rel = await files.saveImage(dataUrl, opts);
    const [old] = await db.query(`SELECT ${column} AS p FROM users WHERE id = ?`, [req.user.id]);
    await db.query(`UPDATE users SET ${column} = ? WHERE id = ?`, [rel, req.user.id]);
    if (old?.p) await files.removeUpload(old.p);
  };
}

router.post('/avatar', async (req, res) => {
  await (await replaceFile('avatar_path', req.body?.image, { dir: 'profile', prefix: `avatar-${req.user.id}`, types: ['jpeg', 'png'], maxBytes: 600_000 }))(req);
  res.json({ user: await me(req.user.id) });
});

router.delete('/avatar', async (req, res) => {
  if (req.user.avatar_path) await files.removeUpload(req.user.avatar_path);
  await db.query('UPDATE users SET avatar_path = NULL WHERE id = ?', [req.user.id]);
  res.json({ user: await me(req.user.id) });
});

// ลายเซ็นสำหรับลงนามเอกสารรายงาน (PNG พื้นโปร่งใส) — ต้องยืนยันรหัสผ่าน
router.post('/signature', async (req, res) => {
  await confirmPassword(req.user.id, req.body?.password);
  await (await replaceFile('signature_path', req.body?.image, { dir: 'signatures', prefix: `sig-${req.user.id}`, types: ['png'], maxBytes: 400_000 }))(req);
  res.json({ user: await me(req.user.id) });
});

router.get('/signature', async (req, res) => {
  const abs = files.resolveUpload(req.user.signature_path);
  if (!abs) throw new HttpError(404, 'ยังไม่ได้บันทึกลายเซ็น');
  res.set('Cache-Control', 'private, no-store');
  res.sendFile(abs);
});

// รูปโปรไฟล์ของผู้ใช้ใดก็ได้ (ใช้แสดงในรายชื่อ) — เฉพาะผู้ที่เข้าสู่ระบบแล้ว
router.get('/avatar/:userId', async (req, res) => {
  const [u] = await db.query('SELECT avatar_path FROM users WHERE id = ?', [Number(req.params.userId)]);
  const abs = files.resolveUpload(u?.avatar_path);
  if (!abs) throw new HttpError(404, 'ไม่มีรูปโปรไฟล์');
  res.set('Cache-Control', 'private, max-age=600');
  res.sendFile(abs);
});

module.exports = router;
