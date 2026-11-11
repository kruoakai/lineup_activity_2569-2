const express = require('express');
const assistant = require('../services/assistant');
const { authenticate, requireReady } = require('../middleware/auth');

// น้องแถวดี: ผู้ช่วยตอบคำถามการใช้งาน (ต้องเข้าระบบแล้ว)
const router = express.Router();
router.use(authenticate, requireReady);

router.get('/', (_req, res) => {
  res.json(assistant.status());
});

router.post('/chat', async (req, res) => {
  res.json(await assistant.chat(req.user, req.body || {}));
});

module.exports = router;
