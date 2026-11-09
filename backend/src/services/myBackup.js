/**
 * สำรองข้อมูลระดับผู้ใช้: ดาวน์โหลด Excel เฉพาะ "งานของตนเอง" ตามบทบาท (เปิดอ่านได้ทันที ไม่ต้องใช้ผู้ดูแลระบบ)
 *   เจ้าหน้าที่บุคลากร : สถานะลา/ราชการ/นโยบาย · มาสาย/ไม่ลงเวลากลับ · ประเภทบุคลากร · รายงานสรุปประจำวัน + สรุปร้อยละ
 *   งานกิจกรรม        : บันทึกการเข้าแถวทุกรายการ · ปฏิทิน + สรุปร้อยละ
 *   ผู้บริหาร          : สรุปร้อยละทุกรูปแบบ · เอกสารที่ลงนาม
 *   หัวหน้าแผนก        : สรุปร้อยละของแผนกตนเอง
 *   ผู้ดูแลระบบ        : ทุกแผ่นงานข้างต้น
 * การสำรองทั้งระบบเพื่อกู้คืน อยู่ที่หน้าผู้ดูแล (สำรองฐานข้อมูล)
 */
const ExcelJS = require('exceljs');
const db = require('../db');
const clock = require('../clock');
const reports = require('./reports');
const exporter = require('./exporter');
const { reportScope } = require('./permissions');
const { BY_CODE } = require('./staffTypes');
const { HttpError } = require('../middleware/auth');

const ROLES = ['hr', 'activity', 'executive', 'dept_head', 'admin'];
const LEAVE = { sick: 'ลาป่วย', personal: 'ลากิจ', other: 'ลาอื่น ๆ' };
const DOC_STATUS = { pending: 'รอลงนาม', approved: 'อนุมัติแล้ว', returned: 'ส่งกลับแก้ไข' };
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** แผ่นงานที่บทบาทนี้ได้รับ (ใช้แสดงในหน้าเว็บก่อนดาวน์โหลดด้วย) */
function contents(role) {
  const summary = ['ภาพรวม', 'รายบุคคล', 'รายแผนก', 'รายหน่วยงาน', 'รายวัน'];
  return {
    hr: ['สถานะลา-ราชการ-นโยบาย', 'มาสาย-ไม่ลงเวลากลับ', 'ประเภทบุคลากร', 'รายงานสรุปประจำวัน', ...summary],
    activity: ['บันทึกการเข้าแถว', 'ปฏิทิน', ...summary],
    executive: [...summary, 'เอกสารเสนอลงนาม'],
    dept_head: summary,
    admin: ['สถานะลา-ราชการ-นโยบาย', 'มาสาย-ไม่ลงเวลากลับ', 'ประเภทบุคลากร', 'รายงานสรุปประจำวัน', 'บันทึกการเข้าแถว', 'ปฏิทิน', ...summary, 'เอกสารเสนอลงนาม'],
  }[role] || null;
}

const t = (v) => (v ? `${clock.bangkok(new Date(v)).day} ${clock.bangkok(new Date(v)).time.slice(0, 5)}` : '');

async function hrSheets(wb, from, to) {
  const st = await db.query(
    `SELECT a.day, u.employee_code, u.full_name, u.staff_type, COALESCE(d.name, '') AS department, a.status, a.leave_type,
            a.note, a.method, cb.full_name AS by_name, a.checked_at
       FROM attendance a JOIN users u ON u.id = a.user_id LEFT JOIN departments d ON d.id = u.department_id
       JOIN users cb ON cb.id = a.checked_by
      WHERE a.day BETWEEN ? AND ? AND a.status IN ('official','policy','leave') ORDER BY a.day, u.full_name`, [from, to]);
  exporter.sheet(wb, 'สถานะลา-ราชการ-นโยบาย', [
    ['day', 'วันที่', 12], ['employee_code', 'รหัส', 10], ['full_name', 'ชื่อ-สกุล', 28], ['type', 'ประเภทบุคลากร', 20],
    ['department', 'แผนก/งาน', 26], ['status', 'สถานะ', 16], ['note', 'รายละเอียด', 34], ['by_name', 'ผู้บันทึก', 24], ['at', 'บันทึกเมื่อ', 18],
  ], st.map((r) => ({
    ...r, type: BY_CODE.get(r.staff_type)?.short || '', at: t(r.checked_at),
    status: r.status === 'leave' ? LEAVE[r.leave_type] || 'ลา' : exporter.STATUS[r.status],
  })));
  const marks = await db.query(
    `SELECT m.day, m.kind, u.employee_code, u.full_name, u.staff_type, cb.full_name AS by_name, m.created_at
       FROM hr_marks m JOIN users u ON u.id = m.user_id JOIN users cb ON cb.id = m.created_by
      WHERE m.day BETWEEN ? AND ? ORDER BY m.day, m.kind, u.full_name`, [from, to]);
  exporter.sheet(wb, 'มาสาย-ไม่ลงเวลากลับ', [
    ['day', 'วันที่', 12], ['kind', 'รายการ', 26], ['employee_code', 'รหัส', 10], ['full_name', 'ชื่อ-สกุล', 28],
    ['type', 'ประเภทบุคลากร', 20], ['by_name', 'ผู้บันทึก', 24], ['at', 'บันทึกเมื่อ', 18],
  ], marks.map((r) => ({ ...r, kind: r.kind === 'late' ? 'มาลงเวลาเกินเวลากำหนด' : 'ไม่ลงเวลากลับ', type: BY_CODE.get(r.staff_type)?.short || '', at: t(r.created_at) })));
  const people = await db.query(
    `SELECT u.employee_code, u.full_name, u.position_title, u.staff_type, COALESCE(d.name, '') AS department, u.active
       FROM users u LEFT JOIN departments d ON d.id = u.department_id WHERE u.role <> 'admin' OR u.staff_type IS NOT NULL
      ORDER BY u.full_name`);
  exporter.sheet(wb, 'ประเภทบุคลากร', [
    ['employee_code', 'รหัส', 10], ['full_name', 'ชื่อ-สกุล', 30], ['position_title', 'ตำแหน่ง', 22], ['no', 'ข้อ', 7],
    ['type', 'ประเภทบุคลากร', 34], ['department', 'แผนก/งาน', 28], ['state', 'สถานะบัญชี', 12],
  ], people.map((p) => ({ ...p, no: BY_CODE.get(p.staff_type)?.no || '', type: BY_CODE.get(p.staff_type)?.label || 'ยังไม่กำหนด', state: p.active ? 'ใช้งาน' : 'ระงับ' })));
}

async function docsSheet(wb, from, to, title, kind) {
  const docs = await db.query(
    `SELECT r.id, r.kind, r.title, r.period_from, r.status, r.current_step, r.steps, r.created_at, u.full_name AS creator,
            (SELECT GROUP_CONCAT(CONCAT(s.step, ':', su.full_name) ORDER BY s.step SEPARATOR ' · ') FROM report_signatures s
              JOIN users su ON su.id = s.signer_id WHERE s.doc_id = r.id AND s.action = 'sign') AS signed
       FROM report_docs r JOIN users u ON u.id = r.created_by
      WHERE r.period_from BETWEEN ? AND ?${kind ? ' AND r.kind = ?' : ''} ORDER BY r.period_from, r.id`, kind ? [from, to, kind] : [from, to]);
  exporter.sheet(wb, title, [
    ['id', 'เลขที่', 8], ['period_from', 'ประจำวันที่', 12], ['title', 'ชื่อเอกสาร', 60], ['status', 'สถานะ', 14],
    ['signed', 'ลงนามแล้ว (ลำดับ:ผู้ลงนาม)', 50], ['creator', 'ผู้สร้าง', 24], ['at', 'สร้างเมื่อ', 18],
  ], docs.map((d) => ({ ...d, status: DOC_STATUS[d.status] || d.status, signed: d.signed || '-', at: t(d.created_at) })));
}

async function activitySheets(wb, from, to) {
  const rows = await db.query(
    `SELECT a.day, u.employee_code, u.full_name, COALESCE(d.name, '') AS department, a.status, a.leave_type, a.method,
            a.checked_at, cb.full_name AS by_name, a.distance_m, a.flagged, a.flag_reason, a.note, a.is_demo
       FROM attendance a JOIN users u ON u.id = a.user_id LEFT JOIN departments d ON d.id = u.department_id
       JOIN users cb ON cb.id = a.checked_by
      WHERE a.day BETWEEN ? AND ? ORDER BY a.day, d.name, u.full_name`, [from, to]);
  if (rows.length > 200000) throw new HttpError(400, 'ข้อมูลมากเกินไป กรุณาเลือกช่วงวันที่สั้นลง');
  exporter.sheet(wb, 'บันทึกการเข้าแถว', [
    ['day', 'วันที่', 12], ['employee_code', 'รหัส', 10], ['full_name', 'ชื่อ-สกุล', 28], ['department', 'แผนก', 24],
    ['status', 'สถานะ', 14], ['method', 'วิธี', 20], ['at', 'เวลา', 18], ['by_name', 'ผู้บันทึก', 24],
    ['distance_m', 'ระยะ (ม.)', 10], ['flag', 'ติดธง', 28], ['note', 'หมายเหตุ', 30], ['demo', 'ข้อมูลจำลอง', 12],
  ], rows.map((r) => ({
    ...r, status: r.status === 'leave' ? LEAVE[r.leave_type] || 'ลา' : exporter.STATUS[r.status], method: exporter.METHOD[r.method] || r.method,
    at: t(r.checked_at), flag: r.flagged ? r.flag_reason || 'ใช่' : '', demo: r.is_demo ? 'ใช่' : '',
  })));
  const cal = await db.query('SELECT day, status, note FROM assembly_days WHERE day BETWEEN ? AND ? ORDER BY day', [from, to]);
  const DAY = { normal: 'มีเข้าแถว', special: 'กิจกรรมพิเศษ', cancelled: 'งดเข้าแถว', holiday: 'วันหยุด', public_holiday: 'วันหยุดนักขัตฤกษ์' };
  exporter.sheet(wb, 'ปฏิทิน', [['day', 'วันที่', 12], ['status', 'ประเภท', 22], ['note', 'หมายเหตุ', 40]], cal.map((c) => ({ ...c, status: DAY[c.status] || c.status })));
}

async function workbook(user, { from, to }) {
  if (!ROLES.includes(user.role)) throw new HttpError(403, 'บทบาทนี้ไม่มีข้อมูลงานให้สำรอง');
  if (!DATE.test(from || '') || !DATE.test(to || '') || from > to) throw new HttpError(400, 'ช่วงวันที่ไม่ถูกต้อง');
  if ((Date.parse(to) - Date.parse(from)) / 86400_000 > 400) throw new HttpError(400, 'ช่วงวันที่ยาวได้ไม่เกิน 400 วัน');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ระบบเช็กชื่อเข้าแถว';
  const about = wb.addWorksheet('เกี่ยวกับไฟล์นี้');
  about.columns = [{ width: 24 }, { width: 70 }];
  const now = clock.bangkok(clock.now());
  [
    ['สำรองข้อมูลงานของ', `${user.full_name} (${user.employee_code})`],
    ['ช่วงวันที่', `${require('./thaiDate').range(from, to)}`],
    ['สร้างเมื่อ', `${now.day} ${now.time.slice(0, 5)} น.`],
    ['แผ่นงาน', contents(user.role).join(' · ')],
    ['หมายเหตุ', 'ไฟล์นี้มีข้อมูลส่วนบุคคล เก็บรักษาตามนโยบาย PDPA ของวิทยาลัย · ใช้เปิดอ่าน/ทำรายงานต่อ (การกู้คืนทั้งระบบใช้ไฟล์สำรองของผู้ดูแลระบบ)'],
  ].forEach((r) => about.addRow(r));
  about.getColumn(1).font = { bold: true };

  const role = user.role;
  if (['hr', 'admin'].includes(role)) await hrSheets(wb, from, to);
  if (['hr', 'admin'].includes(role)) await docsSheet(wb, from, to, 'รายงานสรุปประจำวัน', 'hr_daily');
  if (['activity', 'admin'].includes(role)) await activitySheets(wb, from, to);
  const scope = reportScope(user);
  if (scope) exporter.addSummarySheets(wb, await reports.summary({ from, to, scope }));
  if (['executive', 'admin'].includes(role)) await docsSheet(wb, from, to, 'เอกสารเสนอลงนาม');
  return wb;
}

module.exports = { workbook, contents, ROLES };
