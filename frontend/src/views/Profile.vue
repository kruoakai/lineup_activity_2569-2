<template>
  <div>
    <h1>โปรไฟล์ของฉัน</h1>
    <div v-if="error" class="alert bad">{{ error }}</div>
    <div v-if="msg" class="alert ok">{{ msg }}</div>

    <section class="card center">
      <div class="avatar-big">
        <img v-if="avatarUrl" :src="avatarUrl" alt="รูปโปรไฟล์" />
        <span v-else>{{ initials }}</span>
      </div>
      <h2 style="margin:8px 0 0">{{ auth.user.full_name }}</h2>
      <p class="small muted">รหัส {{ auth.user.employee_code }} · {{ auth.user.department_name || 'ไม่ระบุแผนก' }} · {{ ROLE[auth.user.role] }}</p>
      <div class="row" style="justify-content:center">
        <label class="btn sm">📷 เปลี่ยนรูป<input type="file" accept="image/*" hidden @change="pickAvatar" /></label>
        <button v-if="auth.user.has_avatar" class="btn sm danger" @click="removeAvatar">ลบรูป</button>
      </div>
    </section>

    <form class="card stack" @submit.prevent="saveInfo">
      <h3>ข้อมูลเบื้องต้น</h3>
      <label class="field"><span>ตำแหน่ง / วิทยฐานะ</span><input v-model="form.position_title" maxlength="150" placeholder="เช่น ครู วิทยฐานะครูชำนาญการ" /></label>
      <label class="field"><span>เบอร์โทรศัพท์</span><input v-model="form.phone" inputmode="tel" maxlength="30" /></label>
      <p class="small muted">ชื่อ-สกุลและแผนก แก้ไขโดยผู้ดูแลระบบ เพื่อให้ตรงกับทะเบียนบุคลากร</p>
      <button class="btn primary">บันทึก</button>
    </form>

    <form class="card stack" @submit.prevent="saveEmail">
      <h3>อีเมล (ใช้รับลิงก์เมื่อลืมรหัสผ่าน)</h3>
      <label class="field"><span>อีเมล</span><input v-model="email" type="email" autocapitalize="none" /></label>
      <button class="btn">เปลี่ยนอีเมล</button>
    </form>

    <section class="card stack">
      <h3>ลายเซ็น (สำหรับลงนามเอกสารรายงาน)</h3>
      <img v-if="sigUrl && !newSig" :src="sigUrl" class="sig" alt="ลายเซ็นที่บันทึกไว้" />
      <SignaturePad @change="(v) => (newSig = v)" />
      <button class="btn primary" :disabled="!newSig" @click="saveSignature">บันทึกลายเซ็น</button>
    </section>

    <section v-if="lineEnabled || auth.user.line_linked" class="card stack">
      <h3 style="margin:0">บัญชี LINE</h3>
      <template v-if="auth.user.line_linked">
        <p class="small" style="margin:0"><span class="badge ok">เชื่อมแล้ว</span> {{ auth.user.line_name || 'บัญชี LINE' }} — กด "เข้าสู่ระบบด้วย LINE" ที่หน้าเข้าสู่ระบบได้เลย ไม่ต้องกรอกรหัสผ่าน</p>
        <button class="btn" :disabled="busyLine" @click="unlinkLine">ยกเลิกการเชื่อม LINE</button>
      </template>
      <template v-else>
        <p class="small muted" style="margin:0">เชื่อมครั้งเดียว ครั้งต่อไปเข้าสู่ระบบด้วย LINE ได้ทันที</p>
        <button class="btn block line-btn" :disabled="busyLine" @click="linkLine"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 3C6.5 3 2 6.6 2 11c0 3.9 3.5 7.2 8.3 7.9.3.1.8.2.9.5.1.3.1.7 0 1l-.1.9c0 .3-.2 1 .9.5 1.1-.5 5.9-3.5 8-5.9 1.5-1.6 2-3.2 2-4.9C22 6.6 17.5 3 12 3zM8.3 13.4H6.4c-.3 0-.5-.2-.5-.5V9.1c0-.3.2-.5.5-.5s.5.2.5.5v3.3h1.4c.3 0 .5.2.5.5s-.2.5-.5.5zm2-.5c0 .3-.2.5-.5.5s-.5-.2-.5-.5V9.1c0-.3.2-.5.5-.5s.5.2.5.5v3.8zm4.6 0c0 .2-.1.4-.3.5h-.2c-.2 0-.3-.1-.4-.2l-2-2.7v2.4c0 .3-.2.5-.5.5s-.5-.2-.5-.5V9.1c0-.2.1-.4.3-.5h.2c.2 0 .3.1.4.2l2 2.7V9.1c0-.3.2-.5.5-.5s.5.2.5.5v3.8zm3.1-2.4c.3 0 .5.2.5.5s-.2.5-.5.5h-1.4v.9h1.4c.3 0 .5.2.5.5s-.2.5-.5.5h-1.9c-.3 0-.5-.2-.5-.5V9.1c0-.3.2-.5.5-.5h1.9c.3 0 .5.2.5.5s-.2.5-.5.5h-1.4v.9H18z"/></svg><span>เชื่อมบัญชี LINE</span></button>
      </template>
    </section>

    <section class="card stack">
      <router-link class="btn block" to="/setup" @click.prevent="changePw">เปลี่ยนรหัสผ่าน</router-link>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, auth, imageUrl } from '../api';
import { askPassword } from '../confirm';
import { ROLE, compressImage } from '../util';
import SignaturePad from '../components/SignaturePad.vue';

const router = useRouter();
const route = useRoute();
const lineEnabled = ref(false);
const busyLine = ref(false);
async function linkLine() {
  busyLine.value = true;
  try { window.location.href = (await api('/api/auth/line/link', { method: 'POST' })).url; } catch (e) { error.value = e.message; busyLine.value = false; }
}
async function unlinkLine() {
  if (!confirm('ยกเลิกการเชื่อมบัญชี LINE? ครั้งต่อไปต้องเข้าสู่ระบบด้วยรหัสผ่าน')) return;
  busyLine.value = true;
  try {
    await api('/api/auth/line', { method: 'DELETE' });
    auth.user = { ...auth.user, line_linked: false, line_name: '' };
    msg.value = 'ยกเลิกการเชื่อม LINE แล้ว';
  } catch (e) { error.value = e.message; } finally { busyLine.value = false; }
}
const form = ref({ position_title: auth.user.position_title || '', phone: auth.user.phone || '' });
const email = ref(auth.user.email || '');
const error = ref('');
const msg = ref('');
const avatarUrl = ref(null);
const sigUrl = ref(null);
const newSig = ref(null);
const initials = computed(() => (auth.user.full_name || '?').slice(0, 1));

function done(user, text) {
  auth.user = { ...auth.user, ...user };
  msg.value = text;
  error.value = '';
  window.scrollTo(0, 0);
}
function fail(e) { error.value = e.message; msg.value = ''; window.scrollTo(0, 0); }

async function loadImages() {
  avatarUrl.value = auth.user.has_avatar ? await imageUrl(`/api/profile/avatar/${auth.user.id}`).catch(() => null) : null;
  sigUrl.value = auth.user.has_signature ? await imageUrl('/api/profile/signature').catch(() => null) : null;
}

async function saveInfo() {
  try { done((await api('/api/profile', { method: 'PUT', body: form.value })).user, 'บันทึกข้อมูลแล้ว'); } catch (e) { fail(e); }
}

async function saveEmail() {
  const password = await askPassword('ยืนยันการเปลี่ยนอีเมล');
  if (!password) return;
  try { done((await api('/api/profile/email', { method: 'PUT', body: { email: email.value, password } })).user, 'เปลี่ยนอีเมลแล้ว'); } catch (e) { fail(e); }
}

async function pickAvatar(ev) {
  const f = ev.target.files?.[0];
  ev.target.value = '';
  if (!f) return;
  try {
    const image = await compressImage(f, 512, 0.8);
    done((await api('/api/profile/avatar', { method: 'POST', body: { image } })).user, 'เปลี่ยนรูปโปรไฟล์แล้ว');
    await loadImages();
  } catch (e) { fail(e); }
}

async function removeAvatar() {
  try { done((await api('/api/profile/avatar', { method: 'DELETE' })).user, 'ลบรูปแล้ว'); avatarUrl.value = null; } catch (e) { fail(e); }
}

async function saveSignature() {
  const password = await askPassword('ยืนยันการบันทึกลายเซ็น', { detail: 'ลายเซ็นนี้จะใช้ลงนามเอกสารรายงานในนามของท่าน' });
  if (!password) return;
  try {
    done((await api('/api/profile/signature', { method: 'POST', body: { image: newSig.value, password } })).user, 'บันทึกลายเซ็นแล้ว');
    newSig.value = null;
    await loadImages();
  } catch (e) { fail(e); }
}

function changePw() {
  auth.user = { ...auth.user, must_change_password: true };
  router.push('/setup');
}

onMounted(async () => {
  loadImages();
  try { lineEnabled.value = !!(await (await fetch('/api/auth/options')).json()).lineEnabled; } catch { /* ignore */ }
  if (route.query.line === 'linked') {
    try { auth.user = { ...auth.user, ...(await api('/api/auth/me')).user }; } catch { /* ignore */ }
    msg.value = 'เชื่อมบัญชี LINE แล้ว ครั้งต่อไปกด "เข้าสู่ระบบด้วย LINE" ได้เลย';
    router.replace('/profile');
  } else if (route.query.line_error === 'LINE_TAKEN') {
    error.value = 'บัญชี LINE นี้เชื่อมกับผู้ใช้คนอื่นอยู่แล้ว';
    router.replace('/profile');
  }
});
</script>

<style scoped>
.line-btn { display: flex; align-items: center; justify-content: center; gap: 10px; min-height: 46px; background: #06c755; border-color: #06c755; color: #fff; font-weight: 700; }
.line-btn svg { width: 24px; height: 24px; }
.avatar-big { width: 96px; height: 96px; border-radius: 50%; margin: 0 auto; overflow: hidden; background: var(--info-bg); color: var(--info); display: flex; align-items: center; justify-content: center; font-size: 2.4rem; font-weight: 700; }
.avatar-big img { width: 100%; height: 100%; object-fit: cover; }
.sig { max-height: 90px; max-width: 100%; background: #fff; border-radius: 8px; padding: 6px; align-self: flex-start; }
</style>
