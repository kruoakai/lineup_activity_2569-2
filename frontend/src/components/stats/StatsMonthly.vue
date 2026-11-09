<template>
  <!-- สรุปรายเดือน: ร้อยละการมาเข้าแถว แท่งซ้อนตามสถานะ เส้นเกณฑ์ 80% -->
  <section class="card stack mon">
    <div class="kpis">
      <div class="kpi"><b :class="tone(total.pct)">{{ fmt(total.pct) }}</b><span>ร้อยละมาเข้าแถว (ทั้งช่วง)</span></div>
      <div class="kpi"><b :class="tone(cur?.pct)">{{ fmt(cur?.pct) }}</b><span>เดือนนี้ ({{ cur?.short || '-' }})</span></div>
      <div class="kpi">
        <b :class="delta === null ? '' : delta >= 0 ? 'up' : 'down'">{{ delta === null ? '-' : `${delta >= 0 ? '↑' : '↓'} ${Math.abs(delta).toFixed(1)}` }}</b>
        <span>เทียบเดือนก่อน (จุดร้อยละ)</span>
      </div>
    </div>

    <div v-if="!rows.length" class="muted">ยังไม่มีวันเข้าแถวในช่วงนี้</div>
    <div v-else class="chart" role="img" :aria-label="`ร้อยละมาเข้าแถวรายเดือน ${rows.map((r) => `${r.short} ${fmt(r.pct)}`).join(' ')}`">
      <div class="axis"><span>100%</span><span>50%</span><span>0%</span></div>
      <div class="plot">
        <div class="area"><div class="goal" :style="{ bottom: `${GOAL}%` }"><span>เกณฑ์ {{ GOAL }}%</span></div></div>
        <div v-for="r in rows" :key="r.ym" class="col" :title="`${r.long}: มา ${r.present}/${r.days} วัน (${fmt(r.pct)})`">
          <span class="val" :class="tone(r.pct)">{{ r.pct === null ? '' : Math.round(r.pct) }}</span>
          <div class="bar">
            <i v-for="s in SEG" :key="s.k" :class="s.k" :style="{ height: `${r.days ? (r[s.k] / r.days) * 100 : 0}%` }" />
          </div>
          <span class="lbl">{{ r.short }}</span>
        </div>
      </div>
    </div>
    <div class="legend small"><span v-for="s in SEG" :key="s.k"><i :class="s.k" />{{ s.label }}</span><span><i class="goal-i" />เกณฑ์ {{ GOAL }}%</span></div>

    <div class="tbl-wrap">
      <table class="tbl small">
        <thead><tr><th>เดือน</th><th>วันเข้าแถว</th><th>มา</th><th>ราชการ/นโยบาย</th><th>ลา</th><th>ขาด</th><th>ร้อยละ</th></tr></thead>
        <tbody>
          <tr v-for="r in rows" :key="r.ym">
            <td>{{ r.long }}</td><td>{{ r.days }}</td><td>{{ r.present }}</td><td>{{ r.duty }}</td><td>{{ r.leave }}</td>
            <td :class="{ bad: r.absent }">{{ r.absent }}</td><td :class="tone(r.pct)"><b>{{ fmt(r.pct) }}</b></td>
          </tr>
        </tbody>
        <tfoot v-if="rows.length > 1">
          <tr><td>รวม</td><td>{{ total.days }}</td><td>{{ total.present }}</td><td>{{ total.duty }}</td><td>{{ total.leave }}</td><td>{{ total.absent }}</td>
            <td :class="tone(total.pct)"><b>{{ fmt(total.pct) }}</b></td></tr>
        </tfoot>
      </table>
    </div>
    <p class="small muted" style="margin:0">ร้อยละ = วันที่มาเข้าแถว ÷ วันเข้าแถวที่ปิดระบบแล้ว (ไปราชการ / งานนโยบาย / ลา แสดงแยก ไม่นับเป็นมา)</p>
  </section>
</template>

<script setup>
import { computed } from 'vue';
import { TH_MONTHS, TH_MONTHS_FULL } from '../../util';

const props = defineProps({ days: { type: Array, required: true } });
const GOAL = 80;
const SEG = [
  { k: 'present', label: 'มา' }, { k: 'duty', label: 'ราชการ/นโยบาย' }, { k: 'leave', label: 'ลา' },
  { k: 'absent', label: 'ขาด' }, { k: 'pending', label: 'รอตรวจ' },
];

const empty = () => ({ days: 0, present: 0, duty: 0, leave: 0, absent: 0, pending: 0 });
function add(o, d) {
  o.days += 1;
  const s = d.status === 'official' || d.status === 'policy' ? 'duty' : d.status;
  if (o[s] !== undefined) o[s] += 1;
}
const pctOf = (o) => (o.days ? (o.present / o.days) * 100 : null);

// นับเฉพาะวันเข้าแถวที่มีผลแล้ว (ปิดระบบ หรือมีบันทึก)
const valid = computed(() => props.days.filter((d) => d.assembly && d.status));
const rows = computed(() => {
  const m = new Map();
  for (const d of valid.value) {
    const ym = d.day.slice(0, 7);
    if (!m.has(ym)) m.set(ym, empty());
    add(m.get(ym), d);
  }
  return [...m.entries()].map(([ym, o]) => {
    const [y, mo] = ym.split('-').map(Number);
    return { ym, ...o, pct: pctOf(o), short: `${TH_MONTHS[mo - 1]} ${String(y + 543).slice(-2)}`, long: `${TH_MONTHS_FULL[mo - 1]} ${y + 543}` };
  });
});
const total = computed(() => { const o = empty(); for (const d of valid.value) add(o, d); return { ...o, pct: pctOf(o) }; });
const cur = computed(() => rows.value.at(-1) || null);
const delta = computed(() => {
  const r = rows.value;
  if (r.length < 2 || r.at(-1).pct === null || r.at(-2).pct === null) return null;
  return r.at(-1).pct - r.at(-2).pct;
});
const fmt = (v) => (v === null || v === undefined ? '-' : `${v.toFixed(1)}%`);
const tone = (v) => (v === null || v === undefined ? '' : v >= GOAL ? 'good' : v >= 60 ? 'mid' : 'low');
</script>

<style scoped>
.mon { padding: 14px; }
.kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.kpi { background: var(--bg); border-radius: 12px; padding: 10px; }
.kpi b { display: block; font-size: 1.35rem; line-height: 1.2; font-variant-numeric: tabular-nums; }
.kpi span { font-size: .75rem; color: var(--muted); }
.good { color: var(--ok); } .mid { color: var(--warn); } .low { color: var(--bad); }
.up { color: var(--ok); } .down { color: var(--bad); }
.chart { display: flex; gap: 6px; height: 210px; padding-top: 8px; }
.axis { display: flex; flex-direction: column; justify-content: space-between; font-size: .7rem; color: var(--muted); padding: 14px 0 22px; text-align: right; width: 34px; }
.plot { position: relative; flex: 1; display: flex; gap: 6px; align-items: stretch; border-left: 1px solid var(--line); border-bottom: 1px solid var(--line); padding: 0 4px; }
.area { position: absolute; left: 0; right: 0; top: 14px; bottom: 22px; pointer-events: none; z-index: 1; }
.goal { position: absolute; left: 0; right: 0; border-top: 2px dashed var(--warn); }
.goal span { position: absolute; right: 2px; top: -16px; font-size: .68rem; color: var(--warn); background: var(--card); padding: 0 3px; }
.col { flex: 1; min-width: 0; max-width: 64px; display: flex; flex-direction: column; align-items: center; margin: 0 auto; }
.val { font-size: .75rem; font-weight: 700; height: 14px; }
.bar { flex: 1; width: 70%; max-width: 38px; display: flex; flex-direction: column-reverse; border-radius: 6px 6px 0 0; overflow: hidden; background: var(--bg); }
.bar i { display: block; width: 100%; }
.lbl { font-size: .7rem; color: var(--muted); height: 22px; line-height: 22px; white-space: nowrap; }
i.present { background: var(--ok); } i.duty { background: var(--info); } i.leave { background: #8a95a3; } i.absent { background: var(--bad); } i.pending { background: var(--warn); }
.legend { display: flex; flex-wrap: wrap; gap: 6px 14px; color: var(--muted); }
.legend span { display: inline-flex; align-items: center; gap: 5px; }
.legend i { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }
.legend i.goal-i { width: 16px; height: 0; border-top: 2px dashed var(--warn); border-radius: 0; }
.tbl-wrap { overflow-x: auto; }
.tbl { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
.tbl th, .tbl td { padding: 6px 6px; border-bottom: 1px solid var(--line); text-align: center; white-space: nowrap; }
.tbl th:first-child, .tbl td:first-child { text-align: left; }
.tbl th { color: var(--muted); font-weight: 600; }
.tbl tfoot td { font-weight: 700; border-bottom: 0; }
.tbl .bad { color: var(--bad); font-weight: 700; }
@media (max-width: 480px) { .kpi b { font-size: 1.1rem; } .chart { height: 180px; } }
</style>
