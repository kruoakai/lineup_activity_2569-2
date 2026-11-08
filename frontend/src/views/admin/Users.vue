<template>
  <div>
    <div class="row">
      <h1 class="grow" style="margin:0">ผู้ใช้และสิทธิ์</h1>
      <router-link class="btn sm" to="/admin/user-data">📤 นำเข้า/ส่งออก</router-link>
      <button class="btn sm primary" @click="edit({})">+ เพิ่มผู้ใช้</button>
    </div>
    <div class="row" style="margin:10px 0">
      <input v-model="search" class="grow" placeholder="ค้นหาชื่อ / รหัส / อีเมล" />
      <select v-model="roleFilter" class="grow">
        <option value="">ทุกบทบาท</option>
        <option v-for="(l, k) in ROLE" :key="k" :value="k">{{ l }}</option>
        <option value="proxy">ผู้รับมอบหมายเช็กแทน</option>
        <option value="inactive">ถูกระงับ</option>
      </select>
    </div>
    <div v-if="error" class="alert bad">{{ error }}</div>
    <div v-if="notice" class="alert ok" style="white-space:pre-line">{{ notice }}</div>
    <p class="small muted">{{ shown.length }} คน · ยังไม่เคยเข้าสู่ระบบ {{ items.filter((u) => u.must_change_password).length }} คน
      · ตัวแทนเช็กชื่อ {{ items.filter((u) => u.can_proxy).length }} คน (ติ๊ก "เช็กแทน" ท้ายชื่อเพื่อให้/ยกเลิกสิทธิ์ทันที)</p>

    <ul class="list card">
      <li v-for="u in shown" :key="u.id" @click="edit(u)">
        <div class="main">
          <strong :style="u.active ? '' : 'text-decoration:line-through'">{{ u.full_name }}</strong>
          <span class="small muted">{{ u.employee_code }} · {{ u.department_name || 'ไม่ระบุแผนก' }}</span>
        </div>
        <label v-if="u.active && u.department_id" class="proxy" :class="{ on: u.can_proxy }" title="ให้สิทธิ์เช็กชื่อแทนคนในแผนก" @click.stop>
          <input type="checkbox" :checked="!!u.can_proxy" :disabled="toggling === u.id" @change="toggleProxy(u, $event)" /> เช็กแทน
        </label>
        <span v-if="u.has_line" class="badge ok" title="เชื่อมบัญชี LINE แล้ว">LINE</span>
        <span v-if="u.role !== 'staff'" class="badge info2">{{ ROLE[u.role] }}</span>
        <span v-if="!u.must_assemble" class="badge muted">ไม่ต้องเข้าแถว</span>
      </li>
    </ul>

    <div v-if="form" class="modal-back" @click.self="form = null">
      <form class="modal stack" @submit.prevent="save">
        <div class="row"><h2 class="grow" style="margin:0">{{ form.id ? 'แก้ไขผู้ใช้' : 'เพิ่มผู้ใช้' }}</h2><button type="button" class="btn sm" @click="form = null">ปิด</button></div>
        <label class="field"><span>ชื่อ-สกุล</span><input v-model="form.full_name" required /></label>
        <div class="row">
          <label class="field grow"><span>รหัสพนักงาน (ใช้เข้าสู่ระบบ)</span><input v-model="form.employee_code" required /></label>
          <label class="field grow"><span>อีเมล</span><input v-model="form.email" type="email" /></label>
        </div>
        <label class="field"><span>แผนก/งาน</span>
          <select v-model="form.department_id">
            <option :value="null">— ไม่ระบุ —</option>
            <optgroup v-for="(list, div) in grouped" :key="div" :label="div">
              <option v-for="d in list" :key="d.id" :value="d.id">{{ d.name }}</option>
            </optgroup>
          </select></label>
        <label class="field"><span>บทบาท</span>
          <select v-model="form.role"><option v-for="(l, k) in ROLE" :key="k" :value="k">{{ l }}</option></select></label>
        <label class="field"><span>ตำแหน่ง / วิทยฐานะ</span><input v-model="form.position_title" maxlength="150" /></label>
        <label class="field"><span>หน่วยงานในแบบรายงาน (เว้นว่าง = ตามแผนก)</span><input v-model="form.report_group" placeholder="เช่น เจ้าพนักงานราชการ" /></label>
        <label class="row"><input v-model="form.can_proxy" type="checkbox" /> ครูผู้รับมอบหมายให้เช็กชื่อแทนในแผนก (ถาวร)</label>
        <label v-if="form.proxy_until" class="row small"><input v-model="form.revoke_temp_proxy" type="checkbox" /> ยกเลิกสิทธิ์ตัวแทนชั่วคราว (ถึง {{ new Date(form.proxy_until).toLocaleString('th-TH') }})</label>
        <label class="row"><input v-model="form.must_assemble" type="checkbox" /> อยู่ในเกณฑ์ต้องเข้าแถว</label>
        <label class="row"><input v-model="form.active" type="checkbox" /> เปิดใช้งานบัญชี</label>
        <button class="btn primary block" :disabled="busy">บันทึก</button>
        <button v-if="form.id" type="button" class="btn block" :disabled="busy" @click="resetPw">รีเซ็ตรหัสผ่าน</button>
      </form>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { api } from '../../api';
import { ROLE } from '../../util';

const items = ref([]);
const departments = ref([]);
const search = ref('');
const roleFilter = ref('');
const error = ref('');
const notice = ref('');
const form = ref(null);
const busy = ref(false);

const grouped = computed(() => {
  const g = {};
  for (const d of departments.value) (g[d.division || 'อื่น ๆ'] ||= []).push(d);
  return g;
});

const shown = computed(() => {
  const q = search.value.trim().toLowerCase();
  return items.value.filter((u) => {
    if (q && !`${u.full_name} ${u.employee_code} ${u.email || ''}`.toLowerCase().includes(q)) return false;
    if (roleFilter.value === 'proxy') return u.can_proxy;
    if (roleFilter.value === 'inactive') return !u.active;
    if (roleFilter.value) return u.role === roleFilter.value;
    return true;
  });
});

const toggling = ref(null);
async function toggleProxy(u, ev) {
  const on = ev.target.checked;
  toggling.value = u.id;
  error.value = '';
  try {
    await api(`/api/admin/users/${u.id}`, { method: 'PATCH', body: { can_proxy: on, ...(on ? {} : { revoke_temp_proxy: true }) } });
    u.can_proxy = on ? 1 : 0;
    if (!on) u.proxy_until = null;
    notice.value = on ? `ให้ ${u.full_name} เป็นตัวแทนเช็กชื่อ${u.department_name || 'แผนก'}แล้ว` : `ยกเลิกสิทธิ์ตัวแทนของ ${u.full_name} แล้ว`;
  } catch (e) {
    ev.target.checked = !on;
    error.value = e.message;
  } finally {
    toggling.value = null;
  }
}

async function load() {
  try {
    const [u, d] = await Promise.all([api('/api/admin/users'), api('/api/admin/departments')]);
    items.value = u.items;
    departments.value = d.items;
  } catch (e) {
    error.value = e.message;
  }
}

function edit(u) {
  form.value = {
    id: u.id, full_name: u.full_name || '', employee_code: u.employee_code || '', email: u.email || '',
    department_id: u.department_id ?? null, role: u.role || 'staff', can_proxy: !!u.can_proxy,
    must_assemble: u.must_assemble === undefined ? true : !!u.must_assemble, active: u.active === undefined ? true : !!u.active,
    position_title: u.position_title || '', report_group: u.report_group || '', proxy_until: u.proxy_until || null, revoke_temp_proxy: false,
  };
}

async function save() {
  busy.value = true;
  error.value = '';
  notice.value = '';
  try {
    const { id, proxy_until: _p, ...body } = form.value;
    if (id) {
      await api(`/api/admin/users/${id}`, { method: 'PATCH', body });
      notice.value = `บันทึก ${body.full_name} แล้ว`;
    } else {
      const r = await api('/api/admin/users', { method: 'POST', body });
      notice.value = `สร้างบัญชี ${body.full_name} แล้ว\nชื่อผู้ใช้: ${body.employee_code}\nรหัสผ่านเริ่มต้น: ${r.initialPassword}`;
    }
    form.value = null;
    await load();
  } catch (e) {
    alert(e.message);
  } finally {
    busy.value = false;
  }
}

async function resetPw() {
  if (!confirm(`รีเซ็ตรหัสผ่านของ ${form.value.full_name}? ผู้ใช้จะถูกออกจากระบบทุกอุปกรณ์`)) return;
  busy.value = true;
  try {
    const r = await api(`/api/admin/users/${form.value.id}/reset-password`, { method: 'POST' });
    notice.value = `รหัสผ่านใหม่ของ ${form.value.full_name}\nชื่อผู้ใช้: ${form.value.employee_code}\nรหัสผ่านเริ่มต้น: ${r.initialPassword}`;
    form.value = null;
    await load();
  } catch (e) {
    alert(e.message);
  } finally {
    busy.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.proxy { display: inline-flex; align-items: center; gap: 6px; font-size: .82rem; padding: 4px 10px; border: 1px solid var(--line); border-radius: 999px; cursor: pointer; white-space: nowrap; color: var(--muted); }
.proxy.on { border-color: var(--brand-2); color: var(--brand-2); background: rgba(47, 111, 184, .08); font-weight: 600; }
.proxy input { width: 16px; height: 16px; min-height: 16px; margin: 0; }
.list li { cursor: pointer; }
</style>
