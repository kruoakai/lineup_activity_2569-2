/**
 * API สำหรับระบบภายนอก — /api/ext/v1  (เอกสาร: API.md)
 * ยืนยันตัวด้วยกุญแจ API ที่ผู้ดูแลระบบสร้าง: Authorization: Bearer lu_xxxxxxxx_...
 */
const express = require('express');
const db = require('../db');
const reports = require('../services/reports');
const userImport = require('../services/userImport');
const { authenticateKey, requireScope } = require('../services/apiKeys');
const { HttpError } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateKey);

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const USER_SQL = `SELECT u.id, u.employee_code, u.full_name, u.email, u.position_title, u.staff_type, u.role, u.must_assemble, u.active, u.updated_at,
                         d.name AS department, d.division
                    FROM users u LEFT JOIN departments d ON d.id = u.department_id`;

async function log(req, action, target, detail) {
  if (!req.apiKey.createdBy) return;
  await db.query('INSERT INTO admin_logs (actor_id, action, target, detail, ip) VALUES (?, ?, ?, ?, ?)',
    [req.apiKey.createdBy, action, String(target).slice(0, 190), JSON.stringify({ api_key: req.apiKey.name, ...detail }), req.ip]);
}

function dateRange(q, maxDays) {
  const from = String(q.from || '');
  const to = String(q.to || '');
  if (!DATE.test(from) || !DATE.test(to) || from > to) throw new HttpError(400, 'ต้องระบุ from และ to รูปแบบ YYYY-MM-DD');
  if ((Date.parse(to) - Date.parse(from)) / 86400_000 > maxDays) throw new HttpError(400, `ช่วงวันที่ยาวได้ไม่เกิน ${maxDays} วัน`);
  return { from, to };
}

// ข้อมูลกุญแจที่ใช้อยู่ (ใช้ทดสอบการเชื่อมต่อ)
router.get('/me', (req, res) => {
  res.json({ name: req.apiKey.name, scopes: req.apiKey.scopes });
});

// ---------- ผู้ใช้ ----------
router.get('/users', requireScope('users:read'), async (req, res) => {
  const where = [];
  const params = [];
  if (req.query.active === 'true' || req.query.active === '1') where.push('u.active = 1');
  if (req.query.active === 'false' || req.query.active === '0') where.push('u.active = 0');
  if (req.query.updated_since) {
    const t = Date.parse(String(req.query.updated_since));
    if (Number.isNaN(t)) throw new HttpError(400, 'updated_since ต้องเป็นวันเวลา ISO 8601');
    where.push('u.updated_at >= ?');
    params.push(new Date(t));
  }
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
  const page = Math.max(1, Number(req.query.page) || 1);
  const cond = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [{ total }] = await db.query(`SELECT COUNT(*) AS total FROM users u ${cond}`, params);
  const rows = await db.query(`${USER_SQL} ${cond} ORDER BY u.employee_code LIMIT ? OFFSET ?`, [...params, limit, (page - 1) * limit]);
  res.json({ total, page, limit, items: rows.map(userImport.publicUser) });
});

router.get('/users/:code', requireScope('users:read'), async (req, res) => {
  const [u] = await db.query(`${USER_SQL} WHERE u.employee_code = ?`, [req.params.code]);
  if (!u) throw new HttpError(404, 'ไม่พบผู้ใช้');
  res.json(userImport.publicUser(u));
});

/**
 * เพิ่ม/แก้ไขผู้ใช้หลายคนในครั้งเดียว (upsert ตามรหัสพนักงาน)
 * body: { users: [...], dry_run?: boolean, deactivate_missing?: boolean }
 */
router.post('/users/sync', requireScope('users:write'), async (req, res) => {
  const body = req.body || {};
  if (!Array.isArray(body.users)) throw new HttpError(400, 'ต้องส่ง users เป็นอาร์เรย์');
  const p = await userImport.plan(body.users, { deactivateMissing: body.deactivate_missing === true });
  const rows = p.rows.map((r) => ({ index: r.line - 1, employee_code: r.employee_code, action: r.action, errors: r.errors, changes: r.changes }));
  if (body.dry_run === true) {
    res.json({ dry_run: true, summary: p.summary, rows, deactivate: p.deactivate.map((u) => u.employee_code) });
    return;
  }
  const result = await userImport.apply(p);
  await log(req, 'api.users.sync', `${p.summary.create}+${p.summary.update}`, { summary: p.summary });
  res.json({ dry_run: false, summary: p.summary, rows, deactivate: p.deactivate.map((u) => u.employee_code), initial_password_applies_to_new_users: !!result.initialPassword });
});

router.get('/departments', requireScope('users:read'), async (_req, res) => {
  const rows = await db.query(
    `SELECT d.name, d.division, COUNT(u.id) AS active_members
       FROM departments d LEFT JOIN users u ON u.department_id = d.id AND u.active = 1
      GROUP BY d.id ORDER BY d.division, d.name`);
  res.json({ items: rows });
});

// ---------- การเข้าแถว ----------
router.get('/attendance', requireScope('attendance:read'), async (req, res) => {
  const { from, to } = dateRange(req.query, 93);
  const params = [from, to];
  let extra = '';
  if (req.query.employee_code) { extra = ' AND u.employee_code = ?'; params.push(String(req.query.employee_code)); }
  const rows = await db.query(
    `SELECT a.day, u.employee_code, u.full_name, d.name AS department, a.status, a.method, a.checked_at,
            c.employee_code AS checked_by, a.flagged
       FROM attendance a JOIN users u ON u.id = a.user_id LEFT JOIN departments d ON d.id = u.department_id
       JOIN users c ON c.id = a.checked_by
      WHERE a.day BETWEEN ? AND ?${extra} ORDER BY a.day, u.employee_code`, params);
  res.json({ from, to, count: rows.length, items: rows.map((r) => ({ ...r, flagged: !!r.flagged })) });
});

router.get('/attendance/summary', requireScope('attendance:read'), async (req, res) => {
  const { from, to } = dateRange(req.query, 400);
  const rep = await reports.summary({ from, to, scope: { all: true } });
  const pick = (o) => ({
    expected: o.expected, present: o.present, absent: o.absent, official: o.official, policy: o.policy,
    leave: o.leave, pending: o.pending, not_checked: o.not_checked, rate: o.rate,
  });
  res.json({
    from: rep.from, to: rep.to, assembly_days: rep.days,
    college: { members: rep.total.members, ...pick(rep.total) },
    departments: rep.departments.map((d) => ({ department: d.department_name, members: d.members, ...pick(d) })),
    units: (rep.units || []).map((u) => ({ unit: u.unit_name, members: u.members, ...pick(u) })),
    users: rep.users.map((u) => ({ employee_code: u.employee_code, full_name: u.full_name, department: u.department_name, ...pick(u) })),
  });
});

module.exports = router;
