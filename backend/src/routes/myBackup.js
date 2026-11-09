// สำรองข้อมูลงานของฉัน (Excel ตามบทบาท)
const express = require('express');
const db = require('../db');
const myBackup = require('../services/myBackup');
const exporter = require('../services/exporter');
const { confirmPassword } = require('../services/confirm');
const { authenticate, requireReady, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, requireReady);

router.get('/', (req, res) => {
  res.json({ available: myBackup.ROLES.includes(req.user.role), sheets: myBackup.contents(req.user.role) || [] });
});

router.post('/xlsx', requireRole(...myBackup.ROLES), async (req, res) => {
  await confirmPassword(req.user.id, req.body?.password);
  const from = String(req.body?.from || '');
  const to = String(req.body?.to || '');
  const wb = await myBackup.workbook(req.user, { from, to });
  await db.query('INSERT INTO admin_logs (actor_id, action, target, ip) VALUES (?, ?, ?, ?)', [req.user.id, 'my_backup.xlsx', `${from}..${to}`, req.ip]);
  await exporter.send(res, wb, `สำรองข้อมูลงาน-${req.user.employee_code}-${from}_${to}.xlsx`);
});

module.exports = router;
