/**
 * งานบริหารและพัฒนาทรัพยากรบุคคล (เจ้าหน้าที่บุคลากร)
 * - บันทึกสถานะ ไปราชการ / งานนโยบาย / ลาป่วย / ลากิจ / ลาอื่น ๆ ให้บุคลากรทุกคน (ล่วงหน้าได้ ช่วงวันที่ได้)
 * - เลือกรายชื่อผู้มาลงเวลาเกินเวลากำหนด และผู้ไม่ลงเวลากลับ (ข้อมูลจากเครื่องลงเวลา ไม่มีในระบบ)
 * - กำหนดประเภทบุคลากร
 * - สร้างข้อมูลแบบ "สรุปการปฏิบัติงานของข้าราชการครู และบุคลากรทางการศึกษา" ประจำวัน
 */
const db = require('../db');
const clock = require('../clock');
const schedule = require('./schedule');
const settings = require('./settings');
const attendance = require('./attendance');
const { STAFF_TYPES, GROUPS, BY_CODE } = require('./staffTypes');
const { HttpError } = require('../middleware/auth');

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const HR_STATUSES = ['present', 'absent', 'official', 'policy', 'leave'];
const LEAVE_TYPES = { sick: 'ลาป่วย', personal: 'ลากิจ', other: 'ลาอื่น ๆ' };
const MARK_KINDS = { late: 'ผู้มาลงเวลาเกินเวลากำหนด', no_signout: 'ผู้ไม่ลงเวลากลับ' };
const TH_WEEKDAY = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
const MAX_AHEAD = 60;
const typeOrder = new Map(STAFF_TYPES.map((t, i) => [t.code, i]));

function checkDay(day) {
  if (!DATE.test(String(day || ''))) throw new HttpError(400, 'รูปแบบวันที่ไม่ถูกต้อง');
}

/** วันทำงาน = ไม่ใช่วันหยุด/นักขัตฤกษ์ในปฏิทิน และเป็นวันเข้าแถวปกติหรือวันที่ปฏิทินกำหนด (งดเข้าแถวยังเป็นวันทำงาน) */
async function workInfo(day) {
  const info = await schedule.dayInfo(day);
  const work = info.source === 'calendar' ? !['holiday', 'public_holiday'].includes(info.status) : info.isAssemblyDay;
  return { ...info, work };
}

const shortOf = (p) => BY_CODE.get(p.staff_type)?.short || p.position_title || '';
const byType = (a, b) => (typeOrder.get(a.staff_type) ?? 99) - (typeOrder.get(b.staff_type) ?? 99) || a.full_name.localeCompare(b.full_name, 'th');

/** สถานะของทุกคนในวันหนึ่ง (หน้างานบุคลากร) */
async function dayView(day) {
  checkDay(day);
  const info = await workInfo(day);
  const state = await schedule.windowState();
  const people = await db.query(
    `SELECT u.id, u.employee_code, u.full_name, u.position_title, u.staff_type, u.must_assemble, d.name AS department,
            a.status, a.leave_type, a.note, a.method, c.full_name AS checked_by_name
       FROM users u LEFT JOIN departments d ON d.id = u.department_id
       LEFT JOIN attendance a ON a.user_id = u.id AND a.day = ?
       LEFT JOIN users c ON c.id = a.checked_by
      WHERE u.active = 1 AND (u.role <> 'admin' OR u.staff_type IS NOT NULL)
      ORDER BY u.full_name`, [day]);
  const marks = await db.query('SELECT user_id, kind FROM hr_marks WHERE day = ?', [day]);
  const mk = new Map();
  for (const m of marks) mk.set(`${m.user_id}|${m.kind}`, true);
  return {
    day, today: state.day, phase: day === state.day ? state.phase : day < state.day ? 'closed' : 'before',
    dayStatus: info.status, dayNote: info.note, isAssemblyDay: info.isAssemblyDay, isWorkDay: info.work,
    people: people.map((p) => ({
      ...p, must_assemble: !!p.must_assemble, short: shortOf(p),
      late: mk.has(`${p.id}|late`), no_signout: mk.has(`${p.id}|no_signout`),
    })),
  };
}

/** บันทึกสถานะให้หลายคน ช่วงวันที่ได้ (สูงสุด 31 วัน) — ข้ามวันหยุดอัตโนมัติ */
async function setStatus(actor, body, ip) {
  const { from, to = from, status } = body;
  checkDay(from); checkDay(to);
  if (from > to) throw new HttpError(400, 'ช่วงวันที่ไม่ถูกต้อง');
  const ids = [...new Set((Array.isArray(body.userIds) ? body.userIds : []).map(Number).filter(Boolean))];
  if (!ids.length) throw new HttpError(400, 'เลือกบุคลากรอย่างน้อย 1 คน');
  if (ids.length > 300) throw new HttpError(400, 'เลือกได้ครั้งละไม่เกิน 300 คน');
  if (status !== 'clear' && !HR_STATUSES.includes(status)) throw new HttpError(400, 'สถานะไม่ถูกต้อง');
  const leaveType = status === 'leave' ? body.leaveType : null;
  if (status === 'leave' && !LEAVE_TYPES[leaveType]) throw new HttpError(400, 'เลือกประเภทการลา');
  const note = String(body.note || '').trim().slice(0, 500);
  if (['official', 'policy'].includes(status) && !note) throw new HttpError(400, 'กรุณาระบุรายละเอียด เช่น ไปราชการที่ไหน / เลขที่คำสั่ง');
  const today = clock.bangkok().day;
  if (to > clock.addDays(today, MAX_AHEAD)) throw new HttpError(400, `บันทึกล่วงหน้าได้ไม่เกิน ${MAX_AHEAD} วัน`);
  if (status === 'present' && to > today) throw new HttpError(400, 'บันทึก "มา" ล่วงหน้าไม่ได้');

  const days = [];
  for (let d = from; d <= to; d = clock.addDays(d, 1)) {
    if (days.length > 31) throw new HttpError(400, 'ช่วงวันที่ยาวได้ไม่เกิน 31 วัน');
    if ((await workInfo(d)).work) days.push(d);
  }
  if (!days.length) throw new HttpError(400, 'ช่วงวันที่ที่เลือกไม่มีวันทำงาน');
  const users = await db.query('SELECT id FROM users WHERE id IN (?) AND active = 1', [ids]);
  if (users.length !== ids.length) throw new HttpError(404, 'พบบุคลากรบางคนไม่มีอยู่หรือถูกระงับ');

  let changed = 0;
  for (const day of days) {
    for (const userId of ids) {
      const existing = await attendance.findRecord(userId, day);
      if (status === 'clear') {
        // ล้างได้เฉพาะรายการที่งานบุคลากรบันทึก — การเช็กชื่อของเจ้าตัว/งานกิจกรรมไม่ถูกลบ
        if (existing && existing.method === 'hr') {
          await db.query('DELETE FROM attendance WHERE id = ?', [existing.id]);
          await db.query(
            `INSERT INTO attendance_events (attendance_id, user_id, day, action, old_status, new_status, method, actor_id, reason, ip)
             VALUES (?, ?, ?, 'update', ?, 'cleared', 'hr', ?, ?, ?)`,
            [existing.id, userId, day, existing.status, actor.id, note || 'ล้างสถานะ', ip || null]);
          changed += 1;
        }
        continue;
      }
      if (existing && existing.status === status && (existing.leave_type || null) === leaveType && existing.note === note) continue;
      await attendance.upsert({
        userId, day, actorId: actor.id, reason: note, ip,
        fields: { status, leave_type: leaveType, method: 'hr', note, flagged: false, flag_reason: '' },
        detail: { by_role: actor.role, hr: true, leave_type: leaveType },
      });
      changed += 1;
    }
  }
  return { ok: true, changed, days };
}

async function setMarks(actor, day, kind, userIds) {
  checkDay(day);
  if (!MARK_KINDS[kind]) throw new HttpError(400, 'ประเภทไม่ถูกต้อง');
  if (day > clock.bangkok().day) throw new HttpError(400, 'บันทึกล่วงหน้าไม่ได้');
  const ids = [...new Set((Array.isArray(userIds) ? userIds : []).map(Number).filter(Boolean))];
  await db.transaction(async (t) => {
    await t.query('DELETE FROM hr_marks WHERE day = ? AND kind = ?', [day, kind]);
    for (const id of ids) await t.query('INSERT INTO hr_marks (day, user_id, kind, created_by) VALUES (?, ?, ?, ?)', [day, id, kind, actor.id]);
  });
  return { ok: true, count: ids.length };
}

async function setStaffType(userId, code) {
  if (code !== null && code !== '' && !BY_CODE.has(code)) throw new HttpError(400, 'ประเภทบุคลากรไม่ถูกต้อง');
  const r = await db.query('UPDATE users SET staff_type = ?, staff_type_demo = 0 WHERE id = ?', [code || null, Number(userId)]);
  if (!r.affectedRows) throw new HttpError(404, 'ไม่พบผู้ใช้');
}

/**
 * ข้อมูลแบบสรุปการปฏิบัติงานประจำวัน (ตรึงลงเอกสาร)
 * คืน { snapshot, warnings } — warnings ใช้แสดงก่อนสร้าง ไม่อยู่ในเอกสาร
 */
async function dailySummary(day) {
  checkDay(day);
  const s = await settings.getAll();
  const info = await workInfo(day);
  const state = await schedule.windowState();
  if (day > state.day) throw new HttpError(400, 'สร้างรายงานล่วงหน้าไม่ได้');
  const warnings = [];
  if (!info.work) warnings.push(`วันที่เลือกเป็นวันหยุด (${info.note || info.status})`);

  const people = await db.query(
    `SELECT u.id, u.full_name, u.position_title, u.staff_type, u.staff_type_demo, u.must_assemble, u.role,
            a.status, a.leave_type, a.note, a.is_demo
       FROM users u LEFT JOIN attendance a ON a.user_id = u.id AND a.day = ?
      WHERE u.active = 1`, [day]);
  const counted = people.filter((p) => p.staff_type && BY_CODE.has(p.staff_type));
  const unclassified = people.filter((p) => !p.staff_type && p.role !== 'admin');
  if (unclassified.length) warnings.push(`ยังไม่กำหนดประเภทบุคลากร ${unclassified.length} คน — ไม่ถูกนับในข้อ 1`);

  // ข้อ 1 จำนวนบุคลากรตามประเภท
  const n = (code) => counted.filter((p) => p.staff_type === code).length;
  const counts = [];
  for (const t of STAFF_TYPES) {
    if (t.group) {
      if (!counts.some((c) => c.group === t.group)) {
        const items = STAFF_TYPES.filter((x) => x.group === t.group).map((x) => ({ no: x.no, label: x.label, count: n(x.code) }));
        counts.push({ no: GROUPS[t.group].no, label: GROUPS[t.group].label, group: t.group, count: items.reduce((a, x) => a + x.count, 0), items });
      }
    } else counts.push({ no: t.no, label: t.label, count: n(t.code) });
  }
  const total = counted.length;

  const item = (p) => ({ name: p.full_name, type: shortOf(p), note: p.note || '' });
  const list = (filter) => people.filter(filter).sort(byType).map(item);
  const official = list((p) => p.status === 'official');
  const policy = list((p) => p.status === 'policy');
  const leave = {
    sick: list((p) => p.status === 'leave' && p.leave_type === 'sick'),
    personal: list((p) => p.status === 'leave' && p.leave_type === 'personal'),
    other: list((p) => p.status === 'leave' && !['sick', 'personal'].includes(p.leave_type)),
  };
  const leaveCount = leave.sick.length + leave.personal.length + leave.other.length;

  // ข้อ 5 ผู้ไม่เข้ากิจกรรมหน้าเสาธง (เฉพาะวันที่มีกิจกรรม และปิดการเช็กชื่อแล้ว)
  let assembly;
  if (!info.isAssemblyDay) {
    assembly = { held: false, reason: info.status === 'cancelled' ? `งดกิจกรรมหน้าเสาธง${info.note ? ` (${info.note})` : ''}` : 'ไม่มีกิจกรรมหน้าเสาธง', list: [] };
  } else {
    if (day === state.day && state.phase !== 'closed') {
      throw new HttpError(409, `ยังไม่ปิดการเช็กชื่อเข้าแถวของวันนี้ (ปิด ${state.closeTime} น.) — สร้างรายงานได้หลังปิดเช็กชื่อ`, 'NOT_CLOSED');
    }
    const notJoined = people.filter((p) => p.must_assemble && (!p.status || ['absent', 'pending'].includes(p.status))).sort(byType);
    const pending = notJoined.filter((p) => p.status === 'pending').length;
    if (pending) warnings.push(`มีคำขอรอตรวจสอบ ${pending} คน — นับเป็นผู้ไม่เข้ากิจกรรมจนกว่างานกิจกรรมจะอนุมัติ`);
    assembly = { held: true, list: notJoined.map((p) => ({ ...item(p), note: p.status === 'pending' ? 'รอตรวจสอบ' : '' })) };
  }

  const marks = await db.query(
    `SELECT m.kind, m.is_demo, u.full_name, u.position_title, u.staff_type, m.note FROM hr_marks m JOIN users u ON u.id = m.user_id WHERE m.day = ?`, [day]);
  const markList = (kind) => marks.filter((m) => m.kind === kind).sort(byType).map(item);

  const [y, m, d] = day.split('-').map(Number);
  const weekday = TH_WEEKDAY[clock.weekdayOf(day)];
  const snapshot = {
    kind: 'hr_daily',
    title: s.report_form_title,
    collegeName: s.college_name,
    day,
    dateText: `ประจำวัน${weekday} ที่ ${d} ${require('./thaiDate').MONTHS[m - 1]} พ.ศ. ${y + 543}`,
    counts, total,
    official, leave, leaveCount, policy, assembly,
    late: markList('late'), noSignout: markList('no_signout'),
    worked: total - counted.filter((p) => p.status === 'leave').length,
    notWorked: counted.filter((p) => p.status === 'leave').length,
    demo: people.some((p) => p.is_demo) || marks.some((m) => m.is_demo) || counted.some((p) => p.staff_type_demo),
    generatedAt: clock.now().toISOString(),
  };
  return { snapshot, warnings, unclassified: unclassified.map((p) => ({ id: p.id, full_name: p.full_name })) };
}

module.exports = { dayView, setStatus, setMarks, setStaffType, dailySummary, workInfo, LEAVE_TYPES, MARK_KINDS, HR_STATUSES };
