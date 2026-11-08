// วันที่แบบไทยสำหรับเอกสารราชการ: 26 ตุลาคม 2569 · ช่วงวันที่ 26–30 ตุลาคม 2569
const MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

const parts = (day) => String(day).slice(0, 10).split('-').map(Number);

function long(day) {
  const [y, m, d] = parts(day);
  return `${d} ${MONTHS[m - 1]} ${y + 543}`;
}

function range(from, to) {
  if (!to || from === to) return long(from);
  const [y1, m1, d1] = parts(from);
  const [y2, m2, d2] = parts(to);
  if (y1 === y2 && m1 === m2) return `${d1}–${d2} ${MONTHS[m1 - 1]} ${y1 + 543}`;
  if (y1 === y2) return `${d1} ${MONTHS[m1 - 1]} – ${d2} ${MONTHS[m2 - 1]} ${y2 + 543}`;
  return `${long(from)} – ${long(to)}`;
}

module.exports = { MONTHS, long, range };
