<template>
  <!-- เวลาเช็กชื่อ: เฉลี่ย/เร็วสุด/ช้าสุด · การกระจายทุก 10 นาที · ความต่อเนื่อง · วิธีเช็กชื่อ -->
  <section class="card stack tim">
    <div class="kpis">
      <div class="kpi"><b>{{ hm(avg) }}</b><span>เวลาเฉลี่ย</span></div>
      <div class="kpi"><b class="good">{{ hm(min) }}</b><span>เร็วสุด</span></div>
      <div class="kpi"><b :class="{ late: max !== null && max >= closeSec - 600 }">{{ hm(max) }}</b><span>ช้าสุด</span></div>
    </div>

    <div>
      <h3 class="h">ช่วงเวลาที่เช็กชื่อ <span class="small muted">(เฉพาะที่เช็กเอง {{ selfTimes.length }} ครั้ง · ปิดระบบ {{ closeTime.slice(0, 5) }} น.)</span></h3>
      <p v-if="!selfTimes.length" class="muted small">ยังไม่มีการเช็กชื่อด้วยตนเองในช่วงนี้</p>
      <div v-for="b in buckets" v-else :key="b.from" class="brow" :class="{ near: b.near }">
        <span class="bl">{{ b.label }}</span>
        <span class="track"><i :style="{ width: `${peak ? (b.n / peak) * 100 : 0}%` }" /></span>
        <span class="bn">{{ b.n }}</span>
      </div>
      <p v-if="nearShare !== null && selfTimes.length" class="small" :class="nearShare >= 30 ? 'late' : 'muted'" style="margin:6px 0 0">
        {{ nearShare >= 30 ? '⚠ ' : '' }}เช็กชื่อใน 10 นาทีสุดท้ายก่อนปิดระบบ {{ nearShare.toFixed(0) }}% ของครั้งที่เช็กเอง</p>
    </div>

    <div class="two">
      <div class="box">
        <h3 class="h">ความต่อเนื่อง</h3>
        <div class="streak"><b>{{ streak.current }}</b><span>วันเข้าแถวติดต่อกัน (ล่าสุด)</span></div>
        <div class="streak"><b>{{ streak.best }}</b><span>สถิติสูงสุดในช่วงนี้</span></div>
        <p class="small muted" style="margin:4px 0 0">ไปราชการ / งานนโยบาย / ลา ไม่ตัดความต่อเนื่อง · ขาดเริ่มนับใหม่</p>
      </div>
      <div class="box">
        <h3 class="h">วิธีเช็กชื่อ</h3>
        <div v-if="!methodRows.length" class="muted small">ยังไม่มีข้อมูล</div>
        <div v-else class="stackbar" role="img" :aria-label="methodRows.map((m) => `${m.label} ${m.n}`).join(' ')">
          <i v-for="m in methodRows" :key="m.k" :class="m.k" :style="{ width: `${(m.n / methodTotal) * 100}%` }" />
        </div>
        <div v-for="m in methodRows" :key="m.k" class="mrow small"><i :class="m.k" />{{ m.label }}<span class="grow" /><b>{{ m.n }}</b>&nbsp;({{ ((m.n / methodTotal) * 100).toFixed(0) }}%)</div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  days: { type: Array, required: true },
  openTime: { type: String, default: '07:00' },
  closeTime: { type: String, default: '08:30' },
});

const toSec = (s) => { const [h, m, x = 0] = String(s).split(':').map(Number); return h * 3600 + m * 60 + x; };
const openSec = computed(() => toSec(props.openTime));
const closeSec = computed(() => toSec(props.closeTime) + 59);
// เวลาไทยของวัน (วินาที)
const bkkSec = (iso) => { const d = new Date(new Date(iso).getTime() + 7 * 3600_000); return d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds(); };
const hm = (sec) => (sec === null ? '-' : `${String(Math.floor(sec / 3600)).padStart(2, '0')}:${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')} น.`);

const records = computed(() => props.days.filter((d) => d.record).map((d) => d.record));
const selfTimes = computed(() => records.value
  .filter((r) => r.status === 'present' && String(r.method).startsWith('self_') && r.checked_at)
  .map((r) => bkkSec(r.checked_at)));
const avg = computed(() => (selfTimes.value.length ? Math.round(selfTimes.value.reduce((a, b) => a + b, 0) / selfTimes.value.length) : null));
const min = computed(() => (selfTimes.value.length ? Math.min(...selfTimes.value) : null));
const max = computed(() => (selfTimes.value.length ? Math.max(...selfTimes.value) : null));

// ช่องละ 10 นาที ตั้งแต่เวลาเปิดถึงเวลาปิด (สูงสุด 12 ช่อง รวมช่องท้ายให้ช่วงกว้างขึ้น)
const buckets = computed(() => {
  const step = 600;
  // ช่วงที่แสดง: ตั้งแต่เวลาเปิด (หรือครั้งที่เร็วสุด) ถึงเวลาปิด (หรือครั้งที่ช้าสุด) ไม่แสดงช่วงยาวที่ว่างเปล่า
  let start = Math.floor(openSec.value / step) * step;
  let end = closeSec.value;
  if (selfTimes.value.length && (end - start) / step > 12) {
    start = Math.max(start, Math.floor(min.value / step) * step);
    end = Math.min(end, Math.ceil((max.value + 1) / step) * step - 1);
  }
  const edges = [];
  for (let t = start; t < end; t += step) edges.push(t);
  while (edges.length > 12) edges.splice(1, 1);
  const out = edges.map((t, i) => {
    const to = i + 1 < edges.length ? edges[i + 1] : end + 1;
    return { from: t, to, label: `${hm(t).slice(0, 5)}–${hm(Math.min(to, end + 1) - 60).slice(0, 5)}`, n: 0, near: to > closeSec.value - 600 };
  });
  for (const s of selfTimes.value) {
    const b = out.find((x) => s >= x.from && s < x.to) || (s < start ? out[0] : out.at(-1));
    if (b) b.n += 1;
  }
  return out;
});
const peak = computed(() => Math.max(0, ...buckets.value.map((b) => b.n)));
const nearShare = computed(() => (selfTimes.value.length ? (selfTimes.value.filter((s) => s > closeSec.value - 600).length / selfTimes.value.length) * 100 : null));

// ความต่อเนื่อง: นับวันที่มา, ข้ามวันราชการ/ลา, ขาดเริ่มใหม่
const streak = computed(() => {
  let cur = 0;
  let best = 0;
  for (const d of props.days) {
    if (!d.assembly || !d.status || d.status === 'pending') continue;
    if (d.status === 'present') { cur += 1; best = Math.max(best, cur); } else if (d.status === 'absent') cur = 0;
  }
  return { current: cur, best };
});

const METHOD_GROUPS = [
  { k: 'gps', label: 'เช็กเอง (GPS)', test: (m) => m === 'self_gps' },
  { k: 'qr', label: 'สแกน QR', test: (m) => m === 'self_qr' },
  { k: 'tap', label: 'กดปุ่มในแอป', test: (m) => m === 'self_tap' },
  { k: 'proxy', label: 'ผู้อื่นบันทึกแทน', test: () => true },
];
const methodRows = computed(() => {
  const c = Object.fromEntries(METHOD_GROUPS.map((g) => [g.k, 0]));
  for (const r of records.value) c[METHOD_GROUPS.find((g) => g.test(r.method)).k] += 1;
  return METHOD_GROUPS.map((g) => ({ ...g, n: c[g.k] })).filter((g) => g.n);
});
const methodTotal = computed(() => methodRows.value.reduce((a, b) => a + b.n, 0));
</script>

<style scoped>
.tim { padding: 14px; }
.kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.kpi { background: var(--bg); border-radius: 12px; padding: 10px; }
.kpi b { display: block; font-size: 1.3rem; line-height: 1.2; font-variant-numeric: tabular-nums; }
.kpi span { font-size: .75rem; color: var(--muted); }
.good { color: var(--ok); } .late { color: var(--bad); }
.h { margin: 0 0 8px; font-size: 1rem; }
.brow { display: grid; grid-template-columns: 96px 1fr 30px; align-items: center; gap: 8px; margin: 3px 0; font-size: .85rem; font-variant-numeric: tabular-nums; }
.bl { color: var(--muted); white-space: nowrap; }
.track { height: 16px; background: var(--bg); border-radius: 6px; overflow: hidden; }
.track i { display: block; height: 100%; background: var(--brand-2); border-radius: 6px; min-width: 0; }
.brow.near .track i { background: var(--warn); }
.brow.near .bl { color: var(--warn); font-weight: 600; }
.bn { text-align: right; font-weight: 700; }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
@media (max-width: 560px) { .two { grid-template-columns: 1fr; } .kpi b { font-size: 1.05rem; } }
.box { background: var(--bg); border-radius: 12px; padding: 12px; }
.streak { display: flex; align-items: baseline; gap: 8px; margin: 2px 0; }
.streak b { font-size: 1.5rem; color: var(--ok); font-variant-numeric: tabular-nums; min-width: 40px; }
.streak span { font-size: .85rem; color: var(--muted); }
.stackbar { display: flex; height: 14px; border-radius: 7px; overflow: hidden; margin-bottom: 8px; background: var(--line); }
.stackbar i { display: block; height: 100%; }
.mrow { display: flex; align-items: center; gap: 6px; margin: 3px 0; }
.mrow i { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }
i.gps { background: var(--ok); } i.qr { background: var(--info); } i.tap { background: var(--info2); } i.proxy { background: var(--warn); }
</style>
