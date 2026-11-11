<template>
  <div>
    <div v-if="loadError" class="alert bad">{{ loadError }} <button class="btn sm" @click="load">ลองใหม่</button></div>

    <section v-if="state" class="card hero">
      <p class="muted small">{{ greeting }} · {{ thaiDate(state.day) }}</p>
      <div class="clock">{{ clock }}</div>
      <p class="phase" :class="phaseCls">{{ phaseText }}</p>
    </section>

    <WindowControl v-if="state && canManage" :state="state" @changed="onWindow" />

    <!-- ผลวันนี้ -->
    <section v-if="record" class="card result" :class="STATUS[record.status].cls">
      <div class="big">{{ record.status === 'present' ? '✓' : record.status === 'pending' ? '…' : 'i' }}</div>
      <h2>{{ statusLabel(record) }}</h2>
      <p class="small">
        {{ METHOD[record.method] }} เวลา {{ thaiTime(record.checked_at) }} น.
        <template v-if="record.checked_by !== auth.user.id"><br /><b>{{ ['proxy_activity','admin'].includes(record.method) ? 'บันทึกโดย' : 'เช็กแทนโดย' }} {{ record.checked_by_name }}</b></template>
        <template v-if="record.distance_m !== null"><br />ระยะจากจุดเข้าแถว {{ record.distance_m }} ม.</template>
      </p>
      <p v-if="record.note" class="small muted">หมายเหตุ: {{ record.note }}</p>
      <button v-if="record.status === 'pending' && state.phase === 'open'" class="btn block" :disabled="busy" @click="checkIn()">ลองเช็กชื่อด้วย GPS อีกครั้ง</button>
      <p class="small muted" style="margin:8px 0 0">รูปหลักฐาน {{ record.photo_count || 0 }}/3 รูป</p>
      <div v-if="(record.photo_count || 0) < 3 && state.phase !== 'no_assembly'" class="stack" style="text-align:left;margin-top:6px">
        <details class="more-photo">
          <summary>📷 แนบรูปหลักฐานเพิ่ม</summary>
          <div class="stack" style="margin-top:8px">
            <PhotoPicker v-model="extraPhotos" :max="3 - (record.photo_count || 0)" capture />
            <button class="btn primary" :disabled="!extraPhotos.length || busy" @click="uploadExtra">อัปโหลดรูป</button>
          </div>
        </details>
      </div>
    </section>

    <!-- ปุ่มเช็กชื่อ -->
    <section v-if="state && !auth.user.must_assemble" class="alert info">
      บัญชีนี้ไม่อยู่ในเกณฑ์ต้องเข้าแถว — ใช้เมนูด้านล่างเพื่อดูรายชื่อ รายงาน หรือแสดง QR
    </section>
    <section v-else-if="state && !record && state.phase === 'open'" class="card center">
      <div v-if="qrToken" class="alert info">สแกน QR จุดเข้าแถวแล้ว — แตะปุ่มด้านล่างเพื่อยืนยัน</div>
      <button class="checkin" :disabled="busy" @click="checkIn()">
        <span v-if="!busy">แตะเพื่อ<br />เช็กชื่อเข้าแถว</span>
        <span v-else>{{ busyText }}</span>
      </button>
      <p class="small muted" style="margin:0 0 14px">{{ state.checkMode === 'none' ? 'แตะปุ่มเดียวก็เช็กชื่อได้' : 'ระบบจะอ่านตำแหน่งของท่าน ณ เวลานี้เท่านั้น' }}</p>
      <div class="actions">
        <button type="button" class="act" :disabled="busy" @click="scanning = true">
          <span class="ai qr" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" /><rect x="8" y="8" width="8" height="8" rx="1" /></svg></span>
          <span class="at"><b>สแกน QR</b><small>ที่จุดเข้าแถว</small></span>
        </button>
        <button type="button" class="act" :class="{ on: showPhotos || photos.length }" :aria-expanded="showPhotos" @click="showPhotos = !showPhotos">
          <span class="ai cam" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" /><circle cx="12" cy="13" r="3.5" /></svg><i v-if="photos.length" class="cnt">{{ photos.length }}</i></span>
          <span class="at"><b>แนบรูป</b><small>{{ photos.length ? `เลือกแล้ว ${photos.length} รูป` : 'หลักฐาน (ไม่บังคับ)' }}</small></span>
        </button>
      </div>
      <div v-if="showPhotos" class="photos-opt"><PhotoPicker v-model="photos" capture /></div>
      <p v-if="pos" class="small">พิกัดล่าสุด: ความแม่นยำ ±{{ Math.round(pos.accuracy) }} ม.
        <template v-if="distance !== null"> · ห่างจุดเข้าแถว {{ distance }} ม.</template></p>
    </section>

    <!-- เช็กไม่ผ่าน -->
    <section v-if="review" class="card stack">
      <div class="alert warn"><b>ยังเช็กชื่อไม่สำเร็จ</b><br />{{ review.message }}</div>
      <button class="btn block" :disabled="busy" @click="checkIn()">ลองอีกครั้ง</button>
      <button type="button" class="btn block scan-btn" :disabled="busy" @click="scanning = true">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" /><rect x="8" y="8" width="8" height="8" rx="1" /></svg>
        สแกน QR Code ที่จุดเข้าแถว
      </button>
      <details :open="review.geo !== 'out_of_zone'">
        <summary><b>ส่งคำขอให้เจ้าหน้าที่ตรวจสอบ</b></summary>
        <div class="stack" style="margin-top:10px">
          <label class="field"><span>หมายเหตุ (เช่น ยืนอยู่บริเวณใด)</span><textarea v-model="note" maxlength="300" /></label>
          <span class="small muted">รูปถ่ายประกอบ ณ จุดเข้าแถว</span>
          <PhotoPicker v-model="photos" capture />
          <button class="btn primary block" :disabled="busy" @click="checkIn({ requestReview: true })">ส่งคำขอตรวจสอบ</button>
        </div>
      </details>
    </section>

    <QrScanner v-if="scanning" @close="scanning = false" @token="onScan" />

    <div v-if="error" class="alert bad">{{ error }}</div>
    <div v-if="message" class="alert ok">{{ message }}</div>

    <router-link v-if="sentBack > 0" to="/report-docs" class="card row sign-banner back">
      <span class="ico" aria-hidden="true">↩</span>
      <span class="grow"><b>มีเอกสารถูกส่งกลับแก้ไข {{ sentBack }} ฉบับ</b><br /><span class="small muted">แตะเพื่อเปิด แก้ไข แล้วส่งลงนามใหม่</span></span>
    </router-link>
    <router-link v-if="toSign > 0" to="/report-docs" class="card row sign-banner">
      <span style="font-size:1.6rem">📝</span>
      <span class="grow"><b>มีเอกสารรอท่านลงนาม {{ toSign }} ฉบับ</b><br /><span class="small muted">แตะเพื่อเปิดเอกสารและลงนาม</span></span>
      <span>›</span>
    </router-link>

    <router-link v-if="state && (auth.user.can_proxy || auth.user.peer_check) && !['admin','activity'].includes(auth.user.role)" to="/roster" class="peer-tile">
      <span class="pi" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.2" /><path d="M3 19c.6-3.2 3-5 6-5s5.4 1.8 6 5" /><path d="M15.5 5.2a3 3 0 0 1 0 5.6M17.5 14.3c1.8.6 3 2.3 3.5 4.7" /></svg></span>
      <span class="pt">
        <small>{{ auth.user.can_proxy ? 'ท่านเป็นตัวแทนเช็กชื่อแผนก' : 'เช็กแทนกันในแผนกได้' }}</small>
        <b>เช็กชื่อให้เพื่อน</b>
        <small class="dept">{{ auth.user.department_name || 'ในแผนกของท่าน' }}</small>
      </span>
      <span class="go-btn">เปิดรายชื่อ <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg></span>
    </router-link>

    <section v-if="state && state.phase === 'open' && !state.geofence && state.checkMode !== 'none'" class="alert warn small">
      ผู้ดูแลระบบยังไม่ได้กำหนดพื้นที่เข้าแถว ระบบจะส่งการเช็กชื่อให้เจ้าหน้าที่ตรวจสอบ
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, auth } from '../api';
import { STATUS, METHOD, statusLabel, thaiDate, thaiTime, deviceId, getBestPosition, distanceMeters } from '../util';
import PhotoPicker from '../components/PhotoPicker.vue';
import QrScanner from '../components/QrScanner.vue';
import WindowControl from '../components/WindowControl.vue';
import { MANAGE } from '../router';

const route = useRoute();
const router = useRouter();
const state = ref(null);
const record = computed(() => state.value?.record || null);
const loadError = ref('');
const busy = ref(false);
const busyText = ref('');
const error = ref('');
const message = ref('');
const review = ref(null);
const note = ref('');
const photos = ref([]);
const extraPhotos = ref([]);
const scanning = ref(false);
const showPhotos = ref(false);
const toSign = ref(0);
const sentBack = ref(0);
const pos = ref(null);
const qrToken = ref(null);
const offset = ref(0);
const clock = ref('');
let timer;

const greeting = computed(() => {
  const h = Number(clock.value.slice(0, 2));
  return h < 12 ? 'สวัสดีตอนเช้า' : h < 17 ? 'สวัสดีตอนบ่าย' : 'สวัสดีตอนเย็น';
});

const phaseText = computed(() => {
  const s = state.value;
  if (!s) return '';
  return {
    open: `${s.manual ? `เปิดเช็กชื่ออยู่ (งานกิจกรรมสั่งเปิดเมื่อ ${s.manual.at} น.)` : `เปิดเช็กชื่อ ${s.openTime}–${s.closeTime} น.`}${s.dayStatus === 'special' ? ` · กิจกรรมพิเศษ${s.dayNote ? `: ${s.dayNote}` : ''}` : ''}`,
    before: `ยังไม่ถึงเวลา — เปิดเช็กชื่อ ${s.openTime} น.`,
    closed: s.manual ? `ปิดการเช็กชื่อแล้ว (งานกิจกรรมสั่งปิดเมื่อ ${s.manual.at} น.)` : `ปิดการเช็กชื่อแล้ว (${s.closeTime} น.)`,
    no_assembly: `วันนี้ไม่มีการเข้าแถว${s.daySource === 'calendar' ? ` · ${{ cancelled: 'งดเข้าแถวตามปฏิทินกิจกรรม', holiday: 'วันหยุดตามปฏิทิน', public_holiday: 'วันหยุดนักขัตฤกษ์' }[s.dayStatus] || ''}` : ''}${s.dayNote ? ` · ${s.dayNote}` : ''}`,
  }[s.phase];
});
const phaseCls = computed(() => ({ open: 'ok', before: 'warn', closed: 'bad', no_assembly: 'muted' }[state.value?.phase]));

const distance = computed(() => {
  if (!pos.value || !state.value?.geofence) return null;
  return Math.round(distanceMeters(pos.value, state.value.geofence));
});

function tick() {
  const d = new Date(Date.now() + offset.value + 7 * 3600_000);
  clock.value = d.toISOString().slice(11, 19);
}

const canManage = computed(() => MANAGE(auth.user));
function onWindow(s) {
  state.value = { ...state.value, ...s };
}

async function load() {
  loadError.value = '';
  try {
    const s = await api('/api/attendance/state');
    // ใช้เวลาเซิร์ฟเวอร์เป็นหลัก
    const [hh, mm, ss] = s.serverTime.split(':').map(Number);
    const server = Date.parse(`${s.day}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}+07:00`);
    offset.value = server - Date.now();
    state.value = s;
  } catch (e) {
    loadError.value = e.message;
  }
}

function onScan(token) {
  scanning.value = false;
  qrToken.value = token;
  sessionStorage.setItem('lineup_qr', token);
  checkIn();
}

async function uploadExtra() {
  busy.value = true;
  error.value = '';
  try {
    await api(`/api/attendance/${record.value.id}/photos`, { method: 'POST', body: { photos: extraPhotos.value } });
    extraPhotos.value = [];
    message.value = 'อัปโหลดรูปแล้ว';
    await load();
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}

async function checkIn(extra = {}) {
  busy.value = true;
  error.value = '';
  message.value = '';
  try {
    busyText.value = 'กำลังอ่านตำแหน่ง…';
    let loc = null;
    try {
      // โหมดกดปุ่มอย่างเดียว: ไม่ต้องอ่านตำแหน่ง
      if (state.value?.checkMode !== 'none') {
        loc = await getBestPosition();
        pos.value = loc;
      }
    } catch (e) {
      if (!qrToken.value && !extra.requestReview) {
        review.value = { message: e.message, geo: 'no_location' };
        return;
      }
    }
    busyText.value = 'กำลังบันทึก…';
    const body = { ...(loc || {}), deviceId: deviceId(), qrToken: qrToken.value || undefined, ...extra };
    if (extra.requestReview) body.note = note.value;
    if (photos.value.length) body.photos = photos.value;
    const r = await api('/api/attendance/check-in', { method: 'POST', body });
    if (r.needsReview) {
      review.value = r;
      return;
    }
    review.value = null;
    showPhotos.value = false;
    if (r.alreadyChecked) { message.value = r.message; photos.value = []; await load(); return; }
    photos.value = [];
    qrToken.value = null;
    sessionStorage.removeItem('lineup_qr');
    message.value = r.message;
    if (navigator.vibrate) navigator.vibrate(80);
    await load();
  } catch (e) {
    error.value = e.message;
    if (e.code === 'QR_INVALID') {
      qrToken.value = null;
      sessionStorage.removeItem('lineup_qr');
    }
    if (['CLOSED', 'NOT_OPEN', 'NO_ASSEMBLY'].includes(e.code)) await load();
  } finally {
    busy.value = false;
  }
}

onMounted(async () => {
  // ลิงก์จาก QR: เก็บ token ไว้ แล้วล้างออกจาก URL
  const q = typeof route.query.qr === 'string' ? route.query.qr : sessionStorage.getItem('lineup_qr');
  if (q) {
    qrToken.value = q;
    sessionStorage.setItem('lineup_qr', q);
    if (route.query.qr) router.replace({ path: '/' });
  }
  await load();
  api('/api/report-docs/pending-count').then((r) => { toSign.value = r.count; sentBack.value = r.returned || 0; }).catch(() => {});
  tick();
  timer = setInterval(() => {
    tick();
    const s = state.value;
    // เปลี่ยนช่วงเวลาอัตโนมัติเมื่อถึงเวลาเปิด/ปิด (ไม่ใช้เมื่องานกิจกรรมสั่งเปิด/ปิดด้วยมือ)
    if (s && !s.manual && ((s.phase === 'before' && clock.value >= `${s.openTime}:00`) || (s.phase === 'open' && clock.value > `${s.closeTime}:59`))) load();
    // ยังไม่ได้เช็กชื่อ: ตรวจทุก 30 วินาที เผื่อมีเพื่อนเช็กแทนให้แล้ว หรืองานกิจกรรมสั่งเปิด/ปิดด้วยมือ
    else if (s && s.phase !== 'no_assembly' && (!record.value || canManage.value) && !busy.value && clock.value.endsWith('0') && Number(clock.value.slice(6, 8)) % 30 === 0) load();
  }, 1000);
  if (qrToken.value && state.value?.phase === 'open' && !record.value) checkIn();
});
onUnmounted(() => clearInterval(timer));
</script>

<style scoped>
.sign-banner { text-decoration: none; color: inherit; border-left: 4px solid var(--brand-2); align-items: center; gap: 12px; }
.sign-banner.back { border-left-color: var(--bad); }
.hero { text-align: center; }
.clock { font-size: 3rem; font-weight: 700; font-variant-numeric: tabular-nums; letter-spacing: 1px; line-height: 1.1; }
.phase { margin: 6px 0 0; font-weight: 600; }
.phase.ok { color: var(--ok); } .phase.warn { color: var(--warn); } .phase.bad { color: var(--bad); } .phase.muted { color: var(--muted); }
.checkin {
  width: 220px; height: 220px; border-radius: 50%; border: 0; margin: 10px auto 14px; display: flex; align-items: center; justify-content: center;
  background: radial-gradient(circle at 30% 30%, #3b82d6, var(--fill)); color: #fff; font: inherit; font-size: 1.35rem; font-weight: 700; line-height: 1.35;
  box-shadow: 0 10px 30px rgba(29, 78, 137, .35), inset 0 -6px 0 rgba(0,0,0,.12); cursor: pointer;
}
.checkin:active { transform: scale(.97); }
.checkin:disabled { opacity: .8; }
.result { text-align: center; }
.result .big { width: 64px; height: 64px; margin: 0 auto 8px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 2rem; font-weight: 700; color: #fff; }
.result.ok .big { background: var(--ok); } .result.warn .big { background: var(--warn); } .result.info .big, .result.info2 .big, .result.muted .big { background: var(--info); } .result.bad .big { background: var(--bad); }
.photos-opt { text-align: left; margin-top: 12px; padding: 12px; border-radius: 14px; background: var(--bg); border: 1px dashed var(--line); }
summary { cursor: pointer; padding: 6px 0; }
.actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; text-align: left; }
.act { display: flex; align-items: center; gap: 10px; min-height: 64px; padding: 10px 12px; border-radius: 16px; border: 1px solid var(--line);
  background: var(--card); color: var(--text); font: inherit; cursor: pointer; box-shadow: 0 2px 6px rgba(15, 42, 74, .06); transition: transform .1s, border-color .15s, box-shadow .15s; }
.act:hover, .act:focus-visible { border-color: var(--brand-2); box-shadow: 0 4px 14px rgba(29, 78, 137, .14); }
.act:active { transform: scale(.97); }
.act:disabled { opacity: .6; }
.act.on { border-color: var(--brand-2); background: var(--info-bg); }
.ai { position: relative; flex: none; width: 42px; height: 42px; border-radius: 12px; display: flex; align-items: center; justify-content: center; }
.ai svg { width: 24px; height: 24px; fill: none; stroke: currentColor; stroke-width: 1.9; stroke-linecap: round; stroke-linejoin: round; }
.ai.qr { background: linear-gradient(135deg, #1d4e89, #2f6fb8); color: #fff; }
.ai.cam { background: linear-gradient(135deg, #0f9d74, #34c38f); color: #fff; }
.cnt { position: absolute; top: -6px; right: -6px; min-width: 20px; height: 20px; padding: 0 5px; border-radius: 10px; background: var(--bad); color: #fff; font-size: .72rem; font-style: normal; font-weight: 700; display: flex; align-items: center; justify-content: center; border: 2px solid var(--card); }
.at { display: flex; flex-direction: column; align-items: flex-start; text-align: left; min-width: 0; line-height: 1.3; }
.at b { white-space: nowrap; }
.at b { font-size: 1rem; }
.at small { color: var(--muted); font-size: .78rem; }
.peer-tile { display: flex; align-items: center; gap: 12px; padding: 14px; margin-bottom: 14px; border-radius: var(--radius); text-decoration: none; color: inherit;
  background: linear-gradient(135deg, var(--info-bg), var(--card) 70%); border: 1px solid var(--line); border-left: 4px solid #0f9d74; box-shadow: var(--shadow); transition: transform .1s, box-shadow .15s, border-color .15s; }
.peer-tile:hover, .peer-tile:focus-visible { box-shadow: 0 6px 18px rgba(29, 78, 137, .14); border-color: var(--brand-2); border-left-color: #0f9d74; outline: none; }
.peer-tile:active { transform: scale(.98); }
.pi { flex: none; width: 48px; height: 48px; border-radius: 14px; background: linear-gradient(135deg, #0f9d74, #34c38f); color: #fff; display: flex; align-items: center; justify-content: center; }
.pi svg { width: 26px; height: 26px; fill: none; stroke: currentColor; stroke-width: 1.9; stroke-linecap: round; stroke-linejoin: round; }
.pt { flex: 1; min-width: 0; display: flex; flex-direction: column; line-height: 1.35; }
.pt b { font-size: 1.05rem; }
.pt small { color: var(--muted); font-size: .78rem; }
.pt .dept { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.go-btn { flex: none; display: inline-flex; align-items: center; gap: 2px; padding: 8px 10px 8px 14px; border-radius: 999px; background: var(--fill); color: #fff; font-weight: 600; font-size: .85rem; white-space: nowrap; }
.go-btn svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; }
@media (max-width: 380px) { .go-btn { font-size: 0; padding: 10px; gap: 0; } .go-btn svg { width: 18px; height: 18px; } }
.scan-btn { display: flex; align-items: center; justify-content: center; gap: 8px; }
.scan-btn svg { width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 1.9; stroke-linecap: round; stroke-linejoin: round; }
.more-photo summary { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 999px; border: 1px solid var(--line); background: var(--card); font-weight: 600; font-size: .9rem; list-style: none; }
.more-photo summary::-webkit-details-marker { display: none; }
@media (max-width: 360px) { .actions { grid-template-columns: 1fr; } }
</style>
