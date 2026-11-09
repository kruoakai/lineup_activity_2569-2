const h = require('../helpers');

const { clock, api, bkk, CENTER } = h;
const MON = '2026-11-09'; // วันจันทร์
const SAT = '2026-11-07';

// พิกัดห่างจากศูนย์กลางไปทางเหนือ ~ n เมตร
const north = (m) => ({ lat: CENTER.lat + m / 111_320, lng: CENTER.lng, accuracy: 15 });

let ids;
let tok;

beforeAll(async () => {
  await h.resetDb();
  const elec = await h.createDept('อิเล็กทรอนิกส์');
  const it = await h.createDept('เทคโนโลยีสารสนเทศ');
  ids = {
    elec, it,
    a: await h.createUser({ code: 'A1', name: 'ครู A', dept: elec }),
    b: await h.createUser({ code: 'B1', name: 'ครู B', dept: elec }),
    c: await h.createUser({ code: 'C1', name: 'ครู C', dept: elec }),
    proxy: await h.createUser({ code: 'P1', name: 'ครูผู้รับมอบหมาย', dept: elec, canProxy: true }),
    other: await h.createUser({ code: 'O1', name: 'ครูต่างแผนก', dept: it }),
    head: await h.createUser({ code: 'H1', name: 'หัวหน้าแผนก IT', dept: it, role: 'dept_head' }),
    act: await h.createUser({ code: 'ACT', name: 'งานกิจกรรม', role: 'activity', mustAssemble: false }),
    admin: await h.createUser({ code: 'ADM', name: 'ผู้ดูแล', role: 'admin', mustAssemble: false }),
    fresh: await h.createUser({ code: 'NEW', name: 'ผู้ใช้ใหม่', dept: it, ready: false }),
  };
  tok = {};
  for (const k of ['A1', 'B1', 'C1', 'P1', 'O1', 'H1', 'ACT', 'ADM', 'NEW']) tok[k] = await h.login(k);
});

afterAll(async () => {
  clock.setNow(null);
  await h.db.close();
});

describe('ช่วงเวลาเช็กชื่อ', () => {
  test('T01 เช็กชื่อเวลา 07:29 — ไม่อนุญาต', async () => {
    clock.setNow(bkk(MON, '07:29:59'));
    const r = await api(tok.A1).post('/api/attendance/check-in').send(north(10));
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('NOT_OPEN');
  });

  test('T02 เช็กชื่อเวลา 07:30 — สำเร็จ', async () => {
    clock.setNow(bkk(MON, '07:30:00'));
    const r = await api(tok.A1).post('/api/attendance/check-in').send(north(10));
    expect(r.status).toBe(200);
    expect(r.body.record.status).toBe('present');
    expect(r.body.record.method).toBe('self_gps');
  });

  test('T03 เช็กชื่อเวลา 08:30:59 — ยังทัน (นับนาทีที่ 08:30)', async () => {
    clock.setNow(bkk(MON, '08:30:59'));
    const r = await api(tok.B1).post('/api/attendance/check-in').send(north(20));
    expect(r.status).toBe(200);
    expect(r.body.record.status).toBe('present');
  });

  test('T04 เช็กชื่อหลัง 08:30 — บุคลากรทั่วไปทำไม่ได้', async () => {
    clock.setNow(bkk(MON, '08:31:00'));
    const r = await api(tok.C1).post('/api/attendance/check-in').send(north(20));
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('CLOSED');
  });

  test('วันเสาร์ไม่มีการเข้าแถว', async () => {
    clock.setNow(bkk(SAT, '08:00:00'));
    const r = await api(tok.C1).post('/api/attendance/check-in').send(north(20));
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('NO_ASSEMBLY');
  });

  test('วันที่ถูกประกาศงดเข้าแถว', async () => {
    await api(tok.ACT).put('/api/admin/assembly-days/2026-11-10').send({ status: 'cancelled', note: 'ฝนตก' }).expect(200);
    clock.setNow(bkk('2026-11-10', '08:00:00'));
    const r = await api(tok.C1).post('/api/attendance/check-in').send(north(20));
    expect(r.status).toBe(409);
    expect(r.body.error).toContain('ฝนตก');
  });
});

describe('พื้นที่และวิธีเช็กชื่อ', () => {
  const DAY = '2026-11-11';
  beforeAll(() => clock.setNow(bkk(DAY, '07:45:00')));

  test('T05 อยู่ในพื้นที่ — ผ่าน', async () => {
    const r = await api(tok.A1).post('/api/attendance/check-in').send(north(140));
    expect(r.body.record.status).toBe('present');
    expect(r.body.record.distance_m).toBeGreaterThan(130);
  });

  test('T06 อยู่นอกพื้นที่ — ไม่บันทึก แต่เสนอให้ส่งตรวจสอบ', async () => {
    const r = await api(tok.B1).post('/api/attendance/check-in').send(north(600));
    expect(r.status).toBe(200);
    expect(r.body.needsReview).toBe(true);
    expect(r.body.geo).toBe('out_of_zone');
    const st = await api(tok.B1).get('/api/attendance/state');
    expect(st.body.record).toBeNull();
  });

  test('T06b นอกพื้นที่ + ส่งคำขอตรวจสอบ — สถานะรอตรวจสอบ', async () => {
    const r = await api(tok.B1).post('/api/attendance/check-in').send({ ...north(600), requestReview: true, note: 'ยืนอยู่หลังอาคาร' });
    expect(r.body.record.status).toBe('pending');
  });

  test('GPS ไม่แม่นยำ — ส่งตรวจสอบ', async () => {
    const r = await api(tok.C1).post('/api/attendance/check-in').send({ ...north(10), accuracy: 500 });
    expect(r.body.needsReview).toBe(true);
    expect(r.body.geo).toBe('low_accuracy');
  });

  test('QR ถูกต้อง แม้ GPS ไม่แม่นยำ — ผ่านด้วยวิธี QR', async () => {
    const q = await api(tok.ACT).get('/api/attendance/qr/current').expect(200);
    const r = await api(tok.C1).post('/api/attendance/check-in').send({ ...north(10), accuracy: 500, qrToken: q.body.token });
    expect(r.body.record.status).toBe('present');
    expect(r.body.record.method).toBe('self_qr');
  });

  test('QR ปลอมหรือหมดอายุ — ปฏิเสธ', async () => {
    const q = await api(tok.ACT).get('/api/attendance/qr/current');
    clock.setNow(new Date(bkk(DAY, '07:45:00').getTime() + 10 * 60_000));
    const r = await api(tok.O1).post('/api/attendance/check-in').send({ ...north(10), qrToken: q.body.token });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('QR_INVALID');
    const fake = await api(tok.O1).post('/api/attendance/check-in').send({ ...north(10), qrToken: '123.AAAAAAAAAAAAAAAAAAAAAA' });
    expect(fake.status).toBe(400);
    clock.setNow(bkk(DAY, '07:45:00'));
  });

  test('บุคลากรทั่วไปขอ QR ไม่ได้', async () => {
    await api(tok.A1).get('/api/attendance/qr/current').expect(403);
  });

  test('T07 เช็กชื่อซ้ำ — ไม่เกิดข้อมูลซ้ำ', async () => {
    const r = await api(tok.A1).post('/api/attendance/check-in').send(north(10));
    expect(r.body.alreadyChecked).toBe(true);
    const rows = await h.db.query('SELECT COUNT(*) AS n FROM attendance WHERE user_id = ? AND day = ?', [ids.a, DAY]);
    expect(rows[0].n).toBe(1);
  });

  test('กดพร้อมกันหลายครั้ง — ยังได้ 1 แถว', async () => {
    const reqs = Array.from({ length: 5 }, () => api(tok.O1).post('/api/attendance/check-in').send(north(5)));
    const res = await Promise.all(reqs);
    expect(res.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
    const rows = await h.db.query('SELECT COUNT(*) AS n FROM attendance WHERE user_id = ? AND day = ?', [ids.other, DAY]);
    expect(rows[0].n).toBe(1);
  });

  test('อุปกรณ์เดียวกันเช็กให้หลายบัญชี — ติดธงตรวจสอบ', async () => {
    const DAY2 = '2026-11-12';
    clock.setNow(bkk(DAY2, '07:40:00'));
    await api(tok.A1).post('/api/attendance/check-in').send({ ...north(5), deviceId: 'dev-xyz' }).expect(200);
    const r = await api(tok.B1).post('/api/attendance/check-in').send({ ...north(5), deviceId: 'dev-xyz' });
    expect(r.body.record.flagged).toBe(1);
    const [first] = await h.db.query('SELECT flagged FROM attendance WHERE user_id = ? AND day = ?', [ids.a, DAY2]);
    expect(first.flagged).toBe(1);
    clock.setNow(bkk(DAY, '07:45:00'));
  });
});

describe('การเช็กแทนและสิทธิ์', () => {
  const DAY = '2026-11-13';

  test('T08 ครูผู้รับมอบหมายเช็กแทนคนในแผนก — สำเร็จ และบันทึกผู้เช็ก', async () => {
    clock.setNow(bkk(DAY, '07:50:00'));
    const r = await api(tok.P1).post('/api/attendance/record').send({ userId: ids.a, status: 'present' });
    expect(r.status).toBe(200);
    expect(r.body.record.method).toBe('proxy_dept');
    expect(r.body.record.checked_by_name).toBe('ครูผู้รับมอบหมาย');
  });

  test('T09 ครูเช็กแทนคนต่างแผนก — ปฏิเสธ', async () => {
    const r = await api(tok.P1).post('/api/attendance/record').send({ userId: ids.other, status: 'present' });
    expect(r.status).toBe(403);
  });

  test('ครูที่ไม่ได้รับมอบหมายเช็กแทน — ปฏิเสธ', async () => {
    const r = await api(tok.B1).post('/api/attendance/record').send({ userId: ids.c, status: 'present' });
    expect(r.status).toBe(403);
  });

  test('ครูในแผนกบันทึก "ไปราชการ" ไม่ได้', async () => {
    const r = await api(tok.P1).post('/api/attendance/record').send({ userId: ids.b, status: 'official', reason: 'x' });
    expect(r.status).toBe(403);
  });

  test('ครูในแผนกเช็กแทนหลังปิดระบบไม่ได้', async () => {
    clock.setNow(bkk(DAY, '08:45:00'));
    const r = await api(tok.P1).post('/api/attendance/record').send({ userId: ids.c, status: 'present' });
    expect(r.status).toBe(403);
    clock.setNow(bkk(DAY, '07:50:00'));
  });

  test('T10 งานกิจกรรมบันทึก "ไปราชการ" — ต้องมีเหตุผล และบันทึกผู้ดำเนินการ', async () => {
    const noReason = await api(tok.ACT).post('/api/attendance/record').send({ userId: ids.b, status: 'official' });
    expect(noReason.status).toBe(400);
    const r = await api(tok.ACT).post('/api/attendance/record').send({ userId: ids.b, status: 'official', reason: 'หนังสือที่ ศธ 0601/123' });
    expect(r.status).toBe(200);
    expect(r.body.record.method).toBe('proxy_activity');
    expect(r.body.record.checked_by_name).toBe('งานกิจกรรม');
  });

  test('ผู้ที่ไปราชการแล้วกดเช็กชื่อเอง — สถานะเดิมไม่ถูกทับ', async () => {
    const r = await api(tok.B1).post('/api/attendance/check-in').send(north(5));
    expect(r.body.alreadyChecked).toBe(true);
    expect(r.body.record.status).toBe('official');
  });

  test('T11 Admin แก้ไขย้อนหลัง — ต้องมีเหตุผลและมีประวัติ', async () => {
    clock.setNow(bkk('2026-11-16', '10:00:00'));
    const noReason = await api(tok.ADM).post('/api/attendance/record').send({ userId: ids.c, status: 'present', day: DAY });
    expect(noReason.status).toBe(400);
    const r = await api(tok.ADM).post('/api/attendance/record').send({ userId: ids.c, status: 'present', day: DAY, reason: 'มีภาพถ่ายยืนยัน' });
    expect(r.status).toBe(200);
    const r2 = await api(tok.ADM).post('/api/attendance/record').send({ userId: ids.c, status: 'leave', day: DAY, reason: 'ยื่นใบลาย้อนหลัง' });
    expect(r2.status).toBe(200);
    const ev = await api(tok.ADM).get(`/api/attendance/${r2.body.record.id}/events`);
    expect(ev.body.items.map((e) => e.new_status)).toEqual(['present', 'leave']);
    expect(ev.body.items[1].old_status).toBe('present');
    expect(ev.body.items[1].reason).toBe('ยื่นใบลาย้อนหลัง');
  });

  test('บันทึกล่วงหน้าไม่ได้', async () => {
    const r = await api(tok.ADM).post('/api/attendance/record').send({ userId: ids.c, status: 'official', day: '2027-01-04', reason: 'x' });
    expect(r.status).toBe(400);
  });

  test('งานกิจกรรมอนุมัติคำขอรอตรวจสอบ', async () => {
    const [p] = await h.db.query("SELECT id FROM attendance WHERE user_id = ? AND status = 'pending'", [ids.b]);
    expect(p).toBeTruthy();
    clock.setNow(bkk('2026-11-11', '08:10:00'));
    const r = await api(tok.ACT).post('/api/attendance/record').send({ userId: ids.b, status: 'present', reason: 'เห็นตัวที่จุดเข้าแถว' });
    expect(r.body.record.status).toBe('present');
    const ev = await api(tok.ACT).get(`/api/attendance/${p.id}/events`);
    expect(ev.body.items.at(-1).action).toBe('review');
  });
});

describe('ผู้ใช้ใหม่และการยืนยันตัวตน', () => {
  test('ต้องเปลี่ยนรหัสผ่านและยอมรับเงื่อนไขก่อนใช้งาน', async () => {
    let r = await api(tok.NEW).get('/api/attendance/state');
    expect(r.body.code).toBe('MUST_CHANGE_PASSWORD');
    r = await api(tok.NEW).post('/api/auth/change-password').send({ currentPassword: h.PASSWORD, newPassword: 'ChaiyaphumTC2569' });
    expect(r.status).toBe(200);
    const t = r.body.accessToken;
    r = await api(t).get('/api/attendance/state');
    expect(r.body.code).toBe('MUST_CONSENT');
    await api(t).post('/api/auth/consent').send({ accept: true }).expect(200);
    await api(t).get('/api/attendance/state').expect(200);
  });

  test('รหัสผ่านผิด', async () => {
    const r = await h.request(h.app).post('/api/auth/login').send({ username: 'A1', password: 'wrong' });
    expect(r.status).toBe(401);
  });

  test('login ด้วยอีเมลได้ และ refresh token หมุนเวียน', async () => {
    const agent = h.request.agent(h.app);
    const r = await agent.post('/api/auth/login').send({ username: 'a1@test.local', password: h.PASSWORD });
    expect(r.status).toBe(200);
    const cookie = r.headers['set-cookie'][0].split(';')[0];
    const r1 = await h.request(h.app).post('/api/auth/refresh').set('Cookie', cookie);
    expect(r1.status).toBe(200);
    // ใช้ token เดิมซ้ำหลังพ้นช่วงผ่อนผัน — ถูกปฏิเสธ
    clock.setNow(new Date(clock.now().getTime() + 60_000));
    const r2 = await h.request(h.app).post('/api/auth/refresh').set('Cookie', cookie);
    expect(r2.status).toBe(401);
  });

  test('ไม่มี token', async () => {
    await h.request(h.app).get('/api/attendance/state').expect(401);
  });

  test('บุคลากรทั่วไปเข้าหน้าผู้ดูแลไม่ได้', async () => {
    await api(tok.A1).get('/api/admin/users').expect(403);
    await api(tok.ACT).get('/api/admin/users').expect(403);
  });

  test('ระงับบัญชีแล้วใช้ token เดิมไม่ได้ทันที', async () => {
    await api(tok.ADM).patch(`/api/admin/users/${ids.c}`).send({ active: false }).expect(200);
    await api(tok.C1).get('/api/attendance/state').expect(401);
    await api(tok.ADM).patch(`/api/admin/users/${ids.c}`).send({ active: true }).expect(200);
  });
});

describe('รายงาน', () => {
  test('T12 สรุปรายวัน — จำนวนตรงกับข้อมูลจริง (คนที่ไม่เช็กหลังปิดระบบนับเป็นขาด)', async () => {
    clock.setNow(bkk('2026-11-16', '10:00:00'));
    const r = await api(tok.ACT).get('/api/reports/summary?from=2026-11-13&to=2026-11-13');
    expect(r.status).toBe(200);
    const t = r.body.total;
    // ผู้ต้องเข้าแถว: A1 B1 C1 P1 O1 H1 NEW = 7
    expect(t.members).toBe(7);
    expect(t.expected).toBe(7);
    expect(t.present).toBe(1); // A (เช็กแทน)
    expect(t.official).toBe(1); // B
    expect(t.leave).toBe(1); // C (แก้ย้อนหลัง)
    expect(t.absent).toBe(4); // P1 O1 H1 NEW
    expect(t.present + t.absent + t.official + t.policy + t.leave + t.pending + t.not_checked).toBe(t.expected);
    expect(t.rate).toBe(Math.round((1 / (7 - 2)) * 1000) / 10);
  });

  test('ช่วงวันที่ข้ามวันหยุด/วันงด — นับเฉพาะวันเข้าแถว', async () => {
    const r = await api(tok.ADM).get('/api/reports/summary?from=2026-11-07&to=2026-11-13');
    // เสาร์ 7, อาทิตย์ 8, อังคาร 10 (งด) ไม่นับ => จ.9 พ.11 พฤ.12 ศ.13 = 4 วัน
    expect(r.body.days).toBe(4);
  });

  test('หัวหน้าแผนกเห็นเฉพาะแผนกตัวเอง', async () => {
    const r = await api(tok.H1).get(`/api/reports/summary?from=2026-11-13&to=2026-11-13&departmentId=${ids.elec}`);
    expect(r.status).toBe(200);
    expect(r.body.departments.map((d) => d.department_id)).toEqual([ids.it]);
    const roster = await api(tok.H1).get(`/api/attendance/roster?departmentId=${ids.elec}`);
    expect(roster.body.items.every((x) => x.department_id === ids.it)).toBe(true);
  });

  test('บุคลากรทั่วไปดูรายงานไม่ได้', async () => {
    await api(tok.A1).get('/api/reports/summary?from=2026-11-13&to=2026-11-13').expect(403);
  });

  test('ส่งออก CSV มี BOM และกัน formula injection', async () => {
    await h.db.query("UPDATE users SET full_name = '=HYPERLINK(1)' WHERE id = ?", [ids.a]);
    const r = await api(tok.ACT).get('/api/reports/summary.csv?from=2026-11-13&to=2026-11-13');
    expect(r.status).toBe(200);
    expect(r.text.charCodeAt(0)).toBe(0xfeff);
    expect(r.text).toContain("'=HYPERLINK(1)");
  });
});

describe('สถิติของฉัน', () => {
  test('ข้อมูลรายวัน: วันเข้าแถว/วันหยุด/วันที่นับ และเฉพาะข้อมูลของตนเอง', async () => {
    await h.db.query("UPDATE users SET created_at = '2026-10-01 00:00:00' WHERE id IN (?)", [[ids.c, ids.b]]);
    await h.db.query("INSERT INTO semesters (name, start_date, end_date) VALUES ('2/2569', '2026-11-01', '2027-03-31')");
    await h.db.query("INSERT INTO assembly_days (day, status, note) VALUES ('2026-11-04', 'holiday', 'วันหยุดทดสอบ')");
    clock.setNow(bkk('2026-11-06', '07:30:00'));
    await h.db.query(
      `INSERT INTO attendance (user_id, day, status, method, checked_by, checked_at) VALUES
       (?, '2026-11-02', 'present', 'self_gps', ?, '2026-11-02 01:05:00'),
       (?, '2026-11-03', 'leave', 'hr', ?, '2026-11-03 02:00:00'),
       (?, '2026-11-02', 'present', 'self_gps', ?, '2026-11-02 01:00:00')`,
      [ids.c, ids.c, ids.c, ids.admin, ids.b, ids.b],
    );
    const r = await api(tok.C1).get('/api/attendance/me/stats?from=2026-11-01&to=2026-11-30').expect(200);
    expect(r.body.to).toBe('2026-11-06'); // ไม่เกินวันนี้
    expect(r.body.records.map((x) => x.day)).toEqual(['2026-11-02', '2026-11-03']);
    const day = (d) => r.body.days.find((x) => x.day === d);
    expect(day('2026-11-01')).toMatchObject({ assembly: false, counted: false }); // อาทิตย์
    expect(day('2026-11-04')).toMatchObject({ assembly: false, note: 'วันหยุดทดสอบ' });
    expect(day('2026-11-05')).toMatchObject({ assembly: true, counted: true });
    expect(day('2026-11-06')).toMatchObject({ assembly: true, counted: false }); // ยังไม่ปิดระบบ
    expect(r.body.presets.semester).toMatchObject({ label: 'ภาคเรียน 2/2569', from: '2026-11-01', to: '2026-11-06' });
    expect(r.body.presets.year.label).toBe('ปีการศึกษา 2569');
    expect(r.body.closeTime).toMatch(/^\d{2}:\d{2}/);
    // ค่าเริ่มต้น = ภาคเรียนปัจจุบัน
    expect((await api(tok.C1).get('/api/attendance/me/stats').expect(200)).body.from).toBe('2026-11-01');
    await api(tok.C1).get('/api/attendance/me/stats?from=2025-01-01&to=2026-11-06').expect(400);
    await api(tok.C1).get('/api/attendance/me/stats?from=bad').expect(400);
    clock.setNow(null);
  });
});
