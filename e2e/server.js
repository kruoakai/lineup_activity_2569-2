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
  await settings.update({ sign_step1_user: String(u.S1), sign_step2_user: String(u.S2), sign_step3_user: String(u.S3) });
  return u;
}

seed().then(() => {
  h.app.listen(PORT, '127.0.0.1', () => console.log(`e2e server on :${PORT}`));
}).catch((e) => { console.error(e); process.exit(1); });
