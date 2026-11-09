<template>
  <!-- แบบสรุปการปฏิบัติงานของข้าราชการครู และบุคลากรทางการศึกษา (ประจำวัน) — พิมพ์ได้ขนาด A4 -->
  <div class="hr">
    <div class="head">
      <div>{{ snap.collegeName }}</div>
      <div>{{ snap.title }}</div>
      <div>{{ snap.dateText }}</div>
    </div>

    <div class="sec1">
      <div class="r h"><span class="lbl">1. จำนวนข้าราชการ และบุคลากรทางการศึกษา</span></div>
      <template v-for="c in snap.counts" :key="c.no">
        <div class="r"><span class="lbl in1">{{ c.no }} {{ c.label }}</span>
          <template v-if="!c.items"><span class="q">จำนวน</span><span class="n">{{ c.count }}</span><span class="u">คน</span></template>
          <template v-else><span class="q" /><span class="n">{{ c.count }}</span><span class="u">คน</span></template>
        </div>
        <div v-for="x in c.items || []" :key="x.no" class="r sub"><span class="lbl in2">{{ x.no }} {{ x.label }}</span>
          <span class="q2">จำนวน {{ x.count }} คน</span><span class="n" /><span class="u" /></div>
      </template>
      <div class="r total"><span class="lbl" /><span class="q">รวมทั้งสิ้น</span><span class="n">{{ snap.total }}</span><span class="u">คน</span></div>
    </div>

    <div v-for="s in sections" :key="s.key" class="sec">
      <div class="sh"><span>{{ s.title }}</span><span v-if="s.count !== null" class="box">{{ s.count }} คน</span></div>
      <template v-for="g in s.groups" :key="g.title || s.key">
        <div v-if="g.title" class="sh sh2"><span>{{ g.title }}</span><span class="box">{{ g.list.length }} คน</span></div>
        <div v-if="!g.list.length" class="dash">{{ g.empty || '-' }}</div>
        <div v-for="(p, i) in g.list" :key="i" class="item">
          <span class="nm">{{ g.prefix }}.{{ i + 1 }} {{ p.name }}</span><span class="ty">{{ p.type }}</span><span class="nt">{{ p.note }}</span>
        </div>
      </template>
    </div>

    <div class="sum">
      <div class="labels"><div>ผู้มาปฏิบัติงาน</div><div>ผู้ไม่มาปฏิบัติงาน</div></div>
      <div class="boxes"><div>{{ snap.worked }} คน</div><div>{{ snap.notWorked }} คน</div></div>
    </div>

    <div class="signs">
      <div v-for="st in steps.filter((x) => !x.decision)" :key="st.step" class="sign">
        <div class="line"><span class="dots"><img v-if="sigUrl(st.step)" :src="sigUrl(st.step)" alt="ลายเซ็น" /></span><span class="lb">{{ st.label }}</span></div>
        <div>({{ st.user_name }})</div>
        <div class="t2">{{ st.title }}</div>
        <div>{{ dateOf(st.step) || '........../........../..........' }}</div>
        <div v-if="esig(st.step)" class="esig">{{ esig(st.step) }}</div>
      </div>
    </div>
    <div v-for="st in steps.filter((x) => x.decision)" :key="st.step" class="boss">
      <div class="dec">
        <div><span class="cb">{{ decision(st.step)?.ack ? '☑' : '☐' }}</span> ทราบ</div>
        <div><span class="cb">{{ decision(st.step)?.assign ? '☑' : '☐' }}</span> มอบ/{{ decision(st.step)?.assignTo || '..................................................' }}</div>
      </div>
      <div class="line"><span class="dots"><img v-if="sigUrl(st.step)" :src="sigUrl(st.step)" alt="ลายเซ็น" /></span></div>
      <div>({{ st.user_name }})</div>
      <div class="t2">{{ st.title }}</div>
      <div>{{ dateOf(st.step) || '........../........../..........' }}</div>
      <div v-if="esig(st.step)" class="esig">{{ esig(st.step) }}</div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  snap: { type: Object, required: true },
  steps: { type: Array, required: true },
  signatures: { type: Array, default: () => [] },
  sigUrls: { type: Object, default: () => ({}) },
  wet: { type: Boolean, default: false },
});

const MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const bkk = (iso) => new Date(new Date(iso).getTime() + 7 * 3600_000).toISOString();
const last = (step) => [...props.signatures].reverse().find((s) => s.step === step && s.action === 'sign');
const sigUrl = (step) => (!props.wet && props.sigUrls[step]) || null;
const decision = (step) => (props.wet ? null : last(step)?.decision || null);
const dateOf = (step) => {
  const s = !props.wet && last(step);
  if (!s) return '';
  const [y, m, d] = bkk(s.signed_at).slice(0, 10).split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${String(y + 543).slice(-2)}`;
};
const esig = (step) => {
  const s = !props.wet && last(step);
  return s ? `ลงนามผ่านระบบ ${bkk(s.signed_at).slice(11, 16)} น.` : '';
};

const sections = computed(() => {
  const s = props.snap;
  const leaveGroups = [
    { title: '3.1 ลาป่วย', prefix: '3.1', list: s.leave.sick },
    { title: '3.2 ลากิจ', prefix: '3.2', list: s.leave.personal },
  ];
  if (s.leave.other.length) leaveGroups.push({ title: '3.3 ลาอื่น ๆ', prefix: '3.3', list: s.leave.other });
  return [
    { key: 'official', title: '2. ไปราชการ', count: s.official.length, groups: [{ prefix: '2', list: s.official }] },
    { key: 'leave', title: '3. ลา', count: s.leaveCount, groups: leaveGroups },
    { key: 'policy', title: '4. ไปปฏิบัติงานตามนโยบาย', count: s.policy.length, groups: [{ prefix: '4', list: s.policy }] },
    {
      key: 'assembly', title: '5. ผู้ไม่เข้ากิจกรรมหน้าเสาธง', count: s.assembly.held ? s.assembly.list.length : null,
      groups: [{ prefix: '5', list: s.assembly.list, empty: s.assembly.held ? '-' : s.assembly.reason }],
    },
    { key: 'late', title: '6. ผู้มาลงเวลาเกินเวลากำหนด', count: s.late.length, groups: [{ prefix: '6', list: s.late }] },
    { key: 'nosign', title: '7. ผู้ไม่ลงเวลากลับ', count: s.noSignout.length, groups: [{ prefix: '7', list: s.noSignout }] },
  ];
});
</script>

<style scoped>
.hr { font-size: 14px; line-height: 1.6; color: #111; min-width: 560px; }
.head { text-align: center; font-weight: 700; font-size: 15px; line-height: 1.55; margin-bottom: 8px; }
.sec1 { border: 1.5px solid #111; border-bottom-width: 3px; padding: 6px 10px 4px; margin-bottom: 12px; }
.r { display: grid; grid-template-columns: 1fr 70px 50px 34px; align-items: baseline; }
.r.sub { grid-template-columns: 1fr 120px 50px 34px; }
.r .lbl.in1 { padding-left: 34px; }
.r .lbl.in2 { padding-left: 230px; }
.r.sub .q2 { white-space: nowrap; }
.r .n { text-align: right; padding-right: 8px; font-variant-numeric: tabular-nums; }
.r.h .lbl { font-weight: 700; }
.r.total { border-top: 1px solid #111; margin-top: 4px; padding-top: 2px; font-weight: 700; }
.sec { margin: 10px 0; }
.sh { display: flex; justify-content: space-between; align-items: center; font-weight: 700; }
.sh2 { font-weight: 600; padding-left: 34px; margin-top: 4px; }
.box { display: inline-block; min-width: 92px; text-align: center; border: 1.5px solid #111; padding: 0 10px; margin-right: 120px; font-weight: 700; }
.dash { padding-left: 50px; }
.item { display: grid; grid-template-columns: 280px 140px 1fr; padding-left: 50px; }
.item .nt { color: #444; font-size: 12.5px; }
.sum { display: flex; justify-content: flex-end; gap: 14px; margin: 18px 0 8px; align-items: stretch; }
.sum .labels { display: flex; flex-direction: column; justify-content: space-around; font-weight: 700; text-align: right; }
.sum .boxes { border: 1.5px solid #111; min-width: 170px; }
.sum .boxes div { text-align: center; font-weight: 700; padding: 1px 10px; }
.sum .boxes div + div { border-top: 1.5px solid #111; }
.signs { display: grid; grid-template-columns: 1fr 1fr; gap: 18px 24px; margin-top: 18px; }
.sign, .boss { text-align: center; line-height: 1.75; }
.boss { width: 55%; margin: 18px auto 0; }
.dec { text-align: left; display: inline-block; margin-bottom: 4px; }
.cb { font-size: 16px; margin-right: 4px; }
.line { display: flex; align-items: flex-end; justify-content: center; gap: 6px; }
.dots { display: inline-flex; align-items: flex-end; justify-content: center; flex: 1 1 auto; max-width: 220px; min-width: 140px; height: 46px; border-bottom: 1px dotted #333; }
.dots img { max-height: 44px; max-width: 100%; }
.lb { white-space: nowrap; }
.t2 { line-height: 1.45; }
.esig { font-size: 11px; color: #2e7d32; line-height: 1.3; }
@media print { .hr { min-width: 0; font-size: 13px; } }
</style>
