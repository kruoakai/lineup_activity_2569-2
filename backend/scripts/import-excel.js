/**
 * แปลงไฟล์ Excel รายชื่อบุคลากร (ส่งออกจากระบบสารบรรณอิเล็กทรอนิกส์ GDCC e-Office) เป็น data/personnel.json
 *   node scripts/import-excel.js "<ไฟล์.xlsx>" [data/personnel.json]
 *
 * ค้นหาแถวหัวตารางที่มีคอลัมน์ "รหัสพนักงาน" อัตโนมัติ แล้วอ่านคอลัมน์ตามชื่อ:
 *   ชื่อ-สกุล · อีเมล · รหัสพนักงาน · โครงสร้างระดับที่ 2 (ฝ่าย) · โครงสร้างระดับที่ 3 (แผนก/งาน)
 */
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const COLS = {
  full_name: 'ชื่อ-สกุล',
  email: 'อีเมล',
  employee_code: 'รหัสพนักงาน',
  division: 'โครงสร้างระดับที่ 2',
  department: 'โครงสร้างระดับที่ 3',
};

const text = (v) => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return String(v.text ?? v.result ?? (v.richText ? v.richText.map((t) => t.text).join('') : '')).trim();
  return String(v).trim();
};

async function convert(xlsxFile) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(xlsxFile);
  const ws = wb.worksheets[0];
  let headerRow = 0;
  const index = {};
  ws.eachRow((row, n) => {
    if (headerRow) return;
    const values = row.values.map(text);
    if (values.includes(COLS.employee_code)) {
      headerRow = n;
      for (const [key, label] of Object.entries(COLS)) index[key] = values.indexOf(label);
    }
  });
  if (!headerRow) throw new Error(`ไม่พบแถวหัวตารางที่มีคอลัมน์ "${COLS.employee_code}"`);
  const missing = Object.entries(index).filter(([, i]) => i < 0).map(([k]) => COLS[k]);
  if (missing.length) throw new Error(`ไม่พบคอลัมน์: ${missing.join(', ')}`);

  const people = [];
  const seen = new Set();
  ws.eachRow((row, n) => {
    if (n <= headerRow) return;
    const v = row.values;
    const p = {
      employee_code: text(v[index.employee_code]),
      full_name: text(v[index.full_name]).replace(/\s+/g, ' '),
      email: text(v[index.email]).toLowerCase(),
      division: text(v[index.division]),
      department: text(v[index.department]),
    };
    if (!p.employee_code || !p.full_name) return;
    if (seen.has(p.employee_code)) throw new Error(`รหัสพนักงานซ้ำ: ${p.employee_code} (แถว ${n})`);
    seen.add(p.employee_code);
    people.push(p);
  });
  return people;
}

if (require.main === module) {
  const [input, output = path.join(__dirname, '..', 'data', 'personnel.json')] = process.argv.slice(2);
  if (!input) {
    console.error('ใช้: node scripts/import-excel.js "<ไฟล์.xlsx>" [data/personnel.json]');
    process.exit(1);
  }
  convert(input).then((people) => {
    fs.writeFileSync(output, `${JSON.stringify(people, null, 2)}\n`);
    const depts = new Set(people.map((p) => `${p.division}|${p.department}`));
    console.log(`บันทึก ${people.length} คน ${depts.size} แผนก/งาน → ${output}`);
  }).catch((e) => { console.error(e.message); process.exit(1); });
}

module.exports = { convert };
