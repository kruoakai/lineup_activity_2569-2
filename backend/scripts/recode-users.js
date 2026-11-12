// เปลี่ยนรหัสผู้ใช้ (username สำหรับ login) ตามตารางเทียบรหัสบุคลากร
// ใช้:  node scripts/recode-users.js <mapping.json>            → ตรวจอย่างเดียว (ไม่แก้ฐานข้อมูล) พิมพ์รายงาน
//       node scripts/recode-users.js <mapping.json> --apply    → แก้จริงในทรานแซกชันเดียว
// mapping.json = [{ "no": 1, "old": "ผบ01", "username": "ad001", "name": "นางสาว…", "group": "ผู้บริหาร", "honorific": "ท่านผู้อำนวยการ" }, …]
// จับคู่ด้วยชื่อ-สกุล (ตัดคำนำหน้า) ตรงกันก่อน ไม่ตรงจึงใช้ชื่อที่คล้ายที่สุด (≥ 0.85 และไม่ซ้ำคนอื่น)
// ไฟล์ mapping มีข้อมูลบุคคล — ห้าม commit ลบทิ้งหลังใช้
const fs = require('fs');
const db = require('../src/db');

const TITLE = /^(นางสาว|นาง|นาย|ว่าที่ร้อยตรีหญิง|ว่าที่ร้อยตรี|ว่าที่ ร\.ต\.|ดร\.|น\.ส\.)\s*/;
const norm = (n) => String(n || '').trim().replace(TITLE, '').replace(/\s+/g, ' ').trim();

function similarity(a, b) {
  if (a === b) return 1;
  const m = a.length;
  const n = b.length;
  if (!m || !n) return 0;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i += 1) {
    const cur = [i];
    for (let j = 1; j <= n; j += 1) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return 1 - prev[n] / Math.max(m, n);
}

async function plan(mapping) {
  const users = await db.query('SELECT id, employee_code, full_name, role, active, honorific FROM users');
  const byName = new Map();
  for (const u of users) {
    const k = norm(u.full_name);
    byName.set(k, [...(byName.get(k) || []), u]);
  }
  const used = new Set();
  const matched = [];
  const notFound = [];
  const pending = [];
  for (const r of mapping) {
    const c = byName.get(norm(r.name)) || [];
    if (c.length === 1 && !used.has(c[0].id)) { matched.push({ r, u: c[0], how: 'ตรง', score: 1 }); used.add(c[0].id); } else pending.push(r);
  }
  for (const r of pending) {
    const k = norm(r.name);
    const scored = users.filter((u) => !used.has(u.id)).map((u) => ({ u, s: similarity(k, norm(u.full_name)) })).sort((a, b) => b.s - a.s);
    const [best, second] = scored;
    if (best && best.s >= 0.85 && (!second || best.s - second.s >= 0.05)) {
      matched.push({ r, u: best.u, how: 'คล้าย', score: best.s });
      used.add(best.u.id);
    } else notFound.push({ r, near: best && best.s >= 0.6 ? best : null });
  }
  const leftover = users.filter((u) => !used.has(u.id) && u.role !== 'admin');
  // รหัสใหม่ชนกับคนอื่นที่ไม่ได้อยู่ในรายการเปลี่ยน
  const targets = new Map(matched.map((m) => [String(m.r.username).toLowerCase(), m.u.id]));
  const clashes = users.filter((u) => targets.has(String(u.employee_code).toLowerCase()) && targets.get(String(u.employee_code).toLowerCase()) !== u.id && !used.has(u.id));
  return { users, matched, notFound, leftover, clashes };
}

function report(p) {
  const line = (...a) => console.log(a.join('\t'));
  console.log(`ผู้ใช้ในระบบ ${p.users.length} คน · ในไฟล์ ${p.matched.length + p.notFound.length} คน`);
  console.log(`จับคู่ได้ ${p.matched.length} (ชื่อตรง ${p.matched.filter((m) => m.how === 'ตรง').length} · ชื่อคล้าย ${p.matched.filter((m) => m.how === 'คล้าย').length})`);
  console.log('\n== ชื่อคล้าย (ตรวจว่าเป็นคนเดียวกัน) ==');
  for (const m of p.matched.filter((x) => x.how === 'คล้าย')) line(m.r.username, m.r.name, '⇔', m.u.employee_code, m.u.full_name, m.score.toFixed(2));
  console.log(`\n== ในไฟล์แต่ไม่มีบัญชีในระบบ ${p.notFound.length} คน ==`);
  for (const x of p.notFound) line(x.r.username, x.r.group, x.r.name, x.near ? `(ใกล้เคียง: ${x.near.u.full_name} ${x.near.s.toFixed(2)})` : '');
  console.log(`\n== มีบัญชีในระบบแต่ไม่อยู่ในไฟล์ ${p.leftover.length} คน (คงรหัสเดิม) ==`);
  for (const u of p.leftover) line(u.employee_code, u.full_name, u.role, u.active ? '' : '(ระงับ)');
  if (p.clashes.length) {
    console.log('\n== ⚠ รหัสใหม่ชนกับบัญชีอื่น ==');
    for (const u of p.clashes) line(u.employee_code, u.full_name);
  }
}

async function apply(p) {
  if (p.clashes.length) throw new Error('มีรหัสชนกัน — ยกเลิก ไม่แก้ไขใด ๆ');
  await db.transaction(async (t) => {
    // เปลี่ยนเป็นรหัสชั่วคราวก่อน กันชนกับรหัสใหม่ของคนอื่นระหว่างทาง
    for (const m of p.matched) await t.query('UPDATE users SET employee_code = ? WHERE id = ?', [`__tmp_${m.u.id}`, m.u.id]);
    for (const m of p.matched) {
      await t.query('UPDATE users SET employee_code = ? WHERE id = ?', [String(m.r.username).trim().toLowerCase(), m.u.id]);
      if (m.r.honorific) await t.query('UPDATE users SET honorific = ? WHERE id = ?', [String(m.r.honorific).trim().slice(0, 100), m.u.id]);
    }
  });
  console.log(`\n✓ เปลี่ยนรหัสแล้ว ${p.matched.length} คน (รหัสผ่านเดิมใช้ต่อได้)`);
}

async function main() {
  const [file, flag] = process.argv.slice(2);
  if (!file) throw new Error('ระบุไฟล์ mapping.json');
  const mapping = JSON.parse(fs.readFileSync(file, 'utf8'));
  const p = await plan(mapping);
  report(p);
  if (flag === '--apply') await apply(p);
  else console.log('\n(ตรวจอย่างเดียว — ยังไม่แก้ไขฐานข้อมูล ใส่ --apply เพื่อเปลี่ยนจริง)');
}

module.exports = { plan, apply, norm, similarity };

if (require.main === module) {
  main().then(() => db.close()).catch((e) => { console.error(e.message); process.exit(1); });
}
