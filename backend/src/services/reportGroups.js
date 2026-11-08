const db = require('../db');

// หน่วยงานในแบบบันทึกการเข้าร่วมกิจกรรมหน้าเสาธง (ตามแบบฟอร์มกระดาษของวิทยาลัย) เรียงตามลำดับในแบบฟอร์ม
const DEFAULT_GROUPS = [
  ['แผนกวิชาสามัญสัมพันธ์', ['สามัญสัมพันธ์']],
  ['แผนกวิชาช่างยนต์', ['ช่างยนต์และยานยนต์ไฟฟ้า', 'ตัวถังและสีรถยนต์']],
  ['แผนกวิชาช่างกลโรงงาน', ['ช่างกลโรงงาน']],
  ['แผนกวิชาช่างเทคนิคพื้นฐาน', ['ช่างเทคนิคพื้นฐาน']],
  ['แผนกวิชาการตลาด', ['การตลาด']],
  ['แผนกวิชาเทคโนโลยีธุรกิจดิจิทัล', ['เทคโนโลยีธุรกิจดิจิทัล']],
  ['แผนกวิชาการบัญชี', ['การบัญชี']],
  ['แผนกวิชาเทคโนโลยีสารสนเทศ', ['เทคโลโลยีสารสนเทศ', 'เทคโนโลยีสารสนเทศ']],
  ['แผนกวิชาช่างเชื่อมโลหะ', ['ช่างเชื่อมโลหะและซ่อมบำรุง']],
  ['แผนกวิชาช่างก่อสร้าง', ['ช่างก่อสร้างโยธา', 'ช่างก่อสร้าง']],
  ['แผนกวิชาช่างโยธา', ['ช่างโยธา']],
  ['แผนกวิชาช่างสถาปัตยกรรม', ['ช่างสถาปัตยกรรม']],
  ['แผนกวิชาช่างอิเล็กทรอนิกส์ และเมคคาทรอนิกส์', ['อิเล็กทรอนิกส์', 'เมคคาทรอนิกส์และหุ่นยนต์']],
  ['แผนกวิชาช่างไฟฟ้ากำลัง และพลังงาน', ['ไฟฟ้ากำลัง', 'เทคนิคพลังงาน']],
  ['บุคลากรทางการศึกษา เจ้าหน้าที่', []],
  ['เจ้าพนักงานราชการ', []],
];
const STAFF_GROUP = 'บุคลากรทางการศึกษา เจ้าหน้าที่';

// ตั้งหน่วยงานรายงานเริ่มต้นให้แผนกที่ยังไม่ได้กำหนด
async function applyDefaults() {
  const depts = await db.query('SELECT id, name, division FROM departments WHERE report_group IS NULL');
  for (const d of depts) {
    let group = null;
    let order = 999;
    DEFAULT_GROUPS.forEach(([g, names], i) => {
      if (!group && names.includes(d.name)) { group = g; order = i + 1; }
    });
    if (!group) {
      group = STAFF_GROUP;
      order = DEFAULT_GROUPS.findIndex(([g]) => g === STAFF_GROUP) + 1;
    }
    await db.query('UPDATE departments SET report_group = ?, report_order = ? WHERE id = ?', [group, order, d.id]);
  }
}

function orderOf(group) {
  const i = DEFAULT_GROUPS.findIndex(([g]) => g === group);
  return i >= 0 ? i + 1 : 999;
}

module.exports = { applyDefaults, orderOf, DEFAULT_GROUPS, STAFF_GROUP };
