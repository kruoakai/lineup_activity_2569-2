<template>
  <div>
    <router-link to="/profile" class="card me">
      <div class="av"><img v-if="avatar" :src="avatar" alt="" /><span v-else>{{ auth.user.full_name.slice(0, 1) }}</span></div>
      <div class="grow">
        <h2 style="margin:0">{{ auth.user.full_name }}</h2>
        <p class="small muted" style="margin:0">
          {{ auth.user.position_title || ROLE[auth.user.role] }} · {{ auth.user.department_name || 'ไม่ระบุแผนก' }}<br />
          รหัส {{ auth.user.employee_code }}<template v-if="auth.user.can_proxy"> · ตัวแทนเช็กชื่อแผนก</template>
        </p>
      </div>
      <span class="muted">แก้ไข ›</span>
    </router-link>

    <section class="card">
      <h3>เอกสารและรายงาน</h3>
      <ul class="list">
        <li><router-link class="main" to="/report-docs">📝 เอกสารเสนอลงนาม</router-link><span v-if="pending" class="badge warn">รอท่าน {{ pending }}</span></li>
        <li v-if="viewAll"><router-link class="main" to="/executive">📈 รายงานผู้บริหาร (4 รูปแบบ)</router-link></li>
      </ul>
    </section>

    <section v-if="auth.user.can_proxy && !manage" class="card row small">
      <span class="badge info">ตัวแทนเช็กชื่อแผนก</span>
      <router-link to="/roster" class="grow">ไปหน้าเช็กแทนคนในแผนก ›</router-link>
    </section>

    <section v-if="manage" class="card">
      <h3>งานกิจกรรม</h3>
      <ul class="list">
        <li><router-link class="main" to="/qr">📺 แสดง QR Code ที่จุดเข้าแถว</router-link></li>
        <li><router-link class="main" to="/roster?status=pending">🕑 ตรวจสอบคำขอรอตรวจสอบ</router-link></li>
        <li><router-link class="main" to="/calendar">🗓 ปฏิทินวันเข้าแถว / ภาคเรียน</router-link></li>
      </ul>
    </section>

    <section v-if="auth.user.role === 'admin'" class="card">
      <h3>ผู้ดูแลระบบ</h3>
      <ul class="list">
        <li><router-link class="main" to="/admin/users">👤 จัดการผู้ใช้และสิทธิ์</router-link></li>
        <li><router-link class="main" to="/admin/settings">⚙️ ตั้งค่าเวลา พื้นที่ (แผนที่) และวิธีเช็กชื่อ</router-link></li>
        <li><router-link class="main" to="/admin/report-setup">🖋 แบบรายงาน ผู้ลงนาม และอีเมล</router-link></li>
        <li><router-link class="main" to="/admin/data">🎲 ข้อมูลจำลอง / เริ่มใช้งานจริง</router-link></li>
        <li><router-link class="main" to="/admin/backups">💾 สำรองฐานข้อมูล</router-link></li>
      </ul>
    </section>

    <section class="card stack">
      <h3>ติดตั้งเป็นแอปบนมือถือ</h3>
      <p class="small muted">Android (Chrome): เมนู ⋮ → “ติดตั้งแอป” หรือ “เพิ่มลงในหน้าจอหลัก”<br />
        iPhone (Safari): ปุ่มแชร์ → “เพิ่มไปยังหน้าจอโฮม”</p>
    </section>

    <section class="card stack">
      <button class="btn danger block" @click="doLogout">ออกจากระบบ</button>
    </section>

    <section class="card">
      <h3>เกี่ยวกับระบบ</h3>
      <p class="small">ระบบเช็กชื่อเข้าแถวบุคลากร วิทยาลัยเทคนิคชัยภูมิ</p>
      <Credits />
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api, auth, imageUrl, logout } from '../api';
import { ROLE } from '../util';
import { MANAGE } from '../router';
import Credits from '../components/Credits.vue';

const router = useRouter();
const manage = computed(() => MANAGE(auth.user));
const viewAll = computed(() => ['activity', 'executive', 'admin'].includes(auth.user.role) || pending.value > 0);
const pending = ref(0);
const avatar = ref(null);

async function doLogout() {
  await logout();
  router.replace('/login');
}

onMounted(async () => {
  try { pending.value = (await api('/api/report-docs/pending-count')).count; } catch { /* ignore */ }
  if (auth.user.has_avatar) avatar.value = await imageUrl(`/api/profile/avatar/${auth.user.id}`).catch(() => null);
});
</script>

<style scoped>
.me { display: flex; align-items: center; gap: 12px; text-decoration: none; color: inherit; }
.av { width: 56px; height: 56px; border-radius: 50%; overflow: hidden; background: var(--info-bg); color: var(--info); display: flex; align-items: center; justify-content: center; font-size: 1.5rem; font-weight: 700; flex: none; }
.av img { width: 100%; height: 100%; object-fit: cover; }
</style>
