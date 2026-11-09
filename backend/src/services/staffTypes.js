// ประเภทบุคลากรตามแบบ "สรุปการปฏิบัติงานของข้าราชการครู และบุคลากรทางการศึกษา" (งานบริหารและพัฒนาทรัพยากรบุคคล)
// no = เลขข้อในแบบรายงาน · group = หัวข้อย่อยที่รวมยอด (ลูกจ้างชั่วคราว) · short = คำต่อท้ายชื่อในรายชื่อ
const STAFF_TYPES = [
  { code: 'executive', no: '1.1', label: 'ฝ่ายบริหาร', short: 'ผู้บริหาร' },
  { code: 'gov_teacher', no: '1.2', label: 'ข้าราชการครู', short: 'ขรก.ครู' },
  { code: 'assistant_teacher', no: '1.3', label: 'ครูผู้ช่วย', short: 'ครูผู้ช่วย' },
  { code: 'gov_38c2', no: '1.4', label: 'ข้าราชการ 38ค (2)', short: 'ขรก.38ค(2)' },
  { code: 'gov_emp_teacher', no: '1.5', label: 'พนักงานราชการ ตำแหน่ง ครู', short: 'พนักงานราชการ (ครู)' },
  { code: 'gov_emp_general', no: '1.6', label: 'พนักงานราชการ ตำแหน่ง งานบริหารงานทั่วไป', short: 'พนักงานราชการ' },
  { code: 'temp_teacher', no: '1.7.1', group: 'temp', label: 'ครูอัตราจ้าง', short: 'ครูอัตราจ้าง' },
  { code: 'temp_officer', no: '1.7.2', group: 'temp', label: 'เจ้าหน้าที่', short: 'เจ้าหน้าที่' },
  { code: 'temp_janitor', no: '1.7.3', group: 'temp', label: 'นักการภารโรง', short: 'นักการ' },
  { code: 'temp_driver', no: '1.7.4', group: 'temp', label: 'พนักงานขับรถยนต์', short: 'พนักงานขับรถ' },
  { code: 'temp_guard', no: '1.7.5', group: 'temp', label: 'ยามรักษาการณ์', short: 'ยาม' },
  { code: 'trainee', no: '1.8', label: 'นักศึกษาฝึกประสบการณ์สอน', short: 'นศ.ฝึกสอน' },
];
const GROUPS = { temp: { no: '1.7', label: 'ลูกจ้างชั่วคราว' } };
const BY_CODE = new Map(STAFF_TYPES.map((t) => [t.code, t]));

/** รับรหัส ชื่อเต็ม หรือชื่อย่อ → รหัส (ไม่พบ = undefined) */
function parse(value) {
  const s = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!s) return undefined;
  const norm = (x) => x.replace(/\s+/g, '').toLowerCase();
  const t = STAFF_TYPES.find((x) => norm(x.code) === norm(s) || norm(x.label) === norm(s) || norm(x.short) === norm(s));
  return t ? t.code : null;
}

module.exports = { STAFF_TYPES, GROUPS, BY_CODE, parse };
