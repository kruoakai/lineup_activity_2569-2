// แจ้งลา / ไปราชการ / งานนโยบาย โดยเจ้าตัว และการตรวจของเจ้าหน้าที่บุคลากร
const express = require('express');
const db = require('../db');
const leave = require('../services/leaveRequests');
const { authenticate, requireReady, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, requireReady);

async function log(req, action, target, detail) {
  await db.query('INSERT INTO admin_logs (actor_id, action, target, detail, ip) VALUES (?, ?, ?, ?, ?)',
    [req.user.id, action, String(target).slice(0, 190), detail ? JSON.stringify(detail) : null, req.ip]);
}

router.get('/meta', async (_req, res) => { res.json(await leave.meta()); });

router.get('/mine', async (req, res) => { res.json({ items: await leave.mine(req.user) }); });

router.post('/', async (req, res) => { res.status(201).json(await leave.create(req.user, req.body || {})); });

router.post('/:id/cancel', async (req, res) => { res.json(await leave.cancel(req.user, req.params.id)); });

router.get('/:id/photos/:n', async (req, res) => {
  const abs = await leave.photo(req.user, req.params.id, req.params.n);
  res.set('Cache-Control', 'private, max-age=3600');
  res.sendFile(abs);
});

// ---------- เจ้าหน้าที่บุคลากร / ผู้ดูแลระบบ ----------
router.get('/review/count', async (req, res) => {
  res.json({ count: leave.isReviewer(req.user) ? await leave.pendingCount() : 0 });
});

router.get('/review', requireRole('hr', 'admin'), async (req, res) => {
  res.json({ items: await leave.reviewList({ status: req.query.status === 'done' ? 'done' : 'pending' }) });
});

router.post('/:id/approve', requireRole('hr', 'admin'), async (req, res) => {
  const r = await leave.approve(req.user, req.params.id, req.ip);
  await log(req, 'leave.approve', `${r.request.employee_code} ${r.request.kind} ${r.request.from}..${r.request.to}`, { id: r.request.id, days: r.days.length });
  res.json(r);
});

router.post('/:id/reject', requireRole('hr', 'admin'), async (req, res) => {
  const r = await leave.reject(req.user, req.params.id, req.body?.reason);
  await log(req, 'leave.reject', `${r.employee_code} ${r.kind} ${r.from}..${r.to}`, { id: r.id });
  res.json(r);
});

module.exports = router;
