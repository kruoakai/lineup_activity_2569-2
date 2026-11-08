const fs = require('fs/promises');
const fss = require('fs');
const path = require('path');
const { HttpError } = require('../middleware/auth');

// ไฟล์สำรองสร้างโดย container "backup" (deploy/backup/run.sh) ลงโฟลเดอร์ร่วม BACKUP_DIR
// แอปทำหน้าที่แสดงรายการ ขอสำรองทันที (เขียนไฟล์ .request) และดาวน์โหลด
const dir = () => process.env.BACKUP_DIR || '/backups';
const NAME = /^(db|uploads)-\d{8}-\d{4}\.(sql\.gz|tar\.gz)$/;

async function list() {
  let names = [];
  try {
    names = await fs.readdir(dir());
  } catch {
    return { available: false, items: [], last: null, pending: false };
  }
  const items = [];
  for (const n of names.filter((x) => NAME.test(x))) {
    const st = await fs.stat(path.join(dir(), n));
    items.push({ name: n, kind: n.startsWith('db-') ? 'database' : 'uploads', bytes: st.size, created_at: st.mtime });
  }
  items.sort((a, b) => b.name.localeCompare(a.name));
  let last = null;
  try { last = JSON.parse(await fs.readFile(path.join(dir(), 'last.json'), 'utf8')); } catch { /* ยังไม่เคยสำรอง */ }
  const pending = fss.existsSync(path.join(dir(), '.request'));
  return { available: true, items, last, pending, schedule: process.env.BACKUP_SCHEDULE_TEXT || 'ทุกเที่ยงคืนหลังวันทำการ (อ.–ส. 00:00 น.) เก็บไว้ 60 วัน' };
}

async function request(byName) {
  try {
    await fs.writeFile(path.join(dir(), '.request'), JSON.stringify({ by: byName, at: new Date().toISOString() }));
  } catch {
    throw new HttpError(503, 'ไม่พบบริการสำรองข้อมูลบนเซิร์ฟเวอร์');
  }
}

function filePath(name) {
  if (!NAME.test(String(name || ''))) throw new HttpError(400, 'ชื่อไฟล์ไม่ถูกต้อง');
  const p = path.join(dir(), name);
  if (!fss.existsSync(p)) throw new HttpError(404, 'ไม่พบไฟล์สำรอง');
  return p;
}

module.exports = { list, request, filePath };
