<template>
  <div class="exec">
    <div class="row no-print">
      <h1 class="grow" style="margin:0">รายงานผู้บริหาร</h1>
      <router-link class="btn sm" to="/report-docs">📝 เอกสารเสนอลงนาม</router-link>
      <button class="btn sm" @click="print">🖨 พิมพ์ / PDF</button>
    </div>
    <div class="row no-print" style="margin:10px 0">
      <button class="btn sm" @click="shift(-7)">‹</button>
      <span class="grow center"><b>{{ thaiDate(from, false) }} – {{ thaiDate(to, false) }}</b></span>
      <button class="btn sm" :disabled="to >= today" @click="shift(7)">›</button>
      <input v-model="from" type="date" style="width:auto" @change="load" />
      <input v-model="to" type="date" style="width:auto" @change="load" />
    </div>
    <div class="tabs no-print">
      <button v-for="t in tabs" :key="t.k" :class="{ on: tab === t.k }" @click="tab = t.k">{{ t.label }}</button>
    </div>
    <div v-if="error" class="alert bad">{{ error }}</div>
    <div v-if="rep?.demo" class="alert warn small">ช่วงนี้มีข้อมูลจำลอง — ใช้สำหรับฝึกใช้งานเท่านั้น</div>

    <template v-if="rep && rep.days.length">
      <!-- 1. สรุปผู้บริหารในหน้าเดียว -->
      <section v-if="tab === 'snapshot'" class="stack">
        <div class="hero card">
          <div>
            <p class="muted small" style="margin:0">อัตราการเข้าร่วมกิจกรรมหน้าเสาธง</p>
            <div class="big">{{ fmt(rep.totals.percent) }}%</div>
            <p class="small" style="margin:0">จากโอกาสเข้าร่วมทั้งหมด {{ rep.totals.possible }} คน-ครั้ง</p>
          </div>
          <svg viewBox="0 0 120 120" class="donut" role="img" :aria-label="`${rep.totals.total} คน-ครั้ง`">
            <circle cx="60" cy="60" r="48" class="track" />
            <circle cx="60" cy="60" r="48" class="val" :stroke-dasharray="`${(rep.totals.percent || 0) * 3.016} 302`" />
            <text x="60" y="58" text-anchor="middle" class="n">{{ rep.totals.total }}</text>
            <text x="60" y="76" text-anchor="middle" class="u">คน-ครั้ง</text>
          </svg>
        </div>
        <div class="stats">
          <div class="stat"><span>บุคลากรทั้งหมด</span><b style="color:var(--info)">{{ rep.totals.members }}</b><span>คน</span></div>
          <div class="stat"><span>ไม่ได้บันทึกการเข้าร่วม</span><b style="color:var(--bad)">{{ rep.totals.possible - rep.totals.total }}</b><span>คน-ครั้ง (ราชการ/ลา {{ rep.totals.excused }})</span></div>
          <div class="stat"><span>หน่วยงานเข้าร่วมครบ</span><b style="color:var(--ok)">{{ full }} / {{ rep.rows.length }}</b><span>หน่วยงาน</span></div>
          <div class="stat"><span>วันเข้าร่วมน้อยสุด</span><b style="color:var(--warn)">{{ fmt(lowDay.pct) }}%</b><span>{{ thaiDate(lowDay.day, false) }}</span></div>
        </div>
        <div class="two">
          <div class="card"><h3>การเข้าร่วมรายวัน</h3>
            <div class="minibars">
              <div v-for="d in daily" :key="d.day" class="mb">
                <b>{{ d.present }}</b>
                <div class="bar" :class="d.day === lowDay.day ? 'warnbg' : 'okbg'" :style="{ height: `${Math.max(8, (d.pct - minPct) / (100 - minPct + 0.01) * 70 + 20)}px` }" />
                <span class="small muted">{{ dnum(d.day) }}</span>
              </div>
            </div>
          </div>
          <div class="card"><h3>3 หน่วยงานที่ควรติดตาม</h3>
            <ol class="watch">
              <li v-for="r in lowest" :key="r.group"><span>{{ short(r.group) }}</span><b :style="{ color: color(r.percent) }">{{ fmt(r.percent) }}%</b></li>
            </ol>
          </div>
        </div>
      </section>

      <!-- 2. แนวโน้มรายวัน -->
      <section v-if="tab === 'daily'" class="two wide-left">
        <div class="card">
          <h3>เปรียบเทียบผู้เข้าร่วมและผู้ไม่ได้เข้าร่วม</h3>
          <p class="small muted">คิดเป็นสัดส่วนของบุคลากรทั้งหมด {{ rep.totals.members }} คนต่อวัน</p>
          <div class="daybars">
            <div v-for="d in daily" :key="d.day" class="db">
              <b>{{ fmt(d.pct) }}%</b><span class="small muted">{{ d.present }} / {{ rep.totals.members }}</span>
              <div class="stack-bar">
                <div class="miss" :class="{ hi: d.day === lowDay.day }" :style="{ height: `${100 - d.pct}%` }" />
                <div class="pres" :style="{ height: `${d.pct}%` }" />
              </div>
              <b class="small">{{ thaiDate(d.day, false) }}</b>
              <span class="small" :style="{ color: d.day === lowDay.day ? 'var(--bad)' : 'var(--muted)' }">ไม่ปรากฏ {{ rep.totals.members - d.present }}</span>
            </div>
          </div>
        </div>
        <div class="stack">
          <div class="card okc"><span class="small">สูงสุด</span><div class="mid">{{ fmt(highDay.pct) }}%</div><span class="small">{{ thaiDate(highDay.day) }}</span></div>
          <div class="card badc"><span class="small">ต่ำสุด</span><div class="mid">{{ fmt(lowDay.pct) }}%</div><span class="small">{{ thaiDate(lowDay.day) }} ({{ lowDay.present }} คน)</span></div>
          <div class="card"><b>ประเด็นติดตาม</b>
            <ul class="small"><li v-for="(t, i) in dailyNotes" :key="i">{{ t }}</li></ul></div>
        </div>
      </section>

      <!-- 3. เปรียบเทียบรายหน่วยงาน -->
      <section v-if="tab === 'units'" class="two wide-left">
        <div class="card">
          <h3>อัตราเข้าร่วมเรียงจากน้อยไปมาก</h3>
          <div v-for="r in sortedUnits" :key="r.group" class="hbar">
            <span class="name">{{ short(r.group) }}</span>
            <div class="track"><div :style="{ width: `${r.percent || 0}%`, background: color(r.percent) }" /></div>
            <b :style="{ color: color(r.percent) }">{{ fmt(r.percent) }}%</b>
          </div>
        </div>
        <div class="stack">
          <div v-for="b in buckets" :key="b.label" class="card bucket" :style="{ background: b.bg }">
            <span class="small" :style="{ color: b.fg }">{{ b.label }}</span>
            <div class="mid">{{ b.n }} หน่วยงาน</div>
          </div>
          <p class="small muted">จำนวนคนในแต่ละหน่วยงานไม่เท่ากัน จึงเทียบเป็นร้อยละ</p>
        </div>
      </section>

      <!-- 4. ตารางสี -->
      <section v-if="tab === 'heatmap'" class="card">
        <h3>ตารางสีรายหน่วยงาน × รายวัน</h3>
        <div class="table-wrap">
          <table class="heat">
            <thead><tr><th>หน่วยงาน</th><th v-for="d in rep.days" :key="d" class="center">{{ thaiDate(d, false) }}</th><th class="num">รวม</th></tr></thead>
            <tbody>
              <tr v-for="r in rep.rows" :key="r.group">
                <td>{{ r.group }}</td>
                <td v-for="d in rep.days" :key="d" class="center"><span class="cell" :class="heat(r.perDay[d], r.members)">{{ r.perDay[d] }}/{{ r.members }}</span></td>
                <td class="num"><b :style="{ color: color(r.percent) }">{{ fmt(r.percent) }}%</b></td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="small legend"><span class="cell h100">100%</span> <span class="cell h90">90–99.99%</span> <span class="cell h75">75–89.99%</span> <span class="cell hlow">&lt;75%</span>
          · ตัวเลข = ผู้เข้าร่วม/บุคลากรทั้งหมด</p>
      </section>

      <p class="small muted foot">ข้อมูลจากระบบเช็กชื่อเข้าแถว · ร้อยละ = มาเข้าแถว ÷ (บุคลากร × วันเข้าแถว) ตามแบบบันทึกของวิทยาลัย · {{ thaiDate(from, false) }} – {{ thaiDate(to, false) }}</p>
    </template>
    <p v-else-if="rep" class="card muted">ช่วงวันที่นี้ไม่มีวันเข้าแถว</p>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { api } from '../api';
import { thaiDate, serverToday, addDays, weekStart } from '../util';

const tabs = [
  { k: 'snapshot', label: 'สรุปในหน้าเดียว' },
  { k: 'daily', label: 'แนวโน้มรายวัน' },
  { k: 'units', label: 'เปรียบเทียบหน่วยงาน' },
  { k: 'heatmap', label: 'ตารางสี' },
];
const tab = ref('snapshot');
const today = ref('');
const from = ref('');
const to = ref('');
const rep = ref(null);
const error = ref('');

const fmt = (v) => (v === null || v === undefined ? '–' : Number(v).toFixed(2));
const dnum = (d) => Number(d.slice(8));
const short = (g) => g.replace(/^แผนกวิชา/, '').replace(/^ช่าง/, 'ช่าง');
const color = (p) => (p === null ? 'var(--muted)' : p < 90 ? '#d64545' : p < 95 ? '#e0962a' : '#139a7d');
function heat(n, m) {
  const p = m ? (n / m) * 100 : 0;
  return p >= 100 ? 'h100' : p >= 90 ? 'h90' : p >= 75 ? 'h75' : 'hlow';
}

const daily = computed(() => rep.value.days.map((day) => {
  const present = rep.value.totals.perDay[day];
  return { day, present, pct: rep.value.totals.members ? Math.round((present / rep.value.totals.members) * 10000) / 100 : 0 };
}));
const lowDay = computed(() => daily.value.reduce((a, b) => (b.pct < a.pct ? b : a), daily.value[0]));
const highDay = computed(() => daily.value.reduce((a, b) => (b.pct > a.pct ? b : a), daily.value[0]));
const minPct = computed(() => Math.min(...daily.value.map((d) => d.pct)) - 5);
const full = computed(() => rep.value.rows.filter((r) => r.percent === 100).length);
const sortedUnits = computed(() => [...rep.value.rows].sort((a, b) => (a.percent ?? 0) - (b.percent ?? 0)));
const lowest = computed(() => sortedUnits.value.filter((r) => r.percent < 100).slice(0, 3));
const buckets = computed(() => {
  const r = rep.value.rows;
  return [
    { label: 'ต่ำกว่า 90%', n: r.filter((x) => x.percent < 90).length, bg: 'var(--bad-bg)', fg: 'var(--bad)' },
    { label: '90 ถึงต่ำกว่า 95%', n: r.filter((x) => x.percent >= 90 && x.percent < 95).length, bg: 'var(--warn-bg)', fg: 'var(--warn)' },
    { label: '95 ถึงต่ำกว่า 100%', n: r.filter((x) => x.percent >= 95 && x.percent < 100).length, bg: 'var(--info-bg)', fg: 'var(--info)' },
    { label: 'เข้าร่วมครบ 100%', n: r.filter((x) => x.percent === 100).length, bg: 'var(--ok-bg)', fg: 'var(--ok)' },
  ];
});
const dailyNotes = computed(() => {
  const out = [];
  const d = daily.value;
  for (let i = 1; i < d.length; i += 1) {
    const diff = d[i].present - d[i - 1].present;
    if (diff <= -5) out.push(`${thaiDate(d[i].day, false)} ลดลง ${-diff} คน เทียบกับ ${thaiDate(d[i - 1].day, false)}`);
  }
  if (rep.value.totals.excused) out.push(`มีผู้ไปราชการ/งานนโยบาย/ลา รวม ${rep.value.totals.excused} คน-ครั้ง ควรแยกก่อนสรุปเชิงประเมิน`);
  if (!out.length) out.push('ไม่มีวันที่ลดลงผิดปกติ');
  return out;
});

async function load() {
  error.value = '';
  try { rep.value = await api(`/api/reports/official?from=${from.value}&to=${to.value}`); } catch (e) { error.value = e.message; }
}
function shift(n) { from.value = addDays(from.value, n); to.value = addDays(to.value, n); load(); }
function print() { window.print(); }

onMounted(async () => {
  today.value = await serverToday();
  // ศุกร์–อาทิตย์ แสดงสัปดาห์นี้ วันอื่นแสดงสัปดาห์ที่แล้ว (สัปดาห์ที่ข้อมูลครบ)
  const wd = new Date(`${today.value}T00:00:00Z`).getUTCDay();
  from.value = [5, 6, 0].includes(wd) ? weekStart(today.value) : addDays(weekStart(today.value), -7);
  to.value = addDays(from.value, 4);
  load();
});
</script>

<style scoped>
.hero { display: flex; align-items: center; justify-content: space-between; gap: 12px; background: #13294b; color: #fff; border: 0; }
.hero .muted { color: #b9c7dc; }
.big { font-size: 3.4rem; font-weight: 800; line-height: 1.05; font-variant-numeric: tabular-nums; }
.donut { width: 130px; flex: none; }
.donut .track { fill: none; stroke: #2a3e60; stroke-width: 14; }
.donut .val { fill: none; stroke: #3fd0b5; stroke-width: 14; stroke-linecap: round; transform: rotate(-90deg); transform-origin: 60px 60px; }
.donut .n { fill: #fff; font-size: 22px; font-weight: 800; }
.donut .u { fill: #b9c7dc; font-size: 10px; }
.stat b { font-size: 1.8rem; }
.two { display: grid; gap: 14px; grid-template-columns: 1fr; }
@media (min-width: 760px) { .two { grid-template-columns: 1fr 1fr; } .two.wide-left { grid-template-columns: 2fr 1fr; } }
.two > .card { margin-bottom: 0; }
.minibars { display: flex; justify-content: space-around; align-items: flex-end; gap: 6px; height: 140px; }
.mb { display: flex; flex-direction: column; align-items: center; gap: 4px; flex: 1; }
.mb .bar { width: 100%; max-width: 54px; border-radius: 8px; }
.okbg { background: #139a7d; } .warnbg { background: #e0962a; }
.watch { margin: 0; padding-left: 1.2rem; } .watch li { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid var(--line); }
.daybars { display: flex; gap: 10px; justify-content: space-around; }
.db { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; text-align: center; }
.stack-bar { width: 100%; max-width: 80px; height: 220px; display: flex; flex-direction: column; border-radius: 10px; overflow: hidden; background: var(--line); }
.stack-bar .miss { background: #f2a7a7; } .stack-bar .miss.hi { background: #d64545; }
.stack-bar .pres { background: #139a7d; }
.okc { background: var(--ok-bg); color: var(--ok); } .badc { background: var(--bad-bg); color: var(--bad); }
.mid { font-size: 2rem; font-weight: 800; }
.hbar { display: grid; grid-template-columns: minmax(120px, 34%) 1fr 70px; gap: 10px; align-items: center; padding: 4px 0; }
.hbar .name { font-size: .9rem; }
.hbar .track { height: 12px; background: var(--line); border-radius: 6px; overflow: hidden; }
.hbar .track div { height: 100%; border-radius: 6px; }
.hbar b { text-align: right; font-variant-numeric: tabular-nums; }
.bucket { margin-bottom: 0; }
.heat td, .heat th { padding: 5px 6px; }
.cell { display: inline-block; min-width: 54px; padding: 3px 6px; border-radius: 6px; font-variant-numeric: tabular-nums; font-size: .85rem; }
.h100 { background: #dff3ea; color: #0f7a5f; } .h90 { background: #e3eefb; color: #2b6cb0; } .h75 { background: #fbecd6; color: #a8641a; } .hlow { background: #fbe0e0; color: #c03030; }
.legend .cell { min-width: 0; }
.foot { margin-top: 12px; }
@media print { .exec .tabs { display: none; } }
</style>
