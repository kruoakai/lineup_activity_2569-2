/**
 * นำเข้าข้อมูลบุคลากรจาก data/personnel.json (แปลงมาจากไฟล์ Excel ระบบสารบรรณฯ)
 *
 *   node scripts/seed.js [--out <ไฟล์ CSV รหัสผ่านเริ่มต้น>]
 *   node scripts/seed.js --signers-only     (ตั้งผู้ลงนามเริ่มต้นอย่างเดียว ไม่แตะข้อมูลผู้ใช้)
 *
 * - รันซ้ำได้: ผู้ใช้เดิม (รหัสพนักงานเดิม) จะอัปเดตชื่อ/อีเมล/แผนก แต่ไม่รีเซ็ตรหัสผ่าน
 * - ผู้ใช้ใหม่ได้รหัสผ่านเริ่มต้นแบบสุ่ม เขียนลงไฟล์ CSV ให้ผู้ดูแลแจกจ่าย แล้วควรลบไฟล์ทิ้ง
 * - สร้างบัญชีผู้ดูแลระบบ "admin" ถ้ายังไม่มี
 */
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('../src/db');
const passwords = require('../src/services/passwords');
const { migrate } = require('./migrate');

const BOM = String.fromCharCode(0xfeff);
const CRLF = String.fromCharCode(13, 10);

// แผนก/งานที่กำหนดบทบาทเริ่มต้น
const ROLE_BY_DEPARTMENT = {
  'งานกิจกรรมนักเรียน นักศึกษา': 'activity',
  'งานบริหารและพัฒนาทรัพยากรบุคคล': 'hr',
};

// ผู้ลงนามเริ่มต้นตามแบบสรุปการปฏิบัติงานประจำวัน: ผู้รายงาน → ผู้ตรวจสอบ → ผู้อำนวยการ (ผู้ดูแลเปลี่ยนได้) — ไม่ทับค่าที่ตั้งไว้แล้ว
async function defaultSigners() {
  const SIGNERS = { sign_step1_user: 'จารุณี คบสหาย', sign_step2_user: 'ปรีชา อารีวงษ์', sign_step3_user: 'กรรณิกา ยอดสง่า' };
  for (const [k, name] of Object.entries(SIGNERS)) {
    const [set] = await db.query('SELECT v FROM settings WHERE k = ?', [k]);
    if (set && set.v) continue;
    const [u] = await db.query('SELECT id FROM users WHERE full_name LIKE ? LIMIT 1', [name]);
    if (u) await db.query('INSERT INTO settings (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)', [k, String(u.id)]);
  }
}

async function seed({ file = path.join(__dirname, '..', 'data', 'personnel.json'), out } = {}) {
  await migrate();
  const people = JSON.parse(fs.readFileSync(file, 'utf8'));
  const created = [];

  const deptIds = new Map();
  for (const p of people) {
    const key = `${p.division}|${p.department}`;
    if (deptIds.has(key)) continue;
    await db.query('INSERT IGNORE INTO departments (name, division) VALUES (?, ?)', [p.department, p.division]);
    const [d] = await db.query('SELECT id FROM departments WHERE name = ? AND division = ?', [p.department, p.division]);
    deptIds.set(key, d.id);
  }

  for (const p of people) {
    const departmentId = deptIds.get(`${p.division}|${p.department}`);
    const [existing] = await db.query('SELECT id FROM users WHERE employee_code = ?', [p.employee_code]);
    if (existing) {
      await db.query('UPDATE users SET full_name = ?, email = ?, department_id = ? WHERE id = ?',
        [p.full_name, p.email, departmentId, existing.id]);
      continue;
    }
    const initial = passwords.initial();
    await db.query(
      `INSERT INTO users (employee_code, email, full_name, department_id, role, password_hash, must_change_password)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [p.employee_code, p.email, p.full_name, departmentId, ROLE_BY_DEPARTMENT[p.department] || 'staff', await bcrypt.hash(initial, 10)],
    );
    created.push({ ...p, initial });
  }

  const [admin] = await db.query("SELECT id FROM users WHERE employee_code = 'admin'");
  if (!admin) {
    const initial = passwords.generate(12);
    await db.query(
      `INSERT INTO users (employee_code, full_name, role, must_assemble, password_hash, must_change_password)
       VALUES ('admin', 'ผู้ดูแลระบบ', 'admin', 0, ?, 1)`,
      [await bcrypt.hash(initial, 10)],
    );
    created.unshift({ employee_code: 'admin', full_name: 'ผู้ดูแลระบบ', email: '', department: '', initial });
  }

  await require('../src/services/reportGroups').applyDefaults();
  await defaultSigners();
  await require('../src/services/official').syncSigners();

  if (created.length && out) {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = ['ชื่อผู้ใช้ (รหัสพนักงาน),ชื่อ-สกุล,อีเมล,แผนก,รหัสผ่านเริ่มต้น'];
    for (const c of created) lines.push([c.employee_code, c.full_name, c.email, c.department, c.initial].map(esc).join(','));
    fs.writeFileSync(out, BOM + lines.join(CRLF) + CRLF, { mode: 0o600 });
  }
  return { total: people.length, created: created.length, departments: deptIds.size, createdUsers: created };
}

module.exports = { seed, defaultSigners };

if (require.main === module && process.argv.includes('--signers-only')) {
  migrate().then(defaultSigners).then(() => { console.log('signers: done'); return db.close(); })
    .catch((e) => { console.error(e); process.exit(1); });
} else if (require.main === module) {
  const i = process.argv.indexOf('--out');
  const out = i > 0 ? process.argv[i + 1] : path.join(process.cwd(), 'initial-passwords.csv');
  seed({ out })
    .then((r) => {
      console.log(`seed: ${r.total} คน, ${r.departments} แผนก/งาน, สร้างบัญชีใหม่ ${r.created} บัญชี`);
      if (r.created) console.log(`รหัสผ่านเริ่มต้นอยู่ที่ ${out} — แจกจ่ายแล้วลบไฟล์ทิ้ง`);
      return db.close();
    })
    .catch((e) => { console.error(e); process.exit(1); });
}
