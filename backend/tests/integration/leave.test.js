// ครู/บุคลากรแจ้งลา ไปราชการ งานนโยบายเอง → เจ้าหน้าที่บุคลากรตรวจ (บันทึก / ไม่อนุมัติ) → ลงรายงานประจำวัน
const h = require('../helpers');

const { api, clock, bkk } = h;
const JPEG = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]).toString('base64')}`;
let ids;
let hr;
let t1;
let t2;

beforeAll(async () => {
  await h.resetDb();
  const d = await h.createDept('เทคโนโลยีสารสนเทศ');
  ids = {
    hr: await h.createUser({ code: 'HR1', name: 'เจ้าหน้าที่บุคลากร', role: 'hr', mustAssemble: false }),
    t1: await h.createUser({ code: 'T1', name: 'ครูหนึ่ง', dept: d }),
    t2: await h.createUser({ code: 'T2', name: 'ครูสอง', dept: d }),
  };
  hr = api(await h.login('HR1'));
  t1 = api(await h.login('T1'));
  t2 = api(await h.login('T2'));
});
afterAll(async () => { clock.setNow(null); await h.db.close(); });

test('แจ้งเอง: ตรวจเงื่อนไข (ประเภท รายละเอียด ย้อนหลัง 3 วันทำการ ทับช่วงเดิม)', async () => {
  clock.setNow(bkk('2027-02-03', '08:00:00')); // พุธ
  const m = await t1.get('/api/leave/meta').expect(200);
  expect(m.body).toMatchObject({ today: '2027-02-03', earliest: '2027-01-29' }); // ย้อน พ. → อ. จ. ศ.
  expect((await t1.post('/api/leave').send({ kind: 'nap', from: '2027-02-03' })).status).toBe(400);
  expect((await t1.post('/api/leave').send({ kind: 'official', from: '2027-02-03' })).body.error).toMatch('รายละเอียด');
  expect((await t1.post('/api/leave').send({ kind: 'sick', from: '2027-01-28' })).body.error).toMatch('ย้อนหลัง');
  expect((await t1.post('/api/leave').send({ kind: 'sick', from: '2027-02-06', to: '2027-02-07' })).body.error).toMatch('ไม่มีวันทำงาน');

  const a = await t1.post('/api/leave').send({ kind: 'official', from: '2027-02-04', to: '2027-02-05', note: 'ประชุมที่ สอศ.', photos: [JPEG] }).expect(201);
  expect(a.body).toMatchObject({ kind_label: 'ไปราชการ', from: '2027-02-04', to: '2027-02-05', status: 'pending', photo_count: 1 });
  expect((await t1.post('/api/leave').send({ kind: 'sick', from: '2027-02-05' })).status).toBe(409);
  await t1.get(`/api/leave/${a.body.id}/photos/0`).expect(200);
  await t2.get(`/api/leave/${a.body.id}/photos/0`).expect(403);
  await hr.get(`/api/leave/${a.body.id}/photos/0`).expect(200);
});

test('ครูตรวจคำแจ้งไม่ได้ · เจ้าหน้าที่เห็นจำนวนรอตรวจ · ผู้แจ้งยกเลิกเองได้ระหว่างรอ', async () => {
  await t1.get('/api/leave/review').expect(403);
  expect((await t1.get('/api/leave/review/count').expect(200)).body.count).toBe(0);
  const b = await t2.post('/api/leave').send({ kind: 'personal', from: '2027-02-03' }).expect(201);
  expect((await hr.get('/api/leave/review/count').expect(200)).body.count).toBe(2);
  await t1.post(`/api/leave/${b.body.id}/cancel`).expect(403);
  expect((await t2.post(`/api/leave/${b.body.id}/cancel`).expect(200)).body.status).toBe('cancelled');
  expect((await hr.get('/api/leave/review/count')).body.count).toBe(1);
});

test('บันทึก → ลงสถานะทุกวันทำงานในช่วง · แจ้งเตือนวันที่มีรายงานแล้ว · ตรวจซ้ำไม่ได้', async () => {
  const [req] = (await hr.get('/api/leave/review').expect(200)).body.items;
  expect(req).toMatchObject({ name: 'ครูหนึ่ง', days: ['2027-02-04', '2027-02-05'], existing: [] });
  await h.db.query(
    "INSERT INTO report_docs (kind, title, period_from, period_to, snapshot, snapshot_hash, steps, created_by, created_at) VALUES ('hr_daily', 't', '2027-02-04', '2027-02-04', '{}', 'x', '[]', ?, NOW())", [ids.hr]);
  const r = await hr.post(`/api/leave/${req.id}/approve`).expect(200);
  expect(r.body.days).toEqual(['2027-02-04', '2027-02-05']);
  expect(r.body.docs.map((x) => x.day)).toEqual(['2027-02-04']);
  const att = await h.db.query("SELECT DATE_FORMAT(day, '%Y-%m-%d') AS day, status, method, note FROM attendance WHERE user_id = ? ORDER BY day", [ids.t1]);
  expect(att).toEqual([
    { day: '2027-02-04', status: 'official', method: 'hr', note: 'ประชุมที่ สอศ.' },
    { day: '2027-02-05', status: 'official', method: 'hr', note: 'ประชุมที่ สอศ.' },
  ]);
  expect((await hr.post(`/api/leave/${req.id}/approve`)).status).toBe(409);
  const mine = (await t1.get('/api/leave/mine').expect(200)).body.items;
  expect(mine[0]).toMatchObject({ status: 'approved', reviewed_by_name: 'เจ้าหน้าที่บุคลากร' });
  await t1.post(`/api/leave/${req.id}/cancel`).expect(409);
});

test('ไม่อนุมัติต้องมีเหตุผล ผู้แจ้งเห็นเหตุผล และไม่ลงรายงาน', async () => {
  const c = await t2.post('/api/leave').send({ kind: 'sick', from: '2027-02-08', note: 'ไข้' }).expect(201);
  expect((await hr.post(`/api/leave/${c.body.id}/reject`).send({ reason: ' ' })).status).toBe(400);
  await t2.post(`/api/leave/${c.body.id}/reject`).send({ reason: 'x' }).expect(403);
  await hr.post(`/api/leave/${c.body.id}/reject`).send({ reason: 'ไม่ได้แนบใบรับรองแพทย์' }).expect(200);
  const mine = (await t2.get('/api/leave/mine')).body.items.find((x) => x.id === c.body.id);
  expect(mine).toMatchObject({ status: 'rejected', review_note: 'ไม่ได้แนบใบรับรองแพทย์' });
  expect((await h.db.query("SELECT COUNT(*) AS n FROM attendance WHERE user_id = ? AND day = '2027-02-08'", [ids.t2]))[0].n).toBe(0);
  const done = (await hr.get('/api/leave/review?status=done')).body.items;
  expect(done.map((x) => x.status).sort()).toEqual(['approved', 'rejected']);
});
