// เปลี่ยนรหัสผู้ใช้ตามตารางเทียบรหัส: ชื่อตรง / ชื่อสะกดต่างเล็กน้อย / ไม่มีในระบบ / ไม่อยู่ในไฟล์ · login ด้วยรหัสใหม่ได้ รหัสผ่านเดิม
const h = require('../helpers');
const { plan, apply, similarity } = require('../../scripts/recode-users');

let ids;
beforeAll(async () => {
  await h.resetDb();
  const d = await h.createDept('แผนกทดสอบ');
  ids = {
    a: await h.createUser({ code: '475', name: 'นางสาวสมหญิง ใจดี', dept: d, role: 'executive' }),
    b: await h.createUser({ code: '476', name: 'สมชาย รักษาพล', dept: d }),
    c: await h.createUser({ code: '477', name: 'คนไม่อยู่ในไฟล์ ทดสอบ', dept: d }),
    adm: await h.createUser({ code: 'admin', name: 'ผู้ดูแลระบบ', role: 'admin', mustAssemble: false }),
  };
});
afterAll(async () => { await h.db.close(); });

const MAP = [
  { no: 1, old: 'ผบ01', username: 'ad001', name: 'สมหญิง ใจดี', group: 'ผู้บริหาร', honorific: 'ท่านผู้อำนวยการ' },
  { no: 2, old: 'ขรก01', username: 'tc001', name: 'นายสมชาย รักษาผล', group: 'ข้าราชการครู' }, // สะกดต่าง 1 ตัว
  { no: 3, old: 'ย02', username: 'sg002', name: 'นายไม่มี บัญชี', group: 'ยาม' },
];

test('similarity ใช้งานได้', () => {
  expect(similarity('สมชาย รักษาพล', 'สมชาย รักษาผล')).toBeGreaterThan(0.9);
  expect(similarity('ก', 'ข')).toBe(0);
});

test('ตรวจก่อน: จับคู่ชื่อตรงและชื่อคล้าย แจ้งคนที่ไม่มีบัญชี และคนที่ไม่อยู่ในไฟล์ (ไม่แตะผู้ดูแล)', async () => {
  const p = await plan(MAP);
  expect(p.matched.map((m) => [m.r.username, m.u.id, m.how])).toEqual([['ad001', ids.a, 'ตรง'], ['tc001', ids.b, 'คล้าย']]);
  expect(p.notFound.map((x) => x.r.username)).toEqual(['sg002']);
  expect(p.leftover.map((u) => u.id)).toEqual([ids.c]);
  expect(p.clashes).toHaveLength(0);
  // ยังไม่แก้อะไร
  expect((await h.db.query('SELECT employee_code FROM users WHERE id = ?', [ids.a]))[0].employee_code).toBe('475');
});

test('แก้จริง: รหัสใหม่ + คำเรียก · login ด้วยรหัสใหม่ (ตัวใหญ่/เล็กได้) รหัสผ่านเดิม · รหัสเดิมใช้ไม่ได้', async () => {
  await apply(await plan(MAP));
  const [a] = await h.db.query('SELECT employee_code, honorific FROM users WHERE id = ?', [ids.a]);
  expect(a).toEqual({ employee_code: 'ad001', honorific: 'ท่านผู้อำนวยการ' });
  expect((await h.db.query('SELECT employee_code FROM users WHERE id = ?', [ids.c]))[0].employee_code).toBe('477');
  await h.api().post('/api/auth/login').send({ username: 'AD001', password: h.PASSWORD }).expect(200);
  await h.api().post('/api/auth/login').send({ username: 'tc001', password: h.PASSWORD }).expect(200);
  const old = await h.api().post('/api/auth/login').send({ username: '475', password: h.PASSWORD });
  expect(old.status).toBe(401);
  // รันซ้ำได้ ไม่เสียหาย
  await apply(await plan(MAP));
  expect((await h.db.query('SELECT employee_code FROM users WHERE id = ?', [ids.b]))[0].employee_code).toBe('tc001');
});
