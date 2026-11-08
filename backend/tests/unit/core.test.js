// Unit tests — ฟังก์ชันล้วน ไม่ต้องใช้ฐานข้อมูล
process.env.NODE_ENV = 'test';
process.env.UPLOAD_DIR = require('path').join(require('os').tmpdir(), 'lineup-unit-uploads');

const fs = require('fs');
const path = require('path');
const geo = require('../../src/services/geo');
const qr = require('../../src/services/qr');
const clock = require('../../src/clock');
const { rate, toCsv } = require('../../src/services/reports');
const perm = require('../../src/services/permissions');
const passwords = require('../../src/services/passwords');
const files = require('../../src/services/files');
const line = require('../../src/services/lineAuth');

afterAll(async () => {
  clock.setNow(null);
  await require('../../src/db').close();
});

describe('geo.distanceMeters', () => {
  test('จุดเดียวกัน = 0', () => {
    expect(geo.distanceMeters(15.8, 102.03, 15.8, 102.03)).toBe(0);
  });
  test('ละติจูดต่างกัน 0.001° ≈ 111 ม.', () => {
    expect(geo.distanceMeters(15.8, 102.03, 15.801, 102.03)).toBeCloseTo(111.2, 0);
  });
  test('สลับต้นทาง-ปลายทางได้ผลเท่ากัน', () => {
    const a = geo.distanceMeters(15.8, 102.03, 15.81, 102.05);
    const b = geo.distanceMeters(15.81, 102.05, 15.8, 102.03);
    expect(a).toBeCloseTo(b, 6);
  });
});

describe('geo.evaluate', () => {
  const s = { geofence_configured: true, geofence_lat: '15.8', geofence_lng: '102.03', geofence_radius_m: 150, max_accuracy_m: 100 };
  const at = (dLat, accuracy) => ({ lat: 15.8 + dLat, lng: 102.03, accuracy });
  test('ยังไม่ตั้งพื้นที่', () => expect(geo.evaluate(at(0, 5), { ...s, geofence_configured: false }).result).toBe('not_configured'));
  test('ไม่มีพิกัด', () => {
    expect(geo.evaluate(null, s).result).toBe('no_location');
    expect(geo.evaluate({ lat: NaN, lng: 1 }, s).result).toBe('no_location');
  });
  test('GPS ไม่แม่นพอ', () => expect(geo.evaluate(at(0, 150), s).result).toBe('low_accuracy'));
  test('ไม่มีค่า accuracy = ถือว่าไม่แม่น', () => expect(geo.evaluate({ lat: 15.8, lng: 102.03 }, s).result).toBe('low_accuracy'));
  test('กลางลาน = ในพื้นที่', () => expect(geo.evaluate(at(0, 10), s)).toEqual({ result: 'in_zone', distance: 0 }));
  test('ขอบรัศมี + ความคลาดเคลื่อน ยังนับว่าในพื้นที่', () => {
    // ~155 ม. รัศมี 150 + tolerance min(10, 75) = 160
    expect(geo.evaluate(at(0.0014, 10), s).result).toBe('in_zone');
  });
  test('ห่าง ~1 กม. = นอกพื้นที่ พร้อมระยะ', () => {
    const r = geo.evaluate(at(0.009, 10), s);
    expect(r.result).toBe('out_of_zone');
    expect(r.distance).toBeGreaterThan(900);
  });
});

describe('qr token', () => {
  const t0 = new Date('2026-11-16T00:30:00Z');
  test('token ปัจจุบันผ่าน', () => {
    const { token } = qr.current(30, t0);
    expect(qr.verify(token, 30, t0)).toBe(true);
  });
  test('ใช้ย้อนหลังได้ไม่เกิน ~120 วินาที', () => {
    const { token } = qr.current(30, t0);
    expect(qr.verify(token, 30, new Date(t0.getTime() + 110_000))).toBe(true);
    expect(qr.verify(token, 30, new Date(t0.getTime() + 200_000))).toBe(false);
  });
  test('token ของอนาคตไม่ผ่าน', () => {
    const { token } = qr.current(30, new Date(t0.getTime() + 60_000));
    expect(qr.verify(token, 30, t0)).toBe(false);
  });
  test('แก้ลายเซ็น / รูปแบบผิด / ยาวผิดปกติ ไม่ผ่าน', () => {
    const { token } = qr.current(30, t0);
    const [slot, sig] = token.split('.');
    const forged = `${slot}.${sig[0] === 'A' ? 'B' : 'A'}${sig.slice(1)}`;
    expect(qr.verify(forged, 30, t0)).toBe(false);
    expect(qr.verify('abc', 30, t0)).toBe(false);
    expect(qr.verify(`${'1'.repeat(70)}`, 30, t0)).toBe(false);
    expect(qr.verify(null, 30, t0)).toBe(false);
  });
  test('expiresInMs อยู่ในช่วงรอบ', () => {
    const r = qr.current(30, t0);
    expect(r.expiresInMs).toBeGreaterThan(0);
    expect(r.expiresInMs).toBeLessThanOrEqual(30_000);
  });
});

describe('clock', () => {
  test('แปลง UTC เป็นวันเวลาไทย ข้ามเที่ยงคืน', () => {
    const b = clock.bangkok(new Date('2026-11-15T17:30:00Z'));
    expect(b).toMatchObject({ day: '2026-11-16', time: '00:30:00', weekday: 1 });
  });
  test('parseHHMM', () => {
    expect(clock.parseHHMM('07:30')).toBe(27000);
    expect(clock.parseHHMM('08:30:59')).toBe(30659);
  });
  test('weekdayOf / addDays ข้ามเดือนและปีอธิกสุรทิน', () => {
    expect(clock.weekdayOf('2026-11-16')).toBe(1);
    expect(clock.addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(clock.addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(clock.addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  test('setNow ตั้งเวลาทดสอบและคืนค่าได้', () => {
    clock.setNow(new Date('2030-01-01T00:00:00Z'));
    expect(clock.now().toISOString()).toBe('2030-01-01T00:00:00.000Z');
    clock.setNow(null);
    expect(Math.abs(clock.now() - Date.now())).toBeLessThan(5000);
  });
});

describe('reports.rate / toCsv', () => {
  const c = (o) => ({ expected: 0, present: 0, absent: 0, official: 0, policy: 0, leave: 0, pending: 0, not_checked: 0, ...o });
  test('หักราชการ งานนโยบาย ลา ออกจากตัวหาร', () => {
    expect(rate(c({ expected: 10, present: 7, official: 1, policy: 1, leave: 0 }))).toBe(87.5);
  });
  test('ตัวหารเป็น 0 = null', () => {
    expect(rate(c({ expected: 2, official: 2 }))).toBeNull();
  });
  test('ปัดทศนิยม 1 ตำแหน่ง', () => {
    expect(rate(c({ expected: 3, present: 2 }))).toBe(66.7);
  });
  test('CSV มี BOM หัวตาราง และกัน formula injection', () => {
    const csv = toCsv({ users: [{ employee_code: '=CMD()', full_name: 'ครู "ก", ทดสอบ', department_name: '+x', expected: 1, present: 1, absent: 0, official: 0, policy: 0, leave: 0, pending: 0, not_checked: 0, rate: 100 }] });
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.trim().split('\r\n');
    expect(lines[0]).toContain('อัตราเข้าแถว');
    expect(lines[1]).toContain("'=CMD()");
    expect(lines[1]).toContain('"ครู ""ก"", ทดสอบ"');
    expect(lines[1]).toContain("'+x");
  });
});

describe('permissions', () => {
  const t = { id: 2, department_id: 1 };
  const other = { id: 3, department_id: 9 };
  test('ผู้ดูแลและงานกิจกรรมบันทึกได้ทุกช่วงเวลา', () => {
    expect(perm.canRecordFor({ role: 'admin' }, t, 'closed', 'leave')).toMatchObject({ ok: true, method: 'admin' });
    expect(perm.canRecordFor({ role: 'activity' }, other, 'closed', 'official')).toMatchObject({ ok: true, method: 'proxy_activity' });
  });
  test('ครูทั่วไปเช็กแทนไม่ได้', () => {
    expect(perm.canRecordFor({ role: 'staff', department_id: 1 }, t, 'open', 'present').ok).toBe(false);
  });
  test('ตัวแทน: แผนกเดียวกัน + เปิดอยู่ + มาเข้าแถว เท่านั้น', () => {
    const p = { role: 'staff', department_id: 1, can_proxy: true };
    expect(perm.canRecordFor(p, t, 'open', 'present')).toMatchObject({ ok: true, method: 'proxy_dept' });
    expect(perm.canRecordFor(p, other, 'open', 'present').ok).toBe(false);
    expect(perm.canRecordFor(p, t, 'closed', 'present').ok).toBe(false);
    expect(perm.canRecordFor(p, t, 'open', 'leave').ok).toBe(false);
  });
  test('โหมดเช็กแทนกันทั้งแผนก = proxy_peer', () => {
    expect(perm.canRecordFor({ role: 'staff', department_id: 1, peer_check: true }, t, 'open', 'present')).toMatchObject({ ok: true, method: 'proxy_peer' });
  });
  test('ขอบเขตรายงานและรายชื่อ', () => {
    expect(perm.reportScope({ role: 'executive' })).toEqual({ all: true });
    expect(perm.reportScope({ role: 'dept_head', department_id: 4 })).toEqual({ all: false, departmentId: 4 });
    expect(perm.reportScope({ role: 'staff', department_id: 4 })).toBeNull();
    expect(perm.rosterScope({ role: 'staff', department_id: 4, peer_check: true })).toEqual({ all: false, departmentId: 4 });
    expect(perm.rosterScope({ role: 'staff', department_id: 4 })).toBeNull();
  });
});

describe('passwords', () => {
  test('รหัสสุ่มไม่มีตัวที่สับสน 0/O/1/l/I', () => {
    for (let i = 0; i < 50; i += 1) {
      const p = passwords.generate(12);
      expect(p).toHaveLength(12);
      expect(p).not.toMatch(/[0O1lI]/);
    }
  });
  test('รหัสเริ่มต้น 12345678 และรหัสเดาง่ายถูกห้าม', () => {
    expect(passwords.initial()).toBe('12345678');
    for (const w of ['12345678', 'PASSWORD', 'qwerty12', 'ccollege']) expect(passwords.isWeak(w)).toBe(true);
    expect(passwords.isWeak('Chai-2569!')).toBe(false);
  });
});

describe('files.saveImage', () => {
  const jpeg = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2]).toString('base64')}`;
  test('บันทึก JPEG จริงได้', async () => {
    const rel = await files.saveImage(jpeg, { dir: 'unit', prefix: 't' });
    expect(fs.existsSync(path.join(process.env.UPLOAD_DIR, rel))).toBe(true);
  });
  test('ปฏิเสธชนิดไฟล์ผิด / magic bytes ผิด / ใหญ่เกิน', async () => {
    await expect(files.saveImage('data:image/gif;base64,R0lG', { dir: 'unit' })).rejects.toMatchObject({ status: 400 });
    const fake = `data:image/jpeg;base64,${Buffer.from('<?php echo 1;').toString('base64')}`;
    await expect(files.saveImage(fake, { dir: 'unit' })).rejects.toMatchObject({ status: 400 });
    await expect(files.saveImage(jpeg, { dir: 'unit', maxBytes: 2 })).rejects.toMatchObject({ status: 413 });
  });
  test('resolveUpload กัน path traversal', () => {
    expect(files.resolveUpload('../../etc/passwd')).toBeFalsy();
  });
});

describe('lineAuth', () => {
  afterEach(() => { delete process.env.LINE_CHANNEL_ID; delete process.env.LINE_CHANNEL_SECRET; });
  test('ปิดอยู่ถ้ายังไม่ตั้งค่า', () => {
    expect(line.enabled()).toBe(false);
    expect(() => line.start('login')).toThrow();
  });
  test('URL ไปหน้า LINE มี client_id, redirect, state, nonce', () => {
    process.env.LINE_CHANNEL_ID = '123';
    process.env.LINE_CHANNEL_SECRET = 's';
    const { url, cookie } = line.start('login');
    const q = new URL(url).searchParams;
    expect(q.get('client_id')).toBe('123');
    expect(q.get('redirect_uri')).toMatch(/\/api\/auth\/line\/callback$/);
    expect(q.get('state')).toBeTruthy();
    expect(q.get('nonce')).toBeTruthy();
    expect(cookie.split('.')).toHaveLength(2);
  });
  test('callback ปฏิเสธคุกกี้ปลอม / ไม่มีคุกกี้ / state ไม่ตรง', async () => {
    process.env.LINE_CHANNEL_ID = '123';
    process.env.LINE_CHANNEL_SECRET = 's';
    const { url, cookie } = line.start('login');
    const state = new URL(url).searchParams.get('state');
    await expect(line.finish({ code: 'x', state, cookie: undefined })).rejects.toMatchObject({ code: 'LINE_STATE' });
    await expect(line.finish({ code: 'x', state: 'other', cookie })).rejects.toMatchObject({ code: 'LINE_STATE' });
    const [body] = cookie.split('.');
    await expect(line.finish({ code: 'x', state, cookie: `${body}.AAAA` })).rejects.toMatchObject({ code: 'LINE_STATE' });
  });
});

describe('thaiDate (วันที่แบบไทยในเอกสาร)', () => {
  const td = require('../../src/services/thaiDate');
  test('วันเดียว / เดือนเดียวกัน / ข้ามเดือน / ข้ามปี', () => {
    expect(td.long('2026-10-26')).toBe('26 ตุลาคม 2569');
    expect(td.range('2026-10-26', '2026-10-26')).toBe('26 ตุลาคม 2569');
    expect(td.range('2026-10-26', '2026-10-30')).toBe('26–30 ตุลาคม 2569');
    expect(td.range('2026-10-28', '2026-11-03')).toBe('28 ตุลาคม – 3 พฤศจิกายน 2569');
    expect(td.range('2026-12-28', '2027-01-08')).toBe('28 ธันวาคม 2569 – 8 มกราคม 2570');
  });
});
