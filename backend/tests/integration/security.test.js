// Integration tests — สิทธิ์ตามบทบาท (permission matrix) และความปลอดภัยของการเข้าสู่ระบบ
const h = require('../helpers');

const { api, request, app } = h;
let tok;
let ids;

beforeAll(async () => {
  await h.resetDb();
  const d1 = await h.createDept('แผนก 1');
  const d2 = await h.createDept('แผนก 2');
  ids = {
    d1, d2,
    staff: await h.createUser({ code: 'ST', dept: d1 }),
    head: await h.createUser({ code: 'HD', dept: d1, role: 'dept_head' }),
    act: await h.createUser({ code: 'AC', role: 'activity', mustAssemble: false }),
    exec: await h.createUser({ code: 'EX', role: 'executive', mustAssemble: false }),
    admin: await h.createUser({ code: 'AD', role: 'admin', mustAssemble: false }),
    other: await h.createUser({ code: 'OT', dept: d2 }),
    fresh: await h.createUser({ code: 'FR', dept: d1, ready: false }),
  };
  tok = {};
  for (const k of ['ST', 'HD', 'AC', 'EX', 'AD']) tok[k] = await h.login(k);
});

afterAll(async () => {
  h.clock.setNow(null);
  await h.db.close();
});

const DAY = '2026-11-16';
const ROLES = ['ST', 'HD', 'AC', 'EX', 'AD'];

// [method, path, body?, roles ที่ต้องได้ 2xx]
const MATRIX = [
  ['get', '/api/admin/users', null, ['AD']],
  ['get', '/api/admin/settings', null, ['AD']],
  ['get', '/api/admin/backups', null, ['AD']],
  ['get', '/api/admin/demo', null, ['AD']],
  ['get', '/api/admin/assembly-days', null, ['AC', 'AD']],
  ['get', `/api/reports/summary?from=${DAY}&to=${DAY}`, null, ['HD', 'AC', 'EX', 'AD']],
  ['get', `/api/reports/summary.csv?from=${DAY}&to=${DAY}`, null, ['HD', 'AC', 'EX', 'AD']],
  ['get', `/api/reports/official?from=${DAY}&to=${DAY}`, null, ['AC', 'EX', 'AD']],
  ['get', '/api/attendance/roster', null, ['HD', 'AC', 'EX', 'AD']],
  ['get', '/api/attendance/state', null, ROLES],
  ['get', '/api/attendance/me/history', null, ROLES],
  ['get', '/api/report-docs', null, ROLES],
  ['get', '/api/profile', null, ROLES],
];

describe('permission matrix: ทุกบทบาท × endpoint สำคัญ', () => {
  for (const [method, path, body, allowed] of MATRIX) {
    for (const role of ROLES) {
      const ok = allowed.includes(role);
      test(`${role} ${method.toUpperCase()} ${path.split('?')[0]} → ${ok ? '2xx' : '403'}`, async () => {
        h.clock.setNow(h.bkk(DAY, '10:00:00'));
        const r = await api(tok[role])[method](path).send(body || undefined);
        if (ok) expect(r.status).toBeLessThan(300);
        else expect(r.status).toBe(403);
      });
    }
  }
});

describe('ต้องเข้าสู่ระบบ', () => {
  test.each([
    '/api/attendance/state', '/api/admin/users', '/api/reports/summary', '/api/profile', '/api/report-docs',
  ])('ไม่มี token → 401 (%s)', async (p) => {
    await request(app).get(p).expect(401);
  });
  test('token ปลอม → 401', async () => {
    await request(app).get('/api/profile').set('Authorization', 'Bearer abc.def.ghi').expect(401);
  });
});

describe('บัญชีใหม่ต้องเปลี่ยนรหัสและยอมรับเงื่อนไขก่อน', () => {
  test('เข้าได้แต่ใช้ API อื่นไม่ได้จนกว่าจะเปลี่ยนรหัส', async () => {
    const r = await request(app).post('/api/auth/login').send({ username: 'FR', password: h.PASSWORD }).expect(200);
    const t = r.body.accessToken;
    const blocked = await request(app).get('/api/attendance/state').set('Authorization', `Bearer ${t}`);
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('MUST_CHANGE_PASSWORD');
    await request(app).post('/api/auth/change-password').set('Authorization', `Bearer ${t}`)
      .send({ currentPassword: h.PASSWORD, newPassword: 'NewPass-2569' }).expect(200);
    const login2 = await request(app).post('/api/auth/login').send({ username: 'FR', password: 'NewPass-2569' }).expect(200);
    const consent = await request(app).get('/api/attendance/state').set('Authorization', `Bearer ${login2.body.accessToken}`);
    expect(consent.body.code).toBe('MUST_CONSENT');
    await request(app).post('/api/auth/consent').set('Authorization', `Bearer ${login2.body.accessToken}`).send({ accept: true }).expect(200);
    await request(app).get('/api/attendance/state').set('Authorization', `Bearer ${login2.body.accessToken}`).expect(200);
  });
});

describe('refresh token', () => {
  const cookieOf = (res) => (res.headers['set-cookie'] || []).find((c) => c.startsWith('lineup_rt='))?.split(';')[0];
  test('หมุนเวียนทุกครั้ง และใช้ซ้ำ = เพิกถอนทุกเซสชัน', async () => {
    h.clock.setNow(null);
    const login = await request(app).post('/api/auth/login').send({ username: 'OT', password: h.PASSWORD }).expect(200);
    const c1 = cookieOf(login);
    const r1 = await request(app).post('/api/auth/refresh').set('Cookie', c1).expect(200);
    const c2 = cookieOf(r1);
    expect(c2).not.toBe(c1);
    // เลื่อนเวลาให้พ้นช่วงผ่อนผัน 30 วินาที แล้วใช้ token เก่าซ้ำ
    h.clock.setNow(new Date(Date.now() + 60_000));
    await request(app).post('/api/auth/refresh').set('Cookie', c1).expect(401);
    await request(app).post('/api/auth/refresh').set('Cookie', c2).expect(401); // ถูกเพิกถอนไปด้วย
    h.clock.setNow(null);
  });
  test('ออกจากระบบแล้ว refresh ไม่ได้', async () => {
    const login = await request(app).post('/api/auth/login').send({ username: 'OT', password: h.PASSWORD }).expect(200);
    const c = cookieOf(login);
    await request(app).post('/api/auth/logout').set('Cookie', c).expect(200);
    await request(app).post('/api/auth/refresh').set('Cookie', c).expect(401);
  });
});

describe('บัญชีถูกระงับ', () => {
  test('token เดิมใช้ไม่ได้ทันที และเข้าใหม่ไม่ได้', async () => {
    const t = await h.login('OT');
    await api(tok.AD).patch(`/api/admin/users/${ids.other}`).send({ active: false }).expect(200);
    await api(t).get('/api/profile').expect(401);
    await request(app).post('/api/auth/login').send({ username: 'OT', password: h.PASSWORD }).expect(403);
    await api(tok.AD).patch(`/api/admin/users/${ids.other}`).send({ active: true }).expect(200);
  });
  test('ผู้ดูแลลดสิทธิ์หรือระงับตัวเองไม่ได้', async () => {
    await api(tok.AD).patch(`/api/admin/users/${ids.admin}`).send({ role: 'staff' }).expect(400);
    await api(tok.AD).patch(`/api/admin/users/${ids.admin}`).send({ active: false }).expect(400);
  });
});

describe('ข้อมูลเข้าที่ไม่ถูกต้อง', () => {
  test('ข้อความ login ไม่บอกว่ามีผู้ใช้นี้หรือไม่', async () => {
    const a = await request(app).post('/api/auth/login').send({ username: 'nobody', password: 'x' });
    const b = await request(app).post('/api/auth/login').send({ username: 'ST', password: 'wrong' });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body.error).toBe(b.body.error);
  });
  test('SQL injection ในชื่อผู้ใช้ไม่ทำให้เข้าได้', async () => {
    await request(app).post('/api/auth/login').send({ username: "' OR '1'='1", password: "' OR '1'='1" }).expect(401);
  });
  test('ค่าตั้งค่าผิดรูปแบบถูกปฏิเสธ', async () => {
    await api(tok.AD).put('/api/admin/settings').send({ open_time: '25:00' }).expect(400);
    await api(tok.AD).put('/api/admin/settings').send({ geofence_radius_m: 5 }).expect(400);
    await api(tok.AD).put('/api/admin/settings').send({ check_mode: 'magic' }).expect(400);
    await api(tok.AD).put('/api/admin/settings').send({ not_a_key: '1' }).expect(400);
  });
  test('วันที่ผิดรูปแบบในรายงานถูกปฏิเสธ', async () => {
    await api(tok.AC).get('/api/reports/summary?from=2026-13-40&to=x').expect(400);
  });
  test('ครูบันทึกสถานะให้ตัวเองเป็น "ลา" ไม่ได้', async () => {
    h.clock.setNow(h.bkk(DAY, '07:45:00'));
    const r = await api(tok.ST).post('/api/attendance/record').send({ userId: ids.staff, status: 'leave' });
    expect(r.status).toBe(403);
  });
});

describe('HTTP security headers', () => {
  test('มี CSP, nosniff, และไม่มี x-powered-by', async () => {
    const r = await request(app).get('/api/health');
    expect(r.headers['content-security-policy']).toBeTruthy();
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['x-powered-by']).toBeUndefined();
  });
  test('refresh cookie เป็น httpOnly + SameSite=Strict + path จำกัด', async () => {
    const r = await request(app).post('/api/auth/login').send({ username: 'ST', password: h.PASSWORD }).expect(200);
    const c = (r.headers['set-cookie'] || []).find((x) => x.startsWith('lineup_rt='));
    expect(c).toMatch(/HttpOnly/i);
    expect(c).toMatch(/SameSite=Strict/i);
    expect(c).toMatch(/Path=\/api\/auth/i);
  });
});
