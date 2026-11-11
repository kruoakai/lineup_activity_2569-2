// น้องแถวดี — ผู้ช่วยตอบคำถามการใช้งานเว็บแอป (เรียกโมเดล Claude ผ่าน OpenRouter)
// คีย์: ผู้ดูแลวางที่หน้า "ตั้งค่าระบบ → น้องแถวดี" (เข้ารหัส AES-256-GCM ก่อนเก็บในตาราง settings)
//       หรือ environment OPENROUTER_API_KEY (มีผลเหนือกว่า) · โมเดล: หน้าตั้งค่า หรือ OPENROUTER_MODEL
// ส่งให้โมเดลเฉพาะ: คำถาม, ประวัติแชตล่าสุดของผู้ถาม, บทบาท และสถานะช่วงเวลาเช็กชื่อ/ผลของตนเองวันนี้ — ไม่ส่งข้อมูลของคนอื่น
const crypto = require('crypto');
const fs = require('fs');
const db = require('../db');
const config = require('../config');
const { confirmPassword } = require('./confirm');
const path = require('path');
const schedule = require('./schedule');
const attendance = require('./attendance');
const { HttpError } = require('../middleware/auth');

const KNOWLEDGE = fs.readFileSync(path.join(__dirname, '..', 'assistant', 'knowledge.md'), 'utf8');
const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'anthropic/claude-opus-5.5';
const MAX_TURNS = 10; // ข้อความย้อนหลังสูงสุดที่ส่งไป
const MAX_CHARS = 800; // ต่อข้อความ
const LIMIT = { perHour: 40, perDay: 120 };

const ROLE_TH = {
  staff: 'ครูและบุคลากร', dept_head: 'หัวหน้าแผนก', activity: 'เจ้าหน้าที่งานกิจกรรม', hr: 'เจ้าหน้าที่บุคลากร',
  executive: 'ผู้บริหาร / ผู้ลงนาม', admin: 'ผู้ดูแลระบบ',
};
const PHASE_TH = { before: 'ยังไม่เปิดเช็กชื่อ', open: 'กำลังเปิดเช็กชื่อ', closed: 'ปิดการเช็กชื่อแล้ว', no_assembly: 'วันนี้ไม่มีการเข้าแถว' };

const SYSTEM = `คุณคือ "น้องแถวดี" ผู้ช่วยสาวน่ารักของงานบุคลากร ประจำระบบเช็กชื่อเข้าแถว วิทยาลัยเทคนิคชัยภูมิ
หน้าที่: ตอบคำถามวิธีใช้งานเว็บแอปนี้ให้บุคลากรเข้าใจง่าย อ้างอิงเฉพาะความรู้ด้านล่าง

วิธีตอบ
- ภาษาไทย สุภาพ เป็นกันเอง ใช้ "ค่ะ" แทนตัวเองว่า "น้องแถวดี" หรือ "หนู" เรียกผู้ใช้ว่า "คุณครู" หรือ "ท่าน"
- สั้น ชัด ตรงคำถาม ส่วนใหญ่ไม่เกิน 5 บรรทัด ถ้าเป็นขั้นตอนให้เขียนเป็นข้อ 1. 2. 3. ระบุชื่อเมนูและปุ่มตามที่ปรากฏในแอป ใช้ **ตัวหนา** กับชื่อปุ่มได้
- ตอบให้เหมาะกับบทบาทของผู้ถาม ถ้าเรื่องนั้นบทบาทนี้ทำเองไม่ได้ ให้บอกว่าต้องติดต่อใคร
- ไม่รู้หรือไม่มีในความรู้ ให้บอกตรง ๆ ว่าไม่แน่ใจ และแนะนำผู้ที่ควรติดต่อ ห้ามเดาเมนูหรือปุ่มที่ไม่มีอยู่จริง
- ไม่ขอและไม่รับรหัสผ่าน ถ้าผู้ใช้พิมพ์รหัสผ่านมา ให้เตือนให้เปลี่ยนรหัสทันที
- ไม่แก้ไขหรือบันทึกข้อมูลแทนผู้ใช้ (ทำไม่ได้) บอกวิธีให้ผู้ใช้ทำเอง
- เรื่องนอกระบบเช็กชื่อเข้าแถว ตอบสั้น ๆ อย่างสุภาพว่าช่วยได้เฉพาะเรื่องการใช้งานระบบนี้
- คำตอบจะถูกอ่านออกเสียงด้วย หลีกเลี่ยงตาราง สัญลักษณ์ยาว ๆ และลิงก์ยาว

ความรู้ของระบบ
${KNOWLEDGE}`;

const MODELS = [
  { id: 'anthropic/claude-opus-5.5', label: 'Claude Opus 5.5 — ตอบละเอียดที่สุด (แนะนำ)' },
  { id: 'anthropic/claude-sonnet-5.5', label: 'Claude Sonnet 5.5 — สมดุล ถูกกว่าครึ่งหนึ่ง' },
  { id: 'anthropic/claude-haiku-5.5', label: 'Claude Haiku 5.5 — ประหยัดที่สุด ตอบเร็ว' },
];
const MODEL_RE = /^[\w.-]+\/[\w.:-]+$/;

// ---------- เก็บคีย์แบบเข้ารหัส ----------
const cipherKey = () => crypto.createHash('sha256').update(`${config.jwtSecret}:assistant-key`).digest();
function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', cipherKey(), iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), enc.toString('base64')].join(':');
}
function decrypt(stored) {
  try {
    const [v, iv, tag, enc] = String(stored || '').split(':');
    if (v !== 'v1') return '';
    const d = crypto.createDecipheriv('aes-256-gcm', cipherKey(), Buffer.from(iv, 'base64'));
    d.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([d.update(Buffer.from(enc, 'base64')), d.final()]).toString('utf8');
  } catch { return ''; } // เปลี่ยน JWT_SECRET แล้ว → ต้องวางคีย์ใหม่
}

let cfgCache = null;
let cfgAt = 0;
async function loadConfig() {
  if (cfgCache && Date.now() - cfgAt < 10_000) return cfgCache;
  const rows = await db.query("SELECT k, v FROM settings WHERE k IN ('assistant_key_enc', 'assistant_key_last4', 'assistant_model', 'assistant_enabled')");
  const s = Object.fromEntries(rows.map((r) => [r.k, r.v]));
  const envKey = process.env.OPENROUTER_API_KEY || '';
  const savedKey = s.assistant_key_enc ? decrypt(s.assistant_key_enc) : '';
  cfgCache = {
    key: envKey || savedKey,
    source: envKey ? 'env' : savedKey ? 'settings' : '',
    last4: envKey ? envKey.slice(-4) : savedKey ? (s.assistant_key_last4 || savedKey.slice(-4)) : '',
    broken: Boolean(s.assistant_key_enc && !savedKey && !envKey),
    model: s.assistant_model || process.env.OPENROUTER_MODEL || DEFAULT_MODEL,
    switchedOn: s.assistant_enabled !== '0',
  };
  cfgAt = Date.now();
  return cfgCache;
}
function invalidate() { cfgCache = null; }

async function enabled() {
  const c = await loadConfig();
  return Boolean(c.key && c.switchedOn);
}

// จำกัดจำนวนคำถามต่อคน (ในหน่วยความจำ) กันค่าใช้จ่ายบานปลาย
const usage = new Map();
function checkQuota(userId, now = Date.now()) {
  const u = usage.get(userId) || [];
  const recent = u.filter((t) => now - t < 86400_000);
  const lastHour = recent.filter((t) => now - t < 3600_000).length;
  if (lastHour >= LIMIT.perHour || recent.length >= LIMIT.perDay) {
    throw new HttpError(429, 'วันนี้ถามน้องแถวดีครบจำนวนแล้วค่ะ ลองใหม่ภายหลัง หรือเปิดคู่มือในเมนู ☰ เพิ่มเติม', 'ASSISTANT_QUOTA');
  }
  recent.push(now);
  usage.set(userId, recent);
}
function resetQuota() { usage.clear(); }

function cleanMessages(messages) {
  if (!Array.isArray(messages) || !messages.length) throw new HttpError(400, 'ไม่มีคำถาม');
  const out = messages
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m) => ({ role: m.role, content: m.content.trim().slice(0, MAX_CHARS) }))
    .filter((m) => m.content)
    .slice(-MAX_TURNS);
  while (out.length && out[0].role !== 'user') out.shift();
  if (!out.length || out[out.length - 1].role !== 'user') throw new HttpError(400, 'ไม่มีคำถาม');
  return out;
}

// บริบทของผู้ถาม ณ ตอนนี้ (เฉพาะของตนเอง)
async function contextFor(user) {
  const win = await schedule.windowState();
  const rec = await attendance.findRecord(user.id, win.day).catch(() => null);
  const status = rec ? `${attendance.STATUS_LABELS[rec.status] || rec.status}` : 'ยังไม่มีบันทึก';
  return [
    `ผู้ถาม: บทบาท ${ROLE_TH[user.role] || user.role}${user.can_proxy ? ' (ตัวแทนเช็กชื่อแผนก)' : ''}${user.must_assemble === false || user.must_assemble === 0 ? ' · ไม่อยู่ในเกณฑ์ต้องเข้าแถว' : ''}`,
    `วันนี้ ${win.day} เวลา ${win.serverTime} น. · ${PHASE_TH[win.phase] || win.phase} (ช่วงเช็กชื่อ ${String(win.openTime).slice(0, 5)}–${String(win.closeTime).slice(0, 5)} น.)${win.dayNote ? ` · ${win.dayNote}` : ''}`,
    `ผลการเข้าแถววันนี้ของผู้ถาม: ${status}`,
  ].join('\n');
}

async function callOpenRouter(key, body) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': (process.env.APP_URL || 'https://lineup.ccollege.ac.th').replace(/\/+$/, ''),
      'X-Title': 'Lineup Assistant',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function chat(user, { messages }, { force = false } = {}) {
  const c = await loadConfig();
  if (!c.key || (!c.switchedOn && !force)) throw new HttpError(503, 'น้องแถวดียังไม่พร้อมใช้งาน — ผู้ดูแลระบบยังไม่ได้ตั้งค่า', 'ASSISTANT_OFF');
  const msgs = cleanMessages(messages);
  if (!force) checkQuota(user.id);
  const ctx = await contextFor(user);
  const body = {
    model: c.model,
    max_tokens: 1200,
    reasoning: { effort: 'low' }, // ตอบเร็ว คำถามการใช้งานไม่ต้องคิดลึก
    messages: [{ role: 'system', content: SYSTEM }, { role: 'system', content: ctx }, ...msgs],
  };
  let r;
  try {
    r = await callOpenRouter(c.key, body);
    // บางโมเดลไม่รองรับ reasoning → ลองใหม่โดยไม่ส่ง
    if (!r.ok && r.status === 400) {
      delete body.reasoning;
      r = await callOpenRouter(c.key, body);
    }
  } catch (e) {
    console.error('assistant fetch failed', e.message);
    throw new HttpError(502, 'ติดต่อผู้ให้บริการ AI ไม่ได้ ลองใหม่อีกครั้งค่ะ');
  }
  if (!r.ok) {
    console.error('assistant upstream', r.status, JSON.stringify(r.data).slice(0, 300));
    if (r.status === 401 || r.status === 403) throw new HttpError(503, 'คีย์ของผู้ให้บริการ AI ใช้ไม่ได้ — แจ้งผู้ดูแลระบบ', 'ASSISTANT_KEY');
    if (r.status === 402) throw new HttpError(503, 'เครดิตผู้ให้บริการ AI หมด — แจ้งผู้ดูแลระบบ', 'ASSISTANT_CREDIT');
    if (r.status === 429) throw new HttpError(429, 'มีคนถามพร้อมกันเยอะ รอสักครู่แล้วลองใหม่ค่ะ');
    throw new HttpError(502, 'ผู้ให้บริการ AI ตอบผิดพลาด ลองใหม่อีกครั้งค่ะ');
  }
  const choice = r.data.choices?.[0];
  const text = String(choice?.message?.content || '').trim();
  if (!text) throw new HttpError(502, 'น้องแถวดีตอบไม่ได้ในตอนนี้ ลองถามใหม่อีกครั้งค่ะ');
  return { reply: text, model: r.data.model || c.model };
}

async function status() {
  return { enabled: await enabled(), name: 'น้องแถวดี' };
}

// ---------- หน้าตั้งค่าของผู้ดูแลระบบ (ไม่ส่งคีย์เต็มกลับไปเด็ดขาด) ----------
async function adminView() {
  const c = await loadConfig();
  return {
    enabled: Boolean(c.key && c.switchedOn), switchedOn: c.switchedOn, hasKey: Boolean(c.key), last4: c.last4,
    source: c.source, broken: c.broken, model: c.model, models: MODELS,
  };
}

async function adminSave(user, { password, key, clearKey, model: m, switchedOn }) {
  await confirmPassword(user.id, password);
  const set = async (k, v) => db.query('INSERT INTO settings (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)', [k, v]);
  if (clearKey) {
    await db.query("DELETE FROM settings WHERE k IN ('assistant_key_enc', 'assistant_key_last4')");
  } else if (key !== undefined && String(key).trim()) {
    const k = String(key).trim();
    if (!/^sk-or-[\w-]{20,200}$/.test(k)) throw new HttpError(400, 'คีย์ไม่ถูกต้อง — คีย์ OpenRouter ขึ้นต้นด้วย sk-or-');
    await set('assistant_key_enc', encrypt(k));
    await set('assistant_key_last4', k.slice(-4));
  }
  if (m !== undefined) {
    if (!MODEL_RE.test(String(m))) throw new HttpError(400, 'ชื่อโมเดลไม่ถูกต้อง');
    await set('assistant_model', String(m));
  }
  if (switchedOn !== undefined) await set('assistant_enabled', switchedOn ? '1' : '0');
  invalidate();
  return adminView();
}

// ทดสอบจากหน้าตั้งค่า: ถาม 1 ข้อ (ไม่นับโควตา ใช้ได้แม้ปิดผู้ช่วยไว้)
async function adminTest(user) {
  const t0 = Date.now();
  const r = await chat(user, { messages: [{ role: 'user', content: 'สวัสดีค่ะ แนะนำตัวสั้น ๆ 1 ประโยค' }] }, { force: true });
  return { ok: true, reply: r.reply, model: r.model, ms: Date.now() - t0 };
}

module.exports = { chat, status, enabled, resetQuota, invalidate, adminView, adminSave, adminTest, SYSTEM };
