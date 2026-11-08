const db = require('../db');
const clock = require('../clock');
const settings = require('./settings');
const files = require('./files');

// ลบรูปหลักฐานที่เก่ากว่าระยะเวลาเก็บ (PDPA) — สถานะการเข้าแถวยังคงอยู่
async function cleanupPhotos() {
  const s = await settings.getAll();
  const cutoff = clock.addDays(clock.bangkok().day, -s.photo_retention_days);
  const rows = await db.query(
    `SELECT p.id, p.path FROM attendance_photos p JOIN attendance a ON a.id = p.attendance_id WHERE a.day < ?`,
    [cutoff],
  );
  for (const r of rows) {
    await files.removeUpload(r.path);
    await db.query('DELETE FROM attendance_photos WHERE id = ?', [r.id]);
  }
  return rows.length;
}

module.exports = { cleanupPhotos };
