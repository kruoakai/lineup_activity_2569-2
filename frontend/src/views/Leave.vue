<template>
  <!-- แจ้งลา / ไปราชการ / งานนโยบาย โดยเจ้าตัว → รอเจ้าหน้าที่บุคลากรตรวจ แล้วจึงลงรายงาน -->
  <div class="leave">
    <h1>แจ้งลา / ไปราชการ</h1>
    <p class="small muted lead">แจ้งเมื่อไม่ได้เข้าแถว เจ้าหน้าที่บุคลากรจะตรวจแล้วบันทึกลงรายงานประจำวันให้</p>

    <div v-if="error" class="alert bad">{{ error }}</div>
    <div v-if="message" class="alert ok">{{ message }}</div>

    <section v-if="meta" class="card stack">
      <div class="kinds" role="radiogroup" aria-label="ประเภท">
        <button v-for="k in KIND_ORDER" :key="k" type="button" role="radio" :aria-checked="kind === k" class="kind" :class="[k, { on: kind === k }]" @click="kind = k">
          <span class="ki" aria-hidden="true">{{ ICON[k] }}</span>{{ meta.kinds[k] }}
        </button>
      </div>

      <div class="dates">
        <label class="field"><span>ตั้งแต่วันที่</span>
          <input v-model="from" type="date" :min="meta.earliest" :max="meta.latest" @change="fixTo" /></label>
        <label class="field"><span>ถึงวันที่</span>
          <input v-model="to" type="date" :min="from || meta.earliest" :max="meta.latest" /></label>
      </div>
      <p v-if="from" class="small muted when">{{ from === to || !to ? thaiDate(from) : thaiRange(from, to) }} · นับเฉพาะวันทำงาน</p>

      <label class="field"><span>{{ needNote ? 'รายละเอียด (จำเป็น)' : 'รายละเอียด (ไม่บังคับ)' }}</span>
        <textarea v-model="note" maxlength="500" :class="{ need: needNote && !note.trim() }"
          :placeholder="needNote ? 'เช่น ประชุมที่ สอศ. ตามคำสั่งที่ 123/2569' : 'เช่น ไข้หวัด พบแพทย์'" /></label>

      <div>
        <span class="small muted">แนบรูป เช่น หนังสือสั่งการ ใบรับรองแพทย์</span>
        <PhotoPicker v-model="photos" :max="3" />
      </div>

      <button class="btn primary block" :disabled="busy || !kind || !from || (needNote && !note.trim())" @click="submit">
        {{ busy ? 'กำลังส่ง…' : 'ส่งให้เจ้าหน้าที่บุคลากรตรวจ' }}</button>
      <p class="small muted rule">แจ้งล่วงหน้าได้ และแจ้งย้อนหลังได้ไม่เกิน 3 วันทำการ (ตั้งแต่ {{ thaiDate(meta.earliest, false) }})</p>
    </section>

    <h2>คำแจ้งของฉัน</h2>
    <ul class="mine">
      <li v-for="r in items" :key="r.id" class="card req" :class="r.status">
        <div class="top">
          <b>{{ r.kind_label }}</b>
          <span class="badge" :class="ST[r.status].cls">{{ ST[r.status].label }}</span>
        </div>
        <div class="small">{{ r.from === r.to ? thaiDate(r.from) : thaiRange(r.from, r.to) }}</div>
        <div v-if="r.note" class="small muted">{{ r.note }}</div>
        <div v-if="r.photo_count" class="small muted">📎 แนบรูป {{ r.photo_count }} รูป</div>
        <div v-if="r.status === 'rejected'" class="why small"><b>เหตุผล:</b> {{ r.review_note }} — {{ r.reviewed_by_name }}</div>
        <div v-if="r.status === 'approved'" class="small ok-txt">✓ บันทึกลงรายงานแล้ว โดย {{ r.reviewed_by_name }}</div>
        <button v-if="r.status === 'pending'" class="btn sm danger" :disabled="busy" @click="cancel(r)">ยกเลิกคำแจ้ง</button>
      </li>
      <li v-if="loaded && !items.length" class="muted small empty">ยังไม่มีคำแจ้ง</li>
    </ul>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { api } from '../api';
import { thaiDate, thaiRange } from '../util';
import PhotoPicker from '../components/PhotoPicker.vue';

const KIND_ORDER = ['sick', 'personal', 'official', 'policy', 'other'];
const ICON = { sick: '🤒', personal: '🏠', official: '🏛️', policy: '📋', other: '📝' };
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
.leave { max-width: 640px; margin: 0 auto; }
h1 { font-size: 1.3rem; margin: 4px 0 2px; }
h2 { font-size: 1.05rem; margin: 20px 0 8px; }
.lead { margin: 0 0 12px; }
.kinds { display: grid; grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); gap: 8px; }
.kind { display: flex; align-items: center; gap: 6px; min-height: 48px; padding: 8px 10px; border: 1.5px solid var(--line); border-radius: 12px; background: var(--card); color: var(--text); font: inherit; font-weight: 600; cursor: pointer; text-align: left; }
.kind .ki { font-size: 1.2rem; }
.kind.on { border-color: var(--brand); background: var(--info-bg, #e8f0fb); color: var(--brand); box-shadow: 0 0 0 2px color-mix(in srgb, var(--brand) 25%, transparent); }
.dates { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.dates input { width: 100%; }
.when { margin: -4px 0 0; }
textarea { width: 100%; min-height: 70px; }
textarea.need { border-color: var(--warn); background: var(--warn-bg); }
.rule { margin: 0; text-align: center; }
.mine { list-style: none; padding: 0; margin: 0; }
.req { margin-bottom: 8px; display: grid; gap: 3px; }
.req.pending { border-left: 4px solid var(--warn); }
.req.approved { border-left: 4px solid var(--ok); }
.req.rejected { border-left: 4px solid var(--bad); }
.req .top { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.req .btn { justify-self: start; margin-top: 4px; }
.why { background: var(--bad-bg); color: var(--bad); border-radius: 8px; padding: 6px 8px; }
.ok-txt { color: var(--ok); }
.empty { padding: 10px 2px; }
</style>
