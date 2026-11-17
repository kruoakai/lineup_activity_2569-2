<template>
  <!-- แจ้งลา / ไปราชการ / งานนโยบาย โดยเจ้าตัว → รอเจ้าหน้าที่บุคลากรตรวจ แล้วจึงลงรายงาน -->
  <div class="leave">
    <header class="head">
      <h1>แจ้งลา / ไปราชการ</h1>
      <p class="lead">แจ้งเมื่อไม่ได้เข้าแถว เจ้าหน้าที่บุคลากรจะตรวจแล้วบันทึกลงรายงานประจำวันให้</p>
    </header>

    <div v-if="error" class="alert bad">{{ error }}</div>
    <div v-if="message" class="alert ok">{{ message }}</div>

    <section v-if="meta" class="card form">
      <div class="step"><span class="n">1</span>เลือกประเภท</div>
      <div class="kinds" role="radiogroup" aria-label="ประเภท">
        <button v-for="k in KIND_ORDER" :key="k" type="button" role="radio" :aria-checked="kind === k"
          :aria-label="meta.kinds[k]" class="kind" :class="[k, { on: kind === k }]" @click="kind = k">
          <span class="ki"><LeaveIcon :kind="k" :size="22" /></span>
          <span class="kt"><b>{{ meta.kinds[k] }}</b><small>{{ HINT[k] }}</small></span>
          <span class="tick" aria-hidden="true"><svg viewBox="0 0 24 24" width="14" height="14"><path d="M5 12.5l4.2 4L19 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" /></svg></span>
        </button>
      </div>

      <div class="step"><span class="n">2</span>วันที่</div>
      <div class="dates">
        <label class="field"><span>ตั้งแต่วันที่</span>
          <input v-model="from" type="date" :min="meta.earliest" :max="meta.latest" @change="fixTo" /></label>
        <label class="field"><span>ถึงวันที่</span>
          <input v-model="to" type="date" :min="from || meta.earliest" :max="meta.latest" /></label>
      </div>
      <p v-if="from" class="when">
        <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8" /><path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
        {{ from === to || !to ? thaiDate(from) : thaiRange(from, to) }}<span class="muted"> · นับเฉพาะวันทำงาน</span>
      </p>

      <div class="step"><span class="n">3</span>รายละเอียด <em :class="{ req: needNote }">{{ needNote ? 'จำเป็น' : 'ไม่บังคับ' }}</em></div>
      <textarea v-model="note" maxlength="500" aria-label="รายละเอียด" :class="{ need: needNote && !note.trim() }"
        :placeholder="PLACEHOLDER[kind] || 'เช่น เหตุผล สถานที่ หรือเลขที่คำสั่ง'" />

      <div class="step"><span class="n">4</span>แนบหลักฐาน <em>ไม่บังคับ</em></div>
      <p class="hint">เช่น หนังสือสั่งการ บันทึกข้อความ ใบรับรองแพทย์</p>
      <PhotoPicker v-model="photos" :max="3" />

      <button class="btn primary block send" :disabled="busy || !ready" @click="submit">
        <svg v-if="ready && !busy" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 12l16-8-6 16-3-6.5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" /></svg>
        {{ busy ? 'กำลังส่ง…' : sendLabel }}</button>
      <p class="rule">แจ้งล่วงหน้าได้ · ย้อนหลังได้ไม่เกิน 3 วันทำการ (ตั้งแต่ {{ thaiDate(meta.earliest, false) }})</p>
    </section>

    <h2>คำแจ้งของฉัน</h2>
    <ul class="mine">
      <li v-for="r in items" :key="r.id" class="card req" :class="r.status">
        <span class="ki sm" :class="r.kind"><LeaveIcon :kind="r.kind" :size="20" /></span>
        <div class="body">
          <div class="top">
            <b>{{ r.kind_label }}</b>
            <span class="badge" :class="ST[r.status].cls">{{ ST[r.status].label }}</span>
          </div>
          <div class="small">{{ r.from === r.to ? thaiDate(r.from) : thaiRange(r.from, r.to) }}</div>
          <div v-if="r.note" class="small muted">{{ r.note }}</div>
          <div v-if="r.photo_count" class="small muted">แนบหลักฐาน {{ r.photo_count }} รูป</div>
          <div v-if="r.status === 'rejected'" class="why small"><b>เหตุผล:</b> {{ r.review_note }} — {{ r.reviewed_by_name }}</div>
          <div v-if="r.status === 'approved'" class="small ok-txt">✓ บันทึกลงรายงานแล้ว โดย {{ r.reviewed_by_name }}</div>
          <button v-if="r.status === 'pending'" class="btn sm danger" :disabled="busy" @click="cancel(r)">ยกเลิกคำแจ้ง</button>
        </div>
      </li>
      <li v-if="loaded && !items.length" class="empty">ยังไม่มีคำแจ้ง</li>
    </ul>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { api } from '../api';
import { thaiDate, thaiRange } from '../util';
import PhotoPicker from '../components/PhotoPicker.vue';
import LeaveIcon from '../components/LeaveIcon.vue';

const KIND_ORDER = ['sick', 'personal', 'official', 'policy', 'other'];
const HINT = { sick: 'เจ็บป่วย พบแพทย์', personal: 'ธุระ / ภารกิจส่วนตัว', official: 'ตามคำสั่ง / หนังสือ', policy: 'งานตามนโยบาย', other: 'ลาประเภทอื่น' };
const PLACEHOLDER = {
  sick: 'เช่น ไข้หวัด พบแพทย์ตามนัด',
  personal: 'เช่น ธุระส่วนตัวที่ต่างจังหวัด',
  official: 'เช่น ประชุมที่ สอศ. ตามคำสั่งที่ 123/2569',
  policy: 'เช่น ร่วมโครงการตามนโยบาย ณ …',
  other: 'เช่น ลาคลอด ลาอุปสมบท',
};
const ST = {
  pending: { label: 'รอตรวจ', cls: 'warn' },
  approved: { label: 'บันทึกแล้ว', cls: 'ok' },
  rejected: { label: 'ไม่อนุมัติ', cls: 'bad' },
  cancelled: { label: 'ยกเลิกแล้ว', cls: 'muted' },
};

const meta = ref(null);
const items = ref([]);
const loaded = ref(false);
const kind = ref('');
const from = ref('');
const to = ref('');
const note = ref('');
const photos = ref([]);
const busy = ref(false);
const error = ref('');
const message = ref('');
const needNote = computed(() => ['official', 'policy'].includes(kind.value));
const ready = computed(() => !!kind.value && !!from.value && !(needNote.value && !note.value.trim()));
const sendLabel = computed(() => {
  if (!kind.value) return 'เลือกประเภทก่อน';
  if (needNote.value && !note.value.trim()) return 'กรอกรายละเอียดก่อนส่ง';
  return 'ส่งให้เจ้าหน้าที่บุคลากรตรวจ';
});

function fixTo() { if (!to.value || to.value < from.value) to.value = from.value; }

async function load() {
  try {
    const [m, mine] = await Promise.all([api('/api/leave/meta'), api('/api/leave/mine')]);
    meta.value = m;
    items.value = mine.items;
    if (!from.value) { from.value = m.today; to.value = m.today; }
  } catch (e) { error.value = e.message; } finally { loaded.value = true; }
}

async function submit() {
  busy.value = true; error.value = ''; message.value = '';
  try {
    await api('/api/leave', { method: 'POST', body: { kind: kind.value, from: from.value, to: to.value || from.value, note: note.value, photos: photos.value } });
    message.value = 'ส่งแล้ว รอเจ้าหน้าที่บุคลากรตรวจ — ดูสถานะได้ที่ "คำแจ้งของฉัน"';
    kind.value = ''; note.value = ''; photos.value = [];
    await load();
  } catch (e) { error.value = e.message; } finally { busy.value = false; }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function cancel(r) {
  if (!window.confirm(`ยกเลิกคำแจ้ง${r.kind_label}นี้?`)) return;
  busy.value = true; error.value = ''; message.value = '';
  try { await api(`/api/leave/${r.id}/cancel`, { method: 'POST' }); message.value = 'ยกเลิกคำแจ้งแล้ว'; await load(); } catch (e) { error.value = e.message; } finally { busy.value = false; }
}

onMounted(load);
</script>

<style scoped>
.leave { max-width: 680px; margin: 0 auto; padding-bottom: 72px; } /* เว้นที่ให้ปุ่มน้องแถวดีที่ลอยมุมขวาล่าง */
.head { margin: 4px 0 14px; }
h1 { font-size: 1.35rem; margin: 0 0 4px; letter-spacing: -.01em; }
.lead { margin: 0; color: var(--muted); font-size: .9rem; }
h2 { font-size: 1.05rem; margin: 26px 0 10px; }
.form { padding: 18px 18px 14px; }
.step { display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: .95rem; margin: 20px 0 10px; }
.step:first-child { margin-top: 0; }
.step .n { width: 22px; height: 22px; border-radius: 50%; background: var(--brand); color: #fff; font-size: .75rem; display: inline-flex; align-items: center; justify-content: center; flex: none; }
.step em { font-style: normal; font-weight: 500; font-size: .75rem; color: var(--muted); background: var(--bg); border: 1px solid var(--line); border-radius: 999px; padding: 1px 8px; }
.step em.req { color: var(--warn); background: var(--warn-bg); border-color: transparent; }

/* สีประจำประเภท (ไอคอนและกรอบตอนเลือก) */
.sick { --k: #d9485f; --kb: #fdecef; }
.personal { --k: #c27a12; --kb: #fdf3e2; }
.official { --k: #1d4e89; --kb: #e7eef8; }
.policy { --k: #6b4bc4; --kb: #efeafb; }
.other { --k: #4b5a6b; --kb: #eef1f4; }
@media (prefers-color-scheme: dark) {
  .sick { --k: #f07a8c; --kb: rgba(240, 122, 140, .16); }
  .personal { --k: #e8a94a; --kb: rgba(232, 169, 74, .16); }
  .official { --k: #7cb2f5; --kb: rgba(124, 178, 245, .16); }
  .policy { --k: #a98cf0; --kb: rgba(169, 140, 240, .16); }
  .other { --k: #a7b4c2; --kb: rgba(167, 180, 194, .14); }
}

.kinds { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 10px; }
.kind { position: relative; display: flex; align-items: center; gap: 12px; padding: 12px 14px; min-height: 64px; border: 1.5px solid var(--line); border-radius: 14px; background: var(--card); color: var(--text); font: inherit; text-align: left; cursor: pointer; transition: border-color .15s, box-shadow .15s, background .15s, transform .1s; }
.kind:hover { border-color: color-mix(in srgb, var(--k) 45%, var(--line)); }
.kind:active { transform: scale(.985); }
.ki { width: 40px; height: 40px; border-radius: 11px; display: inline-flex; align-items: center; justify-content: center; flex: none; color: var(--k); background: var(--kb); }
.kt { display: flex; flex-direction: column; line-height: 1.3; min-width: 0; }
.kt b { font-size: .98rem; }
.kt small { color: var(--muted); font-size: .76rem; }
.tick { position: absolute; top: 8px; right: 8px; width: 20px; height: 20px; border-radius: 50%; display: none; align-items: center; justify-content: center; background: var(--k); color: #fff; }
.kind.on { border-color: var(--k); background: color-mix(in srgb, var(--kb) 55%, var(--card)); box-shadow: 0 4px 14px color-mix(in srgb, var(--k) 18%, transparent); }
.kind.on .tick { display: inline-flex; }
.kind.on .kt b { color: var(--k); }

.dates { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.dates input { width: 100%; }
.when { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; margin: 8px 0 0; font-size: .86rem; color: var(--brand); }
textarea { width: 100%; min-height: 76px; }
textarea.need { border-color: var(--warn); background: var(--warn-bg); }
.hint { margin: -4px 0 8px; font-size: .8rem; color: var(--muted); }
.send { margin-top: 22px; min-height: 50px; font-size: 1rem; display: inline-flex; align-items: center; justify-content: center; gap: 8px; }
.rule { margin: 8px 0 0; text-align: center; font-size: .78rem; color: var(--muted); }

.mine { list-style: none; padding: 0; margin: 0; }
.req { margin-bottom: 10px; display: flex; gap: 12px; align-items: flex-start; border-left: 4px solid var(--line); }
.req.pending { border-left-color: var(--warn); }
.req.approved { border-left-color: var(--ok); }
.req.rejected { border-left-color: var(--bad); }
.req.cancelled { opacity: .7; }
.ki.sm { width: 36px; height: 36px; border-radius: 10px; }
.req .body { flex: 1; min-width: 0; display: grid; gap: 3px; }
.req .top { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.req .btn { justify-self: start; margin-top: 4px; }
.why { background: var(--bad-bg); color: var(--bad); border-radius: 8px; padding: 6px 8px; }
.ok-txt { color: var(--ok); }
.empty { padding: 18px; text-align: center; color: var(--muted); font-size: .9rem; border: 1.5px dashed var(--line); border-radius: 14px; }
@media (max-width: 420px) {
  .form { padding: 14px 12px 12px; }
  .kinds { grid-template-columns: 1fr 1fr; gap: 8px; }
  .kind { flex-direction: column; align-items: flex-start; gap: 8px; padding: 12px; }
  .dates { gap: 8px; }
}
</style>
