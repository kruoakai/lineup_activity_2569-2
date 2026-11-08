const ExcelJS = require('exceljs');
const db = require('../db');
const reports = require('./reports');
const clock = require('../clock');
const { HttpError } = require('../middleware/auth');

// ส่งออกเป็น Excel (.xlsx) สำหรับนำไปทำรายงานต่อ
// ค่าทุกช่องเขียนเป็นข้อความ/ตัวเลข ไม่ใช่สูตร จึงไม่มีความเสี่ยง formula injection

const STATUS = { present: 'มาเข้าแถว', absent: 'ขาด', official: 'ไปราชการ', policy: 'ติดงานนโยบาย', leave: 'ลา', pending: 'รอตรวจสอบ' };
const METHOD = {
  self_gps: 'เช็กเอง (GPS)', self_qr: 'เช็กเอง (QR)', self_tap: 'เช็กเอง (กดปุ่ม)', proxy_dept: 'ครูในแผนกเช็กแทน',
  proxy_peer: 'เพื่อนในแผนกเช็กแทน', proxy_activity: 'งานกิจกรรมบันทึก', admin: 'ผู้ดูแลระบบบันทึก',
};
const DAY = { normal: 'มีเข้าแถว (วันพิเศษ)', special: 'กิจกรรมพิเศษ', cancelled: 'งดเข้าแถว', holiday: 'วันหยุด', public_holiday: 'วันหยุดนักขัตฤกษ์' };
const COUNT_COLS = [
  ['expected', 'ครั้งที่ต้องเข้าแถว'], ['present', 'มาเข้าแถว'], ['absent', 'ขาด'], ['official', 'ไปราชการ'],
  ['policy', 'ติดงานนโยบาย'], ['leave', 'ลา'], ['pending', 'รอตรวจสอบ'], ['not_checked', 'ยังไม่เช็ก'], ['rate', 'ร้อยละการเข้าแถว'],
];

function sheet(wb, name, columns, rows) {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = columns.map(([key, header, width]) => ({ key, header, width: width || Math.max(10, header.length + 4) }));
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4E89' } };
  head.alignment = { vertical: 'middle', wrapText: true };
  for (const r of rows) ws.addRow(r);
  const rateCol = columns.findIndex(([k]) => k === 'rate');
  if (rateCol >= 0) ws.getColumn(rateCol + 1).numFmt = '0.0';
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  return ws;
}

function addSummarySheets(wb, rep) {
  const ov = wb.addWorksheet('ภาพรวม');
  ov.columns = [{ width: 34 }, { width: 18 }];
  const lines = [
    ['รายงานการเข้าแถว วิทยาลัยเทคนิคชัยภูมิ', ''],
    ['ช่วงวันที่', `${rep.from} ถึง ${rep.to}`],
    ['จำนวนวันเข้าแถว', rep.days],
    ['บุคลากรที่ต้องเข้าแถว (คน)', rep.total.members],
    ...COUNT_COLS.map(([k, h]) => [k === 'rate' ? 'ร้อยละการเข้าแถวภาพรวมทั้งวิทยาลัย' : h, rep.total[k] ?? '']),
    ['ถูกบันทึกแทน (ครั้ง)', rep.total.proxy],
    ['ติดธงตรวจสอบ (ครั้ง)', rep.total.flagged],
    ['', ''],
    ['สูตรร้อยละ', 'มาเข้าแถว ÷ (ครั้งที่ต้องเข้าแถว − ไปราชการ − ติดงานนโยบาย − ลา) × 100'],
    ['ส่งออกเมื่อ', `${clock.bangkok(clock.now()).day} ${clock.bangkok(clock.now()).time.slice(0, 5)} น.`],
  ];
  lines.forEach((l) => ov.addRow(l));
  ov.getRow(1).font = { bold: true, size: 14 };
  ov.getColumn(1).font = { bold: true };

  const counts = COUNT_COLS.map(([k, h]) => [k, h, k === 'rate' ? 16 : 12]);
  sheet(wb, 'รายบุคคล', [['employee_code', 'รหัส', 10], ['full_name', 'ชื่อ-สกุล', 30], ['department_name', 'แผนก', 26], ['unit_name', 'หน่วยงาน (แบบรายงาน)', 30], ...counts], rep.users);
  sheet(wb, 'รายแผนก', [['department_name', 'แผนก', 30], ['members', 'จำนวนคน', 10], ...counts], rep.departments);
  sheet(wb, 'รายหน่วยงาน', [['unit_name', 'หน่วยงาน/งาน', 34], ['members', 'จำนวนคน', 10], ...counts], rep.units || []);
  sheet(wb, 'รายวัน', [['day', 'วันที่', 12], ...counts], rep.trend);
}

async function summaryWorkbook(rep) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ระบบเช็กชื่อเข้าแถว';
  addSummarySheets(wb, rep);
  return wb;
}

// ทุกอย่างสำหรับผู้ดูแล: สรุป + บันทึกการเข้าแถวรายรายการ + บุคลากร + ปฏิทิน
async function fullWorkbook({ from, to }) {
  const rep = await reports.summary({ from, to, scope: { all: true } });
  const wb = await summaryWorkbook(rep);
  const rows = await db.query(
    `SELECT a.day, u.employee_code, u.full_name, COALESCE(d.name, '') AS department_name, a.status, a.method,
            a.checked_at, cb.full_name AS checked_by_name, a.distance_m, a.in_zone, a.qr_ok, a.flagged, a.flag_reason, a.note,
            a.is_demo, (SELECT COUNT(*) FROM attendance_photos p WHERE p.attendance_id = a.id) AS photos
       FROM attendance a JOIN users u ON u.id = a.user_id LEFT JOIN departments d ON d.id = u.department_id
       JOIN users cb ON cb.id = a.checked_by
      WHERE a.day BETWEEN ? AND ? ORDER BY a.day, d.name, u.full_name`,
    [from, to],
  );
  if (rows.length > 200000) throw new HttpError(400, 'ข้อมูลมากเกินไป กรุณาเลือกช่วงวันที่สั้นลง');
  const t = (v) => (v ? clock.bangkok(new Date(v)).time.slice(0, 5) : '');
  sheet(wb, 'บันทึกการเข้าแถว', [
    ['day', 'วันที่', 12], ['employee_code', 'รหัส', 10], ['full_name', 'ชื่อ-สกุล', 28], ['department_name', 'แผนก', 24],
    ['status', 'สถานะ', 14], ['method', 'วิธี', 20], ['time', 'เวลา', 8], ['checked_by_name', 'ผู้บันทึก', 26],
    ['distance_m', 'ระยะ (ม.)', 10], ['zone', 'ในพื้นที่', 10], ['qr', 'สแกน QR', 9], ['photos', 'รูป', 6],
    ['flag', 'ติดธง', 30], ['note', 'หมายเหตุ', 30], ['demo', 'ข้อมูลจำลอง', 12],
  ], rows.map((r) => ({
    ...r, status: STATUS[r.status] || r.status, method: METHOD[r.method] || r.method, time: t(r.checked_at),
    zone: r.in_zone === null ? '' : r.in_zone ? 'ใช่' : 'ไม่ใช่', qr: r.qr_ok ? 'ใช่' : '', flag: r.flagged ? r.flag_reason || 'ใช่' : '',
    demo: r.is_demo ? 'ใช่' : '',
  })));
  const users = await db.query(
    `SELECT u.employee_code, u.full_name, u.email, u.position_title, COALESCE(d.name, '') AS department_name, u.role,
            u.must_assemble, u.active, u.can_proxy
       FROM users u LEFT JOIN departments d ON d.id = u.department_id ORDER BY d.name, u.full_name`,
  );
  sheet(wb, 'บุคลากร', [
    ['employee_code', 'รหัส', 10], ['full_name', 'ชื่อ-สกุล', 30], ['email', 'อีเมล', 30], ['position_title', 'ตำแหน่ง', 24],
    ['department_name', 'แผนก', 26], ['role', 'บทบาท', 12], ['assemble', 'ต้องเข้าแถว', 12], ['proxy', 'ตัวแทนเช็กแทน', 14], ['state', 'สถานะบัญชี', 12],
  ], users.map((u) => ({ ...u, assemble: u.must_assemble ? 'ใช่' : 'ไม่', proxy: u.can_proxy ? 'ใช่' : '', state: u.active ? 'ใช้งาน' : 'ระงับ' })));
  const cal = await db.query('SELECT day, status, note FROM assembly_days WHERE day BETWEEN ? AND ? ORDER BY day', [from, to]);
  sheet(wb, 'ปฏิทิน', [['day', 'วันที่', 12], ['status', 'ประเภท', 22], ['note', 'หมายเหตุ', 40]], cal.map((c) => ({ ...c, status: DAY[c.status] || c.status })));
  return wb;
}

async function send(res, wb, filename) {
  res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.set('Content-Disposition', `attachment; filename="lineup.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`);
  await wb.xlsx.write(res);
  res.end();
}

module.exports = { summaryWorkbook, fullWorkbook, send };
