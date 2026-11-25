<template>
  <!-- เล่นซ้ำสถานการณ์: ข้อมูลมาจากการรันตรรกะจริงของระบบกับฐานข้อมูลจำลอง (simulation/run.js) — หน้านี้ไม่เรียกฐานข้อมูล -->
  <div class="replay">
    <div class="chips" role="tablist" aria-label="สถานการณ์">
      <button v-for="s in index" :key="s.key" type="button" role="tab" :aria-selected="key === s.key" :class="{ on: key === s.key }" @click="choose(s.key)">{{ s.title }}</button>
    </div>
    <p v-if="meta" class="small muted desc">{{ meta.desc }}</p>
    <div v-if="error" class="alert bad">{{ error }}</div>

    <template v-if="p">
      <section class="bar card">
        <div class="clockbox">
          <span class="clk">{{ clockText(t) }}</span>
          <span class="ph" :class="phase">{{ phaseText }}</span>
        </div>
        <div class="ctrl">
          <button type="button" class="btn sm primary play" :aria-label="playing ? 'หยุดชั่วคราว' : 'เล่น'" @click="toggle">
            <svg v-if="!playing" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M7 5l12 7-12 7z" fill="currentColor" /></svg>
            <svg v-else viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M7 5h3v14H7zM14 5h3v14h-3z" fill="currentColor" /></svg>
            {{ playing ? 'หยุด' : 'เล่น' }}
          </button>
          <button type="button" class="btn sm" @click="restart">เริ่มใหม่</button>
          <label class="spd"><span class="sr">ความเร็ว</span>
            <select v-model.number="speed" aria-label="ความเร็ว">
              <option v-for="v in [15, 30, 60, 120]" :key="v" :value="v">เร็ว {{ v }} เท่า</option>
            </select></label>
          <label class="spd"><span class="sr">มุมมอง</span>
            <select v-model="view" aria-label="มุมมอง"><option value="all">ทั้งบริเวณ</option><option value="field">ลานเสาธง</option></select></label>
        </div>
        <input v-model.number="t" class="seek" type="range" :min="T0" :max="T1" step="5" aria-label="เลื่อนเวลา" @input="playing = false" />
        <div class="marks small muted"><span>07:20</span><span>เปิด {{ p.rules.openTime }}</span><span>ปิด {{ p.params.closeEarly || p.rules.closeTime }}</span><span>08:45</span></div>
      </section>

      <div class="grid">
        <section class="card scene-card">
          <div v-if="outageNow" class="net-banner">อินเทอร์เน็ตใช้ไม่ได้ — กดเช็กชื่อแล้วขึ้น "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้" ระบบไม่มีคิวเก็บไว้ส่งทีหลัง</div>
          <svg class="scene" :viewBox="viewBox" role="img" :aria-label="`ภาพจำลองลานเข้าแถว เวลา ${clockText(t, false)} น.`">
            <rect x="-240" y="-120" width="480" height="380" class="ground" />
            <!-- อาคาร / ทางเข้า / ลานจอดรถ / ร่มไม้ -->
            <rect :x="p.scene.hr[0] - 40" :y="-p.scene.hr[1] - 16" width="80" height="32" rx="4" class="bldg" />
            <text :x="p.scene.hr[0]" :y="-p.scene.hr[1] + 4" class="lbl" text-anchor="middle">งานบุคลากร</text>
            <rect :x="p.scene.parking[0] - 46" :y="-p.scene.parking[1] - 26" width="92" height="52" rx="4" class="park" />
            <text :x="p.scene.parking[0]" :y="-p.scene.parking[1] + 36" class="lbl" text-anchor="middle">ลานจอดรถ</text>
            <path :d="`M${p.scene.gate[0] - 22} ${-p.scene.gate[1] + 10} h44`" class="gate" />
            <text :x="p.scene.gate[0]" :y="-p.scene.gate[1] - 2" class="lbl" text-anchor="middle">ประตูวิทยาลัย</text>
            <g v-for="(tr, k) in trees" :key="k"><circle :cx="tr[0]" :cy="-tr[1]" r="11" class="tree" /></g>
            <text :x="p.scene.shade[0]" :y="-p.scene.shade[1] - 40" class="lbl" text-anchor="middle">ร่มไม้</text>
            <!-- พื้นที่เข้าแถว -->
            <circle cx="0" cy="0" :r="p.rules.radius + p.rules.radius / 2" class="tol" />
            <circle cx="0" cy="0" :r="p.rules.radius" class="zone" />
            <text x="0" :y="-p.rules.radius - 6" class="lbl zl" text-anchor="middle">พื้นที่เข้าแถว รัศมี {{ p.rules.radius }} ม.</text>
            <line x1="0" y1="0" x2="0" y2="-16" class="pole" /><path d="M0 -16 l11 4 -11 4z" class="flagp" />
            <rect :x="p.scene.qr[0] - 6" :y="-p.scene.qr[1] - 6" width="12" height="12" rx="2" class="qr" :class="{ off: phase !== 'open' }" />
            <text :x="p.scene.qr[0] + 9" :y="-p.scene.qr[1] + 3" class="lbl sm">QR</text>
            <rect :x="p.scene.activity[0] - 12" :y="-p.scene.activity[1] - 5" width="24" height="10" rx="2" class="desk" />
            <text :x="p.scene.activity[0]" :y="-p.scene.activity[1] - 9" class="lbl sm" text-anchor="middle">งานกิจกรรม</text>
            <!-- หมายเลขแถวแผนก -->
            <text v-for="(d, k) in p.depts" :key="d" :x="p.scene.rows.x0 + k * p.scene.rows.dx" y="84" class="lbl sm" text-anchor="middle">{{ k + 1 }}</text>
            <!-- กล่องนอกวิทยาลัย -->
            <g class="awaybox">
              <rect x="-236" y="-116" width="128" height="66" rx="6" />
              <text x="-230" y="-104" class="lbl sm">นอกวิทยาลัย / ลา</text>
            </g>
            <!-- บุคคลสมมติ -->
            <g v-for="s in shown" :key="s.a.i" class="pp" :class="[s.cls, { sel: sel === s.a.i, hot: s.hot }]" :transform="`translate(${s.x} ${s.y})`" @click="sel = s.a.i">
              <title>{{ s.a.n }} · {{ statusText(s) }}</title>
              <circle v-if="s.hot" r="7" class="halo" />
              <rect v-if="s.cls === 'pending'" x="-3" y="-3" width="6" height="6" class="g" />
              <path v-else-if="s.cls === 'absent'" d="M-3 -3L3 3M3 -3L-3 3" class="x" />
              <path v-else-if="s.cls === 'warn' || s.cls === 'net'" d="M0 -3.6L3.4 2.6H-3.4Z" class="g" />
              <circle v-else r="3" class="g" />
              <circle v-if="s.cls === 'proxy'" r="1.2" class="dot" />
              <path v-if="s.flag" d="M2 -5.5 l4 1.5 -4 1.5z" class="fl" />
            </g>
          </svg>
          <ul class="legend small">
            <li><svg viewBox="-5 -5 10 10"><circle r="3" class="lg ok" /></svg>มาเข้าแถว</li>
            <li><svg viewBox="-5 -5 10 10"><circle r="3" class="lg proxy" /><circle r="1.2" fill="#fff" /></svg>เช็กแทน</li>
            <li><svg viewBox="-5 -5 10 10"><rect x="-3" y="-3" width="6" height="6" class="lg pending" /></svg>รอตรวจสอบ</li>
            <li><svg viewBox="-5 -5 10 10"><path d="M0 -3.6L3.4 2.6H-3.4Z" class="lg warn" /></svg>เช็กไม่ผ่าน / เน็ตล่ม</li>
            <li><svg viewBox="-5 -5 10 10"><circle r="3" class="lg idle" /></svg>มาถึง ยังไม่เช็ก</li>
            <li><svg viewBox="-5 -5 10 10"><circle r="3" class="lg walk" /></svg>กำลังเดินมา</li>
            <li><svg viewBox="-5 -5 10 10"><path d="M-3 -3L3 3M3 -3L-3 3" class="lg absent" /></svg>ขาด (หลังปิด)</li>
            <li><svg viewBox="-5 -5 10 10"><path d="M-2 -3 l5 2 -5 2z" class="lg fl" /></svg>ติดธง</li>
          </ul>
          <p class="small muted rows">แถว: <span v-for="(d, k) in p.depts" :key="d">{{ k + 1 }} {{ d }}{{ k < p.depts.length - 1 ? ' · ' : '' }}</span></p>
        </section>

        <aside class="side">
          <section class="card">
            <h3>ตัวเลข ณ {{ clockText(t, false) }} น.</h3>
            <p v-if="phase === 'no_assembly'" class="small">วันนี้งดเข้าแถวตามปฏิทิน ไม่มีการนับ — รายงานไม่นับวันนี้ (สถานะลา/ราชการที่บันทึกไว้ยังอยู่สำหรับงานบุคลากร)</p>
            <div class="nums">
              <div class="n ok"><b>{{ c.present }}</b><span>มาเข้าแถว</span></div>
              <div class="n warn"><b>{{ c.pending }}</b><span>รอตรวจสอบ</span></div>
              <div v-if="phase !== 'closed'" class="n"><b>{{ c.waiting }}</b><span>มาถึง ยังไม่เช็ก</span></div>
              <div v-if="phase !== 'closed'" class="n"><b>{{ c.notArrived }}</b><span>ยังไม่มา</span></div>
              <div v-else class="n bad"><b>{{ c.absent }}</b><span>ขาด</span></div>
              <div class="n info"><b>{{ c.official }}</b><span>ไปราชการ</span></div>
              <div class="n info2"><b>{{ c.policy }}</b><span>งานนโยบาย</span></div>
              <div class="n"><b>{{ c.leave }}</b><span>ลา</span></div>
              <div class="n bad"><b>{{ c.flagged }}</b><span>ติดธง</span></div>
            </div>
            <p v-if="phase !== 'no_assembly'" class="small rate">อัตราเข้าแถว{{ phase === 'closed' ? '' : ' (ระหว่างวัน)' }}: <b>{{ c.rate ?? '–' }}%</b>
              <span class="muted"> = มา ÷ (ทั้งหมด − ราชการ − นโยบาย − ลา)</span></p>
            <p v-if="t >= T1 - 5 && p.summary" class="small okline">✓ ตรงกับรายงานของระบบหลังปิดเช็กชื่อ: มา {{ p.summary.total.present }} · ขาด {{ p.summary.total.absent }} · อัตรา {{ p.summary.total.rate ?? '–' }}%</p>
          </section>

          <section v-if="selA" class="card who">
            <div class="row"><b class="grow">{{ selA.n }}</b><button type="button" class="btn sm" @click="sel = null">ปิด</button></div>
            <p class="small muted">แถว {{ selA.d + 1 }} {{ p.depts[selA.d] }}{{ selA.rep ? ' · ตัวแทนเช็กชื่อแผนก' : '' }}</p>
            <ol class="tl small">
              <li v-for="(e, k) in selA.evs" :key="k" :class="{ future: e.t > t }"><b>{{ e.t < 0 ? 'เมื่อวาน' : clockText(e.t, false) }}</b> {{ e.m }}
                <span v-if="e.acc !== undefined && e.acc !== null" class="muted"> · ±{{ e.acc }} ม.</span><span v-if="e.qr" class="muted"> · QR</span></li>
              <li v-if="!selA.evs.length" class="muted">ไม่มีเหตุการณ์ (ไม่ได้กดเช็กชื่อ)</li>
            </ol>
            <p v-if="selA.final" class="small">ผลสุดท้ายในระบบ: <b>{{ finalText(selA.final) }}</b></p>
          </section>

          <section class="card">
            <h3>เหตุการณ์ล่าสุด</h3>
            <ol class="log small" aria-live="off">
              <li v-for="(e, k) in recent" :key="k" :class="kindCls(e.k)" @click="e.a >= 0 && (sel = e.a)">
                <b>{{ e.t < 0 ? 'เมื่อวาน' : clockText(e.t, false) }}</b> {{ e.a >= 0 ? p.agents[e.a].n : 'งานกิจกรรม' }} — {{ e.m }}
              </li>
              <li v-if="!recent.length" class="muted">ยังไม่มีเหตุการณ์ — กด "เล่น"</li>
            </ol>
          </section>
        </aside>
      </div>
      <p class="small muted">บุคคลทั้งหมดเป็นบุคคลสมมติ · ผลแต่ละคนได้จากการเรียกโค้ดเช็กชื่อจริงของระบบ (กฎ GPS, QR, สิทธิ์เช็กแทน, เวลาเปิด–ปิด) กับฐานข้อมูลจำลองที่แยกจากระบบจริง ·
        รันเมื่อ {{ new Date(p.generatedAt).toLocaleString('th-TH') }} ด้วยค่า: {{ MODE_LABELS[p.rules.mode] }} · รัศมี {{ p.rules.radius }} ม. · ยอมรับ GPS ±{{ p.rules.maxAccuracy }} ม.</p>
    </template>
    <p v-else-if="!error" class="muted">กำลังโหลด…</p>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import index from '../../sim-data/index.json';
import { AWAY_LABELS, MODE_LABELS, agentAt, clockText, countsAt, phaseAt, prepare, toSec } from './scene';

const FILES = import.meta.glob(['../../sim-data/*.json', '!../../sim-data/index.json']);
const T0 = toSec('07:20');
const T1 = toSec('08:45');
const key = ref(index[0]?.key || '');
const p = ref(null);
const error = ref('');
const t = ref(T0);
const playing = ref(false);
const speed = ref(30);
const view = ref('all');
const sel = ref(null);
let raf = 0;
let lastTs = 0;

const meta = computed(() => index.find((s) => s.key === key.value));
const viewBox = computed(() => (view.value === 'field' ? '-130 -40 260 170' : '-240 -120 480 380'));
const phase = computed(() => (p.value ? phaseAt(p.value, t.value) : 'before'));
const phaseText = computed(() => ({
  before: `ยังไม่ถึงเวลา (เปิด ${p.value.rules.openTime} น.)`,
  open: 'เปิดเช็กชื่อ',
  closed: p.value.manualClose && t.value >= p.value.closeAt ? `ปิดแล้ว (งานกิจกรรมสั่งปิด ${p.value.params.closeEarly} น.)` : `ปิดแล้ว (${p.value.rules.closeTime} น.)`,
  no_assembly: 'วันนี้งดเข้าแถว',
}[phase.value]));
const outageNow = computed(() => p.value?.outage && t.value >= p.value.outage[0] && t.value < p.value.outage[1]);
const trees = computed(() => { const [x, y] = p.value.scene.shade; return [[x - 10, y + 22], [x + 12, y + 4], [x - 8, y - 18], [x + 10, y - 30]]; });

const shown = computed(() => {
  const out = [];
  const awayIdx = { n: 0 };
  for (const a of p.value.agents) {
    const s = agentAt(p.value, a, t.value, phase.value);
    if (s.vis === 'home') continue;
    let x; let y;
    if (s.vis === 'away') {
      const n = awayIdx.n++;
      x = -228 + (n % 15) * 8; y = -92 + Math.floor(n / 15) * 8;
    } else { [x, y] = [s.pos[0], -s.pos[1]]; }
    const hot = s.last && s.last.t <= t.value && t.value - s.last.t < 25 && s.last.t >= 0;
    out.push({ a, cls: s.vis === 'away' ? `away ${s.st ? s.cls : 'unrec'}` : s.cls, flag: s.flag, x, y, hot, st: s.st, last: s.last });
  }
  return out;
});
const c = computed(() => countsAt(p.value, t.value, phase.value));
const recent = computed(() => p.value.events.filter((e) => e.t <= t.value).slice(-40).reverse());
const selA = computed(() => (sel.value === null ? null : p.value.agents[sel.value]));

const ST = { present: 'มาเข้าแถว', pending: 'รอตรวจสอบ', official: 'ไปราชการ', policy: 'งานนโยบาย', leave: 'ลา', absent: 'ขาด' };
const METHOD = { self_gps: 'GPS', self_qr: 'QR', self_tap: 'กดปุ่ม', proxy_dept: 'ตัวแทนแผนกเช็กแทน', proxy_peer: 'เพื่อนเช็กแทน', proxy_activity: 'งานกิจกรรมบันทึก', hr: 'เจ้าหน้าที่บุคลากรบันทึก', admin: 'ผู้ดูแลบันทึก' };
function statusText(s) {
  if (s.cls.startsWith('away')) return s.st ? ST[s.st] : `${AWAY_LABELS[s.a.away]} (ยังไม่ได้บันทึก)`;
  return { ok: 'มาเข้าแถว', proxy: 'มาเข้าแถว (เช็กแทน)', pending: 'รอตรวจสอบ', warn: 'เช็กไม่ผ่าน', net: 'เน็ตล่ม', idle: 'มาถึง ยังไม่เช็ก', walk: 'กำลังเดินมา', absent: 'ขาด' }[s.cls] + (s.flag ? ' · ติดธง' : '');
}
function finalText(f) {
  return `${ST[f.st] || f.st}${f.lt ? ` (${{ sick: 'ลาป่วย', personal: 'ลากิจ', other: 'ลาอื่น ๆ' }[f.lt]})` : ''} · ${METHOD[f.m] || f.m}${f.f ? ` · ติดธง: ${f.f}` : ''}`;
}
function kindCls(k) {
  if (['try_ok', 'approve', 'proxy_ok', 'leave_ok', 'hr_pre'].includes(k)) return 'okk';
  if (['need_review', 'try_pending', 'net_err', 'forget', 'no_phone', 'leave_req'].includes(k)) return 'warnk';
  if (['err_closed', 'err', 'proxy_err', 'err_no_assembly', 'close_manual', 'flag'].includes(k)) return 'badk';
  return '';
}

async function choose(k) {
  key.value = k;
  playing.value = false;
  sel.value = null;
  error.value = '';
  try {
    const mod = await FILES[`../../sim-data/${k}.json`]();
    p.value = prepare(mod.default || mod);
    t.value = T0;
  } catch (e) { error.value = `โหลดสถานการณ์ไม่ได้: ${e.message}`; }
}
function frame(ts) {
  if (!playing.value) return;
  if (lastTs) t.value = Math.min(T1, t.value + ((ts - lastTs) / 1000) * speed.value);
  lastTs = ts;
  if (t.value >= T1) { playing.value = false; return; }
  raf = requestAnimationFrame(frame);
}
function toggle() {
  if (!playing.value && t.value >= T1) t.value = T0;
  playing.value = !playing.value;
}
function restart() { t.value = T0; sel.value = null; playing.value = true; }
watch(playing, (v) => { cancelAnimationFrame(raf); lastTs = 0; if (v) raf = requestAnimationFrame(frame); });
onMounted(() => { if (key.value) choose(key.value); else error.value = 'ยังไม่มีไฟล์สถานการณ์ — รัน node simulation/run.js'; });
onUnmounted(() => cancelAnimationFrame(raf));
</script>

<style scoped>
.chips { display: flex; gap: 6px; flex-wrap: wrap; }
.chips button { min-height: 36px; padding: 0 14px; border-radius: 999px; border: 1px solid var(--line); background: var(--card); color: var(--text); font: inherit; font-size: .88rem; cursor: pointer; }
.chips button.on { background: var(--fill); border-color: var(--fill); color: #fff; }
.desc { margin: 8px 0 10px; }
.bar { display: grid; gap: 8px; margin-bottom: 12px; }
.clockbox { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
.clk { font-size: 1.9rem; font-weight: 700; font-variant-numeric: tabular-nums; }
.ph { font-weight: 600; font-size: .92rem; }
.ph.open { color: var(--ok); } .ph.before { color: var(--warn); } .ph.closed { color: var(--bad); } .ph.no_assembly { color: var(--muted); }
.ctrl { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.play { display: inline-flex; gap: 6px; align-items: center; min-width: 84px; justify-content: center; }
.spd select { min-height: 34px; border-radius: 9px; border: 1px solid var(--line); background: var(--card); color: var(--text); font: inherit; font-size: .85rem; padding: 0 8px; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
.seek { width: 100%; accent-color: var(--fill); }
.marks { display: flex; justify-content: space-between; margin-top: -4px; }
.grid { display: grid; gap: 12px; grid-template-columns: minmax(0, 1fr); }
@media (min-width: 980px) { .grid { grid-template-columns: minmax(0, 1fr) 330px; } }
.scene-card { position: relative; padding: 10px; }
.net-banner { position: absolute; left: 10px; right: 10px; top: 10px; z-index: 2; background: var(--bad); color: #fff; border-radius: 10px; padding: 8px 12px; font-size: .85rem; font-weight: 600; }
.scene { width: 100%; height: auto; display: block; touch-action: manipulation; }
.ground { fill: #eef3ea; }
.bldg { fill: #dfe5ee; stroke: #b9c3d1; stroke-width: .8; }
.park { fill: #e4e6ea; stroke: #c5cad2; stroke-dasharray: 3 3; stroke-width: .8; }
.gate { stroke: #8a6a3d; stroke-width: 4; stroke-linecap: round; }
.tree { fill: #b9d7a8; }
.tol { fill: none; stroke: var(--brand-2); stroke-opacity: .35; stroke-dasharray: 4 4; stroke-width: 1; }
.zone { fill: var(--brand-2); fill-opacity: .07; stroke: var(--brand-2); stroke-width: 1.4; }
.pole { stroke: #5b6573; stroke-width: 1.4; }
.flagp { fill: var(--bad); }
.qr { fill: #fff; stroke: #1c2430; stroke-width: 1.4; }
.qr.off { stroke-opacity: .35; }
.desk { fill: #c9a86a; }
.lbl { font-size: 9px; fill: #4b5563; font-family: inherit; }
.lbl.sm { font-size: 7.5px; }
.lbl.zl { fill: var(--brand); font-weight: 600; }
.awaybox rect { fill: #fff; fill-opacity: .8; stroke: #c5cad2; stroke-width: .8; }
.pp { cursor: pointer; }
.pp .g { stroke: #fff; stroke-width: .7; }
.pp.ok .g { fill: var(--ok); }
.pp.proxy .g { fill: var(--ok); }
.pp .dot { fill: #fff; }
.pp.pending .g { fill: var(--warn); }
.pp.warn .g, .pp.net .g { fill: #e08a1a; }
.pp.idle .g { fill: #fff; stroke: #4b5563; stroke-width: 1; }
.pp.walk .g { fill: #9aa4b1; }
.pp .x { stroke: var(--bad); stroke-width: 1.6; stroke-linecap: round; }
.pp .fl { fill: var(--bad); }
.pp.away.official .g { fill: var(--info); }
.pp.away.policy .g { fill: var(--info2); }
.pp.away.leave .g { fill: #d9485f; }
.pp.away.unrec .g { fill: #fff; stroke: #9aa4b1; stroke-width: 1; }
.pp .halo { fill: #f6c445; fill-opacity: .45; }
.pp.sel .g { stroke: #1c2430; stroke-width: 1.4; }
.legend { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: 4px 14px; }
.legend li { display: inline-flex; align-items: center; gap: 5px; }
.legend svg { width: 14px; height: 14px; }
.lg.ok, .lg.proxy { fill: var(--ok); } .lg.pending { fill: var(--warn); } .lg.warn { fill: #e08a1a; }
.lg.idle { fill: #fff; stroke: #4b5563; stroke-width: 1; } .lg.walk { fill: #9aa4b1; }
.lg.absent { stroke: var(--bad); stroke-width: 1.6; } .lg.fl { fill: var(--bad); }
.rows { margin: 6px 0 0; }
.side { display: grid; gap: 12px; align-content: start; }
.side h3 { font-size: 1rem; margin: 0 0 8px; }
.nums { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.n { background: var(--bg); border-radius: 10px; padding: 8px 6px; text-align: center; }
.n b { display: block; font-size: 1.25rem; font-variant-numeric: tabular-nums; }
.n span { font-size: .75rem; color: var(--muted); }
.n.ok b { color: var(--ok); } .n.warn b { color: var(--warn); } .n.bad b { color: var(--bad); } .n.info b { color: var(--info); } .n.info2 b { color: var(--info2); }
.rate { margin: 10px 0 0; }
.okline { margin: 6px 0 0; color: var(--ok); }
.who .row { margin-bottom: 2px; }
.tl { margin: 6px 0; padding-left: 18px; display: grid; gap: 3px; }
.tl .future { opacity: .4; }
.log { list-style: none; margin: 0; padding: 0; max-height: 340px; overflow: auto; display: grid; gap: 2px; }
.log li { padding: 4px 6px; border-left: 3px solid var(--line); border-radius: 3px; cursor: pointer; }
.log li.okk { border-left-color: var(--ok); } .log li.warnk { border-left-color: var(--warn); } .log li.badk { border-left-color: var(--bad); }
@media (prefers-color-scheme: dark) {
  .ground { fill: #1b2a20; } .bldg { fill: #2a3541; stroke: #3b4856; } .park { fill: #232b35; stroke: #3b4856; }
  .tree { fill: #2f4f2a; } .qr { fill: #e6ebf1; } .lbl { fill: #b9c4d0; } .awaybox rect { fill: #182029; stroke: #3b4856; }
  .pp.idle .g, .lg.idle { fill: #182029; stroke: #e6ebf1; } .pp .g { stroke: #0f141a; } .pp.away.unrec .g { fill: #182029; }
}
</style>
