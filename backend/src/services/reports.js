const db = require('../db');
const clock = require('../clock');
const schedule = require('./schedule');
const { HttpError } = require('../middleware/auth');

const EXCUSED = new Set(['official', 'policy', 'leave']);

// อัตราเข้าแถว = มาเข้าแถว ÷ (วันที่ต้องเข้าแถว − ไปราชการ − ติดงานนโยบาย − ลา)
function rate(c) {
  const denom = c.expected - c.official - c.policy - c.leave;
  return denom > 0 ? Math.round((c.present / denom) * 1000) / 10 : null;
}

function emptyCounts() {
  return { expected: 0, present: 0, absent: 0, official: 0, policy: 0, leave: 0, pending: 0, not_checked: 0 };
}

async function scopedUsers(scope, departmentId) {
  const where = ['u.active = 1', 'u.must_assemble = 1'];
  const params = [];
  if (!scope.all) { where.push('u.department_id = ?'); params.push(scope.departmentId); }
  else if (departmentId) { where.push('u.department_id = ?'); params.push(departmentId); }
  return db.query(
    `SELECT u.id, u.employee_code, u.full_name, u.department_id, COALESCE(d.name, 'ไม่ระบุแผนก') AS department_name,
            COALESCE(d.division, '') AS division,
            COALESCE(NULLIF(u.report_group, ''), NULLIF(d.report_group, ''), COALESCE(d.name, 'ไม่ระบุแผนก')) AS unit_name,
            CASE WHEN NULLIF(u.report_group, '') IS NULL THEN COALESCE(d.report_order, 999) ELSE 998 END AS unit_order
       FROM users u LEFT JOIN departments d ON d.id = u.department_id
      WHERE ${where.join(' AND ')} ORDER BY d.name, u.full_name`,
    params,
  );
}

/**
 * สรุปช่วงวันที่ (รายวัน = from = to)
 * คนที่ไม่มีบันทึกในวันที่ปิดการเช็กชื่อแล้ว นับเป็น "ขาด"
 */
async function summary({ from, to, scope, departmentId }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
    throw new HttpError(400, 'ช่วงวันที่ไม่ถูกต้อง');
  }
  const state = await schedule.windowState();
  const today = state.day;
  const effTo = to > today ? today : to;
  const days = from <= effTo ? await schedule.assemblyDaysBetween(from, effTo) : [];
  if (days.length > 400) throw new HttpError(400, 'ช่วงวันที่ยาวเกินไป (สูงสุดประมาณ 1 ปีการศึกษา)');
  const closed = (d) => d < today || (d === today && state.phase === 'closed');

  const users = await scopedUsers(scope, departmentId);
  const ids = users.map((u) => u.id);
  const rows = ids.length && days.length
    ? await db.query(
      'SELECT user_id, day, status, method, flagged FROM attendance WHERE day IN (?) AND user_id IN (?)',
      [days, ids],
    )
    : [];
  const byKey = new Map(rows.map((r) => [`${r.user_id}|${r.day}`, r]));

  const total = emptyCounts();
  const perDept = new Map();
  const perUnit = new Map();
  const perDay = new Map(days.map((d) => [d, emptyCounts()]));
  const perUser = [];
  let proxyCount = 0;
  let flaggedCount = 0;

  for (const u of users) {
    const uc = emptyCounts();
    if (!perDept.has(u.department_id)) {
      perDept.set(u.department_id, { department_id: u.department_id, department_name: u.department_name, division: u.division, members: 0, ...emptyCounts() });
    }
    const dc = perDept.get(u.department_id);
    dc.members += 1;
    if (!perUnit.has(u.unit_name)) perUnit.set(u.unit_name, { unit_name: u.unit_name, unit_order: Number(u.unit_order), members: 0, ...emptyCounts() });
    const gc = perUnit.get(u.unit_name);
    gc.members += 1;
    for (const d of days) {
      const r = byKey.get(`${u.id}|${d}`);
      let st = r ? r.status : closed(d) ? 'absent' : 'not_checked';
      if (r && ['proxy_dept', 'proxy_peer', 'proxy_activity', 'admin'].includes(r.method)) proxyCount += 1;
      if (r && r.flagged) flaggedCount += 1;
      for (const c of [uc, dc, gc, total, perDay.get(d)]) { c.expected += 1; c[st] += 1; }
    }
    perUser.push({ user_id: u.id, employee_code: u.employee_code, full_name: u.full_name, department_name: u.department_name, unit_name: u.unit_name, ...uc, rate: rate(uc) });
  }

  const departments = [...perDept.values()].map((d) => ({ ...d, rate: rate(d) }))
    .sort((a, b) => a.department_name.localeCompare(b.department_name, 'th'));
  return {
    from, to, days: days.length, today, phase: state.phase,
    total: { ...total, rate: rate(total), members: users.length, proxy: proxyCount, flagged: flaggedCount },
    departments,
    units: [...perUnit.values()].map((g) => ({ ...g, rate: rate(g) }))
      .sort((a, b) => a.unit_order - b.unit_order || a.unit_name.localeCompare(b.unit_name, 'th')),
    trend: [...perDay.entries()].map(([day, c]) => ({ day, ...c, rate: rate(c) })),
    users: perUser,
  };
}

// แปลงเป็น CSV (มี BOM ให้ Excel อ่านภาษาไทยได้)
function toCsv(rep) {
  const head = ['รหัส', 'ชื่อ-สกุล', 'แผนก', 'วันที่ต้องเข้าแถว', 'มาเข้าแถว', 'ขาด', 'ไปราชการ', 'ติดงานนโยบาย', 'ลา', 'รอตรวจสอบ', 'ยังไม่เช็ก', 'อัตราเข้าแถว (%)'];
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    // กัน CSV/formula injection
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const lines = [head.map(esc).join(',')];
  for (const u of rep.users) {
    lines.push([u.employee_code, u.full_name, u.department_name, u.expected, u.present, u.absent, u.official,
      u.policy, u.leave, u.pending, u.not_checked, u.rate ?? ''].map(esc).join(','));
  }
  return `﻿${lines.join('\r\n')}\r\n`;
}

module.exports = { summary, toCsv, rate };
