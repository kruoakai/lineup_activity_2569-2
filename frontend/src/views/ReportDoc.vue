<template>
  <div v-if="doc">
    <div class="row no-print">
      <router-link to="/report-docs" class="btn sm">‹ รายการ</router-link>
      <span class="grow" />
      <span class="badge" :class="STATUS_CLS[doc.status]">{{ STATUS_TXT[doc.status] }}</span>
      <button class="btn sm" @click="print(false)">🖨 พิมพ์ / PDF</button>
      <button v-if="doc.status !== 'approved'" class="btn sm" title="พิมพ์โดยเว้นช่องลงนามว่างทั้งหมด เพื่อลงนามด้วยปากกา" @click="print(true)">🖊 พิมพ์ลงนามด้วยมือ</button>
    </div>

    <!-- สถานะการลงนามรายบุคคล -->
    <section class="card no-print steps">
      <div v-for="st in doc.steps" :key="st.step" class="step" :class="stepState(st).cls">
        <span class="num">{{ stepState(st).icon }}</span>
        <div class="grow">
          <div><b>{{ st.user_name }}</b> <span class="small muted">· {{ st.title }}</span></div>
          <div class="small">{{ stepState(st).text }}</div>
          <div v-if="doc.accounts && stepState(st).cls !== 'done'" class="small acct">
            <span v-if="!doc.accounts[st.user_id]?.ready" class="warn">⚠ ยังไม่เคยเข้าสู่ระบบ — ต้องเข้าด้วยบัญชีของตนเอง (รหัสพนักงาน + รหัสเริ่มต้น) แล้วตั้งรหัสใหม่ก่อน จึงลงนามได้</span>
            <span v-else-if="!doc.accounts[st.user_id]?.has_signature" class="muted">ยังไม่ได้บันทึกลายเซ็นในโปรไฟล์ (เซ็นตอนลงนามได้)</span>
            <span v-else class="okc">✓ บัญชีพร้อมลงนาม</span>
          </div>
        </div>
      </div>
      <p v-if="doc.status === 'pending' && !doc.canSign" class="small muted" style="margin:6px 0 0">
        ระบบให้ลงนามได้เฉพาะผู้มีชื่อในลำดับนั้น ตามลำดับ 1 → 2 → 3 ถ้าผู้ลงนามไม่สะดวกลงนามในระบบ ให้กด "พิมพ์ลงนามด้วยมือ" แล้วเสนอแฟ้มตามปกติ</p>
    </section>
    <div v-if="error" class="alert bad no-print" style="margin-top:10px">{{ error }}</div>
    <div v-if="msg" class="alert ok no-print" style="margin-top:10px">{{ msg }}</div>
    <div v-if="doc.is_demo" class="alert warn small no-print" style="margin-top:10px">เอกสารนี้มีข้อมูลจำลอง ใช้สำหรับฝึกใช้งานเท่านั้น</div>
    <div v-if="returned" class="alert bad small no-print" style="margin-top:10px">ส่งกลับแก้ไขโดย {{ returned.signer_name }}: {{ returned.comment }}</div>

    <!-- แบบสรุปการปฏิบัติงานประจำวัน (งานบุคลากร) -->
    <article v-if="doc.kind === 'hr_daily'" class="paper doc" :class="{ wet }">
      <HrDailyPaper :snap="snap" :steps="doc.steps" :signatures="doc.signatures" :sig-urls="sigUrls" :wet="wet" />
      <p class="meta">เลขอ้างอิงเอกสาร {{ doc.id }}-{{ doc.snapshot_hash.slice(0, 10) }} · สร้างโดย {{ doc.created_by_name }} · ออกจากระบบเช็กชื่อเข้าแถว วิทยาลัยเทคนิคชัยภูมิ
        <br />{{ wet ? 'ฉบับสำหรับลงนามด้วยมือ' : `สถานะ: ${statusLine}` }} · พิมพ์เมื่อ {{ dt(new Date().toISOString()) }}</p>
    </article>

    <!-- แบบบันทึกการเข้าร่วมกิจกรรมหน้าเสาธง (เอกสารแบบเดิม) -->
    <article v-else class="paper" :class="{ wet }">
      <h2 class="ttl">{{ snap.title }} ประจำวันที่ {{ periodText }}</h2>
      <p v-if="docSub" class="sub">{{ docSub }}</p>
      <table class="form">
        <thead>
          <tr>
            <th rowspan="2">เลขที่</th><th rowspan="2">งาน/แผนกวิชา</th><th rowspan="2">จำนวน<br />ทั้งหมด</th>
            <th :colspan="snap.days.length">วันที่เข้าร่วมกิจกรรมหน้าเสาธง (ตามวันที่)</th>
            <th rowspan="2">รวม</th><th rowspan="2">ร้อยละ</th>
          </tr>
          <tr><th v-for="d in snap.days" :key="d" :style="{ background: dayColor(d) }">{{ Number(d.slice(8)) }}</th></tr>
        </thead>
        <tbody>
          <tr v-for="r in snap.rows" :key="r.group">
            <td class="c">{{ r.no }}</td><td>{{ r.group }}</td><td class="c">{{ r.members }}</td>
            <td v-for="d in snap.days" :key="d" class="c" :class="{ red: r.perDay[d] < r.members }">{{ r.perDay[d] }}</td>
            <td class="c">{{ r.total }}</td><td class="c">{{ fmt(r.percent) }}</td>
          </tr>
          <tr class="sum">
            <td colspan="2" class="c"><b>รวม</b></td><td class="c"><b>{{ snap.totals.members }}</b></td>
            <td v-for="d in snap.days" :key="d" class="c"><b>{{ snap.totals.perDay[d] }}</b></td>
            <td class="c"><b>{{ snap.totals.total }}</b></td><td class="c"><b>{{ fmt(snap.totals.percent) }}</b></td>
          </tr>
        </tbody>
      </table>
      <p class="note"><b>หมายเหตุ ** คิดเป็นค่าร้อยละทั้งหมดของจำนวนบุคลากรทางการศึกษา {{ fmt(snap.totals.percent) }}</b></p>

      <div class="signs">
        <div v-for="st in doc.steps" :key="st.step" class="sign" :class="{ center: st.step === doc.steps.length && doc.steps.length % 2 === 1 }">
          <div class="line"><span class="lb">ลงชื่อ</span><span class="dots"><img v-if="!wet && sigUrls[st.step]" :src="sigUrls[st.step]" alt="ลายเซ็น" /></span><span class="lb">{{ st.label }}</span></div>
          <div>({{ titleName(st) }})</div>
          <div class="ttl2">{{ st.title }}</div>
          <div class="date">{{ (!wet && signedDate(st.step)) || '........../........../..........' }}</div>
          <div v-if="!wet && lastSign(st.step)" class="esig">ลงนามผ่านระบบ {{ dt(lastSign(st.step).signed_at) }}</div>
        </div>
      </div>
      <p class="meta">เลขอ้างอิงเอกสาร {{ doc.id }}-{{ doc.snapshot_hash.slice(0, 10) }} · สร้างโดย {{ doc.created_by_name }} · ออกจากระบบเช็กชื่อเข้าแถว วิทยาลัยเทคนิคชัยภูมิ
        <br />{{ wet ? 'ฉบับสำหรับลงนามด้วยมือ' : `สถานะ: ${statusLine}` }} · พิมพ์เมื่อ {{ dt(new Date().toISOString()) }}</p>
    </article>

    <!-- ลงนาม -->
    <section v-if="doc.canSign" class="card stack no-print">
      <h3>ลงนามลำดับที่ {{ doc.current_step }}: {{ doc.steps[doc.current_step - 1].title }}</h3>
      <fieldset v-if="curStep.decision" class="decision">
        <legend>คำสั่งการ</legend>
        <label class="row"><input v-model="dec.ack" type="checkbox" /> ทราบ</label>
        <label class="row"><input v-model="dec.assign" type="checkbox" /> มอบ</label>
        <input v-if="dec.assign" v-model.trim="dec.assignTo" maxlength="150" aria-label="ผู้รับมอบ" placeholder="เช่น หน.งานบริหารและพัฒนาทรัพยากรบุคคล" />
      </fieldset>
      <label v-if="auth.user.has_signature" class="row"><input v-model="useSaved" type="checkbox" /> ใช้ลายเซ็นที่บันทึกไว้ในโปรไฟล์</label>
      <SignaturePad v-if="!useSaved || !auth.user.has_signature" @change="(v) => (drawn = v)" />
      <label class="field"><span>ความเห็น (ไม่บังคับ / จำเป็นเมื่อส่งกลับแก้ไข)</span><textarea v-model="comment" maxlength="500" /></label>
      <div class="row">
        <button class="btn grow danger" :disabled="busy" @click="sendBack">ส่งกลับแก้ไข</button>
        <button class="btn primary grow" :disabled="busy || (!useSaved && !drawn) || (curStep.decision && !dec.ack && !(dec.assign && dec.assignTo))" @click="sign">✍ ลงนาม</button>
      </div>
    </section>

    <section class="card no-print">
      <h3>ประวัติเอกสาร</h3>
      <ul class="list small">
        <li><div class="main">สร้างเอกสาร · {{ doc.created_by_name }} · {{ dt(doc.created_at) }}</div></li>
        <li v-for="s in doc.signatures" :key="s.id"><div class="main">
          {{ s.action === 'sign' ? `ลงนามลำดับที่ ${s.step}` : `ส่งกลับแก้ไข (ลำดับที่ ${s.step})` }} · {{ s.signer_name }} · {{ dt(s.signed_at) }}
          <template v-if="s.decision"> · {{ [s.decision.ack && 'ทราบ', s.decision.assign && `มอบ ${s.decision.assignTo}`].filter(Boolean).join(' / ') }}</template>
          <template v-if="s.comment"> · “{{ s.comment }}”</template></div></li>
      </ul>
    </section>
  </div>
  <div v-else-if="error" class="alert bad">{{ error }}</div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { api, auth, imageUrl } from '../api';
import { askPassword } from '../confirm';
import SignaturePad from '../components/SignaturePad.vue';
import HrDailyPaper from '../components/HrDailyPaper.vue';

const route = useRoute();
const STATUS_TXT = { pending: 'รอลงนาม', approved: 'อนุมัติแล้ว', returned: 'ส่งกลับแก้ไข' };
const STATUS_CLS = { pending: 'info', approved: 'ok', returned: 'bad' };
const MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const MONTHS_FULL = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
// สีประจำวันแบบไทย: จันทร์เหลือง อังคารชมพู พุธเขียว พฤหัสส้ม ศุกร์ฟ้า เสาร์ม่วง อาทิตย์แดง
const DAY_COLORS = ['#f8b4b4', '#fff176', '#f8bbd0', '#c5e1a5', '#ffcc80', '#b3e5fc', '#d1c4e9'];

const doc = ref(null);
const error = ref('');
const msg = ref('');
const busy = ref(false);
const useSaved = ref(true);
const drawn = ref(null);
const comment = ref('');
const sigUrls = ref({});
const dec = ref({ ack: true, assign: false, assignTo: 'หน.งานบริหารและพัฒนาทรัพยากรบุคคล' });
const curStep = computed(() => doc.value.steps[doc.value.current_step - 1] || {});

const snap = computed(() => doc.value.snapshot);
const fmt = (v) => (v === null || v === undefined ? '-' : Number.isInteger(v) ? String(v) : Number(v).toFixed(2));
const dayColor = (d) => DAY_COLORS[new Date(`${d}T00:00:00Z`).getUTCDay()];
const bkkDay = (iso) => new Date(new Date(iso).getTime() + 7 * 3600_000).toISOString().slice(0, 10);
const thaiShort = (day) => { const [y, m, d] = day.split('-').map(Number); return `${d} ${MONTHS[m - 1]} ${y + 543}`; };
const dt = (iso) => `${thaiShort(bkkDay(iso))} ${new Date(new Date(iso).getTime() + 7 * 3600_000).toISOString().slice(11, 16)} น.`;
const periodText = computed(() => {
  const [y1, m1, d1] = doc.value.period_from.split('-').map(Number);
  const [y2, m2, d2] = doc.value.period_to.split('-').map(Number);
  if (y1 === y2 && m1 === m2) return `${d1}–${d2} ${MONTHS_FULL[m1 - 1]} ${y1 + 543}`;
  return `${d1} ${MONTHS_FULL[m1 - 1]} ${y1 + 543} – ${d2} ${MONTHS_FULL[m2 - 1]} ${y2 + 543}`;
});
const docSub = computed(() => (doc.value.title.startsWith(snap.value.title) ? '' : doc.value.title));
const lastSign = (step) => [...doc.value.signatures].reverse().find((s) => s.step === step && s.action === 'sign');
const returned = computed(() => (doc.value.status === 'returned' ? [...doc.value.signatures].reverse().find((s) => s.action === 'return') : null));
const signedDate = (step) => { const s = lastSign(step); return s ? thaiShort(bkkDay(s.signed_at)) : ''; };
const titleName = (st) => st.user_name;

async function load() {
  try {
    doc.value = await api(`/api/report-docs/${route.params.id}`);
    const urls = {};
    for (const st of doc.value.steps) {
      const s = lastSign(st.step);
      if (s?.has_image) urls[st.step] = await imageUrl(`/api/report-docs/${doc.value.id}/signatures/${s.id}`).catch(() => null);
    }
    sigUrls.value = urls;
  } catch (e) { error.value = e.message; }
}

async function sign() {
  const password = await askPassword('ยืนยันการลงนาม', { detail: `ลงนามในฐานะ ${doc.value.steps[doc.value.current_step - 1].title}` });
  if (!password) return;
  busy.value = true;
  error.value = '';
  try {
    const body = { password, comment: comment.value };
    if (curStep.value.decision) body.decision = dec.value;
    if (!(useSaved.value && auth.user.has_signature)) body.signature = drawn.value;
    await api(`/api/report-docs/${doc.value.id}/sign`, { method: 'POST', body });
    msg.value = 'ลงนามแล้ว';
    comment.value = '';
    await load();
  } catch (e) { error.value = e.message; } finally { busy.value = false; }
}

async function sendBack() {
  if (!comment.value.trim()) { error.value = 'กรุณาระบุเหตุผลในช่องความเห็นก่อนส่งกลับ'; return; }
  const password = await askPassword('ยืนยันการส่งกลับแก้ไข');
  if (!password) return;
  busy.value = true;
  try {
    await api(`/api/report-docs/${doc.value.id}/return`, { method: 'POST', body: { password, comment: comment.value } });
    msg.value = 'ส่งกลับแก้ไขแล้ว';
    await load();
  } catch (e) { error.value = e.message; } finally { busy.value = false; }
}

const wet = ref(false);
function print(handSign) {
  wet.value = handSign;
  nextTick(() => {
    window.print();
    wet.value = false;
  });
}

function stepState(st) {
  const d = doc.value;
  const s = lastSign(st.step);
  if (s && (d.status === 'approved' || st.step < d.current_step)) return { cls: 'done', icon: '✓', text: `ลงนามแล้ว ${dt(s.signed_at)}` };
  if (d.status === 'returned' && st.step === d.current_step) return { cls: 'bad', icon: '↩', text: 'ส่งกลับแก้ไข' };
  if (d.status === 'pending' && st.step === d.current_step) {
    return { cls: 'now', icon: st.step, text: d.canSign ? 'ถึงลำดับของท่าน — ลงนามได้ด้านล่าง' : 'รอลงนาม (ถึงลำดับแล้ว)' };
  }
  return { cls: 'wait', icon: st.step, text: d.status === 'returned' ? 'ยังไม่ลงนาม' : 'รอลำดับก่อนหน้า' };
}
const statusLine = computed(() => {
  const d = doc.value;
  const done = d.steps.filter((st) => stepState(st).cls === 'done').length;
  if (d.status === 'approved') return `ลงนามครบ ${done}/${d.steps.length} อนุมัติแล้ว`;
  const cur = d.steps[d.current_step - 1];
  if (d.status === 'returned') return `ส่งกลับแก้ไข (ลงนามแล้ว ${done}/${d.steps.length})`;
  return `ลงนามแล้ว ${done}/${d.steps.length} · รอ ${cur?.user_name || '-'}`;
});

onMounted(() => {
  useSaved.value = !!auth.user.has_signature;
  load();
});
</script>

<style scoped>
.paper { background: #fff; color: #111; border-radius: 6px; padding: 22px 18px; margin: 12px 0; box-shadow: var(--shadow); font-size: 14px; overflow-x: auto; }
.ttl { text-align: center; font-size: 16px; line-height: 1.5; margin: 0 0 4px; }
.sub { text-align: center; margin: 0 0 10px; font-weight: 600; }
.form { border-collapse: collapse; width: 100%; min-width: 620px; }
.form th, .form td { border: 1px solid #333; padding: 4px 6px; white-space: normal; color: #111; background: #fff; }
.form th { font-weight: 700; text-align: center; position: static; }
.form .c { text-align: center; font-variant-numeric: tabular-nums; }
.form .red { color: #d32f2f; }
.form .sum td { background: #fff; }
.note { text-align: center; margin: 10px 0 18px; }
.signs { display: grid; grid-template-columns: 1fr 1fr; gap: 22px 28px; min-width: 620px; }
.sign { text-align: center; line-height: 1.9; min-width: 0; }
.sign.center { grid-column: 1 / -1; justify-self: center; width: 50%; }
.line { display: flex; align-items: flex-end; justify-content: center; gap: 6px; }
.lb { white-space: nowrap; flex: none; }
.dots { display: inline-flex; align-items: flex-end; justify-content: center; flex: 1 1 auto; max-width: 210px; min-width: 120px; height: 48px; border-bottom: 1px dotted #333; }
.dots img { max-height: 46px; max-width: 100%; }
.ttl2 { line-height: 1.5; }
.esig { font-size: 11px; color: #2e7d32; line-height: 1.4; }
.steps { display: grid; gap: 8px; }
.step { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 10px; border: 1px solid var(--line); }
.step .num { flex: none; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; background: var(--line); }
.step.done { border-color: var(--ok); } .step.done .num { background: var(--ok); color: #fff; }
.step.now { border-color: var(--brand-2); } .step.now .num { background: var(--brand-2); color: #fff; }
.step.bad { border-color: var(--bad); } .step.bad .num { background: var(--bad); color: #fff; }
.step.wait { opacity: .75; }
.acct .warn { color: var(--warn); }
.acct .okc { color: var(--ok); }
.decision { border: 1px solid var(--line); border-radius: 12px; padding: 8px 12px; display: grid; gap: 6px; }
.decision legend { padding: 0 6px; color: var(--muted); font-size: .85rem; }
.meta { margin-top: 18px; font-size: 11px; color: #666; text-align: center; }
/* หนังสือราชการ: กระดาษขาวไม่มีกรอบ/เงา ระยะขอบแบบ A4 (บน 2.5 ซ้าย 3 ขวา 2 ล่าง 2 ซม.) */
.paper.doc { border-radius: 0; box-shadow: none; border: 0; padding: 2.5cm 2cm 2cm 3cm; color: #000; }
@media (max-width: 760px) { .paper.doc { padding: 16px 12px; } .paper.doc > :first-child { zoom: .8; } }
/* มือถือ: ย่อทั้งหน้าให้เห็นเต็มแผ่นเหมือนดู PDF ไม่ต้องเลื่อนซ้ายขวา */
@media (max-width: 600px) { .paper.doc > :first-child { zoom: .6; } }
@media print { .paper.doc > :first-child { zoom: 1; } }
@media print {
  .paper { box-shadow: none; padding: 0; margin: 0; font-size: 13px; overflow: visible; }
  .paper.doc { padding: 0; }
  .form, .signs { min-width: 0; }
  @page { size: A4 portrait; margin: 25mm 20mm 20mm 30mm; }
}
</style>
