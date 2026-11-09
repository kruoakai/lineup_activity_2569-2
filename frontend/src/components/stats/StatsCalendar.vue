<template>
  <!-- ปฏิทินรายเดือน: สีตามสถานะ แตะวันเพื่อดูรายละเอียด -->
  <section class="card cal">
    <div class="head">
      <button type="button" class="btn sm" aria-label="เดือนก่อนหน้า" :disabled="idx <= 0" @click="go(-1)">‹</button>
      <b class="grow">{{ monthTitle }}</b>
      <button type="button" class="btn sm" aria-label="เดือนถัดไป" :disabled="idx >= months.length - 1" @click="go(1)">›</button>
    </div>
    <div class="sum small">
      <span v-for="s in SUM" :key="s.k" class="pill" :class="s.k"><i />{{ s.label }} {{ monthCount[s.k] || 0 }}</span>
    </div>
    <div class="grid" role="grid" :aria-label="monthTitle">
      <span v-for="w in TH_DAYS" :key="w" class="wd">{{ w }}</span>
      <span v-for="n in lead" :key="`b${n}`" class="blank" />
      <button v-for="d in monthDays" :key="d.day" type="button" class="c"
        :class="[d.status || (d.assembly ? 'none' : 'off'), { sel: sel?.day === d.day, today: d.day === today, out: !d.inRange }]"
        :disabled="!d.inRange" :aria-label="`${thaiDate(d.day)} ${label(d)}`" @click="sel = d">
        <span class="n">{{ Number(d.day.slice(8)) }}</span>
      </button>
    </div>
    <div class="legend small">
      <span v-for="s in LEGEND" :key="s.k" class="lg"><i :class="s.k" />{{ s.label }}</span>
    </div>
    <div v-if="sel" class="detail">
      <b>{{ thaiDate(sel.day) }}</b> · <span :class="`t-${sel.status || 'off'}`">{{ label(sel) }}</span>
      <div v-if="sel.record" class="small muted">
        {{ METHOD[sel.record.method] || sel.record.method }} · {{ thaiTime(sel.record.checked_at) }} น.
        <template v-if="sel.record.checked_by_name !== auth.user.full_name"> · โดย {{ sel.record.checked_by_name }}</template>
        <template v-if="sel.record.note"> · {{ sel.record.note }}</template>
      </div>
      <div v-else-if="sel.note" class="small muted">{{ sel.note }}</div>
      <div v-else-if="sel.status === 'absent'" class="small muted">ไม่มีบันทึกการเข้าแถว — ถ้ามาจริงหรือลา/ไปราชการ แจ้งงานบุคลากรหรือหัวหน้าแผนกให้บันทึกแก้ไข</div>
    </div>
    <p v-else class="small muted" style="margin:8px 0 0">แตะวันที่เพื่อดูรายละเอียด</p>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { auth } from '../../api';
import { METHOD, statusLabel, thaiDate, thaiTime, TH_DAYS, TH_MONTHS_FULL } from '../../util';

const props = defineProps({ days: { type: Array, required: true }, today: { type: String, required: true } });

const LEGEND = [
  { k: 'present', label: 'มา' }, { k: 'duty', label: 'ราชการ/นโยบาย' }, { k: 'leave', label: 'ลา' },
  { k: 'absent', label: 'ขาด' }, { k: 'pending', label: 'รอตรวจ' }, { k: 'off', label: 'วันหยุด/งด' },
];
const SUM = LEGEND.slice(0, 5);

const months = computed(() => [...new Set(props.days.map((d) => d.day.slice(0, 7)))]);
const idx = ref(0);
const sel = ref(null);
watch(months, (m) => { idx.value = Math.max(0, m.length - 1); sel.value = null; }, { immediate: true });
const go = (n) => { idx.value += n; sel.value = null; };

const ym = computed(() => months.value[idx.value] || props.today.slice(0, 7));
const monthTitle = computed(() => { const [y, m] = ym.value.split('-').map(Number); return `${TH_MONTHS_FULL[m - 1]} ${y + 543}`; });
const byDay = computed(() => new Map(props.days.map((d) => [d.day, d])));
const monthDays = computed(() => {
  const [y, m] = ym.value.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const out = [];
  for (let i = 1; i <= last; i += 1) {
    const day = `${ym.value}-${String(i).padStart(2, '0')}`;
    const d = byDay.value.get(day);
    out.push(d ? { ...d, kind: kindOf(d), inRange: true } : { day, assembly: false, status: null, inRange: false });
  }
  return out.map((d) => ({ ...d, status: d.inRange ? kindOf(d) : null }));
});
const lead = computed(() => { const [y, m] = ym.value.split('-').map(Number); return new Date(Date.UTC(y, m - 1, 1)).getUTCDay(); });
const monthCount = computed(() => {
  const c = {};
  for (const d of monthDays.value) if (d.status && d.status !== 'off') c[d.status] = (c[d.status] || 0) + 1;
  return c;
});

function kindOf(d) {
  const s = d.status;
  if (s === 'official' || s === 'policy') return 'duty';
  if (s) return s;
  return d.assembly ? null : 'off';
}
function label(d) {
  if (d.record) return statusLabel(d.record);
  if (d.status === 'absent') return 'ขาด (ไม่มีบันทึก)';
  if (!d.assembly) return d.note || 'ไม่ใช่วันเข้าแถว';
  return d.day === props.today ? 'วันนี้ (ยังไม่ปิดระบบ)' : 'ยังไม่นับ';
}
</script>

<style scoped>
.cal { padding: 14px; }
.head { display: flex; align-items: center; gap: 10px; text-align: center; margin: 0 auto 8px; max-width: 460px; }
.head b { font-size: 1.05rem; }
.sum { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 auto 10px; max-width: 460px; justify-content: center; }
.pill { display: inline-flex; align-items: center; gap: 5px; padding: 2px 9px; border-radius: 999px; background: var(--bg); }
.pill i, .lg i { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }
.grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 5px; max-width: 460px; margin: 0 auto; }
.wd { text-align: center; font-size: .78rem; color: var(--muted); padding-bottom: 2px; }
.c { aspect-ratio: 1 / 1; min-height: 36px; border-radius: 10px; border: 1px solid transparent; font: inherit; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; color: var(--text); background: var(--bg); }
.c .n { font-weight: 700; font-variant-numeric: tabular-nums; }
.c.today { outline: 2px dashed var(--brand-2); outline-offset: 1px; }
.c.sel { border-color: var(--text); box-shadow: 0 0 0 2px var(--text) inset; }
.c.out { visibility: hidden; }
.c.off { background: transparent; color: var(--muted); opacity: .55; }
.c.none { background: var(--bg); color: var(--muted); }
.present, .c.present { background: var(--ok); color: #fff; }
.duty, .c.duty { background: var(--info); color: #fff; }
.leave, .c.leave { background: #8a95a3; color: #fff; }
.absent, .c.absent { background: var(--bad); color: #fff; }
.pending, .c.pending { background: var(--warn); color: #fff; }
.lg i.off { background: transparent; border: 1px dashed var(--muted); }
.pill i.present, .lg i.present { background: var(--ok); }
.legend { display: flex; flex-wrap: wrap; gap: 6px 14px; margin-top: 10px; color: var(--muted); justify-content: center; }
.lg { display: inline-flex; align-items: center; gap: 5px; }
.pill.present, .pill.duty, .pill.leave, .pill.absent, .pill.pending { background: var(--bg); color: var(--text); }
.pill.present i { background: var(--ok); } .pill.duty i { background: var(--info); } .pill.leave i { background: #8a95a3; }
.pill.absent i { background: var(--bad); } .pill.pending i { background: var(--warn); }
.lg i.duty { background: var(--info); } .lg i.leave { background: #8a95a3; } .lg i.absent { background: var(--bad); } .lg i.pending { background: var(--warn); }
.lg.present, .lg.duty { background: none; }
.detail { margin-top: 12px; padding: 10px 12px; border-radius: 12px; background: var(--bg); line-height: 1.5; }
.t-present { color: var(--ok); font-weight: 700; } .t-duty { color: var(--info); font-weight: 700; } .t-absent { color: var(--bad); font-weight: 700; }
.t-pending { color: var(--warn); font-weight: 700; } .t-leave { color: var(--muted); font-weight: 700; }
</style>
