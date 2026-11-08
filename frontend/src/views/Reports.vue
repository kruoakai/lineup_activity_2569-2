<template>
  <div>
    <div class="row no-print">
      <h1 class="grow" style="margin:0">รายงานการเข้าแถว</h1>
      <router-link v-if="['activity','executive','admin'].includes(auth.user.role)" class="btn sm" to="/executive">📈 ผู้บริหาร</router-link>
      <button class="btn sm" @click="exportXlsx">⬇ Excel</button>
      <button class="btn sm" @click="exportCsv">⬇ CSV</button>
      <button class="btn sm" @click="print">🖨 พิมพ์ / PDF</button>
    </div>

    <div class="tabs no-print" style="margin-top:10px">
      <button v-for="m in modes" :key="m.key" :class="{ on: mode === m.key }" @click="setMode(m.key)">{{ m.label }}</button>
    </div>

    <div class="row no-print" style="margin-bottom:12px">
      <template v-if="mode === 'semester'">
        <select v-model="semesterId" class="grow" @change="applySemester">
          <option v-if="!semesters.length" :value="0">— ยังไม่ได้กำหนดภาคเรียน —</option>
          <option v-for="s in semesters" :key="s.id" :value="s.id">ภาคเรียน {{ s.name }}</option>
        </select>
      </template>
      <template v-else-if="mode === 'custom'">
        <input v-model="from" type="date" class="grow" @change="load" />
        <input v-model="to" type="date" class="grow" @change="load" />
      </template>
      <template v-else>
        <button class="btn sm" @click="shift(-1)">‹</button>
        <span class="grow center"><b>{{ rangeText }}</b></span>
        <button class="btn sm" :disabled="to >= today" @click="shift(1)">›</button>
      </template>
      <select v-if="allDepts && departments.length" v-model="departmentId" class="grow" @change="load">
        <option :value="0">ทุกแผนก/งาน</option>
        <option v-for="d in departments" :key="d.id" :value="d.id">{{ d.name }}</option>
      </select>
    </div>

    <h2 class="print-only">รายงานการเข้าแถว {{ rangeText }}</h2>
    <div v-if="error" class="alert bad">{{ error }}</div>

    <template v-if="rep">
      <p class="small muted">วันเข้าแถว {{ rep.days }} วัน · บุคลากรที่ต้องเข้าแถว {{ rep.total.members }} คน
        <template v-if="rep.total.flagged"> · ติดธงตรวจสอบ {{ rep.total.flagged }} รายการ</template></p>
      <div class="stats">
        <div class="stat"><b>{{ rep.total.rate ?? '–' }}<small v-if="rep.total.rate !== null">%</small></b><span>อัตราเข้าแถว</span></div>
        <div class="stat"><b style="color:var(--ok)">{{ rep.total.present }}</b><span>มาเข้าแถว</span></div>
        <div class="stat"><b style="color:var(--bad)">{{ rep.total.absent }}</b><span>ขาด</span></div>
        <div class="stat"><b style="color:var(--info)">{{ rep.total.official + rep.total.policy }}</b><span>ราชการ / งานนโยบาย</span></div>
        <div class="stat"><b>{{ rep.total.leave }}</b><span>ลา</span></div>
        <div class="stat"><b style="color:var(--warn)">{{ rep.total.pending }}</b><span>รอตรวจสอบ</span></div>
        <div class="stat"><b>{{ rep.total.not_checked }}</b><span>ยังไม่เช็ก (วันนี้)</span></div>
        <div class="stat"><b>{{ rep.total.proxy }}</b><span>ถูกบันทึกแทน</span></div>
      </div>
      <p class="small muted">อัตราเข้าแถว = มาเข้าแถว ÷ (จำนวนครั้งที่ต้องเข้าแถว − ไปราชการ − ติดงานนโยบาย − ลา)</p>

      <div class="charts">
        <section class="card"><h3>สัดส่วนสถานะ</h3><div class="chart sm"><canvas ref="pieEl" /></div></section>
        <section v-if="rep.trend.length > 1" class="card"><h3>แนวโน้มรายวัน (%)</h3><div class="chart"><canvas ref="lineEl" /></div></section>
      </div>
      <section v-if="rep.departments.length > 1" class="card">
        <h3>อัตราเข้าแถวรายแผนก/งาน (%)</h3>
        <div class="chart" :style="{ height: `${Math.max(240, rep.departments.length * 26)}px` }"><canvas ref="barEl" /></div>
      </section>

      <section v-if="rep.units?.length" class="card">
        <div class="row"><h3 class="grow" style="margin:0">ร้อยละการเข้าแถวรายหน่วยงาน (ตามแบบรายงาน)</h3></div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>หน่วยงาน/งาน</th><th class="num">คน</th><th class="num">มา</th><th class="num">ขาด</th><th class="num">ราชการ</th><th class="num">นโยบาย</th><th class="num">ลา</th><th class="num">%</th></tr></thead>
            <tbody>
              <tr v-for="g in rep.units" :key="g.unit_name">
                <td>{{ g.unit_name }}</td><td class="num">{{ g.members }}</td><td class="num">{{ g.present }}</td><td class="num">{{ g.absent }}</td>
                <td class="num">{{ g.official }}</td><td class="num">{{ g.policy }}</td><td class="num">{{ g.leave }}</td>
                <td class="num"><b :class="rateCls(g.rate)">{{ g.rate ?? '–' }}</b></td>
              </tr>
              <tr class="total-row">
                <td><b>ภาพรวม{{ allDepts && !departmentId ? 'ทั้งวิทยาลัย' : '' }}</b></td><td class="num"><b>{{ rep.total.members }}</b></td><td class="num"><b>{{ rep.total.present }}</b></td>
                <td class="num"><b>{{ rep.total.absent }}</b></td><td class="num"><b>{{ rep.total.official }}</b></td><td class="num"><b>{{ rep.total.policy }}</b></td>
                <td class="num"><b>{{ rep.total.leave }}</b></td><td class="num"><b :class="rateCls(rep.total.rate)">{{ rep.total.rate ?? '–' }}</b></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="card">
        <div class="row"><h3 class="grow" style="margin:0">ร้อยละการเข้าแถวรายแผนก</h3></div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>แผนก/งาน</th><th class="num">คน</th><th class="num">มา</th><th class="num">ขาด</th><th class="num">ราชการ</th><th class="num">นโยบาย</th><th class="num">ลา</th><th class="num">%</th></tr></thead>
            <tbody>
              <tr v-for="d in rep.departments" :key="d.department_id ?? 0">
                <td>{{ d.department_name }}</td><td class="num">{{ d.members }}</td><td class="num">{{ d.present }}</td><td class="num">{{ d.absent }}</td>
                <td class="num">{{ d.official }}</td><td class="num">{{ d.policy }}</td><td class="num">{{ d.leave }}</td><td class="num"><b :class="rateCls(d.rate)">{{ d.rate ?? '–' }}</b></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="card">
        <div class="row">
          <h3 class="grow" style="margin:0">รายบุคคล</h3>
          <select v-model="sortBy" style="width:auto" class="no-print">
            <option value="name">เรียงตามชื่อ</option>
            <option value="rate">อัตราเข้าแถว น้อย→มาก</option>
            <option value="absent">ขาดมาก→น้อย</option>
          </select>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>ชื่อ-สกุล</th><th>แผนก</th><th class="num">มา</th><th class="num">ขาด</th><th class="num">ราชการ</th><th class="num">นโยบาย</th><th class="num">ลา</th><th class="num">รอ</th><th class="num">%</th></tr></thead>
            <tbody>
              <tr v-for="u in sortedUsers" :key="u.user_id">
                <td>{{ u.full_name }}</td><td class="small">{{ u.department_name }}</td><td class="num">{{ u.present }}</td>
                <td class="num" :style="u.absent ? 'color:var(--bad);font-weight:600' : ''">{{ u.absent }}</td>
                <td class="num">{{ u.official }}</td><td class="num">{{ u.policy }}</td><td class="num">{{ u.leave }}</td><td class="num">{{ u.pending }}</td>
                <td class="num"><b :class="rateCls(u.rate)">{{ u.rate ?? '–' }}</b></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { Chart, ArcElement, BarElement, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend, DoughnutController, BarController, LineController, Filler } from 'chart.js';
import { api, auth, download } from '../api';
const rateCls = (r) => (r === null || r === undefined ? '' : r >= 95 ? 'r-good' : r >= 90 ? 'r-mid' : 'r-low');
import { thaiDate, serverToday, addDays, weekStart } from '../util';

Chart.register(ArcElement, BarElement, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend, DoughnutController, BarController, LineController, Filler);

let today = '';
const modes = [
  { key: 'day', label: 'รายวัน' },
  { key: 'week', label: 'รายสัปดาห์' },
  { key: 'month', label: 'รายเดือน' },
  { key: 'semester', label: 'ภาคเรียน' },
  { key: 'custom', label: 'กำหนดเอง' },
];
const mode = ref('day');
const from = ref('');
const to = ref('');
const rep = ref(null);
const error = ref('');
const departments = ref([]);
const allDepts = ref(false);
const departmentId = ref(0);
const semesters = ref([]);
const semesterId = ref(0);
const sortBy = ref('name');
const pieEl = ref(null);
const barEl = ref(null);
const lineEl = ref(null);
let charts = [];

const TH_MONTH = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const rangeText = computed(() => {
  if (mode.value === 'month') {
    const [y, m] = from.value.split('-').map(Number);
    return `${TH_MONTH[m - 1]} ${y + 543}`;
  }
  return from.value === to.value ? thaiDate(from.value) : `${thaiDate(from.value, false)} – ${thaiDate(to.value, false)}`;
});

const sortedUsers = computed(() => {
  const u = [...(rep.value?.users || [])];
  if (sortBy.value === 'rate') u.sort((a, b) => (a.rate ?? 101) - (b.rate ?? 101));
  else if (sortBy.value === 'absent') u.sort((a, b) => b.absent - a.absent);
  return u;
});

function monthRange(day) {
  const [y, m] = day.split('-').map(Number);
  const first = `${y}-${String(m).padStart(2, '0')}-01`;
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return [first, last];
}

function setMode(m) {
  mode.value = m;
  if (m === 'day') { from.value = today; to.value = today; }
  if (m === 'week') { from.value = weekStart(today); to.value = addDays(from.value, 6); }
  if (m === 'month') [from.value, to.value] = monthRange(today);
  if (m === 'semester') { applySemester(); return; }
  load();
}

function shift(dir) {
  if (mode.value === 'day') { from.value = addDays(from.value, dir); to.value = from.value; }
  if (mode.value === 'week') { from.value = addDays(from.value, 7 * dir); to.value = addDays(from.value, 6); }
  if (mode.value === 'month') {
    const [y, m] = from.value.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + dir, 1)).toISOString().slice(0, 10);
    [from.value, to.value] = monthRange(d);
  }
  load();
}

function applySemester() {
  const s = semesters.value.find((x) => x.id === semesterId.value) || semesters.value[0];
  if (!s) { rep.value = null; error.value = 'ยังไม่ได้กำหนดภาคเรียน (งานกิจกรรม → ปฏิทินวันเข้าแถว)'; return; }
  semesterId.value = s.id;
  from.value = s.start_date;
  to.value = s.end_date;
  load();
}

function qs() {
  const q = new URLSearchParams({ from: from.value, to: to.value });
  if (departmentId.value) q.set('departmentId', departmentId.value);
  return q;
}

async function load() {
  error.value = '';
  try {
    rep.value = await api(`/api/reports/summary?${qs()}`);
    await nextTick();
    drawCharts();
  } catch (e) {
    error.value = e.message;
  }
}

function css(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function drawCharts() {
  charts.forEach((c) => c.destroy());
  charts = [];
  const t = rep.value.total;
  const text = css('--text');
  const grid = css('--line');
  Chart.defaults.color = css('--muted');
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  if (pieEl.value) {
    charts.push(new Chart(pieEl.value, {
      type: 'doughnut',
      data: {
        labels: ['มาเข้าแถว', 'ขาด', 'ไปราชการ', 'ติดงานนโยบาย', 'ลา', 'รอตรวจสอบ', 'ยังไม่เช็ก'],
        datasets: [{
          data: [t.present, t.absent, t.official, t.policy, t.leave, t.pending, t.not_checked],
          backgroundColor: [css('--ok'), css('--bad'), css('--info'), css('--info2'), '#9aa5b1', css('--warn'), css('--line')],
          borderWidth: 0,
        }],
      },
      options: { maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: text, boxWidth: 12 } } }, cutout: '60%' },
    }));
  }
  if (barEl.value) {
    const ds = rep.value.departments;
    charts.push(new Chart(barEl.value, {
      type: 'bar',
      data: { labels: ds.map((d) => d.department_name), datasets: [{ label: '%', data: ds.map((d) => d.rate ?? 0), backgroundColor: css('--brand-2'), borderRadius: 4 }] },
      options: {
        indexAxis: 'y', maintainAspectRatio: false,
        scales: { x: { min: 0, max: 100, grid: { color: grid } }, y: { grid: { display: false }, ticks: { color: text, autoSkip: false, font: { size: 11 } } } },
        plugins: { legend: { display: false } },
      },
    }));
  }
  if (lineEl.value) {
    const tr = rep.value.trend;
    charts.push(new Chart(lineEl.value, {
      type: 'line',
      data: {
        labels: tr.map((d) => thaiDate(d.day, false)),
        datasets: [{ label: 'อัตราเข้าแถว', data: tr.map((d) => d.rate), borderColor: css('--brand-2'), backgroundColor: 'rgba(47,111,184,.12)', fill: true, tension: 0.25, pointRadius: 2 }],
      },
      options: { maintainAspectRatio: false, scales: { y: { min: 0, max: 100, grid: { color: grid } }, x: { grid: { display: false } } }, plugins: { legend: { display: false } } },
    }));
  }
}

function exportCsv() {
  download(`/api/reports/summary.csv?${qs()}`, `รายงานเข้าแถว_${from.value}_${to.value}.csv`).catch((e) => { error.value = e.message; });
}
function exportXlsx() {
  download(`/api/reports/summary.xlsx?${qs()}`, `รายงานเข้าแถว_${from.value}_${to.value}.xlsx`).catch((e) => { error.value = e.message; });
}
function print() { window.print(); }

onMounted(async () => {
  today = await serverToday();
  from.value = today;
  to.value = today;
  try {
    const [d, s] = await Promise.all([api('/api/reports/departments'), api('/api/reports/semesters')]);
    departments.value = d.items;
    allDepts.value = d.all;
    semesters.value = s.items;
  } catch { /* ignore */ }
  load();
});
onBeforeUnmount(() => charts.forEach((c) => c.destroy()));
</script>

<style scoped>
.r-good { color: var(--ok); }
.r-mid { color: var(--warn); }
.r-low { color: var(--bad); }
.total-row td { border-top: 2px solid var(--line); }
.charts { display: grid; gap: 14px; grid-template-columns: 1fr; }
@media (min-width: 760px) { .charts { grid-template-columns: 1fr 1.4fr; } }
.charts .card { margin-bottom: 0; }
.charts { margin-bottom: 14px; }
.chart { position: relative; height: 240px; }
.chart.sm { height: 220px; }
.stat small { font-size: .9rem; }
.print-only { display: none; }
@media print { .print-only { display: block; } }
</style>
