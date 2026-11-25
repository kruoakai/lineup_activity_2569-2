#!/usr/bin/env node
/**
 * ตัวรันภาพจำลองการเข้าแถว — ป้อนเหตุการณ์สมมติเข้า "ตรรกะเดิมของระบบ" แล้วบันทึกผลเป็นไฟล์เล่นซ้ำ
 *
 *   node simulation/run.js            (รันทุกสถานการณ์)
 *   node simulation/run.js normal     (รันเฉพาะสถานการณ์ที่ระบุ)
 *
 * ความปลอดภัย:
 * - ใช้ฐานข้อมูลแยกชื่อลงท้าย _sim บนเครื่องนี้เท่านั้น (ค่าเริ่มต้น: container ทดสอบ lineup-mysql-test พอร์ต 33306)
 * - หยุดทันทีถ้า NODE_ENV=production หรือฐานข้อมูลไม่ใช่ _sim หรือไม่ใช่ localhost
 * - ไม่อ่าน deploy/.env ไม่ใช้ข้อมูลบุคลากรจริง — ผู้ใช้ทั้งหมดเป็นบุคคลสมมติที่สร้างใหม่ทุกครั้ง
 * - ผลลัพธ์ (frontend/src/sim-data/*.json) มีเฉพาะข้อมูลสมมติ
 */
const path = require('path');
const fs = require('fs');
const os = require('os');

const SIM = {
  host: process.env.SIM_DB_HOST || '127.0.0.1',
  port: Number(process.env.SIM_DB_PORT || 33306),
  rootPassword: process.env.SIM_DB_ROOT_PASSWORD || 'testroot',
  user: process.env.SIM_DB_USER || 'lineup',
  password: process.env.SIM_DB_PASSWORD || 'lineuptest',
  database: process.env.SIM_DB_NAME || 'lineup_sim',
};

function guard() {
  const problems = [];
  if (process.env.NODE_ENV === 'production') problems.push('NODE_ENV=production');
  if (!/_sim$/.test(SIM.database)) problems.push(`ชื่อฐานข้อมูลต้องลงท้าย _sim (ได้ ${SIM.database})`);
  if (!['127.0.0.1', 'localhost', '::1'].includes(SIM.host)) problems.push(`ใช้ได้เฉพาะฐานข้อมูลบนเครื่องนี้ (ได้ ${SIM.host})`);
  if (problems.length) {
    console.error(`หยุดการจำลอง: ${problems.join(' · ')}`);
    process.exit(2);
  }
}
guard();

// ตั้งค่าก่อนโหลดโค้ดระบบ (dotenv ไม่ทับค่าที่ตั้งไว้แล้ว)
Object.assign(process.env, {
  NODE_ENV: 'test',
  DB_HOST: SIM.host, DB_PORT: String(SIM.port), DB_USER: SIM.user, DB_PASSWORD: SIM.password, DB_NAME: SIM.database,
  QR_SECRET: 'simulation-only-qr-secret', JWT_SECRET: 'simulation-only-jwt-secret',
  UPLOAD_DIR: path.join(os.tmpdir(), 'lineup-sim-uploads'), BACKUP_DIR: path.join(os.tmpdir(), 'lineup-sim-backups'),
});
delete process.env.SANDBOX_TIME;
delete process.env.SMTP_HOST;

const BACKEND = path.join(__dirname, '..', 'backend');
const mysql = require(path.join(BACKEND, 'node_modules', 'mysql2', 'promise'));
const { SCENARIOS } = require('./scenarios');

const OUT_DIR = path.join(__dirname, '..', 'frontend', 'src', 'sim-data');
const DAY = '2026-12-01'; // วันอังคาร (วันจำลอง ไม่เกี่ยวกับข้อมูลจริง)
const DEPTS = ['ช่างยนต์', 'ช่างไฟฟ้ากำลัง', 'อิเล็กทรอนิกส์', 'ช่างก่อสร้าง', 'ช่างกลโรงงาน', 'เทคโนโลยีสารสนเทศ', 'การบัญชี', 'การตลาด', 'สามัญสัมพันธ์'];
// ผังฉาก (เมตร จากเสาธง: x = ตะวันออก, y = เหนือ)
const SCENE = {
  flag: [0, 0], qr: [0, 16], activity: [-46, 22], hr: [150, 96], gate: [168, -236], parking: [-176, -206],
  shade: [-196, -70], rows: { x0: -88, dx: 22, y0: -20, dy: -6 },
};

// ---------- ตัวช่วย ----------
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const sec = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return (h - 7) * 3600 + m * 60; }; // วินาทีนับจาก 07:00
const hms = (t) => { const s = 7 * 3600 + Math.round(t); return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
const at = (t, day = DAY) => new Date(new Date(`${day}T07:00:00+07:00`).getTime() + Math.round(t * 1000));

async function prepareDatabase() {
  const root = await mysql.createConnection({ host: SIM.host, port: SIM.port, user: 'root', password: SIM.rootPassword });
  await root.query(`CREATE DATABASE IF NOT EXISTS \`${SIM.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await root.query(`GRANT ALL PRIVILEGES ON \`${SIM.database}\`.* TO ?@'%'`, [SIM.user]);
  await root.end();
}

async function main() {
  const only = process.argv[2];
  const list = SCENARIOS.filter((s) => !only || s.key === only);
  if (!list.length) throw new Error(`ไม่พบสถานการณ์ ${only}`);
  await prepareDatabase();

  const db = require(path.join(BACKEND, 'src', 'db'));
  const { migrate } = require(path.join(BACKEND, 'scripts', 'migrate'));
  await migrate();
  // ตรวจซ้ำหลังเชื่อมต่อ: ต้องเป็นฐานข้อมูลจำลองจริง
  const [{ d }] = await db.query('SELECT DATABASE() AS d');
  if (!/_sim$/.test(d)) throw new Error(`เชื่อมต่อฐานข้อมูลผิด (${d}) — หยุด`);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const index = [];
  for (const sc of list) {
    const out = await runScenario(sc);
    fs.writeFileSync(path.join(OUT_DIR, `${sc.key}.json`), JSON.stringify(out));
    const t = out.summary.total;
    console.log(`${sc.key.padEnd(12)} มา ${t.present} · รอตรวจ ${t.pending} · ขาด ${t.absent} · ราชการ ${t.official} · นโยบาย ${t.policy} · ลา ${t.leave} · อัตรา ${t.rate ?? '-'}% · เหตุการณ์ ${out.events.length}`);
  }
  // สารบัญ (โหลดพร้อมหน้าเว็บ) — รวมสถานการณ์ที่รันไว้ก่อนหน้า
  for (const sc of SCENARIOS) {
    const f = path.join(OUT_DIR, `${sc.key}.json`);
    if (!fs.existsSync(f)) continue;
    const o = JSON.parse(fs.readFileSync(f, 'utf8'));
    index.push({ key: sc.key, title: sc.title, desc: sc.desc, generatedAt: o.generatedAt, total: o.summary.total });
  }
  fs.writeFileSync(path.join(OUT_DIR, 'index.json'), JSON.stringify(index, null, 1));
  await db.close();
}

async function resetData(db) {
  const tables = (await db.query("SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name <> 'schema_migrations'")).map((r) => r.t);
  await db.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const t of tables) await db.query(`TRUNCATE TABLE \`${t}\``);
  await db.query('SET FOREIGN_KEY_CHECKS = 1');
}

async function runScenario(sc) {
  const db = require(path.join(BACKEND, 'src', 'db'));
  const clock = require(path.join(BACKEND, 'src', 'clock'));
  const settings = require(path.join(BACKEND, 'src', 'services', 'settings'));
  const schedule = require(path.join(BACKEND, 'src', 'services', 'schedule'));
  const attendance = require(path.join(BACKEND, 'src', 'services', 'attendance'));
  const hr = require(path.join(BACKEND, 'src', 'services', 'hr'));
  const leaveRequests = require(path.join(BACKEND, 'src', 'services', 'leaveRequests'));
  const reports = require(path.join(BACKEND, 'src', 'services', 'reports'));
  const qr = require(path.join(BACKEND, 'src', 'services', 'qr'));
  const R = rng(sc.seed);
  const U = (a, b) => a + R() * (b - a);
  const gauss = () => { let u = 0; let v = 0; while (!u) u = R(); while (!v) v = R(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

  await resetData(db);
  settings.invalidate();
  const CENTER = { lat: 15.8, lng: 102.03 }; // จุดสมมติ
  await settings.update({ geofence_lat: String(CENTER.lat), geofence_lng: String(CENTER.lng), geofence_radius_m: '150', max_accuracy_m: '100', check_mode: 'gps_or_qr', qr_interval_s: '30', open_time: '07:30', close_time: '08:30' });
  if (sc.dayStatus) await db.query('INSERT INTO assembly_days (day, status, note) VALUES (?, ?, ?)', [DAY, sc.dayStatus, 'ประชุมผู้ปกครอง (สมมติ)']);
  const s = await settings.getAll();

  // ---------- บุคคลสมมติ ----------
  const HASH = '$2a$10$simulationsimulationsimulationsimulationsimulation12'; // ไม่ใช่รหัสผ่านที่ใช้ได้
  const deptIds = [];
  for (const name of DEPTS) deptIds.push((await db.query('INSERT INTO departments (name, division) VALUES (?, ?)', [name, 'ภาพจำลอง'])).insertId);
  const mkUser = async (code, name, deptId, role, canProxy, mustAssemble) => (await db.query(
    `INSERT INTO users (employee_code, full_name, department_id, role, can_proxy, must_assemble, active, password_hash, must_change_password, consent_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, 0, NOW())`, [code, name, deptId, role, canProxy ? 1 : 0, mustAssemble ? 1 : 0, HASH])).insertId;
  const activity = { id: await mkUser('SIM-ACT', 'เจ้าหน้าที่งานกิจกรรม (สมมติ)', null, 'activity', false, false), role: 'activity', full_name: 'เจ้าหน้าที่งานกิจกรรม (สมมติ)' };
  const hrUser = { id: await mkUser('SIM-HR', 'เจ้าหน้าที่บุคลากร (สมมติ)', null, 'hr', false, false), role: 'hr', full_name: 'เจ้าหน้าที่บุคลากร (สมมติ)' };

  const agents = [];
  const perDept = Math.ceil(sc.people / DEPTS.length);
  for (let i = 0; i < sc.people; i += 1) {
    const d = i % DEPTS.length;
    const k = Math.floor(i / DEPTS.length);
    const rep = k === 0;
    const name = `บุคลากรสมมติ ${String(i + 1).padStart(3, '0')}`;
    const id = await mkUser(`SIM${String(i + 1).padStart(3, '0')}`, name, deptIds[d], 'staff', rep, true);
    const col = k % 2 === 0 ? -3.5 : 3.5;
    const spot = [SCENE.rows.x0 + d * SCENE.rows.dx + col, SCENE.rows.y0 + Math.floor(k / 2) * SCENE.rows.dy];
    agents.push({
      i, id, name, dept: d, deptId: deptIds[d], rep, spot, user: { id, must_assemble: 1, full_name: name },
      device: `sim-device-${i}`, ip: `10.20.${d}.${k + 10}`,
    });
  }
  void perDept;

  // ---------- กำหนดพฤติกรรม ----------
  const pick = (n, filter) => {
    const pool = agents.filter(filter);
    const outp = [];
    while (outp.length < n && pool.length) outp.push(pool.splice(Math.floor(R() * pool.length), 1)[0]);
    return outp;
  };
  const NOTE_OFFICIAL = ['อบรมพัฒนาครู ณ สำนักงานคณะกรรมการการอาชีวศึกษา (สมมติ)', 'นำนักเรียนแข่งขันทักษะวิชาชีพ ระดับภาค (สมมติ)', 'นิเทศนักศึกษาฝึกงาน (สมมติ)'];
  const NOTE_POLICY = ['ออกหน่วยบริการ Fix It Center (สมมติ)', 'ประชาสัมพันธ์รับสมัครนักศึกษา (สมมติ)'];
  const away = (n, tag) => pick(Math.round(sc.people * n), (a) => !a.away && !a.rep).forEach((a) => { a.away = tag; });
  away(sc.official, 'official');
  away(sc.policy, 'policy');
  away(sc.leave, 'leave');
  pick(sc.leaveRequests, (a) => !a.away && !a.rep).forEach((a) => { a.away = 'request'; a.reqKind = ['sick', 'personal', 'official', 'policy'][Math.floor(R() * 4)]; });

  const mean = sec(sc.arriveMean);
  for (const a of agents.filter((x) => !x.away)) {
    a.arrive = Math.max(sec('07:12'), mean + gauss() * sc.arriveSd * 60);
    if (R() < sc.late) a.arrive = sec('08:31') + U(30, 900);
    a.forget = !a.rep && R() < sc.forget;
    a.qr = R() < sc.qr;
    a.lowAcc = R() < sc.lowAccuracy;
    a.noGps = R() < sc.noGps;
    a.edge = !a.forget && R() < sc.edgeOfZone ? [SCENE.shade[0] + U(-14, 14), SCENE.shade[1] + U(-30, 30)] : null;
    a.reviewInstead = R() < 0.35; // GPS ไม่แม่น: ส่งคำขอตรวจสอบแทนการลองใหม่
    const from = R() < 0.6 ? SCENE.gate : SCENE.parking;
    const first = a.edge || a.spot;
    a.from = from;
    a.spawn = a.arrive - Math.hypot(first[0] - from[0], first[1] - from[1]) / 1.3;
  }
  // ใช้เครื่องเดียวเช็กชื่อให้กัน (คนหนึ่งลืมโทรศัพท์)
  const pairs = [];
  for (let n = 0; n < sc.sharedDevice; n += 1) {
    const [x] = pick(1, (a) => !a.away && !a.forget && !a.rep && !a.borrower && !a.lender && a.arrive < sec('08:20'));
    if (!x) break;
    const [y] = pick(1, (a) => !a.away && !a.forget && !a.rep && !a.borrower && !a.lender && a.dept === x.dept && a !== x);
    if (!y) break;
    x.lender = y.i; y.borrower = x.i; y.arrive = x.arrive + U(5, 40); y.spawn = x.spawn + 5; y.qr = false; y.edge = null; y.from = x.from;
    pairs.push([x.i, y.i]);
  }

  // ---------- คิวเหตุการณ์ ----------
  const events = [];
  const queue = [];
  const schedule_ = (t, fn) => { queue.push({ t, fn, n: queue.length }); };
  const ev = (t, a, k, m, extra = {}) => events.push({ t: Math.round(t), a, k, m, ...extra });
  const outage = sc.outage ? sc.outage.map(sec) : null;
  const inOutage = (t) => outage && t >= outage[0] && t < outage[1];
  const posOf = (a, useEdge) => (useEdge && a.edge ? a.edge : a.spot);
  const errMsg = (e) => e.message || String(e);

  // 1) คำแจ้งลาด้วยตนเองเมื่อวาน → เจ้าหน้าที่บุคลากรอนุมัติเช้านี้
  const prevDay = clock.addDays(DAY, -1);
  const reqIds = [];
  for (const a of agents.filter((x) => x.away === 'request')) {
    clock.setNow(at(sec('10:00') + U(0, 6 * 3600), prevDay));
    const note = ['official', 'policy'].includes(a.reqKind) ? (a.reqKind === 'official' ? NOTE_OFFICIAL[0] : NOTE_POLICY[0]) : '';
    const r = await leaveRequests.create(a.user, { kind: a.reqKind, from: DAY, to: DAY, note });
    reqIds.push([a, r.id]);
    ev(-3600 * 14, a.i, 'leave_req', `แจ้ง${{ sick: 'ลาป่วย', personal: 'ลากิจ', official: 'ไปราชการ', policy: 'งานนโยบาย' }[a.reqKind]}ด้วยตนเอง (เมื่อวาน)`);
  }
  schedule_(sec('07:10'), async (t) => {
    for (const [a, id] of reqIds) {
      await leaveRequests.approve(hrUser, id, '10.20.99.2');
      ev(t, a.i, 'leave_ok', 'เจ้าหน้าที่บุคลากรตรวจคำแจ้งแล้ว บันทึกลงรายงาน', { st: (await attendance.findRecord(a.id, DAY))?.status });
      t += 8;
    }
  });
  // 2) เจ้าหน้าที่บุคลากรบันทึกไปราชการ / งานนโยบาย / ลา ไว้ก่อน (ตามหนังสือสั่งการ / ใบลา)
  schedule_(sec('07:02'), async (t) => {
    const groups = [
      ['official', agents.filter((a) => a.away === 'official')],
      ['policy', agents.filter((a) => a.away === 'policy')],
      ['leave', agents.filter((a) => a.away === 'leave')],
    ];
    for (const [status, list] of groups) {
      if (!list.length) continue;
      if (status === 'leave') {
        for (const a of list) {
          a.leaveType = R() < 0.6 ? 'sick' : 'personal';
          await hr.setStatus(hrUser, { from: DAY, to: DAY, status: 'leave', leaveType: a.leaveType, note: '', userIds: [a.id] }, '10.20.99.2');
        }
      } else {
        const note = status === 'official' ? NOTE_OFFICIAL[Math.floor(R() * NOTE_OFFICIAL.length)] : NOTE_POLICY[Math.floor(R() * NOTE_POLICY.length)];
        await hr.setStatus(hrUser, { from: DAY, to: DAY, status, note, userIds: list.map((a) => a.id) }, '10.20.99.2');
      }
      for (const a of list) ev(t, a.i, 'hr_pre', { official: 'บันทึกไปราชการไว้ก่อน', policy: 'บันทึกงานนโยบายไว้ก่อน', leave: `บันทึก${a.leaveType === 'sick' ? 'ลาป่วย' : 'ลากิจ'}ไว้ก่อน` }[status], { st: status });
      t += 20;
    }
  });

  // 3) บุคลากรมาถึงแล้วเช็กชื่อ
  async function attempt(t, a, n, opts = {}) {
    if (inOutage(t)) {
      ev(t, a.i, 'net_err', 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ตรวจสอบอินเทอร์เน็ต');
      schedule_(outage[1] + U(10, 150), (tt) => attempt(tt, a, n + 1, opts));
      return;
    }
    const target = opts.forUser ? agents[opts.forUser] : a;
    const p = posOf(a, (n === 0 || opts.requestReview) && !opts.moved);
    const goodAcc = U(5, 24);
    // ส่งคำขอตรวจสอบ = ยังอยู่ในสภาพเดิมที่เช็กไม่ผ่าน (GPS ไม่แม่น / ยืนนอกวง)
    const accuracy = a.lowAcc && (n === 0 || opts.requestReview) ? U(120, 320) : goodAcc;
    const gps = !(a.noGps && !opts.qr);
    const noise = Math.min(accuracy, 60) / 2;
    const dx = p[0] + gauss() * noise;
    const dy = p[1] + gauss() * noise;
    const mPerLng = 111320 * Math.cos((CENTER.lat * Math.PI) / 180);
    const body = { deviceId: a.device };
    if (gps) Object.assign(body, { lat: CENTER.lat + dy / 111320, lng: CENTER.lng + dx / mPerLng, accuracy });
    const useQr = opts.qr || (a.qr && n === 0 && !opts.forUser);
    if (useQr) body.qrToken = qr.current(s.qr_interval_s, clock.now()).token;
    if (opts.requestReview) { body.requestReview = true; body.note = 'ยืนอยู่ใต้ร่มไม้ข้างลานเสาธง (สมมติ)'; }
    const info = { x: Math.round(dx), y: Math.round(dy), acc: gps ? Math.round(accuracy) : null, qr: !!useQr, gps };
    try {
      const r = await attendance.selfCheckIn(target.user, body, a.ip);
      if (r.needsReview) {
        ev(t, target.i, 'need_review', r.message, { ...info, geo: r.geo, d: r.distance });
        if (a.reviewInstead && (a.lowAcc || a.edge) && !opts.forUser) schedule_(t + U(30, 70), (tt) => attempt(tt, a, n + 1, { ...opts, requestReview: true }));
        else if (a.noGps) schedule_(t + U(25, 60), (tt) => attempt(tt, a, n + 1, { ...opts, qr: true }));
        else if (a.edge && !opts.moved) schedule_(t + U(40, 80), (tt) => attempt(tt, a, n + 1, { ...opts, moved: true }));
        else schedule_(t + U(20, 50), (tt) => attempt(tt, a, n + 1, opts));
        return;
      }
      if (r.alreadyChecked) { ev(t, target.i, 'already', r.message, { ...info, st: r.record?.status }); return; }
      const rec = r.record;
      ev(t, target.i, rec.status === 'pending' ? 'try_pending' : 'try_ok', r.message, {
        ...info, st: rec.status, method: rec.method, d: rec.distance_m, flag: rec.flagged ? rec.flag_reason : undefined,
        by: opts.forUser ? a.i : undefined,
      });
      if (a.lender !== undefined && !opts.forUser) {
        // เช็กให้เพื่อนที่ลืมโทรศัพท์ด้วยเครื่องตัวเอง
        schedule_(t + U(15, 45), (tt) => attempt(tt, a, 0, { forUser: a.lender, moved: true }));
      }
    } catch (e) {
      const code = e.code || '';
      ev(t, target.i, { CLOSED: 'err_closed', NO_ASSEMBLY: 'err_no_assembly', NOT_OPEN: 'err_not_open' }[code] || 'err', errMsg(e), info);
      if (code === 'NOT_OPEN') schedule_(sec('07:30') + U(5, 120), (tt) => attempt(tt, a, n + 1, opts));
    }
  }
  const tries = agents.filter((a) => !a.away && !a.forget && a.borrower === undefined);
  for (const a of tries) {
    if (sc.dayStatus && R() < 0.65) { a.noTry = true; continue; } // รู้แล้วว่างดเข้าแถว
    schedule_(a.arrive + U(5, 45), (t) => attempt(t, a, 0));
  }
  if (!sc.dayStatus) for (const a of agents.filter((x) => x.forget)) ev(a.arrive + 20, a.i, 'forget', 'มาถึงแล้วแต่ลืมเช็กชื่อ');
  if (!sc.dayStatus) for (const a of agents.filter((x) => x.borrower !== undefined)) ev(a.arrive + 10, a.i, 'no_phone', 'ลืมโทรศัพท์ ให้เพื่อนช่วยเช็กด้วยเครื่องของเพื่อน');

  // 4) งานกิจกรรมตรวจคำขอ "รอตรวจสอบ" เป็นระยะ
  if (!sc.dayStatus) {
    for (let t = sec('07:40'); t <= sec('08:40'); t += sc.approveEvery * 60) {
      schedule_(t, async (tt) => {
        const rows = await db.query("SELECT user_id FROM attendance WHERE day = ? AND status = 'pending'", [DAY]);
        for (const r of rows) {
          const a = agents.find((x) => x.id === r.user_id);
          try {
            await attendance.recordFor(activity, { userId: r.user_id, status: 'present', reason: 'ตรวจรูปและหมายเหตุแล้ว อยู่บริเวณลานเสาธง (สมมติ)' }, '10.20.99.1');
            ev(tt, a.i, 'approve', 'งานกิจกรรมตรวจแล้ว ยืนยัน "มาเข้าแถว"', { st: 'present' });
          } catch (e) { ev(tt, a.i, 'err', errMsg(e)); }
          tt += 6;
        }
      });
    }
    // 5) ตัวแทนแผนกตรวจรายชื่อ แล้วเช็กแทนคนที่ลืม (ต้องอยู่ในช่วงเปิด)
    schedule_(sec(sc.proxyAt), async (t) => {
      for (const a of agents.filter((x) => x.forget && x.arrive < sec(sc.proxyAt))) {
        const rep = agents.find((x) => x.rep && x.dept === a.dept);
        const actor = { id: rep.id, role: 'staff', can_proxy: true, peer_check: false, department_id: rep.deptId, full_name: rep.name };
        try {
          await attendance.recordFor(actor, { userId: a.id, status: 'present' }, rep.ip);
          ev(t, a.i, 'proxy_ok', `ตัวแทนแผนก (${rep.name}) เช็กแทนให้`, { st: 'present', by: rep.i, method: 'proxy_dept' });
        } catch (e) { ev(t, a.i, 'proxy_err', `ตัวแทนแผนกเช็กแทนไม่ได้: ${errMsg(e)}`, { by: rep.i }); }
        t += 7;
      }
    });
  }
  // 6) งานกิจกรรมสั่งปิดก่อนเวลา
  if (sc.closeEarly) {
    schedule_(sec(sc.closeEarly), async (t) => {
      await schedule.setManual(activity, 'closed');
      ev(t, -1, 'close_manual', `งานกิจกรรมสั่งปิดการเช็กชื่อด้วยมือ (${sc.closeEarly} น.)`);
    });
  }

  // ---------- เดินเวลา ----------
  while (queue.length) {
    queue.sort((x, y) => x.t - y.t || x.n - y.n);
    const job = queue.shift();
    clock.setNow(at(job.t));
    await job.fn(job.t);
  }

  // ---------- สรุปผลด้วยรายงานจริงของระบบ หลังปิดเช็กชื่อ ----------
  clock.setNow(at(sec('08:45')));
  const summary = await reports.summary({ from: DAY, to: DAY, scope: { all: true } });
  const recs = await db.query('SELECT user_id, status, leave_type, method, flagged, flag_reason, distance_m FROM attendance WHERE day = ?', [DAY]);
  const byUser = new Map(recs.map((r) => [r.user_id, r]));
  const state = await schedule.windowState();
  clock.setNow(null);

  events.sort((x, y) => x.t - y.t);
  return {
    key: sc.key, title: sc.title, desc: sc.desc, day: DAY, generatedAt: new Date().toISOString(),
    rules: { openTime: s.open_time, closeTime: s.close_time, mode: s.check_mode, radius: s.geofence_radius_m, maxAccuracy: s.max_accuracy_m, qrInterval: s.qr_interval_s },
    params: { people: sc.people, outage: sc.outage, closeEarly: sc.closeEarly, dayStatus: sc.dayStatus, proxyAt: sc.proxyAt },
    scene: SCENE, depts: DEPTS, pairs,
    agents: agents.map((a) => {
      const r = byUser.get(a.id);
      return {
        n: a.name, d: a.dept, rep: a.rep || undefined, spot: a.spot, from: a.from, edge: a.edge || undefined,
        spawn: a.spawn !== undefined ? Math.round(a.spawn) : undefined, arrive: a.arrive !== undefined ? Math.round(a.arrive) : undefined,
        away: a.away ? (a.away === 'request' ? { sick: 'leave', personal: 'leave', official: 'official', policy: 'policy' }[a.reqKind] : a.away) : undefined,
        req: a.away === 'request' || undefined, noTry: a.noTry || undefined,
        final: r ? { st: r.status, lt: r.leave_type || undefined, m: r.method, f: r.flagged ? r.flag_reason : undefined } : null,
      };
    }),
    events: events.map((e) => ({ ...e, hm: hms(e.t) })),
    summary: { total: summary.total, departments: summary.departments.map((x) => ({ name: x.department_name, members: x.members, present: x.present, absent: x.absent, pending: x.pending, official: x.official, policy: x.policy, leave: x.leave, rate: x.rate })), days: summary.days, phase: state.phase },
  };
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
