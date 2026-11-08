<template>
  <div>
    <h1>แบบรายงานและผู้ลงนาม</h1>
    <div v-if="error" class="alert bad">{{ error }}</div>
    <div v-if="msg" class="alert ok">{{ msg }}</div>

    <form v-if="s" class="card stack" @submit.prevent="saveSigners">
      <h2>ลำดับผู้ลงนามเอกสารรายงาน</h2>
      <label class="field"><span>ชื่อแบบรายงาน</span><input v-model="s.report_form_title" /></label>
      <div v-for="n in [1, 2, 3]" :key="n" class="step">
        <b>ลำดับที่ {{ n }}</b>
        <label class="field"><span>ตำแหน่ง (แสดงใต้ลายเซ็น)</span><input v-model="s[`sign_step${n}_title`]" /></label>
        <div class="row">
          <label class="field grow"><span>ผู้ลงนาม</span>
            <select v-model="s[`sign_step${n}_user`]">
              <option value="">— เลือก —</option>
              <option v-for="u in users" :key="u.id" :value="String(u.id)">{{ u.full_name }} ({{ u.department_name || '-' }})</option>
            </select></label>
          <label class="field" style="width:130px"><span>คำท้าย</span><input v-model="s[`sign_step${n}_label`]" placeholder="ผู้รับรอง" /></label>
        </div>
      </div>
      <p class="small muted">ผู้ลงนามดูแบบรายงานและเอกสารที่ต้องลงนามได้เสมอ ไม่ว่าจะมีบทบาทใด ระบบส่งอีเมลแจ้งเมื่อถึงลำดับ (ถ้าตั้งค่าอีเมลไว้)</p>
      <button class="btn primary">บันทึกผู้ลงนาม</button>
    </form>

    <section class="card stack">
      <h2>หน่วยงานในแบบรายงาน</h2>
      <p class="small muted">แต่ละแผนก/งานในระบบ ถูกรวมเป็น "หน่วยงาน" ตามแบบบันทึกของวิทยาลัย และเรียงตามลำดับ
        กำหนดรายบุคคลได้ที่หน้า "ผู้ใช้และสิทธิ์" (เช่น เจ้าพนักงานราชการ)</p>
      <div class="table-wrap">
        <table>
          <thead><tr><th>แผนก/งานในระบบ</th><th class="num">คน</th><th>หน่วยงานในรายงาน</th><th class="num">ลำดับ</th><th></th></tr></thead>
          <tbody>
            <tr v-for="d in depts" :key="d.id">
              <td class="small">{{ d.name }}<br /><span class="muted">{{ d.division }}</span></td>
              <td class="num">{{ d.members }}</td>
              <td><input v-model="d.report_group" list="groups" style="min-width:220px" /></td>
              <td><input v-model.number="d.report_order" type="number" min="1" max="999" style="width:70px" /></td>
              <td><button class="btn sm" @click="saveDept(d)">บันทึก</button></td>
            </tr>
          </tbody>
        </table>
      </div>
      <datalist id="groups"><option v-for="g in groupNames" :key="g" :value="g" /></datalist>
    </section>

    <section class="card stack">
      <h2>อีเมลของระบบ</h2>
      <p>สถานะ: <span :class="mail.enabled ? 'badge ok' : 'badge warn'">{{ mail.enabled ? 'พร้อมส่ง' : 'ยังไม่ได้ตั้งค่า' }}</span>
        <span v-if="mail.enabled" class="small muted"> ผู้ส่ง {{ mail.from }} ผ่าน {{ mail.host }}</span></p>
      <p v-if="!mail.enabled" class="small muted">ใช้สำหรับลิงก์ลืมรหัสผ่านและแจ้งเตือนผู้ลงนาม — ตั้งค่า SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
        ในไฟล์ /opt/lineup/deploy/.env แล้วรัน docker compose up -d (ดูคู่มือนักพัฒนา)</p>
      <div v-else class="row">
        <input v-model="testTo" class="grow" type="email" placeholder="อีเมลปลายทางสำหรับทดสอบ" />
        <button class="btn" @click="testMail">ส่งอีเมลทดสอบ</button>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { api, auth } from '../../api';

const s = ref(null);
const users = ref([]);
const depts = ref([]);
const mail = ref({});
const testTo = ref(auth.user.email || '');
const error = ref('');
const msg = ref('');
const groupNames = computed(() => [...new Set(depts.value.map((d) => d.report_group).filter(Boolean))]);

const KEYS = ['report_form_title', ...[1, 2, 3].flatMap((n) => [`sign_step${n}_title`, `sign_step${n}_label`, `sign_step${n}_user`])];

function flash(text) { msg.value = text; error.value = ''; window.scrollTo(0, 0); }
function fail(e) { error.value = e.message; msg.value = ''; window.scrollTo(0, 0); }

async function load() {
  try {
    const [st, u, d, m] = await Promise.all([api('/api/admin/settings'), api('/api/admin/users'), api('/api/admin/departments'), api('/api/admin/mail')]);
    s.value = st;
    users.value = u.items.filter((x) => x.active);
    depts.value = d.items;
    mail.value = m;
  } catch (e) { fail(e); }
}

async function saveSigners() {
  try {
    s.value = await api('/api/admin/settings', { method: 'PUT', body: Object.fromEntries(KEYS.map((k) => [k, s.value[k] ?? ''])) });
    flash('บันทึกผู้ลงนามแล้ว');
  } catch (e) { fail(e); }
}

async function saveDept(d) {
  try {
    await api(`/api/admin/departments/${d.id}`, { method: 'PATCH', body: { name: d.name, report_group: d.report_group, report_order: d.report_order } });
    flash(`บันทึก ${d.name} → ${d.report_group}`);
  } catch (e) { fail(e); }
}

async function testMail() {
  try { await api('/api/admin/mail/test', { method: 'POST', body: { to: testTo.value } }); flash(`ส่งอีเมลทดสอบไปที่ ${testTo.value} แล้ว`); } catch (e) { fail(e); }
}

onMounted(load);
</script>

<style scoped>
.step { border: 1px solid var(--line); border-radius: 12px; padding: 10px 12px; display: grid; gap: 8px; }
td input { min-height: 36px; }
</style>
