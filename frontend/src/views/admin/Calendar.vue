<template>
  <div>
    <h1>ปฏิทินวันเข้าแถว</h1>
    <div v-if="error" class="alert bad">{{ error }}</div>
    <div v-if="notice" class="alert ok">{{ notice }}</div>

    <section class="card stack">
      <h2>เพิ่มวันหยุด / งดเข้าแถว / กิจกรรมพิเศษ</h2>
      <p class="small muted" style="margin:0">วันที่ตั้งในปฏิทินมีผลเหนือ "วันเข้าแถวปกติ" ในหน้าตั้งค่า วันหยุดและวันงดไม่นับในรายงาน ส่วนกิจกรรมพิเศษนับเป็นวันเข้าแถวตามปกติ</p>
      <div class="types">
        <label v-for="t in TYPES" :key="t.value" class="type" :class="[t.cls, { on: status === t.value }]">
          <input v-model="status" type="radio" :value="t.value" />
          <b>{{ t.label }}</b><span class="small">{{ t.hint }}</span>
        </label>
      </div>
      <div class="row">
        <label class="field grow"><span>ตั้งแต่วันที่</span><input v-model="from" type="date" /></label>
        <label class="field grow"><span>ถึงวันที่ (ไม่บังคับ)</span><input v-model="to" type="date" :min="from" /></label>
      </div>
      <input v-model="note" :placeholder="NOTE_HINT[status]" maxlength="255" />
      <button class="btn primary" :disabled="!from || busy || rangeDays.length > 120" @click="saveRange">
        บันทึก{{ rangeDays.length > 1 ? ` ${rangeDays.length} วัน` : '' }}
      </button>
      <p v-if="rangeDays.length > 120" class="small" style="color:var(--bad);margin:0">ช่วงวันที่ยาวเกิน 120 วัน</p>
    </section>

    <section class="card stack">
      <div class="row">
        <h2 class="grow" style="margin:0">วันหยุดนักขัตฤกษ์ (วันที่คงที่)</h2>
        <select v-model.number="year" style="width:auto">
          <option v-for="y in years" :key="y" :value="y">พ.ศ. {{ y + 543 }}</option>
        </select>
      </div>
      <ul class="list small">
        <li v-for="h in holidays" :key="h.day">
          <label class="row grow" style="gap:8px">
            <input v-model="picked" type="checkbox" :value="h.day" />
            <span class="main"><b>{{ thaiDate(h.day, false) }}</b> · {{ h.note }}<span v-if="isWeekend(h.day)" class="muted"> (ตรงเสาร์–อาทิตย์)</span></span>
          </label>
          <span v-if="existing[h.day]" class="badge muted">มีแล้ว</span>
        </li>
      </ul>
      <p class="small muted" style="margin:0">วันพระ (มาฆบูชา วิสาขบูชา อาสาฬหบูชา เข้าพรรษา) และวันหยุดชดเชย เปลี่ยนทุกปี ให้เพิ่มเองด้านบนตามประกาศของทางราชการ</p>
      <button class="btn primary" :disabled="!picked.length || busy" @click="addHolidays">เพิ่ม {{ picked.length }} วันเป็นวันหยุดนักขัตฤกษ์</button>
    </section>

    <section class="card stack">
      <h2>รายการในปฏิทิน</h2>
      <div class="row small">
        <label v-for="t in [{ value: '', label: 'ทั้งหมด' }, ...TYPES]" :key="t.value" class="row" style="gap:4px">
          <input v-model="filter" type="radio" :value="t.value" /> {{ t.label }}
        </label>
      </div>
      <ul class="list">
        <li v-for="d in shownDays" :key="d.day">
          <div class="main"><strong>{{ thaiDate(d.day) }}</strong><span class="small muted">{{ d.note }}</span></div>
          <span class="badge" :class="TYPE[d.status]?.cls">{{ TYPE[d.status]?.label || d.status }}</span>
          <button class="btn sm danger" :disabled="busy" @click="removeDay(d.day)">ลบ</button>
        </li>
        <li v-if="!shownDays.length" class="muted small">ยังไม่มีรายการ</li>
      </ul>
    </section>

    <section class="card stack">
      <h2>ภาคเรียน (ใช้กับรายงานต่อภาคเรียน)</h2>
      <div class="row">
        <input v-model="sem.name" placeholder="เช่น 2/2569" class="grow" />
        <input v-model="sem.start_date" type="date" class="grow" />
        <input v-model="sem.end_date" type="date" class="grow" />
      </div>
      <button class="btn primary" :disabled="!sem.name || !sem.start_date || !sem.end_date" @click="saveSem">บันทึกภาคเรียน</button>
      <ul class="list">
        <li v-for="s in semesters" :key="s.id">
          <div class="main"><strong>ภาคเรียน {{ s.name }}</strong><span class="small muted">{{ thaiDate(s.start_date, false) }} – {{ thaiDate(s.end_date, false) }}</span></div>
          <button class="btn sm danger" @click="removeSem(s)">ลบ</button>
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { api } from '../../api';
import { thaiDate, serverToday, addDays } from '../../util';

const TYPES = [
  { value: 'holiday', label: 'วันหยุด', hint: 'ปิดภาคเรียน หยุดพิเศษ', cls: 'muted' },
  { value: 'public_holiday', label: 'วันหยุดนักขัตฤกษ์', hint: 'วันหยุดราชการตามประกาศ', cls: 'bad' },
  { value: 'cancelled', label: 'งดเข้าแถว', hint: 'ฝนตก ประชุม ฯลฯ', cls: 'warn' },
  { value: 'special', label: 'กิจกรรมพิเศษ', hint: 'นับเป็นวันเข้าแถว เช็กชื่อตามปกติ', cls: 'info' },
  { value: 'normal', label: 'มีเข้าแถว (วันพิเศษ)', hint: 'เช่น เข้าแถววันเสาร์', cls: 'ok' },
];
const TYPE = Object.fromEntries(TYPES.map((t) => [t.value, t]));
const NOTE_HINT = {
  holiday: 'หมายเหตุ เช่น ปิดภาคเรียน',
  public_holiday: 'ชื่อวันหยุด เช่น วันมาฆบูชา',
  cancelled: 'เหตุผล เช่น ฝนตก',
  special: 'ชื่อกิจกรรม เช่น กีฬาสี / ไหว้ครู',
  normal: 'หมายเหตุ',
};
// วันหยุดราชการที่วันที่คงที่ทุกปี
const FIXED = [
  ['01-01', 'วันขึ้นปีใหม่'], ['04-06', 'วันจักรี'], ['04-13', 'วันสงกรานต์'], ['04-14', 'วันสงกรานต์'], ['04-15', 'วันสงกรานต์'],
  ['05-04', 'วันฉัตรมงคล'], ['06-03', 'วันเฉลิมพระชนมพรรษาสมเด็จพระราชินี'], ['07-28', 'วันเฉลิมพระชนมพรรษาพระบาทสมเด็จพระเจ้าอยู่หัว'],
  ['08-12', 'วันแม่แห่งชาติ'], ['10-13', 'วันนวมินทรมหาราช'], ['10-23', 'วันปิยมหาราช'], ['12-05', 'วันพ่อแห่งชาติ'],
  ['12-10', 'วันรัฐธรรมนูญ'], ['12-31', 'วันสิ้นปี'],
];

const status = ref('holiday');
const from = ref('');
const to = ref('');
const note = ref('');
const daysList = ref([]);
const semesters = ref([]);
const sem = ref({ name: '', start_date: '', end_date: '' });
const error = ref('');
const notice = ref('');
const busy = ref(false);
const filter = ref('');
const year = ref(new Date().getFullYear());
const picked = ref([]);

const years = computed(() => { const y = new Date().getFullYear(); return [y - 1, y, y + 1]; });
const holidays = computed(() => FIXED.map(([md, n]) => ({ day: `${year.value}-${md}`, note: n })));
const existing = computed(() => Object.fromEntries(daysList.value.map((d) => [d.day, d.status])));
const shownDays = computed(() => daysList.value.filter((d) => !filter.value || d.status === filter.value));
const rangeDays = computed(() => {
  if (!from.value) return [];
  const end = to.value && to.value > from.value ? to.value : from.value;
  const out = [];
  for (let d = from.value; d <= end && out.length <= 121; d = addDays(d, 1)) out.push(d);
  return out;
});
const isWeekend = (d) => [0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay());

watch([year, daysList], () => { picked.value = holidays.value.filter((h) => !existing.value[h.day]).map((h) => h.day); }, { immediate: true });

async function load() {
  try {
    const t = await serverToday();
    if (!from.value) from.value = t;
    const [d, s] = await Promise.all([api(`/api/admin/assembly-days?from=${addDays(t, -200)}`), api('/api/reports/semesters')]);
    daysList.value = d.items.reverse();
    semesters.value = s.items;
  } catch (e) {
    error.value = e.message;
  }
}

async function run(fn, msg) {
  error.value = '';
  notice.value = '';
  busy.value = true;
  try { await fn(); notice.value = msg || ''; await load(); } catch (e) { error.value = e.message; } finally { busy.value = false; }
}

const saveRange = () => {
  const items = rangeDays.value.map((day) => ({ day, status: status.value, note: note.value }));
  const overwrite = items.filter((i) => existing.value[i.day]).length;
  if (overwrite && !confirm(`มี ${overwrite} วันที่ตั้งไว้แล้ว จะถูกแทนที่ด้วย "${TYPE[status.value].label}" ต่อหรือไม่?`)) return;
  return run(async () => {
    await api('/api/admin/assembly-days/bulk', { method: 'POST', body: { items } });
    note.value = '';
    to.value = '';
  }, `บันทึก "${TYPE[status.value].label}" ${items.length} วันแล้ว`);
};
const addHolidays = () => run(async () => {
  const items = holidays.value.filter((h) => picked.value.includes(h.day)).map((h) => ({ ...h, status: 'public_holiday' }));
  await api('/api/admin/assembly-days/bulk', { method: 'POST', body: { items } });
}, `เพิ่มวันหยุดนักขัตฤกษ์ ${picked.value.length} วันแล้ว`);
const removeDay = (d) => run(() => api(`/api/admin/assembly-days/${d}`, { method: 'DELETE' }), 'ลบแล้ว');
const saveSem = () => run(async () => {
  await api('/api/admin/semesters', { method: 'POST', body: sem.value });
  sem.value = { name: '', start_date: '', end_date: '' };
});
const removeSem = (s) => { if (confirm(`ลบภาคเรียน ${s.name}?`)) run(() => api(`/api/admin/semesters/${s.id}`, { method: 'DELETE' })); };

onMounted(load);
</script>

<style scoped>
.types { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 8px; }
.type { position: relative; display: flex; flex-direction: column; gap: 2px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 12px; cursor: pointer; }
.type input { position: absolute; opacity: 0; pointer-events: none; }
.type .small { color: var(--muted); }
.type.on { border-width: 2px; padding: 9px 11px; }
.type.on.muted { border-color: var(--muted); }
.type.on.bad { border-color: var(--bad); background: var(--bad-bg); }
.type.on.warn { border-color: var(--warn); background: var(--warn-bg); }
.type.on.info { border-color: var(--info); background: var(--info-bg); }
.type.on.ok { border-color: var(--ok); background: var(--ok-bg); }
.type:focus-within { outline: 2px solid var(--brand-2); outline-offset: 2px; }
</style>
