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
      <span class="muted" style="white-space:nowrap">แก้ไข ›</span>
    </router-link>

    <section v-for="g in groups" :key="g.title" class="menu-group">
      <h3>{{ g.title }}</h3>
      <div class="tiles">
        <router-link v-for="m in g.items" :key="m.to" :to="m.to" class="tile">
          <span class="ti" :class="m.color" aria-hidden="true">{{ m.icon }}<i v-if="m.badge" class="cnt">{{ m.badge }}</i></span>
          <span class="tt"><b>{{ m.label }}</b><small>{{ m.sub }}</small></span>
          <svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
        </router-link>
      </div>
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
const viewAll = computed(() => ['activity', 'hr', 'executive', 'admin'].includes(auth.user.role) || pending.value > 0);
const pending = ref(0);
const returned = ref(0);
const avatar = ref(null);

const groups = computed(() => {
  const u = auth.user;
  const out = [{
    title: 'เอกสารและรายงาน',
    items: [
      { to: '/report-docs', icon: '📝', color: 'amber', label: 'เอกสารเสนอลงนาม', sub: [pending.value && `รอท่านลงนาม ${pending.value} ฉบับ`, returned.value && `ถูกส่งกลับแก้ไข ${returned.value} ฉบับ`].filter(Boolean).join(' · ') || 'ดู สร้าง และลงนามเอกสาร', badge: pending.value + returned.value },
      viewAll.value && { to: '/executive', icon: '📈', color: 'blue', label: 'รายงานผู้บริหาร', sub: 'สรุปภาพรวม 4 รูปแบบ' },
      ['hr', 'activity', 'executive', 'dept_head', 'admin'].includes(u.role) && { to: '/my-backup', icon: '📦', color: 'teal', label: 'สำรองข้อมูลงานของฉัน', sub: 'ดาวน์โหลด Excel เก็บไว้เอง' },
    ],
  }];
  if (['hr', 'admin'].includes(u.role)) {
    out.push({ title: 'งานบุคลากร', items: [
      { to: '/hr', icon: '🗂', color: 'blue', label: 'งานบุคลากรประจำวัน', sub: 'ลา ราชการ นโยบาย มาสาย สร้างรายงานสรุป' },
    ] });
  }
  if ((u.can_proxy || u.peer_check) && !manage.value) {
    out.push({ title: 'เช็กชื่อแทน', items: [{ to: '/roster', icon: '👥', color: 'teal', label: 'เช็กแทนคนในแผนก', sub: u.department_name || 'รายชื่อในแผนก' }] });
  }
  if (manage.value) {
    out.push({
      title: 'งานกิจกรรม',
      items: [
        { to: '/qr', icon: '📺', color: 'indigo', label: 'แสดง QR Code', sub: 'เปิดบนจอที่จุดเข้าแถว' },
        { to: '/roster?status=pending', icon: '🕑', color: 'amber', label: 'คำขอรอตรวจสอบ', sub: 'อนุมัติ / ไม่อนุมัติ' },
        { to: '/calendar', icon: '🗓', color: 'teal', label: 'ปฏิทินวันเข้าแถว', sub: 'วันหยุด กิจกรรมพิเศษ ภาคเรียน' },
      ],
    });
  }
  if (u.role === 'admin') {
    out.push({
      title: 'ผู้ดูแลระบบ',
      items: [
        { to: '/admin/users', icon: '👤', color: 'blue', label: 'ผู้ใช้และสิทธิ์', sub: 'บทบาท ตัวแทน รีเซ็ตรหัส' },
        { to: '/admin/user-data', icon: '📤', color: 'teal', label: 'นำเข้า/ส่งออกผู้ใช้ และ API', sub: 'Excel แม่แบบ · เชื่อมต่อระบบภายนอก' },
        { to: '/admin/settings', icon: '⚙️', color: 'slate', label: 'ตั้งค่าการเช็กชื่อ', sub: 'เวลา พื้นที่ (แผนที่) วิธีเช็กชื่อ' },
        { to: '/admin/report-setup', icon: '🖋', color: 'indigo', label: 'แบบรายงานและผู้ลงนาม', sub: 'ผู้ลงนาม และอีเมล' },
        { to: '/admin/data', icon: '🎲', color: 'amber', label: 'ข้อมูลจำลอง', sub: 'ทดลอง / เริ่มใช้งานจริง' },
        { to: '/admin/backups', icon: '💾', color: 'teal', label: 'สำรองและกู้คืนระบบ', sub: 'สำรองทั้งระบบ · กู้คืนเมื่อเซิร์ฟเวอร์มีปัญหา' },
      ],
    });
  }
  return out.map((g) => ({ ...g, items: g.items.filter(Boolean) }));
});

async function doLogout() {
  await logout();
  router.replace('/login');
}

onMounted(async () => {
  try { const r = await api('/api/report-docs/pending-count'); pending.value = r.count; returned.value = r.returned || 0; } catch { /* ignore */ }
  if (auth.user.has_avatar) avatar.value = await imageUrl(`/api/profile/avatar/${auth.user.id}`).catch(() => null);
});
</script>

<style scoped>
.me { display: flex; align-items: center; gap: 12px; text-decoration: none; color: inherit; }
.av { width: 56px; height: 56px; border-radius: 50%; overflow: hidden; background: var(--info-bg); color: var(--info); display: flex; align-items: center; justify-content: center; font-size: 1.5rem; font-weight: 700; flex: none; }
.av img { width: 100%; height: 100%; object-fit: cover; }
.menu-group { margin-bottom: 18px; }
.menu-group h3 { margin: 0 4px 8px; font-size: .85rem; font-weight: 700; color: var(--muted); letter-spacing: .3px; }
.tiles { display: grid; grid-template-columns: 1fr; gap: 10px; }
@media (min-width: 640px) { .tiles { grid-template-columns: 1fr 1fr; } }
.tile { display: flex; align-items: center; gap: 12px; min-height: 68px; padding: 12px 12px 12px 14px; border-radius: 16px; background: var(--card);
  border: 1px solid var(--line); box-shadow: var(--shadow); color: var(--text); text-decoration: none; transition: transform .1s, border-color .15s, box-shadow .15s; }
.tile:hover, .tile:focus-visible { border-color: var(--brand-2); box-shadow: 0 6px 18px rgba(29, 78, 137, .14); outline: none; }
.tile:active { transform: scale(.98); }
.ti { position: relative; flex: none; width: 44px; height: 44px; border-radius: 13px; display: flex; align-items: center; justify-content: center; font-size: 1.35rem; }
.ti.blue { background: #e3eefb; } .ti.amber { background: #fdf1d8; } .ti.teal { background: #dcf5ec; } .ti.indigo { background: #e8e6fb; } .ti.slate { background: #e7ebf0; }
@media (prefers-color-scheme: dark) { .ti.blue, .ti.amber, .ti.teal, .ti.indigo, .ti.slate { background: rgba(255, 255, 255, .08); } }
.cnt { position: absolute; top: -6px; right: -6px; min-width: 20px; height: 20px; padding: 0 5px; border-radius: 10px; background: var(--bad); color: #fff; font-size: .72rem; font-style: normal; font-weight: 700; display: flex; align-items: center; justify-content: center; border: 2px solid var(--card); }
.tt { flex: 1; min-width: 0; display: flex; flex-direction: column; line-height: 1.35; }
.tt b { font-size: 1rem; }
.tt small { color: var(--muted); font-size: .8rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chev { flex: none; width: 20px; height: 20px; fill: none; stroke: var(--muted); stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
</style>
