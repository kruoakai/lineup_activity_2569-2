<template>
  <div>
    <h1>ประวัติของฉัน</h1>
    <div class="stats">
      <div class="stat"><b>{{ count.present }}</b><span>มาเข้าแถว</span></div>
      <div class="stat"><b>{{ count.official + count.policy }}</b><span>ราชการ / งานนโยบาย</span></div>
      <div class="stat"><b>{{ count.leave }}</b><span>ลา</span></div>
      <div class="stat"><b>{{ count.pending }}</b><span>รอตรวจสอบ</span></div>
    </div>

    <div class="tabs views" role="tablist" aria-label="มุมมอง">
      <button v-for="t in VIEWS" :key="t.k" role="tab" :aria-selected="view === t.k" :class="{ on: view === t.k }" @click="setView(t.k)">{{ t.label }}</button>
    </div>

    <div v-if="error" class="alert bad">{{ error }}</div>

    <!-- รายการ (แบบเดิม) -->
    <template v-if="view === 'list'">
      <p class="small muted">แสดง 60 วันล่าสุดที่มีบันทึก วันที่ไม่มีบันทึกหลังปิดระบบจะนับเป็น "ขาด" ในรายงาน</p>
      <ul class="list card">
        <li v-for="it in items" :key="it.day">
          <div class="main">
            <strong>{{ thaiDate(it.day) }}</strong>
            <span class="small muted">{{ METHOD[it.method] }} · {{ thaiTime(it.checked_at) }} น.
              <template v-if="it.checked_by_name !== auth.user.full_name"> · โดย {{ it.checked_by_name }}</template></span>
          </div>
          <span class="badge" :class="STATUS[it.status].cls">{{ statusLabel(it) }}</span>
        </li>
        <li v-if="!items.length && !loading" class="muted">ยังไม่มีประวัติ</li>
      </ul>
    </template>

    <!-- มุมมองสถิติ: ใช้ช่วงเวลาร่วมกัน -->
    <template v-else>
      <div v-if="stats" class="range">
        <button v-for="(p, k) in stats.presets" :key="k" type="button" :class="{ on: range === k }" @click="pick(k)">{{ p.label }}</button>
      </div>
      <p v-if="stats" class="small muted" style="margin:0 2px 10px">
        {{ thaiRange(stats.from, stats.to) }} · วันเข้าแถวที่นับแล้ว {{ counted.length }} วัน
        <template v-if="!stats.mustAssemble"> · บัญชีนี้ไม่อยู่ในเกณฑ์ต้องเข้าแถว</template>
      </p>
      <div v-if="sLoading" class="card muted">กำลังโหลด…</div>
      <template v-else-if="stats">
        <StatsCalendar v-if="view === 'calendar'" :days="daily" :today="stats.today" />
        <StatsMonthly v-else-if="view === 'monthly'" :days="daily" />
        <StatsTiming v-else :days="daily" :open-time="stats.openTime" :close-time="stats.closeTime" />
      </template>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { api, auth } from '../api';
import { STATUS, METHOD, statusLabel, thaiDate, thaiTime, thaiRange } from '../util';
import StatsCalendar from '../components/stats/StatsCalendar.vue';
import StatsMonthly from '../components/stats/StatsMonthly.vue';
import StatsTiming from '../components/stats/StatsTiming.vue';

const VIEWS = [
  { k: 'list', label: '📋 รายการ' },
  { k: 'calendar', label: '📅 ปฏิทิน' },
  { k: 'monthly', label: '📊 รายเดือน' },
  { k: 'timing', label: '⏰ เวลาเช็กชื่อ' },
];
const PREF = 'history-view';
const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* ไม่มี storage */ } } };

const items = ref([]);
const loading = ref(true);
const error = ref('');
const view = ref(VIEWS.some((v) => v.k === store.get(PREF)) ? store.get(PREF) : 'list');
const stats = ref(null);
const sLoading = ref(false);
const range = ref(store.get(`${PREF}-range`) || 'semester');

const count = computed(() => {
  const c = { present: 0, official: 0, policy: 0, leave: 0, pending: 0, absent: 0 };
  for (const it of items.value) c[it.status] += 1;
  return c;
});

// รวมข้อมูลรายวัน: บันทึกจริง หรือ "ขาด" เมื่อเป็นวันเข้าแถวที่ปิดระบบแล้วแต่ไม่มีบันทึก
const daily = computed(() => {
  if (!stats.value) return [];
  const rec = new Map(stats.value.records.map((r) => [r.day, r]));
  return stats.value.days.map((d) => {
    const r = rec.get(d.day);
    const status = r ? r.status : d.counted && stats.value.mustAssemble ? 'absent' : null;
    return { ...d, record: r || null, status };
  });
});
const counted = computed(() => daily.value.filter((d) => d.counted || (d.record && d.assembly)));

async function loadStats() {
  const p = stats.value?.presets?.[range.value];
  sLoading.value = true;
  error.value = '';
  try {
    stats.value = await api(`/api/attendance/me/stats${p ? `?from=${p.from}&to=${p.to}` : ''}`);
    if (!stats.value.presets[range.value]) range.value = 'semester';
  } catch (e) { error.value = e.message; } finally { sLoading.value = false; }
}

async function pick(k) {
  range.value = k;
  store.set(`${PREF}-range`, k);
  await loadStats();
}

async function setView(k) {
  view.value = k;
  store.set(PREF, k);
  if (k !== 'list' && !stats.value) await firstStats();
}

async function firstStats() {
  // โหลดครั้งแรกเพื่อรู้ช่วงเวลาสำเร็จรูป แล้วโหลดช่วงที่เลือกไว้
  await loadStats();
  if (range.value !== 'semester' && stats.value?.presets?.[range.value]) await loadStats();
}

onMounted(async () => {
  try {
    items.value = (await api('/api/attendance/me/history')).items;
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
  if (view.value !== 'list') await firstStats();
});
</script>

<style scoped>
.views { flex-wrap: wrap; overflow: visible; }
.views button { white-space: nowrap; }
.range { display: flex; gap: 6px; flex-wrap: wrap; margin: 0 0 6px; }
.range button { min-height: 34px; padding: 0 12px; border-radius: 999px; border: 1px solid var(--line); background: var(--card); color: var(--text); font: inherit; font-size: .85rem; cursor: pointer; }
.range button.on { background: var(--info-bg); border-color: var(--brand-2); color: var(--brand-2); font-weight: 700; }
</style>
