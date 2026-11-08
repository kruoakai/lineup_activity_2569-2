<template>
  <div class="setup">
    <h1>ตั้งค่าก่อนใช้งานครั้งแรก</h1>
    <p class="muted">สวัสดีครับ {{ auth.user.full_name }}</p>

    <form v-if="auth.user.must_change_password" class="card stack" @submit.prevent="changePassword">
      <h2>1. ตั้งรหัสผ่านใหม่</h2>
      <div v-if="error" class="alert bad">{{ error }}</div>
      <label class="field"><span>รหัสผ่านเริ่มต้นที่ได้รับ</span>
        <input v-model="current" type="password" autocomplete="current-password" required /></label>
      <label class="field"><span>รหัสผ่านใหม่ (อย่างน้อย 8 ตัวอักษร)</span>
        <input v-model="next" type="password" autocomplete="new-password" minlength="8" required /></label>
      <label class="field"><span>ยืนยันรหัสผ่านใหม่</span>
        <input v-model="confirm" type="password" autocomplete="new-password" required /></label>
      <button class="btn primary block" :disabled="busy">บันทึกรหัสผ่าน</button>
    </form>

    <div v-else class="card stack">
      <h2>2. การใช้ข้อมูลส่วนบุคคล (PDPA)</h2>
      <div v-if="error" class="alert bad">{{ error }}</div>
      <p>ระบบนี้เก็บข้อมูลต่อไปนี้ <b>เฉพาะตอนที่ท่านกดเช็กชื่อ</b> เพื่อยืนยันการเข้าแถวของบุคลากร</p>
      <ul>
        <li>พิกัดตำแหน่ง (GPS) และความแม่นยำ ณ เวลาที่เช็กชื่อ — <b>ไม่มีการติดตามตำแหน่งตลอดวัน</b></li>
        <li>วันเวลา วิธีเช็กชื่อ และรหัสอุปกรณ์แบบสุ่ม (ใช้ตรวจการเช็กชื่อแทนกัน)</li>
        <li>รูปถ่ายหลักฐาน เฉพาะกรณีที่ท่านเลือกแนบ — ลบอัตโนมัติเมื่อครบ {{ retention }} วัน</li>
      </ul>
      <p class="small muted">ผู้ที่เห็นข้อมูล: ตัวท่าน หัวหน้าแผนก/ครูผู้รับมอบหมายในแผนก เจ้าหน้าที่งานกิจกรรม ผู้บริหาร และผู้ดูแลระบบ
        ข้อมูลใช้เพื่อการบริหารงานบุคคลของวิทยาลัยเท่านั้น</p>
      <label class="row"><input v-model="accept" type="checkbox" /> <span>ข้าพเจ้ารับทราบและยินยอม</span></label>
      <button class="btn primary block" :disabled="!accept || busy" @click="consent">เริ่มใช้งาน</button>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, auth } from '../api';

const route = useRoute();
const router = useRouter();
const current = ref('');
const next = ref('');
const confirm = ref('');
const accept = ref(false);
const busy = ref(false);
const error = ref('');
const retention = 120;

async function changePassword() {
  error.value = '';
  if (next.value !== confirm.value) { error.value = 'รหัสผ่านใหม่ไม่ตรงกัน'; return; }
  busy.value = true;
  try {
    const r = await api('/api/auth/change-password', { method: 'POST', body: { currentPassword: current.value, newPassword: next.value } });
    auth.token = r.accessToken;
    auth.user = { ...auth.user, must_change_password: false };
    if (auth.user.consented) done();
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}

async function consent() {
  busy.value = true;
  error.value = '';
  try {
    await api('/api/auth/consent', { method: 'POST', body: { accept: true } });
    auth.user = { ...auth.user, consented: true };
    done();
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}

function done() {
  const n = typeof route.query.next === 'string' && route.query.next.startsWith('/') ? route.query.next : '/';
  router.replace(n);
}
</script>

<style scoped>
.setup { max-width: 480px; margin: 4vh auto 0; }
ul { padding-left: 1.2rem; margin: 0; }
li { margin-bottom: 6px; }
</style>
