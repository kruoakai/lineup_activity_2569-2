// คำนำหน้าชื่อ (นาย / นาง / นางสาว / ว่าที่ ร.ต. …) — เก็บแยกจากชื่อ-สกุล
// ใช้แสดงในรายงาน/เอกสาร/Excel ส่วนการเรียงลำดับใช้ชื่อ-สกุลอย่างเดียว (ไม่ให้คำนำหน้ามีผลต่อลำดับ)
const PREFIXES = ['นาย', 'นาง', 'นางสาว', 'ว่าที่ ร.ต.', 'ว่าที่ ร.ต.หญิง', 'ดร.', 'สิบเอก', 'จ่าสิบเอก'];
// คำนำหน้าที่พิมพ์รวมมากับชื่อ (ยาวก่อนสั้น เพื่อไม่ตัด "นางสาว" เหลือ "สาว…")
const LEADING = /^(ว่าที่\s*ร(?:้อยตรี|\.\s*ต\.)(?:\s*หญิง)?|นางสาว|น\.ส\.|นาง|นาย|ดร\.|จ่าสิบเอก|สิบเอก)\s*/;

/** JS: คำนำหน้า + ชื่อ-สกุล */
const displayName = (u) => `${(u && u.name_prefix) || ''}${(u && u.full_name) || ''}`;

/** แยกคำนำหน้าที่พิมพ์รวมมากับชื่อ → { prefix, name } (ไม่มีคำนำหน้า → prefix = '') */
function splitPrefix(full) {
  const s = String(full || '').replace(/\s+/g, ' ').trim();
  const m = LEADING.exec(s);
  const rest = m ? s.slice(m[0].length).trim() : '';
  // ส่วนที่เหลือต้องขึ้นต้นด้วยพยัญชนะ/อักษร (ไม่ใช่สระบน-ล่างหรือวรรณยุกต์) เช่น "นายิกา" ไม่ใช่ "นาย" + "ิกา"
  if (!m || !rest || /^[ัิ-ฺ็-๎]/.test(rest)) return { prefix: '', name: s };
  const prefix = m[1]
    .replace(/^น\.ส\.$/, 'นางสาว')
    .replace(/^ว่าที่\s*ร(?:้อยตรี|\.\s*ต\.)/, 'ว่าที่ ร.ต.')
    .replace(/\s*หญิง$/, 'หญิง');
  return { prefix, name: rest };
}

/** ตรวจคำนำหน้าที่กรอก (Excel / ฟอร์ม) — ว่าง = ไม่มี, ยาวไม่เกิน 50 ตัว */
function cleanPrefix(v) {
  return String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, 50);
}

module.exports = { PREFIXES, displayName, splitPrefix, cleanPrefix };
