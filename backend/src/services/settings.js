const db = require('../db');

// ค่าเริ่มต้นของระบบ (แก้ได้ที่หน้า "ตั้งค่าระบบ" ของผู้ดูแล)
const DEFAULTS = {
  open_time: '07:30',            // เปิดเช็กชื่อ
  close_time: '08:30',           // เช็กได้ถึง 08:30:59 (นับนาทีที่ 08:30 ว่าทัน)
  assembly_weekdays: '1,2,3,4,5', // จันทร์–ศุกร์
  check_mode: 'gps_or_qr',       // none (กดปุ่มอย่างเดียว) | gps | gps_or_qr | qr_required
  geofence_lat: '',
  geofence_lng: '',
  geofence_radius_m: '150',
  max_accuracy_m: '100',         // ความคลาดเคลื่อน GPS สูงสุดที่ยอมรับ
  qr_interval_s: '30',           // QR เปลี่ยนทุก n วินาที
  photo_retention_days: '120',
  college_name: 'วิทยาลัยเทคนิคชัยภูมิ',
  group_checkin: '0',            // 1 = ทุกคนในแผนกเช็กชื่อ "มาเข้าแถว" แทนกันได้
  group_checkin_photo: '1',      // 1 = การเช็กแทนแบบนี้ต้องแนบรูปอย่างน้อย 1 รูป
  // แบบรายงานเสนอผู้บริหาร และลำดับผู้ลงนาม (ตามแบบบันทึกการเข้าร่วมกิจกรรมหน้าเสาธง)
  report_form_title: 'แบบบันทึกการเข้าร่วมกิจกรรมหน้าเสาธง วิทยาลัยเทคนิคชัยภูมิ',
  sign_step1_title: 'หัวหน้างานครูที่ปรึกษาและการแนะแนว',
  sign_step1_label: 'ผู้รับรอง',
  sign_step1_user: '',
  sign_step2_title: 'รองผู้อำนวยการฝ่ายกิจการนักเรียน นักศึกษา',
  sign_step2_label: 'ผู้รับรอง',
  sign_step2_user: '',
  sign_step3_title: 'ผู้อำนวยการวิทยาลัยเทคนิคชัยภูมิ',
  sign_step3_label: 'ผู้อนุมัติ',
  sign_step3_user: '',
};

const NUMERIC = new Set(['geofence_radius_m', 'max_accuracy_m', 'qr_interval_s', 'photo_retention_days']);

const VALIDATORS = {
  open_time: (v) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v),
  close_time: (v) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v),
  assembly_weekdays: (v) => /^([0-6])(,[0-6])*$/.test(v),
  check_mode: (v) => ['none', 'gps', 'gps_or_qr', 'qr_required'].includes(v),
  group_checkin: (v) => /^[01]$/.test(v),
  group_checkin_photo: (v) => /^[01]$/.test(v),
  geofence_lat: (v) => v === '' || (Number.isFinite(+v) && +v >= -90 && +v <= 90),
  geofence_lng: (v) => v === '' || (Number.isFinite(+v) && +v >= -180 && +v <= 180),
  geofence_radius_m: (v) => Number.isInteger(+v) && +v >= 20 && +v <= 2000,
  max_accuracy_m: (v) => Number.isInteger(+v) && +v >= 10 && +v <= 1000,
  qr_interval_s: (v) => Number.isInteger(+v) && +v >= 10 && +v <= 300,
  photo_retention_days: (v) => Number.isInteger(+v) && +v >= 1 && +v <= 3650,
  college_name: (v) => typeof v === 'string' && v.length > 0 && v.length <= 150,
  report_form_title: (v) => v.length > 0 && v.length <= 200,
};
for (const n of [1, 2, 3]) {
  VALIDATORS[`sign_step${n}_title`] = (v) => v.length > 0 && v.length <= 150;
  VALIDATORS[`sign_step${n}_label`] = (v) => v.length > 0 && v.length <= 50;
  VALIDATORS[`sign_step${n}_user`] = (v) => v === '' || /^\d+$/.test(v);
}

let cache = null;
let cacheAt = 0;

async function getAll() {
  if (cache && Date.now() - cacheAt < 5000) return cache;
  const rows = await db.query('SELECT k, v FROM settings');
  const s = { ...DEFAULTS };
  for (const r of rows) if (r.k in DEFAULTS) s[r.k] = r.v;
  const out = {};
  for (const [k, v] of Object.entries(s)) out[k] = NUMERIC.has(k) ? Number(v) : v;
  out.geofence_configured = s.geofence_lat !== '' && s.geofence_lng !== '';
  cache = out;
  cacheAt = Date.now();
  return out;
}

async function update(patch) {
  const errors = [];
  for (const [k, raw] of Object.entries(patch)) {
    if (!(k in DEFAULTS)) { errors.push(`ไม่รู้จักค่า ${k}`); continue; }
    const v = String(raw).trim();
    if (!VALIDATORS[k](v)) errors.push(`ค่า ${k} ไม่ถูกต้อง`);
  }
  if (patch.open_time && patch.close_time && patch.open_time >= patch.close_time) {
    errors.push('เวลาเปิดต้องก่อนเวลาปิด');
  }
  if (errors.length) {
    const e = new Error(errors.join(', '));
    e.status = 400;
    throw e;
  }
  for (const [k, raw] of Object.entries(patch)) {
    await db.query('INSERT INTO settings (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)', [k, String(raw).trim()]);
  }
  invalidate();
  return getAll();
}

function invalidate() {
  cache = null;
}

module.exports = { getAll, update, invalidate, DEFAULTS };
