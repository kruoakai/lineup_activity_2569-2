<template>
  <div class="narrow">
    <h1>ลืมรหัสผ่าน</h1>
    <div v-if="mailEnabled === false" class="card stack">
      <div class="alert warn">ระบบยังไม่เปิดการรีเซ็ตทางอีเมล</div>
      <p>ติดต่อผู้ดูแลระบบ หรือเจ้าหน้าที่งานกิจกรรม เพื่อขอรหัสผ่านใหม่ ผู้ดูแลจะออกรหัสผ่านชั่วคราวให้ และท่านตั้งรหัสใหม่ได้เมื่อเข้าสู่ระบบ</p>
      <router-link class="btn block" to="/login">กลับหน้าเข้าสู่ระบบ</router-link>
    </div>
    <form v-else class="card stack" @submit.prevent="submit">
      <p class="muted">กรอกรหัสพนักงานหรืออีเมล ระบบจะส่งลิงก์ตั้งรหัสผ่านใหม่ไปที่อีเมลที่ลงทะเบียนไว้ ลิงก์ใช้ได้ 30 นาที</p>
      <div v-if="error" class="alert bad">{{ error }}</div>
      <div v-if="done" class="alert ok">{{ done }}</div>
      <label class="field"><span>รหัสพนักงาน หรืออีเมล</span>
        <input v-model.trim="identifier" autocapitalize="none" required /></label>
      <button class="btn primary block" :disabled="busy || !!done">{{ busy ? 'กำลังส่ง…' : 'ส่งลิงก์ไปที่อีเมล' }}</button>
      <p class="small muted">ไม่ได้รับอีเมล? ตรวจในโฟลเดอร์จดหมายขยะ หรือติดต่อผู้ดูแลระบบ (อีเมลในระบบอาจไม่ถูกต้อง)</p>
      <router-link class="btn block" to="/login">‹ กลับหน้าเข้าสู่ระบบ</router-link>
    </form>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { api } from '../api';

const identifier = ref('');
const busy = ref(false);
const error = ref('');
const done = ref('');
const mailEnabled = ref(null);

onMounted(async () => {
  try { mailEnabled.value = (await api('/api/auth/options')).mailEnabled; } catch { mailEnabled.value = true; }
});

async function submit() {
  busy.value = true;
  error.value = '';
  try {
    done.value = (await api('/api/auth/forgot', { method: 'POST', body: { identifier: identifier.value } }, false)).message;
  } catch (e) {
    if (e.code === 'MAIL_DISABLED') mailEnabled.value = false;
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
.narrow { max-width: 420px; margin: 6vh auto 0; }
</style>
