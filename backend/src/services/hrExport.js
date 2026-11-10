/**
 * ส่งออก "รายงานสรุปการปฏิบัติงานประจำวัน" (งานบุคลากร) เป็น Excel
 * - รายวัน: ชีตรูปแบบเดียวกับเอกสาร + ชีตรายชื่อ (กรองได้)
 * - ช่วงวันที่ (สูงสุด 31 วัน): ชีตสรุปรายวัน 1 แถวต่อวัน + ชีตรายชื่อทุกวัน
 * ค่าทุกช่องเป็นข้อความ/ตัวเลข ไม่ใช่สูตร
 */
const ExcelJS = require('exceljs');
const clock = require('../clock');
const hr = require('./hr');
const { sheet } = require('./exporter');
const { HttpError } = require('../middleware/auth');

/** หมวดรายชื่อของรายงาน → [{ section, name, type, note }] */
function listRows(s) {
  const out = [];
  const push = (section, list) => list.forEach((p, i) => out.push({ day: s.day, section, no: i + 1, name: p.name, type: p.type, note: p.note }));
  push('2. ไปราชการ', s.official);
  push('3.1 ลาป่วย', s.leave.sick);
  push('3.2 ลากิจ', s.leave.personal);
  push('3.3 ลาอื่น ๆ', s.leave.other);
  push('4. ไปปฏิบัติงานตามนโยบาย', s.policy);
  push('5. ผู้ไม่เข้ากิจกรรมหน้าเสาธง', s.assembly.list);
  push('6. ผู้มาลงเวลาเกินเวลากำหนด', s.late);
  push('7. ผู้ไม่ลงเวลากลับ', s.noSignout);
  return out;
}

function paperSheet(wb, s, name = 'รายงานประจำวัน') {
  const ws = wb.addWorksheet(name.slice(0, 31));
  ws.columns = [{ width: 8 }, { width: 46 }, { width: 22 }, { width: 40 }, { width: 10 }];
  const add = (vals, style = {}) => {
    const r = ws.addRow(vals);
    if (style.bold) r.font = { bold: true, ...(style.size ? { size: style.size } : {}) };
    return r;
  };
  add(['', s.collegeName], { bold: true, size: 14 });
  add(['', s.title], { bold: true, size: 13 });
  add(['', s.dateText], { bold: true });
  if (s.demo) add(['', '(มีข้อมูลจำลอง — ใช้ฝึกใช้งานเท่านั้น)']);
  add([]);
  add(['1.', 'จำนวนข้าราชการ และบุคลากรทางการศึกษา', '', '', 'คน'], { bold: true });
  for (const c of s.counts) {
    add([c.no, c.label, '', '', c.count]);
    for (const x of c.items || []) add(['', `   ${x.no} ${x.label}`, '', '', x.count]);
  }
  add(['', 'รวมทั้งสิ้น', '', '', s.total], { bold: true });
  const section = (no, title, list, empty) => {
    add([]);
    add([no, title, '', '', list ? list.length : '-'], { bold: true });
    if (!list || !list.length) { add(['', empty || '-']); return; }
    list.forEach((p, i) => add([`${no.replace(/\.$/, '')}.${i + 1}`, p.name, p.type, p.note]));
  };
  section('2.', 'ไปราชการ', s.official);
  add([]);
  add(['3.', 'ลา', '', '', s.leaveCount], { bold: true });
  for (const [no, label, list] of [['3.1', 'ลาป่วย', s.leave.sick], ['3.2', 'ลากิจ', s.leave.personal], ['3.3', 'ลาอื่น ๆ', s.leave.other]]) {
    if (no === '3.3' && !list.length) continue;
    add([no, label, '', '', list.length], { bold: true });
    list.forEach((p, i) => add([`${no}.${i + 1}`, p.name, p.type, p.note]));
  }
  section('4.', 'ไปปฏิบัติงานตามนโยบาย', s.policy);
  section('5.', 'ผู้ไม่เข้ากิจกรรมหน้าเสาธง', s.assembly.held ? s.assembly.list : null, s.assembly.reason);
  section('6.', 'ผู้มาลงเวลาเกินเวลากำหนด', s.late);
  section('7.', 'ผู้ไม่ลงเวลากลับ', s.noSignout);
  add([]);
  add(['', 'ผู้มาปฏิบัติงาน', '', '', s.worked], { bold: true });
  add(['', 'ผู้ไม่มาปฏิบัติงาน', '', '', s.notWorked], { bold: true });
  ws.getColumn(5).alignment = { horizontal: 'right' };
  return ws;
}

const LIST_COLS = [['day', 'วันที่', 12], ['section', 'หมวด', 30], ['no', 'ลำดับ', 7], ['name', 'ชื่อ-สกุล', 32], ['type', 'ประเภท', 20], ['note', 'หมายเหตุ / รายละเอียด', 44]];

function exportedAt() {
  const b = clock.bangkok(clock.now());
  return `${b.day} ${b.time.slice(0, 5)} น.`;
}

/** รายงานวันเดียว (จากข้อมูลปัจจุบัน หรือ snapshot ของเอกสาร) */
function dailyWorkbook(snapshot) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ระบบเช็กชื่อเข้าแถว';
  const ws = paperSheet(wb, snapshot);
  ws.addRow([]);
  ws.addRow(['', `ส่งออกเมื่อ ${exportedAt()}`]).font = { italic: true, color: { argb: 'FF8A94A3' } };
  sheet(wb, 'รายชื่อ', LIST_COLS, listRows(snapshot));
  return wb;
}

/** สรุปช่วงวันที่ — วันหยุดถูกข้าม · วันที่ยังไม่ปิดเช็กชื่อ ข้อ 5 แสดง "ยังไม่ปิด" */
async function rangeWorkbook(from, to) {
  const DATE = /^\d{4}-\d{2}-\d{2}$/;
  if (!DATE.test(from) || !DATE.test(to) || from > to) throw new HttpError(400, 'ช่วงวันที่ไม่ถูกต้อง');
  const today = clock.bangkok().day;
  const end = to > today ? today : to;
  const snaps = [];
  let n = 0;
  for (let d = from; d <= end; d = clock.addDays(d, 1)) {
    if ((n += 1) > 31) throw new HttpError(400, 'ส่งออกได้ครั้งละไม่เกิน 31 วัน');
    if (!(await hr.workInfo(d)).work) continue;
    try {
      snaps.push((await hr.dailySummary(d)).snapshot);
    } catch (e) {
      if (e.code !== 'NOT_CLOSED') throw e;
      snaps.push({ day: d, open: true });
    }
  }
  if (!snaps.length) throw new HttpError(400, 'ช่วงวันที่ที่เลือกไม่มีวันทำงาน');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ระบบเช็กชื่อเข้าแถว';
  const done = snaps.filter((s) => !s.open);
  sheet(wb, 'สรุปรายวัน', [
    ['day', 'วันที่', 12], ['dateText', 'วัน', 36], ['total', 'บุคลากรรวม', 11], ['official', 'ไปราชการ', 10], ['leave', 'ลา', 8],
    ['sick', 'ลาป่วย', 8], ['personal', 'ลากิจ', 8], ['policy', 'งานนโยบาย', 11], ['assembly', 'ไม่เข้าหน้าเสาธง', 14],
    ['late', 'มาสาย', 8], ['noSignout', 'ไม่ลงเวลากลับ', 13], ['worked', 'มาปฏิบัติงาน', 12], ['notWorked', 'ไม่มาปฏิบัติงาน', 14],
  ], snaps.map((s) => (s.open ? { day: s.day, dateText: 'ยังไม่ปิดการเช็กชื่อ — ไม่นับ' } : {
    day: s.day, dateText: s.dateText, total: s.total, official: s.official.length, leave: s.leaveCount,
    sick: s.leave.sick.length, personal: s.leave.personal.length, policy: s.policy.length,
    assembly: s.assembly.held ? s.assembly.list.length : '-', late: s.late.length, noSignout: s.noSignout.length,
    worked: s.worked, notWorked: s.notWorked,
  })));
  sheet(wb, 'รายชื่อทุกวัน', LIST_COLS, done.flatMap(listRows));
  // สรุปรายบุคคล: กี่ครั้งในแต่ละหมวด (ช่วยดูคนที่ขาด/ลาบ่อย)
  const per = new Map();
  for (const r of done.flatMap(listRows)) {
    const k = r.name;
    if (!per.has(k)) per.set(k, { name: r.name, type: r.type, official: 0, leave: 0, policy: 0, assembly: 0, late: 0, noSignout: 0 });
    const p = per.get(k);
    const key = r.section.startsWith('2') ? 'official' : r.section.startsWith('3') ? 'leave' : r.section.startsWith('4') ? 'policy'
      : r.section.startsWith('5') ? 'assembly' : r.section.startsWith('6') ? 'late' : 'noSignout';
    p[key] += 1;
  }
  sheet(wb, 'รายบุคคล', [['name', 'ชื่อ-สกุล', 32], ['type', 'ประเภท', 20], ['official', 'ไปราชการ (วัน)', 13], ['leave', 'ลา (วัน)', 10],
    ['policy', 'งานนโยบาย (วัน)', 14], ['assembly', 'ไม่เข้าหน้าเสาธง (วัน)', 18], ['late', 'มาสาย (วัน)', 11], ['noSignout', 'ไม่ลงเวลากลับ (วัน)', 16]],
  [...per.values()].sort((a, b) => b.assembly - a.assembly || a.name.localeCompare(b.name, 'th')));
  for (const s of done) paperSheet(wb, s, s.day);
  return wb;
}

module.exports = { dailyWorkbook, rangeWorkbook, listRows };
