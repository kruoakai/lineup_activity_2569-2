require('dotenv').config();

function required(name, fallback) {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === '') throw new Error(`Missing environment variable ${name}`);
  return v;
}

const isTest = process.env.NODE_ENV === 'test';

module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3000),
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'lineup',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'lineup',
  },
  jwtSecret: required('JWT_SECRET', isTest ? 'test-jwt-secret' : undefined),
  qrSecret: required('QR_SECRET', isTest ? 'test-qr-secret' : undefined),
  accessTokenTtl: '15m',
  refreshTokenDays: 120,
  cookieSecure: process.env.COOKIE_SECURE !== 'false',
  uploadDir: process.env.UPLOAD_DIR || require('path').join(__dirname, '..', 'uploads'),
  staticDir: process.env.STATIC_DIR || '',
  trustProxy: process.env.TRUST_PROXY || 'loopback',
};
