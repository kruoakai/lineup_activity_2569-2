const crypto = require('crypto');
const db = require('../db');
const clock = require('../clock');
const schedule = require('./schedule');
const settings = require('./settings');
const files = require('./files');
const mailer = require('./mailer');
const { orderOf } = require('./reportGroups');
const { confirmPassword } = require('./confirm');
const { HttpError } = require('../middleware/auth');
const { canViewAll } = require('./permissions');

// ร้อยละตามแบบบันทึกของวิทยาลัย = จำนวนคน-ครั้งที่มาเข้าแถว ÷ (จำนวนคน × จำนวนวัน) × 100
const pct = (n, d) => (d > 0 ? Math.round((n / d) * 10000) / 100 : null);

async function officialReport({ from, to }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from || '') || !/^\d{4}-\d{2}-\d{2}$/.test(to || '') || from > to) {
    throw new HttpError(400, 'ช่วงวันที่ไม่ถูกต้อง');
  }
  const s = await settings.getAll();
  const today = clock.bangkok().day;
  const effTo = to > today ? today : to;
  const days = from <= effTo ? await schedule.assemblyDaysBetween(from, effTo) : [];
  if (days.length > 31) throw new HttpError(400, 'แบบรายงานเสนอลงนามรองรับไม่เกิน 31 วันเข้าแถว');
  const users = await db.query(
    `SELECT u.id, u.report_group AS user_group, COALESCE(u.report_group, d.report_group, d.name, 'ไม่ระบุหน่วยงาน') AS grp,
            COALESCE(d.report_order, 999) AS dept_order
       FROM users u LEFT JOIN departments d ON d.id = u.department_id
      WHERE u.active = 1 AND u.must_assemble = 1`,
  );
  const groups = new Map();
  const userGroup = new Map();
  for (const u of users) {
    const order = u.user_group ? orderOf(u.grp) : u.dept_order;
    if (!groups.has(u.grp)) groups.set(u.grp, { group: u.grp, order, members: 0, perDay: {}, excusedPerDay: {} });
    const g = groups.get(u.grp);
    g.order = Math.min(g.order, order);
    g.members += 1;
    userGroup.set(u.id, g);
  }
  const rows = days.length && users.length
    ? await db.query("SELECT user_id, day, status FROM attendance WHERE day IN (?) AND status IN ('present','official','policy','leave')", [days])
    : [];
  for (const g of groups.values()) for (const d of days) { g.perDay[d] = 0; g.excusedPerDay[d] = 0; }
  let demoRows = 0;
  for (const r of rows) {
    const g = userGroup.get(r.user_id);
    if (!g) continue;
    if (r.status === 'present') g.perDay[r.day] += 1;
    else g.excusedPerDay[r.day] += 1;
  }
  if (days.length) {
    const [d] = await db.query('SELECT COUNT(*) AS n FROM attendance WHERE is_demo = 1 AND day IN (?)', [days]);
    demoRows = d.n;
  }
  const list = [...groups.values()]
    .sort((a, b) => a.order - b.order || a.group.localeCompare(b.group, 'th'))
    .map((g, i) => {
      const total = days.reduce((a, d) => a + g.perDay[d], 0);
      const excused = days.reduce((a, d) => a + g.excusedPerDay[d], 0);
      const possible = g.members * days.length;
      return { no: i + 1, group: g.group, members: g.members, perDay: g.perDay, excusedPerDay: g.excusedPerDay, total, excused, possible, percent: pct(total, possible) };
    });
  const totals = {
    members: list.reduce((a, r) => a + r.members, 0),
    perDay: Object.fromEntries(days.map((d) => [d, list.reduce((a, r) => a + r.perDay[d], 0)])),
    excusedPerDay: Object.fromEntries(days.map((d) => [d, list.reduce((a, r) => a + r.excusedPerDay[d], 0)])),
    total: list.reduce((a, r) => a + r.total, 0),
    excused: list.reduce((a, r) => a + r.excused, 0),
    possible: list.reduce((a, r) => a + r.possible, 0),
  };
  totals.percent = pct(totals.total, totals.possible);
  return { title: s.report_form_title, collegeName: s.college_name, from, to, days, rows: list, totals, demo: demoRows > 0, generatedAt: clock.now().toISOString() };
}

// ---------- เอกสารเสนอลงนาม ----------
async function signerSteps() {
  const s = await settings.getAll();
  const steps = [];
  for (const n of [1, 2, 3]) {
    const uid = Number(s[`sign_step${n}_user`]);
    if (!uid) throw new HttpError(400, `ยังไม่ได้กำหนดผู้ลงนามลำดับที่ ${n} (เมนูผู้ดูแล → แบบรายงานและผู้ลงนาม)`);
    const [u] = await db.query('SELECT id, full_name, email, active FROM users WHERE id = ?', [uid]);
    if (!u || !u.active) throw new HttpError(400, `ผู้ลงนามลำดับที่ ${n} ไม่พบหรือถูกระงับ`);
    steps.push({ step: n, title: s[`sign_step${n}_title`], label: s[`sign_step${n}_label`], user_id: u.id, user_name: u.full_name });
  }
  return steps;
}

async function isSigner(userId) {
  const s = await settings.getAll();
  return [1, 2, 3].some((n) => Number(s[`sign_step${n}_user`]) === userId);
}

async function notify(userId, doc, text) {
  if (!mailer.enabled()) return;
  const [u] = await db.query('SELECT email, full_name FROM users WHERE id = ?', [userId]);
  if (!u?.email) return;
  const link = `${mailer.appUrl()}/report-docs/${doc.id}`;
  mailer.send({ to: u.email, subject: `${text}: ${doc.title}`, text: `เรียน ${u.full_name}\n\n${text}\n${doc.title}\n\nเปิดเอกสาร: ${link}\n\nระบบเช็กชื่อเข้าแถว วิทยาลัยเทคนิคชัยภูมิ` })
    .catch((e) => console.error('notify mail failed', e.message));
}

function parse(doc) {
  return {
    ...doc,
    snapshot: typeof doc.snapshot === 'string' ? JSON.parse(doc.snapshot) : doc.snapshot,
    steps: typeof doc.steps === 'string' ? JSON.parse(doc.steps) : doc.steps,
    is_demo: !!doc.is_demo,
  };
}

// แบ่งหน้าที่: ผู้จัดทำ (เจ้าหน้าที่บุคลากร / ผู้ดูแลระบบ) ≠ ผู้ลงนาม — ผู้บริหารและผู้ลงนามลงนามและดูสารสนเทศได้อย่างเดียว
async function canCreate(user) {
  return ['hr', 'admin'].includes(user.role);
}

const findDup = async (day) => (await db.query(
  "SELECT id FROM report_docs WHERE kind = 'hr_daily' AND period_from = ? AND status <> 'returned' LIMIT 1", [day]))[0];

// ตัวอย่างก่อนสร้าง: ตัวเลข + คำเตือน (เช่น ยังไม่กำหนดประเภทบุคลากร) + มีเอกสารของวันนั้นแล้วหรือไม่
async function preview(user, day) {
  if (!(await canCreate(user))) throw new HttpError(403, 'ไม่มีสิทธิ์สร้างเอกสารเสนอลงนาม');
  const r = await require('./hr').dailySummary(day);
  return { ...r, existingId: (await findDup(day))?.id || null };
}

async function create(user, { day, from, to, title }) {
  if (!(await canCreate(user))) throw new HttpError(403, 'ไม่มีสิทธิ์สร้างเอกสารเสนอลงนาม');
  // หน้าเว็บรุ่นเก่า (แบบช่วงวันที่) ยังค้างในเครื่อง → บอกให้โหลดหน้าใหม่แทนข้อความวันที่ไม่ถูกต้อง
  if (!day && (from || to)) {
    throw new HttpError(409, 'หน้าเว็บในเครื่องนี้เป็นเวอร์ชันเก่า — กดรีเฟรชหน้า (Ctrl+F5 หรือปิดแล้วเปิดแอปใหม่) แล้วสร้างรายงานประจำวันอีกครั้ง', 'STALE_CLIENT');
  }
  const { snapshot } = await require('./hr').dailySummary(day);
  if (await findDup(day)) throw new HttpError(409, 'มีรายงานของวันนี้แล้ว — เปิดฉบับเดิม หรือให้ผู้ลงนามส่งกลับแก้ไขก่อนสร้างใหม่', 'DUPLICATE');
  const steps = await signerSteps();
  steps[steps.length - 1].decision = true; // ผู้อำนวยการ: ☐ ทราบ ☐ มอบ …
  const t = String(title || '').trim().slice(0, 255) || `${snapshot.title} ${snapshot.dateText}`;
  const json = JSON.stringify(snapshot);
  const hash = crypto.createHash('sha256').update(json).digest('hex');
  const r = await db.query(
    "INSERT INTO report_docs (kind, title, period_from, period_to, snapshot, snapshot_hash, steps, is_demo, created_by, created_at) VALUES ('hr_daily', ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [t, day, day, json, hash, JSON.stringify(steps), snapshot.demo ? 1 : 0, user.id, clock.now()],
  );
  const doc = { id: r.insertId, title: t };
  notify(steps[0].user_id, doc, 'มีเอกสารรอท่านลงนาม');
  return get(user, r.insertId);
}

async function canView(user, doc) {
  return canViewAll(user) || doc.created_by === user.id || doc.steps.some((s) => s.user_id === user.id);
}

async function get(user, id) {
  const [row] = await db.query(
    'SELECT r.*, u.full_name AS created_by_name FROM report_docs r JOIN users u ON u.id = r.created_by WHERE r.id = ?',
    [Number(id)],
  );
  if (!row) throw new HttpError(404, 'ไม่พบเอกสาร');
  const doc = parse(row);
  if (!(await canView(user, doc))) throw new HttpError(403, 'ไม่มีสิทธิ์ดูเอกสารนี้');
  const sigs = await db.query(
    `SELECT s.id, s.step, s.action, s.signer_id, u.full_name AS signer_name, s.signature_path IS NOT NULL AS has_image,
            s.comment, s.decision, s.signed_at
       FROM report_signatures s JOIN users u ON u.id = s.signer_id WHERE s.doc_id = ? ORDER BY s.id`,
    [doc.id],
  );
  const current = doc.status === 'pending' ? doc.steps[doc.current_step - 1] : null;
  // ความพร้อมของบัญชีผู้ลงนาม (ให้ผู้ดูแล/งานกิจกรรม/ผู้บริหารเห็นว่าใครยังไม่เคยเข้าระบบ)
  let accounts;
  if (canViewAll(user) || doc.created_by === user.id) {
    const ids = doc.steps.map((s) => s.user_id).filter(Boolean);
    const rows = ids.length ? await db.query(
      'SELECT id, active, must_change_password, consent_at IS NOT NULL AS consented, signature_path IS NOT NULL AS has_signature FROM users WHERE id IN (?)', [ids],
    ) : [];
    accounts = Object.fromEntries(rows.map((r) => [r.id, {
      active: !!r.active, ready: !!r.active && !r.must_change_password && !!r.consented, has_signature: !!r.has_signature,
    }]));
  }
  for (const sg of sigs) if (typeof sg.decision === 'string') sg.decision = JSON.parse(sg.decision);
  const rights = manageRights(user, doc, activeSigs(sigs));
  return { ...doc, signatures: sigs, canSign: !!current && current.user_id === user.id, accounts, ...rights };
}

// ลายเซ็นรอบปัจจุบัน = หลังการแก้ไขครั้งล่าสุด (รอบก่อนแก้ไขเก็บไว้เป็นประวัติ ไม่แสดงในเอกสาร)
function activeSigs(sigs) {
  let i = -1;
  sigs.forEach((s, k) => { if (s.action === 'revise') i = k; });
  return sigs.slice(i + 1);
}

// ผู้จัดทำ (หรือผู้ดูแลระบบ) แก้ไขได้เมื่อยังไม่มีใครลงนาม หรือถูกส่งกลับแก้ไข / ลบได้เมื่อยังไม่อนุมัติ (ผู้ดูแลลบได้ทุกสถานะ)
function manageRights(user, doc, sigs) {
  const owner = ['hr', 'admin'].includes(user.role) && (doc.created_by === user.id || user.role === 'admin');
  const signed = sigs.some((s) => s.action === 'sign');
  return {
    canEdit: owner && (doc.status === 'returned' || (doc.status === 'pending' && !signed)),
    canDelete: owner && (doc.status !== 'approved' || user.role === 'admin'),
  };
}

async function update(user, id, { title, refresh }) {
  const doc = await get(user, id);
  if (!doc.canEdit) throw new HttpError(403, 'แก้ไขได้เฉพาะผู้จัดทำ ก่อนมีผู้ลงนาม หรือเมื่อถูกส่งกลับแก้ไข');
  const t = title === undefined ? doc.title : String(title || '').trim().slice(0, 255);
  if (!t) throw new HttpError(400, 'กรุณาระบุชื่อเอกสาร');
  if (!refresh) {
    await db.query('UPDATE report_docs SET title = ? WHERE id = ?', [t, doc.id]);
    return get(user, doc.id);
  }
  if (doc.kind !== 'hr_daily') throw new HttpError(400, 'เอกสารแบบเดิมดึงข้อมูลใหม่ไม่ได้ — ลบแล้วสร้างใหม่');
  const dup = (await db.query(
    "SELECT id FROM report_docs WHERE kind = 'hr_daily' AND period_from = ? AND status <> 'returned' AND id <> ? LIMIT 1", [doc.period_from, doc.id]))[0];
  if (dup) throw new HttpError(409, 'มีรายงานของวันนี้อีกฉบับอยู่แล้ว', 'DUPLICATE');
  const { snapshot } = await require('./hr').dailySummary(doc.period_from);
  const steps = await signerSteps();
  steps[steps.length - 1].decision = true;
  const json = JSON.stringify(snapshot);
  const hash = crypto.createHash('sha256').update(json).digest('hex');
  await db.query(
    "UPDATE report_docs SET title = ?, snapshot = ?, snapshot_hash = ?, steps = ?, is_demo = ?, status = 'pending', current_step = 1 WHERE id = ?",
    [t, json, hash, JSON.stringify(steps), snapshot.demo ? 1 : 0, doc.id],
  );
  await db.query(
    "INSERT INTO report_signatures (doc_id, step, action, signer_id, comment, signed_at) VALUES (?, 0, 'revise', ?, ?, ?)",
    [doc.id, user.id, 'ดึงข้อมูลล่าสุดและส่งลงนามใหม่', clock.now()],
  );
  notify(steps[0].user_id, { id: doc.id, title: t }, 'มีเอกสารรอท่านลงนาม (ฉบับแก้ไข)');
  return get(user, doc.id);
}

async function remove(user, id, { password }) {
  const doc = await get(user, id);
  if (!doc.canDelete) throw new HttpError(403, 'ลบได้เฉพาะผู้จัดทำ ก่อนอนุมัติ (เอกสารที่อนุมัติแล้วลบได้เฉพาะผู้ดูแลระบบ)');
  await confirmPassword(user.id, password);
  const paths = (await db.query('SELECT signature_path FROM report_signatures WHERE doc_id = ? AND signature_path IS NOT NULL', [doc.id]))
    .map((r) => r.signature_path);
  await db.query('DELETE FROM report_docs WHERE id = ?', [doc.id]);
  for (const p of paths) await files.removeUpload(p).catch(() => {});
  return { ok: true };
}

// เมื่อผู้ดูแลกำหนดผู้ลงนาม: ใส่ตำแหน่งในโปรไฟล์ให้ (ถ้ายังว่าง) และให้ลำดับ 2–3 (รองฯ/ผอ.) มีบทบาทผู้บริหาร
async function syncSigners() {
  const s = await settings.getAll();
  for (const n of [1, 2, 3]) {
    const id = Number(s[`sign_step${n}_user`]);
    if (!id) continue;
    await db.query("UPDATE users SET position_title = ? WHERE id = ? AND (position_title IS NULL OR position_title = '')", [s[`sign_step${n}_title`] || '', id]);
    if (n >= 2) await db.query("UPDATE users SET role = 'executive' WHERE id = ? AND role = 'staff'", [id]);
  }
}

async function list(user) {
  const rows = await db.query(
    `SELECT r.id, r.kind, r.title, r.period_from, r.period_to, r.steps, r.current_step, r.status, r.is_demo, r.created_by,
            r.created_at, u.full_name AS created_by_name
       FROM report_docs r JOIN users u ON u.id = r.created_by ORDER BY r.id DESC LIMIT 200`,
  );
  const out = [];
  for (const r of rows) {
    const steps = typeof r.steps === 'string' ? JSON.parse(r.steps) : r.steps;
    const doc = { ...r, steps, is_demo: !!r.is_demo };
    if (!(await canView(user, doc))) continue;
    const current = r.status === 'pending' ? steps[r.current_step - 1] : null;
    // สิทธิ์จัดการแบบย่อสำหรับหน้ารายการ (ลายเซ็นรอบปัจจุบันตรวจจาก current_step / สถานะ)
    const rights = manageRights(user, doc, r.status === 'pending' && r.current_step > 1 ? [{ action: 'sign' }] : []);
    if (r.status === 'approved') rights.canEdit = false;
    out.push({ ...doc, waitingFor: current?.user_name || null, myTurn: !!current && current.user_id === user.id, ...rights });
  }
  return out;
}

async function pendingCount(user) {
  const rows = await db.query("SELECT steps, current_step FROM report_docs WHERE status = 'pending'");
  return rows.filter((r) => {
    const steps = typeof r.steps === 'string' ? JSON.parse(r.steps) : r.steps;
    return steps[r.current_step - 1]?.user_id === user.id;
  }).length;
}

// คำสั่งการของผู้อำนวยการ: ☐ ทราบ ☐ มอบ <ผู้รับมอบ>
function parseDecision(step, d) {
  if (!step.decision) return null;
  const ack = !!d?.ack;
  const assign = !!d?.assign;
  const assignTo = String(d?.assignTo || '').trim().slice(0, 150);
  if (!ack && !assign) throw new HttpError(400, 'เลือก "ทราบ" หรือ "มอบ" อย่างน้อย 1 ข้อ');
  if (assign && !assignTo) throw new HttpError(400, 'ระบุผู้รับมอบ');
  return { ack, assign, assignTo: assign ? assignTo : '' };
}

async function sign(user, id, { password, comment, signature, decision }, ip) {
  const doc = await get(user, id);
  if (!doc.canSign) throw new HttpError(403, 'ยังไม่ถึงลำดับลงนามของท่าน หรือเอกสารไม่อยู่ในสถานะรอลงนาม');
  const dec = parseDecision(doc.steps[doc.current_step - 1], decision);
  await confirmPassword(user.id, password);
  let sigPath;
  if (signature) {
    sigPath = await files.saveImage(signature, { dir: 'report-signatures', prefix: `doc-${doc.id}-s${doc.current_step}`, types: ['png'], maxBytes: 400_000 });
  } else {
    const [u] = await db.query('SELECT signature_path FROM users WHERE id = ?', [user.id]);
    if (!u?.signature_path) throw new HttpError(400, 'ยังไม่มีลายเซ็น — วาดลายเซ็นในช่อง หรือบันทึกลายเซ็นไว้ที่หน้าโปรไฟล์', 'NO_SIGNATURE');
    // คัดลอกไว้กับเอกสาร ถ้าเปลี่ยนลายเซ็นในโปรไฟล์ภายหลัง เอกสารที่ลงนามแล้วไม่เปลี่ยน
    sigPath = await files.copyUpload(u.signature_path, 'report-signatures', `doc-${doc.id}-s${doc.current_step}`);
  }
  await db.query(
    "INSERT INTO report_signatures (doc_id, step, action, signer_id, signature_path, comment, decision, ip, signed_at) VALUES (?, ?, 'sign', ?, ?, ?, ?, ?, ?)",
    [doc.id, doc.current_step, user.id, sigPath, String(comment || '').slice(0, 500), dec ? JSON.stringify(dec) : null, ip, clock.now()],
  );
  if (doc.current_step >= doc.steps.length) {
    await db.query("UPDATE report_docs SET status = 'approved' WHERE id = ?", [doc.id]);
    notify(doc.created_by, doc, 'เอกสารได้รับการอนุมัติแล้ว');
  } else {
    await db.query('UPDATE report_docs SET current_step = current_step + 1 WHERE id = ?', [doc.id]);
    notify(doc.steps[doc.current_step].user_id, doc, 'มีเอกสารรอท่านลงนาม');
  }
  return get(user, doc.id);
}

async function returnDoc(user, id, { password, comment }, ip) {
  const doc = await get(user, id);
  if (!doc.canSign) throw new HttpError(403, 'ยังไม่ถึงลำดับของท่าน');
  if (!String(comment || '').trim()) throw new HttpError(400, 'กรุณาระบุเหตุผลที่ส่งกลับแก้ไข');
  await confirmPassword(user.id, password);
  await db.query(
    "INSERT INTO report_signatures (doc_id, step, action, signer_id, comment, ip, signed_at) VALUES (?, ?, 'return', ?, ?, ?, ?)",
    [doc.id, doc.current_step, user.id, String(comment).slice(0, 500), ip, clock.now()],
  );
  await db.query("UPDATE report_docs SET status = 'returned' WHERE id = ?", [doc.id]);
  notify(doc.created_by, doc, 'เอกสารถูกส่งกลับแก้ไข');
  return get(user, doc.id);
}

async function signatureFile(user, id, sigId) {
  const doc = await get(user, id);
  const [s] = await db.query('SELECT signature_path FROM report_signatures WHERE id = ? AND doc_id = ?', [Number(sigId), doc.id]);
  const abs = files.resolveUpload(s?.signature_path);
  if (!abs) throw new HttpError(404, 'ไม่พบลายเซ็น');
  return abs;
}

module.exports = { officialReport, preview, create, update, remove, get, list, pendingCount, sign, returnDoc, signatureFile, canCreate, isSigner, syncSigners };
