<template>
  <div>
    <h1>ตั้งค่าระบบ</h1>
    <div v-if="error" class="alert bad">{{ error }}</div>
    <div v-if="saved" class="alert ok">บันทึกแล้ว</div>

    <!-- สถานะจริงของวันนี้ + วันที่ปฏิทินตั้งทับวันในสัปดาห์ -->
    <section v-if="today" class="card stack today" :class="today.phase === 'open' ? 'is-open' : 'is-off'">
      <div class="row">
        <strong class="grow">วันนี้ ({{ today.day }} · {{ today.serverTime?.slice(0, 5) }} น.)</strong>
        <span class="badge" :class="today.phase === 'open' ? 'ok' : 'warn'">{{ PHASE[today.phase] }}</span>
      </div>
      <p v-if="today.daySource === 'calendar' && !['normal', 'special'].includes(today.dayStatus)" class="small" style="margin:0">
        ⚠ ปฏิทินตั้งวันนี้เป็น <b>{{ DAY_STATUS[today.dayStatus] }}</b> ซึ่งมีผลเหนือ "วันเข้าแถวปกติ" ด้านล่าง ครูจึงเช็กชื่อไม่ได้
      </p>
      <ul v-if="overrides.length" class="list small">
        <li v-for="o in overrides" :key="o.day">
          <div class="main"><b>{{ o.day }}</b> · {{ DAY_STATUS[o.status] }}<template v-if="o.note"> · {{ o.note }}</template></div>
          <button type="button" class="btn sm" :disabled="busy" @click="clearOverride(o.day)">ยกเลิกการตั้งนี้</button>
        </li>
      </ul>
      <div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:8px">
        <span class="small muted">วันที่ตั้งในปฏิทิน 30 วันข้างหน้า</span>
        <router-link to="/calendar" class="btn sm">🗓 เปิดปฏิทินและภาคเรียน ›</router-link>
      </div>
    </section>
    <form v-if="s" class="stack" @submit.prevent="save">
      <section class="card stack">
        <h2>ช่วงเวลาเช็กชื่อ</h2>
        <div class="row">
          <label class="field grow"><span>เปิด</span><input v-model="s.open_time" type="time" required /></label>
          <label class="field grow"><span>ปิด (นับถึงวินาทีที่ 59 ของนาทีนี้)</span><input v-model="s.close_time" type="time" required /></label>
        </div>
        <div>
          <span class="small muted">วันเข้าแถวปกติ</span>
          <div class="row">
            <label v-for="(n, i) in days" :key="i" class="row small"><input v-model="weekdays" type="checkbox" :value="i" /> {{ n }}</label>
          </div>
        </div>
      </section>

      <section class="card stack" :class="{ 'peer-on': s.group_checkin === '1' }">
        <div class="row">
          <h2 class="grow" style="margin:0">เช็กแทนกันได้ทั้งแผนก</h2>
          <button type="button" class="switch" role="switch" :aria-checked="s.group_checkin === '1'"
            @click="s.group_checkin = s.group_checkin === '1' ? '0' : '1'"><span /></button>
        </div>
        <p class="small muted" style="margin:0">
          {{ s.group_checkin === '1'
            ? 'เปิดอยู่: ครูทุกคนเช็กชื่อ "มาเข้าแถว" ให้คนในแผนกเดียวกันได้ ในช่วงเวลาเช็กชื่อ ระบบบันทึกชื่อผู้เช็กแทนทุกครั้ง'
            : 'ปิดอยู่ (ค่าเริ่มต้น): เช็กแทนได้เฉพาะครูที่ผู้ดูแลติ๊ก "เช็กแทน" ไว้ในหน้าผู้ใช้' }}
        </p>
        <label v-if="s.group_checkin === '1'" class="chk small"><input type="checkbox" :checked="s.group_checkin_photo === '1'"
          @change="s.group_checkin_photo = $event.target.checked ? '1' : '0'" /> ต้องแนบรูปถ่ายอย่างน้อย 1 รูปทุกครั้งที่เช็กแทน (แนะนำ)</label>
        <p class="small muted" style="margin:0">กด <b>บันทึกการตั้งค่า</b> ด้านล่างเพื่อให้มีผล</p>
      </section>

      <section class="card stack">
        <h2>พื้นที่เข้าแถว (Geofence)</h2>
        <MapPicker :lat="s.geofence_lat" :lng="s.geofence_lng" :radius="Number(s.geofence_radius_m) || 0"
          @update="(p) => { s.geofence_lat = String(p.lat); s.geofence_lng = String(p.lng); }" />
        <details>
          <summary class="small">กรอกพิกัดเอง</summary>
          <div class="row" style="margin-top:6px">
            <label class="field grow"><span>ละติจูด</span><input v-model="s.geofence_lat" inputmode="decimal" /></label>
            <label class="field grow"><span>ลองจิจูด</span><input v-model="s.geofence_lng" inputmode="decimal" /></label>
          </div>
        </details>
        <a v-if="s.geofence_lat && s.geofence_lng" class="btn sm" style="align-self:flex-start" target="_blank" rel="noopener"
          :href="`https://www.google.com/maps?q=${s.geofence_lat},${s.geofence_lng}`">📍 ดูจุดนี้บน Google Maps ↗</a>
        <div class="row">
          <label class="field grow"><span>รัศมี (เมตร)</span><input v-model.number="s.geofence_radius_m" type="number" min="20" max="2000" /></label>
          <label class="field grow"><span>ความคลาดเคลื่อน GPS สูงสุดที่ยอมรับ (เมตร)</span><input v-model.number="s.max_accuracy_m" type="number" min="10" max="1000" /></label>
        </div>
      </section>

      <section class="card stack">
        <h2>วิธีเช็กชื่อ</h2>
        <label class="row"><input v-model="s.check_mode" type="radio" value="none" /> <span><b>กดปุ่มอย่างเดียว (ไม่ต้องตั้งค่า)</b> — เริ่มใช้ได้ทันที ไม่ตรวจพื้นที่และ QR เหมาะกับช่วงทดลองหรือวันที่ไม่สะดวกตั้งค่า</span></label>
        <label class="row"><input v-model="s.check_mode" type="radio" value="gps" /> <span><b>GPS อย่างเดียว</b> — สะดวกที่สุด แต่ปลอม GPS ได้</span></label>
        <label class="row"><input v-model="s.check_mode" type="radio" value="gps_or_qr" /> <span><b>GPS หรือ QR</b> (แนะนำ) — อยู่ในพื้นที่ผ่านทันที ถ้า GPS ไม่ชัดให้สแกน QR</span></label>
        <label class="row"><input v-model="s.check_mode" type="radio" value="qr_required" /> <span><b>ต้องสแกน QR ทุกครั้ง</b> + ตรวจ GPS — เข้มงวดที่สุด</span></label>
        <label class="field"><span>QR เปลี่ยนทุก (วินาที)</span><input v-model.number="s.qr_interval_s" type="number" min="10" max="300" /></label>
      </section>

      <section class="card stack">
        <h2>ข้อมูลส่วนบุคคล</h2>
        <label class="field"><span>ลบรูปหลักฐานอัตโนมัติเมื่อครบ (วัน)</span><input v-model.number="s.photo_retention_days" type="number" min="1" max="3650" /></label>
        <label class="field"><span>ชื่อสถานศึกษา</span><input v-model="s.college_name" /></label>
      </section>

      <button class="btn primary block" :disabled="busy">บันทึกการตั้งค่า</button>
    </form>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { api } from '../../api';
import MapPicker from '../../components/MapPicker.vue';

const days = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
const s = ref(null);
const weekdays = ref([]);
const error = ref('');
const saved = ref(false);
const busy = ref(false);

const KEYS = ['open_time', 'close_time', 'check_mode', 'geofence_lat', 'geofence_lng', 'geofence_radius_m', 'max_accuracy_m', 'qr_interval_s', 'photo_retention_days', 'college_name', 'group_checkin', 'group_checkin_photo'];

const PHASE = { open: 'เปิดเช็กชื่ออยู่', before: 'ยังไม่ถึงเวลาเปิด', closed: 'ปิดแล้ว', no_assembly: 'ไม่มีการเข้าแถว' };
const DAY_STATUS = { normal: 'มีเข้าแถว (วันพิเศษ)', special: 'กิจกรรมพิเศษ', cancelled: 'งดเข้าแถว', holiday: 'วันหยุด', public_holiday: 'วันหยุดนักขัตฤกษ์' };
const today = ref(null);
const overrides = ref([]);
async function loadToday() {
  try {
    today.value = await api('/api/attendance/state');
    const d = new Date(`${today.value.day}T00:00:00Z`);
    const to = new Date(d.getTime() + 30 * 86400_000).toISOString().slice(0, 10);
    overrides.value = (await api(`/api/admin/assembly-days?from=${today.value.day}&to=${to}`)).items;
  } catch { /* ไม่บังคับ */ }
}
async function clearOverride(day) {
  if (!confirm(`ยกเลิกการตั้งปฏิทินวันที่ ${day}? วันนั้นจะกลับไปใช้ "วันเข้าแถวปกติ"`)) return;
  busy.value = true;
  try {
    await api(`/api/admin/assembly-days/${day}`, { method: 'DELETE' });
    await loadToday();
  } catch (e) { error.value = e.message; } finally { busy.value = false; }
}

onMounted(async () => {
  loadToday();
  try {
    s.value = await api('/api/admin/settings');
    weekdays.value = s.value.assembly_weekdays.split(',').map(Number);
  } catch (e) {
    error.value = e.message;
  }
});

async function save() {
  busy.value = true;
  error.value = '';
  saved.value = false;
  try {
    const body = Object.fromEntries(KEYS.map((k) => [k, s.value[k]]));
    body.assembly_weekdays = [...weekdays.value].sort().join(',');
    s.value = await api('/api/admin/settings', { method: 'PUT', body });
    saved.value = true;
    loadToday();
    window.scrollTo(0, 0);
  } catch (e) {
    error.value = e.message;
    window.scrollTo(0, 0);
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
.today.is-off { border-left: 4px solid var(--warn); }
.peer-on { border-left: 4px solid var(--brand-2); }
.chk { display: flex; align-items: flex-start; gap: 8px; cursor: pointer; }
.chk input { flex: none; width: 18px; height: 18px; min-height: 18px; margin-top: 2px; }
.switch { flex: none; width: 52px; height: 30px; border-radius: 999px; border: 0; padding: 3px; background: var(--line); cursor: pointer; transition: background .15s; }
.switch span { display: block; width: 24px; height: 24px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.3); transition: transform .15s; }
.switch[aria-checked='true'] { background: var(--brand-2); }
.switch[aria-checked='true'] span { transform: translateX(22px); }
.today.is-open { border-left: 4px solid var(--ok); }
input[type=radio] { width: 20px; min-height: 20px; height: 20px; flex: none; }
label.row { align-items: flex-start; }
</style>
