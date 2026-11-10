const express = require('express');
const db = require('../db');
const reports = require('../services/reports');
const official = require('../services/official');
const exporter = require('../services/exporter');
const { reportScope, canViewAll } = require('../services/permissions');
const { authenticate, requireReady, HttpError } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, requireReady);

function scopeOrThrow(user) {
  const scope = reportScope(user);
  if (!scope) throw new HttpError(403, 'ไม่มีสิทธิ์ดูรายงาน');
  return scope;
}

router.get('/summary', async (req, res) => {
  const scope = scopeOrThrow(req.user);
  res.json(await reports.summary({
    from: String(req.query.from || ''), to: String(req.query.to || ''),
    scope, departmentId: Number(req.query.departmentId) || null,
  }));
});

router.get('/summary.csv', async (req, res) => {
  const scope = scopeOrThrow(req.user);
  const rep = await reports.summary({
    from: String(req.query.from || ''), to: String(req.query.to || ''),
    scope, departmentId: Number(req.query.departmentId) || null,
  });
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="lineup-${rep.from}_${rep.to}.csv"`);
  res.send(reports.toCsv(rep));
});

router.get('/summary.xlsx', async (req, res) => {
  const scope = scopeOrThrow(req.user);
  const rep = await reports.summary({
    from: String(req.query.from || ''), to: String(req.query.to || ''),
    scope, departmentId: Number(req.query.departmentId) || null, withMissing: true,
  });
  await exporter.send(res, await exporter.summaryWorkbook(rep), `lineup-${rep.from}_${rep.to}.xlsx`);
});

// รายชื่อแผนก (ตามขอบเขตสิทธิ์)
router.get('/departments', async (req, res) => {
  const scope = scopeOrThrow(req.user);
  const rows = await db.query(
    `SELECT d.id, d.name, d.division, COUNT(u.id) AS members
       FROM departments d LEFT JOIN users u ON u.department_id = d.id AND u.active = 1
      ${scope.all ? '' : 'WHERE d.id = ?'}
      GROUP BY d.id ORDER BY d.division, d.name`,
    scope.all ? [] : [scope.departmentId],
  );
  res.json({ items: rows, all: canViewAll(req.user) });
});

router.get('/semesters', async (req, res) => {
  scopeOrThrow(req.user);
  res.json({ items: await db.query('SELECT id, name, start_date, end_date FROM semesters ORDER BY start_date DESC') });
});

// แบบรายงานตามแบบฟอร์มวิทยาลัย (รายหน่วยงาน × รายวัน) และแดชบอร์ดผู้บริหาร
router.get('/official', async (req, res) => {
  if (!canViewAll(req.user) && !(await official.isSigner(req.user.id))) throw new HttpError(403, 'ไม่มีสิทธิ์ดูรายงานนี้');
  res.json(await official.officialReport({ from: String(req.query.from || ''), to: String(req.query.to || '') }));
});

module.exports = router;
