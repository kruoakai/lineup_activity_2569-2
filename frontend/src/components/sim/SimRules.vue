<template>
  <!-- ทดลองกฎด้วยค่าระบบจริง: เซิร์ฟเวอร์ใช้ geo.evaluate() + attendance.decide() ตัวเดียวกับการเช็กชื่อจริง แบบอ่านอย่างเดียว -->
  <div class="rules">
    <div v-if="error" class="alert bad">{{ error }}</div>
    <section v-if="cur" class="card stack">
      <h3>ค่าที่ใช้ทดลอง</h3>
      <p class="small muted">ค่าที่ตั้งไว้จริงตอนนี้: {{ MODE_LABELS[cur.mode] }} · รัศมี {{ cur.radius }} ม. · ยอมรับ GPS ±{{ cur.maxAccuracy }} ม. · เปิด {{ cur.openTime }}–{{ cur.closeTime }} น.
        — การเปลี่ยนค่าในหน้านี้<b>ไม่บันทึก</b>ลงระบบ (ตั้งค่าจริงที่หน้า "ตั้งค่าระบบ")</p>
      <div v-if="assumed" class="alert warn small">ยังไม่ได้กำหนดจุดเข้าแถวจริง — ใช้จุดสมมติเพื่อทดลองกฎ (ตอนนี้ระบบจริงจะส่งทุกการเช็กชื่อด้วย GPS ให้เจ้าหน้าที่ตรวจสอบ)</div>
      <div class="ctl">
        <label class="field"><span>วิธีเช็กชื่อ</span>
          <select v-model="mode"><option v-for="(l, k) in MODE_LABELS" :key="k" :value="k">{{ l }}</option></select></label>
        <label class="field"><span>รัศมีพื้นที่เข้าแถว: <b>{{ radius }} ม.</b></span><input v-model.number="radius" type="range" min="20" max="400" step="5" /></label>
        <label class="field"><span>ยอมรับความคลาดเคลื่อน GPS ไม่เกิน: <b>±{{ maxAccuracy }} ม.</b></span><input v-model.number="maxAccuracy" type="range" min="10" max="300" step="5" /></label>
      </div>
      <button type="button" class="btn sm" :disabled="same" @click="reset">ใช้ค่าที่ตั้งไว้จริง</button>
    </section>

    <div class="grid">
      <section class="card scene-card">
        <p class="small muted hint">ลากคนสมมติไปตำแหน่งต่าง ๆ แล้วดูผลทันที · วงประ = ระยะที่ยังผ่านได้เมื่อ GPS คลาดเคลื่อน</p>
        <svg ref="svg" class="scene" :viewBox="viewBox" role="img" aria-label="ผังทดลองกฎพื้นที่เข้าแถว" @pointermove="onMove" @pointerup="drag = null" @pointerleave="drag = null">
          <rect :x="-span" :y="-span" :width="span * 2" :height="span * 2" class="ground" />
          <circle cx="0" cy="0" :r="radius + radius / 2" class="tol" />
          <circle cx="0" cy="0" :r="radius" class="zone" />
          <line x1="0" y1="0" x2="0" y2="-16" class="pole" /><path d="M0 -16 l11 4 -11 4z" class="flagp" />
          <text x="0" :y="-radius - 6" class="lbl" text-anchor="middle">รัศมี {{ radius }} ม.</text>
          <g v-if="crowd">
            <circle v-for="(q, k) in crowd.points" :key="`c${k}`" :cx="q.dx" :cy="-q.dy" r="2.4" class="cd" :class="crowd.res[k] ? resCls(crowd.res[k]) : ''" />
          </g>
          <g v-for="(m, k) in people" :key="k" class="person" :class="m.res ? resCls(m.res) : ''" :transform="`translate(${m.dx} ${-m.dy})`"
             @pointerdown.prevent="startDrag($event, k)">
            <circle v-if="m.gps" :r="Math.min(m.accuracy, span)" class="acc" />
            <circle r="9" class="body" />
            <text y="3.5" text-anchor="middle" class="num">{{ k + 1 }}</text>
          </g>
        </svg>
      </section>

      <aside class="side">
        <section class="card">
          <h3>ผลของคนสมมติ</h3>
          <ul class="plist">
            <li v-for="(m, k) in people" :key="k">
              <div class="row top"><span class="badge num">{{ k + 1 }}</span><b class="grow">{{ m.label }}</b>
                <span class="res" :class="m.res ? resCls(m.res) : ''">{{ m.res ? resText(m.res) : '…' }}</span></div>
              <div v-if="m.res && m.res.message" class="small muted">{{ m.res.message }}</div>
              <div v-if="m.res && m.res.status && m.res.flags.length" class="small warnt">ติดธง: {{ m.res.flags.join(' · ') }}</div>
              <div class="small muted">ห่างจุดเข้าแถว {{ Math.round(Math.hypot(m.dx, m.dy)) }} ม.{{ m.gps ? ` · GPS ±${m.accuracy} ม. (ผ่านได้ถึง ${Math.round(passLimit(radius, m.accuracy))} ม.)` : ' · ไม่ส่งพิกัด' }}</div>
              <div class="row opts small">
                <label class="row"><input v-model="m.gps" type="checkbox" /> ส่งพิกัด</label>
                <label class="row"><input v-model="m.qr" type="checkbox" /> สแกน QR</label>
                <label v-if="m.gps" class="row acc-in">±<input v-model.number="m.accuracy" type="range" min="5" max="300" step="5" :aria-label="`ความคลาดเคลื่อน GPS คนที่ ${k + 1}`" /></label>
              </div>
            </li>
          </ul>
        </section>

        <section class="card stack">
          <h3>ทดลองกับคนสมมติ 200 คน</h3>
          <p class="small muted">สุ่มตำแหน่งและคุณภาพ GPS แบบเช้าวันปกติ (ส่วนใหญ่ยืนที่ลาน บางคนอยู่ขอบ ร่มไม้ หรือลานจอดรถ) แล้วเทียบผลระหว่างค่าที่ตั้งไว้จริงกับค่าทดลอง</p>
          <button type="button" class="btn primary sm" :disabled="busy" @click="runCrowd">{{ crowd ? 'สุ่มใหม่' : 'เริ่มทดลอง' }}</button>
          <table v-if="crowd" class="cmp small">
            <thead><tr><th>ผล</th><th>ค่าจริง</th><th>ค่าทดลอง</th></tr></thead>
            <tbody>
              <tr v-for="r in crowdRows" :key="r.k"><td><span class="sw" :class="r.k" />{{ r.label }}</td><td>{{ r.cur }}</td><td :class="{ diff: r.cur !== r.try }">{{ r.try }}</td></tr>
            </tbody>
          </table>
          <p v-if="crowd" class="small muted">คนที่ไม่ผ่านต้องลองใหม่ สแกน QR หรือส่งคำขอให้งานกิจกรรมตรวจ ยิ่งมากยิ่งเพิ่มงานเจ้าหน้าที่ช่วงเช้า</p>
        </section>
      </aside>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { api } from '../../api';
import { MODE_LABELS, passLimit } from './scene';

const cur = ref(null);
const assumed = ref(false);
const error = ref('');
const busy = ref(false);
const mode = ref('gps_or_qr');
const radius = ref(150);
const maxAccuracy = ref(100);
const svg = ref(null);
const drag = ref(null);
const crowd = ref(null);

const people = reactive([
  { label: 'ยืนกลางลานเสาธง', dx: 0, dy: -40, accuracy: 10, gps: true, qr: false, res: null },
  { label: 'ยืนแถวหลังสุด ใกล้ขอบวง', dx: 30, dy: -150, accuracy: 15, gps: true, qr: false, res: null },
  { label: 'หลบแดดใต้ร่มไม้', dx: -196, dy: -70, accuracy: 12, gps: true, qr: false, res: null },
  { label: 'อยู่ในลาน แต่ GPS ไม่แม่น (ใต้หลังคา)', dx: 50, dy: -60, accuracy: 180, gps: true, qr: false, res: null },
  { label: 'ไม่ได้อนุญาตตำแหน่ง แต่สแกน QR', dx: -30, dy: -30, accuracy: 20, gps: false, qr: true, res: null },
  { label: 'สแกน QR จากรูปที่เพื่อนส่งมา อยู่ลานจอดรถ', dx: -176, dy: -206, accuracy: 10, gps: true, qr: true, res: null },
]);

const span = computed(() => Math.max(260, Math.round(radius.value * 1.7)));
const viewBox = computed(() => `${-span.value} ${-span.value} ${span.value * 2} ${span.value * 2}`);
const same = computed(() => cur.value && mode.value === cur.value.mode && radius.value === cur.value.radius && maxAccuracy.value === cur.value.maxAccuracy);

function resCls(r) {
  if (r.status === 'present') return r.flags.length ? 'flag' : 'pass';
  return r.qrRequired ? 'needqr' : 'fail';
}
function resText(r) {
  if (r.status === 'present') return r.flags.length ? 'ผ่าน (ติดธง)' : 'ผ่าน';
  return r.qrRequired ? 'ต้องสแกน QR' : 'ไม่ผ่าน';
}

const body = (points, withOverrides = true) => ({
  points: points.map((m) => ({ dx: m.dx, dy: m.dy, accuracy: m.accuracy, gps: m.gps, qr: m.qr })),
  ...(withOverrides ? { overrides: { mode: mode.value, radius: radius.value, maxAccuracy: maxAccuracy.value } } : {}),
});

let timer = 0;
let seq = 0;
function evaluateSoon() {
  clearTimeout(timer);
  timer = setTimeout(evaluate, 180);
}
async function evaluate() {
  const n = ++seq;
  try {
    const r = await api('/api/admin/sim/evaluate', { method: 'POST', body: body(people) });
    if (n !== seq) return;
    r.results.forEach((x, k) => { people[k].res = x; });
    assumed.value = r.assumedCenter;
    error.value = '';
    if (crowd.value) await evaluateCrowd();
  } catch (e) { error.value = e.message; }
}

// คนสมมติ 200 คน: สุ่มแบบกำหนดได้ (seed) ให้เทียบค่าได้ตรง
function makeCrowd(seed) {
  let a = seed >>> 0;
  const R = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const g = () => { let u = 0; let v = 0; while (!u) u = R(); while (!v) v = R(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const pts = [];
  for (let k = 0; k < 200; k += 1) {
    const r = R();
    let dx; let dy;
    if (r < 0.72) { dx = g() * 45; dy = -45 + g() * 30; } // ยืนตามแถว
    else if (r < 0.88) { const ang = R() * Math.PI * 2; const d = 120 + R() * 110; dx = Math.cos(ang) * d; dy = Math.sin(ang) * d; } // ขอบลาน / ร่มไม้
    else { dx = -176 + g() * 25; dy = -206 + g() * 20; } // ลานจอดรถ
    const q = R();
    const gps = q > 0.03;
    const accuracy = Math.round(q < 0.8 ? 5 + R() * 25 : 40 + R() * 160);
    pts.push({ dx: Math.round(dx), dy: Math.round(dy), accuracy, gps, qr: R() < 0.15 });
  }
  return pts;
}
async function evaluateCrowd() {
  const pts = crowd.value.points;
  const [now, test] = await Promise.all([
    api('/api/admin/sim/evaluate', { method: 'POST', body: body(pts, false) }),
    api('/api/admin/sim/evaluate', { method: 'POST', body: body(pts) }),
  ]);
  crowd.value = { ...crowd.value, res: test.results, cur: now.results };
}
async function runCrowd() {
  busy.value = true;
  try {
    crowd.value = { seed: Math.floor(Math.random() * 1e9), points: [], res: [], cur: [] };
    crowd.value.points = makeCrowd(crowd.value.seed);
    await evaluateCrowd();
  } catch (e) { error.value = e.message; } finally { busy.value = false; }
}
const bucket = (r) => (r.status === 'present' ? (r.flags.length ? 'flag' : 'pass') : r.qrRequired ? 'needqr' : r.geo);
const crowdRows = computed(() => {
  const ROWS = [['pass', 'ผ่าน'], ['flag', 'ผ่าน (ติดธง)'], ['out_of_zone', 'ไม่ผ่าน: นอกพื้นที่'], ['low_accuracy', 'ไม่ผ่าน: GPS ไม่แม่น'], ['no_location', 'ไม่ผ่าน: ไม่มีพิกัด'], ['needqr', 'ไม่ผ่าน: ต้องสแกน QR']];
  const count = (list) => { const m = {}; for (const r of list) { const b = bucket(r); m[b] = (m[b] || 0) + 1; } return m; };
  const a = count(crowd.value.cur);
  const b = count(crowd.value.res);
  return ROWS.map(([k, label]) => ({ k, label, cur: a[k] || 0, try: b[k] || 0 })).filter((r) => r.cur || r.try || r.k === 'pass');
});

// ลากด้วยนิ้ว/เมาส์ (แปลงพิกัดจอ → เมตร)
function toScene(ev) {
  const pt = svg.value.createSVGPoint();
  pt.x = ev.clientX; pt.y = ev.clientY;
  const q = pt.matrixTransform(svg.value.getScreenCTM().inverse());
  return { dx: Math.round(q.x), dy: Math.round(-q.y) };
}
function startDrag(ev, k) { drag.value = k; ev.target.setPointerCapture?.(ev.pointerId); }
function onMove(ev) {
  if (drag.value === null) return;
  const q = toScene(ev);
  const lim = span.value - 5;
  people[drag.value].dx = Math.max(-lim, Math.min(lim, q.dx));
  people[drag.value].dy = Math.max(-lim, Math.min(lim, q.dy));
}

function reset() {
  mode.value = cur.value.mode; radius.value = Math.min(400, cur.value.radius); maxAccuracy.value = Math.min(300, cur.value.maxAccuracy);
}
watch([mode, radius, maxAccuracy, () => people.map((m) => `${m.dx},${m.dy},${m.accuracy},${m.gps},${m.qr}`).join('|')], evaluateSoon);
onMounted(async () => {
  try {
    cur.value = await api('/api/admin/sim/rules');
    assumed.value = !cur.value.configured;
    reset();
    evaluate();
  } catch (e) { error.value = e.message; }
});
</script>

<style scoped>
.ctl { display: grid; gap: 10px; }
@media (min-width: 720px) { .ctl { grid-template-columns: 1fr 1fr 1fr; } }
.ctl input[type=range] { width: 100%; accent-color: var(--fill); }
.ctl select { width: 100%; }
.grid { display: grid; gap: 12px; grid-template-columns: minmax(0, 1fr); margin-top: 12px; }
@media (min-width: 980px) { .grid { grid-template-columns: minmax(0, 1fr) 360px; } }
.scene-card { padding: 10px; }
.hint { margin: 0 0 6px; }
.scene { width: 100%; height: auto; display: block; touch-action: none; }
.ground { fill: #eef3ea; }
.tol { fill: none; stroke: var(--brand-2); stroke-opacity: .4; stroke-dasharray: 5 5; stroke-width: 1.2; }
.zone { fill: var(--brand-2); fill-opacity: .08; stroke: var(--brand-2); stroke-width: 1.6; }
.pole { stroke: #5b6573; stroke-width: 1.6; }
.flagp { fill: var(--bad); }
.lbl { font-size: 11px; fill: var(--brand); font-weight: 600; }
.person { cursor: grab; }
.person .acc { fill: #9aa4b1; fill-opacity: .07; stroke: #9aa4b1; stroke-dasharray: 3 3; stroke-width: .8; }
.person .body { fill: #9aa4b1; stroke: #fff; stroke-width: 1.5; }
.person.pass .body { fill: var(--ok); }
.person.flag .body { fill: #e08a1a; }
.person.fail .body, .person.needqr .body { fill: var(--bad); }
.num { font-size: 10px; font-weight: 700; fill: #fff; pointer-events: none; }
.cd { fill: #9aa4b1; fill-opacity: .7; }
.cd.pass { fill: var(--ok); } .cd.flag { fill: #e08a1a; } .cd.fail, .cd.needqr { fill: var(--bad); }
.side { display: grid; gap: 12px; align-content: start; }
.side h3 { font-size: 1rem; margin: 0 0 8px; }
.plist { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
.plist li { border-bottom: 1px solid var(--line); padding-bottom: 8px; display: grid; gap: 3px; }
.top { flex-wrap: nowrap; gap: 8px; }
.badge.num { display: inline-flex; width: 22px; height: 22px; border-radius: 50%; align-items: center; justify-content: center; background: var(--fill); color: #fff; font-size: .78rem; flex: none; }
.res { font-size: .8rem; font-weight: 700; padding: 2px 10px; border-radius: 999px; background: var(--line); white-space: nowrap; }
.res.pass { background: var(--ok-bg); color: var(--ok); } .res.flag { background: var(--warn-bg); color: var(--warn); } .res.fail, .res.needqr { background: var(--bad-bg); color: var(--bad); }
.warnt { color: var(--warn); }
.opts { gap: 12px; }
.opts label { gap: 4px; }
.acc-in input { width: 110px; accent-color: var(--fill); }
.cmp { width: 100%; border-collapse: collapse; }
.cmp th, .cmp td { padding: 5px 6px; border-bottom: 1px solid var(--line); text-align: right; }
.cmp th:first-child, .cmp td:first-child { text-align: left; }
.cmp td.diff { font-weight: 700; color: var(--brand); }
.sw { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 6px; background: var(--bad); }
.sw.pass { background: var(--ok); } .sw.flag { background: #e08a1a; }
@media (prefers-color-scheme: dark) {
  .ground { fill: #1b2a20; }
  .person .body { stroke: #0f141a; }
}
</style>
