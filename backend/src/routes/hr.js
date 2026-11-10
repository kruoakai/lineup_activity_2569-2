// งานบุคลากร: บันทึกสถานะลา/ราชการ/นโยบาย ผู้มาสาย/ไม่ลงเวลากลับ และประเภทบุคลากร
const express = require('express');
const db = require('../db');
const hr = require('../services/hr');
const hrExport = require('../services/hrExport');
const exporter = require('../services/exporter');
const userImport = require('../services/userImport');
const { confirmPassword } = require('../services/confirm');
const { STAFF_TYPES, GROUPS } = require('../services/staffTypes');
const { authenticate, requireReady, requireRole, HttpError } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, requireReady, requireRole('hr', 'admin'));

async function log(req, action, target, detail) {
  await db.query('INSERT INTO admin_logs (actor_id, action, target, detail, ip) VALUES (?, ?, ?, ?, ?)',
    [req.user.id, action, String(target).slice(0, 190), detail ? JSON.stringify(detail) : null, req.ip]);
}

router.get('/meta', (_req, res) => {
  res.json({ staffTypes: STAFF_TYPES, groups: GROUPS, leaveTypes: hr.LEAVE_TYPES, markKinds: hr.MARK_KINDS });
});

router.get('/day/:day', async (req, res) => {
  res.json(await hr.dayView(req.params.day));
});

router.post('/status', async (req, res) => {
  const b = req.body || {};
  const r = await hr.setStatus(req.user, b, req.ip);
  await log(req, 'hr.status', `${b.status} ${b.from}..${b.to || b.from}`, { users: Array.isArray(b.userIds) ? b.userIds.length : 0, changed: r.changed });
  res.json(r);
});

router.put('/marks/:day/:kind', async (req, res) => {
  const r = await hr.setMarks(req.user, req.params.day, req.params.kind, req.body?.userIds);
  await log(req, 'hr.marks', `${req.params.day} ${req.params.kind}`, { count: r.count });
  res.json(r);
});

router.patch('/users/:id/staff-type', async (req, res) => {
  await hr.setStaffType(req.params.id, req.body?.staffType ?? null);
  await log(req, 'hr.staff_type', req.params.id, { staffType: req.body?.staffType ?? null });
  res.json({ ok: true });
});

// แก้ ชื่อ-สกุล / ตำแหน่ง / ประเภทบุคลากร ทีละคน (ไม่แตะบัญชีผู้ดูแลระบบ)
router.patch('/users/:id', async (req, res) => {
  const id = Number(req.params.id);
  const [u] = await db.query('SELECT id, employee_code, full_name, position_title, staff_type, role FROM users WHERE id = ?', [id]);
  if (!u) throw new HttpError(404, 'ไม่พบผู้ใช้');
  if (u.role === 'admin') throw new HttpError(403, 'บัญชีผู้ดูแลระบบ แก้ที่หน้าผู้ดูแลระบบ');
  const b = req.body || {};
  const { fields, errors } = userImport.hrFields({
    full_name: b.full_name, position_title: b.position_title, staff_type: b.staff_type === null ? '' : b.staff_type,
  }, { allowClear: true });
  if (errors.length) throw new HttpError(400, errors.join(' · '));
  const changes = {};
  for (const [k, v] of Object.entries(fields)) if ((u[k] ?? '') !== (v ?? '')) changes[k] = v;
  if (!Object.keys(changes).length) return res.json({ ok: true, changed: 0 });
  await db.query('UPDATE users SET ? WHERE id = ?', [{ ...changes, ...(changes.staff_type !== undefined ? { staff_type_demo: 0 } : {}) }, id]);
  await log(req, 'hr.user_update', u.employee_code, Object.fromEntries(Object.keys(changes).map((k) => [k, { from: u[k] ?? '', to: changes[k] }])));
  res.json({ ok: true, changed: Object.keys(changes).length });
});

// ---------- Excel: แม่แบบ / ส่งออกเพื่อแก้ / นำเข้า (ชื่อ ตำแหน่ง ประเภท) ----------
router.get('/people/template.xlsx', async (_req, res) => {
  const { wb } = await userImport.hrWorkbook(false);
  await exporter.send(res, wb, 'แม่แบบแก้ไขข้อมูลบุคลากร.xlsx');
});

router.get('/people/export.xlsx', async (req, res) => {
  const { wb, count } = await userImport.hrWorkbook(true);
  await log(req, 'hr.people_export', `${count} คน`);
  await exporter.send(res, wb, `ข้อมูลบุคลากร-${new Date().toISOString().slice(0, 10)}.xlsx`);
});

async function hrImportPlan(body) {
  const b64 = String(body?.file || '').replace(/^data:[^,]*,/, '');
  if (!b64) throw new HttpError(400, 'กรุณาเลือกไฟล์ Excel');
  const buf = Buffer.from(b64, 'base64');
  if (buf.length > 5 * 1024 * 1024) throw new HttpError(400, 'ไฟล์ใหญ่เกิน 5 MB');
  return userImport.hrPlan(await userImport.parseWorkbook(buf));
}

router.post('/people/import/preview', async (req, res) => {
  res.json(await hrImportPlan(req.body));
});

router.post('/people/import', async (req, res) => {
  await confirmPassword(req.user.id, req.body?.password);
  const p = await hrImportPlan(req.body);
  if (!p.summary.update) throw new HttpError(400, 'ไม่มีข้อมูลที่ต้องบันทึก');
  const r = await userImport.hrApply(p);
  await log(req, 'hr.people_import', `${r.update} คน`, r);
  res.json(r);
});

// ---------- Excel: รายงานสรุปการปฏิบัติงานประจำวัน ----------
router.get('/report/day.xlsx', async (req, res) => {
  const { snapshot } = await hr.dailySummary(String(req.query.day || ''));
  await exporter.send(res, hrExport.dailyWorkbook(snapshot), `สรุปการปฏิบัติงาน-${snapshot.day}.xlsx`);
});

router.get('/report/range.xlsx', async (req, res) => {
  const from = String(req.query.from || '');
  const to = String(req.query.to || '');
  await exporter.send(res, await hrExport.rangeWorkbook(from, to), `สรุปการปฏิบัติงาน-${from}_${to}.xlsx`);
});

module.exports = router;
