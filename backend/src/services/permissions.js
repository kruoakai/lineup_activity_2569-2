// กฎสิทธิ์ทั้งหมดรวมไว้ที่เดียว
//
// staff       : เช็กชื่อเอง ดูประวัติตัวเอง
//               + ถ้า can_proxy = 1 เช็กแทนได้เฉพาะคนในแผนกเดียวกัน ภายในช่วงเวลาเช็กชื่อ
// dept_head   : ดูรายงานแผนกตัวเอง (+ เช็กแทนในแผนกถ้า can_proxy)
// activity    : เจ้าหน้าที่งานกิจกรรม เช็กแทน/บันทึกสถานะได้ทุกคน รวมถึงหลังปิดระบบ ดูรายงานทั้งหมด แสดง QR
// executive   : ดูรายงานทั้งหมด
// admin       : ทุกอย่าง + จัดการผู้ใช้และค่าระบบ

const VIEW_ALL = new Set(['activity', 'executive', 'admin']);
const MANAGE_ALL = new Set(['activity', 'admin']);

function canViewAll(user) {
  return VIEW_ALL.has(user.role);
}

// ขอบเขตแผนกที่ดูรายงานได้: null = ทุกแผนก
function reportScope(user) {
  if (canViewAll(user)) return { all: true };
  if (user.role === 'dept_head' || user.can_proxy) return { all: false, departmentId: user.department_id };
  return null;
}

// ขอบเขตหน้ารายชื่อ (เช็กแทน): เหมือนรายงาน + โหมดเช็กแทนกันทั้งแผนกเห็นรายชื่อแผนกตัวเอง
function rosterScope(user) {
  return reportScope(user) || (user.peer_check ? { all: false, departmentId: user.department_id } : null);
}

/**
 * ผู้ใช้ `actor` บันทึกสถานะให้ `target` ได้หรือไม่ ในช่วงเวลา `phase`
 * คืนค่า { ok, method, reason }
 */
function canRecordFor(actor, target, phase, status) {
  if (MANAGE_ALL.has(actor.role)) {
    return { ok: true, method: actor.role === 'admin' ? 'admin' : 'proxy_activity' };
  }
  if (phase !== 'open') return { ok: false, reason: 'ปิดการเช็กชื่อแล้ว ติดต่อเจ้าหน้าที่งานกิจกรรมหรือผู้ดูแลระบบ' };
  if (!actor.can_proxy && !actor.peer_check) return { ok: false, reason: 'ไม่ได้รับมอบหมายให้เช็กชื่อแทน' };
  if (!actor.department_id || actor.department_id !== target.department_id) {
    return { ok: false, reason: 'เช็กแทนได้เฉพาะบุคลากรในแผนกเดียวกัน' };
  }
  // ครูในแผนกบันทึกได้เฉพาะ "มาเข้าแถว" — สถานะราชการ/งานนโยบาย/ลา ให้งานกิจกรรมบันทึกพร้อมหลักฐาน
  if (status !== 'present') return { ok: false, reason: 'ครูในแผนกบันทึกได้เฉพาะสถานะ "มาเข้าแถว"' };
  return { ok: true, method: actor.can_proxy ? 'proxy_dept' : 'proxy_peer' };
}

module.exports = { canViewAll, reportScope, rosterScope, canRecordFor, MANAGE_ALL };
