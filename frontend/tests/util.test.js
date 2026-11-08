// Unit tests ฝั่งหน้าเว็บ (node --test) — ฟังก์ชันจัดรูปแบบวันเวลาและระยะทาง
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { thaiDate, thaiRange, thaiTime, addDays, weekStart, distanceMeters, STATUS, METHOD } from '../src/util.js';

test('thaiDate แสดงวันแบบไทย พ.ศ. 2 หลัก', () => {
  assert.equal(thaiDate('2026-11-16'), 'จ. 16 พ.ย. 69');
  assert.equal(thaiDate('2026-11-16', false), '16 พ.ย. 69');
  assert.equal(thaiDate(''), '');
});

test('thaiTime แปลง UTC เป็นเวลาไทย', () => {
  assert.equal(thaiTime('2026-11-16T00:41:00Z'), '07:41');
  assert.equal(thaiTime('2026-11-15T17:05:00Z'), '00:05');
  assert.equal(thaiTime(null), '');
});

test('addDays และ weekStart (จันทร์ของสัปดาห์)', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(weekStart('2026-11-18'), '2026-11-16'); // พุธ → จันทร์
  assert.equal(weekStart('2026-11-22'), '2026-11-16'); // อาทิตย์ → จันทร์ก่อนหน้า
  assert.equal(weekStart('2026-11-16'), '2026-11-16');
});

test('distanceMeters ตรงกับฝั่งเซิร์ฟเวอร์', () => {
  const d = distanceMeters({ lat: 15.8, lng: 102.03 }, { lat: 15.801, lng: 102.03 });
  assert.ok(Math.abs(d - 111.2) < 0.5, `got ${d}`);
});

test('ทุกวิธีเช็กชื่อและทุกสถานะมีป้ายภาษาไทย', () => {
  for (const m of ['self_gps', 'self_qr', 'self_tap', 'proxy_dept', 'proxy_peer', 'proxy_activity', 'admin']) assert.ok(METHOD[m], m);
  for (const s of ['present', 'absent', 'official', 'policy', 'leave', 'pending']) assert.ok(STATUS[s]?.label, s);
});

test('thaiRange ช่วงวันที่แบบสั้น', () => {
  assert.equal(thaiRange('2026-10-26', '2026-10-30'), '26–30 ต.ค. 69');
  assert.equal(thaiRange('2026-10-28', '2026-11-03'), '28 ต.ค. – 3 พ.ย. 69');
  assert.equal(thaiRange('2026-12-28', '2027-01-08'), '28 ธ.ค. 69 – 8 ม.ค. 70');
  assert.equal(thaiRange('2026-10-26', '2026-10-26'), '26 ต.ค. 69');
});
