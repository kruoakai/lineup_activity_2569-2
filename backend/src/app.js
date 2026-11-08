const express = require('express');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const config = require('./config');
const schedule = require('./services/schedule');

function createApp() {
  const app = express();
  app.set('trust proxy', config.trustProxy);
  app.disable('x-powered-by');

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'blob:', 'https://*.tile.openstreetmap.org', 'https://server.arcgisonline.com'],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        connectSrc: ["'self'", 'https://nominatim.openstreetmap.org'],
        workerSrc: ["'self'"],
        manifestSrc: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }));
  app.use(express.json({ limit: '7mb' })); // รูปหลักฐานสูงสุด 3 รูป (บีบอัดจากฝั่งมือถือแล้ว)
  app.use(cookieParser());

  app.get('/api/health', async (_req, res) => {
    const state = await schedule.windowState();
    res.json({ ok: true, day: state.day, serverTime: state.serverTime });
  });
  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/attendance', require('./routes/attendance'));
  app.use('/api/reports', require('./routes/reports'));
  app.use('/api/admin', require('./routes/admin'));
  app.use('/api/profile', require('./routes/profile'));
  app.use('/api/report-docs', require('./routes/reportDocs'));
  app.use('/api/ext/v1', require('./routes/ext'));

  app.use('/api', (_req, res) => res.status(404).json({ error: 'ไม่พบ API' }));

  // เสิร์ฟหน้าเว็บ (ถ้าไม่ได้ใช้ Nginx เสิร์ฟไฟล์ static)
  if (config.staticDir && fs.existsSync(config.staticDir)) {
    // ไฟล์ใน /assets มีชื่อแบบ hash เก็บได้นาน ส่วน index.html / sw.js / manifest ต้องตรวจใหม่ทุกครั้ง เพื่อให้มือถือได้เวอร์ชันล่าสุดทันที
    app.use(express.static(config.staticDir, {
      index: false,
      setHeaders(res, file) {
        res.setHeader('Cache-Control', /[\\/]assets[\\/]/.test(file) ? 'public, max-age=31536000, immutable' : 'no-cache');
      },
    }));
    app.get('/{*splat}', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(config.staticDir, 'index.html'));
    });
  }

  // ตัวจัดการข้อผิดพลาด
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'ข้อมูลมีขนาดใหญ่เกินไป' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' });
    const status = err.status || 500;
    if (status >= 500) console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`, err);
    res.status(status).json({ error: status >= 500 ? 'เกิดข้อผิดพลาดในระบบ' : err.message, code: err.code });
  });
  return app;
}

module.exports = { createApp };
