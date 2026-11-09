<template>
  <div>
    <h1>สำรองข้อมูลงานของฉัน</h1>
    <p class="small muted" style="margin-top:-6px">ดาวน์โหลดข้อมูลงานตามหน้าที่ของท่านเป็นไฟล์ Excel เก็บไว้เอง เปิดอ่านหรือทำรายงานต่อได้ทันที
      — การสำรองทั้งระบบเพื่อกู้คืนเป็นหน้าที่ของผู้ดูแลระบบ</p>

    <div v-if="error" class="alert bad">{{ error }}</div>
    <div v-if="msg" class="alert ok">{{ msg }}</div>

    <section v-if="info && !info.available" class="alert info">บทบาท “{{ ROLE[auth.user.role] }}” ไม่มีข้อมูลงานให้สำรอง — ดูประวัติการเข้าแถวของตนเองได้ที่เมนู “ประวัติ”</section>

    <section v-else-if="info" class="card stack">
      <div class="who-row">
        <span class="ico" aria-hidden="true">📦</span>
        <div><b>{{ ROLE[auth.user.role] }}</b><br /><span class="small muted">ไฟล์ Excel {{ info.sheets.length + 1 }} แผ่นงาน</span></div>
      </div>
      <ul class="sheets">
        <li>เกี่ยวกับไฟล์นี้</li>
        <li v-for="s in info.sheets" :key="s">{{ s }}</li>
      </ul>
      <div class="presets">
        <button v-for="p in PRESETS" :key="p.k" type="button" :class="{ on: preset === p.k }" @click="applyPreset(p.k)">{{ p.label }}</button>
      </div>
      <div class="row" style="flex-wrap:wrap;gap:8px">
        <label class="field grow"><span>ตั้งแต่</span><input v-model="from" type="date" @change="preset = ''" /></label>
        <label class="field grow"><span>ถึง</span><input v-model="to" type="date" :min="from" @change="preset = ''" /></label>
      </div>
      <p class="small muted" style="margin:0">ช่วงวันที่: <b>{{ thaiRange(from, to) }}</b></p>
      <button class="btn primary block" :disabled="busy || !from || !to" @click="download">⬇ ดาวน์โหลด Excel (.xlsx)</button>
      <p class="small muted" style="margin:0">ไฟล์มีข้อมูลส่วนบุคคล — เก็บในเครื่องหรือไดรฟ์ของหน่วยงานที่ปลอดภัย ไม่ส่งต่อในกลุ่มแชต</p>
    </section>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { api, auth, postDownload } from '../api';
import { askPassword } from '../confirm';
import { ROLE, serverToday, addDays, thaiRange } from '../util';

const PRESETS = [{ k: 'month', label: 'เดือนนี้' }, { k: 'last', label: 'เดือนที่แล้ว' }, { k: 'term', label: '6 เดือนล่าสุด' }, { k: 'year', label: '1 ปีล่าสุด' }];
const info = ref(null);
const from = ref('');
const to = ref('');
const today = ref('');
const preset = ref('month');
const busy = ref(false);
const error = ref('');
const msg = ref('');

function applyPreset(k) {
  preset.value = k;
  const t = today.value;
  const first = `${t.slice(0, 8)}01`;
  if (k === 'month') { from.value = first; to.value = t; }
  if (k === 'last') { to.value = addDays(first, -1); from.value = `${to.value.slice(0, 8)}01`; }
  if (k === 'term') { from.value = addDays(t, -182); to.value = t; }
  if (k === 'year') { from.value = addDays(t, -365); to.value = t; }
}

async function download() {
  const password = await askPassword('ยืนยันการสำรองข้อมูล', { detail: `${thaiRange(from.value, to.value)} · มีข้อมูลส่วนบุคคล` });
  if (!password) return;
  busy.value = true;
  error.value = '';
  msg.value = '';
  try {
    await postDownload('/api/my-backup/xlsx', { password, from: from.value, to: to.value }, `สำรองข้อมูลงาน-${auth.user.employee_code}-${from.value}_${to.value}.xlsx`);
    msg.value = 'ดาวน์โหลดแล้ว — ตรวจไฟล์ในโฟลเดอร์ดาวน์โหลดของเครื่อง';
  } catch (e) { error.value = e.message; } finally { busy.value = false; }
}

onMounted(async () => {
  try {
    today.value = await serverToday();
    applyPreset('month');
    info.value = await api('/api/my-backup');
  } catch (e) { error.value = e.message; }
});
</script>

<style scoped>
.who-row { display: flex; align-items: center; gap: 12px; }
.who-row .ico { font-size: 1.8rem; width: 52px; height: 52px; border-radius: 14px; background: var(--info-bg); display: flex; align-items: center; justify-content: center; }
.sheets { margin: 0; padding: 10px 12px 10px 30px; background: var(--bg); border-radius: 12px; columns: 2; font-size: .88rem; }
@media (max-width: 420px) { .sheets { columns: 1; } }
.presets { display: flex; gap: 6px; flex-wrap: wrap; }
.presets button { min-height: 34px; padding: 0 12px; border-radius: 999px; border: 1px solid var(--line); background: var(--card); color: var(--text); font: inherit; font-size: .85rem; cursor: pointer; }
.presets button.on { background: var(--fill); border-color: var(--fill); color: #fff; }
</style>
