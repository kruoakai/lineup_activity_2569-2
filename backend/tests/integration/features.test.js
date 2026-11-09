const fs = require('fs');
const path = require('path');
const h = require('../helpers');
const mailer = require('../../src/services/mailer');

const { clock, api, bkk, CENTER } = h;
const MON = '2026-11-16';
const JPEG = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]).toString('base64')}`;
const PNG = `data:image/png;base64,${Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]).toString('base64')}`;
const near = { lat: CENTER.lat + 0.0001, lng: CENTER.lng, accuracy: 10 };

let ids;
let tok;
const outbox = [];

beforeAll(async () => {
  mailer.useTestOutbox(outbox);
  await h.resetDb();
  const it = await h.createDept('เทคโลโลยีสารสนเทศ');
  const acc = await h.createDept('การบัญชี');
  await require('../../src/services/reportGroups').applyDefaults();
  ids = {
    it, acc,
    a: await h.createUser({ code: 'A1', name: 'ครู A', dept: it }),
    b: await h.createUser({ code: 'B1', name: 'ครู B', dept: it }),
    c: await h.createUser({ code: 'C1', name: 'ครู C', dept: acc }),
    act: await h.createUser({ code: 'ACT', name: 'งานกิจกรรม', role: 'activity', mustAssemble: false }),
    admin: await h.createUser({ code: 'ADM', name: 'ผู้ดูแล', role: 'admin', mustAssemble: false }),
    s1: await h.createUser({ code: 'S1', name: 'หัวหน้างานแนะแนว', mustAssemble: false }),
    s2: await h.createUser({ code: 'S2', name: 'รองผู้อำนวยการ', role: 'executive', mustAssemble: false }),
    s3: await h.createUser({ code: 'S3', name: 'ผู้อำนวยการ', role: 'executive', mustAssemble: false }),
    hr: await h.createUser({ code: 'HR1', name: 'เจ้าหน้าที่บุคลากร', role: 'hr', mustAssemble: false }),
  };
  tok = {};
  for (const k of ['A1', 'B1', 'C1', 'ACT', 'ADM', 'S1', 'S2', 'S3', 'HR1']) tok[k] = await h.login(k);
});

afterAll(async () => {
  clock.setNow(null);
  mailer.useTestOutbox(null);
  await h.db.close();
});

describe('ลืมรหัสผ่าน (อีเมล)', () => {
  test('ขอรีเซ็ต → ได้อีเมลพร้อมลิงก์ → ตั้งรหัสใหม่ → ลิงก์ใช้ซ้ำไม่ได้', async () => {
    const r = await h.request(h.app).post('/api/auth/forgot').send({ identifier: 'A1' });
    expect(r.status).toBe(200);
    expect(outbox).toHaveLength(1);
    expect(outbox[0].to).toBe('A1@test.local');
    const token = /token=([A-Za-z0-9_-]+)/.exec(outbox[0].text)[1];
    const ok = await h.request(h.app).post('/api/auth/reset').send({ token, newPassword: 'BrandNewPass1' });
    expect(ok.status).toBe(200);
    const again = await h.request(h.app).post('/api/auth/reset').send({ token, newPassword: 'Another123x' });
    expect(again.status).toBe(400);
    const login = await h.request(h.app).post('/api/auth/login').send({ username: 'A1', password: 'BrandNewPass1' });
    expect(login.status).toBe(200);
    tok.A1 = login.body.accessToken;
  });

  test('บัญชีที่ไม่มีอยู่ ตอบเหมือนกัน และไม่ส่งอีเมล', async () => {
    const r = await h.request(h.app).post('/api/auth/forgot').send({ identifier: 'nobody@x.y' });
    expect(r.status).toBe(200);
    expect(outbox).toHaveLength(1);
  });

  test('ลิงก์หมดอายุหลัง 30 นาที', async () => {
    await h.request(h.app).post('/api/auth/forgot').send({ identifier: 'B1' });
    const token = /token=([A-Za-z0-9_-]+)/.exec(outbox.at(-1).text)[1];
    clock.setNow(new Date(Date.now() + 31 * 60_000));
    const r = await h.request(h.app).post('/api/auth/reset').send({ token, newPassword: 'BrandNewPass1' });
    expect(r.status).toBe(400);
    clock.setNow(null);
  });
});

describe('โปรไฟล์', () => {
  test('แก้ตำแหน่ง/เบอร์โทร, รูปโปรไฟล์, ลายเซ็น (ยืนยันรหัส), อีเมล (ยืนยันรหัส)', async () => {
    let r = await api(tok.B1).put('/api/profile').send({ position_title: 'ครูชำนาญการ', phone: '081-234-5678' });
    expect(r.body.user.position_title).toBe('ครูชำนาญการ');
    r = await api(tok.B1).post('/api/profile/avatar').send({ image: JPEG });
    expect(r.body.user.has_avatar).toBe(true);
    await api(tok.A1).get(`/api/profile/avatar/${ids.b}`).expect(200);
    r = await api(tok.B1).post('/api/profile/signature').send({ image: PNG });
    expect(r.status).toBe(400);
    r = await api(tok.B1).post('/api/profile/signature').send({ image: PNG, password: 'wrong' });
    expect(r.status).toBe(403);
    r = await api(tok.B1).post('/api/profile/signature').send({ image: PNG, password: h.PASSWORD });
    expect(r.body.user.has_signature).toBe(true);
    r = await api(tok.B1).put('/api/profile/email').send({ email: 'b.new@ccollege.ac.th', password: h.PASSWORD });
    expect(r.body.user.email).toBe('b.new@ccollege.ac.th');
  });
});

describe('รูปหลักฐานสูงสุด 3 รูป', () => {
  test('เช็กชื่อพร้อม 2 รูป, เพิ่มได้อีก 1, เกินกว่านั้นปฏิเสธ', async () => {
    clock.setNow(bkk(MON, '07:40:00'));
    const r = await api(tok.C1).post('/api/attendance/check-in').send({ ...near, photos: [JPEG, JPEG] });
    expect(r.body.record.photo_count).toBe(2);
    const id = r.body.record.id;
    await api(tok.C1).post(`/api/attendance/${id}/photos`).send({ photos: [JPEG] }).expect(200);
    const over = await api(tok.C1).post(`/api/attendance/${id}/photos`).send({ photos: [JPEG] });
    expect(over.status).toBe(400);
    const four = await api(tok.B1).post('/api/attendance/check-in').send({ ...near, photos: [JPEG, JPEG, JPEG, JPEG] });
    expect(four.status).toBe(400);
    const list = await api(tok.ACT).get(`/api/attendance/${id}/photos`);
    expect(list.body.items).toHaveLength(3);
    await api(tok.ACT).get(`/api/attendance/photos/${list.body.items[0].id}`).expect(200);
    await api(tok.A1).get(`/api/attendance/photos/${list.body.items[0].id}`).expect(403);
  });
});

describe('ตัวแทนเช็กชื่อแผนก (ผู้ดูแลกำหนดเท่านั้น)', () => {
  test('ครูขอสิทธิ์เองไม่ได้, ผู้ดูแลติ๊กให้แล้วเช็กแทนคนในแผนกได้, เอาออกแล้วหมดสิทธิ์', async () => {
    clock.setNow(bkk(MON, '07:45:00'));
    await api(tok.A1).post('/api/attendance/proxy-grant').send({ adminUsername: 'ADM', adminPassword: h.PASSWORD }).expect(404);
    let r = await api(tok.A1).post('/api/attendance/record').send({ userId: ids.b, status: 'present' });
    expect(r.status).toBe(403);
    await api(tok.A1).patch(`/api/admin/users/${ids.a}`).send({ can_proxy: true }).expect(403);
    await api(tok.ADM).patch(`/api/admin/users/${ids.a}`).send({ can_proxy: true }).expect(200);
    r = await api(tok.A1).post('/api/attendance/record').send({ userId: ids.b, status: 'present', photos: [JPEG] });
    expect(r.status).toBe(200);
    expect(r.body.record.method).toBe('proxy_dept');
    expect(r.body.record.photo_count).toBe(1);
    await api(tok.ADM).patch(`/api/admin/users/${ids.a}`).send({ can_proxy: false }).expect(200);
    r = await api(tok.A1).post('/api/attendance/record').send({ userId: ids.b, status: 'absent' });
    expect(r.status).toBe(403);
  });
});

describe('ข้อมูลจำลองและรีเซ็ต', () => {
  test('ต้องยืนยันรหัสผ่าน, จำลองแล้วรายงานมีข้อมูล, ล้างแล้วเหลือแต่ข้อมูลจริง', async () => {
    clock.setNow(bkk('2026-11-20', '10:00:00'));
    let r = await api(tok.ADM).post('/api/admin/demo/simulate').send({ weeks: 2 });
    expect(r.status).toBe(400);
    r = await api(tok.ACT).post('/api/admin/demo/simulate').send({ weeks: 2, password: h.PASSWORD });
    expect(r.status).toBe(403);
    r = await api(tok.ADM).post('/api/admin/demo/simulate').send({ weeks: 2, password: h.PASSWORD });
    expect(r.status).toBe(200);
    expect(r.body.inserted).toBeGreaterThan(0);
    const real = r.body.status.realRows;
    expect(real).toBeGreaterThan(0);
    const rep = await api(tok.ADM).get('/api/reports/official?from=2026-11-09&to=2026-11-13');
    expect(rep.body.demo).toBe(true);
    r = await api(tok.ADM).post('/api/admin/demo/clear').send({ password: h.PASSWORD });
    expect(r.body.status.demoRows).toBe(0);
    expect(r.body.status.realRows).toBe(real);
  });

  test('ล้างข้อมูลทั้งหมดต้องพิมพ์ข้อความยืนยัน', async () => {
    let r = await api(tok.ADM).post('/api/admin/demo/reset-all').send({ password: h.PASSWORD, confirmText: 'x' });
    expect(r.status).toBe(400);
    r = await api(tok.ADM).post('/api/admin/demo/reset-all').send({ password: h.PASSWORD, confirmText: 'ล้างข้อมูลทั้งหมด' });
    expect(r.body.status.realRows).toBe(0);
  });
});

describe('แบบรายงานและลำดับลงนาม', () => {
  test('รายงานตามแบบฟอร์ม: ร้อยละ = มา ÷ (คน × วัน)', async () => {
    clock.setNow(bkk('2026-11-23', '07:40:00'));
    await api(tok.A1).post('/api/attendance/check-in').send(near).expect(200);
    await api(tok.B1).post('/api/attendance/check-in').send(near).expect(200);
    clock.setNow(bkk('2026-11-24', '07:40:00'));
    await api(tok.A1).post('/api/attendance/check-in').send(near).expect(200);
    clock.setNow(bkk('2026-11-25', '10:00:00'));
    const r = await api(tok.ACT).get('/api/reports/official?from=2026-11-23&to=2026-11-24');
    const itRow = r.body.rows.find((x) => x.group === 'แผนกวิชาเทคโนโลยีสารสนเทศ');
    expect(itRow.members).toBe(2);
    expect(itRow.perDay).toEqual({ '2026-11-23': 2, '2026-11-24': 1 });
    expect(itRow.percent).toBe(75);
    expect(r.body.totals.possible).toBe(6);
    expect(r.body.totals.percent).toBe(50);
    await api(tok.A1).get('/api/reports/official?from=2026-11-23&to=2026-11-24').expect(403);
  });

  test('สร้างเอกสาร → ลงนาม 3 ลำดับ → อนุมัติ; ลงนามข้ามลำดับไม่ได้', async () => {
    let r = await api(tok.HR1).post('/api/report-docs').send({ day: '2026-11-23' });
    expect(r.status).toBe(400); // ยังไม่กำหนดผู้ลงนาม
    await api(tok.ADM).put('/api/admin/settings').send({ sign_step1_user: ids.s1, sign_step2_user: ids.s2, sign_step3_user: ids.s3 }).expect(200);
    h.settings.invalidate();
    r = await api(tok.HR1).post('/api/report-docs').send({ day: '2026-11-23' });
    expect(r.status).toBe(201);
    const id = r.body.id;
    expect(outbox.at(-1).text).toContain(`/report-docs/${id}`);
    r = await api(tok.S2).post(`/api/report-docs/${id}/sign`).send({ password: h.PASSWORD, signature: PNG });
    expect(r.status).toBe(403);
    r = await api(tok.S1).post(`/api/report-docs/${id}/sign`).send({ password: 'bad', signature: PNG });
    expect(r.status).toBe(403);
    r = await api(tok.S1).post(`/api/report-docs/${id}/sign`).send({ password: h.PASSWORD });
    expect(r.body.code).toBe('NO_SIGNATURE');
    r = await api(tok.S1).post(`/api/report-docs/${id}/sign`).send({ password: h.PASSWORD, signature: PNG });
    expect(r.body.current_step).toBe(2);
    expect((await api(tok.S2).get('/api/report-docs/pending-count')).body.count).toBe(1);
    // ลำดับ 2 ใช้ลายเซ็นที่บันทึกไว้ในโปรไฟล์
    await api(tok.S2).post('/api/profile/signature').send({ image: PNG, password: h.PASSWORD }).expect(200);
    r = await api(tok.S2).post(`/api/report-docs/${id}/sign`).send({ password: h.PASSWORD });
    expect(r.body.current_step).toBe(3);
    r = await api(tok.S3).post(`/api/report-docs/${id}/sign`).send({ password: h.PASSWORD, signature: PNG, comment: 'อนุมัติ', decision: { ack: true } });
    expect(r.body.status).toBe('approved');
    expect(r.body.signatures).toHaveLength(3);
    await api(tok.S1).get(`/api/report-docs/${id}/signatures/${r.body.signatures[0].id}`).expect(200);
    await api(tok.A1).get(`/api/report-docs/${id}`).expect(403);
  });

  test('ส่งกลับแก้ไขต้องมีเหตุผล', async () => {
    const d = await api(tok.HR1).post('/api/report-docs').send({ day: '2026-11-24' });
    expect(d.status).toBe(201);
    let r = await api(tok.S1).post(`/api/report-docs/${d.body.id}/return`).send({ password: h.PASSWORD });
    expect(r.status).toBe(400);
    r = await api(tok.S1).post(`/api/report-docs/${d.body.id}/return`).send({ password: h.PASSWORD, comment: 'ตัวเลขวันที่ 23 ไม่ตรง' });
    expect(r.body.status).toBe('returned');
  });
});

describe('สำรองข้อมูล', () => {
  test('แสดงรายการ, ขอสำรอง (ยืนยันรหัส), ดาวน์โหลด (ยืนยันรหัส)', async () => {
    const dir = process.env.BACKUP_DIR;
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'db-20261120-0000.sql.gz'), 'x');
    let r = await api(tok.ADM).get('/api/admin/backups');
    expect(r.body.items.map((x) => x.name)).toContain('db-20261120-0000.sql.gz');
    await api(tok.ADM).post('/api/admin/backups/run').send({}).expect(400);
    await api(tok.ADM).post('/api/admin/backups/run').send({ password: h.PASSWORD }).expect(200);
    expect(fs.existsSync(path.join(dir, '.request'))).toBe(true);
    r = await api(tok.ADM).post('/api/admin/backups/download').send({ name: '../../etc/passwd', password: h.PASSWORD });
    expect(r.status).toBe(400);
    r = await api(tok.ADM).post('/api/admin/backups/download').send({ name: 'db-20261120-0000.sql.gz', password: h.PASSWORD });
    expect(r.status).toBe(200);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('จำฉันไว้ในระบบ', () => {
  test('ไม่ติ๊ก → session cookie (ไม่มี Expires) และยังต่ออายุได้แบบ session', async () => {
    const r = await h.request(h.app).post('/api/auth/login').send({ username: 'C1', password: h.PASSWORD, remember: false });
    const c = r.headers['set-cookie'][0];
    expect(c).not.toMatch(/Expires=/);
    const r2 = await h.request(h.app).post('/api/auth/refresh').set('Cookie', c.split(';')[0]);
    expect(r2.status).toBe(200);
    expect(r2.headers['set-cookie'][0]).not.toMatch(/Expires=/);
    const r3 = await h.request(h.app).post('/api/auth/login').send({ username: 'C1', password: h.PASSWORD });
    expect(r3.headers['set-cookie'][0]).toMatch(/Expires=/);
  });
});

describe('ปฏิทินตั้งทับวันในสัปดาห์', () => {
  test('งดเข้าแถวในปฏิทิน → state บอกว่ามาจากปฏิทิน, ยกเลิกแล้วกลับมาเปิด', async () => {
    clock.setNow(bkk(MON, '07:45:00'));
    await api(tok.ADM).put(`/api/admin/assembly-days/${MON}`).send({ status: 'cancelled' }).expect(200);
    let r = await api(tok.A1).get('/api/attendance/state').expect(200);
    expect(r.body.phase).toBe('no_assembly');
    expect(r.body.daySource).toBe('calendar');
    expect(r.body.dayStatus).toBe('cancelled');
    await api(tok.ADM).delete(`/api/admin/assembly-days/${MON}`).expect(200);
    r = await api(tok.A1).get('/api/attendance/state').expect(200);
    expect(r.body.phase).toBe('open');
    expect(r.body.daySource).toBe('weekday');
  });
});

describe('โหมดเช็กแทนกันได้ทั้งแผนก', () => {
  const DAY = '2026-12-02';
  afterAll(async () => {
    await api(tok.ADM).put('/api/admin/settings').send({ group_checkin: '0', group_checkin_photo: '1' });
  });
  test('ปิดอยู่ → ครูทั่วไปเช็กแทนไม่ได้; เปิดแล้วต้องแนบรูป, บันทึกผู้เช็กแทน, เจ้าตัวเห็นว่าเช็กแล้ว', async () => {
    clock.setNow(bkk(DAY, '07:40:00'));
    let r = await api(tok.B1).post('/api/attendance/record').send({ userId: ids.a, status: 'present', photos: [JPEG] });
    expect(r.status).toBe(403);
    await api(tok.B1).get('/api/attendance/roster').expect(403);

    await api(tok.ADM).put('/api/admin/settings').send({ group_checkin: '1', group_checkin_photo: '1' }).expect(200);
    const me = await api(tok.B1).get('/api/auth/me').expect(200);
    expect(me.body.user.peer_check).toBe(true);
    await api(tok.B1).get('/api/attendance/roster').expect(200);
    await api(tok.B1).get('/api/reports/summary').expect((res) => expect(res.status).not.toBe(200));

    r = await api(tok.B1).post('/api/attendance/record').send({ userId: ids.a, status: 'present' });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('PHOTO_REQUIRED');
    r = await api(tok.B1).post('/api/attendance/record').send({ userId: ids.c, status: 'present', photos: [JPEG] });
    expect(r.status).toBe(403); // ต่างแผนก
    r = await api(tok.B1).post('/api/attendance/record').send({ userId: ids.a, status: 'present', photos: [JPEG] });
    expect(r.status).toBe(200);
    expect(r.body.record.method).toBe('proxy_peer');
    expect(r.body.record.checked_by_name).toBe('ครู B');

    // เจ้าตัวกดเช็กเองทีหลัง → แจ้งว่ามีผู้เช็กให้แล้ว
    r = await api(tok.A1).post('/api/attendance/check-in').send({ lat: 0, lng: 0 });
    expect(r.body.alreadyChecked).toBe(true);
    expect(r.body.message).toContain('เช็กแทนโดย ครู B');
    expect(r.body.message).toContain('07:40');

    // เช็กเองก่อน แล้วเพื่อนมาเช็กแทน → แจ้งว่าเช็กแล้ว
    clock.setNow(bkk(DAY, '07:45:00'));
    await api(tok.ADM).put('/api/admin/settings').send({ group_checkin_photo: '0' }).expect(200);
    await api(tok.ADM).post('/api/attendance/record').send({ userId: ids.b, status: 'present', reason: 'ทดสอบ' }).expect(200);
    r = await api(tok.A1).post('/api/attendance/record').send({ userId: ids.b, status: 'present' });
    expect(r.body.alreadyChecked).toBe(true);
    expect(r.body.message).toContain('ครู B');
  });
});

describe('ปฏิทิน: วันหยุดนักขัตฤกษ์ กิจกรรมพิเศษ และเพิ่มหลายวัน', () => {
  test('กิจกรรมพิเศษนับเป็นวันเข้าแถว, วันหยุดนักขัตฤกษ์ไม่นับ, bulk ตรวจข้อมูล', async () => {
    await api(tok.ADM).post('/api/admin/assembly-days/bulk').send({ items: [{ day: 'x', status: 'holiday' }] }).expect(400);
    await api(tok.ADM).post('/api/admin/assembly-days/bulk').send({ items: [
      { day: '2026-12-05', status: 'public_holiday', note: 'วันพ่อแห่งชาติ' },
      { day: '2026-12-06', status: 'special', note: 'กีฬาสี' },
    ] }).expect(200);
    await api(tok.A1).post('/api/admin/assembly-days/bulk').send({ items: [{ day: '2026-12-07', status: 'holiday' }] }).expect(403);
    clock.setNow(bkk('2026-12-05', '07:45:00'));
    let r = await api(tok.A1).get('/api/attendance/state').expect(200);
    expect(r.body.phase).toBe('no_assembly');
    expect(r.body.dayStatus).toBe('public_holiday');
    clock.setNow(bkk('2026-12-06', '07:45:00')); // วันอาทิตย์ แต่มีกิจกรรมพิเศษ
    r = await api(tok.A1).get('/api/attendance/state').expect(200);
    expect(r.body.phase).toBe('open');
    expect(r.body.dayNote).toBe('กีฬาสี');
  });
});

describe('v3: โหมดไม่ต้องตั้งค่า, เช็กแบบกลุ่ม, ร้อยละรายหน่วยงาน, ส่งออก Excel', () => {
  const DAY = '2026-12-09';
  afterAll(async () => {
    await api(tok.ADM).put('/api/admin/settings').send({ check_mode: 'gps_or_qr', group_checkin: '0', group_checkin_photo: '1' });
  });
  test('check_mode=none: กดปุ่มแล้วมาเข้าแถวทันที ไม่ต้องมีพิกัด', async () => {
    clock.setNow(bkk(DAY, '07:35:00'));
    await api(tok.ADM).put('/api/admin/settings').send({ check_mode: 'none' }).expect(200);
    const r = await api(tok.C1).post('/api/attendance/check-in').send({});
    expect(r.status).toBe(200);
    expect(r.body.record.status).toBe('present');
    expect(r.body.record.method).toBe('self_tap');
  });
  test('เช็กแบบกลุ่ม: ต้องมีรูปรวม, ข้ามคนที่เช็กแล้ว, ทุกคนได้รูปชุดเดียวกัน', async () => {
    clock.setNow(bkk(DAY, '07:40:00'));
    await api(tok.ADM).put('/api/admin/settings').send({ group_checkin: '1' }).expect(200);
    let r = await api(tok.A1).post('/api/attendance/record-batch').send({ userIds: [ids.b] });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('PHOTO_REQUIRED');
    r = await api(tok.A1).post('/api/attendance/record-batch').send({ userIds: [ids.b, ids.c], photos: [JPEG] });
    expect(r.status).toBe(200);
    expect(r.body.saved).toBe(1);
    expect(r.body.skipped).toHaveLength(1); // C1 ต่างแผนก + เช็กแล้ว
    const rows = await h.db.query(
      `SELECT a.method, a.checked_by, p.path FROM attendance a JOIN attendance_photos p ON p.attendance_id = a.id WHERE a.user_id = ? AND a.day = ?`, [ids.b, DAY]);
    expect(rows[0].method).toBe('proxy_peer');
    expect(rows[0].checked_by).toBe(ids.a);
    r = await api(tok.A1).post('/api/attendance/record-batch').send({ userIds: [ids.b], photos: [JPEG] });
    expect(r.body.saved).toBe(0);
    expect(r.body.skipped[0].message).toContain('เช็กแทนโดย ครู A');
  });
  test('รายงานมีร้อยละรายหน่วยงาน และส่งออก .xlsx ได้', async () => {
    clock.setNow(bkk(DAY, '10:00:00'));
    const r = await api(tok.ADM).get(`/api/reports/summary?from=${DAY}&to=${DAY}`).expect(200);
    expect(Array.isArray(r.body.units)).toBe(true);
    expect(r.body.units.length).toBeGreaterThan(0);
    expect(r.body.users[0]).toHaveProperty('unit_name');
    const x = await api(tok.ADM).get(`/api/reports/summary.xlsx?from=${DAY}&to=${DAY}`).buffer(true).parse((res, cb) => {
      const chunks = []; res.on('data', (c) => chunks.push(c)); res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(x.status).toBe(200);
    expect(x.body.slice(0, 2).toString()).toBe('PK');
    await api(tok.ADM).post('/api/admin/export.xlsx').send({ password: 'wrong', from: DAY, to: DAY }).expect(403);
    const full = await api(tok.ADM).post('/api/admin/export.xlsx').send({ password: h.PASSWORD, from: DAY, to: DAY }).buffer(true)
      .parse((res, cb) => { const c = []; res.on('data', (d) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); });
    expect(full.status).toBe(200);
    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(full.body);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['ภาพรวม', 'รายบุคคล', 'รายแผนก', 'รายหน่วยงาน', 'รายวัน', 'บันทึกการเข้าแถว', 'บุคลากร', 'ปฏิทิน']);
    await api(tok.A1).get(`/api/reports/summary.xlsx?from=${DAY}&to=${DAY}`).expect(403);
  });
});

describe('รหัสผ่านเริ่มต้น 12345678', () => {
  test('เพิ่มผู้ใช้/รีเซ็ตได้รหัส 12345678 และต้องเปลี่ยน, ห้ามตั้งรหัสใหม่เป็นรหัสเริ่มต้น', async () => {
    const r = await api(tok.ADM).post('/api/admin/users').send({ full_name: 'ครูใหม่', employee_code: 'NEW1', department_id: ids.it }).expect(201);
    expect(r.body.initialPassword).toBe('12345678');
    const login = await h.request(h.app).post('/api/auth/login').send({ username: 'NEW1', password: '12345678' }).expect(200);
    expect(login.body.user.must_change_password).toBe(true);
    const t = login.body.accessToken;
    let c = await h.request(h.app).post('/api/auth/change-password').set('Authorization', `Bearer ${t}`).send({ currentPassword: '12345678', newPassword: '12345678' });
    expect(c.status).toBe(400);
    c = await h.request(h.app).post('/api/auth/change-password').set('Authorization', `Bearer ${t}`).send({ currentPassword: '12345678', newPassword: 'password' });
    expect(c.status).toBe(400);
    c = await h.request(h.app).post('/api/auth/change-password').set('Authorization', `Bearer ${t}`).send({ currentPassword: '12345678', newPassword: 'Chai-2569!' });
    expect(c.status).toBe(200);
    const rs = await api(tok.ADM).post(`/api/admin/users/${r.body.id}/reset-password`).expect(200);
    expect(rs.body.initialPassword).toBe('12345678');
  });
});

describe('เข้าสู่ระบบด้วย LINE', () => {
  const realFetch = global.fetch;
  const cookieOf = (res, name) => (res.headers['set-cookie'] || []).find((c) => c.startsWith(`${name}=`))?.split(';')[0];
  let sub = 'U-line-a1';
  beforeAll(() => {
    process.env.LINE_CHANNEL_ID = '2000000001';
    process.env.LINE_CHANNEL_SECRET = 'test-secret';
    global.fetch = async (url, opts) => {
      const body = new URLSearchParams(opts.body);
      if (url.includes('/token')) return { ok: body.get('code') === 'good', json: async () => ({ id_token: 'idt' }) };
      return { ok: true, json: async () => ({ sub, aud: '2000000001', name: 'A on LINE' }) };
    };
  });
  afterAll(() => { global.fetch = realFetch; delete process.env.LINE_CHANNEL_ID; delete process.env.LINE_CHANNEL_SECRET; });

  test('ยังไม่ผูก → เข้าไม่ได้; ผูกจากโปรไฟล์ → กดเข้าด้วย LINE ได้; state ปลอม/บัญชีซ้ำ → ปฏิเสธ', async () => {
    const opt = await h.request(h.app).get('/api/auth/options').expect(200);
    expect(opt.body.lineEnabled).toBe(true);

    // เข้าสู่ระบบก่อนผูก
    let s = await h.request(h.app).get('/api/auth/line/start').expect(302);
    expect(s.headers.location).toContain('access.line.me');
    let state = new URL(s.headers.location).searchParams.get('state');
    let c = await h.request(h.app).get(`/api/auth/line/callback?code=good&state=${state}`).set('Cookie', cookieOf(s, 'lineup_ls')).expect(302);
    expect(c.headers.location).toBe('/login?line_error=NOT_LINKED');

    // state ไม่ตรง
    s = await h.request(h.app).get('/api/auth/line/start');
    c = await h.request(h.app).get('/api/auth/line/callback?code=good&state=forged').set('Cookie', cookieOf(s, 'lineup_ls')).expect(302);
    expect(c.headers.location).toBe('/login?line_error=LINE_STATE');

    // ผูกบัญชี
    const link = await api(tok.A1).post('/api/auth/line/link').expect(200);
    state = new URL(link.body.url).searchParams.get('state');
    c = await h.request(h.app).get(`/api/auth/line/callback?code=good&state=${state}`).set('Cookie', cookieOf(link, 'lineup_ls')).expect(302);
    expect(c.headers.location).toBe('/profile?line=linked');
    const me = await api(tok.A1).get('/api/auth/me').expect(200);
    expect(me.body.user.line_linked).toBe(true);

    // อีกคนจะผูก LINE เดียวกัน → ปฏิเสธ
    const link2 = await api(tok.B1).post('/api/auth/line/link').expect(200);
    state = new URL(link2.body.url).searchParams.get('state');
    c = await h.request(h.app).get(`/api/auth/line/callback?code=good&state=${state}`).set('Cookie', cookieOf(link2, 'lineup_ls')).expect(302);
    expect(c.headers.location).toBe('/profile?line_error=LINE_TAKEN');

    // เข้าสู่ระบบด้วย LINE → ได้ refresh cookie แล้วแลก access token ได้
    s = await h.request(h.app).get('/api/auth/line/start');
    state = new URL(s.headers.location).searchParams.get('state');
    c = await h.request(h.app).get(`/api/auth/line/callback?code=good&state=${state}`).set('Cookie', cookieOf(s, 'lineup_ls')).expect(302);
    expect(c.headers.location).toBe('/?line=login');
    const r = await h.request(h.app).post('/api/auth/refresh').set('Cookie', cookieOf(c, 'lineup_rt')).expect(200);
    expect(r.body.user.employee_code).toBe('A1');

    // ยกเลิกการผูก
    await api(tok.A1).delete('/api/auth/line').expect(200);
    s = await h.request(h.app).get('/api/auth/line/start');
    state = new URL(s.headers.location).searchParams.get('state');
    c = await h.request(h.app).get(`/api/auth/line/callback?code=good&state=${state}`).set('Cookie', cookieOf(s, 'lineup_ls'));
    expect(c.headers.location).toBe('/login?line_error=NOT_LINKED');
  });
});

describe('ผู้ลงนาม: ตำแหน่ง บทบาท และความพร้อมบัญชี', () => {
  test('กำหนดผู้ลงนามแล้วได้ตำแหน่ง+บทบาทผู้บริหาร (ลำดับ 2–3), เอกสารแสดงความพร้อมบัญชีให้ผู้ดูแล', async () => {
    await api(tok.ADM).put('/api/admin/settings').send({ sign_step1_user: String(ids.s1), sign_step2_user: String(ids.b), sign_step3_user: String(ids.s3) }).expect(200);
    const [b] = await h.db.query('SELECT role, position_title FROM users WHERE id = ?', [ids.b]);
    expect(b.role).toBe('executive');
    expect(b.position_title).toBe('ครูชำนาญการ'); // มีตำแหน่งอยู่แล้ว ไม่เขียนทับ
    const [s1] = await h.db.query('SELECT role, position_title FROM users WHERE id = ?', [ids.s1]);
    expect(s1.role).toBe('staff');
    expect(s1.position_title).toBe('หัวหน้างานบริหารและพัฒนาทรัพยากรบุคคล');
    clock.setNow(bkk('2026-12-14', '10:00:00'));
    const doc = await api(tok.HR1).post('/api/report-docs').send({ day: '2026-12-08' });
    expect(doc.status).toBe(201);
    const g = await api(tok.ADM).get(`/api/report-docs/${doc.body.id}`).expect(200);
    expect(g.body.accounts[ids.s1]).toHaveProperty('ready');
    expect(g.body.title).toBe('สรุปการปฏิบัติงานของข้าราชการครู และบุคลากรทางการศึกษา ประจำวันอังคาร ที่ 8 ธันวาคม พ.ศ. 2569');
    const other = await api(tok.S1).get(`/api/report-docs/${doc.body.id}`).expect(200);
    expect(other.body.accounts).toBeUndefined();
    expect(other.body.canSign).toBe(true);
    // คืนค่าเดิม
    await h.db.query("UPDATE users SET role = 'staff' WHERE id = ?", [ids.b]);
    await api(tok.ADM).put('/api/admin/settings').send({ sign_step1_user: String(ids.s1), sign_step2_user: String(ids.s2), sign_step3_user: String(ids.s3) }).expect(200);
  });
});

describe('แบ่งหน้าที่: ผู้ลงนาม/ผู้บริหารสร้างเอกสารไม่ได้', () => {
  test('ผู้บริหาร ผู้ลงนาม และงานกิจกรรมสร้างไม่ได้ — เจ้าหน้าที่บุคลากรสร้างได้', async () => {
    clock.setNow(bkk('2026-12-21', '10:00:00'));
    let r = await api(tok.S3).get('/api/report-docs').expect(200);
    expect(r.body.canCreate).toBe(false);
    await api(tok.S3).post('/api/report-docs').send({ day: '2026-12-14' }).expect(403);
    await api(tok.S1).post('/api/report-docs').send({ day: '2026-12-14' }).expect(403);
    await api(tok.ACT).post('/api/report-docs').send({ day: '2026-12-14' }).expect(403);
    r = await api(tok.ACT).get('/api/report-docs').expect(200);
    expect(r.body.canCreate).toBe(false);
    r = await api(tok.HR1).get('/api/report-docs').expect(200);
    expect(r.body.canCreate).toBe(true);
  });
});

describe('ย้ายชื่อเอกสารเดิมเป็นวันที่แบบไทย', () => {
  test('migration แปลงชื่อที่ระบบตั้งแบบเดิม ไม่แตะชื่อที่ผู้ใช้ตั้งเอง', async () => {
    const [d] = await h.db.query('SELECT id FROM report_docs LIMIT 1');
    await h.db.query('UPDATE report_docs SET title = ? WHERE id = ?', ['แบบบันทึก ระหว่างวันที่ 2026-10-26 ถึง 2026-10-30', d.id]);
    const { MIGRATIONS } = require('../../scripts/migrate');
    await MIGRATIONS.find((m) => m.id === '2026-11-08-12-thai-doc-titles').after();
    const [after] = await h.db.query('SELECT title FROM report_docs WHERE id = ?', [d.id]);
    expect(after.title).toBe('แบบบันทึก ระหว่างวันที่ 26–30 ตุลาคม 2569');
  });
});

describe('งานบุคลากร: สถานะลา/ราชการ ผู้มาสาย และแบบสรุปการปฏิบัติงานประจำวัน', () => {
  const D = '2027-01-05'; // อังคาร
  test('เฉพาะเจ้าหน้าที่บุคลากรและผู้ดูแลระบบ', async () => {
    clock.setNow(bkk('2027-01-11', '10:00:00'));
    await api(tok.A1).get(`/api/hr/day/${D}`).expect(403);
    await api(tok.ACT).get(`/api/hr/day/${D}`).expect(403);
    await api(tok.HR1).get(`/api/hr/day/${D}`).expect(200);
    await api(tok.ADM).get('/api/hr/meta').expect(200);
  });

  test('กำหนดประเภทบุคลากร', async () => {
    for (const [id, t] of [[ids.a, 'gov_teacher'], [ids.b, 'temp_teacher'], [ids.c, 'temp_janitor'], [ids.s3, 'executive'], [ids.hr, 'temp_officer']]) {
      await api(tok.HR1).patch(`/api/hr/users/${id}/staff-type`).send({ staffType: t }).expect(200);
    }
    await api(tok.HR1).patch(`/api/hr/users/${ids.a}/staff-type`).send({ staffType: 'king' }).expect(400);
  });

  test('บันทึกสถานะ: ต้องมีรายละเอียด/ประเภทการลา ช่วงวันที่ข้ามวันหยุด ล่วงหน้าได้ไม่เกิน 60 วัน', async () => {
    await api(tok.HR1).post('/api/hr/status').send({ userIds: [ids.b], from: D, status: 'official' }).expect(400);
    await api(tok.HR1).post('/api/hr/status').send({ userIds: [ids.c], from: D, status: 'leave' }).expect(400);
    let r = await api(tok.HR1).post('/api/hr/status').send({ userIds: [ids.b], from: D, status: 'official', note: 'อบรม สอศ.' }).expect(200);
    expect(r.body.changed).toBe(1);
    await api(tok.HR1).post('/api/hr/status').send({ userIds: [ids.c], from: D, status: 'leave', leaveType: 'sick' }).expect(200);
    r = await api(tok.HR1).post('/api/hr/status').send({ userIds: [ids.a], from: '2027-01-08', to: '2027-01-12', status: 'policy', note: 'ประชุมนโยบาย' }).expect(200);
    expect(r.body.days).toEqual(['2027-01-08', '2027-01-11', '2027-01-12']);
    await api(tok.HR1).post('/api/hr/status').send({ userIds: [ids.a], from: '2027-04-01', status: 'leave', leaveType: 'personal' }).expect(400);
    const [rec] = await h.db.query('SELECT status, leave_type, method FROM attendance WHERE user_id = ? AND day = ?', [ids.c, D]);
    expect(rec).toEqual({ status: 'leave', leave_type: 'sick', method: 'hr' });
  });

  test('ล้างสถานะได้เฉพาะรายการที่งานบุคลากรบันทึก', async () => {
    await h.db.query("INSERT INTO attendance (user_id, day, status, method, checked_by, checked_at) VALUES (?, '2027-01-07', 'present', 'self_tap', ?, NOW())", [ids.c, ids.c]);
    let r = await api(tok.HR1).post('/api/hr/status').send({ userIds: [ids.c], from: '2027-01-07', status: 'clear' }).expect(200);
    expect(r.body.changed).toBe(0);
    await api(tok.HR1).post('/api/hr/status').send({ userIds: [ids.a], from: '2027-01-12', status: 'clear' }).expect(200);
    r = await api(tok.HR1).get('/api/hr/day/2027-01-12').expect(200);
    expect(r.body.people.find((p) => p.id === ids.a).status).toBeNull();
  });

  test('ผู้มาสาย/ไม่ลงเวลากลับ และตัวอย่างรายงาน', async () => {
    await api(tok.HR1).put(`/api/hr/marks/${D}/late`).send({ userIds: [ids.a] }).expect(200);
    await api(tok.HR1).put(`/api/hr/marks/${D}/no_signout`).send({ userIds: [ids.b] }).expect(200);
    await api(tok.HR1).put(`/api/hr/marks/${D}/wrong`).send({ userIds: [ids.b] }).expect(400);
    const p = await api(tok.HR1).get(`/api/report-docs/preview?day=${D}`).expect(200);
    const sn = p.body.snapshot;
    expect(sn.total).toBe(5);
    expect(sn.counts.find((c) => c.no === '1.7')).toMatchObject({ count: 3 });
    expect(sn.counts.find((c) => c.no === '1.2').count).toBe(1);
    expect(sn.official).toEqual([{ name: 'ครู B', type: 'ครูอัตราจ้าง', note: 'อบรม สอศ.' }]);
    expect(sn.leave.sick.map((x) => x.name)).toEqual(['ครู C']);
    expect(sn.assembly.held).toBe(true);
    const notJoined = sn.assembly.list.map((x) => x.name);
    expect(notJoined).toContain('ครู A');
    expect(notJoined).not.toEqual(expect.arrayContaining(['ครู B'])); // ไปราชการ ไม่นับว่าไม่เข้ากิจกรรม
    expect(notJoined).not.toEqual(expect.arrayContaining(['ครู C'])); // ลาป่วย
    expect(sn.late.map((x) => x.name)).toEqual(['ครู A']);
    expect(sn.noSignout.map((x) => x.name)).toEqual(['ครู B']);
    expect([sn.worked, sn.notWorked]).toEqual([4, 1]);
    expect(p.body.warnings.join()).toMatch(/ยังไม่กำหนดประเภทบุคลากร/);
    await api(tok.ACT).get(`/api/report-docs/preview?day=${D}`).expect(403);
  });

  test('วันนี้ยังไม่ปิดเช็กชื่อ สร้างไม่ได้', async () => {
    clock.setNow(bkk('2027-01-13', '07:40:00'));
    const r = await api(tok.HR1).get('/api/report-docs/preview?day=2027-01-13');
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('NOT_CLOSED');
    clock.setNow(bkk('2027-01-13', '10:00:00'));
  });

  test('สร้าง → ซ้ำวันเดียวกันไม่ได้ → ผู้อำนวยการต้องเลือก ทราบ/มอบ', async () => {
    const d = await api(tok.HR1).post('/api/report-docs').send({ day: D }).expect(201);
    expect(d.body.kind).toBe('hr_daily');
    expect(d.body.title).toMatch(/ประจำวันอังคาร ที่ 5 มกราคม พ.ศ. 2570$/);
    expect(d.body.steps[2].decision).toBe(true);
    expect((await api(tok.HR1).post('/api/report-docs').send({ day: D })).body.code).toBe('DUPLICATE');
    await api(tok.S1).post(`/api/report-docs/${d.body.id}/sign`).send({ password: h.PASSWORD, signature: PNG }).expect(200);
    await api(tok.S2).post(`/api/report-docs/${d.body.id}/sign`).send({ password: h.PASSWORD }).expect(200);
    let r = await api(tok.S3).post(`/api/report-docs/${d.body.id}/sign`).send({ password: h.PASSWORD, signature: PNG });
    expect(r.status).toBe(400);
    r = await api(tok.S3).post(`/api/report-docs/${d.body.id}/sign`).send({ password: h.PASSWORD, signature: PNG, decision: { assign: true } });
    expect(r.status).toBe(400);
    r = await api(tok.S3).post(`/api/report-docs/${d.body.id}/sign`).send({ password: h.PASSWORD, signature: PNG, decision: { ack: true, assign: true, assignTo: 'หน.งานบริหารและพัฒนาทรัพยากรบุคคล' } });
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('approved');
    expect(r.body.signatures[2].decision).toEqual({ ack: true, assign: true, assignTo: 'หน.งานบริหารและพัฒนาทรัพยากรบุคคล' });
  });
});
