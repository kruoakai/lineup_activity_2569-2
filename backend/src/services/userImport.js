/**
 * นำเข้า/ส่งออกรายชื่อผู้ใช้ — ใช้ร่วมกันระหว่างไฟล์ Excel (หน้าผู้ดูแล) และ API ภายนอก (/api/ext/v1)
 *
 * หลักการ
 * - จับคู่ผู้ใช้ด้วย "รหัสพนักงาน" — มีอยู่แล้ว = แก้ไข, ยังไม่มี = สร้างใหม่ (รหัสผ่านเริ่มต้น + บังคับเปลี่ยนเมื่อเข้าครั้งแรก)
 * - ช่องที่เว้นว่างในการแก้ไข = ไม่เปลี่ยนค่าเดิม (ยกเว้นชื่อ-สกุลที่ต้องมีเสมอ)
 * - ไม่เปลี่ยนรหัสผ่านของผู้ใช้เดิม และไม่ตั้ง/ถอดสิทธิ์ผู้ดูแลระบบผ่านการนำเข้า (ทำได้ที่หน้าจัดการผู้ใช้เท่านั้น)
 * - แผนก/งานที่ยังไม่มีในระบบจะถูกสร้างให้อัตโนมัติ
 * - ตรวจทั้งไฟล์ก่อน: ถ้ามีแถวผิด แถวอื่นยังนำเข้าได้ (แถวผิดจะถูกข้าม) และบันทึกทั้งหมดในธุรกรรมเดียว
 */
const ExcelJS = require('exceljs');
const bcrypt = require('bcryptjs');
const db = require('../db');
const passwords = require('./passwords');
const tokens = require('./tokens');
const { HttpError } = require('../middleware/auth');

const MAX_ROWS = 2000;

const ROLE_TH = { staff: 'บุคลากร', dept_head: 'หัวหน้าแผนก', activity: 'เจ้าหน้าที่งานกิจกรรม', hr: 'เจ้าหน้าที่บุคลากร', executive: 'ผู้บริหาร', admin: 'ผู้ดูแลระบบ' };
const IMPORT_ROLES = ['staff', 'dept_head', 'activity', 'hr', 'executive'];
const staffTypes = require('./staffTypes');
const YES = ['ใช่', 'ต้อง', 'y', 'yes', 'true', '1', 'ใช้งาน', 'active'];
const NO = ['ไม่', 'ไม่ใช่', 'ไม่ต้อง', 'n', 'no', 'false', '0', 'ระงับ', 'inactive'];

// คอลัมน์ในแม่แบบ (key ใช้ใน API ด้วย) — alias รองรับไฟล์ที่ส่งออกจากระบบสารบรรณฯ (GDCC e-Office)
const COLUMNS = [
  { key: 'employee_code', header: 'รหัสพนักงาน*', width: 16, aliases: ['รหัสพนักงาน', 'ชื่อผู้ใช้ (รหัสพนักงาน)', 'employee_code'] },
  { key: 'full_name', header: 'ชื่อ-สกุล*', width: 30, aliases: ['ชื่อ-สกุล', 'ชื่อ - สกุล', 'full_name'] },
  { key: 'email', header: 'อีเมล', width: 30, aliases: ['email'] },
  { key: 'division', header: 'ฝ่าย', width: 28, aliases: ['โครงสร้างระดับที่ 2', 'division'] },
  { key: 'department', header: 'แผนก/งาน*', width: 32, aliases: ['แผนก', 'งาน', 'โครงสร้างระดับที่ 3', 'department'] },
  { key: 'position_title', header: 'ตำแหน่ง', width: 22, aliases: ['position_title'] },
  { key: 'staff_type', header: 'ประเภทบุคลากร', width: 30, aliases: ['staff_type', 'ประเภท'] },
  { key: 'role', header: 'บทบาท', width: 22, aliases: ['role'] },
  { key: 'must_assemble', header: 'ต้องเข้าแถว', width: 13, aliases: ['must_assemble'] },
  { key: 'active', header: 'สถานะบัญชี', width: 13, aliases: ['สถานะ', 'active'] },
];

const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const norm = (h) => clean(h).replace(/\*/g, '').toLowerCase();

function cellText(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map((t) => t.text).join('');
    if (v.text !== undefined) return String(v.text);
    if (v.result !== undefined) return String(v.result);
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    return '';
  }
  return String(v);
}

function parseBool(v, field) {
  const s = clean(v).toLowerCase();
  if (s === '') return undefined;
  if (typeof v === 'boolean') return v;
  if (YES.includes(s)) return true;
  if (NO.includes(s)) return false;
  throw new Error(`${field}: ใช้ "ใช่" หรือ "ไม่"`);
}

function parseRole(v) {
  const s = clean(v);
  if (!s) return undefined;
  const found = Object.entries(ROLE_TH).find(([k, th]) => s === k || s === th);
  if (!found) throw new Error(`บทบาท "${s}" ไม่ถูกต้อง`);
  return found[0];
}

/** แปลงข้อมูลดิบ 1 แถว (จาก Excel หรือ JSON ของ API) เป็นค่าที่ตรวจแล้ว */
function normalizeRow(raw) {
  const r = {};
  const errors = [];
  r.employee_code = clean(raw.employee_code);
  if (typeof raw.employee_code === 'number') r.employee_code = String(raw.employee_code);
  if (!/^[A-Za-z0-9_-]{1,30}$/.test(r.employee_code)) errors.push('รหัสพนักงานต้องเป็นตัวอักษรอังกฤษ/ตัวเลข/-/_ ไม่เกิน 30 ตัว');
  r.full_name = clean(raw.full_name);
  if (!r.full_name) errors.push('ต้องมีชื่อ-สกุล');
  if (r.full_name.length > 190) errors.push('ชื่อ-สกุลยาวเกิน 190 ตัวอักษร');
  if (raw.email !== undefined) {
    const e = clean(raw.email).toLowerCase();
    if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) errors.push(`อีเมล "${e}" ไม่ถูกต้อง`);
    r.email = e || undefined;
  }
  for (const k of ['division', 'department', 'position_title']) {
    const v = clean(raw[k]).slice(0, 150);
    if (v) r[k] = v;
  }
  try { r.role = parseRole(raw.role); } catch (e) { errors.push(e.message); }
  const st = staffTypes.parse(raw.staff_type);
  if (st === null) errors.push(`ประเภทบุคลากร "${clean(raw.staff_type)}" ไม่ถูกต้อง (ดูชีต วิธีกรอก)`);
  else r.staff_type = st;
  try { r.must_assemble = parseBool(raw.must_assemble, 'ต้องเข้าแถว'); } catch (e) { errors.push(e.message); }
  try { r.active = parseBool(raw.active, 'สถานะบัญชี'); } catch (e) { errors.push(e.message); }
  if (r.division && !r.department) errors.push('ระบุฝ่ายแล้วต้องระบุแผนก/งานด้วย');
  return { row: r, errors };
}

/** อ่านไฟล์ Excel (แม่แบบของระบบ หรือไฟล์จากระบบสารบรรณฯ) → แถวดิบ */
async function parseWorkbook(buffer) {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch {
    throw new HttpError(400, 'อ่านไฟล์ไม่ได้ — ต้องเป็นไฟล์ Excel (.xlsx)');
  }
  for (const ws of wb.worksheets) {
    let headerRow = 0;
    let map = null;
    ws.eachRow((row, n) => {
      if (headerRow || n > 20) return;
      const values = (row.values || []).map((v) => norm(cellText(v)));
      const m = {};
      for (const c of COLUMNS) {
        const names = [c.header, ...c.aliases].map(norm);
        const idx = values.findIndex((v) => v && names.includes(v));
        if (idx > 0) m[c.key] = idx;
      }
      if (m.employee_code && m.full_name) { headerRow = n; map = m; }
    });
    if (!map) continue;
    const rows = [];
    ws.eachRow((row, n) => {
      if (n <= headerRow) return;
      const raw = { _line: n };
      let any = false;
      for (const [k, idx] of Object.entries(map)) {
        const v = row.values[idx];
        raw[k] = typeof v === 'number' ? v : cellText(v);
        if (clean(raw[k])) any = true;
      }
      if (any && !String(raw.employee_code).startsWith('ตัวอย่าง')) rows.push(raw);
    });
    if (rows.length > MAX_ROWS) throw new HttpError(400, `นำเข้าได้ครั้งละไม่เกิน ${MAX_ROWS} แถว`);
    return rows;
  }
  throw new HttpError(400, 'ไม่พบหัวตาราง — ต้องมีคอลัมน์ "รหัสพนักงาน" และ "ชื่อ-สกุล" (ดาวน์โหลดแม่แบบจากระบบ)');
}

async function loadState() {
  const users = await db.query(
    `SELECT u.id, u.employee_code, u.email, u.full_name, u.position_title, u.staff_type, u.role, u.must_assemble, u.active,
            d.name AS department, d.division
       FROM users u LEFT JOIN departments d ON d.id = u.department_id`);
  const depts = await db.query('SELECT id, name, division FROM departments');
  return { users, depts };
}

function findDept(depts, name, division) {
  if (division !== undefined) return depts.find((d) => d.name === name && d.division === division);
  const same = depts.filter((d) => d.name === name);
  return same.length === 1 ? same[0] : same.find((d) => d.division === '') || same[0];
}

/**
 * วางแผนการนำเข้า (ยังไม่บันทึก) — คืนผลรายแถว: create / update / same / error
 * options.deactivateMissing: ผู้ใช้ที่ไม่อยู่ในไฟล์ (ยกเว้นผู้ดูแลระบบ) จะถูกระงับบัญชี
 */
async function plan(rawRows, { actorId, deactivateMissing = false } = {}) {
  if (!Array.isArray(rawRows) || !rawRows.length) throw new HttpError(400, 'ไม่มีข้อมูลผู้ใช้');
  if (rawRows.length > MAX_ROWS) throw new HttpError(400, `นำเข้าได้ครั้งละไม่เกิน ${MAX_ROWS} แถว`);
  const { users, depts } = await loadState();
  const byCode = new Map(users.map((u) => [u.employee_code.toLowerCase(), u]));
  const byEmail = new Map(users.filter((u) => u.email).map((u) => [u.email.toLowerCase(), u]));
  const seenCodes = new Map();
  const seenEmails = new Map();
  const newDepts = new Map();
  const results = [];

  rawRows.forEach((raw, i) => {
    const line = raw._line || i + 1;
    const { row, errors } = normalizeRow(raw);
    const key = row.employee_code.toLowerCase();
    if (key && seenCodes.has(key)) errors.push(`รหัสพนักงานซ้ำกับแถว ${seenCodes.get(key)}`);
    else if (key) seenCodes.set(key, line);
    if (row.email) {
      if (seenEmails.has(row.email)) errors.push(`อีเมลซ้ำกับแถว ${seenEmails.get(row.email)}`);
      else seenEmails.set(row.email, line);
    }
    const existing = byCode.get(key);
    if (row.email) {
      const owner = byEmail.get(row.email);
      if (owner && (!existing || owner.id !== existing.id)) errors.push(`อีเมลนี้เป็นของ ${owner.full_name} (${owner.employee_code}) อยู่แล้ว`);
    }
    if (!existing && !row.department) errors.push('ผู้ใช้ใหม่ต้องระบุแผนก/งาน');
    if (row.role === 'admin' && existing?.role !== 'admin') errors.push('ตั้งสิทธิ์ผู้ดูแลระบบผ่านการนำเข้าไม่ได้ (ตั้งที่หน้าจัดการผู้ใช้)');
    if (existing && existing.role === 'admin') {
      if (row.role && row.role !== 'admin') errors.push('ไม่เปลี่ยนบทบาทของผู้ดูแลระบบผ่านการนำเข้า');
      if (row.active === false) errors.push('ไม่ระงับบัญชีผู้ดูแลระบบผ่านการนำเข้า');
    }
    if (existing && existing.id === actorId && row.active === false) errors.push('ไม่สามารถระงับบัญชีของตนเองได้');

    const base = { line, employee_code: row.employee_code, full_name: row.full_name || existing?.full_name || '' };
    if (errors.length) { results.push({ ...base, action: 'error', errors }); return; }

    // แผนก
    let deptKey = null;
    if (row.department) {
      const d = findDept(depts, row.department, row.division);
      if (d) deptKey = { id: d.id, name: d.name, division: d.division };
      else {
        const k = `${row.division || ''}|${row.department}`;
        if (!newDepts.has(k)) newDepts.set(k, { name: row.department, division: row.division || '' });
        deptKey = { id: null, name: row.department, division: row.division || '', isNew: true };
      }
    }

    const target = {
      full_name: row.full_name,
      email: row.email,
      position_title: row.position_title,
      staff_type: row.staff_type,
      role: row.role,
      must_assemble: row.must_assemble === undefined ? undefined : row.must_assemble ? 1 : 0,
      active: row.active === undefined ? undefined : row.active ? 1 : 0,
    };

    if (!existing) {
      results.push({
        ...base, action: 'create',
        data: { ...target, role: target.role || 'staff', must_assemble: target.must_assemble ?? 1, active: target.active ?? 1 },
        dept: deptKey,
      });
      return;
    }
    const changes = {};
    for (const [k, v] of Object.entries(target)) {
      if (v === undefined) continue;
      const cur = k === 'email' ? (existing.email || '').toLowerCase() : existing[k] ?? '';
      if (cur !== v) changes[k] = { from: existing[k] ?? '', to: v };
    }
    if (deptKey && (deptKey.isNew || existing.department !== deptKey.name || (row.division !== undefined && existing.division !== deptKey.division))) {
      changes.department = { from: existing.department || '', to: deptKey.name };
    }
    results.push({ ...base, id: existing.id, action: Object.keys(changes).length ? 'update' : 'same', changes, dept: changes.department ? deptKey : null });
  });

  const deactivate = [];
  if (deactivateMissing) {
    for (const u of users) {
      if (!u.active || u.role === 'admin' || u.id === actorId) continue;
      if (!seenCodes.has(u.employee_code.toLowerCase())) deactivate.push({ id: u.id, employee_code: u.employee_code, full_name: u.full_name });
    }
  }

  const count = (a) => results.filter((r) => r.action === a).length;
  return {
    summary: {
      rows: results.length, create: count('create'), update: count('update'), same: count('same'), error: count('error'),
      newDepartments: newDepts.size, deactivate: deactivate.length,
    },
    rows: results,
    newDepartments: [...newDepts.values()],
    deactivate,
  };
}

/** บันทึกตามแผน (ข้ามแถวที่ผิด) ในธุรกรรมเดียว */
async function apply(p) {
  const initial = passwords.initial();
  const hash = await bcrypt.hash(initial, 10);
  const deptIds = new Map();
  const revoke = [];
  try {
    await db.transaction(async (t) => {
      for (const d of p.newDepartments) {
        await t.query('INSERT IGNORE INTO departments (name, division) VALUES (?, ?)', [d.name, d.division]);
      }
      const deptId = async (dk) => {
        if (!dk) return undefined;
        if (dk.id) return dk.id;
        const k = `${dk.division}|${dk.name}`;
        if (!deptIds.has(k)) {
          const [row] = await t.query('SELECT id FROM departments WHERE name = ? AND division = ?', [dk.name, dk.division]);
          deptIds.set(k, row.id);
        }
        return deptIds.get(k);
      };
      for (const r of p.rows) {
        if (r.action === 'create') {
          const d = r.data;
          await t.query(
            `INSERT INTO users (employee_code, full_name, email, position_title, staff_type, department_id, role, must_assemble, active, password_hash, must_change_password)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
            [r.employee_code, d.full_name, d.email || null, d.position_title || '', d.staff_type || null, (await deptId(r.dept)) ?? null, d.role, d.must_assemble, d.active, hash]);
        } else if (r.action === 'update') {
          const set = {};
          for (const [k, c] of Object.entries(r.changes)) if (k !== 'department') set[k] = c.to;
          if (r.dept) set.department_id = await deptId(r.dept);
          if (set.staff_type !== undefined) set.staff_type_demo = 0;
          await t.query('UPDATE users SET ? WHERE id = ?', [set, r.id]);
          if (set.active === 0) revoke.push(r.id);
        }
      }
      for (const u of p.deactivate) {
        await t.query('UPDATE users SET active = 0 WHERE id = ?', [u.id]);
        revoke.push(u.id);
      }
    });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'ข้อมูลซ้ำกับผู้ใช้ในระบบ (รหัสพนักงานหรืออีเมล) — ตรวจไฟล์แล้วลองใหม่');
    throw e;
  }
  for (const id of revoke) await tokens.revokeAllForUser(id);
  return { ...p.summary, initialPassword: p.summary.create ? initial : undefined };
}

// ---------- Excel ----------

function styleHeader(ws, n) {
  const head = ws.getRow(1);
  head.height = 24;
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  head.alignment = { vertical: 'middle' };
  for (let c = 1; c <= n; c += 1) {
    head.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLUMNS[c - 1]?.header.endsWith('*') ? 'FF1D4E89' : 'FF4F7CB5' } };
  }
}

function addValidation(ws, deptNames) {
  const roleList = `"${IMPORT_ROLES.map((r) => ROLE_TH[r]).join(',')}"`;
  const col = (key) => String.fromCharCode(65 + COLUMNS.findIndex((c) => c.key === key));
  for (let r = 2; r <= MAX_ROWS + 1; r += 1) {
    ws.getCell(`${col('staff_type')}${r}`).dataValidation = { type: 'list', allowBlank: true, formulae: [`"${staffTypes.STAFF_TYPES.map((t) => t.short).join(',')}"`], showErrorMessage: false };
    ws.getCell(`${col('role')}${r}`).dataValidation = { type: 'list', allowBlank: true, formulae: [roleList], showErrorMessage: true, errorTitle: 'บทบาท', error: 'เลือกจากรายการ' };
    ws.getCell(`${col('must_assemble')}${r}`).dataValidation = { type: 'list', allowBlank: true, formulae: ['"ใช่,ไม่"'] };
    ws.getCell(`${col('active')}${r}`).dataValidation = { type: 'list', allowBlank: true, formulae: ['"ใช้งาน,ระงับ"'] };
    if (deptNames) ws.getCell(`${col('department')}${r}`).dataValidation = { type: 'list', allowBlank: true, formulae: [deptNames], showErrorMessage: false };
    ws.getCell(`${col('employee_code')}${r}`).numFmt = '@';
  }
}

function addGuide(wb, depts) {
  const g = wb.addWorksheet('วิธีกรอก');
  g.columns = [{ width: 22 }, { width: 90 }];
  const lines = [
    ['แม่แบบนำเข้ารายชื่อบุคลากร — ระบบเช็กชื่อเข้าแถว วิทยาลัยเทคนิคชัยภูมิ', ''],
    ['', ''],
    ['คอลัมน์', 'วิธีกรอก'],
    ['รหัสพนักงาน*', 'จำเป็น · ใช้เป็นชื่อผู้ใช้เข้าระบบ · ตัวอักษรอังกฤษ/ตัวเลข/-/_ · ถ้ามีในระบบแล้ว = แก้ไขข้อมูลคนนั้น'],
    ['ชื่อ-สกุล*', 'จำเป็น · เช่น นายสมชาย ใจดี'],
    ['อีเมล', 'ไม่บังคับ · ใช้รับลิงก์ตั้งรหัสผ่านใหม่ · ห้ามซ้ำกับคนอื่น'],
    ['ฝ่าย', 'ไม่บังคับ · เช่น ฝ่ายบริหารทรัพยากร'],
    ['แผนก/งาน*', 'จำเป็นสำหรับคนใหม่ · พิมพ์ตรงกับชีต "แผนกที่มีในระบบ" · ถ้าพิมพ์ชื่อใหม่ ระบบจะสร้างแผนกให้'],
    ['ตำแหน่ง', 'ไม่บังคับ · เช่น ครู, รองผู้อำนวยการ (แสดงในเอกสารลงนาม)'],
    ['ประเภทบุคลากร', `ใช้นับจำนวนในรายงานสรุปการปฏิบัติงานประจำวัน · เลือก: ${staffTypes.STAFF_TYPES.map((t) => t.short).join(' / ')} · เว้นว่าง = คงเดิม`],
    ['บทบาท', 'เลือก: บุคลากร / หัวหน้าแผนก / เจ้าหน้าที่งานกิจกรรม / เจ้าหน้าที่บุคลากร / ผู้บริหาร · เว้นว่าง = บุคลากร (คนใหม่) หรือคงเดิม (คนเดิม)'],
    ['ต้องเข้าแถว', 'ใช่ / ไม่ · เว้นว่าง = ใช่ (คนใหม่) หรือคงเดิม'],
    ['สถานะบัญชี', 'ใช้งาน / ระงับ · เว้นว่าง = ใช้งาน (คนใหม่) หรือคงเดิม'],
    ['', ''],
    ['หลักการ', ''],
    ['คนใหม่', `ได้รหัสผ่านเริ่มต้น ${process.env.INITIAL_PASSWORD ? '(ตามที่ผู้ดูแลแจ้ง)' : '12345678'} และต้องเปลี่ยนรหัสเมื่อเข้าระบบครั้งแรก`],
    ['คนเดิม', 'แก้ไขเฉพาะช่องที่กรอก · ช่องว่าง = ไม่เปลี่ยน · ไม่เปลี่ยนรหัสผ่าน'],
    ['ผู้ดูแลระบบ', 'ตั้งหรือถอดสิทธิ์ผู้ดูแลระบบผ่านไฟล์นี้ไม่ได้ (ทำที่หน้าจัดการผู้ใช้)'],
    ['ก่อนบันทึก', 'ระบบแสดงตัวอย่างผลให้ตรวจก่อนเสมอ แถวที่ผิดจะถูกข้ามและบอกเหตุผล'],
    ['แถวตัวอย่าง', 'แถวที่รหัสขึ้นต้นด้วย "ตัวอย่าง" จะถูกข้าม ลบทิ้งหรือพิมพ์ทับได้'],
  ];
  lines.forEach((l) => g.addRow(l));
  g.getRow(1).font = { bold: true, size: 14, color: { argb: 'FF1D4E89' } };
  g.getRow(3).font = { bold: true };
  g.getRow(14).font = { bold: true };
  g.getColumn(2).alignment = { wrapText: true, vertical: 'top' };

  const d = wb.addWorksheet('แผนกที่มีในระบบ');
  d.columns = [{ header: 'แผนก/งาน', key: 'name', width: 40 }, { header: 'ฝ่าย', key: 'division', width: 34 }];
  d.getRow(1).font = { bold: true };
  depts.forEach((x) => d.addRow(x));
}

async function departmentsList() {
  return db.query('SELECT name, division FROM departments ORDER BY division, name');
}

function deptValidation(depts) {
  return depts.length ? `'แผนกที่มีในระบบ'!$A$2:$A$${depts.length + 1}` : null;
}

async function templateWorkbook() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ระบบเช็กชื่อเข้าแถว';
  const ws = wb.addWorksheet('รายชื่อบุคลากร', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = COLUMNS.map((c) => ({ key: c.key, header: c.header, width: c.width }));
  styleHeader(ws, COLUMNS.length);
  const ex = ws.addRow({ employee_code: 'ตัวอย่าง001', full_name: 'นายสมชาย ใจดี', email: 'somchai@example.com', division: 'ฝ่ายวิชาการ', department: 'เทคโนโลยีสารสนเทศ', position_title: 'ครู', staff_type: 'ครูอัตราจ้าง', role: 'บุคลากร', must_assemble: 'ใช่', active: 'ใช้งาน' });
  ex.font = { italic: true, color: { argb: 'FF8A94A3' } };
  const depts = await departmentsList();
  addGuide(wb, depts);
  addValidation(ws, deptValidation(depts));
  return wb;
}

async function exportWorkbook() {
  const rows = await db.query(
    `SELECT u.employee_code, u.full_name, u.email, d.division, d.name AS department, u.position_title, u.staff_type, u.role,
            u.must_assemble, u.active, u.must_change_password, u.line_user_id IS NOT NULL AS has_line,
            (SELECT MAX(created_at) FROM refresh_tokens t WHERE t.user_id = u.id) AS last_login
       FROM users u LEFT JOIN departments d ON d.id = u.department_id
      ORDER BY d.division, d.name, u.full_name`);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ระบบเช็กชื่อเข้าแถว';
  const ws = wb.addWorksheet('รายชื่อบุคลากร', { views: [{ state: 'frozen', ySplit: 1 }] });
  const extra = [
    { key: 'password_state', header: 'สถานะรหัสผ่าน (อ่านอย่างเดียว)', width: 30 },
    { key: 'line', header: 'LINE (อ่านอย่างเดียว)', width: 18 },
    { key: 'last_login', header: 'เข้าระบบล่าสุด (อ่านอย่างเดียว)', width: 24 },
  ];
  ws.columns = [...COLUMNS.map((c) => ({ key: c.key, header: c.header, width: c.width })), ...extra];
  styleHeader(ws, COLUMNS.length);
  for (let c = COLUMNS.length + 1; c <= COLUMNS.length + extra.length; c += 1) {
    ws.getRow(1).getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF8A94A3' } };
  }
  for (const r of rows) {
    ws.addRow({
      employee_code: r.employee_code, full_name: r.full_name, email: r.email || '', division: r.division || '', department: r.department || '',
      position_title: r.position_title || '', staff_type: staffTypes.BY_CODE.get(r.staff_type)?.short || '', role: ROLE_TH[r.role], must_assemble: r.must_assemble ? 'ใช่' : 'ไม่', active: r.active ? 'ใช้งาน' : 'ระงับ',
      password_state: r.must_change_password ? 'ยังไม่เปลี่ยน (ต้องเปลี่ยนเมื่อเข้าครั้งแรก)' : 'เปลี่ยนแล้ว',
      line: r.has_line ? 'เชื่อมแล้ว' : '',
      last_login: r.last_login ? new Date(r.last_login).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : 'ยังไม่เคย',
    });
  }
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUMNS.length + extra.length } };
  const depts = await departmentsList();
  addGuide(wb, depts);
  addValidation(ws, deptValidation(depts));
  return { wb, count: rows.length };
}

/** ข้อมูลผู้ใช้สำหรับ API (ไม่มีข้อมูลรหัสผ่าน) */
function publicUser(u) {
  return {
    employee_code: u.employee_code, full_name: u.full_name, email: u.email || null,
    division: u.division || '', department: u.department || '', position_title: u.position_title || '', staff_type: u.staff_type || null,
    role: u.role, must_assemble: !!u.must_assemble, active: !!u.active, updated_at: u.updated_at,
  };
}

module.exports = { COLUMNS, ROLE_TH, MAX_ROWS, normalizeRow, parseWorkbook, plan, apply, templateWorkbook, exportWorkbook, publicUser };
