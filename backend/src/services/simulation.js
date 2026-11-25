/**
 * ภาพจำลองการเข้าแถว (หน้าผู้ดูแลระบบ) — ทดลองกฎด้วยค่าระบบจริงแบบอ่านอย่างเดียว
 * ไม่เขียนฐานข้อมูล ไม่สร้างผู้ใช้ ไม่บันทึกการเช็กชื่อ: ใช้ geo.evaluate() และ attendance.decide() ตัวเดียวกับการเช็กชื่อจริง
 */
const settings = require('./settings');
const geo = require('./geo');
const { decide } = require('./attendance');
const { HttpError } = require('../middleware/auth');

const MODES = ['none', 'gps', 'gps_or_qr', 'qr_required'];
const MAX_POINTS = 400;
// ใช้เมื่อผู้ดูแลยังไม่กำหนดจุดเข้าแถว — ทดลองกฎได้ แต่หน้าเว็บแจ้งว่าเป็นจุดสมมติ
const FALLBACK_CENTER = { lat: 15.8, lng: 102.03 };
const M_PER_DEG_LAT = 111320;

function rulesOf(s) {
  return {
    openTime: s.open_time,
    closeTime: s.close_time,
    mode: s.check_mode,
    radius: s.geofence_radius_m,
    maxAccuracy: s.max_accuracy_m,
    qrInterval: s.qr_interval_s,
    configured: s.geofence_configured,
  };
}

async function rules() {
  return rulesOf(await settings.getAll());
}

const int = (v, lo, hi) => (Number.isInteger(+v) && +v >= lo && +v <= hi ? +v : null);

/**
 * body: { points: [{ dx, dy, accuracy, qr, gps }], overrides: { mode, radius, maxAccuracy } }
 *   dx, dy = เมตรจากจุดกลาง (ตะวันออก / เหนือ) · gps = false คือเครื่องไม่ส่งพิกัด
 * คืน { rules, assumedCenter, results: [{ geo, distance, status, method, flags, message, qrRequired }] }
 */
async function evaluate(body = {}) {
  const s = await settings.getAll();
  const o = body.overrides || {};
  const mode = MODES.includes(o.mode) ? o.mode : s.check_mode;
  const radius = o.radius === undefined ? s.geofence_radius_m : int(o.radius, 20, 2000);
  const maxAccuracy = o.maxAccuracy === undefined ? s.max_accuracy_m : int(o.maxAccuracy, 10, 1000);
  if (radius === null) throw new HttpError(400, 'รัศมีต้องอยู่ระหว่าง 20–2000 ม.');
  if (maxAccuracy === null) throw new HttpError(400, 'ความคลาดเคลื่อนต้องอยู่ระหว่าง 10–1000 ม.');
  const points = Array.isArray(body.points) ? body.points : [];
  if (points.length > MAX_POINTS) throw new HttpError(400, `ทดลองได้ครั้งละไม่เกิน ${MAX_POINTS} คน`);

  const assumedCenter = !s.geofence_configured;
  const center = assumedCenter ? FALLBACK_CENTER : { lat: Number(s.geofence_lat), lng: Number(s.geofence_lng) };
  const cfg = { ...s, geofence_configured: true, geofence_lat: center.lat, geofence_lng: center.lng, geofence_radius_m: radius, max_accuracy_m: maxAccuracy };
  const mPerDegLng = M_PER_DEG_LAT * Math.cos((center.lat * Math.PI) / 180);

  const results = points.map((p) => {
    const dx = Number(p?.dx);
    const dy = Number(p?.dy);
    const accuracy = Number(p?.accuracy);
    const hasGps = p?.gps !== false && Number.isFinite(dx) && Number.isFinite(dy);
    const loc = hasGps
      ? { lat: center.lat + dy / M_PER_DEG_LAT, lng: center.lng + dx / mPerDegLng, accuracy: Number.isFinite(accuracy) ? accuracy : NaN }
      : null;
    const g = geo.evaluate(loc, cfg);
    const d = decide(mode, g, p?.qr === true);
    return { geo: g.result, distance: g.distance, status: d.status, method: d.method, flags: d.flags, message: d.message, qrRequired: d.qrRequired };
  });
  return { rules: { ...rulesOf(s), mode, radius, maxAccuracy }, current: rulesOf(s), assumedCenter, results };
}

module.exports = { rules, evaluate, MAX_POINTS };
