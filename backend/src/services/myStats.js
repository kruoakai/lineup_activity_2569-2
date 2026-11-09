// สถิติการเข้าแถวของตนเอง (หน้า "ประวัติของฉัน"): ข้อมูลรายวันในช่วงที่เลือก + ปฏิทินวันเข้าแถว
// คำนวณเฉพาะข้อมูลของผู้ใช้คนนั้น ฝั่งหน้าเว็บนำไปสรุปเป็นปฏิทิน / รายเดือน / เวลาเช็กชื่อ
const db = require('../db');
const clock = require('../clock');
const settings = require('./settings');
const schedule = require('./schedule');
const { HttpError } = require('../middleware/auth');

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 400;

// ช่วงเวลาสำเร็จรูป: ภาคเรียนปัจจุบัน / ปีการศึกษา (ภาคเรียนที่ชื่อลงท้ายด้วยปีเดียวกัน) / 3 เดือนล่าสุด
async function presets(today) {
  const sems = await db.query('SELECT name, start_date AS start, end_date AS end FROM semesters ORDER BY start_date');
  const str = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));
  const list = sems.map((s) => ({ name: s.name, start: str(s.start), end: str(s.end) }));
  const cur = list.find((s) => s.start <= today && today <= s.end) || [...list].reverse().find((s) => s.start <= today) || null;
  const out = { quarter: { label: '3 เดือนล่าสุด', from: clock.addDays(today, -91), to: today } };
  if (cur) {
    out.semester = { label: `ภาคเรียน ${cur.name}`, from: cur.start, to: cur.end < today ? cur.end : today };
    const year = (cur.name.match(/(\d{4})\s*$/) || [])[1];
    const same = year ? list.filter((s) => s.name.trim().endsWith(year)) : [cur];
    out.year = { label: year ? `ปีการศึกษา ${year}` : 'ปีการศึกษานี้', from: same[0].start, to: today };
  } else {
    out.semester = { label: 'ภาคเรียนนี้ (ประมาณ 5 เดือน)', from: clock.addDays(today, -152), to: today };
    out.year = { label: '1 ปีล่าสุด', from: clock.addDays(today, -365), to: today };
  }
  return out;
}

async function stats(user, query = {}) {
  const today = clock.bangkok().day;
  const p = await presets(today);
  let from = String(query.from || p.semester.from);
  let to = String(query.to || today);
  if (!DATE.test(from) || !DATE.test(to)) throw new HttpError(400, 'รูปแบบวันที่ไม่ถูกต้อง');
  if (to > today) to = today;
  if (from > to) throw new HttpError(400, 'ช่วงวันที่ไม่ถูกต้อง');
  if (clock.addDays(from, MAX_DAYS) < to) throw new HttpError(400, `ดูได้ครั้งละไม่เกิน ${MAX_DAYS} วัน`);

  const s = await settings.getAll();
  const win = await schedule.windowState();
  const [u] = await db.query('SELECT created_at, must_assemble FROM users WHERE id = ?', [user.id]);
  // ไม่นับ "ขาด" ก่อนมีบัญชีในระบบ
  const since = clock.bangkok(u.created_at).day;
  const records = await db.query(
    `SELECT a.day, a.status, a.leave_type, a.method, a.checked_at, a.note, cb.full_name AS checked_by_name
       FROM attendance a JOIN users cb ON cb.id = a.checked_by
      WHERE a.user_id = ? AND a.day BETWEEN ? AND ? ORDER BY a.day`,
    [user.id, from, to],
  );
  const assembly = new Set(await schedule.assemblyDaysBetween(from, to));
  const notes = new Map((await db.query('SELECT day, status, note FROM assembly_days WHERE day BETWEEN ? AND ?', [from, to]))
    .map((r) => [r.day, r]));
  const days = [];
  for (let d = from; d <= to; d = clock.addDays(d, 1)) {
    const isAssembly = assembly.has(d);
    // วันนี้ยังไม่ปิดระบบ = ยังไม่นับ
    const counted = isAssembly && d >= since && (d < today || win.phase === 'closed');
    days.push({ day: d, assembly: isAssembly, counted, note: notes.get(d)?.note || '' });
  }
  return {
    from, to, today, since,
    mustAssemble: !!u.must_assemble,
    openTime: s.open_time, closeTime: s.close_time,
    presets: p,
    days,
    records,
  };
}

module.exports = { stats };
