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
  return {
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

module.exports = { dayInfo, assemblyDaysBetween, windowState, ASSEMBLY };
