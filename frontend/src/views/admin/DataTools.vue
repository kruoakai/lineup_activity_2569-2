<template>
  <div>
    <h1>ข้อมูลจำลองและเริ่มใช้งานจริง</h1>
    <div v-if="error" class="alert bad">{{ error }}</div>
    <div v-if="msg" class="alert ok">{{ msg }}</div>

    <section class="stats">
      <div class="stat"><b>{{ st.demoRows ?? '–' }}</b><span>รายการข้อมูลจำลอง</span></div>
      <div class="stat"><b>{{ st.realRows ?? '–' }}</b><span>รายการข้อมูลจริง</span></div>
    </section>
    <p v-if="st.demoRows" class="small muted">ข้อมูลจำลองช่วง {{ thaiDate(st.demoFrom, false) }} – {{ thaiDate(st.demoTo, false) }}</p>

    <section class="card stack">
      <h2>1. จำลองข้อมูลการเข้าแถว</h2>
      <p class="small">สร้างข้อมูลย้อนหลังให้บุคลากรทุกคน (ถึงเมื่อวาน) เพื่อฝึกใช้งานและดูรายงานทุกรูปแบบ
        แต่ละหน่วยงานมีอัตราเข้าแถวต่างกัน ไม่ทับวันที่มีข้อมูลจริง และรายงานจะขึ้นป้าย "มีข้อมูลจำลอง"</p>
      <label class="field"><span>ย้อนหลัง (สัปดาห์)</span>
        <select v-model.number="weeks"><option v-for="w in [1, 2, 4, 8, 12, 18]" :key="w" :value="w">{{ w }} สัปดาห์</option></select></label>
      <button class="btn primary" :disabled="busy" @click="simulate">🎲 จำลองข้อมูล</button>
    </section>

    <section class="card stack">
      <h2>2. ลบข้อมูลจำลอง</h2>
      <p class="small">ลบเฉพาะข้อมูลที่สร้างจากปุ่มจำลอง ข้อมูลจริงยังอยู่ครบ จำลองใหม่ได้ทุกเมื่อ</p>
      <button class="btn" :disabled="busy || !st.demoRows" @click="clearDemo">🧹 ลบข้อมูลจำลอง</button>
    </section>

    <section class="card stack danger-zone">
      <h2>3. เริ่มใช้งานจริง (ล้างข้อมูลการเข้าแถวทั้งหมด)</h2>
      <p class="small">ลบข้อมูลการเข้าแถว รูปหลักฐาน และเอกสารรายงาน <b>ทั้งหมด</b> รวมถึงข้อมูลช่วงทดลองใช้
        ผู้ใช้ แผนก ปฏิทิน และค่าระบบยังอยู่ — <b>ควรสำรองข้อมูลก่อน</b></p>
      <label class="field"><span>พิมพ์คำว่า <b>ล้างข้อมูลทั้งหมด</b> เพื่อยืนยัน</span><input v-model="confirmText" /></label>
      <button class="btn dangerfill" :disabled="busy || confirmText !== 'ล้างข้อมูลทั้งหมด'" @click="resetAll">⚠ ล้างข้อมูลทั้งหมด</button>
    </section>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { api } from '../../api';
import { askPassword } from '../../confirm';
import { thaiDate } from '../../util';

const st = ref({});
const weeks = ref(4);
const confirmText = ref('');
const busy = ref(false);
const error = ref('');
const msg = ref('');

async function load() {
  try { st.value = await api('/api/admin/demo'); } catch (e) { error.value = e.message; }
}

async function run(title, url, body, detail, danger) {
  const password = await askPassword(title, { detail, danger });
  if (!password) return;
  busy.value = true;
  error.value = '';
  msg.value = '';
  try {
    const r = await api(url, { method: 'POST', body: { ...body, password } });
    st.value = r.status;
    return r;
  } catch (e) {
    error.value = e.message;
    return null;
  } finally {
    busy.value = false;
    window.scrollTo(0, 0);
  }
}

async function simulate() {
  const r = await run('ยืนยันการจำลองข้อมูล', '/api/admin/demo/simulate', { weeks: weeks.value },
    `สร้างข้อมูลจำลอง ${weeks.value} สัปดาห์ย้อนหลังให้บุคลากรทุกคน`);
  if (r) msg.value = `สร้างข้อมูลจำลอง ${r.inserted} รายการ (${r.days} วันเข้าแถว, ${r.users} คน)`;
}
async function clearDemo() {
  const r = await run('ยืนยันการลบข้อมูลจำลอง', '/api/admin/demo/clear', {}, 'ลบเฉพาะข้อมูลจำลอง ข้อมูลจริงไม่ถูกลบ');
  if (r) msg.value = `ลบข้อมูลจำลอง ${r.removed} รายการแล้ว`;
}
async function resetAll() {
  const r = await run('ยืนยันการล้างข้อมูลทั้งหมด', '/api/admin/demo/reset-all', { confirmText: confirmText.value },
    'ข้อมูลการเข้าแถว รูป และเอกสารรายงานทั้งหมดจะถูกลบถาวร กู้คืนได้จากไฟล์สำรองเท่านั้น', true);
  if (r) { msg.value = `ล้างข้อมูลแล้ว ${r.removed} รายการ พร้อมเริ่มใช้งานจริง`; confirmText.value = ''; }
}

onMounted(load);
</script>

<style scoped>
.danger-zone { border-color: var(--bad); }
.dangerfill { background: var(--bad); border-color: var(--bad); color: #fff; }
</style>
