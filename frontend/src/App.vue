<template>
  <div class="app" :class="{ bare: route.meta.bare }">
    <header v-if="showChrome" class="topbar">
      <div class="brand">
        <img src="/icon.svg" alt="" width="28" height="28" />
        <div>
          <strong>เช็กชื่อเข้าแถว</strong>
          <small>วิทยาลัยเทคนิคชัยภูมิ</small>
        </div>
      </div>
      <div class="acct">
        <router-link to="/profile" class="who" :title="`โปรไฟล์ของ ${auth.user.full_name}`">
          <span class="av">{{ initial }}</span><span class="nm">{{ auth.user.full_name }}</span>
        </router-link>
        <button type="button" class="out" aria-label="ออกจากระบบ" title="ออกจากระบบ" @click="askLogout = true">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 17l-5-5 5-5" /><path d="M5 12h11" /></svg>
          <span>ออก</span>
        </button>
      </div>
    </header>

    <main :class="{ 'with-nav': showChrome }">
      <router-view />
    </main>

    <nav v-if="showChrome" class="bottomnav">
      <router-link to="/" exact-active-class="active"><span class="ico">✓</span>เช็กชื่อ</router-link>
      <router-link to="/history" active-class="active"><span class="ico">🗓</span>ประวัติ</router-link>
      <router-link v-if="canReport || auth.user.peer_check" to="/roster" active-class="active"><span class="ico">👥</span>รายชื่อ</router-link>
      <router-link v-if="canReport" to="/reports" active-class="active"><span class="ico">📊</span>รายงาน</router-link>
      <router-link to="/more" active-class="active"><span class="ico">☰<i v-if="pending" class="dot">{{ pending }}</i></span>เพิ่มเติม</router-link>
    </nav>
    <PasswordDialog />
    <div v-if="askLogout" class="modal-back" @click.self="askLogout = false">
      <div class="modal stack logout-box" role="dialog" aria-modal="true" aria-labelledby="lo-title">
        <div class="lo-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 17l-5-5 5-5" /><path d="M5 12h11" /></svg></div>
        <h2 id="lo-title" style="margin:0">ออกจากระบบ?</h2>
        <p class="small muted" style="margin:0">{{ auth.user?.full_name }} · ครั้งต่อไปต้องกรอกรหัสผ่านใหม่</p>
        <div class="row">
          <button type="button" class="btn grow" @click="askLogout = false">ยกเลิก</button>
          <button type="button" class="btn danger grow" :disabled="loggingOut" @click="doLogout">{{ loggingOut ? 'กำลังออก…' : 'ออกจากระบบ' }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, auth, logout } from './api';
import PasswordDialog from './components/PasswordDialog.vue';
import { VIEW_REPORT } from './router';

const route = useRoute();
const router = useRouter();
const askLogout = ref(false);
const loggingOut = ref(false);
const initial = computed(() => (auth.user?.full_name || '?').replace(/^(นาย|นางสาว|นาง|ว่าที่ร้อยตรี|ดร\.)\s*/, '').trim().charAt(0) || '?');
async function doLogout() {
  loggingOut.value = true;
  try { await logout(); } finally {
    loggingOut.value = false;
    askLogout.value = false;
    router.replace('/login');
  }
}
const showChrome = computed(() => auth.user && !route.meta.public && !route.meta.setup && !route.meta.bare);
const canReport = computed(() => auth.user && VIEW_REPORT(auth.user));

// จำนวนเอกสารที่รอผู้ใช้ลงนาม (แสดงเป็นจุดแดงที่เมนูเพิ่มเติม)
const pending = ref(0);
watch(() => [auth.user?.id, route.path], async () => {
  if (!auth.user || auth.user.must_change_password || !auth.user.consented) { pending.value = 0; return; }
  try { const r = await api('/api/report-docs/pending-count'); pending.value = r.count + (r.returned || 0); } catch { pending.value = 0; }
}, { immediate: true });
</script>
