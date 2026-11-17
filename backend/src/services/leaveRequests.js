/**
 * แจ้งลา / ไปราชการ / งานนโยบาย โดยเจ้าตัว
 * - ครูและบุคลากรแจ้งเอง (วันเดียวหรือช่วงวัน ล่วงหน้าได้ ย้อนหลังได้ไม่เกิน 3 วันทำการ) แนบรูปได้ 3 รูป
 * - ยังไม่ลงรายงานจนกว่าเจ้าหน้าที่บุคลากร (หรือผู้ดูแลระบบ) กด "บันทึก" → ลงสถานะทุกวันทำงานในช่วงนั้นผ่าน hr.setStatus
 * - ไม่อนุมัติต้องให้เหตุผล ผู้แจ้งเห็นเหตุผล · ผู้แจ้งยกเลิกเองได้ระหว่างรอตรวจ
 */
const fs = require('fs');
const db = require('../db');
const clock = require('../clock');
const files = require('./files');
const hr = require('./hr');
const { HttpError } = require('../middleware/auth');

const KINDS = {
  sick: 'ลาป่วย', personal: 'ลากิจ', official: 'ไปราชการ', policy: 'งานนโยบาย', other: 'ลาอื่น ๆ',
};
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const BACK_WORK_DAYS = 3;
const MAX_AHEAD = 60;
const MAX_SPAN = 31;
const MAX_PHOTOS = 3;
const REVIEWERS = ['hr', 'admin'];

const isReviewer = (u) => REVIEWERS.includes(u.role);
const toStatus = (kind) => (['official', 'policy'].includes(kind) ? { status: kind, leaveType: null } : { status: 'leave', leaveType: kind });
const day = (v) => (v instanceof Date ? clock.bangkok(v).day : String(v).slice(0, 10));

/** วันแรกที่แจ้งย้อนหลังได้ = ย้อนไป 3 วันทำการก่อนวันนี้ */
async function earliestDay(today) {
  let d = today;
  let n = 0;
  for (let i = 0; i < 20 && n < BACK_WORK_DAYS; i += 1) {
    d = clock.addDays(d, -1);
    if ((await hr.workInfo(d)).work) n += 1;
  }
  return d;
}

async function workDays(from, to) {
  const out = [];
  for (let d = from; d <= to; d = clock.addDays(d, 1)) if ((await hr.workInfo(d)).work) out.push(d);
  return out;
}

function shape(r) {
  let photos = [];
  try { photos = Array.isArray(r.photos) ? r.photos : JSON.parse(r.photos || '[]'); } catch { photos = []; }
  return {
    id: r.id, user_id: r.user_id, kind: r.kind, kind_label: KINDS[r.kind], from: day(r.day_from), to: day(r.day_to),
    note: r.note, photo_count: photos.length, status: r.status, review_note: r.review_note,
    reviewed_at: r.reviewed_at, reviewed_by_name: r.reviewed_by_name || null, created_at: r.created_at,
    ...(r.full_name !== undefined ? {
      name: `${r.name_prefix || ''}${r.full_name}`, employee_code: r.employee_code, department: r.department || null, position_title: r.position_title || '',
    } : {}),
  };
}

async function meta() {
  const today = clock.bangkok().day;
  return { kinds: KINDS, today, earliest: await earliestDay(today), latest: clock.addDays(today, MAX_AHEAD), maxSpan: MAX_SPAN };
}

async function create(user, body) {
  const kind = String(body.kind || '');
  if (!KINDS[kind]) throw new HttpError(400, 'เลือกประเภท (ลาป่วย / ลากิจ / ไปราชการ / งานนโยบาย / ลาอื่น ๆ)');
  const from = String(body.from || '');
  const to = String(body.to || from);
  if (!DATE.test(from) || !DATE.test(to)) throw new HttpError(400, 'เลือกวันที่');
  if (from > to) throw new HttpError(400, 'วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่ม');
  const note = String(body.note || '').trim().slice(0, 500);
  if (['official', 'policy'].includes(kind) && !note) throw new HttpError(400, 'กรุณาระบุรายละเอียด เช่น ไปราชการที่ไหน / เลขที่คำสั่ง');
  const m = await meta();
  if (from < m.earliest) throw new HttpError(400, `แจ้งย้อนหลังได้ไม่เกิน ${BACK_WORK_DAYS} วันทำการ — กรณีเก่ากว่านี้ติดต่อเจ้าหน้าที่บุคลากร`);
  if (to > m.latest) throw new HttpError(400, `แจ้งล่วงหน้าได้ไม่เกิน ${MAX_AHEAD} วัน`);
  if (clock.addDays(from, MAX_SPAN - 1) < to) throw new HttpError(400, `ช่วงวันที่ยาวได้ไม่เกิน ${MAX_SPAN} วัน`);
  if (!(await workDays(from, to)).length) throw new HttpError(400, 'ช่วงวันที่ที่เลือกไม่มีวันทำงาน');
  const photos = Array.isArray(body.photos) ? body.photos.filter((x) => typeof x === 'string' && x) : [];
  if (photos.length > MAX_PHOTOS) throw new HttpError(400, `แนบรูปได้ไม่เกิน ${MAX_PHOTOS} รูป`);
  if (photos.some((x) => !x.startsWith('data:image/jpeg;base64,'))) throw new HttpError(400, 'รูปภาพต้องเป็นไฟล์ JPEG');
  const [dup] = await db.query(
    "SELECT day_from, day_to FROM leave_requests WHERE user_id = ? AND status IN ('pending','approved') AND day_from <= ? AND day_to >= ? LIMIT 1",
    [user.id, to, from]);
  if (dup) throw new HttpError(409, 'มีคำแจ้งที่ทับช่วงวันนี้อยู่แล้ว — ยกเลิกคำแจ้งเดิมก่อน หรือแจ้งเจ้าหน้าที่บุคลากร');
  const paths = [];
  for (const p of photos) paths.push(await files.saveImage(p, { dir: 'leave', prefix: `lv-${user.id}`, types: ['jpeg'] }));
  const r = await db.query(
    'INSERT INTO leave_requests (user_id, kind, day_from, day_to, note, photos, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [user.id, kind, from, to, note, JSON.stringify(paths), clock.now()]);
  return get(r.insertId);
}

const SELECT = `SELECT r.*, u.employee_code, u.name_prefix, u.full_name, u.position_title, d.name AS department,
                       CONCAT(rv.name_prefix, rv.full_name) AS reviewed_by_name
                  FROM leave_requests r JOIN users u ON u.id = r.user_id
                  LEFT JOIN departments d ON d.id = u.department_id
                  LEFT JOIN users rv ON rv.id = r.reviewed_by`;

async function row(id) {
  const [r] = await db.query(`${SELECT} WHERE r.id = ?`, [Number(id)]);
  if (!r) throw new HttpError(404, 'ไม่พบคำแจ้ง');
  return r;
}
async function get(id) { return shape(await row(id)); }

async function mine(user) {
  const rows = await db.query(`${SELECT} WHERE r.user_id = ? ORDER BY r.day_from DESC, r.id DESC LIMIT 50`, [user.id]);
  return rows.map(shape);
}

async function cancel(user, id) {
  const r = await row(id);
  if (r.user_id !== user.id) throw new HttpError(403, 'ยกเลิกได้เฉพาะคำแจ้งของตนเอง');
  if (r.status !== 'pending') throw new HttpError(409, 'คำแจ้งนี้ตรวจแล้ว ยกเลิกไม่ได้ — ติดต่อเจ้าหน้าที่บุคลากร');
  await db.query("UPDATE leave_requests SET status = 'cancelled' WHERE id = ? AND status = 'pending'", [r.id]);
  return get(r.id);
}

async function pendingCount() {
  const [{ n }] = await db.query("SELECT COUNT(*) AS n FROM leave_requests r JOIN users u ON u.id = r.user_id WHERE r.status = 'pending' AND u.active = 1");
  return n;
}

/** รายการให้เจ้าหน้าที่ตรวจ: รอตรวจทั้งหมด + ที่ตรวจแล้วล่าสุด · พร้อมสถานะที่มีอยู่แล้วในแต่ละวัน (กันบันทึกทับโดยไม่รู้ตัว) */
async function reviewList({ status = 'pending' } = {}) {
  const rows = status === 'pending'
    ? await db.query(`${SELECT} WHERE r.status = 'pending' AND u.active = 1 ORDER BY r.day_from, r.id`)
    : await db.query(`${SELECT} WHERE r.status IN ('approved','rejected') ORDER BY r.reviewed_at DESC LIMIT 60`);
  const out = [];
  for (const r of rows) {
    const it = shape(r);
    if (r.status === 'pending') {
      const days = await workDays(it.from, it.to);
      it.days = days;
      const recs = days.length ? await db.query(
        'SELECT DATE_FORMAT(day, "%Y-%m-%d") AS day, status, leave_type, method FROM attendance WHERE user_id = ? AND day IN (?)', [r.user_id, days]) : [];
      it.existing = recs;
    }
    out.push(it);
  }
  return out;
}

async function photo(user, id, n) {
  const r = await row(id);
  if (r.user_id !== user.id && !isReviewer(user)) throw new HttpError(403, 'ไม่มีสิทธิ์ดูรูปนี้');
  const list = shape(r).photo_count ? (Array.isArray(r.photos) ? r.photos : JSON.parse(r.photos)) : [];
  const rel = list[Number(n)];
  const abs = rel && files.resolveUpload(rel);
  if (!abs || !fs.existsSync(abs)) throw new HttpError(404, 'ไม่พบรูปภาพ');
  return abs;
}

async function approve(actor, id, ip) {
  const r = await row(id);
  if (r.status !== 'pending') throw new HttpError(409, 'คำแจ้งนี้ตรวจไปแล้ว');
  const it = shape(r);
  const { status, leaveType } = toStatus(r.kind);
  const res = await hr.setStatus(actor, { from: it.from, to: it.to, status, leaveType, note: r.note, userIds: [r.user_id] }, ip);
  const done = await db.query(
    "UPDATE leave_requests SET status = 'approved', reviewed_by = ?, reviewed_at = ?, review_note = '' WHERE id = ? AND status = 'pending'",
    [actor.id, clock.now(), r.id]);
  if (!done.affectedRows) throw new HttpError(409, 'คำแจ้งนี้ตรวจไปแล้ว');
  // วันที่สร้างรายงานประจำวันไว้แล้ว: ต้องเปิดเอกสารแล้วดึงข้อมูลใหม่ ข้อมูลจึงจะตรง
  const docs = res.days.length ? await db.query(
    "SELECT id, DATE_FORMAT(period_from, '%Y-%m-%d') AS day, status FROM report_docs WHERE kind = 'hr_daily' AND period_from IN (?) AND status <> 'returned'", [res.days]) : [];
  return { request: await get(r.id), days: res.days, docs };
}

async function reject(actor, id, reason) {
  const why = String(reason || '').trim().slice(0, 300);
  if (!why) throw new HttpError(400, 'กรุณาระบุเหตุผลที่ไม่อนุมัติ ผู้แจ้งจะเห็นข้อความนี้');
  const r = await row(id);
  if (r.status !== 'pending') throw new HttpError(409, 'คำแจ้งนี้ตรวจไปแล้ว');
  await db.query(
    "UPDATE leave_requests SET status = 'rejected', reviewed_by = ?, reviewed_at = ?, review_note = ? WHERE id = ? AND status = 'pending'",
    [actor.id, clock.now(), why, r.id]);
  return get(r.id);
}

module.exports = { KINDS, meta, create, mine, cancel, pendingCount, reviewList, photo, approve, reject, isReviewer, earliestDay };
