<template>
  <div>
    <h1>เอกสารรายงานเสนอลงนาม</h1>
    <div v-if="error" class="alert bad">{{ error }}</div>

    <form v-if="canCreate" class="card stack" @submit.prevent="create">
      <h3>สร้างรายงานสรุปการปฏิบัติงานประจำวัน</h3>
      <p class="small muted">ระบบสร้างแบบ “สรุปการปฏิบัติงานของข้าราชการครู และบุคลากรทางการศึกษา” จากข้อมูลจริง ตัวเลขถูกตรึงไว้ ณ เวลาที่สร้าง
        แล้วส่งให้ผู้ลงนามตามลำดับ: {{ stepsText }}</p>
      <div class="row" style="align-items:flex-end;flex-wrap:wrap">
        <label class="field grow"><span>ประจำวันที่</span><input v-model="day" type="date" required /></label>
        <button class="btn primary" :disabled="busy">สร้างและส่งลงนาม</button>
      </div>
      <router-link to="/hr" class="btn">🗂 บันทึกลา / ราชการ / มาสาย ก่อนสร้าง (งานบุคลากรประจำวัน) ›</router-link>
    </form>

    <button v-if="returnedMine.length && filter !== 'returned'" type="button" class="card back-banner" @click="filter = 'returned'">
      <span class="ico" aria-hidden="true">↩</span>
      <span class="grow"><b>มีเอกสารถูกส่งกลับแก้ไข {{ returnedMine.length }} ฉบับ</b><br />
        <span class="small">แตะเพื่อดู แล้วเปิดเอกสาร → “จัดการเอกสาร” → แก้ข้อมูล → “ดึงข้อมูลล่าสุดแล้วส่งลงนามใหม่”</span></span>
      <span class="go">ดู ›</span>
    </button>
    <div class="tabs">
      <button v-for="t in filters" :key="t.k" :class="{ on: filter === t.k, alert: t.k === 'returned' && count(t.k) }" @click="filter = t.k">
        {{ t.label }}<i v-if="t.k !== 'all' && count(t.k)" class="n">{{ count(t.k) }}</i></button>
    </div>
    <p v-if="shown.length" class="small muted hint">กดที่เอกสารเพื่อเปิดดู ลงนาม หรือพิมพ์</p>
    <ul class="docs">
      <li v-for="d in shown" :key="d.id" class="doc" :class="{ turn: d.myTurn, back: d.status === 'returned' }">
        <router-link :to="`/report-docs/${d.id}`" class="open">
          <span class="ico" aria-hidden="true">📄</span>
          <span class="main">
            <strong>{{ d.title }}</strong>
            <span class="small muted">{{ d.kind === 'hr_daily' ? thaiDate(d.period_from) : thaiRange(d.period_from, d.period_to) }} · สร้างโดย {{ d.created_by_name }}
              <template v-if="d.waitingFor"> · รอ {{ d.waitingFor }}</template></span>
            <span v-if="d.returnedBy" class="small why">↩ ส่งกลับโดย {{ d.returnedBy.name }}: “{{ d.returnedBy.comment }}”</span>
            <span class="badges">
              <span v-if="d.is_demo" class="badge muted">จำลอง</span>
              <span v-if="d.myTurn" class="badge warn">รอท่านลงนาม</span>
              <span class="badge" :class="STATUS_CLS[d.status]">{{ STATUS_TXT[d.status] }}{{ d.status === 'pending' ? ` ${d.current_step}/3` : '' }}</span>
            </span>
          </span>
          <span class="go">{{ d.myTurn ? 'ลงนาม' : d.status === 'returned' && d.canEdit ? 'แก้ไข' : 'เปิดดู' }} ›</span>
        </router-link>
        <div v-if="d.canEdit || d.canDelete" class="acts">
          <router-link v-if="d.canEdit" :to="`/report-docs/${d.id}#manage`" class="btn sm">✏️ แก้ไข</router-link>
          <button v-if="d.canDelete" type="button" class="btn sm danger" :disabled="busy" @click="removeDoc(d)">🗑 ลบ</button>
        </div>
      </li>
      <li v-if="!shown.length" class="card muted">{{ filter === 'returned' ? 'ไม่มีเอกสารที่ถูกส่งกลับแก้ไข' : filter === 'mine' ? 'ไม่มีเอกสารรอท่านลงนาม' : 'ยังไม่มีเอกสาร' }}</li>
    </ul>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';
import { askPassword } from '../confirm';
import { thaiDate, thaiRange, serverToday } from '../util';

const router = useRouter();
const STATUS_TXT = { pending: 'รอลงนาม', approved: 'อนุมัติแล้ว', returned: 'ส่งกลับแก้ไข' };
const STATUS_CLS = { pending: 'info', approved: 'ok', returned: 'bad' };
const items = ref([]);
const canCreate = ref(false);
const stepsText = ref('');
const day = ref('');
const busy = ref(false);
const error = ref('');
const filter = ref('all');
const filters = [{ k: 'all', label: 'ทั้งหมด' }, { k: 'mine', label: 'รอท่านลงนาม' }, { k: 'pending', label: 'รอลงนาม' }, { k: 'approved', label: 'อนุมัติแล้ว' }, { k: 'returned', label: 'ส่งกลับ' }];
const match = (d, k) => k === 'all' || (k === 'mine' ? d.myTurn : d.status === k);
const shown = computed(() => items.value.filter((d) => match(d, filter.value)));
const count = (k) => items.value.filter((d) => match(d, k)).length;
const returnedMine = computed(() => items.value.filter((d) => d.status === 'returned' && d.canEdit));

async function load() {
  try {
    const r = await api('/api/report-docs');
    items.value = r.items;
    canCreate.value = r.canCreate;
    if (r.items.some((d) => d.myTurn)) filter.value = 'mine';
    else if (r.items.some((d) => d.status === 'returned' && d.canEdit)) filter.value = 'returned';
  } catch (e) { error.value = e.message; }
}

async function create() {
  busy.value = true;
  error.value = '';
  try {
    const d = await api('/api/report-docs', { method: 'POST', body: { day: day.value } });
    router.push(`/report-docs/${d.id}`);
  } catch (e) { error.value = e.message; } finally { busy.value = false; }
}

async function removeDoc(d) {
  const password = await askPassword('ยืนยันการลบเอกสาร', { detail: `${d.title} — ลบแล้วกู้คืนไม่ได้ (ยกเว้นกู้จากข้อมูลสำรอง)`, danger: true });
  if (!password) return;
  busy.value = true;
  error.value = '';
  try {
    await api(`/api/report-docs/${d.id}`, { method: 'DELETE', body: { password } });
    await load();
  } catch (e) { error.value = e.message; } finally { busy.value = false; }
}

onMounted(async () => {
  day.value = await serverToday();
  await load();
  try {
    const s = await api('/api/admin/settings').catch(() => null);
    if (s) stepsText.value = [1, 2, 3].map((n) => s[`sign_step${n}_title`]).join(' → ');
  } catch { /* ไม่ใช่ผู้ดูแล */ }
  if (!stepsText.value) stepsText.value = 'ผู้รายงาน → ผู้ตรวจสอบ → ผู้อำนวยการ';
});
</script>

<style scoped>
.hint { margin: 4px 2px 8px; }
.back-banner { display: flex; align-items: center; gap: 12px; width: 100%; text-align: left; font: inherit; color: var(--bad); background: var(--bad-bg, #fdecea);
  border: 1px solid var(--bad); cursor: pointer; margin-bottom: 10px; }
.back-banner .ico { font-size: 1.4rem; width: 40px; height: 40px; border-radius: 50%; background: var(--bad); color: #fff; display: flex; align-items: center; justify-content: center; flex: none; }
.back-banner .go { background: var(--bad); color: #fff; }
.tabs .n { font-style: normal; margin-left: 6px; background: var(--line); border-radius: 10px; padding: 0 7px; font-size: .75rem; }
.tabs button.alert .n { background: var(--bad); color: #fff; }
.tabs button.alert:not(.on) { border-color: var(--bad); color: var(--bad); }
.doc.back { border-left: 5px solid var(--bad); }
.why { color: var(--bad); }
.docs { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
.doc { background: var(--card); border: 1px solid var(--line); border-radius: 14px; box-shadow: var(--shadow); overflow: hidden; transition: border-color .15s, box-shadow .15s, transform .15s; }
.doc:hover, .doc:focus-within { border-color: var(--brand-2); box-shadow: 0 4px 14px rgba(30, 80, 160, .15); }
.doc:active { transform: scale(.995); }
.doc.turn { border-left: 5px solid var(--warn); }
.open { display: flex; align-items: center; gap: 12px; padding: 12px 14px; color: inherit; text-decoration: none; cursor: pointer; }
.open .ico { flex: none; width: 40px; height: 40px; border-radius: 10px; background: var(--info-bg); display: flex; align-items: center; justify-content: center; font-size: 1.2rem; }
.open .main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.badges { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
.go { flex: none; font-weight: 700; color: var(--brand-2); white-space: nowrap; padding: 6px 12px; border-radius: 999px; background: var(--info-bg); }
.doc:hover .go { background: var(--brand-2); color: #fff; }
.acts { display: flex; gap: 8px; justify-content: flex-end; padding: 0 14px 10px; }
@media (max-width: 520px) { .go { padding: 4px 8px; font-size: .85rem; } .open .ico { display: none; } }
</style>
