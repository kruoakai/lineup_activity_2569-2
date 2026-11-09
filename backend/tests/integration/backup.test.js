// สำรองระดับผู้ใช้ (Excel ตามบทบาท) · สำรองทั้งระบบ (.tar) · กู้คืน (คำสั่งถึง container backup) · ข้อมูลจำลองงานบุคลากร
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const ExcelJS = require('exceljs');
const h = require('../helpers');
const tarball = require('../../src/services/tarball');

const { api, PASSWORD, clock, bkk } = h;
const DIR = process.env.BACKUP_DIR;
const TS = '20261109-0500';
let tok;
let ids;

const binary = (res, cb) => {
  const chunks = [];
  res.on('data', (c) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};
const dump = (extra = '') => zlib.gzipSync(Buffer.from(`-- MySQL dump 10.13  Distrib 8.4.0\n--\n-- Host: db    Database: lineup\n${extra}\nDROP TABLE IF EXISTS \`users\`;\nCREATE TABLE \`users\` (id int);\n-- Dump completed on 2026-11-09  5:00:01\n`));

async function sheets(buf) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  return wb.worksheets.map((w) => w.name);
}

beforeAll(async () => {
  await h.resetDb();
  fs.rmSync(DIR, { recursive: true, force: true });
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(path.join(DIR, `db-${TS}.sql.gz`), dump());
  fs.writeFileSync(path.join(DIR, `uploads-${TS}.tar.gz`), zlib.gzipSync(Buffer.from('fake uploads')));
  fs.writeFileSync(path.join(DIR, 'db-20261108-0000.sql.gz'), dump()); // รอบที่ไม่มีไฟล์รูป
  const it = await h.createDept('เทคโนโลยีสารสนเทศ');
  const office = await h.createDept('งานบริหารและพัฒนาทรัพยากรบุคคล', 'ฝ่ายบริหารทรัพยากร');
  ids = {
    t1: await h.createUser({ code: 'T1', name: 'ครูหนึ่ง', dept: it }),
    t2: await h.createUser({ code: 'T2', name: 'ครูสอง', dept: it }),
    o1: await h.createUser({ code: 'O1', name: 'เจ้าหน้าที่ธุรการ', dept: office }),
    hr: await h.createUser({ code: 'HR', name: 'เจ้าหน้าที่บุคลากร', role: 'hr', dept: office, mustAssemble: false }),
    act: await h.createUser({ code: 'ACT', name: 'งานกิจกรรม', role: 'activity', mustAssemble: false }),
    ex: await h.createUser({ code: 'EX', name: 'ผู้บริหาร', role: 'executive', mustAssemble: false }),
    adm: await h.createUser({ code: 'ADM', name: 'ผู้ดูแล', role: 'admin', mustAssemble: false }),
  };
  tok = {};
  for (const k of ['T1', 'HR', 'ACT', 'EX', 'ADM']) tok[k] = await h.login(k);
});

afterAll(async () => { clock.setNow(null); await h.db.close(); });

describe('ข้อมูลจำลองงานบุคลากร', () => {
  test('จำลอง: ประเภทบุคลากรตัวอย่าง + ลาแยกประเภท บันทึกโดยงานบุคลากร + มาสาย/ไม่ลงเวลากลับ → ลบแล้วกลับเป็นเหมือนเดิม', async () => {
    clock.setNow(bkk('2026-11-20', '10:00:00'));
    await h.db.query("UPDATE users SET staff_type = 'gov_teacher' WHERE id = ?", [ids.t1]); // กำหนดเองแล้ว = ข้อมูลจริง
    const r = await api(tok.ADM).post('/api/admin/demo/simulate').send({ weeks: 8, password: PASSWORD }).expect(200);
    expect(r.body.staffTypes).toBeGreaterThan(0);
    const st = await h.db.query('SELECT id, staff_type, staff_type_demo FROM users');
    expect(st.find((u) => u.id === ids.t1)).toMatchObject({ staff_type: 'gov_teacher', staff_type_demo: 0 });
    expect(st.find((u) => u.id === ids.ex)).toMatchObject({ staff_type: 'executive', staff_type_demo: 1 });
    expect(st.find((u) => u.id === ids.adm).staff_type).toBeNull();
    const leave = await h.db.query("SELECT leave_type, method, checked_by, note FROM attendance WHERE is_demo = 1 AND status = 'leave'");
    for (const l of leave) {
      expect(['sick', 'personal', 'other']).toContain(l.leave_type);
      expect(l.method).toBe('hr');
      expect(l.checked_by).toBe(ids.hr);
    }
    const official = await h.db.query("SELECT note FROM attendance WHERE is_demo = 1 AND status = 'official'");
    for (const o of official) expect(o.note.length).toBeGreaterThan(5);
    const s = (await api(tok.ADM).get('/api/admin/demo').expect(200)).body;
    expect(s.demoMarks).toBe(r.body.marks);
    expect(s.demoStaffTypes).toBe(r.body.staffTypes);

    await api(tok.ADM).post('/api/admin/demo/clear').send({ password: PASSWORD }).expect(200);
    const after = (await api(tok.ADM).get('/api/admin/demo')).body;
    expect([after.demoRows, after.demoMarks, after.demoStaffTypes]).toEqual([0, 0, 0]);
    const [t1] = await h.db.query('SELECT staff_type FROM users WHERE id = ?', [ids.t1]);
    expect(t1.staff_type).toBe('gov_teacher');
  });
});

describe('สำรองข้อมูลงานของฉัน (Excel ตามบทบาท)', () => {
  test('แต่ละบทบาทได้แผ่นงานของตนเอง / ครูทั่วไปไม่มี / ต้องยืนยันรหัสผ่าน', async () => {
    expect((await api(tok.T1).get('/api/my-backup')).body.available).toBe(false);
    await api(tok.T1).post('/api/my-backup/xlsx').send({ from: '2026-11-01', to: '2026-11-20', password: PASSWORD }).expect(403);
    await api(tok.HR).post('/api/my-backup/xlsx').send({ from: '2026-11-01', to: '2026-11-20', password: 'wrong' }).expect(403);
    await api(tok.HR).post('/api/my-backup/xlsx').send({ from: '2026-01-01', to: '2027-12-31', password: PASSWORD }).expect(400);

    const get = async (k) => sheets((await api(tok[k]).post('/api/my-backup/xlsx').send({ from: '2026-11-01', to: '2026-11-20', password: PASSWORD })
      .buffer(true).parse(binary).expect(200)).body);
    const hr = await get('HR');
    expect(hr).toEqual(expect.arrayContaining(['เกี่ยวกับไฟล์นี้', 'สถานะลา-ราชการ-นโยบาย', 'มาสาย-ไม่ลงเวลากลับ', 'ประเภทบุคลากร', 'รายงานสรุปประจำวัน', 'ภาพรวม']));
    expect(hr).not.toContain('บันทึกการเข้าแถว');
    const act = await get('ACT');
    expect(act).toEqual(expect.arrayContaining(['บันทึกการเข้าแถว', 'ปฏิทิน', 'รายบุคคล']));
    expect(act).not.toContain('ประเภทบุคลากร');
    const ex = await get('EX');
    expect(ex).toEqual(expect.arrayContaining(['ภาพรวม', 'เอกสารเสนอลงนาม']));
    expect(ex).not.toContain('บันทึกการเข้าแถว');
    const [log] = await h.db.query("SELECT actor_id FROM admin_logs WHERE action = 'my_backup.xlsx' ORDER BY id DESC LIMIT 1");
    expect(log.actor_id).toBe(ids.ex);
  });
});

describe('สำรองทั้งระบบและกู้คืน', () => {
  test('รายการรอบสำรอง จับคู่ฐานข้อมูลกับรูป', async () => {
    const r = await api(tok.ADM).get('/api/admin/backups').expect(200);
    expect(r.body.full.find((f) => f.ts === TS)).toMatchObject({ db: `db-${TS}.sql.gz`, uploads: `uploads-${TS}.tar.gz` });
    expect(r.body.full.find((f) => f.ts === '20261108-0000').uploads).toBeNull();
    await api(tok.HR).get('/api/admin/backups').expect(403);
  });

  let bundle;
  test('ดาวน์โหลดไฟล์กู้คืนทั้งระบบ (.tar) = manifest + ฐานข้อมูล + รูป', async () => {
    await api(tok.ADM).post('/api/admin/backups/full').send({ ts: TS, password: 'bad' }).expect(403);
    await api(tok.ADM).post('/api/admin/backups/full').send({ ts: '../../etc', password: PASSWORD }).expect(400);
    const r = await api(tok.ADM).post('/api/admin/backups/full').send({ ts: TS, password: PASSWORD }).buffer(true).parse(binary).expect(200);
    bundle = r.body;
    const tmp = path.join(DIR, 'test-bundle.tar');
    fs.writeFileSync(tmp, bundle);
    const entries = await tarball.list(tmp);
    expect(entries.map((e) => e.name)).toEqual(['manifest.json', `db-${TS}.sql.gz`, `uploads-${TS}.tar.gz`]);
    const man = JSON.parse(await tarball.readText(tmp, entries[0]));
    expect(man).toMatchObject({ app: 'lineup', db: `db-${TS}.sql.gz` });
    const out = path.join(DIR, 'x.sql.gz');
    await tarball.extract(tmp, entries[1], out);
    expect(fs.readFileSync(out)).toEqual(fs.readFileSync(path.join(DIR, `db-${TS}.sql.gz`)));
    fs.rmSync(tmp); fs.rmSync(out);
  });

  test('อัปโหลดไฟล์ .tar / .sql.gz ตรวจก่อน — ไฟล์อื่นถูกปฏิเสธ', async () => {
    const up = (buf) => h.request(h.app).post('/api/admin/restore/upload').set('Authorization', `Bearer ${tok.ADM}`)
      .set('Content-Type', 'application/octet-stream').send(buf);
    expect((await up(Buffer.from('hello world'))).status).toBe(400);
    expect((await up(zlib.gzipSync(Buffer.from('SELECT 1;')))).body.error).toMatch(/mysqldump/);
    const notOurs = zlib.gzipSync(Buffer.from('-- MySQL dump 10.13\nCREATE TABLE `orders` (id int);\n'));
    expect((await up(notOurs)).body.error).toMatch(/ไม่มีตาราง/);
    const t = await up(bundle);
    expect(t.status).toBe(201);
    expect(t.body).toMatchObject({ source: 'upload', uploads: expect.stringMatching(/^restore\/.+\/uploads\.tar\.gz$/), completedAt: '2026-11-09  5:00:01' });
    const g = await up(dump());
    expect(g.status).toBe(201);
    expect(g.body.uploads).toBeNull();
    expect(fs.existsSync(path.join(DIR, g.body.db))).toBe(true);
    const hr = await h.request(h.app).post('/api/admin/restore/upload').set('Authorization', `Bearer ${tok.HR}`).send(dump());
    expect(hr.status).toBe(403);
    global.uploadedId = t.body.id;
  });

  test('สั่งกู้คืนต้องพิมพ์ยืนยัน + รหัสผ่าน → เขียนคำสั่งให้ container backup และกันสั่งซ้ำ', async () => {
    await api(tok.ADM).post('/api/admin/restore').send({ source: 'server', ts: TS, password: PASSWORD }).expect(400);
    await api(tok.ADM).post('/api/admin/restore').send({ source: 'server', ts: TS, password: 'bad', confirm: 'กู้คืนระบบ' }).expect(403);
    await api(tok.ADM).post('/api/admin/restore').send({ source: 'upload', id: '../../x', password: PASSWORD, confirm: 'กู้คืนระบบ' }).expect(400);
    const r = await api(tok.ADM).post('/api/admin/restore').send({ source: 'server', ts: TS, password: PASSWORD, confirm: 'กู้คืนระบบ' }).expect(202);
    expect(r.body).toMatchObject({ db: `db-${TS}.sql.gz`, uploads: `uploads-${TS}.tar.gz` });
    const job = fs.readFileSync(path.join(DIR, '.restore-request'), 'utf8');
    expect(job).toMatch(new RegExp(`^DB=db-${TS}\\.sql\\.gz$`, 'm'));
    expect(job).toMatch(new RegExp(`^UPLOADS=uploads-${TS}\\.tar\\.gz$`, 'm'));
    expect(job).toMatch(/^BY=ผู้ดูแล$/m);
    expect((await api(tok.ADM).get('/api/admin/restore/status')).body.pending).toBe(true);
    await api(tok.ADM).post('/api/admin/restore').send({ source: 'server', ts: TS, password: PASSWORD, confirm: 'กู้คืนระบบ' }).expect(409);
    fs.rmSync(path.join(DIR, '.restore-request'));

    const u = await api(tok.ADM).post('/api/admin/restore').send({ source: 'upload', id: global.uploadedId, includeUploads: false, password: PASSWORD, confirm: 'กู้คืนระบบ' }).expect(202);
    expect(u.body.uploads).toBeNull();
    expect(fs.readFileSync(path.join(DIR, '.restore-request'), 'utf8')).toMatch(/^UPLOADS=$/m);
    fs.rmSync(path.join(DIR, '.restore-request'));
  });

  test('หลังกู้คืนเสร็จ แอปรัน migration และล้าง cache (watchRestore)', async () => {
    const backups = require('../../src/services/backups');
    const calls = [];
    const p = path.join(DIR, 'restore-last.json');
    fs.writeFileSync(p, JSON.stringify({ finished_at: 'a', ok: true }));
    const timer = backups.watchRestore(async (r) => calls.push(r.finished_at));
    await new Promise((res) => setTimeout(res, 100));
    expect(calls).toEqual([]); // ผลเก่าตอนเริ่มแอป ไม่ทำซ้ำ
    fs.writeFileSync(p, JSON.stringify({ finished_at: 'b', ok: true }));
    await new Promise((res) => setTimeout(res, 5600));
    clearInterval(timer);
    expect(calls).toEqual(['b']);
  }, 10000);
});
