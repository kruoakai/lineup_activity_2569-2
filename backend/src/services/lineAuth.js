const crypto = require('crypto');
const config = require('../config');
const { HttpError } = require('../middleware/auth');

// เข้าสู่ระบบด้วย LINE (LINE Login v2.1, OpenID Connect)
// ตั้งค่าใน deploy/.env: LINE_CHANNEL_ID, LINE_CHANNEL_SECRET (และ APP_URL)
// ครูต้อง "เชื่อมบัญชี LINE" จากหน้าโปรไฟล์ก่อน 1 ครั้ง จากนั้นกดเข้าสู่ระบบด้วย LINE ได้
// ระบบไม่สร้างบัญชีใหม่จาก LINE — บัญชีมาจากทะเบียนบุคลากรเท่านั้น

const AUTHORIZE = 'https://access.line.me/oauth2/v2.1/authorize';
const TOKEN = 'https://api.line.me/oauth2/v2.1/token';
const VERIFY = 'https://api.line.me/oauth2/v2.1/verify';
const STATE_COOKIE = 'lineup_ls';
const STATE_TTL_MS = 10 * 60 * 1000;

const channelId = () => process.env.LINE_CHANNEL_ID || '';
const channelSecret = () => process.env.LINE_CHANNEL_SECRET || '';
const enabled = () => Boolean(channelId() && channelSecret());
const appUrl = () => (process.env.APP_URL || `http://localhost:${config.port}`).replace(/\/$/, '');
const callbackUrl = () => `${appUrl()}/api/auth/line/callback`;

const b64 = (s) => Buffer.from(s).toString('base64url');
const sign = (s) => crypto.createHmac('sha256', config.jwtSecret).update(`line-state:${s}`).digest('base64url');

function sealState(payload) {
  const body = b64(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

function openState(raw) {
  const [body, mac] = String(raw || '').split('.');
  if (!body || !mac) return null;
  const expected = sign(body);
  if (mac.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return p.exp > Date.now() ? p : null;
  } catch {
    return null;
  }
}

// เริ่มขั้นตอน: คืน URL ไปหน้า LINE และค่าคุกกี้ state (ผูกกับเบราว์เซอร์นี้)
// mode = 'login' | 'link' (link ต้องมี userId ของผู้ที่เข้าระบบอยู่)
function start(mode, userId = null) {
  if (!enabled()) throw new HttpError(503, 'ยังไม่ได้เปิดการเข้าสู่ระบบด้วย LINE', 'LINE_DISABLED');
  const state = crypto.randomBytes(16).toString('base64url');
  const nonce = crypto.randomBytes(16).toString('base64url');
  const cookie = sealState({ state, nonce, mode, uid: userId, exp: Date.now() + STATE_TTL_MS });
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: channelId(),
    redirect_uri: callbackUrl(),
    state,
    scope: 'openid profile',
    nonce,
    ...(mode === 'login' ? {} : { prompt: 'consent' }),
  });
  return { url: `${AUTHORIZE}?${q}`, cookie };
}

function cookieOptions() {
  // Lax: คุกกี้ต้องถูกส่งตอน LINE redirect กลับมา (เป็น top-level navigation ข้ามเว็บ)
  return { httpOnly: true, secure: config.cookieSecure, sameSite: 'lax', path: '/api/auth/line', maxAge: STATE_TTL_MS };
}

// ตรวจผลจาก LINE: state ตรงกับคุกกี้ → แลก code เป็น id_token → ให้ LINE ยืนยัน id_token + nonce
async function finish({ code, state, cookie }) {
  const st = openState(cookie);
  if (!st || !state || st.state !== state) throw new HttpError(400, 'คำขอหมดอายุหรือไม่ถูกต้อง กรุณาลองใหม่', 'LINE_STATE');
  if (!code) throw new HttpError(400, 'ไม่ได้รับรหัสยืนยันจาก LINE', 'LINE_CODE');
  const tokenRes = await fetch(TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code', code, redirect_uri: callbackUrl(), client_id: channelId(), client_secret: channelSecret(),
    }),
  });
  if (!tokenRes.ok) throw new HttpError(502, 'LINE ปฏิเสธคำขอ กรุณาลองใหม่', 'LINE_TOKEN');
  const tok = await tokenRes.json();
  if (!tok.id_token) throw new HttpError(502, 'ไม่ได้รับข้อมูลยืนยันตัวตนจาก LINE', 'LINE_TOKEN');
  const verRes = await fetch(VERIFY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ id_token: tok.id_token, client_id: channelId(), nonce: st.nonce }),
  });
  if (!verRes.ok) throw new HttpError(401, 'ยืนยันตัวตนกับ LINE ไม่สำเร็จ', 'LINE_VERIFY');
  const claims = await verRes.json();
  if (!claims.sub || claims.aud !== channelId()) throw new HttpError(401, 'ยืนยันตัวตนกับ LINE ไม่สำเร็จ', 'LINE_VERIFY');
  return { mode: st.mode, uid: st.uid, lineUserId: String(claims.sub).slice(0, 64), lineName: String(claims.name || '').slice(0, 100) };
}

module.exports = { enabled, start, finish, cookieOptions, callbackUrl, STATE_COOKIE };
