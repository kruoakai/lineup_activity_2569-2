const fs = require('fs/promises');
const fss = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const tarball = require('./tarball');
const { HttpError } = require('../middleware/auth');

// ไฟล์สำรองสร้างโดย container "backup" (deploy/backup/run.sh) ลงโฟลเดอร์ร่วม BACKUP_DIR
// แอปทำหน้าที่แสดงรายการ ขอสำรองทันที (.request) ขอกู้คืน (.restore-request) และดาวน์โหลด/อัปโหลด
const dir = () => process.env.BACKUP_DIR || '/backups';
const restoreDir = () => path.join(dir(), 'restore');
const NAME = /^(db|uploads)-\d{8}-\d{4}\.(sql\.gz|tar\.gz)$/;
const TS = /^\d{8}-\d{4}$/;
const MAX_UPLOAD = Number(process.env.RESTORE_MAX_BYTES || 1024 * 1024 * 1024); // 1 GB

async function readJson(p) {
  try { return JSON.parse(await fs.readFile(p, 'utf8')); } catch { return null; }
}

async function list() {
  let names = [];
  try {
    names = await fs.readdir(dir());
  } catch {
    return { available: false, items: [], full: [], last: null, pending: false, restore: null };
  }
  const items = [];
  for (const n of names.filter((x) => NAME.test(x))) {
    const st = await fs.stat(path.join(dir(), n));
    items.push({ name: n, kind: n.startsWith('db-') ? 'database' : 'uploads', bytes: st.size, created_at: st.mtime });
  }
  items.sort((a, b) => b.name.localeCompare(a.name));
  // ชุดสำรองทั้งระบบ = ฐานข้อมูล + รูป/ลายเซ็น ของรอบเดียวกัน
  const full = items.filter((i) => i.kind === 'database').map((d) => {
    const ts = d.name.slice(3, 16);
    const up = items.find((i) => i.name === `uploads-${ts}.tar.gz`);
    return { ts, db: d.name, uploads: up?.name || null, bytes: d.bytes + (up?.bytes || 0), created_at: d.created_at };
  });
  const last = await readJson(path.join(dir(), 'last.json'));
  const pending = fss.existsSync(path.join(dir(), '.request'));
  return {
    available: true, items, full, last, pending, restore: await restoreStatus(),
    schedule: process.env.BACKUP_SCHEDULE_TEXT || 'ทุกเที่ยงคืนหลังวันทำการ (อ.–ส. 00:00 น.) เก็บไว้ 60 วัน',
  };
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

// ---------- สำรองทั้งระบบเป็นไฟล์เดียว ----------

function manifestOf({ ts, db, uploads }) {
  return {
    app: 'lineup', format: 1, created_at: new Date().toISOString(), backup_ts: ts,
    db, uploads, note: 'ไฟล์สำรองทั้งระบบ ระบบเช็กชื่อเข้าแถว — กู้คืนที่หน้า สำรองฐานข้อมูล → กู้คืนระบบ',
  };
}

/** เขียนชุดสำรองทั้งระบบ (.tar) ของรอบ ts ลง stream */
async function writeFull(ts, out) {
  if (!TS.test(String(ts || ''))) throw new HttpError(400, 'รอบสำรองไม่ถูกต้อง');
  const db = filePath(`db-${ts}.sql.gz`);
  const upName = `uploads-${ts}.tar.gz`;
  const up = fss.existsSync(path.join(dir(), upName)) ? path.join(dir(), upName) : null;
  const manifest = manifestOf({ ts, db: path.basename(db), uploads: up ? upName : null });
  const entries = [{ name: 'manifest.json', buffer: Buffer.from(JSON.stringify(manifest, null, 2)) }, { name: path.basename(db), file: db }];
  if (up) entries.push({ name: upName, file: up });
  await tarball.write(entries, out);
}

// ---------- ตรวจไฟล์ก่อนกู้คืน ----------

/** อ่านส่วนต้นของ .sql.gz ตรวจว่าเป็นไฟล์สำรองของระบบนี้ */
async function checkDump(file) {
  const head = await new Promise((resolve) => {
    let buf = Buffer.alloc(0);
    const gun = zlib.createGunzip();
    const src = fss.createReadStream(file);
    const done = () => { src.destroy(); gun.destroy(); resolve(buf.toString('utf8')); };
    gun.on('data', (c) => { buf = Buffer.concat([buf, c]); if (buf.length > 4 * 1024 * 1024) done(); });
    gun.on('end', done);
    gun.on('error', done);
    src.pipe(gun);
  });
  if (!/-- MySQL dump|-- MariaDB dump/.test(head.slice(0, 400))) throw new HttpError(400, 'ไฟล์ฐานข้อมูลไม่ใช่ไฟล์สำรองจาก mysqldump');
  if (!/CREATE TABLE `users`/.test(head) && !/CREATE TABLE `attendance`/.test(head)) {
    throw new HttpError(400, 'ไฟล์สำรองนี้ไม่มีตารางของระบบเช็กชื่อเข้าแถว');
  }
  const m = /-- Dump completed on (.+)/.exec(head);
  return { completedAt: m ? m[1].trim() : null };
}

/** รับไฟล์ที่อัปโหลด (stream) เก็บใน restore/ แล้วตรวจ — คืนข้อมูลชุดกู้คืน */
async function receiveUpload(req) {
  await fs.mkdir(restoreDir(), { recursive: true });
  const id = `${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}-${crypto.randomBytes(3).toString('hex')}`;
  const raw = path.join(restoreDir(), `upload-${id}.bin`);
  let bytes = 0;
  await new Promise((resolve, reject) => {
    const out = fss.createWriteStream(raw, { mode: 0o600 });
    req.on('data', (c) => {
      bytes += c.length;
      if (bytes > MAX_UPLOAD) { req.unpipe(out); out.destroy(); req.destroy(); reject(new HttpError(413, 'ไฟล์ใหญ่เกิน 1 GB')); }
    });
    req.pipe(out);
    out.on('finish', resolve);
    out.on('error', reject);
    req.on('error', reject);
  }).catch(async (e) => { await fs.rm(raw, { force: true }); throw e; });
  if (!bytes) { await fs.rm(raw, { force: true }); throw new HttpError(400, 'ไม่ได้รับไฟล์'); }

  const folder = path.join(restoreDir(), id);
  await fs.mkdir(folder, { recursive: true });
  try {
    const fh = await fs.open(raw, 'r');
    const sig = Buffer.alloc(265);
    await fh.read(sig, 0, 265, 0);
    await fh.close();
    let manifest = null;
    let db;
    let uploads = null;
    if (sig[0] === 0x1f && sig[1] === 0x8b) {
      // ไฟล์ฐานข้อมูลอย่างเดียว (db-*.sql.gz)
      db = 'db.sql.gz';
      await fs.rename(raw, path.join(folder, db));
    } else if (sig.toString('ascii', 257, 262) === 'ustar') {
      const entries = await tarball.list(raw);
      const man = entries.find((e) => e.name === 'manifest.json');
      const dbE = entries.find((e) => /^db-.*\.sql\.gz$/.test(e.name));
      const upE = entries.find((e) => /^uploads-.*\.tar\.gz$/.test(e.name));
      if (!dbE) throw new HttpError(400, 'ไฟล์ .tar นี้ไม่มีฐานข้อมูล (db-*.sql.gz) — ต้องเป็นไฟล์ "สำรองทั้งระบบ" จากหน้านี้');
      if (man) manifest = JSON.parse(await tarball.readText(raw, man));
      if (manifest && manifest.app !== 'lineup') throw new HttpError(400, 'ไฟล์สำรองนี้ไม่ใช่ของระบบเช็กชื่อเข้าแถว');
      db = 'db.sql.gz';
      await tarball.extract(raw, dbE, path.join(folder, db));
      if (upE) { uploads = 'uploads.tar.gz'; await tarball.extract(raw, upE, path.join(folder, uploads)); }
      await fs.rm(raw, { force: true });
    } else {
      throw new HttpError(400, 'รองรับเฉพาะไฟล์ "สำรองทั้งระบบ" (.tar) หรือไฟล์ฐานข้อมูล (db-….sql.gz)');
    }
    const check = await checkDump(path.join(folder, db));
    const info = { id, source: 'upload', db: `restore/${id}/${db}`, uploads: uploads ? `restore/${id}/${uploads}` : null, manifest, ...check, bytes };
    await fs.writeFile(path.join(folder, 'info.json'), JSON.stringify(info));
    return info;
  } catch (e) {
    await fs.rm(raw, { force: true });
    await fs.rm(folder, { recursive: true, force: true });
    throw e;
  }
}

/** ชุดกู้คืน: จากไฟล์สำรองบนเซิร์ฟเวอร์ (ts) หรือไฟล์ที่อัปโหลด (id) */
async function resolveSource({ source, ts, id }) {
  if (source === 'server') {
    if (!TS.test(String(ts || ''))) throw new HttpError(400, 'รอบสำรองไม่ถูกต้อง');
    const dbName = `db-${ts}.sql.gz`;
    filePath(dbName);
    await checkDump(path.join(dir(), dbName));
    const up = `uploads-${ts}.tar.gz`;
    return { db: dbName, uploads: fss.existsSync(path.join(dir(), up)) ? up : null, label: `สำรองบนเซิร์ฟเวอร์ ${ts}` };
  }
  if (source === 'upload') {
    if (!/^[0-9a-f-]{10,40}$/.test(String(id || ''))) throw new HttpError(400, 'รหัสไฟล์อัปโหลดไม่ถูกต้อง');
    const info = await readJson(path.join(restoreDir(), id, 'info.json'));
    if (!info) throw new HttpError(404, 'ไม่พบไฟล์ที่อัปโหลด กรุณาอัปโหลดใหม่');
    return { db: info.db, uploads: info.uploads, label: `ไฟล์ที่อัปโหลด ${id}` };
  }
  throw new HttpError(400, 'แหล่งกู้คืนไม่ถูกต้อง');
}

// ---------- สั่งกู้คืน (container "backup" เป็นผู้ทำ) ----------

async function restoreStatus() {
  const last = await readJson(path.join(dir(), 'restore-last.json'));
  const pending = fss.existsSync(path.join(dir(), '.restore-request'));
  return { pending, last };
}

/**
 * เขียนคำสั่งกู้คืนให้ container backup: สำรองข้อมูลปัจจุบันก่อน → ล้างฐานข้อมูล → นำเข้า → คืนรูป/ลายเซ็น
 * ไฟล์ .restore-request เป็นบรรทัด KEY=VALUE (ค่าผ่านการตรวจชื่อไฟล์แล้ว)
 */
async function requestRestore(sourceSpec, { byName, includeUploads = true }) {
  const st = await restoreStatus();
  if (st.pending) throw new HttpError(409, 'มีคำสั่งกู้คืนรออยู่แล้ว');
  const src = await resolveSource(sourceSpec);
  const safe = (p) => {
    if (!p) return '';
    if (!/^[A-Za-z0-9._/-]+$/.test(p) || p.includes('..')) throw new HttpError(400, 'ชื่อไฟล์ไม่ถูกต้อง');
    return p;
  };
  const lines = [`DB=${safe(src.db)}`, `UPLOADS=${includeUploads ? safe(src.uploads) : ''}`, `BY=${String(byName).replace(/[^\p{L}\p{M}\p{N} ._-]/gu, '').slice(0, 80)}`, `AT=${new Date().toISOString()}`];
  await fs.writeFile(path.join(dir(), '.restore-request'), `${lines.join('\n')}\n`);
  return { ...src, uploads: includeUploads ? src.uploads : null };
}

// หลังกู้คืนเสร็จ: แอปอัปเดตโครงสร้างตาราง (ไฟล์สำรองอาจมาจากรุ่นก่อน) และล้าง cache ค่าระบบ
let appliedAt = null;
function watchRestore(onRestored) {
  const tick = async () => {
    const last = await readJson(path.join(dir(), 'restore-last.json'));
    if (!last?.finished_at || last.finished_at === appliedAt) return;
    if (appliedAt === null) { appliedAt = last.finished_at; return; } // ตอนเริ่มแอป: ถือว่าจัดการไปแล้ว
    appliedAt = last.finished_at;
    if (last.ok) await onRestored(last).catch((e) => console.error('after restore failed', e));
  };
  tick();
  return setInterval(tick, 5000).unref();
}

module.exports = { list, request, filePath, writeFull, receiveUpload, requestRestore, restoreStatus, checkDump, watchRestore, MAX_UPLOAD };
