// ใช้ MySQL จริง (Docker) — กำหนดผ่าน env หรือใช้ค่าเริ่มต้นของ container ทดสอบ
process.env.NODE_ENV = 'test';
process.env.DB_HOST = process.env.TEST_DB_HOST || '127.0.0.1';
process.env.DB_PORT = process.env.TEST_DB_PORT || '33306';
process.env.DB_USER = process.env.TEST_DB_USER || 'lineup';
process.env.DB_PASSWORD = process.env.TEST_DB_PASSWORD || 'lineuptest';
process.env.DB_NAME = process.env.TEST_DB_NAME || 'lineup_test';
process.env.COOKIE_SECURE = 'false';
process.env.UPLOAD_DIR = require('path').join(require('os').tmpdir(), 'lineup-test-uploads');
process.env.BACKUP_DIR = require('path').join(require('os').tmpdir(), 'lineup-test-backups');

const bcrypt = require('bcryptjs');
const request = require('supertest');
const db = require('../src/db');
const clock = require('../src/clock');
const settings = require('../src/services/settings');
const { migrate } = require('../scripts/migrate');
const { createApp } = require('../src/app');

const app = createApp();
const PASSWORD = 'Passw0rd!x';

// พิกัดศูนย์กลางพื้นที่ทดสอบ
const CENTER = { lat: 15.8, lng: 102.03 };

// เวลาไทย -> Date (UTC)
function bkk(day, time) {
  return new Date(`${day}T${time}+07:00`);
}

async function resetDb() {
  await migrate();
  await db.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const t of ['report_signatures', 'report_docs', 'attendance_photos', 'password_resets', 'attendance_events', 'attendance', 'refresh_tokens', 'admin_logs', 'users', 'departments', 'settings', 'assembly_days', 'semesters', 'api_keys']) {
    await db.query(`TRUNCATE TABLE ${t}`);
  }
  await db.query('SET FOREIGN_KEY_CHECKS = 1');
  settings.invalidate();
  await settings.update({ geofence_lat: CENTER.lat, geofence_lng: CENTER.lng, geofence_radius_m: 150, max_accuracy_m: 100 });
}

let hash;
async function createUser({ code, name, dept = null, role = 'staff', canProxy = false, ready = true, mustAssemble = true }) {
  hash = hash || (await bcrypt.hash(PASSWORD, 4));
  const r = await db.query(
    `INSERT INTO users (employee_code, email, full_name, department_id, role, can_proxy, must_assemble, password_hash, must_change_password, consent_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [code, `${code}@test.local`, name || code, dept, role, canProxy ? 1 : 0, mustAssemble ? 1 : 0, hash, ready ? 0 : 1, ready ? new Date() : null],
  );
  return r.insertId;
}

async function createDept(name, division = 'ฝ่ายวิชาการ') {
  const r = await db.query('INSERT INTO departments (name, division) VALUES (?, ?)', [name, division]);
  return r.insertId;
}

async function login(code) {
  const res = await request(app).post('/api/auth/login').send({ username: code, password: PASSWORD });
  if (res.status !== 200) throw new Error(`login failed ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.accessToken;
}

function api(token) {
  const wrap = (m) => (url) => request(app)[m](url).set('Authorization', `Bearer ${token}`);
  return { get: wrap('get'), post: wrap('post'), put: wrap('put'), patch: wrap('patch'), delete: wrap('delete') };
}

module.exports = { app, db, clock, settings, resetDb, createUser, createDept, login, api, bkk, CENTER, PASSWORD, request };
