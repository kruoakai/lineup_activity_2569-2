const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const settings = require('../services/settings');
const tokens = require('../services/tokens');
const passwords = require('../services/passwords');
const demo = require('../services/demo');
const backups = require('../services/backups');
const exporter = require('../services/exporter');
const zlib = require('zlib');
const fs = require('fs');
const mailer = require('../services/mailer');
const userImport = require('../services/userImport');
const apiKeys = require('../services/apiKeys');
const { confirmPassword } = require('../services/confirm');
const { authenticate, requireReady, requireRole, HttpError } = require('../middleware/auth');

const router = express.Router();
const ROLES = ['staff', 'dept_head', 'activity', 'hr', 'executive', 'admin'];

router.use(authenticate, requireReady);

async function log(req, action, target, detail) {
  await db.query('INSERT INTO admin_logs (actor_id, action, target, detail, ip) VALUES (?, ?, ?, ?, ?)',
    [req.user.id, action, String(target).slice(0, 190), detail ? JSON.stringify(detail) : null, req.ip]);
}

// ---------- ปฏิทินวันเข้าแถว (งานกิจกรรมจัดการได้) ----------
router.get('/assembly-days', requireRole('admin', 'activity'), async (req, res) => {
  const from = /^\d{4}-\d{2}-\d{2}$/.test(req.query.from || '') ? req.query.from : '2000-01-01';
  const to = /^\d{4}-\d{2}-\d{2}$/.test(req.query.to || '') ? req.query.to : '2999-12-31';
  res.json({ items: await db.query('SELECT day, status, note FROM assembly_days WHERE day BETWEEN ? AND ? ORDER BY day', [from, to]) });
});

const DAY_STATUSES = ['normal', 'special', 'cancelled', 'holiday', 'public_holiday'];

router.put('/assembly-days/:day', requireRole('admin', 'activity'), async (req, res) => {
  const { day } = req.params;
  const status = req.body?.status;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new HttpError(400, 'รูปแบบวันที่ไม่ถูกต้อง');
  if (!DAY_STATUSES.includes(status)) throw new HttpError(400, 'สถานะวันไม่ถูกต้อง');
  const note = String(req.body?.note || '').slice(0, 255);
  await db.query('INSERT INTO assembly_days (day, status, note) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE status = VALUES(status), note = VALUES(note)', [day, status, note]);
  await log(req, 'assembly_day.set', day, { status, note });
  res.json({ ok: true });
});

// เพิ่มหลายวันพร้อมกัน (ช่วงวันที่ / วันหยุดนักขัตฤกษ์ทั้งปี) — items: [{ day, status, note }]
router.post('/assembly-days/bulk', requireRole('admin', 'activity'), async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!items.length || items.length > 400) throw new HttpError(400, 'จำนวนวันต้องอยู่ระหว่าง 1–400 วัน');
  for (const it of items) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(it?.day || '') || !DAY_STATUSES.includes(it.status)) {
      throw new HttpError(400, `ข้อมูลวันไม่ถูกต้อง: ${it?.day}`);
    }
  }
  for (const it of items) {
    await db.query('INSERT INTO assembly_days (day, status, note) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE status = VALUES(status), note = VALUES(note)',
      [it.day, it.status, String(it.note || '').slice(0, 255)]);
  }
  await log(req, 'assembly_day.bulk', `${items[0].day}..${items[items.length - 1].day}`, { count: items.length, status: [...new Set(items.map((i) => i.status))] });
  res.json({ ok: true, count: items.length });
});

router.delete('/assembly-days/:day', requireRole('admin', 'activity'), async (req, res) => {
  await db.query('DELETE FROM assembly_days WHERE day = ?', [req.params.day]);
  await log(req, 'assembly_day.clear', req.params.day);
  res.json({ ok: true });
});

// ---------- ภาคเรียน ----------
router.post('/semesters', requireRole('admin', 'activity'), async (req, res) => {
  const { name, start_date: start, end_date: end } = req.body || {};
  if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(start || '') || !/^\d{4}-\d{2}-\d{2}$/.test(end || '') || start > end) {
    throw new HttpError(400, 'ข้อมูลภาคเรียนไม่ถูกต้อง');
  }
  await db.query('INSERT INTO semesters (name, start_date, end_date) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE start_date = VALUES(start_date), end_date = VALUES(end_date)',
    [String(name).slice(0, 50), start, end]);
  await log(req, 'semester.set', name, { start, end });
  res.json({ ok: true });
});

router.delete('/semesters/:id', requireRole('admin', 'activity'), async (req, res) => {
  await db.query('DELETE FROM semesters WHERE id = ?', [Number(req.params.id)]);
  await log(req, 'semester.delete', req.params.id);
  res.json({ ok: true });
});

// ---------- ด้านล่างนี้เฉพาะผู้ดูแลระบบ ----------
router.use(requireRole('admin'));

router.get('/settings', async (_req, res) => {
  res.json(await settings.getAll());
});

// น้องแถวดี (AI ผู้ช่วย): วางคีย์ OpenRouter / เลือกโมเดล / เปิด-ปิด / ทดสอบ
const assistant = require('../services/assistant');
router.get('/assistant', async (_req, res) => {
  res.json(await assistant.adminView());
});
router.put('/assistant', async (req, res) => {
  const b = req.body || {};
  const out = await assistant.adminSave(req.user, b);
  await log(req, 'assistant.update', '', { key: b.key ? `…${String(b.key).trim().slice(-4)}` : b.clearKey ? 'cleared' : 'unchanged', model: b.model, switchedOn: b.switchedOn });
  res.json(out);
});
router.post('/assistant/test', async (req, res) => {
  res.json(await assistant.adminTest(req.user));
});

router.put('/settings', async (req, res) => {
  const updated = await settings.update(req.body || {});
  if (Object.keys(req.body || {}).some((k) => k.startsWith('sign_step'))) await require('../services/official').syncSigners();
  await log(req, 'settings.update', '', req.body);
  res.json(updated);
});

router.get('/users', async (req, res) => {
  const search = typeof req.query.search === 'string' ? req.query.search.slice(0, 50) : '';
  const rows = await db.query(
    `SELECT u.id, u.employee_code, u.email, u.full_name, u.department_id, d.name AS department_name, u.role,
            u.can_proxy, u.proxy_until, u.report_group, u.position_title, u.phone, u.avatar_path IS NOT NULL AS has_avatar, u.line_user_id IS NOT NULL AS has_line,
            u.must_assemble, u.active, u.must_change_password, u.consent_at
       FROM users u LEFT JOIN departments d ON d.id = u.department_id
      ${search ? 'WHERE u.full_name LIKE ? OR u.employee_code LIKE ? OR u.email LIKE ?' : ''}
      ORDER BY u.full_name`,
    search ? [`%${search}%`, `%${search}%`, `%${search}%`] : [],
  );
  res.json({ items: rows });
});

function validateUser(b, partial) {
  const out = {};
  if (!partial || b.full_name !== undefined) {
    if (!b.full_name || String(b.full_name).length > 190) throw new HttpError(400, 'กรุณาระบุชื่อ-สกุล');
    out.full_name = String(b.full_name).trim();
  }
  if (!partial || b.employee_code !== undefined) {
    if (!/^[A-Za-z0-9_-]{1,30}$/.test(String(b.employee_code || ''))) throw new HttpError(400, 'รหัสพนักงานไม่ถูกต้อง');
    out.employee_code = String(b.employee_code);
  }
  if (b.email !== undefined) {
    const e = String(b.email || '').trim().toLowerCase();
    if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new HttpError(400, 'อีเมลไม่ถูกต้อง');
    out.email = e || null;
  }
  if (b.department_id !== undefined) out.department_id = b.department_id ? Number(b.department_id) : null;
  if (b.role !== undefined) {
    if (!ROLES.includes(b.role)) throw new HttpError(400, 'บทบาทไม่ถูกต้อง');
    out.role = b.role;
  }
  for (const k of ['can_proxy', 'must_assemble', 'active']) if (b[k] !== undefined) out[k] = b[k] ? 1 : 0;
  if (b.report_group !== undefined) out.report_group = String(b.report_group || '').trim().slice(0, 150) || null;
  if (b.position_title !== undefined) out.position_title = String(b.position_title || '').trim().slice(0, 150);
  if (b.revoke_temp_proxy) out.proxy_until = null;
  if (b.unlink_line) { out.line_user_id = null; out.line_name = null; out.line_linked_at = null; }
  return out;
}

router.post('/users', async (req, res) => {
  const data = validateUser(req.body || {}, false);
  const initial = passwords.initial();
  data.password_hash = await bcrypt.hash(initial, 10);
  data.must_change_password = 1;
  try {
    const r = await db.query('INSERT INTO users SET ?', [data]);
    await log(req, 'user.create', data.employee_code, { full_name: data.full_name });
    res.status(201).json({ id: r.insertId, initialPassword: initial });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'รหัสพนักงานหรืออีเมลซ้ำ');
    throw e;
  }
});

router.patch('/users/:id', async (req, res) => {
  const id = Number(req.params.id);
  const data = validateUser(req.body || {}, true);
  if (id === req.user.id && (data.role && data.role !== 'admin' || data.active === 0)) {
    throw new HttpError(400, 'ไม่สามารถลดสิทธิ์หรือระงับบัญชีของตนเองได้');
  }
  if (!Object.keys(data).length) throw new HttpError(400, 'ไม่มีข้อมูลที่ต้องแก้ไข');
  try {
    await db.query('UPDATE users SET ? WHERE id = ?', [data, id]);
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'รหัสพนักงานหรืออีเมลซ้ำ');
    throw e;
  }
  if (data.active === 0) await tokens.revokeAllForUser(id);
  await log(req, 'user.update', id, data);
  res.json({ ok: true });
});

router.post('/users/:id/reset-password', async (req, res) => {
  const id = Number(req.params.id);
  const initial = passwords.initial();
  const r = await db.query('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?', [await bcrypt.hash(initial, 10), id]);
  if (!r.affectedRows) throw new HttpError(404, 'ไม่พบผู้ใช้');
  await tokens.revokeAllForUser(id);
  await log(req, 'user.reset_password', id);
  res.json({ initialPassword: initial });
});

// ---------- นำเข้า/ส่งออกผู้ใช้ด้วย Excel ----------
router.get('/users/template.xlsx', async (_req, res) => {
  await exporter.send(res, await userImport.templateWorkbook(), 'แม่แบบนำเข้ารายชื่อบุคลากร.xlsx');
});

// ส่งออกรายชื่อ (มีข้อมูลส่วนบุคคล) — ต้องยืนยันรหัสผ่าน
router.post('/users/export.xlsx', async (req, res) => {
  await confirmPassword(req.user.id, req.body?.password);
  const { wb, count } = await userImport.exportWorkbook();
  await log(req, 'users.export', `${count} คน`);
  await exporter.send(res, wb, `รายชื่อบุคลากร-${new Date().toISOString().slice(0, 10)}.xlsx`);
});

function importFile(body) {
  const b64 = String(body?.file || '').replace(/^data:[^,]*,/, '');
  if (!b64) throw new HttpError(400, 'กรุณาเลือกไฟล์ Excel');
  const buf = Buffer.from(b64, 'base64');
  if (buf.length > 5 * 1024 * 1024) throw new HttpError(400, 'ไฟล์ใหญ่เกิน 5 MB');
  return userImport.parseWorkbook(buf);
}

// ตรวจไฟล์และแสดงตัวอย่างผล (ยังไม่บันทึก)
router.post('/users/import/preview', async (req, res) => {
  const rows = await importFile(req.body);
  const p = await userImport.plan(rows, { actorId: req.user.id, deactivateMissing: req.body?.deactivateMissing === true });
  res.json({ summary: p.summary, rows: p.rows.map(({ data, dept, ...r }) => r), newDepartments: p.newDepartments, deactivate: p.deactivate });
});

// บันทึกจริง — ต้องยืนยันรหัสผ่าน
router.post('/users/import', async (req, res) => {
  await confirmPassword(req.user.id, req.body?.password);
  const rows = await importFile(req.body);
  const p = await userImport.plan(rows, { actorId: req.user.id, deactivateMissing: req.body?.deactivateMissing === true });
  if (!p.summary.create && !p.summary.update && !p.summary.deactivate) throw new HttpError(400, 'ไม่มีข้อมูลที่ต้องบันทึก');
  const result = await userImport.apply(p);
  await log(req, 'users.import', `${p.summary.create}+${p.summary.update}`, p.summary);
  res.json(result);
});

// ---------- กุญแจ API สำหรับระบบภายนอก ----------
router.get('/api-keys', async (_req, res) => {
  res.json({ items: await apiKeys.list(), scopes: apiKeys.SCOPES, ratePerMin: apiKeys.RATE_PER_MIN });
});

router.post('/api-keys', async (req, res) => {
  await confirmPassword(req.user.id, req.body?.password);
  const k = await apiKeys.create({ ...req.body, actorId: req.user.id });
  await log(req, 'api_key.create', k.name, { prefix: k.prefix, scopes: k.scopes });
  res.status(201).json(k);
});

router.delete('/api-keys/:id', async (req, res) => {
  await apiKeys.revoke(req.params.id);
  await log(req, 'api_key.revoke', req.params.id);
  res.json({ ok: true });
});

router.get('/departments', async (_req, res) => {
  res.json({
    items: await db.query(
      `SELECT d.id, d.name, d.division, d.report_group, d.report_order, COUNT(u.id) AS members
         FROM departments d LEFT JOIN users u ON u.department_id = d.id AND u.active = 1
        GROUP BY d.id ORDER BY d.report_order, d.division, d.name`,
    ),
  });
});

router.post('/departments', async (req, res) => {
  const name = String(req.body?.name || '').trim();
  const division = String(req.body?.division || '').trim();
  if (!name) throw new HttpError(400, 'กรุณาระบุชื่อแผนก');
  try {
    const r = await db.query('INSERT INTO departments (name, division) VALUES (?, ?)', [name.slice(0, 150), division.slice(0, 150)]);
    await log(req, 'department.create', name);
    res.status(201).json({ id: r.insertId });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'มีแผนกนี้แล้ว');
    throw e;
  }
});

router.patch('/departments/:id', async (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) throw new HttpError(400, 'กรุณาระบุชื่อแผนก');
  const group = req.body?.report_group === undefined ? undefined : String(req.body.report_group || '').trim().slice(0, 150);
  const order = req.body?.report_order === undefined ? undefined : Math.max(1, Math.min(999, Number(req.body.report_order) || 999));
  await db.query(
    `UPDATE departments SET name = ?, division = COALESCE(?, division),
       report_group = COALESCE(?, report_group), report_order = COALESCE(?, report_order) WHERE id = ?`,
    [name.slice(0, 150), req.body?.division ?? null, group ?? null, order ?? null, Number(req.params.id)]);
  await log(req, 'department.update', req.params.id, { name });
  res.json({ ok: true });
});

router.get('/logs', async (_req, res) => {
  res.json({
    items: await db.query(
      `SELECT l.action, l.target, l.detail, l.ip, l.created_at, u.full_name AS actor_name
         FROM admin_logs l JOIN users u ON u.id = l.actor_id ORDER BY l.id DESC LIMIT 200`,
    ),
  });
});

// ---------- ข้อมูลจำลอง / เริ่มใช้งานจริง (ต้องยืนยันรหัสผ่าน) ----------
router.get('/demo', async (_req, res) => {
  res.json(await demo.status());
});

router.post('/demo/simulate', async (req, res) => {
  await confirmPassword(req.user.id, req.body?.password);
  const r = await demo.simulate({ weeks: req.body?.weeks, staffTypes: req.body?.staffTypes !== false });
  await log(req, 'demo.simulate', '', r);
  res.json({ ...r, status: await demo.status() });
});

router.post('/demo/clear', async (req, res) => {
  await confirmPassword(req.user.id, req.body?.password);
  const r = await demo.clearDemo();
  await log(req, 'demo.clear', '', r);
  res.json({ ...r, status: await demo.status() });
});

router.post('/demo/reset-all', async (req, res) => {
  await confirmPassword(req.user.id, req.body?.password);
  if (req.body?.confirmText !== 'ล้างข้อมูลทั้งหมด') throw new HttpError(400, 'พิมพ์ข้อความยืนยันให้ถูกต้อง');
  const r = await demo.resetAll();
  await log(req, 'data.reset_all', '', r);
  res.json({ ...r, status: await demo.status() });
});

// ---------- สำรองข้อมูล ----------
router.get('/backups', async (_req, res) => {
  res.json(await backups.list());
});

router.post('/backups/run', async (req, res) => {
  await confirmPassword(req.user.id, req.body?.password);
  await backups.request(req.user.full_name);
  await log(req, 'backup.request', '');
  res.json({ ok: true });
});

router.post('/backups/download', async (req, res) => {
  await confirmPassword(req.user.id, req.body?.password);
  const p = backups.filePath(req.body?.name);
  await log(req, 'backup.download', req.body.name, { format: req.body?.format || 'gz' });
  // format = 'sql' → แตกไฟล์ .sql.gz เป็น .sql ให้เปิดด้วยโปรแกรมฐานข้อมูลได้ทันที
  if (req.body?.format === 'sql' && p.endsWith('.sql.gz')) {
    res.set('Content-Type', 'application/sql; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="${req.body.name.replace(/\.gz$/, '')}"`);
    fs.createReadStream(p).pipe(zlib.createGunzip()).on('error', () => res.destroy()).pipe(res);
    return;
  }
  res.download(p);
});

// สำรองทั้งระบบเป็นไฟล์เดียว (.tar = ฐานข้อมูล + รูปหลักฐาน/ลายเซ็น + manifest) ใช้กู้คืนได้ที่หน้านี้
router.post('/backups/full', async (req, res) => {
  await confirmPassword(req.user.id, req.body?.password);
  const ts = String(req.body?.ts || '');
  backups.filePath(`db-${ts}.sql.gz`);
  await log(req, 'backup.full_download', ts);
  res.set('Content-Type', 'application/x-tar');
  res.set('Content-Disposition', `attachment; filename="lineup-full-${ts}.tar"`);
  await backups.writeFull(ts, res);
  res.end();
});

// ---------- กู้คืนระบบ ----------
router.get('/restore/status', async (_req, res) => {
  res.json(await backups.restoreStatus());
});

// อัปโหลดไฟล์สำรอง (สตรีม ไม่ผ่าน JSON) แล้วตรวจว่าใช้กู้คืนได้ — ยังไม่กู้คืน
router.post('/restore/upload', async (req, res) => {
  const info = await backups.receiveUpload(req);
  await log(req, 'restore.upload', info.id, { bytes: info.bytes, uploads: !!info.uploads });
  res.status(201).json(info);
});

router.post('/restore', async (req, res) => {
  await confirmPassword(req.user.id, req.body?.password);
  if (req.body?.confirm !== 'กู้คืนระบบ') throw new HttpError(400, 'พิมพ์คำว่า "กู้คืนระบบ" เพื่อยืนยัน');
  const r = await backups.requestRestore(req.body || {}, { byName: req.user.full_name, includeUploads: req.body?.includeUploads !== false });
  await log(req, 'restore.request', r.label, r);
  res.status(202).json({ ok: true, ...r });
});

// ส่งออกข้อมูลทั้งหมดเป็น Excel (.xlsx) สำหรับทำรายงานต่อ — ต้องยืนยันรหัสผ่าน (มีข้อมูลส่วนบุคคล)
router.post('/export.xlsx', async (req, res) => {
  await confirmPassword(req.user.id, req.body?.password);
  const from = String(req.body?.from || '');
  const to = String(req.body?.to || '');
  const wb = await exporter.fullWorkbook({ from, to });
  await log(req, 'export.xlsx', `${from}..${to}`);
  await exporter.send(res, wb, `lineup-ข้อมูลทั้งหมด-${from}_${to}.xlsx`);
});

// ---------- อีเมล ----------
router.get('/mail', (_req, res) => {
  res.json({ enabled: mailer.enabled(), from: process.env.SMTP_FROM || '', host: process.env.SMTP_HOST || '', appUrl: mailer.appUrl() });
});

router.post('/mail/test', async (req, res) => {
  if (!mailer.enabled()) throw new HttpError(503, 'ยังไม่ได้ตั้งค่า SMTP ใน deploy/.env');
  const to = String(req.body?.to || req.user.email || '').trim();
  if (!to) throw new HttpError(400, 'กรุณาระบุอีเมลปลายทาง');
  try {
    await mailer.send({ to, subject: 'ทดสอบอีเมล — ระบบเช็กชื่อเข้าแถว', text: 'ระบบส่งอีเมลได้ปกติ' });
  } catch (e) {
    throw new HttpError(502, `ส่งอีเมลไม่สำเร็จ: ${e.message}`);
  }
  res.json({ ok: true });
});

module.exports = router;
