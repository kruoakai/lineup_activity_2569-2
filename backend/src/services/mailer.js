const nodemailer = require('nodemailer');

// ส่งอีเมลผ่าน SMTP — ตั้งค่าผ่าน environment (deploy/.env):
//   SMTP_HOST, SMTP_PORT (465 = SSL, 587 = STARTTLS), SMTP_USER, SMTP_PASS, SMTP_FROM, APP_URL
let transport = null;
let testOutbox = null; // ใช้ในการทดสอบอัตโนมัติ

function enabled() {
  return Boolean(testOutbox || (process.env.SMTP_HOST && process.env.SMTP_FROM));
}

function appUrl() {
  return (process.env.APP_URL || 'https://lineup.ccollege.ac.th').replace(/\/+$/, '');
}

function getTransport() {
  if (!transport) {
    const port = Number(process.env.SMTP_PORT || 587);
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  }
  return transport;
}

async function send({ to, subject, text, html }) {
  if (testOutbox) {
    testOutbox.push({ to, subject, text, html });
    return;
  }
  if (!enabled()) throw new Error('SMTP not configured');
  await getTransport().sendMail({ from: process.env.SMTP_FROM, to, subject, text, html });
}

function useTestOutbox(box) {
  testOutbox = box;
}

module.exports = { enabled, send, appUrl, useTestOutbox };
