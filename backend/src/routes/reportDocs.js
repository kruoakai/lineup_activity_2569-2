const express = require('express');
const official = require('../services/official');
const { authenticate, requireReady, HttpError } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, requireReady);

router.get('/', async (req, res) => {
  res.json({ items: await official.list(req.user), canCreate: await official.canCreate(req.user) });
});

router.get('/pending-count', async (req, res) => {
  res.json({ count: await official.pendingCount(req.user), returned: await official.returnedCount(req.user) });
});

router.get('/preview', async (req, res) => {
  res.json(await official.preview(req.user, String(req.query.day || '')));
});

router.post('/', async (req, res) => {
  res.status(201).json(await official.create(req.user, req.body || {}));
});

// ส่งออกเอกสารสรุปการปฏิบัติงานประจำวันเป็น Excel (ตัวเลขตามที่ตรึงไว้ในเอกสาร)
router.get('/:id/export.xlsx', async (req, res) => {
  const doc = await official.get(req.user, req.params.id);
  if (doc.kind !== 'hr_daily') throw new HttpError(400, 'ส่งออก Excel ได้เฉพาะรายงานสรุปการปฏิบัติงานประจำวัน');
  await require('../services/exporter').send(res, require('../services/hrExport').dailyWorkbook(doc.snapshot), `สรุปการปฏิบัติงาน-${doc.snapshot.day}-เลขที่${doc.id}.xlsx`);
});

router.get('/:id', async (req, res) => {
  res.json(await official.get(req.user, req.params.id));
});

router.patch('/:id', async (req, res) => {
  res.json(await official.update(req.user, req.params.id, req.body || {}));
});

router.delete('/:id', async (req, res) => {
  res.json(await official.remove(req.user, req.params.id, req.body || {}));
});

router.post('/:id/sign', async (req, res) => {
  res.json(await official.sign(req.user, req.params.id, req.body || {}, req.ip));
});

router.post('/:id/return', async (req, res) => {
  res.json(await official.returnDoc(req.user, req.params.id, req.body || {}, req.ip));
});

router.get('/:id/signatures/:sigId', async (req, res) => {
  const abs = await official.signatureFile(req.user, req.params.id, req.params.sigId);
  res.set('Cache-Control', 'private, max-age=3600');
  res.sendFile(abs);
});

module.exports = router;
