<template>
  <!-- แบบสรุปการปฏิบัติงานของข้าราชการครู และบุคลากรทางการศึกษา (ประจำวัน) — รูปแบบหนังสือราชการ A4 ไม่มีกรอบ -->
  <div class="hr">
    <div class="head">
      <div>{{ snap.collegeName }}</div>
      <div>{{ snap.title }}</div>
      <div>{{ snap.dateText }}</div>
    </div>

    <div class="sec">
      <div class="r h"><span class="lbl">1. จำนวนข้าราชการ และบุคลากรทางการศึกษา</span></div>
      <template v-for="c in snap.counts" :key="c.no">
        <div class="r"><span class="lbl in1">{{ c.no }} {{ c.label }}</span>
          <span class="q">{{ c.items ? '' : 'จำนวน' }}</span><span class="n">{{ c.count }}</span><span class="u">คน</span>
        </div>
        <div v-for="x in c.items || []" :key="x.no" class="r"><span class="lbl in2">{{ x.no }} {{ x.label }} จำนวน {{ x.count }} คน</span></div>
      </template>
      <div class="r total"><span class="lbl" /><span class="q">รวมทั้งสิ้น</span><span class="n"><u>{{ snap.total }}</u></span><span class="u">คน</span></div>
    </div>

    <div v-for="s in sections" :key="s.key" class="sec">
      <div class="r h"><span class="lbl">{{ s.title }}</span>
        <template v-if="s.count !== null"><span class="q">จำนวน</span><span class="n">{{ s.count }}</span><span class="u">คน</span></template>
      </div>
      <template v-for="g in s.groups" :key="g.title || s.key">
        <div v-if="g.title" class="r"><span class="lbl in1">{{ g.title }}</span><span class="q">จำนวน</span><span class="n">{{ g.list.length }}</span><span class="u">คน</span></div>
        <div v-if="!g.list.length" class="item"><span class="nm">{{ g.empty || '-' }}</span></div>
        <div v-for="(p, i) in g.list" :key="i" class="item">
          <span class="nm">{{ g.prefix }}.{{ i + 1 }} {{ p.name }}</span><span class="ty">{{ p.type }}</span><span class="nt">{{ p.note }}</span>
        </div>
      </template>
    </div>

    <div class="sec sum">
      <div class="r h"><span class="lbl">ผู้มาปฏิบัติงาน</span><span class="q">จำนวน</span><span class="n">{{ snap.worked }}</span><span class="u">คน</span></div>
      <div class="r h"><span class="lbl">ผู้ไม่มาปฏิบัติงาน</span><span class="q">จำนวน</span><span class="n">{{ snap.notWorked }}</span><span class="u">คน</span></div>
    </div>

    <div class="signs">
      <div v-for="st in steps.filter((x) => !x.decision)" :key="st.step" class="sign">
        <div class="line"><span class="lb">ลงชื่อ</span><span class="dots"><img v-if="sigUrl(st.step)" :src="sigUrl(st.step)" alt="ลายเซ็น" /></span><span class="lb">{{ st.label }}</span></div>
        <div>({{ st.user_name }})</div>
        <div class="t2">{{ st.title }}</div>
        <div>{{ dateOf(st.step) || 'วันที่ ........./........./.........' }}</div>
        <div v-if="esig(st.step)" class="esig">{{ esig(st.step) }}</div>
      </div>
    </div>
    <div v-for="st in steps.filter((x) => x.decision)" :key="st.step" class="boss">
      <div class="dec">
        <div><span class="cb">{{ decision(st.step)?.ack ? '☑' : '☐' }}</span> ทราบ</div>
        <div><span class="cb">{{ decision(st.step)?.assign ? '☑' : '☐' }}</span> มอบ/{{ decision(st.step)?.assignTo || '..................................................' }}</div>
      </div>
      <div class="line"><span class="lb">ลงชื่อ</span><span class="dots"><img v-if="sigUrl(st.step)" :src="sigUrl(st.step)" alt="ลายเซ็น" /></span></div>
      <div>({{ st.user_name }})</div>
      <div class="t2">{{ st.title }}</div>
      <div>{{ dateOf(st.step) || 'วันที่ ........./........./.........' }}</div>
      <div v-if="esig(st.step)" class="esig">{{ esig(st.step) }}</div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import '../doc-font.css';

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
  return `${d} ${MONTHS[m - 1]} ${y + 543}`;
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
/* หนังสือราชการ: TH Sarabun New 16 พอยต์ หัวเรื่อง 18 พอยต์ ไม่มีกรอบ */
.hr { font-family: 'DocSarabun', 'DocSarabunWeb', 'TH Sarabun New', serif; font-size: 16pt; line-height: 1.3; color: #000; min-width: 15cm; }
.head { text-align: center; font-weight: 700; font-size: 18pt; line-height: 1.3; margin-bottom: 12pt; }
.sec { margin: 0 0 8pt; }
.r { display: grid; grid-template-columns: 1fr 1.6cm 1.3cm 0.9cm; align-items: baseline; }
.r .lbl.in1 { padding-left: 1.25cm; }
.r .lbl.in2 { padding-left: 2.5cm; grid-column: 1 / -1; }
.r .q { text-align: right; padding-right: .2cm; white-space: nowrap; }
.r .n { text-align: right; padding-right: .25cm; font-variant-numeric: tabular-nums; }
.r .u { white-space: nowrap; }
.r.h .lbl { font-weight: 700; }
.r.total { font-weight: 700; }
.r.total .q { grid-column: 1 / 3; }
.r.total .lbl { display: none; }
.r.total u { text-decoration-style: double; text-underline-offset: 3px; }
.item { display: grid; grid-template-columns: 6.8cm 4cm 1fr; padding-left: 2.5cm; }
.item .nt { font-size: 14pt; }
.sum { margin-top: 12pt; }
.sum .lbl { text-align: right; padding-right: .2cm; }
.sum .q { padding-right: .2cm; }
.signs { display: grid; grid-template-columns: 1fr 1fr; gap: 14pt 1cm; margin-top: 22pt; break-inside: avoid; }
.sign, .boss { text-align: center; line-height: 1.3; break-inside: avoid; }
.boss { width: 55%; margin: 18pt auto 0; }
.dec { text-align: left; display: inline-block; margin-bottom: 6pt; }
.cb { margin-right: 4px; }
.line { display: flex; align-items: flex-end; justify-content: center; gap: 6px; }
.dots { display: inline-flex; align-items: flex-end; justify-content: center; flex: 1 1 auto; max-width: 5.5cm; min-width: 3cm; height: 1.2cm; border-bottom: 1px dotted #000; }
.dots img { max-height: 1.15cm; max-width: 100%; }
.lb { white-space: nowrap; }
.t2 { line-height: 1.25; }
.esig { font-size: 11pt; color: #777; line-height: 1.2; }
@media print { .hr { min-width: 0; } }
</style>
