const db = require('../db');
const clock = require('../clock');
const settings = require('./settings');

// สถานะในปฏิทินที่นับเป็นวันเข้าแถว
const ASSEMBLY = new Set(['normal', 'special']);

// วันนั้นเป็นวันเข้าแถวหรือไม่: ดูตาราง assembly_days ก่อน ถ้าไม่มีใช้วันในสัปดาห์ตามค่าระบบ
async function dayInfo(day) {
  const [row] = await db.query('SELECT status, note FROM assembly_days WHERE day = ?', [day]);
  if (row) return { day, isAssemblyDay: ASSEMBLY.has(row.status), status: row.status, note: row.note, source: 'calendar' };
  const s = await settings.getAll();
  const weekdays = s.assembly_weekdays.split(',').map(Number);
  const normal = weekdays.includes(clock.weekdayOf(day));
  return { day, isAssemblyDay: normal, status: normal ? 'normal' : 'holiday', note: normal ? '' : 'ไม่ใช่วันเข้าแถวปกติ', source: 'weekday' };
}

// ใช้กับช่วงวันที่ยาว (รายงานภาคเรียน) — คืนรายการวันเข้าแถวทั้งหมดในช่วง
async function assemblyDaysBetween(from, to) {
  const s = await settings.getAll();
  const weekdays = s.assembly_weekdays.split(',').map(Number);
  const rows = await db.query('SELECT day, status FROM assembly_days WHERE day BETWEEN ? AND ?', [from, to]);
  const overrides = new Map(rows.map((r) => [r.day, r.status]));
  const out = [];
  for (let d = from; d <= to; d = clock.addDays(d, 1)) {
    const st = overrides.get(d);
    if (st ? ASSEMBLY.has(st) : weekdays.includes(clock.weekdayOf(d))) out.push(d);
  }
  return out;
}

// สถานะช่วงเวลาเช็กชื่อ ณ ขณะนี้ (ตามเวลาเซิร์ฟเวอร์)
async function windowState(at = clock.now()) {
  const s = await settings.getAll();
  const bkk = clock.bangkok(at);
  const info = await dayInfo(bkk.day);
  const openSec = clock.parseHHMM(s.open_time);
  const closeSec = clock.parseHHMM(s.close_time) + 59; // นับทั้งนาทีสุดท้าย
  let phase;
  if (!info.isAssemblyDay) phase = 'no_assembly';
  else if (bkk.seconds < openSec) phase = 'before';
  else if (bkk.seconds <= closeSec) phase = 'open';
  else phase = 'closed';
  // สั่งเปิด/ปิดด้วยมือ: ใช้เฉพาะวันที่สั่ง และเฉพาะวันเข้าแถว
  const scheduledPhase = phase;
  let manual = null;
  if (info.isAssemblyDay && s.window_override_day === bkk.day && ['open', 'closed'].includes(s.window_override)) {
    phase = s.window_override;
    manual = { mode: s.window_override, by: s.window_override_by, at: s.window_override_at };
  }
  return {
    scheduledPhase,
    manual,
    day: bkk.day,
    serverTime: bkk.time,
    phase,
    isAssemblyDay: info.isAssemblyDay,
    dayNote: info.note,
    dayStatus: info.status,
    daySource: info.source,
    openTime: s.open_time,
    closeTime: s.close_time,
  };
}

/**
 * สั่งเปิด / ปิดการเช็กชื่อด้วยมือ (mode: open | closed) หรือกลับไปใช้ตามเวลา (auto)
 * มีผลเฉพาะวันนี้ — วันถัดไปกลับไปใช้เวลาตามตั้งค่าเอง
 */
async function setManual(actor, mode) {
  if (!['open', 'closed', 'auto'].includes(mode)) {
    const e = new Error('คำสั่งไม่ถูกต้อง'); e.status = 400; throw e;
  }
  const st = await windowState();
  if (mode !== 'auto' && !st.isAssemblyDay) {
    const e = new Error('วันนี้ไม่ใช่วันเข้าแถว — เพิ่มวันเข้าแถวที่ "ปฏิทินวันเข้าแถว" ก่อนจึงสั่งเปิดได้'); e.status = 409; throw e;
  }
  await settings.update(mode === 'auto'
    ? { window_override: '', window_override_day: '', window_override_by: '', window_override_at: '' }
    : { window_override: mode, window_override_day: st.day, window_override_by: String(actor.full_name || '').slice(0, 190), window_override_at: clock.bangkok().time.slice(0, 5) });
  return windowState();
}

module.exports = { dayInfo, assemblyDaysBetween, windowState, setManual, ASSEMBLY };
