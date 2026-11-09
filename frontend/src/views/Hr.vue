<template>
  <div>
    <h1>งานบุคลากรประจำวัน</h1>
    <div v-if="fixDoc" class="alert warn fixbar">
      <b>✏️ กำลังแก้ไขเอกสารเลขที่ {{ fixDoc.id }}</b>{{ fixDoc.status === 'returned' ? ' (ถูกส่งกลับแก้ไข)' : '' }}
      <span v-if="fixReturn" class="small"><br />เหตุผล: “{{ fixReturn }}”</span>
      <span class="small"><br />แก้สถานะ / มาสาย / ประเภทบุคลากร ด้านล่าง (เปลี่ยนวันที่ได้) แล้วกดปุ่มนี้หรือปุ่มท้ายหน้า</span>
      <div class="row" style="margin-top:8px;flex-wrap:wrap">
        <router-link class="btn sm" :to="`/report-docs/${fixDoc.id}`">‹ กลับไปเอกสาร</router-link>
        <button type="button" class="btn sm primary" :disabled="busy" @click="resubmit">💾 บันทึกการแก้ไขและส่งลงนามใหม่</button>
      </div>
    </div>
    <p class="small muted tip">📱 ครูมือถือเสีย / เช็กชื่อเองไม่ได้: แท็บรายชื่อ → แตะเลือกชื่อ → <b>ตั้งสถานะ</b> → <b>มา (เช็กชื่อแทน)</b> ระบุเหตุผลในหมายเหตุ เช่น “มือถือเสีย”</p>

    <section class="card daybar">
      <button type="button" class="btn sm" aria-label="วันก่อนหน้า" @click="shift(-1)">‹</button>
      <label class="grow dpick"><span class="small muted">วันที่</span>
        <input v-model="day" type="date" :max="maxDay" @change="onDay" /></label>
      <button type="button" class="btn sm" aria-label="วันถัดไป" :disabled="day >= maxDay" @click="shift(1)">›</button>
    </section>
    <p v-if="view" class="small" style="margin:-6px 4px 12px">
      <b>{{ thaiDate(day) }}</b> ·
      <span :class="view.isWorkDay ? 'okc' : 'badc'">{{ view.isWorkDay ? 'วันทำงาน' : 'วันหยุด' }}</span>
      <template v-if="view.isWorkDay"> · {{ view.isAssemblyDay ? 'มีกิจกรรมหน้าเสาธง' : 'งดกิจกรรมหน้าเสาธง' }}</template>
      <template v-if="view.dayNote"> · {{ view.dayNote }}</template>
    </p>

    <div v-if="error" class="alert bad" style="white-space:pre-line">{{ error }}</div>
    <div v-if="message" class="alert ok">{{ message }}</div>

    <div v-if="view" class="tiles">
      <div class="t"><b>{{ counts.total }}</b><span>บุคลากร</span></div>
      <div class="t"><b class="c-info">{{ counts.official }}</b><span>ไปราชการ</span></div>
      <div class="t"><b class="c-info2">{{ counts.policy }}</b><span>งานนโยบาย</span></div>
      <div class="t"><b class="c-muted">{{ counts.leave }}</b><span>ลา</span></div>
      <div class="t"><b class="c-warn">{{ counts.late }}</b><span>มาสาย</span></div>
    </div>

    <div class="tabs" role="tablist">
      <button v-for="t in TABS" :key="t.k" role="tab" :aria-selected="tab === t.k" :class="{ on: tab === t.k }" @click="tab = t.k">
        {{ t.label }}<i v-if="t.k === 'types' && unclassified" class="dot">{{ unclassified }}</i></button>
    </div>

    <template v-if="view">
      <input v-model.trim="q" class="search" placeholder="ค้นหาชื่อ แผนก หรือประเภท" />

      <!-- สถานะลา / ราชการ / นโยบาย -->
      <section v-if="tab === 'status'" class="card">
        <div class="chips">
          <button v-for="f in FILTERS" :key="f.k" type="button" :class="{ on: filter === f.k }" @click="filter = f.k">{{ f.label }}</button>
        </div>
        <ul class="plist">
          <li v-for="p in statusList" :key="p.id" :class="{ sel: picked.includes(p.id) }" @click="togglePick(p.id)">
            <input type="checkbox" :checked="picked.includes(p.id)" :aria-label="`เลือก ${p.full_name}`" @click.stop="togglePick(p.id)" />
            <div class="grow pn">
              <b>{{ p.full_name }}</b>
              <span class="small muted">{{ p.short || 'ยังไม่กำหนดประเภท' }} · {{ p.department || '-' }}</span>
              <span v-if="p.note && p.status" class="small note">{{ p.note }}</span>
            </div>
            <span v-if="p.status" class="badge" :class="STATUS[p.status]?.cls">{{ statusLabel(p) }}</span>
          </li>
          <li v-if="!statusList.length" class="muted small">ไม่พบรายชื่อ</li>
        </ul>
      </section>

      <!-- มาสาย / ไม่ลงเวลากลับ -->
      <section v-if="tab === 'marks'" class="card stack">
        <p class="small muted" style="margin:0">ข้อมูลจากเครื่องลงเวลา — แตะเพื่อเลือกคนที่ <b>มาลงเวลาเกินเวลากำหนด</b> หรือ <b>ไม่ลงเวลากลับ</b> ของวันนี้ แล้วกดบันทึก</p>
        <ul class="plist">
          <li v-for="p in markList" :key="p.id" class="nohover">
            <div class="grow pn"><b>{{ p.full_name }}</b><span class="small muted">{{ p.short || '-' }} · {{ p.department || '-' }}</span></div>
            <button type="button" class="mk" :class="{ on: marks.late.includes(p.id) }" :aria-pressed="marks.late.includes(p.id)" @click="toggleMark('late', p.id)">มาสาย</button>
            <button type="button" class="mk" :class="{ on: marks.no_signout.includes(p.id) }" :aria-pressed="marks.no_signout.includes(p.id)" @click="toggleMark('no_signout', p.id)">ไม่ลงเวลากลับ</button>
          </li>
        </ul>
        <button class="btn primary" :disabled="busy || !marksDirty" @click="saveMarks">
          บันทึก (มาสาย {{ marks.late.length }} · ไม่ลงเวลากลับ {{ marks.no_signout.length }})</button>
      </section>

      <!-- ประเภทบุคลากร -->
      <section v-if="tab === 'types'" class="card">
        <p class="small muted" style="margin:0 0 8px">ใช้นับจำนวนในข้อ 1 ของรายงาน · เลือกแล้วบันทึกทันที · กำหนดทีละมากด้วย Excel ได้ที่ <b>นำเข้า/ส่งออกผู้ใช้</b> (ผู้ดูแลระบบ)</p>
        <label class="chk"><input v-model="onlyUnclassified" type="checkbox" /> แสดงเฉพาะคนที่ยังไม่กำหนด ({{ unclassified }} คน)</label>
        <ul class="plist">
          <li v-for="p in typeList" :key="p.id" class="nohover">
            <div class="grow pn"><b>{{ p.full_name }}</b><span class="small muted">{{ p.position_title || '-' }} · {{ p.department || '-' }}</span></div>
            <select :value="p.staff_type || ''" :aria-label="`ประเภทบุคลากรของ ${p.full_name}`" @change="setType(p, $event.target.value)">
              <option value="">— ยังไม่กำหนด —</option>
              <option v-for="t in meta.staffTypes" :key="t.code" :value="t.code">{{ t.no }} {{ t.label }}</option>
            </select>
          </li>
        </ul>
      </section>

      <!-- สร้างรายงาน -->
      <section class="card stack report">
        <h3 style="margin:0">รายงานสรุปการปฏิบัติงานประจำวัน</h3>
        <p class="small muted" style="margin:0">ตรวจสถานะ มาสาย/ไม่ลงเวลากลับ และประเภทบุคลากรให้ครบก่อน ตัวเลขในเอกสารถูกตรึง ณ เวลาที่สร้าง แล้วส่งให้ ผู้รายงาน → ผู้ตรวจสอบ → ผู้อำนวยการ</p>
        <div v-if="preview" class="stack">
          <div v-for="w in preview.warnings" :key="w" class="alert warn small" style="margin:0">⚠ {{ w }}</div>
          <p class="small" style="margin:0">บุคลากรรวม <b>{{ preview.snapshot.total }}</b> คน · มาปฏิบัติงาน <b>{{ preview.snapshot.worked }}</b> · ไม่มาปฏิบัติงาน <b>{{ preview.snapshot.notWorked }}</b>
            · ไม่เข้ากิจกรรมหน้าเสาธง <b>{{ preview.snapshot.assembly.held ? preview.snapshot.assembly.list.length : '-' }}</b></p>
        </div>
        <div class="row" style="flex-wrap:wrap">
          <button class="btn grow" :disabled="busy" @click="checkPreview">ตรวจตัวเลขก่อนสร้าง</button>
          <template v-if="fixDoc">
            <router-link class="btn grow" :to="`/report-docs/${fixDoc.id}`">‹ กลับไปเอกสาร</router-link>
            <button class="btn primary grow" :disabled="busy" @click="resubmit">💾 บันทึกการแก้ไขและส่งลงนามใหม่</button>
          </template>
          <router-link v-else-if="preview?.existingId" class="btn grow" :to="`/report-docs/${preview.existingId}`">เปิดรายงานของวันนี้ ›</router-link>
          <button v-else class="btn primary grow" :disabled="busy" @click="createDoc">สร้างและส่งลงนาม</button>
        </div>
      </section>
    </template>

    <!-- แถบบันทึกสถานะ (เมื่อเลือกคน) -->
    <div v-if="tab === 'status' && picked.length" class="selbar">
      <b class="grow">เลือก {{ picked.length }} คน</b>
      <button type="button" class="btn sm" @click="picked = []">ล้าง</button>
      <button type="button" class="btn sm primary" @click="sheet = true">ตั้งสถานะ ›</button>
    </div>
    <div v-if="sheet && picked.length" class="modal-back" @click.self="sheet = false">
      <div class="modal stack actionbar" role="dialog" aria-modal="true" aria-label="ตั้งสถานะ">
        <div class="ab-head">
          <b>ตั้งสถานะให้ {{ picked.length }} คน</b>
          <button type="button" class="btn sm" @click="sheet = false">ปิด</button>
        </div>
        <p class="small muted" style="margin:0">{{ pickedNames }}</p>
        <div class="st">
          <button v-for="s in SETS" :key="s.k" type="button" :class="[{ on: setTo === s.k }, s.cls]" @click="setTo = s.k">{{ s.label }}</button>
        </div>
        <div class="row" style="flex-wrap:wrap;gap:8px">
          <label class="field grow"><span>ตั้งแต่</span><input v-model="from" type="date" /></label>
          <label class="field grow"><span>ถึง</span><input v-model="to" type="date" :min="from" /></label>
        </div>
        <label class="field" :class="{ need: needNote && !note, done: needNote && note }">
          <span v-if="needNote">รายละเอียด<b class="req">* จำเป็นต้องกรอก</b></span>
          <span v-else>หมายเหตุ (ไม่บังคับ)</span>
          <input ref="noteEl" v-model.trim="note" maxlength="500" :required="needNote" :aria-invalid="needNote && !note"
            :placeholder="needNote ? (setTo === 'official' ? 'เช่น ประชุมที่ สอศ. ตามคำสั่งที่ 123/2569' : 'เช่น ออกหน่วย Fix It Center ตามนโยบายวิทยาลัย') : setTo === 'present' ? 'เช่น มือถือเสีย / ลืมเช็กชื่อ (มาปฏิบัติงานจริง)' : ''" />
          <small v-if="needNote && !note" class="need-msg">⚠ “{{ setLabel }}” ต้องระบุสถานที่ / เรื่อง หรือเลขที่คำสั่ง ก่อนจึงบันทึกได้ — ข้อความนี้จะแสดงในรายงานเสนอผู้บริหาร</small>
        </label>
        <button class="btn primary block" :disabled="busy || !setTo || (needNote && !note)" @click="saveStatus">
          {{ needNote && !note ? 'กรอกรายละเอียดก่อนบันทึก' : `บันทึก${setLabel ? ` "${setLabel}"` : ''}` }}</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api';
import { STATUS, statusLabel, thaiDate, serverToday, addDays } from '../util';

const router = useRouter();
const route = useRoute();
// เปิดจากเอกสารที่ต้องแก้ไข (/hr?day=...&doc=...)
const fixDoc = ref(null);
const fixReturn = computed(() => {
  const r = fixDoc.value?.status === 'returned' && [...fixDoc.value.signatures].reverse().find((s) => s.action === 'return');
  return r ? `${r.comment} — ${r.signer_name}` : '';
});
const TABS = [{ k: 'status', label: 'ลา / ราชการ / นโยบาย' }, { k: 'marks', label: 'มาสาย / ไม่ลงเวลากลับ' }, { k: 'types', label: 'ประเภทบุคลากร' }];
const FILTERS = [{ k: 'all', label: 'ทั้งหมด' }, { k: 'set', label: 'มีสถานะแล้ว' }, { k: 'teach', label: 'ข้าราชการ/พนักงานราชการ' }, { k: 'temp', label: 'ลูกจ้างชั่วคราว' }];
const SETS = [
  { k: 'official', label: 'ไปราชการ', cls: 'info' },
  { k: 'policy', label: 'งานนโยบาย', cls: 'info2' },
  { k: 'leave:sick', label: 'ลาป่วย', cls: 'muted' },
  { k: 'leave:personal', label: 'ลากิจ', cls: 'muted' },
  { k: 'leave:other', label: 'ลาอื่น ๆ', cls: 'muted' },
  { k: 'present', label: 'มา (เช็กชื่อแทน)', cls: 'ok' },
  { k: 'clear', label: 'ล้างสถานะ', cls: 'bad' },
];

const today = ref('');
const day = ref('');
const view = ref(null);
const meta = ref({ staffTypes: [] });
const tab = ref('status');
const q = ref('');
const filter = ref('all');
const picked = ref([]);
const setTo = ref('');
const from = ref('');
const to = ref('');
const note = ref('');
const marks = ref({ late: [], no_signout: [] });
const savedMarks = ref('');
const onlyUnclassified = ref(false);
const preview = ref(null);
const sheet = ref(false);
const busy = ref(false);
const error = ref('');
const message = ref('');

const maxDay = computed(() => (today.value ? addDays(today.value, 60) : ''));
const needNote = computed(() => ['official', 'policy'].includes(setTo.value));
const pickedNames = computed(() => people.value.filter((p) => picked.value.includes(p.id)).map((p) => p.full_name).join(', '));
const setLabel = computed(() => SETS.find((s) => s.k === setTo.value)?.label || '');
const people = computed(() => view.value?.people || []);
const unclassified = computed(() => people.value.filter((p) => !p.staff_type).length);
const counts = computed(() => ({
  total: people.value.filter((p) => p.staff_type).length,
  official: people.value.filter((p) => p.status === 'official').length,
  policy: people.value.filter((p) => p.status === 'policy').length,
  leave: people.value.filter((p) => p.status === 'leave').length,
  late: marks.value.late.length,
}));
const match = (p) => !q.value || `${p.full_name} ${p.department || ''} ${p.short || ''}`.toLowerCase().includes(q.value.toLowerCase());
const statusList = computed(() => people.value.filter((p) => match(p) && (
  filter.value === 'all'
  || (filter.value === 'set' && ['official', 'policy', 'leave'].includes(p.status))
  || (filter.value === 'temp' && p.staff_type?.startsWith('temp_'))
  || (filter.value === 'teach' && p.staff_type && !p.staff_type.startsWith('temp_') && p.staff_type !== 'trainee'))));
const markList = computed(() => people.value.filter(match)
  .sort((a, b) => Number(marks.value.late.includes(b.id) || marks.value.no_signout.includes(b.id)) - Number(marks.value.late.includes(a.id) || marks.value.no_signout.includes(a.id))));
const typeList = computed(() => people.value.filter((p) => match(p) && (!onlyUnclassified.value || !p.staff_type)));
const marksDirty = computed(() => JSON.stringify(marks.value) !== savedMarks.value);

async function run(fn) {
  busy.value = true;
  error.value = '';
  message.value = '';
  try { await fn(); } catch (e) { error.value = e.message; } finally { busy.value = false; }
}

const loadedDay = ref('');
// โหลดใหม่เฉพาะเมื่อวันที่เปลี่ยนจริง (บางเบราว์เซอร์ส่ง change ซ้ำตอนช่องวันที่เสียโฟกัส ทำให้รายการที่เพิ่งเลือกหาย)
function onDay() {
  if (day.value && day.value !== loadedDay.value) load();
}

async function load() {
  loadedDay.value = day.value;
  preview.value = null;
  picked.value = [];
  from.value = day.value;
  to.value = day.value;
  await run(async () => {
    view.value = await api(`/api/hr/day/${day.value}`);
    marks.value = {
      late: view.value.people.filter((p) => p.late).map((p) => p.id),
      no_signout: view.value.people.filter((p) => p.no_signout).map((p) => p.id),
    };
    savedMarks.value = JSON.stringify(marks.value);
    if (unclassified.value && !onlyUnclassified.value && tab.value === 'types') onlyUnclassified.value = true;
  });
}

function shift(n) {
  day.value = addDays(day.value, n);
  load();
}

function togglePick(id) {
  picked.value = picked.value.includes(id) ? picked.value.filter((x) => x !== id) : [...picked.value, id];
}

function toggleMark(kind, id) {
  const list = marks.value[kind];
  marks.value = { ...marks.value, [kind]: list.includes(id) ? list.filter((x) => x !== id) : [...list, id] };
}

function saveStatus() {
  return run(async () => {
    const [status, leaveType] = setTo.value.split(':');
    const r = await api('/api/hr/status', { method: 'POST', body: { userIds: picked.value, from: from.value, to: to.value, status, leaveType, note: note.value } });
    const n = picked.value.length;
    await load();
    message.value = `บันทึก "${SETS.find((s) => s.k === setTo.value)?.label}" ให้ ${n} คน ${r.days.length} วันทำงาน (เปลี่ยน ${r.changed} รายการ)`;
    setTo.value = '';
    note.value = '';
    sheet.value = false;
  });
}

function saveMarks() {
  return run(async () => {
    await api(`/api/hr/marks/${day.value}/late`, { method: 'PUT', body: { userIds: marks.value.late } });
    await api(`/api/hr/marks/${day.value}/no_signout`, { method: 'PUT', body: { userIds: marks.value.no_signout } });
    savedMarks.value = JSON.stringify(marks.value);
    preview.value = null;
    message.value = `บันทึกแล้ว: มาสาย ${marks.value.late.length} คน · ไม่ลงเวลากลับ ${marks.value.no_signout.length} คน`;
  });
}

async function setType(p, code) {
  await run(async () => {
    await api(`/api/hr/users/${p.id}/staff-type`, { method: 'PATCH', body: { staffType: code || null } });
    p.staff_type = code || null;
    p.short = meta.value.staffTypes.find((t) => t.code === code)?.short || '';
    preview.value = null;
  });
}

function checkPreview() {
  return run(async () => {
    if (marksDirty.value) throw new Error('ยังไม่ได้บันทึกรายชื่อมาสาย/ไม่ลงเวลากลับ');
    preview.value = await api(`/api/report-docs/preview?day=${day.value}`);
  });
}

function createDoc() {
  return run(async () => {
    if (marksDirty.value) throw new Error('ยังไม่ได้บันทึกรายชื่อมาสาย/ไม่ลงเวลากลับ');
    const d = await api('/api/report-docs', { method: 'POST', body: { day: day.value } });
    router.push(`/report-docs/${d.id}`);
  });
}

watch(tab, () => { q.value = ''; });
// เลือกไปราชการ / งานนโยบาย → พาไปช่องรายละเอียดทันที
const noteEl = ref(null);
watch(setTo, (v) => { if (['official', 'policy'].includes(v) && !note.value) setTimeout(() => noteEl.value?.focus(), 50); });

async function resubmit() {
  if (!window.confirm(`ส่งเอกสารเลขที่ ${fixDoc.value.id} ลงนามใหม่ด้วยข้อมูลของวันที่ ${thaiDate(day.value)}?\nเริ่มลงนามตั้งแต่ลำดับที่ 1`)) return;
  busy.value = true;
  error.value = '';
  try {
    const body = { refresh: true, ...(day.value !== fixDoc.value.period_from ? { day: day.value } : {}) };
    await api(`/api/report-docs/${fixDoc.value.id}`, { method: 'PATCH', body });
    router.push(`/report-docs/${fixDoc.value.id}`);
  } catch (e) { error.value = e.message; } finally { busy.value = false; }
}

onMounted(async () => {
  today.value = await serverToday();
  day.value = /^\d{4}-\d{2}-\d{2}$/.test(String(route.query.day || '')) && route.query.day <= today.value ? String(route.query.day) : today.value;
  if (route.query.doc) {
    try {
      const d = await api(`/api/report-docs/${route.query.doc}`);
      if (d.canEdit && d.kind === 'hr_daily') fixDoc.value = d;
    } catch { /* ไม่มีสิทธิ์หรือไม่พบ — ใช้หน้าปกติ */ }
  }
  meta.value = await api('/api/hr/meta').catch(() => ({ staffTypes: [] }));
  await load();
});
</script>

<style scoped>
.daybar { display: flex; align-items: center; gap: 8px; padding: 10px 12px; }
.daybar .btn { min-width: 44px; min-height: 44px; font-size: 1.2rem; }
.dpick { display: flex; flex-direction: column; gap: 2px; }
.okc { color: var(--ok); font-weight: 600; } .badc { color: var(--bad); font-weight: 600; }
.tiles { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin-bottom: 12px; }
.t { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 8px 6px; text-align: center; display: flex; flex-direction: column; }
.t b { font-size: 1.35rem; line-height: 1.2; }
.t span { font-size: .72rem; color: var(--muted); }
.c-info { color: var(--info); } .c-info2 { color: #7a5af5; } .c-muted { color: var(--muted); } .c-warn { color: var(--warn); }
.tabs .dot { font-style: normal; margin-left: 6px; background: var(--bad); color: #fff; border-radius: 10px; padding: 0 6px; font-size: .72rem; }
.search { margin-bottom: 10px; }
.chips { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; }
.chips button { min-height: 32px; padding: 0 12px; border-radius: 999px; border: 1px solid var(--line); background: var(--card); color: var(--text); font: inherit; font-size: .82rem; cursor: pointer; }
.chips button.on { background: var(--fill); border-color: var(--fill); color: #fff; }
.plist { list-style: none; margin: 0; padding: 0; max-height: 60vh; overflow: auto; }
.plist li { display: flex; align-items: center; gap: 10px; padding: 9px 6px; border-bottom: 1px solid var(--line); cursor: pointer; border-radius: 8px; }
.plist li.nohover { cursor: default; }
.plist li.sel { background: var(--info-bg); }
.plist li:last-child { border-bottom: 0; }
.plist input[type=checkbox] { flex: none; }
.pn { display: flex; flex-direction: column; min-width: 0; line-height: 1.35; }
.pn .note { color: var(--info); }
.tip { margin: -6px 4px 12px; line-height: 1.5; }
.fixbar { line-height: 1.5; border-left: 4px solid var(--warn); }
.field.need input { border: 2px solid var(--warn); background: var(--warn-bg, #fff8e1); }
.field.need input:focus { outline: 3px solid rgba(237, 108, 2, .25); }
.field.done input { border-color: var(--ok); }
.req { color: var(--bad); margin-left: 6px; font-size: .85rem; }
.need-msg { color: var(--warn); font-weight: 600; line-height: 1.4; }
.mk { flex: none; min-height: 34px; padding: 0 10px; border-radius: 999px; border: 1px solid var(--line); background: var(--card); color: var(--muted); font: inherit; font-size: .8rem; cursor: pointer; }
.mk.on { background: var(--warn-bg); border-color: var(--warn); color: var(--warn); font-weight: 700; }
.plist select { width: auto; max-width: 52%; min-height: 36px; font-size: .85rem; }
.chk { display: flex; gap: 8px; align-items: center; font-size: .9rem; margin-bottom: 6px; }
.report { border-left: 4px solid var(--fill); }
.selbar { position: sticky; bottom: calc(68px + env(safe-area-inset-bottom)); z-index: 5; display: flex; align-items: center; gap: 8px; background: var(--card); border: 2px solid var(--brand-2); border-radius: 14px; padding: 8px 10px 8px 14px; box-shadow: 0 -6px 24px rgba(15, 42, 74, .18); margin-top: 10px; }
.actionbar { display: grid; gap: 10px; }
.actionbar .row .field { flex: 1 1 140px; min-width: 0; }
.actionbar input { min-width: 0; }
.ab-head { display: flex; justify-content: space-between; align-items: center; }
.st { display: flex; flex-wrap: wrap; gap: 6px; }
.st button { min-height: 36px; padding: 0 12px; border-radius: 10px; border: 1px solid var(--line); background: var(--card); color: var(--text); font: inherit; font-size: .88rem; font-weight: 600; cursor: pointer; }
.st button.on { background: var(--fill); border-color: var(--fill); color: #fff; }
.st button.bad:not(.on) { color: var(--bad); }
@media (max-width: 480px) { .tiles { grid-template-columns: repeat(3, 1fr); } .plist select { max-width: 48%; } }
</style>
