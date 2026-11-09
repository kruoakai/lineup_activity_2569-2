const express = require('express');
const official = require('../services/official');
const { authenticate, requireReady } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, requireReady);

router.get('/', async (req, res) => {
  res.json({ items: await official.list(req.user), canCreate: await official.canCreate(req.user) });
});

router.get('/pending-count', async (req, res) => {
  res.json({ count: await official.pendingCount(req.user) });
});

router.get('/preview', async (req, res) => {
  res.json(await official.preview(req.user, String(req.query.day || '')));
});

router.post('/', async (req, res) => {
  res.status(201).json(await official.create(req.user, req.body || {}));
});

router.get('/:id', async (req, res) => {
  res.json(await official.get(req.user, req.params.id));
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
