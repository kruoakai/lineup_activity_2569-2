<template>
  <!-- สั่งเปิด / ปิดการเช็กชื่อด้วยมือ (มีผลเฉพาะวันนี้) — สวิตช์ 3 ตำแหน่ง: เปิด · ตามเวลา · ปิด -->
  <section class="wc" :class="[dark ? 'dark' : 'light', `ph-${state.phase}`]" aria-live="polite">
    <header class="wc-top">
      <span class="wc-title">
        <svg class="wc-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2.5M9 2h6M12 2v3" /></svg>
        การเช็กชื่อวันนี้
      </span>
      <span class="wc-badge"><i class="dot" />{{ PHASE[state.phase] }}</span>
    </header>

    <div class="wc-status">
      <p class="wc-big">{{ BIG[state.phase] }}</p>
      <p class="wc-sub">
        <template v-if="state.manual">
          <b>{{ state.manual.mode === 'open' ? 'สั่งเปิด' : 'สั่งปิด' }}ด้วยมือ</b> โดย {{ state.manual.by || '-' }} · {{ state.manual.at }} น.
          <span class="sched">(ตามเวลาปกติ: {{ PHASE[state.scheduledPhase] }})</span>
        </template>
        <template v-else-if="state.isAssemblyDay">อัตโนมัติตามเวลา <b>{{ state.openTime }} – {{ state.closeTime }} น.</b></template>
        <template v-else>วันนี้ไม่ใช่วันเข้าแถว — เพิ่มวันที่ “ปฏิทินวันเข้าแถว” ก่อนจึงสั่งเปิดได้</template>
      </p>
    </div>

    <div v-if="state.isAssemblyDay" class="seg" role="radiogroup" aria-label="สั่งการเช็กชื่อ">
      <button v-for="o in OPTS" :key="o.k" type="button" role="radio" class="seg-btn" :class="[o.k, { on: current === o.k }]"
        :aria-checked="current === o.k" :disabled="busy" @click="set(o.k)">
        <span class="seg-ico" aria-hidden="true" v-html="o.icon" />
        <span class="seg-txt"><b>{{ o.label }}</b><small>{{ o.hint(state) }}</small></span>
      </button>
    </div>

    <p v-if="state.manual?.mode === 'open'" class="wc-note warn">⚠ เปิดค้างจนกว่าจะสั่งปิดหรือสิ้นวัน — ระหว่างนี้คนที่ยังไม่เช็กยังไม่ถูกนับขาด และยังสร้างรายงานประจำวันไม่ได้</p>
    <p v-else-if="state.isAssemblyDay" class="wc-note">มีผลเฉพาะวันนี้ · พรุ่งนี้กลับไปใช้ตามเวลาเอง</p>
    <p v-if="error" class="wc-note err">{{ error }}</p>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue';
import { api } from '../api';

const props = defineProps({
  state: { type: Object, required: true },
  dark: { type: Boolean, default: false },
});
const emit = defineEmits(['changed']);
const PHASE = { open: 'เปิดอยู่', before: 'ยังไม่เปิด', closed: 'ปิดแล้ว', no_assembly: 'ไม่มีเข้าแถว' };
const BIG = { open: 'เปิดรับเช็กชื่ออยู่', before: 'ยังไม่ถึงเวลาเปิด', closed: 'ปิดรับเช็กชื่อแล้ว', no_assembly: 'ไม่มีการเข้าแถว' };
const OPTS = [
  { k: 'open', label: 'เปิด', icon: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>', hint: () => 'สั่งเปิดทันที' },
  { k: 'auto', label: 'ตามเวลา', icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 8v4l3 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>', hint: (s) => `${s.openTime}–${s.closeTime}` },
  { k: 'closed', label: 'ปิด', icon: '<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>', hint: () => 'สั่งปิดทันที' },
];
const current = computed(() => props.state.manual?.mode || 'auto');
const busy = ref(false);
const error = ref('');

const ASK = {
  open: () => 'สั่ง "เปิด" การเช็กชื่อตอนนี้?\n\nทุกคนเช็กชื่อได้ทันที และเปิดค้างจนกว่าจะสั่งปิด (มีผลเฉพาะวันนี้)',
  closed: () => 'สั่ง "ปิด" การเช็กชื่อตอนนี้?\n\nคนที่ยังไม่เช็กชื่อจะนับเป็น "ขาด" (งานกิจกรรมยังบันทึกแทนภายหลังได้)',
  auto: () => `กลับไปใช้ "ตามเวลา" ${props.state.openTime}–${props.state.closeTime} น.?`,
};

async function set(mode) {
  if (mode === current.value || busy.value) return;
  if (!window.confirm(ASK[mode]())) return;
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
.wc {
  --tone: var(--muted);
  --tone-bg: var(--line);
  position: relative; overflow: hidden; border-radius: 16px; margin-bottom: 14px;
  padding: 16px 16px 14px;
}
.wc.ph-open { --tone: var(--ok); --tone-bg: var(--ok-bg); }
.wc.ph-closed { --tone: var(--bad); --tone-bg: var(--bad-bg); }
.wc.ph-before { --tone: var(--warn); --tone-bg: var(--warn-bg); }
.wc.light { background: var(--card); border: 1px solid var(--line); box-shadow: var(--shadow); }
/* แถบสีสถานะด้านบน */
.wc::before { content: ''; position: absolute; inset: 0 0 auto 0; height: 4px; background: var(--tone); }

.wc-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.wc-title { display: inline-flex; align-items: center; gap: 8px; font-weight: 700; letter-spacing: .2px; }
.wc-ico { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; opacity: .8; }
.wc-badge { display: inline-flex; align-items: center; gap: 6px; padding: 3px 12px 3px 10px; border-radius: 999px; font-size: .8rem; font-weight: 700; color: var(--tone); background: var(--tone-bg); }
.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--tone); }
.ph-open .dot { box-shadow: 0 0 0 0 var(--tone); animation: pulse 1.8s infinite; }
@keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(31, 157, 85, .55); } 70% { box-shadow: 0 0 0 7px rgba(31, 157, 85, 0); } 100% { box-shadow: 0 0 0 0 rgba(31, 157, 85, 0); } }
@media (prefers-reduced-motion: reduce) { .ph-open .dot { animation: none; } }

.wc-status { margin: 10px 0 12px; }
.wc-big { margin: 0; font-size: 1.25rem; font-weight: 800; color: var(--tone); line-height: 1.3; }
.wc-sub { margin: 2px 0 0; font-size: .86rem; color: var(--muted); line-height: 1.5; }
.wc-sub b { color: var(--text); font-weight: 700; }
.sched { white-space: nowrap; }

/* สวิตช์ 3 ตำแหน่ง */
.seg { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; padding: 4px; border-radius: 14px; background: var(--bg); border: 1px solid var(--line); }
.seg-btn {
  display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 54px; padding: 6px 8px;
  border: 0; border-radius: 10px; background: transparent; color: var(--muted); font: inherit; cursor: pointer;
  transition: background .15s, color .15s, box-shadow .15s, transform .05s;
}
.seg-btn:hover:not(.on):not(:disabled) { background: var(--card); color: var(--text); }
.seg-btn:active:not(:disabled) { transform: scale(.98); }
.seg-btn:focus-visible { outline: 2px solid var(--brand-2); outline-offset: 2px; }
.seg-btn:disabled { cursor: progress; opacity: .7; }
.seg-ico { display: inline-flex; width: 22px; height: 22px; flex: none; }
.seg-ico :deep(svg) { width: 100%; height: 100%; fill: currentColor; }
.seg-txt { display: flex; flex-direction: column; align-items: flex-start; line-height: 1.15; text-align: left; }
.seg-txt b { font-size: 1rem; }
.seg-txt small { font-size: .72rem; opacity: .85; font-variant-numeric: tabular-nums; }
.seg-btn.on { color: #fff; box-shadow: 0 2px 6px rgba(16, 24, 40, .18); cursor: default; }
/* สีปุ่มที่เลือกคงที่ทุกธีม (ตัวอักษรขาวอ่านชัดทั้งโหมดสว่างและมืด) */
.seg-btn.on.open { background: #1f9d55; }
.seg-btn.on.auto { background: #1d4e89; }
.seg-btn.on.closed { background: #d64545; }

.wc-note { margin: 10px 2px 0; font-size: .8rem; color: var(--muted); line-height: 1.5; }
.wc-note.warn { color: var(--warn); background: var(--warn-bg); padding: 8px 10px; border-radius: 10px; }
.wc-note.err { color: var(--bad); }

@media (max-width: 400px) {
  .seg-btn { flex-direction: column; gap: 2px; min-height: 62px; }
  .seg-txt { align-items: center; text-align: center; }
}

/* บนหน้าจอแสดง QR (พื้นเข้ม) */
.wc.dark { width: min(560px, 92vw); margin: 16px 0 0; text-align: left; color: #fff; background: rgba(255, 255, 255, .07); border: 1px solid rgba(255, 255, 255, .12); }
.wc.dark .wc-sub { color: #c4d3e6; }
.wc.dark .wc-sub b { color: #fff; }
.wc.dark .wc-big { color: #fff; }
.wc.dark .seg { background: rgba(0, 0, 0, .22); border-color: rgba(255, 255, 255, .1); }
.wc.dark .seg-btn { color: #c4d3e6; }
.wc.dark .seg-btn:hover:not(.on):not(:disabled) { background: rgba(255, 255, 255, .08); color: #fff; }
.wc.dark .seg-btn.on.auto { background: #2f6fb8; }
.wc.dark .wc-badge { background: rgba(255, 255, 255, .92); }
.wc.dark .wc-note { color: #a9bbd1; }
.wc.dark .wc-note.warn { color: #ffd27a; background: rgba(255, 210, 122, .1); }
.wc.dark .wc-note.err { color: #ffb4b4; }
</style>
