<template>
  <div>
    <div class="row">
      <h1 class="grow" style="margin:0">รายชื่อเข้าแถว</h1>
      <input v-if="manage" v-model="day" type="date" style="width:auto" :max="today" @change="load" />
    </div>
    <p class="small muted">{{ thaiDate(day) }} · {{ phaseText }}</p>

    <div class="row" style="margin-bottom:10px">
      <select v-if="departments.length > 1" v-model="departmentId" class="grow" @change="load">
        <option :value="0">ทุกแผนก/งาน</option>
        <option v-for="d in departments" :key="d.id" :value="d.id">{{ d.name }} ({{ d.members }})</option>
      </select>
      <input v-model="search" class="grow" placeholder="ค้นหาชื่อ / รหัส" />
    </div>

    <div class="tabs">
      <button v-for="t in tabs" :key="t.key" :class="{ on: status === t.key }" @click="status = t.key">
        {{ t.label }} <b>{{ counts[t.key] ?? '' }}</b>
      </button>
    </div>

    <div v-if="error" class="alert bad">{{ error }}</div>
    <div v-if="message" class="alert ok" style="white-space:pre-line">{{ message }}</div>

    <button v-if="groupCandidates.length" class="btn primary block group-btn" @click="openGroup">
      📸 เช็กชื่อแบบกลุ่ม (ถ่ายรูปรวม) · ยังไม่เช็ก {{ groupCandidates.length }} คน
    </button>

    <div v-if="group" class="modal-back" @click.self="group = null">
      <div class="modal stack">
        <div class="row"><h2 class="grow" style="margin:0">เช็กชื่อแบบกลุ่ม</h2><button class="btn sm" @click="group = null">ปิด</button></div>
        <ol class="small muted steps">
          <li>ถ่ายรูปรวมทุกคนที่มาเข้าแถว</li>
          <li>ระบบเลือกทุกคนไว้ให้แล้ว — <b>แตะเอาชื่อคนที่ไม่มาออก</b></li>
          <li>กดบันทึก รูปรวมจะแนบให้ทุกคนที่เลือก</li>
        </ol>
        <PhotoPicker v-model="group.photos" :max="3" capture :required="needGroupPhoto" />
        <div class="row small">
          <b class="grow">เลือก {{ group.picked.length }} / {{ groupCandidates.length }} คน</b>
          <button type="button" class="btn sm" @click="group.picked = groupCandidates.map((p) => p.user_id)">เลือกทั้งหมด</button>
          <button type="button" class="btn sm" @click="group.picked = []">ไม่เลือกเลย</button>
        </div>
        <ul class="list pick">
          <li v-for="p in groupCandidates" :key="p.user_id" :class="{ off: !group.picked.includes(p.user_id) }">
            <label class="row grow" style="gap:10px;cursor:pointer">
              <input v-model="group.picked" type="checkbox" :value="p.user_id" />
              <span class="main"><strong>{{ p.full_name }}</strong><span class="small muted">{{ p.department_name }}{{ p.status === 'pending' ? ' · รอตรวจสอบ' : '' }}</span></span>
            </label>
            <span class="badge" :class="group.picked.includes(p.user_id) ? 'ok' : 'muted'">{{ group.picked.includes(p.user_id) ? 'มา' : 'ไม่มา' }}</span>
          </li>
        </ul>
        <p v-if="needGroupPhoto && !group.photos.length" class="small" :class="{ shake: group.warn }" style="color:var(--bad);margin:0">⚠ ยังไม่ได้แนบรูปรวม — แตะ "📷 เพิ่มรูป" ด้านบนก่อนบันทึก</p>
        <button class="btn ok block" :disabled="group.busy || !group.picked.length" @click="saveGroup">
          {{ group.busy ? 'กำลังบันทึก…' : `✓ บันทึก "มาเข้าแถว" ${group.picked.length} คน` }}
        </button>
        <p class="small muted" style="margin:0">ระบบบันทึกชื่อ {{ auth.user.full_name }} เป็นผู้เช็กแทนทุกรายการ คนที่ไม่ได้เลือกจะยังไม่ถูกบันทึก (เช็กเองได้ หรือนับเป็นขาดเมื่อปิดเวลา)</p>
      </div>
    </div>

    <ul class="list card">
      <li v-for="p in shown" :key="p.user_id" @click="open(p)">
        <div class="main">
          <strong>{{ p.full_name }}</strong>
          <span class="small muted">
            {{ p.department_name }}
            <template v-if="p.status"> · {{ METHOD[p.method] }} {{ thaiTime(p.checked_at) }}
              <template v-if="p.checked_by_name && p.checked_by_name !== p.full_name"> · โดย {{ p.checked_by_name }}</template></template>
          </span>
          <span v-if="p.flagged" class="small" style="color:var(--warn)">⚠ {{ p.flag_reason }}</span>
        </div>
        <button v-if="quickPresent(p)" class="btn sm ok" :disabled="busyId === p.user_id" @click.stop="peerPhotoRequired ? open(p) : record(p, 'present')">{{ peerPhotoRequired ? '📷 มา' : 'มา ✓' }}</button>
        <span class="badge" :class="badge(p).cls">{{ badge(p).label }}</span>
      </li>
      <li v-if="!shown.length && !loading" class="muted">ไม่มีรายชื่อ</li>
    </ul>

    <!-- รายละเอียด / บันทึกสถานะ -->
    <div v-if="sel" class="modal-back" @click.self="sel = null">
      <div class="modal stack">
        <div class="row"><h2 class="grow" style="margin:0">{{ sel.full_name }}</h2><button class="btn sm" @click="sel = null">ปิด</button></div>
        <p class="small muted" style="margin:0">{{ sel.employee_code }} · {{ sel.department_name }}</p>
        <div><span class="badge" :class="badge(sel).cls">{{ badge(sel).label }}</span>
          <span v-if="sel.distance_m !== null && sel.distance_m !== undefined" class="small muted"> · ระยะ {{ sel.distance_m }} ม.</span>
          <span v-if="sel.qr_ok" class="small muted"> · สแกน QR</span></div>
        <p v-if="sel.note" class="small">หมายเหตุ: {{ sel.note }}</p>
        <div v-if="photoUrls.length" class="gallery">
          <a v-for="(u, i) in photoUrls" :key="i" :href="u" target="_blank" rel="noopener"><img :src="u" alt="รูปหลักฐาน" /></a>
        </div>
        <button v-else-if="sel.photo_count" class="btn sm" @click="loadPhotos">ดูรูปหลักฐาน ({{ sel.photo_count }})</button>

        <template v-if="manage">
          <label class="field"><span>เหตุผล / เลขที่หนังสือ / หลักฐาน</span><textarea v-model="reason" maxlength="500" /></label>
          <PhotoPicker v-model="newPhotos" :max="Math.max(0, 3 - (sel.photo_count || 0))" />
          <div class="grid2">
            <button v-for="s in ['present','official','policy','leave','absent']" :key="s" class="btn" :class="STATUS[s].cls"
              :disabled="busyId === sel.user_id || sel.status === s" @click="record(sel, s)">{{ STATUS[s].label }}</button>
          </div>
        </template>
        <template v-else-if="quickPresent(sel)">
          <PhotoPicker v-model="newPhotos" :max="Math.max(0, 3 - (sel.photo_count || 0))" capture :required="peerPhotoRequired" />
          <p v-if="peerPhotoRequired" class="small muted" style="margin:0">ถ่ายรูป {{ sel.full_name }} ที่จุดเข้าแถวอย่างน้อย 1 รูป ระบบบันทึกชื่อท่านเป็นผู้เช็กแทน</p>
          <p v-if="peerPhotoRequired && !newPhotos.length" class="small" :class="{ shake: photoWarn }" style="color:var(--bad);margin:0">⚠ ยังไม่ได้แนบรูป — แตะ "📷 เพิ่มรูป" ด้านบนก่อนบันทึก</p>
          <button class="btn ok block" :disabled="busyId === sel.user_id" @click="record(sel, 'present')">บันทึก "มาเข้าแถว" แทน</button>
        </template>

        <div v-if="sel.attendance_id">
          <button v-if="!events" class="btn sm" @click="loadEvents">ประวัติการแก้ไข</button>
          <ul v-else class="list small">
            <li v-for="(e, i) in events" :key="i">
              <div class="main">
                <strong>{{ e.old_status ? `${STATUS[e.old_status]?.label} → ` : '' }}{{ STATUS[e.new_status]?.label }}</strong>
                <span class="muted">{{ thaiDateTime(e.created_at) }} · {{ e.actor_name }}<template v-if="e.reason"> · {{ e.reason }}</template></span>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { api, auth, imageUrl } from '../api';
import PhotoPicker from '../components/PhotoPicker.vue';
import { MANAGE } from '../router';
import { STATUS, METHOD, thaiDate, thaiTime, serverToday } from '../util';

const route = useRoute();
const manage = computed(() => MANAGE(auth.user));
const today = ref('');
const day = ref('');
const phase = ref('');
const items = ref([]);
const departments = ref([]);
const departmentId = ref(0);
const search = ref('');
const status = ref(typeof route.query.status === 'string' ? route.query.status : 'all');
const loading = ref(true);
const error = ref('');
const message = ref('');
const peerPhotoRequired = ref(false);
const busyId = ref(null);
const sel = ref(null);
const reason = ref('');
const events = ref(null);
const photoUrls = ref([]);
const newPhotos = ref([]);
const group = ref(null);
// คนที่เลือกเช็กแบบกลุ่มได้: ยังไม่มีบันทึกหรือรอตรวจสอบ และอยู่ในสิทธิ์ของผู้ใช้ (ไม่รวมตัวเอง)
const groupCandidates = computed(() => items.value.filter((p) => p.user_id !== auth.user.id && quickPresent(p) && (!search.value.trim() || shown.value.includes(p))));
const needGroupPhoto = computed(() => !manage.value);
function openGroup() {
  group.value = { photos: [], picked: groupCandidates.value.map((p) => p.user_id), busy: false };
}
async function saveGroup() {
  const g = group.value;
  if (needGroupPhoto.value && !g.photos.length) {
    g.warn = false;
    requestAnimationFrame(() => { g.warn = true; });
    document.querySelector('.modal .add')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return;
  }
  g.busy = true;
  error.value = '';
  message.value = '';
  try {
    const r = await api('/api/attendance/record-batch', { method: 'POST', body: { userIds: g.picked, photos: g.photos } });
    const names = new Map(items.value.map((p) => [p.user_id, p.full_name]));
    message.value = `บันทึก "มาเข้าแถว" ${r.saved} คน พร้อมรูปรวม`
      + (r.skipped.length ? `\nข้าม ${r.skipped.length} คน:\n${r.skipped.map((s) => `• ${s.message.startsWith(names.get(s.userId) || '-') ? s.message : `${names.get(s.userId) || ''}: ${s.message}`}`).join('\n')}` : '');
    group.value = null;
    await load();
  } catch (e) {
    alert(e.message);
  } finally {
    if (group.value) group.value.busy = false;
  }
}

const tabs = [
  { key: 'all', label: 'ทั้งหมด' },
  { key: 'none', label: 'ยังไม่เช็ก' },
  { key: 'pending', label: 'รอตรวจสอบ' },
  { key: 'flagged', label: 'ติดธง' },
  { key: 'present', label: 'มา' },
  { key: 'official', label: 'ราชการ' },
  { key: 'policy', label: 'งานนโยบาย' },
  { key: 'leave', label: 'ลา' },
  { key: 'absent', label: 'ขาด' },
];

const phaseText = computed(() => ({
  open: 'เปิดเช็กชื่ออยู่', before: 'ยังไม่เปิดเช็กชื่อ', closed: 'ปิดการเช็กชื่อแล้ว', no_assembly: 'ไม่มีการเข้าแถว',
}[phase.value] || ''));

const matches = (p, key) => {
  if (key === 'all') return true;
  if (key === 'none') return !p.status;
  if (key === 'flagged') return !!p.flagged;
  return p.status === key;
};
const counts = computed(() => Object.fromEntries(tabs.map((t) => [t.key, items.value.filter((p) => matches(p, t.key)).length])));
const shown = computed(() => {
  const q = search.value.trim();
  return items.value.filter((p) => matches(p, status.value) && (!q || p.full_name.includes(q) || p.employee_code.includes(q)));
});

function badge(p) {
  if (p.status) return STATUS[p.status];
  return phase.value === 'closed' ? STATUS.absent : STATUS.not_checked;
}

// ครูผู้รับมอบหมาย: เช็กแทนคนในแผนกได้ในช่วงเปิด
function quickPresent(p) {
  if (phase.value !== 'open') return false;
  if (p.status && p.status !== 'pending') return false;
  if (manage.value) return !p.status;
  return (auth.user.can_proxy || auth.user.peer_check) && p.department_id === auth.user.department_id && p.user_id !== auth.user.id;
}

function thaiDateTime(iso) {
  const d = new Date(iso);
  return `${thaiDate(new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 10), false)} ${thaiTime(iso)}`;
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const qs = new URLSearchParams(day.value ? { day: day.value } : {});
    if (departmentId.value) qs.set('departmentId', departmentId.value);
    const r = await api(`/api/attendance/roster?${qs}`);
    items.value = r.items;
    phase.value = r.phase;
    peerPhotoRequired.value = !!r.peerPhotoRequired;
    day.value = r.day;
    today.value = r.today;
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

const photoWarn = ref(false);
function nudge(flag) {
  flag.value = false;
  requestAnimationFrame(() => { flag.value = true; });
  document.querySelector('.modal .add')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
}
async function record(p, st) {
  // ต้องแนบรูปก่อน (โหมดเช็กแทนกันทั้งแผนก): บอกชัด ๆ แทนการปิดปุ่ม
  if (st === 'present' && !manage.value && peerPhotoRequired.value && sel.value?.user_id === p.user_id && !newPhotos.value.length) {
    nudge(photoWarn);
    return;
  }
  busyId.value = p.user_id;
  error.value = '';
  message.value = '';
  try {
    const body = { userId: p.user_id, status: st, reason: reason.value };
    if (sel.value && sel.value.user_id === p.user_id && newPhotos.value.length) body.photos = newPhotos.value;
    if (day.value !== today.value) body.day = day.value;
    const r = await api('/api/attendance/record', { method: 'POST', body });
    message.value = r.alreadyChecked ? `ℹ ${r.message}` : `บันทึก ${p.full_name}: ${STATUS[st].label}`;
    sel.value = null;
    await load();
  } catch (e) {
    error.value = e.message;
    if (e.code === 'ALREADY_CHECKED') { sel.value = null; await load(); return; }
    if (sel.value) alert(e.message);
  } finally {
    busyId.value = null;
  }
}

function open(p) {
  sel.value = p;
  reason.value = '';
  events.value = null;
  photoUrls.value.forEach((u) => URL.revokeObjectURL(u));
  photoUrls.value = [];
  newPhotos.value = [];
  photoWarn.value = false;
}

async function loadEvents() {
  try { events.value = (await api(`/api/attendance/${sel.value.attendance_id}/events`)).items; } catch (e) { alert(e.message); }
}
async function loadPhotos() {
  try {
    const list = (await api(`/api/attendance/${sel.value.attendance_id}/photos`)).items;
    photoUrls.value = await Promise.all(list.map((x) => imageUrl(`/api/attendance/photos/${x.id}`)));
  } catch (e) { alert(e.message); }
}

watch(() => route.query.status, (s) => { if (typeof s === 'string') status.value = s; });

onMounted(async () => {
  try {
    const d = await api('/api/reports/departments');
    departments.value = d.items;
  } catch { /* ไม่มีสิทธิ์ดูรายชื่อแผนก */ }
  await load();
});
</script>

<style scoped>
.list li { cursor: pointer; }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.btn.ok { background: var(--ok-bg); color: var(--ok); border-color: transparent; }
.btn.bad { background: var(--bad-bg); color: var(--bad); border-color: transparent; }
.btn.info { background: var(--info-bg); color: var(--info); border-color: transparent; }
.btn.info2 { background: var(--info2-bg); color: var(--info2); border-color: transparent; }
.btn.muted { background: var(--line); color: var(--text); border-color: transparent; }
.list li .btn.ok { background: var(--ok); color: #fff; }
.shake { animation: shake .4s; }
@keyframes shake { 0%, 100% { transform: none; } 25% { transform: translateX(-6px); } 75% { transform: translateX(6px); } }
.group-btn { margin: 0 0 10px; min-height: 48px; }
.steps { margin: 0; padding-left: 18px; }
.pick { max-height: 45vh; overflow: auto; }
.pick li.off { opacity: .55; }
.pick input { width: 20px; height: 20px; min-height: 20px; flex: none; }
.gallery { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.gallery img { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 8px; }
</style>
