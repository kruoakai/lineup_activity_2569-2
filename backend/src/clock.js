// แหล่งเวลาเดียวของระบบ — ใช้เวลาเซิร์ฟเวอร์เสมอ และเปลี่ยนได้ในการทดสอบ
let override = null;

const BKK_OFFSET_MS = 7 * 60 * 60 * 1000; // Asia/Bangkok = UTC+7 ไม่มี DST

// โหมดทดลอง (Sandbox) สำหรับฝึกใช้งาน/UAT: SANDBOX_TIME=2026-11-09T07:45:00+07:00
// เวลาจะเริ่มที่ค่านี้แล้วเดินต่อตามจริง — ใช้ไม่ได้เมื่อ NODE_ENV=production
const sandboxOffset = process.env.SANDBOX_TIME && !['production', 'test'].includes(process.env.NODE_ENV)
  ? new Date(process.env.SANDBOX_TIME).getTime() - Date.now()
  : 0;

function now() {
  return override ? new Date(override.getTime()) : new Date(Date.now() + sandboxOffset);
}

function setNow(date) {
  override = date ? new Date(date) : null;
}

const pad = (n) => String(n).padStart(2, '0');

// คืนค่าวันที่และเวลาในเขตเวลาไทย
function bangkok(date = now()) {
  const d = new Date(date.getTime() + BKK_OFFSET_MS);
  const day = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const time = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
  return { day, time, weekday: d.getUTCDay(), seconds: d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds() };
}

function parseHHMM(s) {
  const [h, m, sec = 0] = String(s).split(':').map(Number);
  return h * 3600 + m * 60 + sec;
}

// 'YYYY-MM-DD' -> weekday (0 = อาทิตย์)
function weekdayOf(day) {
  return new Date(`${day}T00:00:00Z`).getUTCDay();
}

function addDays(day, n) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

module.exports = { now, setNow, bangkok, parseHHMM, weekdayOf, addDays };
