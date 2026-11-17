<template>
  <!-- เจ้าหน้าที่บุคลากรตรวจคำแจ้งลา/ราชการ/นโยบายของบุคลากร: บันทึก (ลงรายงาน) หรือ ไม่อนุมัติพร้อมเหตุผล -->
  <section class="card review">
    <div class="chips">
      <button type="button" :class="{ on: view === 'pending' }" @click="view = 'pending'">รอตรวจ ({{ pendingN }})</button>
      <button type="button" :class="{ on: view === 'done' }" @click="view = 'done'">ตรวจแล้วล่าสุด</button>
    </div>
    <div v-if="error" class="alert bad">{{ error }}</div>
    <div v-if="message" class="alert ok">{{ message }}
      <template v-for="d in docs" :key="d.id"><br />⚠ วันที่ {{ thaiDate(d.day, false) }} มีรายงานประจำวันแล้ว — <router-link :to="`/report-docs/${d.id}`">เปิดเอกสาร</router-link> แล้วกด "ดึงข้อมูลใหม่"</template>
    </div>

    <ul class="rq">
      <li v-for="r in items" :key="r.id" class="it" :class="r.status">
        <div class="top">
          <span class="grow"><b>{{ r.name }}</b><span class="small muted"> · {{ r.department || '-' }}</span></span>
          <span class="badge" :class="KCLS[r.kind]">{{ r.kind_label }}</span>
        </div>
        <div class="small"><b>{{ r.from === r.to ? thaiDate(r.from) : thaiRange(r.from, r.to) }}</b>
          <template v-if="r.days"> · {{ r.days.length }} วันทำงาน</template></div>
        <div v-if="r.note" class="small note">{{ r.note }}</div>
        <div v-if="r.photo_count" class="pics">
          <button v-for="n in r.photo_count" :key="n" type="button" class="pic" @click="openPhoto(r, n - 1)">📎 รูป {{ n }}</button>
        </div>
        <div v-if="r.existing?.length" class="warnbox small">
          มีสถานะในวันนั้นอยู่แล้ว (จะถูกแทนที่เมื่อกดบันทึก):
          <span v-for="e in r.existing" :key="e.day" class="ex">{{ thaiDate(e.day, false) }} {{ statusLabel(e) }}</span>
        </div>
        <div class="small muted">แจ้งเมื่อ {{ thaiDateTime(r.created_at) }}</div>

        <template v-if="r.status === 'pending'">
          <div v-if="rejecting === r.id" class="stack rej">
            <label class="field"><span>เหตุผลที่ไม่อนุมัติ (ผู้แจ้งจะเห็น)</span><input v-model="reason" maxlength="300" placeholder="เช่น กรุณาแนบหนังสือสั่งการ" /></label>
            <div class="row">
              <button class="btn sm danger" :disabled="busy || !reason.trim()" @click="reject(r)">ยืนยันไม่อนุมัติ</button>
              <button class="btn sm" :disabled="busy" @click="rejecting = null">ยกเลิก</button>
            </div>
          </div>
          <div v-else class="row acts">
            <button class="btn ok" :disabled="busy" @click="approve(r)">✓ บันทึกลงรายงาน</button>
            <button class="btn danger" :disabled="busy" @click="rejecting = r.id; reason = ''">ไม่อนุมัติ</button>
          </div>
        </template>
        <div v-else class="small" :class="r.status === 'approved' ? 'okt' : 'badt'">
          {{ r.status === 'approved' ? '✓ บันทึกแล้ว' : `✕ ไม่อนุมัติ: ${r.review_note}` }} — {{ r.reviewed_by_name }} {{ thaiDateTime(r.reviewed_at) }}
        </div>
      </li>
      <li v-if="loaded && !items.length" class="muted small empty">{{ view === 'pending' ? 'ไม่มีคำแจ้งรอตรวจ' : 'ยังไม่มีรายการ' }}</li>
    </ul>

    <div v-if="photoUrl" class="viewer" role="dialog" aria-label="รูปแนบ" @click="closePhoto">
      <img :src="photoUrl" alt="รูปแนบคำแจ้ง" />
      <button type="button" class="btn sm">ปิด</button>
    </div>
  </section>
</template>

<script setup>
import { onMounted, ref, watch } from 'vue';
import { api, imageUrl } from '../api';
import { thaiDate, thaiRange, thaiTime, statusLabel } from '../util';

const emit = defineEmits(['changed', 'count']);
const KCLS = { official: 'info', policy: 'info2', sick: 'muted', personal: 'muted', other: 'muted' };
const view = ref('pending');
const items = ref([]);
const pendingN = ref(0);
const loaded = ref(false);
const busy = ref(false);
const error = ref('');
const message = ref('');
const docs = ref([]);
const rejecting = ref(null);
const reason = ref('');
const photoUrl = ref('');

const thaiDateTime = (v) => (v ? `${thaiDate(new Date(v).toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' }), false)} ${thaiTime(v)} น.` : '');

async function load() {
  loaded.value = false;
  try {
    const r = await api(`/api/leave/review${view.value === 'done' ? '?status=done' : ''}`);
    items.value = r.items;
    if (view.value === 'pending') { pendingN.value = r.items.length; emit('count', pendingN.value); }
  } catch (e) { error.value = e.message; } finally { loaded.value = true; }
}

async function act(fn) {
  busy.value = true; error.value = ''; message.value = ''; docs.value = [];
  try { await fn(); } catch (e) { error.value = e.message; } finally { busy.value = false; }
}

function approve(r) {
  act(async () => {
    const res = await api(`/api/leave/${r.id}/approve`, { method: 'POST' });
    message.value = `บันทึก${r.kind_label}ของ ${r.name} แล้ว ${res.days.length} วันทำงาน`;
    docs.value = res.docs;
    await load();
    emit('changed');
  });
}

function reject(r) {
  act(async () => {
    await api(`/api/leave/${r.id}/reject`, { method: 'POST', body: { reason: reason.value } });
    message.value = `ไม่อนุมัติคำแจ้งของ ${r.name} แล้ว`;
    rejecting.value = null;
    await load();
  });
}

async function openPhoto(r, n) {
  try { photoUrl.value = await imageUrl(`/api/leave/${r.id}/photos/${n}`); } catch (e) { error.value = e.message; }
}
function closePhoto() { URL.revokeObjectURL(photoUrl.value); photoUrl.value = ''; }

watch(view, load);
onMounted(load);
</script>

<style scoped>
.chips { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }
.chips button { min-height: 34px; padding: 0 14px; border-radius: 999px; border: 1px solid var(--line); background: var(--card); color: var(--text); font: inherit; font-size: .85rem; cursor: pointer; }
.chips button.on { background: var(--fill); border-color: var(--fill); color: #fff; }
.rq { list-style: none; margin: 0; padding: 0; }
.it { display: grid; gap: 4px; padding: 12px 10px; border-bottom: 1px solid var(--line); border-left: 4px solid var(--warn); border-radius: 4px; margin-bottom: 6px; }
.it.approved { border-left-color: var(--ok); }
.it.rejected { border-left-color: var(--bad); }
.top { display: flex; align-items: center; gap: 8px; }
.top .grow { flex: 1; }
.note { background: var(--bg); border-radius: 8px; padding: 6px 8px; }
.pics { display: flex; gap: 6px; flex-wrap: wrap; }
.pic { border: 1px solid var(--line); background: var(--card); color: var(--brand-2); border-radius: 8px; padding: 4px 10px; font: inherit; font-size: .85rem; cursor: pointer; }
.warnbox { background: var(--warn-bg); color: var(--warn); border-radius: 8px; padding: 6px 8px; }
.ex { display: inline-block; margin-left: 6px; font-weight: 600; }
.acts { margin-top: 4px; }
.acts .btn { flex: 1; }
.rej { margin-top: 4px; }
.okt { color: var(--ok); }
.badt { color: var(--bad); }
.empty { padding: 10px 2px; }
.viewer { position: fixed; inset: 0; z-index: 90; background: rgba(0, 0, 0, .82); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 16px; }
.viewer img { max-width: 100%; max-height: 82vh; border-radius: 8px; }
</style>
