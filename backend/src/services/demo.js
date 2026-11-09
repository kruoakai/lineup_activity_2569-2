const db = require('../db');
const clock = require('../clock');
const schedule = require('./schedule');
const files = require('./files');

// ข้อมูลจำลองสำหรับฝึกใช้งานและทดลองดูรายงาน — ทุกแถวมี is_demo = 1 ลบออกได้ทั้งหมดโดยไม่กระทบข้อมูลจริง

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
function weighted(pairs) {
  let r = Math.random() * pairs.reduce((a, [, w]) => a + w, 0);
  for (const [v, w] of pairs) { r -= w; if (r <= 0) return v; }
  return pairs[pairs.length - 1][0];
}

async function status() {
  const [d] = await db.query('SELECT COUNT(*) AS n, MIN(day) AS from_day, MAX(day) AS to_day FROM attendance WHERE is_demo = 1');
  const [r] = await db.query('SELECT COUNT(*) AS n FROM attendance WHERE is_demo = 0');
  const [m] = await db.query('SELECT COUNT(*) AS n FROM hr_marks WHERE is_demo = 1');
  const [t] = await db.query('SELECT COUNT(*) AS n FROM users WHERE staff_type_demo = 1');
  const [u] = await db.query("SELECT COUNT(*) AS n FROM users WHERE active = 1 AND staff_type IS NULL AND role <> 'admin'");
  return { demoRows: d.n, demoFrom: d.from_day, demoTo: d.to_day, realRows: r.n, demoMarks: m.n, demoStaffTypes: t.n, unclassified: u.n };
}

// ---------- งานบุคลากร ----------
const NOTES = {
  official: ['ประชุมที่สำนักงานคณะกรรมการการอาชีวศึกษา', 'อบรมพัฒนาครูตามคำสั่งวิทยาลัย', 'นำนักเรียนแข่งขันทักษะวิชาชีพ ระดับภาค',
    'ติดต่อราชการที่สำนักงานจังหวัดชัยภูมิ', 'นิเทศนักศึกษาฝึกงานในสถานประกอบการ', 'ประชุมเครือข่ายอาชีวศึกษาภาคตะวันออกเฉียงเหนือ'],
  policy: ['ประชุมคณะกรรมการตามนโยบายวิทยาลัย', 'ปฏิบัติงานโครงการอาชีวะอาสา', 'ออกหน่วยบริการ Fix It Center', 'ประชาสัมพันธ์รับสมัครนักศึกษา'],
  sick: ['ไข้หวัด', 'พบแพทย์ตามนัด', 'ปวดท้อง', ''],
  personal: ['ธุระส่วนตัว', 'ติดต่อราชการส่วนตัว', 'งานบุญของครอบครัว', ''],
  other: ['ลาพักผ่อน', 'ลาคลอดบุตร', 'ลาอุปสมบท'],
};

// ประเภทบุคลากรตัวอย่าง (ใช้กับคนที่ยังไม่กำหนดเท่านั้น และลบได้พร้อมข้อมูลจำลอง)
function guessStaffType(u) {
  const dept = u.department || '';
  if (u.role === 'executive' || /ผู้อำนวยการ/.test(u.position_title || '') || dept === 'วิทยาลัยเทคนิคชัยภูมิ') return 'executive';
  if (/อาคารสถานที่|ยานพาหนะ/.test(dept)) return weighted([['temp_janitor', 6], ['temp_guard', 2], ['temp_driver', 2]]);
  if (/^งาน/.test(dept)) return weighted([['temp_officer', 45], ['gov_teacher', 35], ['gov_emp_general', 15], ['gov_38c2', 5]]);
  return weighted([['gov_teacher', 55], ['temp_teacher', 25], ['gov_emp_teacher', 10], ['assistant_teacher', 7], ['gov_38c2', 3]]);
}

async function demoStaffTypes() {
  const users = await db.query(
    `SELECT u.id, u.role, u.position_title, d.name AS department FROM users u LEFT JOIN departments d ON d.id = u.department_id
      WHERE u.active = 1 AND u.staff_type IS NULL AND u.role <> 'admin'`);
  for (const u of users) await db.query('UPDATE users SET staff_type = ?, staff_type_demo = 1 WHERE id = ?', [guessStaffType(u), u.id]);
  return users.length;
}

/**
 * สร้างข้อมูลจำลองย้อนหลัง `weeks` สัปดาห์ (ถึงเมื่อวาน) ให้บุคลากรทุกคนที่ต้องเข้าแถว
 * ไม่ทับวันที่มีข้อมูลจริงอยู่แล้ว
 */
async function simulate({ weeks = 4, staffTypes = true } = {}) {
  const w = Math.min(Math.max(Number(weeks) || 4, 1), 20);
  const today = clock.bangkok().day;
  const to = clock.addDays(today, -1);
  const from = clock.addDays(today, -7 * w);
  const days = await schedule.assemblyDaysBetween(from, to);
  const users = await db.query(
    `SELECT u.id, u.department_id, COALESCE(u.report_group, d.report_group, d.name, '') AS grp
       FROM users u LEFT JOIN departments d ON d.id = u.department_id
      WHERE u.active = 1 AND u.must_assemble = 1`,
  );
  if (!users.length || !days.length) return { inserted: 0, days: days.length, users: users.length, from, to };
  const managers = (await db.query("SELECT id FROM users WHERE active = 1 AND role IN ('activity','admin')")).map((r) => r.id);
  // สถานะลา/ราชการ/นโยบาย บันทึกโดยเจ้าหน้าที่บุคลากร (ถ้ามี)
  // เจ้าหน้าที่บุคลากรเป็นผู้บันทึก (ถ้าไม่มี ใช้ผู้ดูแลระบบ)
  const hrRows = await db.query("SELECT id, role FROM users WHERE active = 1 AND role IN ('hr','admin') ORDER BY role = 'admin', id");
  const hrOnly = hrRows.filter((r) => r.role === 'hr').map((r) => r.id);
  const hrStaff = hrOnly.length ? hrOnly : hrRows.map((r) => r.id);
  const typed = staffTypes ? await demoStaffTypes() : 0;
  const existing = new Set((await db.query('SELECT user_id, day FROM attendance WHERE day BETWEEN ? AND ?', [from, to]))
    .map((r) => `${r.user_id}|${r.day}`));

  // แต่ละหน่วยงานมีระดับการเข้าร่วมต่างกัน รายงานจะได้เห็นความแตกต่าง
  const groupRate = new Map();
  for (const u of users) if (!groupRate.has(u.grp)) groupRate.set(u.grp, weighted([[1, 3], [0.97, 4], [0.93, 3], [0.88, 2], [0.8, 1]]));
  const byDept = new Map();
  for (const u of users) { if (!byDept.has(u.department_id)) byDept.set(u.department_id, []); byDept.get(u.department_id).push(u.id); }
  // วันที่คนมาน้อยกว่าปกติ (เช่น วันศุกร์ฝนตก)
  const dayFactor = new Map(days.map((d) => [d, Math.random() < 0.15 ? 0.93 : 1]));

  const rows = [];
  const marks = [];
  for (const d of days) {
    for (const u of users) {
      if (existing.has(`${u.id}|${d}`)) continue;
      const p = groupRate.get(u.grp) * dayFactor.get(d);
      let st;
      if (Math.random() < p) st = 'present';
      else st = weighted([['absent', 50], ['official', 25], ['policy', 12], ['leave', 13]]);
      if (st === 'absent') continue; // ขาด = ไม่มีบันทึก (ระบบนับให้เอง)
      let method = 'hr';
      let by = hrStaff.length ? pick(hrStaff) : managers.length ? pick(managers) : u.id;
      let leaveType = null;
      if (st === 'leave') leaveType = weighted([['sick', 55], ['personal', 35], ['other', 10]]);
      let distance = null;
      let inZone = null;
      let qrOk = 0;
      if (st === 'present') {
        method = weighted([['self_gps', 80], ['self_qr', 12], ['proxy_dept', 5], ['proxy_activity', 3]]);
        if (method === 'self_gps' || method === 'self_qr') { by = u.id; distance = 5 + Math.floor(Math.random() * 130); inZone = 1; qrOk = method === 'self_qr' ? 1 : 0; }
        if (method === 'proxy_dept') { const mates = (byDept.get(u.department_id) || []).filter((x) => x !== u.id); by = mates.length ? pick(mates) : u.id; }
      }
      const sec = 7 * 3600 + 30 * 60 + Math.floor(Math.random() * 55 * 60);
      const at = new Date(`${d}T00:00:00+07:00`).getTime() + sec * 1000;
      const flagged = st === 'present' && method.startsWith('self') && Math.random() < 0.01;
      const note = st === 'present' ? '' : pick(NOTES[leaveType || st]);
      rows.push([u.id, d, st, leaveType, method, by, new Date(at), distance, inZone, qrOk, note, flagged ? 1 : 0,
        flagged ? 'อุปกรณ์เดียวกันถูกใช้เช็กชื่อหลายบัญชี' : '', 1]);
      // ผู้มาลงเวลาเกินเวลากำหนด / ไม่ลงเวลากลับ (ข้อมูลจากเครื่องลงเวลา) เฉพาะคนที่มาทำงาน
      if (st === 'present' && hrStaff.length) {
        if (Math.random() < 0.04) marks.push([d, u.id, 'late', hrStaff[0], 1]);
        if (Math.random() < 0.02) marks.push([d, u.id, 'no_signout', hrStaff[0], 1]);
      }
    }
  }
  for (let i = 0; i < rows.length; i += 500) {
    await db.query(
      `INSERT INTO attendance (user_id, day, status, leave_type, method, checked_by, checked_at, distance_m, in_zone, qr_ok, note, flagged, flag_reason, is_demo)
       VALUES ?`,
      [rows.slice(i, i + 500)],
    );
  }
  for (let i = 0; i < marks.length; i += 500) {
    await db.query('INSERT IGNORE INTO hr_marks (day, user_id, kind, created_by, is_demo) VALUES ?', [marks.slice(i, i + 500)]);
  }
  await db.query('DELETE FROM attendance_events WHERE is_demo = 1');
  await db.query(
    `INSERT INTO attendance_events (attendance_id, user_id, day, action, new_status, method, actor_id, reason, is_demo, created_at)
     SELECT id, user_id, day, 'create', status, method, checked_by, 'ข้อมูลจำลอง', 1, checked_at FROM attendance WHERE is_demo = 1`,
  );
  return { inserted: rows.length, marks: marks.length, staffTypes: typed, days: days.length, users: users.length, from, to };
}

async function clearDemo() {
  await db.query('DELETE FROM hr_marks WHERE is_demo = 1');
  await db.query('UPDATE users SET staff_type = NULL, staff_type_demo = 0 WHERE staff_type_demo = 1');
  await db.query('DELETE FROM attendance_events WHERE is_demo = 1');
  const r = await db.query('DELETE FROM attendance WHERE is_demo = 1');
  await db.query('DELETE FROM report_docs WHERE is_demo = 1');
  return { removed: r.affectedRows };
}

// เริ่มใช้งานจริง: ล้างข้อมูลการเข้าแถว รูป และเอกสารรายงานทั้งหมด (ผู้ใช้ แผนก และค่าระบบยังอยู่)
async function resetAll() {
  const photos = await db.query('SELECT path FROM attendance_photos');
  for (const p of photos) await files.removeUpload(p.path);
  await db.query('DELETE FROM attendance_photos');
  await db.query('DELETE FROM attendance_events');
  const r = await db.query('DELETE FROM attendance');
  const sigs = await db.query('SELECT signature_path FROM report_signatures WHERE signature_path IS NOT NULL');
  for (const s of sigs) await files.removeUpload(s.signature_path);
  await db.query('DELETE FROM report_signatures');
  await db.query('DELETE FROM report_docs');
  await db.query('DELETE FROM hr_marks');
  await db.query('UPDATE users SET staff_type = NULL, staff_type_demo = 0 WHERE staff_type_demo = 1');
  return { removed: r.affectedRows, photos: photos.length };
}

module.exports = { status, simulate, clearDemo, resetAll };
