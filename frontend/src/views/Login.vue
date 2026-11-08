<template>
  <div class="login">
    <img src="/icon.svg" alt="" width="72" height="72" />
    <h1>ระบบเช็กชื่อเข้าแถว</h1>
    <p class="muted">วิทยาลัยเทคนิคชัยภูมิ</p>
    <form class="card stack" novalidate @submit.prevent="submit">
      <div v-if="error" class="alert bad" role="alert">{{ error }}</div>
      <template v-if="lineEnabled">
        <a class="btn block line-btn" href="/api/auth/line/start"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 3C6.5 3 2 6.6 2 11c0 3.9 3.5 7.2 8.3 7.9.3.1.8.2.9.5.1.3.1.7 0 1l-.1.9c0 .3-.2 1 .9.5 1.1-.5 5.9-3.5 8-5.9 1.5-1.6 2-3.2 2-4.9C22 6.6 17.5 3 12 3zM8.3 13.4H6.4c-.3 0-.5-.2-.5-.5V9.1c0-.3.2-.5.5-.5s.5.2.5.5v3.3h1.4c.3 0 .5.2.5.5s-.2.5-.5.5zm2-.5c0 .3-.2.5-.5.5s-.5-.2-.5-.5V9.1c0-.3.2-.5.5-.5s.5.2.5.5v3.8zm4.6 0c0 .2-.1.4-.3.5h-.2c-.2 0-.3-.1-.4-.2l-2-2.7v2.4c0 .3-.2.5-.5.5s-.5-.2-.5-.5V9.1c0-.2.1-.4.3-.5h.2c.2 0 .3.1.4.2l2 2.7V9.1c0-.3.2-.5.5-.5s.5.2.5.5v3.8zm3.1-2.4c.3 0 .5.2.5.5s-.2.5-.5.5h-1.4v.9h1.4c.3 0 .5.2.5.5s-.2.5-.5.5h-1.9c-.3 0-.5-.2-.5-.5V9.1c0-.3.2-.5.5-.5h1.9c.3 0 .5.2.5.5s-.2.5-.5.5h-1.4v.9H18z"/></svg><span>เข้าสู่ระบบด้วย LINE</span></a>
        <div class="or"><span>หรือใช้รหัสพนักงาน / อีเมล</span></div>
      </template>

      <div class="fld">
        <label for="login-user">รหัสพนักงาน หรืออีเมล</label>
        <div class="ibox" :class="{ invalid: touched && !username }">
          <span class="ico" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" /><path d="M4.5 20.5c.8-3.9 3.9-6 7.5-6s6.7 2.1 7.5 6" /></svg></span>
          <input id="login-user" v-model.trim="username" autocomplete="username" autocapitalize="none" spellcheck="false"
            placeholder="เช่น 475 หรืออีเมล" required />
        </div>
      </div>

      <div class="fld">
        <label for="login-pass">รหัสผ่าน</label>
        <div class="ibox" :class="{ invalid: touched && !password }">
          <span class="ico" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="4.5" y="10.5" width="15" height="10" rx="2.5" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /><path d="M12 14.5v2.5" /></svg></span>
          <input id="login-pass" v-model="password" :type="show ? 'text' : 'password'" autocomplete="current-password"
            placeholder="รหัสผ่าน" required @keyup="capsCheck" @keydown="capsCheck" />
          <button type="button" class="eye" :aria-label="show ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'" :aria-pressed="show" @click="show = !show">
            <svg v-if="!show" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
            <svg v-else viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18" /><path d="M10.6 5.1A9.8 9.8 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a9.6 9.6 0 0 0 5.4-1.6" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>
          </button>
        </div>
        <p v-if="caps" class="hint warn">⇪ Caps Lock เปิดอยู่</p>
      </div>

      <div class="row between">
        <label class="remember"><input v-model="remember" type="checkbox" /> จำฉันไว้ในระบบ</label>
        <router-link to="/forgot" class="forgot">ลืมรหัสผ่าน?</router-link>
      </div>

      <button class="btn primary block go" :disabled="busy">
        <span>{{ busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ' }}</span>
        <svg v-if="!busy" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
      </button>
      <p class="small muted center" style="margin:0">ไม่ติ๊ก "จำฉันไว้" = ออกจากระบบเมื่อปิดเบราว์เซอร์ (เหมาะกับเครื่องส่วนกลาง)</p>
    </form>
    <Credits />
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { login } from '../api';
import { deviceId } from '../util';
import Credits from '../components/Credits.vue';

const route = useRoute();
const router = useRouter();
const username = ref('');
const password = ref('');
const show = ref(false);
const remember = ref(true);
const caps = ref(false);
const touched = ref(false);
const error = ref('');
const busy = ref(false);
const lineEnabled = ref(false);
const LINE_ERRORS = {
  NOT_LINKED: 'บัญชี LINE นี้ยังไม่ได้เชื่อมกับระบบ — เข้าสู่ระบบด้วยรหัสผ่านก่อน แล้วไปที่ โปรไฟล์ → เชื่อมบัญชี LINE',
  CANCELLED: 'ยกเลิกการเข้าสู่ระบบด้วย LINE',
  INACTIVE: 'บัญชีถูกระงับ ติดต่อผู้ดูแลระบบ',
  LINE_DISABLED: 'ระบบยังไม่ได้เปิดการเข้าสู่ระบบด้วย LINE',
  LINE_STATE: 'คำขอหมดเวลา กรุณากดเข้าสู่ระบบด้วย LINE อีกครั้ง',
};
if (typeof route.query.line_error === 'string') error.value = LINE_ERRORS[route.query.line_error] || 'เข้าสู่ระบบด้วย LINE ไม่สำเร็จ กรุณาลองใหม่';
onMounted(async () => {
  try { lineEnabled.value = !!(await (await fetch('/api/auth/options')).json()).lineEnabled; } catch { /* ไม่แสดงปุ่ม */ }
});

function capsCheck(e) {
  if (e.getModifierState) caps.value = e.getModifierState('CapsLock');
}

async function submit() {
  touched.value = true;
  error.value = '';
  if (!username.value || !password.value) { error.value = 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน'; return; }
  busy.value = true;
  try {
    await login(username.value, password.value, deviceId(), remember.value);
    const next = typeof route.query.next === 'string' && route.query.next.startsWith('/') ? route.query.next : '/';
    router.replace(next);
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
.login { max-width: 400px; margin: 7vh auto 0; text-align: center; padding: 0 4px; }
.login form { text-align: left; margin-top: 18px; }
.fld label { display: block; font-size: .9rem; color: var(--muted); margin-bottom: 6px; }
.ibox { display: flex; align-items: center; gap: 10px; min-height: 52px; padding: 0 6px; border-radius: 12px;
  border: 1px solid var(--line); background: var(--bg); transition: border-color .15s, box-shadow .15s; }
.ibox:focus-within { border-color: var(--brand-2); box-shadow: 0 0 0 3px rgba(47, 111, 184, .18); background: var(--card); }
.ibox.invalid { border-color: var(--bad); }
.ibox input { border: 0; background: transparent; min-height: 48px; padding: 0; flex: 1; outline: none; }
.ico { width: 38px; height: 38px; flex: none; border-radius: 10px; background: var(--info-bg); color: var(--brand-2); display: flex; align-items: center; justify-content: center; transition: background .15s, color .15s; }
.ico svg { width: 21px; height: 21px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.ibox:focus-within .ico { background: linear-gradient(135deg, #1d4e89, #2f6fb8); color: #fff; }
.ibox.invalid .ico { background: var(--bad-bg, #fde8e8); color: var(--bad); }
.eye { flex: none; width: 40px; height: 40px; border: 0; background: transparent; border-radius: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
.eye:hover, .eye:focus-visible { background: var(--line); }
.eye svg { width: 20px; height: 20px; fill: none; stroke: var(--muted); stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.hint { margin: 6px 0 0; font-size: .82rem; }
.hint.warn { color: var(--warn); }
.between { justify-content: space-between; }
.forgot { font-size: .9rem; font-weight: 600; color: var(--brand-2); text-decoration: none; padding: 8px 4px; border-radius: 8px; }
.forgot:hover, .forgot:focus-visible { text-decoration: underline; }
.remember { display: flex; align-items: center; gap: 8px; font-size: .9rem; cursor: pointer; }
.remember input { width: 18px; height: 18px; min-height: 18px; }
.line-btn { display: flex; align-items: center; justify-content: center; gap: 10px; min-height: 50px; white-space: nowrap; background: #06c755; border-color: #06c755; color: #fff; font-weight: 700; font-size: 1.02rem; text-decoration: none; }
.line-btn:hover, .line-btn:focus-visible { background: #05b34c; }
.line-btn svg { width: 26px; height: 26px; }
.or { display: flex; align-items: center; gap: 10px; color: var(--muted); font-size: .82rem; }
.or::before, .or::after { content: ''; flex: 1; border-top: 1px solid var(--line); }
.go { min-height: 50px; font-size: 1.05rem; background: linear-gradient(90deg, #1d4e89, #2f6fb8); }
.go svg { width: 20px; height: 20px; fill: none; stroke: #fff; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
</style>
