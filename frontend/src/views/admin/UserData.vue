<template>
  <div>
    <h1>นำเข้า/ส่งออกผู้ใช้ และ API</h1>
    <p class="small muted" style="margin-top:-6px">เลือกวิธีที่เหมาะกับงาน: ใช้ไฟล์ Excel (ทำเองทีละครั้ง) หรือให้ระบบอื่นเชื่อมต่ออัตโนมัติผ่าน API</p>

    <div class="tabs" role="tablist">
      <button role="tab" :aria-selected="tab === 'excel'" :class="{ on: tab === 'excel' }" @click="tab = 'excel'">📄 Excel</button>
      <button role="tab" :aria-selected="tab === 'api'" :class="{ on: tab === 'api' }" @click="tab = 'api'; loadKeys()">🔌 API เชื่อมต่อระบบภายนอก</button>
    </div>

    <div v-if="error" class="alert bad" style="white-space:pre-line">{{ error }}</div>
    <div v-if="message" class="alert ok" style="white-space:pre-line">{{ message }}</div>

    <!-- ===================== Excel ===================== -->
    <template v-if="tab === 'excel'">
      <section class="steps">
        <div class="step-card">
          <span class="num">1</span>
          <div class="grow">
            <h3>ดาวน์โหลดแม่แบบ</h3>
            <p class="small muted">ไฟล์ Excel พร้อมหัวคอลัมน์ รายการให้เลือก (บทบาท แผนก) และวิธีกรอก</p>
          </div>
          <button class="btn" :disabled="busy" @click="getTemplate">⬇ แม่แบบ .xlsx</button>
        </div>
        <div class="step-card">
          <span class="num">2</span>
          <div class="grow">
            <h3>กรอกข้อมูล</h3>
            <p class="small muted">หนึ่งแถวต่อหนึ่งคน · จำเป็น: รหัสพนักงาน ชื่อ-สกุล แผนก/งาน (คนใหม่) · คนเดิมกรอกเฉพาะช่องที่ต้องการแก้
              · ใช้ไฟล์จากระบบสารบรรณฯ หรือไฟล์ที่ส่งออกจากหน้านี้ได้เลย</p>
          </div>
        </div>
        <div class="step-card">
          <span class="num">3</span>
          <div class="grow">
            <h3>อัปโหลดและตรวจก่อนบันทึก</h3>
            <label class="drop" :class="{ has: fileName }">
              <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" @change="pick" />
              <span class="di" aria-hidden="true">📥</span>
              <span>{{ fileName || 'แตะเพื่อเลือกไฟล์ .xlsx' }}</span>
            </label>
            <label class="chk"><input v-model="deactivateMissing" type="checkbox" @change="file && preview()" />
              <span>ระงับบัญชีคนที่<b>ไม่อยู่ในไฟล์</b> (ใช้เมื่อไฟล์เป็นรายชื่อทั้งวิทยาลัย — ไม่กระทบผู้ดูแลระบบ)</span></label>
          </div>
        </div>
      </section>

      <section v-if="plan" class="card stack">
        <h3 style="margin:0">ตรวจผลก่อนบันทึก — {{ fileName }}</h3>
        <div class="sum">
          <button type="button" class="s new" :class="{ on: filter === 'create' }" @click="toggle('create')"><b>{{ plan.summary.create }}</b>สร้างใหม่</button>
          <button type="button" class="s upd" :class="{ on: filter === 'update' }" @click="toggle('update')"><b>{{ plan.summary.update }}</b>แก้ไข</button>
          <button type="button" class="s same" :class="{ on: filter === 'same' }" @click="toggle('same')"><b>{{ plan.summary.same }}</b>ไม่เปลี่ยน</button>
          <button type="button" class="s err" :class="{ on: filter === 'error' }" @click="toggle('error')"><b>{{ plan.summary.error }}</b>ผิดพลาด (ข้าม)</button>
          <div v-if="plan.summary.deactivate" class="s off"><b>{{ plan.summary.deactivate }}</b>จะถูกระงับ</div>
        </div>
        <p v-if="plan.newDepartments.length" class="small">แผนก/งานใหม่ที่จะสร้าง: <b>{{ plan.newDepartments.map((d) => d.name).join(', ') }}</b></p>
        <p v-if="plan.summary.create" class="small muted">คนใหม่ได้รหัสผ่านเริ่มต้น และต้องเปลี่ยนรหัสเมื่อเข้าระบบครั้งแรก · คนเดิมรหัสผ่านไม่เปลี่ยน</p>

        <div class="tbl">
          <table>
            <thead><tr><th>แถว</th><th>ผู้ใช้ / รายละเอียด</th><th>ผล</th></tr></thead>
            <tbody>
              <tr v-for="r in shownRows" :key="r.line" :class="r.action">
                <td>{{ r.line }}</td>
                <td class="det">
                  <b>{{ r.full_name || '(ไม่มีชื่อ)' }}</b> <span class="muted">· {{ r.employee_code || '-' }}</span>
                  <div v-if="r.action === 'error'" class="why">{{ r.errors.join(' · ') }}</div>
                  <div v-else-if="r.action === 'update'">
                    <span v-for="(c, k) in r.changes" :key="k" class="chg">{{ FIELD[k] }}: <s>{{ show(k, c.from) }}</s> → <b>{{ show(k, c.to) }}</b></span>
                  </div>
                </td>
                <td><span class="badge" :class="ACT[r.action].cls">{{ ACT[r.action].label }}</span></td>
              </tr>
              <tr v-for="u in (filter === 'off' || !filter ? plan.deactivate : [])" :key="'d' + u.id" class="off">
                <td>–</td><td class="det"><b>{{ u.full_name }}</b> <span class="muted">· {{ u.employee_code }}</span><div class="why">ไม่อยู่ในไฟล์</div></td><td><span class="badge bad">ระงับ</span></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="row" style="flex-wrap:wrap">
          <button class="btn grow" :disabled="busy" @click="reset">ยกเลิก</button>
          <button class="btn primary grow" :disabled="busy || !(plan.summary.create || plan.summary.update || plan.summary.deactivate)" @click="save">
            บันทึก {{ plan.summary.create + plan.summary.update + plan.summary.deactivate }} รายการ
          </button>
        </div>
      </section>

      <section class="card row" style="flex-wrap:wrap;gap:12px">
        <div class="grow" style="min-width:220px">
          <h3 style="margin:0 0 4px">ส่งออกรายชื่อทั้งหมด</h3>
          <p class="small muted" style="margin:0">รูปแบบเดียวกับแม่แบบ แก้แล้วนำกลับเข้าได้ทันที · มีสถานะรหัสผ่าน/LINE/เข้าระบบล่าสุด · <b>ไม่มีรหัสผ่าน</b></p>
        </div>
        <button class="btn" :disabled="busy" @click="exportUsers">⬇ ส่งออก .xlsx</button>
      </section>
    </template>

    <!-- ===================== API ===================== -->
    <template v-else>
      <section class="card stack">
        <h3 style="margin:0">ใช้ API เมื่อไร</h3>
        <p class="small muted" style="margin:0">เมื่อวิทยาลัยมีระบบอื่น (เช่น ระบบบุคลากร ระบบสารบรรณ ระบบประเมิน) ที่ต้องการ<b>ส่งรายชื่อเข้ามาอัตโนมัติ</b>
          หรือ<b>ดึงผลการเข้าแถวไปใช้</b> โดยไม่ต้องดาวน์โหลด/อัปโหลดไฟล์เอง — สร้างกุญแจแยกให้แต่ละระบบ และให้สิทธิ์เท่าที่จำเป็น</p>
        <div class="api-ref">
          <code>GET  /api/ext/v1/users</code><span>รายชื่อผู้ใช้</span>
          <code>POST /api/ext/v1/users/sync</code><span>เพิ่ม/แก้ไข/ระงับหลายคน</span>
          <code>GET  /api/ext/v1/departments</code><span>รายชื่อแผนก</span>
          <code>GET  /api/ext/v1/attendance</code><span>ผลเข้าแถวรายวัน</span>
          <code>GET  /api/ext/v1/attendance/summary</code><span>สรุปร้อยละ</span>
        </div>
        <p class="small muted" style="margin:0">ส่งกุญแจทาง header <code>Authorization: Bearer &lt;กุญแจ&gt;</code> · จำกัด {{ keys.ratePerMin || 120 }} ครั้ง/นาที/กุญแจ · เอกสารฉบับเต็มอยู่ในไฟล์ <b>API.md</b> ของโครงการ</p>
      </section>

      <form class="card stack" @submit.prevent="createKey">
        <h3 style="margin:0">สร้างกุญแจใหม่</h3>
        <label class="field"><span>ชื่อระบบที่จะเชื่อมต่อ</span><input v-model.trim="nk.name" maxlength="100" placeholder="เช่น ระบบบุคลากร (HR)" required /></label>
        <fieldset class="scopes">
          <legend class="small muted">สิทธิ์</legend>
          <label v-for="(label, s) in keys.scopes" :key="s" class="chk"><input v-model="nk.scopes" type="checkbox" :value="s" /><span><code>{{ s }}</code> {{ label }}</span></label>
        </fieldset>
        <div class="row" style="flex-wrap:wrap">
          <label class="field grow"><span>อนุญาตเฉพาะ IP (เว้นว่าง = ทุก IP)</span><input v-model.trim="nk.allowedIps" placeholder="เช่น 203.113.123.10, 10.0.0.5" /></label>
          <label class="field" style="min-width:150px"><span>อายุกุญแจ</span>
            <select v-model.number="nk.expiresDays"><option :value="0">ไม่หมดอายุ</option><option :value="30">30 วัน</option><option :value="180">6 เดือน</option><option :value="365">1 ปี</option></select></label>
        </div>
        <button class="btn primary" :disabled="busy || !nk.name || !nk.scopes.length">🔑 สร้างกุญแจ</button>
      </form>

      <div v-if="newKey" class="card stack keybox">
        <h3 style="margin:0">กุญแจของ “{{ newKey.name }}”</h3>
        <p class="alert warn small" style="margin:0"><b>คัดลอกเก็บไว้ตอนนี้</b> — ระบบแสดงกุญแจนี้ครั้งเดียว ถ้าทำหายต้องสร้างใหม่ อย่าส่งทางแชตกลุ่มหรืออีเมลที่ไม่ปลอดภัย</p>
        <div class="row"><code class="grow key">{{ newKey.key }}</code><button type="button" class="btn sm" @click="copy">{{ copied ? '✓ คัดลอกแล้ว' : 'คัดลอก' }}</button></div>
        <details><summary class="small">ตัวอย่างการเรียก (curl)</summary>
          <pre class="small">curl -H "Authorization: Bearer {{ newKey.key.slice(0, 12) }}…" \
  "{{ origin }}/api/ext/v1/me"</pre></details>
        <button type="button" class="btn" @click="newKey = null">เก็บเรียบร้อยแล้ว ปิด</button>
      </div>

      <section class="card">
        <h3>กุญแจทั้งหมด</h3>
        <p v-if="!keys.items.length" class="small muted">ยังไม่มีกุญแจ — ยังไม่มีระบบภายนอกเชื่อมต่อได้</p>
        <ul class="list">
          <li v-for="k in keys.items" :key="k.id" :class="{ dim: k.status !== 'active' }">
            <div class="main">
              <strong>{{ k.name }}</strong>
              <span class="small muted">lu_{{ k.prefix }}_… · {{ k.scopes.join(', ') }}<template v-if="k.allowed_ips"> · IP {{ k.allowed_ips }}</template><br />
                สร้างโดย {{ k.created_by_name || '-' }} {{ when(k.created_at) }}
                · ใช้ล่าสุด {{ k.last_used_at ? `${when(k.last_used_at)} (${k.use_count} ครั้ง)` : 'ยังไม่เคยใช้' }}
                <template v-if="k.expires_at"> · หมดอายุ {{ when(k.expires_at) }}</template></span>
            </div>
            <span v-if="k.status !== 'active'" class="badge muted">{{ k.status === 'revoked' ? 'ยกเลิกแล้ว' : 'หมดอายุ' }}</span>
            <button v-else type="button" class="btn sm danger" :disabled="busy" @click="revoke(k)">ยกเลิก</button>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { api, download, postDownload } from '../../api';
import { askPassword } from '../../confirm';
import { ROLE, STAFF_SHORT } from '../../util';

const tab = ref('excel');
const busy = ref(false);
const error = ref('');
const message = ref('');
const file = ref('');
const fileName = ref('');
const deactivateMissing = ref(false);
const plan = ref(null);
const filter = ref('');
const keys = ref({ items: [], scopes: {}, ratePerMin: 120 });
const nk = ref({ name: '', scopes: ['users:read'], allowedIps: '', expiresDays: 0 });
const newKey = ref(null);
const copied = ref(false);
const origin = location.origin;

const ACT = {
  create: { label: 'สร้างใหม่', cls: 'ok' }, update: { label: 'แก้ไข', cls: 'info' },
  same: { label: 'ไม่เปลี่ยน', cls: 'muted' }, error: { label: 'ผิดพลาด', cls: 'bad' },
};
const FIELD = { name_prefix: 'คำนำหน้า', full_name: 'ชื่อ', email: 'อีเมล', position_title: 'ตำแหน่ง', staff_type: 'ประเภท', role: 'บทบาท', must_assemble: 'ต้องเข้าแถว', active: 'สถานะ', department: 'แผนก' };
const show = (k, v) => (k === 'staff_type' ? STAFF_SHORT[v] || v || '(ว่าง)' : k === 'role' ? ROLE[v] || v : k === 'must_assemble' ? (v ? 'ใช่' : 'ไม่') : k === 'active' ? (v ? 'ใช้งาน' : 'ระงับ') : v || '(ว่าง)');
const when = (t) => (t ? new Date(t).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : '');

const shownRows = computed(() => {
  if (!plan.value) return [];
  const rows = filter.value ? plan.value.rows.filter((r) => r.action === filter.value) : plan.value.rows.filter((r) => r.action !== 'same');
  return rows.slice(0, 500);
});
const toggle = (f) => { filter.value = filter.value === f ? '' : f; };

async function run(fn) {
  busy.value = true;
  error.value = '';
  message.value = '';
  try { await fn(); } catch (e) { error.value = e.message; } finally { busy.value = false; }
}

const getTemplate = () => run(() => download('/api/admin/users/template.xlsx', 'แม่แบบนำเข้ารายชื่อบุคลากร.xlsx'));

async function exportUsers() {
  const password = await askPassword('ยืนยันการส่งออกรายชื่อ', { detail: 'ไฟล์มีข้อมูลส่วนบุคคล (ชื่อ อีเมล แผนก) เก็บรักษาให้ปลอดภัย' });
  if (!password) return;
  await run(() => postDownload('/api/admin/users/export.xlsx', { password }, `รายชื่อบุคลากร-${new Date().toISOString().slice(0, 10)}.xlsx`));
}

function pick(e) {
  const f = e.target.files?.[0];
  e.target.value = '';
  if (!f) return;
  if (f.size > 5 * 1024 * 1024) { error.value = 'ไฟล์ใหญ่เกิน 5 MB'; return; }
  const reader = new FileReader();
  reader.onload = () => { file.value = reader.result; fileName.value = f.name; preview(); };
  reader.readAsDataURL(f);
}

function preview() {
  return run(async () => {
    plan.value = null;
    filter.value = '';
    plan.value = await api('/api/admin/users/import/preview', { method: 'POST', body: { file: file.value, deactivateMissing: deactivateMissing.value } });
    if (plan.value.summary.error && !plan.value.summary.create && !plan.value.summary.update) filter.value = 'error';
  });
}

function reset() {
  plan.value = null;
  file.value = '';
  fileName.value = '';
}

async function save() {
  const s = plan.value.summary;
  const detail = [`สร้างใหม่ ${s.create} · แก้ไข ${s.update}`, s.deactivate ? `ระงับบัญชี ${s.deactivate} คน` : '', s.error ? `ข้ามแถวผิดพลาด ${s.error} แถว` : ''].filter(Boolean).join('\n');
  const password = await askPassword('ยืนยันการนำเข้ารายชื่อ', { detail, danger: !!s.deactivate });
  if (!password) return;
  await run(async () => {
    const r = await api('/api/admin/users/import', { method: 'POST', body: { file: file.value, deactivateMissing: deactivateMissing.value, password } });
    message.value = `นำเข้าเรียบร้อย: สร้างใหม่ ${r.create} คน · แก้ไข ${r.update} คน${r.deactivate ? ` · ระงับ ${r.deactivate} คน` : ''}${r.error ? ` · ข้าม ${r.error} แถว` : ''}`
      + (r.initialPassword ? `\nคนใหม่เข้าระบบด้วยรหัสพนักงาน และรหัสผ่านเริ่มต้น ${r.initialPassword} แล้วต้องตั้งรหัสใหม่` : '');
    reset();
  });
}

function loadKeys() {
  return run(async () => { keys.value = await api('/api/admin/api-keys'); });
}

async function createKey() {
  const password = await askPassword('ยืนยันการสร้างกุญแจ API', { detail: `${nk.value.name}\nสิทธิ์: ${nk.value.scopes.join(', ')}` });
  if (!password) return;
  await run(async () => {
    newKey.value = await api('/api/admin/api-keys', { method: 'POST', body: { ...nk.value, password } });
    copied.value = false;
    nk.value = { name: '', scopes: ['users:read'], allowedIps: '', expiresDays: 0 };
    keys.value = await api('/api/admin/api-keys');
  });
}

async function copy() {
  try { await navigator.clipboard.writeText(newKey.value.key); copied.value = true; } catch { error.value = 'คัดลอกไม่ได้ — เลือกข้อความแล้วคัดลอกเอง'; }
}

async function revoke(k) {
  if (!window.confirm(`ยกเลิกกุญแจ "${k.name}"?\nระบบที่ใช้กุญแจนี้จะเชื่อมต่อไม่ได้ทันที`)) return;
  await run(async () => {
    await api(`/api/admin/api-keys/${k.id}`, { method: 'DELETE' });
    message.value = `ยกเลิกกุญแจ "${k.name}" แล้ว`;
    keys.value = await api('/api/admin/api-keys');
  });
}
</script>

<style scoped>
.steps { display: grid; gap: 10px; margin-bottom: 14px; }
.step-card { display: flex; gap: 12px; align-items: flex-start; flex-wrap: wrap; background: var(--card); border: 1px solid var(--line); border-radius: var(--radius); box-shadow: var(--shadow); padding: 14px; }
.step-card h3 { margin: 2px 0 4px; }
.step-card p { margin: 0; }
.num { flex: none; width: 32px; height: 32px; border-radius: 50%; background: var(--fill); color: #fff; font-weight: 700; display: flex; align-items: center; justify-content: center; }
.drop { margin-top: 10px; display: flex; align-items: center; gap: 10px; min-height: 56px; padding: 10px 14px; border: 2px dashed var(--line); border-radius: 14px; cursor: pointer; color: var(--muted); font-weight: 600; }
.drop:hover, .drop:focus-within { border-color: var(--brand-2); color: var(--brand-2); }
.drop.has { border-style: solid; border-color: var(--ok); color: var(--text); }
.drop input { position: absolute; width: 1px; height: 1px; opacity: 0; }
.di { font-size: 1.4rem; }
.chk { display: flex; gap: 10px; align-items: flex-start; margin-top: 10px; font-size: .9rem; cursor: pointer; }
.chk input { flex: none; margin-top: 2px; }
.sum { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 8px; }
.s { display: flex; flex-direction: column; align-items: flex-start; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--line); background: var(--bg); color: var(--text); font: inherit; font-size: .85rem; cursor: pointer; text-align: left; }
.s b { font-size: 1.5rem; line-height: 1.2; }
.s.on { outline: 2px solid var(--brand-2); }
.s.new b { color: var(--ok); } .s.upd b { color: var(--info); } .s.same b { color: var(--muted); } .s.err b { color: var(--bad); } .s.off b { color: var(--warn); }
.tbl { max-height: 420px; overflow: auto; border: 1px solid var(--line); border-radius: 12px; }
.tbl table { width: 100%; }
td.det { white-space: normal; width: 100%; font-size: .88rem; }
.why { color: var(--bad); margin-top: 2px; }
tr.off .why { color: var(--warn); }
.chg { font-size: .82rem; }
.chg { display: block; }
.chg s { color: var(--muted); }
.api-ref { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; font-size: .85rem; align-items: center; }
.api-ref code { white-space: pre; background: var(--bg); padding: 2px 6px; border-radius: 6px; }
@media (max-width: 480px) { .api-ref { grid-template-columns: 1fr; } .api-ref span { margin-bottom: 6px; color: var(--muted); } }
.scopes { border: 0; padding: 0; margin: 0; }
.scopes .chk { margin-top: 6px; }
.keybox { border: 2px solid var(--warn); }
.key { word-break: break-all; background: var(--bg); padding: 10px; border-radius: 10px; font-size: .9rem; user-select: all; }
pre { white-space: pre-wrap; word-break: break-all; background: var(--bg); padding: 10px; border-radius: 10px; }
.list li.dim { opacity: .6; }
.btn.danger { color: var(--bad); }
</style>
