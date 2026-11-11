<template>
  <!-- งานกิจกรรม/ผู้ดูแล: สั่งเปิด / ปิดการเช็กชื่อด้วยมือ (มีผลเฉพาะวันนี้) -->
  <section class="wc" :class="[dark ? 'dark' : 'card', state.manual ? 'manual' : '']" aria-live="polite">
    <div class="wc-head">
      <b>ควบคุมการเช็กชื่อวันนี้</b>
      <span class="pill" :class="state.phase">{{ PHASE[state.phase] }}</span>
    </div>
    <p class="small wc-mode">
      <template v-if="state.manual">✋ {{ state.manual.mode === 'open' ? 'สั่งเปิด' : 'สั่งปิด' }}ด้วยมือ โดย {{ state.manual.by || '-' }} เวลา {{ state.manual.at }} น.
        · ตามเวลาปกติจะเป็น “{{ PHASE[state.scheduledPhase] }}”</template>
      <template v-else-if="state.isAssemblyDay">⏱ ตามเวลาอัตโนมัติ {{ state.openTime }}–{{ state.closeTime }} น.</template>
      <template v-else>วันนี้ไม่ใช่วันเข้าแถว — เพิ่มวันเข้าแถวที่ “ปฏิทินวันเข้าแถว” ก่อนจึงสั่งเปิดได้</template>
    </p>
    <div v-if="state.isAssemblyDay" class="wc-btns">
      <button v-if="state.phase !== 'open'" type="button" class="btn sm ok" :disabled="busy" @click="set('open')">▶ สั่งเปิดเช็กชื่อตอนนี้</button>
      <button v-if="state.phase === 'open'" type="button" class="btn sm bad" :disabled="busy" @click="set('closed')">■ สั่งปิดเช็กชื่อตอนนี้</button>
      <button v-if="state.manual" type="button" class="btn sm" :disabled="busy" @click="set('auto')">↺ กลับไปใช้ตามเวลา</button>
    </div>
    <p v-if="state.manual?.mode === 'open'" class="small warnline">⚠ เปิดค้างไว้จนกว่าจะสั่งปิด (หรือสิ้นวัน) — คนที่ยังไม่เช็กยังไม่ถูกนับขาด และงานบุคลากรยังสร้างรายงานไม่ได้</p>
    <p v-if="error" class="small errline">{{ error }}</p>
  </section>
</template>

<script setup>
import { ref } from 'vue';
import { api } from '../api';

const props = defineProps({
  state: { type: Object, required: true },
  dark: { type: Boolean, default: false },
});
const emit = defineEmits(['changed']);
const PHASE = { open: 'เปิดเช็กชื่ออยู่', before: 'ยังไม่เปิด', closed: 'ปิดแล้ว', no_assembly: 'ไม่มีเข้าแถว' };
const busy = ref(false);
const error = ref('');

const ASK = {
  open: 'สั่งเปิดการเช็กชื่อตอนนี้?\nทุกคนเช็กชื่อได้ทันที จนกว่าจะสั่งปิด (มีผลเฉพาะวันนี้)',
  closed: 'สั่งปิดการเช็กชื่อตอนนี้?\nคนที่ยังไม่เช็กชื่อจะนับเป็น "ขาด" (งานกิจกรรมยังบันทึกแทนภายหลังได้)',
  auto: () => `กลับไปใช้ตามเวลา ${props.state.openTime}–${props.state.closeTime} น.?`,
};

async function set(mode) {
  const msg = typeof ASK[mode] === 'function' ? ASK[mode]() : ASK[mode];
  if (!window.confirm(msg)) return;
  busy.value = true;
  error.value = '';
  try {
    emit('changed', await api('/api/attendance/window', { method: 'POST', body: { mode } }));
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
.wc { border-left: 4px solid var(--brand-2); }
.wc.manual { border-left-color: var(--warn); }
.wc-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.wc-mode { margin: 6px 0 8px; line-height: 1.5; }
.wc-btns { display: flex; gap: 8px; flex-wrap: wrap; }
.wc-btns .btn { min-height: 40px; font-weight: 700; }
.btn.ok { background: var(--ok); border-color: var(--ok); color: #fff; }
.btn.bad { background: var(--bad); border-color: var(--bad); color: #fff; }
.pill { font-size: .78rem; font-weight: 700; padding: 2px 10px; border-radius: 999px; background: var(--line); color: var(--text); }
.pill.open { background: var(--ok-bg); color: var(--ok); }
.pill.closed { background: var(--bad-bg); color: var(--bad); }
.pill.before { background: var(--warn-bg); color: var(--warn); }
.warnline { color: var(--warn); margin: 8px 0 0; line-height: 1.5; }
.errline { color: var(--bad); margin: 8px 0 0; }
/* บนหน้าจอแสดง QR (พื้นเข้ม) */
.wc.dark { background: rgba(255, 255, 255, .08); border-radius: 14px; padding: 12px 14px; width: min(560px, 92vw); text-align: left; margin-top: 14px; color: #fff; }
.wc.dark .btn:not(.ok):not(.bad) { background: transparent; color: #fff; border-color: rgba(255, 255, 255, .5); }
.wc.dark .warnline { color: #ffd27a; }
.wc.dark .errline { color: #ffb4b4; }
</style>
