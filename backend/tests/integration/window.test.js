// สั่งเปิด / ปิดการเช็กชื่อด้วยมือ (งานกิจกรรม) — มีผลเฉพาะวันนั้น
const h = require('../helpers');

const { clock, api, bkk, CENTER } = h;
const MON = '2026-11-09'; // วันจันทร์
const TUE = '2026-11-10';
const SAT = '2026-11-07';
const near = { lat: CENTER.lat + 10 / 111_320, lng: CENTER.lng, accuracy: 15 };

let tok;

beforeAll(async () => {
  await h.resetDb();
  const d = await h.createDept('อิเล็กทรอนิกส์');
  await h.createUser({ code: 'A1', name: 'ครู A', dept: d });
  await h.createUser({ code: 'B1', name: 'ครู B', dept: d });
  await h.createUser({ code: 'ACT', name: 'งานกิจกรรม', role: 'activity', mustAssemble: false });
  await h.createUser({ code: 'HR1', name: 'งานบุคลากร', role: 'hr', mustAssemble: false });
  tok = {};
  for (const k of ['A1', 'B1', 'ACT', 'HR1']) tok[k] = await h.login(k);
});

afterAll(async () => {
  clock.setNow(null);
  await h.db.close();
});

describe('สั่งเปิด / ปิดการเช็กชื่อด้วยมือ', () => {
  test('เฉพาะงานกิจกรรม/ผู้ดูแล · คำสั่งต้องถูกต้อง', async () => {
    clock.setNow(bkk(MON, '07:00:00'));
    await api(tok.A1).post('/api/attendance/window').send({ mode: 'open' }).expect(403);
    await api(tok.HR1).post('/api/attendance/window').send({ mode: 'open' }).expect(403);
    await api(tok.ACT).post('/api/attendance/window').send({ mode: 'x' }).expect(400);
  });

  test('สั่งเปิดก่อนเวลา → เช็กชื่อได้ทันที แล้วสั่งปิดก่อนเวลา → เช็กไม่ได้', async () => {
    clock.setNow(bkk(MON, '07:00:00'));
    let s = (await api(tok.A1).get('/api/attendance/state')).body;
    expect(s).toMatchObject({ phase: 'before', manual: null });

    s = (await api(tok.ACT).post('/api/attendance/window').send({ mode: 'open' }).expect(200)).body;
    expect(s).toMatchObject({ phase: 'open', scheduledPhase: 'before', manual: { mode: 'open', by: 'งานกิจกรรม', at: '07:00' } });
    const r = await api(tok.A1).post('/api/attendance/check-in').send(near).expect(200);
    expect(r.body.record.status).toBe('present');

    clock.setNow(bkk(MON, '07:45:00'));
    s = (await api(tok.ACT).post('/api/attendance/window').send({ mode: 'closed' }).expect(200)).body;
    expect(s).toMatchObject({ phase: 'closed', scheduledPhase: 'open', manual: { mode: 'closed', at: '07:45' } });
    const c = await api(tok.B1).post('/api/attendance/check-in').send(near).expect(409);
    expect(c.body.code).toBe('CLOSED');
    expect(c.body.error).toContain('สั่งปิดเมื่อ 07:45');
    // ปิดแล้ว = คนที่ยังไม่เช็กนับเป็นขาด
    const rep = (await api(tok.ACT).get(`/api/reports/summary?from=${MON}&to=${MON}`)).body;
    expect(rep.total).toMatchObject({ present: 1, absent: 1, not_checked: 0 });
  });

  test('สั่งเปิดหลังหมดเวลา (เปิดซ้ำ) · กลับไปใช้ตามเวลา', async () => {
    clock.setNow(bkk(MON, '09:10:00'));
    await api(tok.ACT).post('/api/attendance/window').send({ mode: 'open' }).expect(200);
    await api(tok.B1).post('/api/attendance/check-in').send(near).expect(200);
    // งานบุคลากรสร้างรายงานไม่ได้ขณะเปิดด้วยมือ
    const hr = await api(tok.HR1).get(`/api/report-docs/preview?day=${MON}`);
    expect(hr.status).toBe(409);
    expect(hr.body.error).toContain('สั่งเปิดการเช็กชื่อด้วยมือ');

    const s = (await api(tok.ACT).post('/api/attendance/window').send({ mode: 'auto' }).expect(200)).body;
    expect(s).toMatchObject({ phase: 'closed', manual: null });
    const [log] = await h.db.query("SELECT target FROM admin_logs WHERE action = 'window.manual' ORDER BY id DESC LIMIT 1");
    expect(log.target).toBe(`${MON} auto`);
  });

  test('มีผลเฉพาะวันที่สั่ง — วันถัดไปกลับไปใช้ตามเวลา', async () => {
    clock.setNow(bkk(MON, '10:00:00'));
    await api(tok.ACT).post('/api/attendance/window').send({ mode: 'open' }).expect(200);
    clock.setNow(bkk(TUE, '10:00:00'));
    const s = (await api(tok.A1).get('/api/attendance/state')).body;
    expect(s).toMatchObject({ day: TUE, phase: 'closed', manual: null });
  });

  test('วันที่ไม่ใช่วันเข้าแถว สั่งเปิดไม่ได้', async () => {
    clock.setNow(bkk(SAT, '07:40:00'));
    const r = await api(tok.ACT).post('/api/attendance/window').send({ mode: 'open' });
    expect(r.status).toBe(409);
    expect((await api(tok.A1).get('/api/attendance/state')).body.phase).toBe('no_assembly');
  });
});
