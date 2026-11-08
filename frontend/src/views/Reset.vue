<template>
  <div class="narrow">
    <h1>ตั้งรหัสผ่านใหม่</h1>
    <form class="card stack" @submit.prevent="submit">
      <div v-if="error" class="alert bad">{{ error }}</div>
      <div v-if="done" class="alert ok">{{ done }}</div>
      <template v-if="!done">
        <label class="field"><span>รหัสผ่านใหม่ (อย่างน้อย 8 ตัวอักษร)</span>
          <PasswordInput v-model="pw" autocomplete="new-password" minlength="8" required /></label>
        <label class="field"><span>ยืนยันรหัสผ่านใหม่</span>
          <PasswordInput v-model="pw2" autocomplete="new-password" required /></label>
        <button class="btn primary block" :disabled="busy">บันทึกรหัสผ่านใหม่</button>
      </template>
      <router-link class="btn block" to="/login">ไปหน้าเข้าสู่ระบบ</router-link>
    </form>
  </div>
</template>

<script setup>
import PasswordInput from '../components/PasswordInput.vue';
import { ref } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '../api';

const route = useRoute();
const pw = ref('');
const pw2 = ref('');
const busy = ref(false);
const error = ref('');
const done = ref('');

async function submit() {
  error.value = '';
  if (pw.value !== pw2.value) { error.value = 'รหัสผ่านไม่ตรงกัน'; return; }
  busy.value = true;
  try {
    done.value = (await api('/api/auth/reset', { method: 'POST', body: { token: route.query.token, newPassword: pw.value } }, false)).message;
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
.narrow { max-width: 420px; margin: 6vh auto 0; }
</style>
