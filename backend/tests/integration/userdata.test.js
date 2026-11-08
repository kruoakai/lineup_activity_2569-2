// นำเข้า/ส่งออกผู้ใช้ด้วย Excel และ API ภายนอก (กุญแจ API)
const ExcelJS = require('exceljs');
const h = require('../helpers');

const { api, PASSWORD } = h;
let ids;
let adm;
let teacher;

async function xlsx(rows, headers) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('รายชื่อ');
  ws.addRow(['หัวเรื่องของไฟล์']); // แถวที่ไม่ใช่หัวตาราง ต้องข้ามได้
  ws.addRow(headers || ['รหัสพนักงาน*', 'ชื่อ-สกุล*', 'อีเมล', 'ฝ่าย', 'แผนก/งาน*', 'ตำแหน่ง', 'บทบาท', 'ต้องเข้าแถว', 'สถานะบัญชี']);
  rows.forEach((r) => ws.addRow(r));
  return (await wb.xlsx.writeBuffer()).toString('base64');
}

async function readXlsx(buf) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  return wb;
}

const binary = (res, cb) => {
  const chunks = [];
  res.on('data', (c) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

beforeAll(async () => {
  await h.resetDb();
  const it = await h.createDept('เทคโนโลยีสารสนเทศ', 'ฝ่ายวิชาการ');
  ids = {
    it,
    admin: await h.createUser({ code: 'ADM', name: 'ผู้ดูแล', role: 'admin', mustAssemble: false }),
    t1: await h.createUser({ code: 'T1', name: 'ครูหนึ่ง', dept: it }),
    t2: await h.createUser({ code: 'T2', name: 'ครูสอง', dept: it }),
  };
  adm = api(await h.login('ADM'));
  teacher = api(await h.login('T1'));
});

afterAll(async () => { await h.db.close(); });

describe('แม่แบบและส่งออก Excel', () => {
  test('ดาวน์โหลดแม่แบบ มีหัวตาราง ตัวอย่าง คำอธิบาย และรายชื่อแผนก', async () => {
    const r = await adm.get('/api/admin/users/template.xlsx').buffer(true).parse(binary);
    expect(r.status).toBe(200);
    const wb = await readXlsx(r.body);
    const ws = wb.getWorksheet('รายชื่อบุคลากร');
    expect(ws.getRow(1).getCell(1).value).toBe('รหัสพนักงาน*');
    expect(ws.getRow(2).getCell(1).value).toMatch(/^ตัวอย่าง/);
    expect(wb.getWorksheet('วิธีกรอก')).toBeTruthy();
    expect(wb.getWorksheet('แผนกที่มีในระบบ').getRow(2).getCell(1).value).toBe('เทคโนโลยีสารสนเทศ');
  });

  test('แม่แบบที่ยังไม่แก้ (มีแค่แถวตัวอย่าง) นำเข้าแล้วไม่มีข้อมูล', async () => {
    const t = await adm.get('/api/admin/users/template.xlsx').buffer(true).parse(binary);
    const r = await adm.post('/api/admin/users/import/preview').send({ file: t.body.toString('base64') });
    expect(r.status).toBe(400);
  });

  test('ส่งออกต้องยืนยันรหัสผ่าน ได้ไฟล์ที่ไม่มีรหัสผ่าน และครูทั่วไปเรียกไม่ได้', async () => {
    expect((await adm.post('/api/admin/users/export.xlsx').send({ password: 'wrong' })).status).toBe(403);
    expect((await teacher.post('/api/admin/users/export.xlsx').send({ password: PASSWORD })).status).toBe(403);
    const r = await adm.post('/api/admin/users/export.xlsx').send({ password: PASSWORD }).buffer(true).parse(binary);
    expect(r.status).toBe(200);
    const ws = (await readXlsx(r.body)).getWorksheet('รายชื่อบุคลากร');
    const codes = [];
    ws.eachRow((row, n) => { if (n > 1) codes.push(row.getCell(1).value); });
    expect(codes.sort()).toEqual(['ADM', 'T1', 'T2']);
    expect(ws.getRow(1).getCell(10).value).toMatch(/สถานะรหัสผ่าน/);
    expect(JSON.stringify(ws.getSheetValues())).not.toMatch(/\$2[aby]\$/); // ไม่มี bcrypt hash
  });

  test('ไฟล์ที่ส่งออกนำกลับเข้าได้ทันที (ไม่มีการเปลี่ยนแปลง)', async () => {
    const r = await adm.post('/api/admin/users/export.xlsx').send({ password: PASSWORD }).buffer(true).parse(binary);
    const p = await adm.post('/api/admin/users/import/preview').send({ file: r.body.toString('base64') });
    expect(p.status).toBe(200);
    expect(p.body.summary).toMatchObject({ rows: 3, create: 0, update: 0, same: 3, error: 0 });
  });
});

describe('นำเข้า Excel', () => {
  let file;
  beforeAll(async () => {
    file = await xlsx([
      ['N1', 'ครูใหม่ หนึ่ง', 'n1@test.local', 'ฝ่ายวิชาการ', 'เทคโนโลยีสารสนเทศ', 'ครู', 'บุคลากร', 'ใช่', 'ใช้งาน'],
      ['N2', 'ครูใหม่ สอง', '', 'ฝ่ายวิชาการ', 'แผนกใหม่', '', 'หัวหน้าแผนก', 'ไม่', ''],
      [475, 'ครูรหัสตัวเลข', '', '', 'เทคโนโลยีสารสนเทศ', '', '', '', ''],
      ['T1', 'ครูหนึ่ง (แก้ชื่อ)', '', '', '', 'ครูชำนาญการ', '', '', ''],
      ['T2', 'ครูสอง', 'T1@test.local', '', '', '', '', '', ''],
      ['N3', '', '', '', 'เทคโนโลยีสารสนเทศ', '', '', '', ''],
      ['N4', 'คนที่ขอเป็นแอดมิน', '', '', 'เทคโนโลยีสารสนเทศ', '', 'ผู้ดูแลระบบ', '', ''],
      ['N1', 'ซ้ำ', '', '', 'เทคโนโลยีสารสนเทศ', '', '', '', ''],
      ['N5', 'ไม่มีแผนก', '', '', '', '', '', '', ''],
      ['ADM', 'ผู้ดูแล', '', '', '', '', '', '', 'ระงับ'],
    ]);
  });

  test('ตัวอย่างผล: แยกสร้างใหม่/แก้ไข/ผิดพลาด พร้อมเหตุผล และยังไม่บันทึก', async () => {
    const r = await adm.post('/api/admin/users/import/preview').send({ file });
    expect(r.status).toBe(200);
    expect(r.body.summary).toMatchObject({ rows: 10, create: 3, update: 1, error: 6, newDepartments: 1 });
    const by = Object.fromEntries(r.body.rows.map((x) => [`${x.line}`, x]));
    expect(by[3].action).toBe('create');
    expect(by[5].action).toBe('create');
    expect(by[5].employee_code).toBe('475');
    expect(by[6].action).toBe('update');
    expect(by[6].changes.full_name.to).toBe('ครูหนึ่ง (แก้ชื่อ)');
    expect(by[7].errors.join()).toMatch(/อีเมลนี้เป็นของ ครูหนึ่ง/);
    expect(by[8].errors.join()).toMatch(/ชื่อ-สกุล/);
    expect(by[9].errors.join()).toMatch(/ผู้ดูแลระบบ/);
    expect(by[10].errors.join()).toMatch(/ซ้ำกับแถว 3/);
    expect(by[11].errors.join()).toMatch(/ต้องระบุแผนก/);
    expect(by[12].errors.join()).toMatch(/ระงับบัญชีผู้ดูแลระบบ|ระงับบัญชีของตนเอง/);
    const [{ n }] = await h.db.query("SELECT COUNT(*) AS n FROM users WHERE employee_code = 'N1'");
    expect(n).toBe(0);
  });

  test('บันทึกต้องยืนยันรหัสผ่าน → สร้าง/แก้ไขเฉพาะแถวที่ถูก คนใหม่ใช้รหัสเริ่มต้นและต้องเปลี่ยน', async () => {
    expect((await adm.post('/api/admin/users/import').send({ file, password: 'x' })).status).toBe(403);
    const r = await adm.post('/api/admin/users/import').send({ file, password: PASSWORD });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ create: 3, update: 1, error: 6, initialPassword: '12345678' });
    const [n2] = await h.db.query(`SELECT u.role, u.must_assemble, u.must_change_password, d.name FROM users u JOIN departments d ON d.id = u.department_id WHERE employee_code = 'N2'`);
    expect(n2).toMatchObject({ role: 'dept_head', must_assemble: 0, must_change_password: 1, name: 'แผนกใหม่' });
    const [t1] = await h.db.query("SELECT full_name, position_title, email FROM users WHERE employee_code = 'T1'");
    expect(t1).toEqual({ full_name: 'ครูหนึ่ง (แก้ชื่อ)', position_title: 'ครูชำนาญการ', email: 'T1@test.local' });
    const login = await h.request(h.app).post('/api/auth/login').send({ username: 'N1', password: '12345678' });
    expect(login.status).toBe(200);
    expect(login.body.user.must_change_password).toBeTruthy();
    // รหัสผ่านคนเดิมไม่เปลี่ยน
    expect((await h.request(h.app).post('/api/auth/login').send({ username: 'T1', password: PASSWORD })).status).toBe(200);
  });

  test('ระงับผู้ที่ไม่อยู่ในไฟล์ (เลือกได้) — ไม่แตะผู้ดูแลระบบ และออกจากระบบทุกเครื่อง', async () => {
    const f = await xlsx([['T1', 'ครูหนึ่ง (แก้ชื่อ)', '', '', '', '', '', '', ''], ['N1', 'ครูใหม่ หนึ่ง', '', '', '', '', '', '', '']]);
    const p = await adm.post('/api/admin/users/import/preview').send({ file: f, deactivateMissing: true });
    expect(p.body.deactivate.map((u) => u.employee_code).sort()).toEqual(['475', 'N2', 'T2']);
    const r = await adm.post('/api/admin/users/import').send({ file: f, deactivateMissing: true, password: PASSWORD });
    expect(r.status).toBe(200);
    const rows = await h.db.query("SELECT employee_code, active FROM users WHERE employee_code IN ('T2','ADM')");
    expect(Object.fromEntries(rows.map((x) => [x.employee_code, x.active]))).toEqual({ T2: 0, ADM: 1 });
    // เปิดกลับด้วยสถานะ "ใช้งาน"
    const back = await xlsx([['T2', 'ครูสอง', '', '', '', '', '', '', 'ใช้งาน']]);
    await adm.post('/api/admin/users/import').send({ file: back, password: PASSWORD });
    expect((await h.db.query("SELECT active FROM users WHERE employee_code = 'T2'"))[0].active).toBe(1);
  });

  test('อ่านไฟล์จากระบบสารบรรณฯ (หัวคอลัมน์แบบเดิม) ได้', async () => {
    const f = await xlsx([['ครู สารบรรณ', 'sb@test.local', 'SB1', 'ฝ่ายวิชาการ', 'เทคโนโลยีสารสนเทศ']],
      ['ชื่อ-สกุล', 'อีเมล', 'รหัสพนักงาน', 'โครงสร้างระดับที่ 2', 'โครงสร้างระดับที่ 3']);
    const r = await adm.post('/api/admin/users/import/preview').send({ file: f });
    expect(r.body.summary).toMatchObject({ create: 1, error: 0 });
  });

  test('ไฟล์ที่ไม่ใช่ Excel หรือไม่มีหัวตาราง', async () => {
    expect((await adm.post('/api/admin/users/import/preview').send({ file: Buffer.from('hello').toString('base64') })).status).toBe(400);
    const f = await xlsx([['a', 'b']], ['ก', 'ข']);
    const r = await adm.post('/api/admin/users/import/preview').send({ file: f });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/หัวตาราง/);
  });
});

describe('API ภายนอก', () => {
  let readKey;
  let writeKey;

  test('สร้างกุญแจต้องยืนยันรหัสผ่าน กุญแจแสดงครั้งเดียว และรายการไม่มีกุญแจจริง', async () => {
    expect((await adm.post('/api/admin/api-keys').send({ name: 'x', scopes: ['users:read'], password: 'bad' })).status).toBe(403);
    expect((await adm.post('/api/admin/api-keys').send({ name: 'x', scopes: [], password: PASSWORD })).status).toBe(400);
    const r = await adm.post('/api/admin/api-keys').send({ name: 'ระบบบุคลากร', scopes: ['users:read', 'attendance:read'], password: PASSWORD });
    expect(r.status).toBe(201);
    expect(r.body.key).toMatch(/^lu_[A-Za-z0-9]{8}_[A-Za-z0-9]{40}$/);
    readKey = r.body.key;
    writeKey = (await adm.post('/api/admin/api-keys').send({ name: 'ระบบ HR', scopes: ['users:read', 'users:write'], password: PASSWORD })).body.key;
    const list = await adm.get('/api/admin/api-keys');
    expect(list.body.items).toHaveLength(2);
    expect(JSON.stringify(list.body)).not.toContain(readKey);
    expect((await teacher.get('/api/admin/api-keys')).status).toBe(403);
  });

  test('ไม่มีกุญแจ / กุญแจผิด / ใช้ token ผู้ใช้แทนกุญแจ → 401', async () => {
    expect((await h.request(h.app).get('/api/ext/v1/users')).status).toBe(401);
    expect((await h.request(h.app).get('/api/ext/v1/users').set('X-API-Key', `lu_AAAAAAAA_${'B'.repeat(40)}`)).status).toBe(401);
    const userTok = await h.login('ADM');
    expect((await h.request(h.app).get('/api/ext/v1/users').set('Authorization', `Bearer ${userTok}`)).status).toBe(401);
  });

  test('อ่านรายชื่อ: แบ่งหน้า กรองสถานะ ไม่มีข้อมูลรหัสผ่าน และนับการใช้งาน', async () => {
    const r = await h.request(h.app).get('/api/ext/v1/users?active=1&limit=2').set('Authorization', `Bearer ${readKey}`);
    expect(r.status).toBe(200);
    expect(r.body.items).toHaveLength(2);
    expect(r.body.total).toBeGreaterThan(2);
    expect(Object.keys(r.body.items[0]).sort()).toEqual(['active', 'department', 'division', 'email', 'employee_code', 'full_name', 'must_assemble', 'position_title', 'role', 'updated_at']);
    const one = await h.request(h.app).get('/api/ext/v1/users/T1').set('X-API-Key', readKey);
    expect(one.body.full_name).toBe('ครูหนึ่ง (แก้ชื่อ)');
    expect((await h.request(h.app).get('/api/ext/v1/users/NOPE').set('X-API-Key', readKey)).status).toBe(404);
    const [k] = await h.db.query("SELECT use_count, last_used_at FROM api_keys WHERE name = 'ระบบบุคลากร'");
    expect(k.use_count).toBe(3);
    expect(k.last_used_at).toBeTruthy();
  });

  test('สิทธิ์ตาม scope: กุญแจอ่านอย่างเดียวเขียนไม่ได้ / กุญแจ HR อ่านผลเข้าแถวไม่ได้', async () => {
    const w = await h.request(h.app).post('/api/ext/v1/users/sync').set('X-API-Key', readKey).send({ users: [] });
    expect(w.status).toBe(403);
    const a = await h.request(h.app).get('/api/ext/v1/attendance?from=2026-11-01&to=2026-11-07').set('X-API-Key', writeKey);
    expect(a.status).toBe(403);
  });

  test('sync: dry_run ไม่บันทึก แล้วบันทึกจริง (สร้าง/แก้ไข/ระงับ)', async () => {
    const users = [
      { employee_code: 'API1', full_name: 'ครูจาก API', email: 'api1@test.local', department: 'เทคโนโลยีสารสนเทศ', role: 'staff', must_assemble: true },
      { employee_code: 'T2', full_name: 'ครูสอง', active: false },
      { employee_code: 'BAD', full_name: '' },
    ];
    const dry = await h.request(h.app).post('/api/ext/v1/users/sync').set('X-API-Key', writeKey).send({ users, dry_run: true });
    expect(dry.status).toBe(200);
    expect(dry.body.summary).toMatchObject({ create: 1, update: 1, error: 1 });
    expect((await h.db.query("SELECT id FROM users WHERE employee_code = 'API1'"))).toHaveLength(0);
    const real = await h.request(h.app).post('/api/ext/v1/users/sync').set('X-API-Key', writeKey).send({ users });
    expect(real.status).toBe(200);
    expect(real.body.rows[2].errors.join()).toMatch(/ชื่อ-สกุล/);
    expect((await h.db.query("SELECT active FROM users WHERE employee_code = 'T2'"))[0].active).toBe(0);
    expect((await h.db.query("SELECT must_change_password FROM users WHERE employee_code = 'API1'"))[0].must_change_password).toBe(1);
    const [log] = await h.db.query("SELECT action, actor_id FROM admin_logs WHERE action = 'api.users.sync'");
    expect(log.actor_id).toBe(ids.admin);
  });

  test('อ่านผลเข้าแถวและสรุปร้อยละ ตรวจช่วงวันที่', async () => {
    await h.db.query("INSERT INTO attendance (user_id, day, status, method, checked_by, checked_at) VALUES (?, '2026-11-05', 'present', 'self_tap', ?, NOW())", [ids.t1, ids.t1]);
    const a = await h.request(h.app).get('/api/ext/v1/attendance?from=2026-11-01&to=2026-11-07').set('X-API-Key', readKey);
    expect(a.status).toBe(200);
    expect(a.body.items[0]).toMatchObject({ day: '2026-11-05', employee_code: 'T1', status: 'present', checked_by: 'T1', flagged: false });
    expect((await h.request(h.app).get('/api/ext/v1/attendance?from=2026-01-01&to=2026-12-31').set('X-API-Key', readKey)).status).toBe(400);
    expect((await h.request(h.app).get('/api/ext/v1/attendance?from=bad&to=2026-12-31').set('X-API-Key', readKey)).status).toBe(400);
    const s = await h.request(h.app).get('/api/ext/v1/attendance/summary?from=2026-11-02&to=2026-11-06').set('X-API-Key', readKey);
    expect(s.status).toBe(200);
    expect(s.body.college).toHaveProperty('rate');
    expect(s.body.users.find((u) => u.employee_code === 'T1').present).toBe(1);
  });

  test('จำกัด IP และยกเลิกกุญแจมีผลทันที', async () => {
    const ipKey = (await adm.post('/api/admin/api-keys').send({ name: 'จำกัด IP', scopes: ['users:read'], allowedIps: '10.9.9.9', password: PASSWORD })).body;
    expect((await h.request(h.app).get('/api/ext/v1/me').set('X-API-Key', ipKey.key)).status).toBe(403);
    expect((await adm.post('/api/admin/api-keys').send({ name: 'x', scopes: ['users:read'], allowedIps: 'not-an-ip!', password: PASSWORD })).status).toBe(400);
    const me = await h.request(h.app).get('/api/ext/v1/me').set('X-API-Key', readKey);
    expect(me.body).toEqual({ name: 'ระบบบุคลากร', scopes: ['users:read', 'attendance:read'] });
    const [k] = await h.db.query("SELECT id FROM api_keys WHERE name = 'ระบบบุคลากร'");
    expect((await adm.delete(`/api/admin/api-keys/${k.id}`)).status).toBe(200);
    expect((await h.request(h.app).get('/api/ext/v1/me').set('X-API-Key', readKey)).status).toBe(401);
    expect((await adm.delete(`/api/admin/api-keys/${k.id}`)).status).toBe(404);
    const list = await adm.get('/api/admin/api-keys');
    expect(list.body.items.find((x) => x.id === k.id).status).toBe('revoked');
  });
});
