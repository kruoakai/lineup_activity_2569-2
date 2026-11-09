// เซิร์ฟเวอร์สำหรับ E2E: ใช้ฐานข้อมูลทดสอบ (เดียวกับ integration test) ล้างข้อมูลแล้วสร้างข้อมูลตัวอย่างใหม่ทุกครั้ง
// ห้ามชี้ไปที่ฐานข้อมูลจริง — helpers บังคับ NODE_ENV=test และ DB lineup_test
const path = require('path');

process.env.STATIC_DIR = path.join(__dirname, '..', 'frontend', 'dist');
const h = require('../backend/tests/helpers');
const { settings } = h;

const PORT = Number(process.env.E2E_PORT || 3199);

async function seed() {
  await h.resetDb();
  await settings.update({
    open_time: '00:00', close_time: '23:59', assembly_weekdays: '0,1,2,3,4,5,6',
    check_mode: 'none', group_checkin: '0', group_checkin_photo: '1',
  });
  await require('../backend/src/services/reportGroups').applyDefaults();
  const a = await h.createDept('แผนกทดสอบ ก');
  const b = await h.createDept('แผนกทดสอบ ข');
  const u = {};
  u.T1 = await h.createUser({ code: 'T1', name: 'ครูทดสอบ หนึ่ง', dept: a });
  u.T2 = await h.createUser({ code: 'T2', name: 'ครูทดสอบ สอง', dept: a });
  u.T3 = await h.createUser({ code: 'T3', name: 'ครูทดสอบ สาม', dept: a });
  u.T4 = await h.createUser({ code: 'T4', name: 'ครูต่างแผนก', dept: b });
  u.FR = await h.createUser({ code: 'FR', name: 'ครูใหม่', dept: a, ready: false });
  u.AC = await h.createUser({ code: 'AC', name: 'เจ้าหน้าที่กิจกรรม', role: 'activity', mustAssemble: false });
  u.AD = await h.createUser({ code: 'AD', name: 'ผู้ดูแลทดสอบ', role: 'admin', mustAssemble: false });
  u.S1 = await h.createUser({ code: 'S1', name: 'ผู้ลงนามหนึ่ง', mustAssemble: false });
  u.S2 = await h.createUser({ code: 'S2', name: 'ผู้ลงนามสอง', role: 'executive', mustAssemble: false });
  u.S3 = await h.createUser({ code: 'S3', name: 'ผู้อำนวยการทดสอบ', role: 'executive', mustAssemble: false });
  u.HR = await h.createUser({ code: 'HR', name: 'เจ้าหน้าที่บุคลากรทดสอบ', role: 'hr', mustAssemble: false });
  await settings.update({ sign_step1_user: String(u.S1), sign_step2_user: String(u.S2), sign_step3_user: String(u.S3) });
  const types = { T1: 'gov_teacher', T2: 'gov_teacher', T3: 'temp_teacher', T4: 'temp_officer', FR: 'assistant_teacher', S3: 'executive', HR: 'temp_officer' };
  for (const [code, t] of Object.entries(types)) await h.db.query('UPDATE users SET staff_type = ? WHERE id = ?', [t, u[code]]);
  // ครูมีประวัติย้อนหลัง ~6 สัปดาห์ สำหรับมุมมองสถิติ (แผนกแยก ไม่กระทบรายงานของแผนกทดสอบ)
  const c = await h.createDept('แผนกสถิติ');
  u.ST = await h.createUser({ code: 'ST', name: 'ครูมีสถิติ', dept: c });
  const today = h.clock.bangkok().day;
  const start = h.clock.addDays(today, -42);
  await h.db.query('UPDATE users SET created_at = ? WHERE id = ?', [`${start} 00:00:00`, u.ST]);
  const rows = [];
  for (let i = 0, d = start; d < today; i += 1, d = h.clock.addDays(d, 1)) {
    const k = i % 10;
    if (k === 9) continue; // ขาด
    const status = k === 4 ? 'official' : k === 7 ? 'leave' : 'present';
    const method = status !== 'present' ? 'hr' : k % 3 === 0 ? 'self_qr' : 'self_gps';
    const min = 50 + ((i * 7) % 38); // 07:50–08:27
    const at = new Date(Date.parse(`${d}T07:00:00+07:00`) + min * 60_000);
    rows.push([u.ST, d, status, status === 'leave' ? 'sick' : null, method, method === 'hr' ? u.HR : u.ST, at, status === 'official' ? 'ประชุม สอศ.' : '']);
  }
  await h.db.query('INSERT INTO attendance (user_id, day, status, leave_type, method, checked_by, checked_at, note) VALUES ?', [rows]);
  return u;
}

seed().then(() => {
  h.app.listen(PORT, '127.0.0.1', () => console.log(`e2e server on :${PORT}`));
}).catch((e) => { console.error(e); process.exit(1); });
