const express = require('express');
const fs = require('fs');
const files = require('../services/files');
const db = require('../db');
const settings = require('../services/settings');
const schedule = require('../services/schedule');
const attendance = require('../services/attendance');
const qr = require('../services/qr');
const { reportScope, rosterScope, MANAGE_ALL } = require('../services/permissions');
const { authenticate, requireReady, requireRole, HttpError } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, requireReady);

// สถานะช่วงเวลา + ผลการเช็กชื่อของฉันวันนี้
router.get('/state', async (req, res) => {
  const [state, s] = await Promise.all([schedule.windowState(), settings.getAll()]);
  const record = await attendance.findRecord(req.user.id, state.day);
  res.json({
    ...state,
    record,
    checkMode: s.check_mode,
    geofence: s.geofence_configured
      ? { lat: Number(s.geofence_lat), lng: Number(s.geofence_lng), radius: s.geofence_radius_m, maxAccuracy: s.max_accuracy_m }
      : null,
    collegeName: s.college_name,
  });
});

router.post('/check-in', async (req, res) => {
  res.json(await attendance.selfCheckIn(req.user, req.body || {}, req.ip));
});

router.get('/me/history', async (req, res) => {
  res.json({ items: await attendance.history(req.user.id) });
});

// เช็กแทน / บันทึกสถานะ
router.post('/record', async (req, res) => {
  res.json(await attendance.recordFor(req.user, req.body || {}, req.ip));
});

// เช็กชื่อแบบกลุ่ม พร้อมรูปถ่ายรวม
router.post('/record-batch', async (req, res) => {
  res.json(await attendance.recordBatch(req.user, req.body || {}, req.ip));
});

// รายชื่อพร้อมสถานะรายวัน
router.get('/roster', async (req, res) => {
  const scope = rosterScope(req.user);
  if (!scope) throw new HttpError(403, 'ไม่มีสิทธิ์ดูรายชื่อ');
  const state = await schedule.windowState();
  const day = /^\d{4}-\d{2}-\d{2}$/.test(req.query.day || '') ? req.query.day : state.day;
  const departmentId = scope.all ? (Number(req.query.departmentId) || null) : scope.departmentId;
  const items = await attendance.roster({
    day,
    departmentId,
    status: typeof req.query.status === 'string' ? req.query.status : '',
    search: typeof req.query.search === 'string' ? req.query.search.slice(0, 50) : '',
  });
  let phase = state.phase;
  if (day !== state.day) {
    const info = await schedule.dayInfo(day);
    phase = !info.isAssemblyDay ? 'no_assembly' : day > state.day ? 'before' : 'closed';
  }
  const s = await settings.getAll();
  const peerOnly = req.user.peer_check && !req.user.can_proxy && !MANAGE_ALL.has(req.user.role);
  res.json({ day, today: state.day, phase, items, peerPhotoRequired: peerOnly && s.group_checkin_photo === '1' });
});

async function loadScoped(req, attendanceId) {
  const [row] = await db.query(
    'SELECT a.id, a.user_id, a.day, u.department_id FROM attendance a JOIN users u ON u.id = a.user_id WHERE a.id = ?',
    [attendanceId],
  );
  if (!row) throw new HttpError(404, 'ไม่พบข้อมูล');
  const scope = rosterScope(req.user);
  const allowed = row.user_id === req.user.id || (scope && (scope.all || scope.departmentId === row.department_id));
  if (!allowed) throw new HttpError(403, 'ไม่มีสิทธิ์ดูข้อมูลนี้');
  return row;
}

// ประวัติการแก้ไข (audit log) ของรายการ
router.get('/:id/events', async (req, res) => {
  await loadScoped(req, Number(req.params.id));
  res.json({ items: await attendance.events(Number(req.params.id)) });
});

// รายการรูปหลักฐาน (สูงสุด 3 รูป)
router.get('/:id/photos', async (req, res) => {
  await loadScoped(req, Number(req.params.id));
  const items = await db.query(
    `SELECT p.id, p.created_at, u.full_name AS uploaded_by_name FROM attendance_photos p
       JOIN users u ON u.id = p.uploaded_by WHERE p.attendance_id = ? ORDER BY p.id`,
    [Number(req.params.id)],
  );
  res.json({ items, max: attendance.MAX_PHOTOS });
});

// แนบรูปเพิ่มภายหลัง: เจ้าของรายการ (เฉพาะวันนี้) / ผู้บันทึกแทนในแผนก (วันนี้) / งานกิจกรรม / ผู้ดูแล
router.post('/:id/photos', async (req, res) => {
  const row = await loadScoped(req, Number(req.params.id));
  const state = await schedule.windowState();
  const manage = MANAGE_ALL.has(req.user.role);
  const sameDeptProxy = req.user.can_proxy && req.user.department_id === row.department_id;
  if (!manage && !(row.day === state.day && (row.user_id === req.user.id || sameDeptProxy))) {
    throw new HttpError(403, 'แนบรูปเพิ่มได้เฉพาะรายการของวันนี้');
  }
  const photos = attendance.photosOf(req.body || {});
  if (!photos.length) throw new HttpError(400, 'กรุณาเลือกรูป');
  const n = await attendance.addPhotos(row.id, photos, req.user.id, row.day);
  res.json({ ok: true, added: n });
});

router.get('/photos/:photoId', async (req, res) => {
  const [p] = await db.query('SELECT attendance_id, path FROM attendance_photos WHERE id = ?', [Number(req.params.photoId)]);
  if (!p) throw new HttpError(404, 'ไม่พบรูปภาพ');
  await loadScoped(req, p.attendance_id);
  const abs = files.resolveUpload(p.path);
  if (!abs || !fs.existsSync(abs)) throw new HttpError(404, 'ไม่พบรูปภาพ (อาจถูกลบตามระยะเวลาเก็บข้อมูล)');
  res.set('Cache-Control', 'private, max-age=3600');
  res.sendFile(abs);
});

// สิทธิ์ตัวแทนเช็กชื่อแผนกกำหนดโดยผู้ดูแลระบบเท่านั้น (หน้า ผู้ใช้และสิทธิ์)
router.post('/proxy-release', async (req, res) => {
  await db.query('UPDATE users SET proxy_until = NULL WHERE id = ?', [req.user.id]);
  res.json({ ok: true });
});

// QR หมุนเวียนสำหรับแสดงที่จุดเข้าแถว
router.get('/qr/current', requireRole(...MANAGE_ALL), async (req, res) => {
  const s = await settings.getAll();
  const state = await schedule.windowState();
  res.json({ ...qr.current(s.qr_interval_s), phase: state.phase, serverTime: state.serverTime });
});

module.exports = router;
