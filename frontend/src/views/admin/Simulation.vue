<template>
  <div class="sim">
    <h1>ภาพจำลองการเข้าแถว</h1>
    <p class="small muted lead">สำหรับผู้ดูแลระบบ — ดูว่าระบบตัดสินผลอย่างไรในสถานการณ์ต่าง ๆ และทดลองค่าก่อนเปลี่ยนจริง
      <b>หน้านี้ไม่บันทึกและไม่แก้ข้อมูลการเข้าแถวจริง</b> บุคคลทั้งหมดเป็นบุคคลสมมติ</p>
    <div class="tabs" role="tablist" aria-label="ส่วนของภาพจำลอง">
      <button type="button" role="tab" :aria-selected="tab === 'replay'" :class="{ on: tab === 'replay' }" @click="tab = 'replay'">เล่นซ้ำสถานการณ์</button>
      <button type="button" role="tab" :aria-selected="tab === 'rules'" :class="{ on: tab === 'rules' }" @click="tab = 'rules'">ทดลองกฎด้วยค่าจริง</button>
    </div>
    <SimReplay v-if="tab === 'replay'" />
    <SimRules v-else />
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import SimReplay from '../../components/sim/SimReplay.vue';
import SimRules from '../../components/sim/SimRules.vue';

const route = useRoute();
const router = useRouter();
const tab = ref(route.query.tab === 'rules' ? 'rules' : 'replay');
watch(tab, (v) => router.replace({ query: v === 'rules' ? { tab: 'rules' } : {} }));
</script>

<style scoped>
.sim { max-width: 1280px; margin: 0 auto; }
.lead { margin: 0 0 12px; }
.tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--line); margin-bottom: 12px; overflow-x: auto; }
.tabs button { border: 0; background: none; color: var(--muted); font: inherit; font-weight: 600; padding: 10px 14px; border-bottom: 3px solid transparent; cursor: pointer; white-space: nowrap; min-height: 44px; }
.tabs button.on { color: var(--brand); border-bottom-color: var(--brand); }
</style>
