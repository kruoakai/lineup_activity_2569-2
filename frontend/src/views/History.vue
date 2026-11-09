<template>
  <div>
    <h1>ประวัติของฉัน</h1>
    <div class="stats">
      <div class="stat"><b>{{ count.present }}</b><span>มาเข้าแถว</span></div>
      <div class="stat"><b>{{ count.official + count.policy }}</b><span>ราชการ / งานนโยบาย</span></div>
      <div class="stat"><b>{{ count.leave }}</b><span>ลา</span></div>
      <div class="stat"><b>{{ count.pending }}</b><span>รอตรวจสอบ</span></div>
    </div>
    <p class="small muted">แสดง 60 วันล่าสุดที่มีบันทึก วันที่ไม่มีบันทึกหลังปิดระบบจะนับเป็น "ขาด" ในรายงาน</p>
    <div v-if="error" class="alert bad">{{ error }}</div>
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
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { api, auth } from '../api';
import { STATUS, METHOD, statusLabel, thaiDate, thaiTime } from '../util';

const items = ref([]);
const loading = ref(true);
const error = ref('');
const count = computed(() => {
  const c = { present: 0, official: 0, policy: 0, leave: 0, pending: 0, absent: 0 };
  for (const it of items.value) c[it.status] += 1;
  return c;
});

onMounted(async () => {
  try {
    items.value = (await api('/api/attendance/me/history')).items;
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
});
</script>
