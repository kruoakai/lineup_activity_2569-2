<template>
  <div>
    <h1>สำรองฐานข้อมูล</h1>
    <div v-if="error" class="alert bad">{{ error }}</div>
    <div v-if="msg" class="alert ok">{{ msg }}</div>

    <section class="card stack">
      <p><b>อัตโนมัติ:</b> {{ data.schedule || 'ทุกเที่ยงคืนหลังวันทำการ' }}</p>
      <p v-if="data.last" class="small">ครั้งล่าสุด {{ dt(data.last.at) }} ·
        <span :class="data.last.ok ? 'badge ok' : 'badge bad'">{{ data.last.ok ? 'สำเร็จ' : 'ล้มเหลว' }}</span>
        ({{ data.last.reason === 'manual' ? 'กดสำรองเอง' : 'ตามเวลา' }})</p>
      <p v-if="data.available === false" class="alert warn small">ไม่พบโฟลเดอร์สำรองข้อมูลบนเซิร์ฟเวอร์ (รันในเครื่องนักพัฒนา)</p>
      <button class="btn primary" :disabled="busy || data.pending" @click="runNow">{{ data.pending ? 'กำลังสำรอง…' : '💾 สำรองตอนนี้' }}</button>
      <p class="small muted">ไฟล์ฐานข้อมูลมีข้อมูลส่วนบุคคลทั้งหมด ดาวน์โหลดเฉพาะเมื่อจำเป็น และเก็บในที่ปลอดภัย</p>
    </section>

    <section class="card stack">
      <h3 style="margin:0">ส่งออก Excel เพื่อทำรายงานต่อ</h3>
      <p class="small muted" style="margin:0">ไฟล์ .xlsx มี 8 แผ่นงาน: ภาพรวม · รายบุคคล · รายแผนก · รายหน่วยงาน · รายวัน (พร้อมร้อยละ) · บันทึกการเข้าแถวทุกรายการ · บุคลากร · ปฏิทิน</p>
      <div class="row">
        <label class="field grow"><span>ตั้งแต่</span><input v-model="xFrom" type="date" /></label>
        <label class="field grow"><span>ถึง</span><input v-model="xTo" type="date" :min="xFrom" /></label>
      </div>
      <button class="btn primary" :disabled="busy || !xFrom || !xTo" @click="exportXlsx">📊 ส่งออก Excel (.xlsx)</button>
    </section>

    <section class="card">
      <h3>ไฟล์สำรอง ({{ data.items?.length || 0 }})</h3>
      <div class="table-wrap">
        <table>
          <thead><tr><th>ไฟล์</th><th>ประเภท</th><th class="num">ขนาด</th><th></th></tr></thead>
          <tbody>
            <tr v-for="f in data.items" :key="f.name">
              <td class="small">{{ f.name }}</td>
              <td>{{ f.kind === 'database' ? 'ฐานข้อมูล' : 'รูปภาพ' }}</td>
              <td class="num">{{ size(f.bytes) }}</td>
              <td class="dl">
                <button v-if="f.kind === 'database'" class="btn sm" :disabled="busy" title="ไฟล์ .sql เปิดด้วย phpMyAdmin / MySQL Workbench / HeidiSQL" @click="download(f, 'sql')">⬇ .sql</button>
                <button class="btn sm" :disabled="busy" title="ไฟล์บีบอัด (ขนาดเล็ก)" @click="download(f)">⬇ {{ f.kind === 'database' ? '.gz' : '.tar.gz' }}</button>
              </td>
            </tr>
            <tr v-if="!data.items?.length"><td colspan="4" class="muted">ยังไม่มีไฟล์สำรอง</td></tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from 'vue';
import { api, postDownload } from '../../api';
import { serverToday, addDays } from '../../util';
import { askPassword } from '../../confirm';

const data = ref({});
const busy = ref(false);
const error = ref('');
const msg = ref('');
let timer;

const dt = (iso) => new Date(iso).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
const size = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

async function load() {
  try { data.value = await api('/api/admin/backups'); } catch (e) { error.value = e.message; }
}

async function runNow() {
  const password = await askPassword('ยืนยันการสำรองข้อมูล');
  if (!password) return;
  busy.value = true;
  try {
    await api('/api/admin/backups/run', { method: 'POST', body: { password } });
    msg.value = 'ส่งคำสั่งสำรองแล้ว ไฟล์จะขึ้นในรายการภายในประมาณ 1 นาที';
    await load();
  } catch (e) { error.value = e.message; } finally { busy.value = false; }
}

async function download(f, format) {
  const filename = format === 'sql' ? f.name.replace(/\.gz$/, '') : f.name;
  const password = await askPassword('ยืนยันการดาวน์โหลดไฟล์สำรอง', { detail: filename });
  if (!password) return;
  busy.value = true;
  try {
    await postDownload('/api/admin/backups/download', { name: f.name, password, format }, filename);
  } catch (e) { error.value = e.message; } finally { busy.value = false; }
}

const xFrom = ref('');
const xTo = ref('');
async function exportXlsx() {
  const password = await askPassword('ยืนยันการส่งออกข้อมูล', { detail: `${xFrom.value} ถึง ${xTo.value} · มีข้อมูลส่วนบุคคล` });
  if (!password) return;
  busy.value = true;
  error.value = '';
  try {
    await postDownload('/api/admin/export.xlsx', { password, from: xFrom.value, to: xTo.value }, `ข้อมูลเข้าแถว_${xFrom.value}_${xTo.value}.xlsx`);
    msg.value = 'ส่งออก Excel แล้ว';
  } catch (e) { error.value = e.message; } finally { busy.value = false; }
}

onMounted(async () => {
  load();
  timer = setInterval(load, 15000);
  try { xTo.value = await serverToday(); xFrom.value = addDays(xTo.value, -30); } catch { /* ignore */ }
});
onUnmounted(() => clearInterval(timer));
</script>

<style scoped>
.dl { display: flex; gap: 6px; justify-content: flex-end; flex-wrap: wrap; }
</style>
