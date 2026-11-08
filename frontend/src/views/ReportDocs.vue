<template>
  <div>
    <h1>เอกสารรายงานเสนอลงนาม</h1>
    <div v-if="error" class="alert bad">{{ error }}</div>

    <form v-if="canCreate" class="card stack" @submit.prevent="create">
      <h3>สร้างเอกสารใหม่</h3>
      <p class="small muted">ระบบสร้างแบบบันทึกการเข้าร่วมกิจกรรมหน้าเสาธงจากข้อมูลจริง ตัวเลขในเอกสารถูกตรึงไว้ ณ เวลาที่สร้าง
        แล้วส่งให้ผู้ลงนามตามลำดับ: {{ stepsText }}</p>
      <div class="row">
        <label class="field grow"><span>ตั้งแต่วันที่</span><input v-model="from" type="date" required /></label>
        <label class="field grow"><span>ถึงวันที่</span><input v-model="to" type="date" required /></label>
      </div>
      <label class="field"><span>ชื่อเอกสาร (เว้นว่างได้)</span><input v-model="title" placeholder="เช่น ประจำสัปดาห์ที่ 1 ภาคเรียนที่ 2/2569" /></label>
      <button class="btn primary" :disabled="busy">สร้างและส่งลงนาม</button>
    </form>

    <div class="tabs">
      <button v-for="t in filters" :key="t.k" :class="{ on: filter === t.k }" @click="filter = t.k">{{ t.label }}</button>
    </div>
    <ul class="list card">
      <li v-for="d in shown" :key="d.id" @click="$router.push(`/report-docs/${d.id}`)">
        <div class="main">
          <strong>{{ d.title }}</strong>
          <span class="small muted">{{ thaiRange(d.period_from, d.period_to) }} · สร้างโดย {{ d.created_by_name }}
            <template v-if="d.waitingFor"> · รอ {{ d.waitingFor }}</template></span>
        </div>
        <span v-if="d.is_demo" class="badge muted">จำลอง</span>
        <span v-if="d.myTurn" class="badge warn">รอท่านลงนาม</span>
        <span class="badge" :class="STATUS_CLS[d.status]">{{ STATUS_TXT[d.status] }}{{ d.status === 'pending' ? ` ${d.current_step}/3` : '' }}</span>
      </li>
      <li v-if="!shown.length" class="muted">ยังไม่มีเอกสาร</li>
    </ul>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';
import { thaiDate, thaiRange, serverToday, weekStart, addDays } from '../util';

const router = useRouter();
const STATUS_TXT = { pending: 'รอลงนาม', approved: 'อนุมัติแล้ว', returned: 'ส่งกลับแก้ไข' };
const STATUS_CLS = { pending: 'info', approved: 'ok', returned: 'bad' };
const items = ref([]);
const canCreate = ref(false);
const stepsText = ref('');
const from = ref('');
const to = ref('');
const title = ref('');
const busy = ref(false);
const error = ref('');
const filter = ref('all');
const filters = [{ k: 'all', label: 'ทั้งหมด' }, { k: 'mine', label: 'รอท่านลงนาม' }, { k: 'pending', label: 'รอลงนาม' }, { k: 'approved', label: 'อนุมัติแล้ว' }, { k: 'returned', label: 'ส่งกลับ' }];
const shown = computed(() => items.value.filter((d) => filter.value === 'all' || (filter.value === 'mine' ? d.myTurn : d.status === filter.value)));

async function load() {
  try {
    const r = await api('/api/report-docs');
    items.value = r.items;
    canCreate.value = r.canCreate;
    if (r.items.some((d) => d.myTurn)) filter.value = 'mine';
  } catch (e) { error.value = e.message; }
}

async function create() {
  busy.value = true;
  error.value = '';
  try {
    const d = await api('/api/report-docs', { method: 'POST', body: { from: from.value, to: to.value, title: title.value } });
    router.push(`/report-docs/${d.id}`);
  } catch (e) { error.value = e.message; } finally { busy.value = false; }
}

onMounted(async () => {
  const t = await serverToday();
  // ค่าเริ่มต้น: สัปดาห์ที่แล้ว (จันทร์–ศุกร์)
  from.value = addDays(weekStart(t), -7);
  to.value = addDays(from.value, 4);
  await load();
  try {
    const s = await api('/api/admin/settings').catch(() => null);
    if (s) stepsText.value = [1, 2, 3].map((n) => s[`sign_step${n}_title`]).join(' → ');
  } catch { /* ไม่ใช่ผู้ดูแล */ }
  if (!stepsText.value) stepsText.value = 'ผู้รับรอง 2 ลำดับ → ผู้อำนวยการอนุมัติ';
});
</script>

<style scoped>
.list li { cursor: pointer; }
</style>
