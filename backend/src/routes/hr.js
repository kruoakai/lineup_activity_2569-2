// งานบุคลากร: บันทึกสถานะลา/ราชการ/นโยบาย ผู้มาสาย/ไม่ลงเวลากลับ และประเภทบุคลากร
const express = require('express');
const db = require('../db');
const hr = require('../services/hr');
const { STAFF_TYPES, GROUPS } = require('../services/staffTypes');
const { authenticate, requireReady, requireRole } = require('../middleware/auth');

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

module.exports = router;
