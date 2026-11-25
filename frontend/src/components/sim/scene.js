// ตัวช่วยภาพจำลอง: แปลงเวลาของวันจำลอง และคำนวณสถานะ/ตำแหน่งของบุคคลสมมติ ณ เวลาหนึ่ง จากไฟล์เหตุการณ์ (simulation/run.js)

// เวลาในไฟล์ = วินาทีนับจาก 07:00
export const toSec = (hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); return (h - 7) * 3600 + m * 60; };
export const clockText = (t, withSec = true) => {
  const s = Math.max(0, 7 * 3600 + Math.floor(t));
  const p = (n) => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}${withSec ? `:${p(s % 60)}` : ''}`;
};

export const MODE_LABELS = { none: 'กดปุ่มอย่างเดียว', gps: 'GPS อย่างเดียว', gps_or_qr: 'GPS หรือ QR', qr_required: 'ต้องสแกน QR ทุกครั้ง' };
export const GEO_LABELS = { in_zone: 'อยู่ในพื้นที่', out_of_zone: 'นอกพื้นที่', low_accuracy: 'GPS ไม่แม่นยำพอ', no_location: 'ไม่มีพิกัด', not_configured: 'ยังไม่กำหนดพื้นที่' };
export const AWAY_LABELS = { official: 'ไปราชการ', policy: 'งานนโยบาย', leave: 'ลา' };

// ระยะผ่านตามกฎ geo.evaluate(): รัศมี + min(ความคลาดเคลื่อน, รัศมี/2)
export const passLimit = (radius, accuracy) => radius + Math.min(accuracy, radius / 2);

const SUCCESS = new Set(['try_ok', 'approve', 'proxy_ok']);
const lerp = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
const clamp01 = (x) => Math.max(0, Math.min(1, x));

/** เตรียมข้อมูลเล่นซ้ำ: แยกเหตุการณ์ตามบุคคล + ธงอุปกรณ์ซ้ำให้ทั้งสองบัญชี */
export function prepare(data) {
  const per = data.agents.map(() => []);
  for (const e of data.events) {
    if (e.a >= 0) per[e.a].push(e);
    if (e.by !== undefined && e.flag) per[e.by].push({ t: e.t, a: e.by, k: 'flag', flag: e.flag, m: 'ถูกติดธง: อุปกรณ์เดียวกันใช้เช็กชื่อหลายบัญชี' });
  }
  for (const list of per) list.sort((x, y) => x.t - y.t);
  const agents = data.agents.map((a, i) => {
    const evs = per[i];
    const firstOk = evs.find((e) => SUCCESS.has(e.k));
    return { ...a, i, evs, moveT: a.edge ? (firstOk ? firstOk.t : Infinity) : null };
  });
  const open = toSec(data.rules.openTime);
  const close = toSec(data.rules.closeTime) + 59;
  const closeAt = data.params.closeEarly ? Math.min(close, toSec(data.params.closeEarly)) : close;
  const outage = data.params.outage ? data.params.outage.map(toSec) : null;
  return { ...data, agents, open, closeAt, manualClose: !!data.params.closeEarly, outage };
}

export function phaseAt(p, t) {
  if (p.params.dayStatus) return 'no_assembly';
  if (t < p.open) return 'before';
  if (t > p.closeAt || (p.manualClose && t >= p.closeAt)) return 'closed';
  return 'open';
}

/** สถานะของบุคคล ณ เวลา t → { vis, cls, st, method, flag, last, pos } */
export function agentAt(p, a, t, phase) {
  let st = null; let method = null; let flag = null; let last = null; let review = false; let net = false; let closed = false; let by = null;
  for (const e of a.evs) {
    if (e.t > t) break;
    last = e;
    if (e.st) st = e.st;
    if (e.method) method = e.method;
    if (e.by !== undefined && e.k === 'proxy_ok') by = e.by;
    if (e.flag) flag = e.flag;
    review = e.k === 'need_review';
    net = e.k === 'net_err';
    if (e.k === 'err_closed') closed = true;
  }
  if (a.away) return { vis: 'away', cls: a.away, st, last };
  if (a.noTry || a.spawn === undefined) return { vis: 'home', cls: 'home', st, last };
  if (t < a.spawn) return { vis: 'home', cls: 'home', st, last };
  const first = a.edge || a.spot;
  let pos;
  if (t < a.arrive) pos = lerp(a.from, first, clamp01((t - a.spawn) / Math.max(1, a.arrive - a.spawn)));
  else if (a.edge) pos = t < a.moveT ? a.edge : lerp(a.edge, a.spot, clamp01((t - a.moveT) / 40));
  else pos = a.spot;
  let cls;
  if (st === 'present') cls = by !== null || (method || '').startsWith('proxy') ? 'proxy' : 'ok';
  else if (st === 'pending') cls = 'pending';
  else if (t < a.arrive) cls = 'walk';
  else if (closed || phase === 'closed') cls = 'absent';
  else if (review) cls = 'warn';
  else if (net) cls = 'net';
  else cls = 'idle';
  return { vis: 'scene', cls, st, method, flag, last, pos, by };
}

const rate = (c) => { const d = c.expected - c.official - c.policy - c.leave; return d > 0 ? Math.round((c.present / d) * 1000) / 10 : null; };

/** ตัวเลขสด ณ เวลา t (สูตรอัตราเดียวกับ reports.rate()) */
export function countsAt(p, t, phase) {
  const c = { expected: p.agents.length, present: 0, pending: 0, waiting: 0, notArrived: 0, official: 0, policy: 0, leave: 0, unrecorded: 0, flagged: 0, absent: 0, review: 0 };
  for (const a of p.agents) {
    const s = agentAt(p, a, t, phase);
    if (s.flag) c.flagged += 1;
    if (a.away) {
      if (['official', 'policy', 'leave'].includes(s.st)) c[s.st] += 1;
      else c.unrecorded += 1; // ยังไม่ได้บันทึกสถานะ (ก่อนเจ้าหน้าที่บุคลากรบันทึก)
      continue;
    }
    if (s.st === 'present') c.present += 1;
    else if (s.st === 'pending') c.pending += 1;
    else if (phase === 'closed') c.absent += 1;
    else if (s.vis === 'home' || s.cls === 'walk') c.notArrived += 1;
    else { c.waiting += 1; if (s.cls === 'warn') c.review += 1; }
  }
  if (phase === 'closed') c.absent += c.unrecorded;
  c.rate = rate(c);
  return c;
}
