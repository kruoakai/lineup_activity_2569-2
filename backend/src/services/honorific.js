// คำเรียกผู้บริหาร: ตั้งเองในหน้าผู้ใช้ หรือเดาจากตำแหน่ง (ผู้อำนวยการ / รองผู้อำนวยการฝ่าย…)
function honorificOf(u) {
  if (u.honorific) return u.honorific;
  const t = String(u.position_title || '').trim();
  const dep = /^รองผู้อำนวยการ\s*(ฝ่าย.+?)(?:\s*วิทยาลัย.*)?$/.exec(t);
  if (dep) return `ท่านรอง${dep[1].replace(/\s+/g, '')}`;
  if (/^ผู้อำนวยการ/.test(t)) return 'ท่านผู้อำนวยการ';
  return '';
}

module.exports = { honorificOf };
