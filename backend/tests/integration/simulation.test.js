// ภาพจำลองการเข้าแถว (ผู้ดูแลระบบ): ทดลองกฎแบบอ่านอย่างเดียว ต้องให้ผลเหมือนการเช็กชื่อจริง และไม่เขียนฐานข้อมูล
const h = require('../helpers');

const { api, settings, CENTER, clock, bkk } = h;
const MON = '2026-11-09';
let tok;

beforeAll(async () => {
  await h.resetDb();
  const d = await h.createDept('อิเล็กทรอนิกส์');
  await h.createUser({ code: 'ADM', name: 'ผู้ดูแล', role: 'admin', mustAssemble: false });
  await h.createUser({ code: 'ACT', name: 'งานกิจกรรม', role: 'activity', mustAssemble: false });
  await h.createUser({ code: 'T1', name: 'ครู 1', dept: d });
  tok = { ADM: await h.login('ADM'), ACT: await h.login('ACT'), T1: await h.login('T1') };
});

afterAll(async () => {
  clock.setNow(null);
  await h.db.close();
});

const counts = async () => {
  const [a] = await h.db.query('SELECT COUNT(*) AS n FROM attendance');
  const [e] = await h.db.query('SELECT COUNT(*) AS n FROM attendance_events');
  const [l] = await h.db.query('SELECT COUNT(*) AS n FROM admin_logs');
  return [a.n, e.n, l.n];
};

describe('ภาพจำลอง: ทดลองกฎ', () => {
  test('เฉพาะผู้ดูแลระบบ', async () => {
    await api(tok.ACT).post('/api/admin/sim/evaluate').send({ points: [] }).expect(403);
    await api(tok.T1).get('/api/admin/sim/rules').expect(403);
    const r = (await api(tok.ADM).get('/api/admin/sim/rules').expect(200)).body;
    expect(r).toMatchObject({ mode: expect.any(String), radius: expect.any(Number), configured: true });
  });

  test('ผลตรงกับกฎ GPS / QR และไม่เขียนฐานข้อมูล', async () => {
    const before = await counts();
    const s = await settings.getAll();
    const points = [
      { dx: 0, dy: -40, accuracy: 10 }, // ในพื้นที่
      { dx: 0, dy: -(s.geofence_radius_m + 80), accuracy: 10 }, // นอกพื้นที่
      { dx: 0, dy: -20, accuracy: s.max_accuracy_m + 50 }, // GPS ไม่แม่น
      { gps: false, qr: true }, // ไม่มีพิกัดแต่ QR ถูกต้อง → ผ่าน
      { dx: 0, dy: -(s.geofence_radius_m + 80), accuracy: 10, qr: true }, // QR ถูกแต่นอกพื้นที่ → ไม่ผ่าน + ข้อความ
    ];
    const r = (await api(tok.ADM).post('/api/admin/sim/evaluate').send({ points, overrides: { mode: 'gps_or_qr' } }).expect(200)).body;
    expect(r.results.map((x) => [x.geo, x.status])).toEqual([
      ['in_zone', 'present'], ['out_of_zone', null], ['low_accuracy', null], ['no_location', 'present'], ['out_of_zone', null],
    ]);
    expect(r.results[4].message).toMatch(/QR ถูกต้องแต่พิกัดห่าง/);
    expect(r.assumedCenter).toBe(false);

    const q = (await api(tok.ADM).post('/api/admin/sim/evaluate').send({ points: [{ dx: 0, dy: -10, accuracy: 10 }], overrides: { mode: 'qr_required' } })).body;
    expect(q.results[0]).toMatchObject({ status: null, qrRequired: true });
    const big = (await api(tok.ADM).post('/api/admin/sim/evaluate').send({ points: [points[1]], overrides: { radius: 400 } })).body;
    expect(big.results[0].status).toBe('present');
    expect(await counts()).toEqual(before);
  });

  test('ผลทดลองตรงกับการเช็กชื่อจริงของครู', async () => {
    clock.setNow(bkk(MON, '07:45:00'));
    const s = await settings.getAll();
    const dy = -(s.geofence_radius_m + 80);
    const sim = (await api(tok.ADM).post('/api/admin/sim/evaluate').send({ points: [{ dx: 0, dy, accuracy: 10 }] })).body.results[0];
    const real = (await api(tok.T1).post('/api/attendance/check-in')
      .send({ lat: CENTER.lat + dy / 111320, lng: CENTER.lng, accuracy: 10, deviceId: 'd1' })).body;
    expect(real.needsReview).toBe(true);
    expect(real.geo).toBe(sim.geo);
    expect(real.message).toBe(sim.message);
  });

  test('ค่าทดลองนอกช่วงถูกปฏิเสธ · จำนวนจุดจำกัด', async () => {
    await api(tok.ADM).post('/api/admin/sim/evaluate').send({ points: [], overrides: { radius: 5 } }).expect(400);
    await api(tok.ADM).post('/api/admin/sim/evaluate').send({ points: Array(401).fill({ dx: 0, dy: 0 }) }).expect(400);
  });
});
