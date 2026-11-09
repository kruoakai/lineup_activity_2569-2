<template>
  <div>
    <h1>สำรองและกู้คืนระบบ</h1>
    <div v-if="error" class="alert bad" style="white-space:pre-line">{{ error }}</div>
    <div v-if="msg" class="alert ok" style="white-space:pre-line">{{ msg }}</div>

    <!-- สถานะการกู้คืน -->
    <section v-if="rs.pending" class="alert warn"><b>⏳ กำลังกู้คืนระบบ…</b> ระบบจะสำรองข้อมูลปัจจุบันก่อน แล้วนำเข้าไฟล์สำรอง (ประมาณ 1–3 นาที) ระหว่างนี้ผู้ใช้อาจใช้งานไม่ได้ชั่วคราว</section>
    <section v-else-if="rs.last && recentRestore" class="alert" :class="rs.last.ok ? 'ok' : 'bad'">
      <b>{{ rs.last.ok ? '✓ กู้คืนระบบสำเร็จ' : '✕ กู้คืนไม่สำเร็จ' }}</b> · {{ dt(rs.last.finished_at) }}<br />
      <span class="small">{{ rs.last.message }}<template v-if="rs.last.safety_backup"> · ข้อมูลก่อนกู้คืนถูกสำรองไว้ที่ {{ rs.last.safety_backup }}</template></span>
      <div v-if="rs.last.ok" class="row" style="margin-top:8px"><button class="btn sm" @click="relogin">เข้าสู่ระบบใหม่</button></div>
    </section>

    <!-- 1. สำรอง -->
    <section class="card stack">
      <h2 class="h"><span class="n">1</span> สำรองข้อมูล</h2>
      <p class="small" style="margin:0"><b>อัตโนมัติ:</b> {{ data.schedule || 'ทุกเที่ยงคืนหลังวันทำการ' }}</p>
      <p v-if="data.last" class="small" style="margin:0">ครั้งล่าสุด {{ dt(data.last.at) }} ·
        <span :class="data.last.ok ? 'badge ok' : 'badge bad'">{{ data.last.ok ? 'สำเร็จ' : 'ล้มเหลว' }}</span>
        ({{ REASON[data.last.reason] || data.last.reason }})</p>
      <p v-if="data.available === false" class="alert warn small">ไม่พบโฟลเดอร์สำรองข้อมูลบนเซิร์ฟเวอร์ (รันในเครื่องนักพัฒนา)</p>
      <button class="btn primary" :disabled="busy || data.pending" @click="runNow">{{ data.pending ? 'กำลังสำรอง…' : '💾 สำรองตอนนี้' }}</button>
    </section>

    <!-- 2. ไฟล์สำรองทั้งระบบ -->
    <section class="card">
      <h2 class="h"><span class="n">2</span> ไฟล์สำรองทั้งระบบ ({{ data.full?.length || 0 }} รอบ)</h2>
      <p class="small muted">หนึ่งรอบ = ฐานข้อมูล + รูปหลักฐาน + ลายเซ็น · ดาวน์โหลด <b>ไฟล์กู้คืนทั้งระบบ (.tar)</b> เก็บไว้นอกเซิร์ฟเวอร์อย่างน้อยสัปดาห์ละครั้ง
        (เช่น ไดรฟ์ของวิทยาลัย) เพื่อใช้กู้คืนเมื่อเซิร์ฟเวอร์เสียหาย</p>
      <ul class="list">
        <li v-for="f in data.full" :key="f.ts" class="bk">
          <div class="main">
            <b>{{ tsText(f.ts) }}</b>
            <span class="small muted">{{ size(f.bytes) }} · {{ f.uploads ? 'ฐานข้อมูล + รูป/ลายเซ็น' : 'ฐานข้อมูลอย่างเดียว' }}</span>
          </div>
          <div class="dl">
            <button class="btn sm primary" :disabled="busy" @click="downloadFull(f)">⬇ ไฟล์กู้คืนทั้งระบบ (.tar)</button>
            <details class="more">
              <summary class="btn sm">อื่น ๆ</summary>
              <div class="pop">
                <button class="btn sm" :disabled="busy" title="เปิดด้วย phpMyAdmin / MySQL Workbench / HeidiSQL" @click="download(f.db, 'sql')">⬇ ฐานข้อมูล .sql</button>
                <button class="btn sm" :disabled="busy" @click="download(f.db)">⬇ ฐานข้อมูล .sql.gz</button>
                <button v-if="f.uploads" class="btn sm" :disabled="busy" @click="download(f.uploads)">⬇ รูป/ลายเซ็น .tar.gz</button>
              </div>
            </details>
          </div>
        </li>
        <li v-if="!data.full?.length" class="muted small">ยังไม่มีไฟล์สำรอง</li>
      </ul>
    </section>

    <!-- 3. กู้คืน -->
    <section class="card stack danger-zone">
      <h2 class="h"><span class="n bad">3</span> กู้คืนระบบ</h2>
      <p class="small" style="margin:0">ใช้เมื่อข้อมูลเสียหาย ถูกลบผิด หรือย้ายไปเซิร์ฟเวอร์ใหม่ — <b>ข้อมูลทั้งหมดจะถูกแทนที่ด้วยไฟล์สำรอง</b>
        ระบบสำรองข้อมูลปัจจุบันให้อัตโนมัติก่อนกู้คืนเสมอ (ย้อนกลับได้)</p>
      <div class="tabs" role="tablist">
        <button role="tab" :aria-selected="src === 'server'" :class="{ on: src === 'server' }" @click="src = 'server'">จากไฟล์สำรองบนเซิร์ฟเวอร์</button>
        <button role="tab" :aria-selected="src === 'upload'" :class="{ on: src === 'upload' }" @click="src = 'upload'">อัปโหลดไฟล์จากเครื่อง</button>
      </div>

      <label v-if="src === 'server'" class="field"><span>เลือกรอบที่จะกู้คืน</span>
        <select v-model="pickTs">
          <option value="">— เลือก —</option>
          <option v-for="f in data.full" :key="f.ts" :value="f.ts">{{ tsText(f.ts) }} · {{ f.uploads ? 'ฐานข้อมูล + รูป' : 'ฐานข้อมูล' }}</option>
        </select></label>

      <template v-else>
        <label class="drop" :class="{ has: uploaded }">
          <input type="file" accept=".tar,.gz,application/x-tar,application/gzip" :disabled="busy" @change="upload" />
          <span class="di" aria-hidden="true">📤</span>
          <span>{{ uploaded ? uploadName : 'แตะเพื่อเลือกไฟล์ lineup-full-….tar หรือ db-….sql.gz' }}</span>
        </label>
        <div v-if="progress !== null" class="bar"><i :style="{ width: `${progress}%` }" /><span>{{ progress < 100 ? `อัปโหลด ${progress}%` : 'กำลังตรวจไฟล์…' }}</span></div>
        <div v-if="uploaded" class="alert ok small" style="margin:0">
          ✓ ไฟล์ใช้กู้คืนได้ · ฐานข้อมูล{{ uploaded.completedAt ? ` (สำรองเมื่อ ${uploaded.completedAt})` : '' }}{{ uploaded.uploads ? ' + รูป/ลายเซ็น' : ' (ไม่มีรูป/ลายเซ็น)' }}
        </div>
      </template>

      <label v-if="hasUploads" class="row small"><input v-model="includeUploads" type="checkbox" /> คืนรูปหลักฐานและลายเซ็นด้วย (แนะนำ)</label>
      <label class="field"><span>พิมพ์คำว่า <b>กู้คืนระบบ</b> เพื่อยืนยัน</span><input v-model="confirmText" autocomplete="off" /></label>
      <button class="btn dangerfill" :disabled="busy || rs.pending || !ready || confirmText !== 'กู้คืนระบบ'" @click="restore">⚠ กู้คืนระบบ</button>

      <details class="guide">
        <summary class="small"><b>เซิร์ฟเวอร์เสียทั้งเครื่อง / ย้ายเครื่องใหม่ ทำอย่างไร</b></summary>
        <ol class="small">
          <li>ติดตั้งระบบบนเครื่องใหม่ตามคู่มือ INSTALL.md (ใช้โดเมนเดิม)</li>
          <li>เข้าสู่ระบบด้วยบัญชี <b>admin</b> ของเครื่องใหม่ → เมนู สำรองและกู้คืนระบบ</li>
          <li>แท็บ “อัปโหลดไฟล์จากเครื่อง” เลือกไฟล์ <b>lineup-full-….tar</b> ล่าสุดที่เก็บไว้ แล้วกู้คืน</li>
          <li>เมื่อเสร็จ ทุกคนเข้าสู่ระบบด้วยรหัสผ่านเดิมได้ตามปกติ</li>
          <li>ถ้าหน้าเว็บเปิดไม่ได้: ผู้ดูแลเซิร์ฟเวอร์ใช้คำสั่ง <code>docker compose exec backup bash /run.sh restore &lt;ไฟล์&gt;</code> (ดู INSTALL.md)</li>
        </ol>
      </details>
    </section>

    <!-- 4. Excel -->
    <section class="card stack">
      <h2 class="h"><span class="n">4</span> ส่งออก Excel เพื่อทำรายงานต่อ</h2>
      <p class="small muted" style="margin:0">8 แผ่นงาน: ภาพรวม · รายบุคคล · รายแผนก · รายหน่วยงาน · รายวัน · บันทึกการเข้าแถวทุกรายการ · บุคลากร · ปฏิทิน
        (ผู้ใช้แต่ละบทบาทสำรองข้อมูลงานของตนเองได้ที่เมนู “สำรองข้อมูลงานของฉัน”)</p>
      <div class="row">
        <label class="field grow"><span>ตั้งแต่</span><input v-model="xFrom" type="date" /></label>
        <label class="field grow"><span>ถึง</span><input v-model="xTo" type="date" :min="xFrom" /></label>
      </div>
      <button class="btn" :disabled="busy || !xFrom || !xTo" @click="exportXlsx">📊 ส่งออก Excel (.xlsx)</button>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api, logout, postDownload, uploadFile } from '../../api';
import { serverToday, addDays, thaiRange } from '../../util';
import { askPassword } from '../../confirm';

const router = useRouter();
const REASON = { manual: 'กดสำรองเอง', scheduled: 'ตามเวลา', 'before-restore': 'ก่อนกู้คืนระบบ', 'manual-cli': 'คำสั่งบนเซิร์ฟเวอร์' };
const MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const data = ref({});
const rs = ref({});
const busy = ref(false);
const error = ref('');
const msg = ref('');
const src = ref('server');
const pickTs = ref('');
const uploaded = ref(null);
const uploadName = ref('');
const progress = ref(null);
const includeUploads = ref(true);
const confirmText = ref('');
let timer;

const dt = (iso) => new Date(iso).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
const size = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const tsText = (ts) => `${Number(ts.slice(6, 8))} ${MONTHS[Number(ts.slice(4, 6)) - 1]} ${Number(ts.slice(0, 4)) + 543} ${ts.slice(9, 11)}:${ts.slice(11, 13)} น.`;
const pickedFull = computed(() => (data.value.full || []).find((f) => f.ts === pickTs.value));
const ready = computed(() => (src.value === 'server' ? !!pickedFull.value : !!uploaded.value));
const hasUploads = computed(() => (src.value === 'server' ? !!pickedFull.value?.uploads : !!uploaded.value?.uploads));
// แสดงผลกู้คืนครั้งล่าสุดเฉพาะภายใน 1 วัน
const recentRestore = computed(() => rs.value.last?.finished_at && Date.now() - new Date(rs.value.last.finished_at).getTime() < 86400_000);

async function load() {
  try {
    data.value = await api('/api/admin/backups');
    rs.value = data.value.restore || {};
  } catch (e) {
    // ระหว่างกู้คืน ฐานข้อมูลอาจใช้งานไม่ได้ชั่วครู่
    if (!rs.value.pending) error.value = e.message;
  }
}

async function guard(fn) {
  busy.value = true;
  error.value = '';
  msg.value = '';
  try { await fn(); } catch (e) { error.value = e.message; } finally { busy.value = false; }
}

async function runNow() {
  const password = await askPassword('ยืนยันการสำรองข้อมูล');
  if (!password) return;
  await guard(async () => {
    await api('/api/admin/backups/run', { method: 'POST', body: { password } });
    msg.value = 'ส่งคำสั่งสำรองแล้ว ไฟล์จะขึ้นในรายการภายในประมาณ 1 นาที';
    await load();
  });
}

async function download(name, format) {
  const filename = format === 'sql' ? name.replace(/\.gz$/, '') : name;
  const password = await askPassword('ยืนยันการดาวน์โหลดไฟล์สำรอง', { detail: filename });
  if (!password) return;
  await guard(() => postDownload('/api/admin/backups/download', { name, password, format }, filename));
}

async function downloadFull(f) {
  const password = await askPassword('ดาวน์โหลดไฟล์กู้คืนทั้งระบบ', { detail: `${tsText(f.ts)} · ${size(f.bytes)}\nมีข้อมูลส่วนบุคคลทั้งหมด เก็บในที่ปลอดภัย` });
  if (!password) return;
  await guard(async () => {
    await postDownload('/api/admin/backups/full', { ts: f.ts, password }, `lineup-full-${f.ts}.tar`);
    msg.value = `ดาวน์โหลด lineup-full-${f.ts}.tar แล้ว — เก็บไว้นอกเซิร์ฟเวอร์`;
  });
}

async function upload(e) {
  const f = e.target.files?.[0];
  e.target.value = '';
  if (!f) return;
  uploaded.value = null;
  uploadName.value = f.name;
  progress.value = 0;
  await guard(async () => {
    try {
      uploaded.value = await uploadFile('/api/admin/restore/upload', f, (p) => { progress.value = p; });
    } finally { progress.value = null; }
  });
}

async function restore() {
  const what = src.value === 'server' ? tsText(pickTs.value) : uploadName.value;
  const password = await askPassword('ยืนยันการกู้คืนระบบ', {
    detail: `กู้คืนจาก: ${what}\nข้อมูลปัจจุบันทั้งหมดจะถูกแทนที่ (ระบบสำรองไว้ก่อนอัตโนมัติ)\nผู้ใช้ทุกคนอาจต้องเข้าสู่ระบบใหม่`, danger: true,
  });
  if (!password) return;
  await guard(async () => {
    const body = { password, confirm: confirmText.value, includeUploads: includeUploads.value, source: src.value };
    if (src.value === 'server') body.ts = pickTs.value; else body.id = uploaded.value.id;
    await api('/api/admin/restore', { method: 'POST', body });
    confirmText.value = '';
    rs.value = { ...rs.value, pending: true };
    msg.value = 'ส่งคำสั่งกู้คืนแล้ว — หน้านี้จะแสดงผลเมื่อเสร็จ';
  });
}

async function relogin() {
  await logout().catch(() => {});
  router.replace('/login');
}

const xFrom = ref('');
const xTo = ref('');
async function exportXlsx() {
  const password = await askPassword('ยืนยันการส่งออกข้อมูล', { detail: `${thaiRange(xFrom.value, xTo.value)} · มีข้อมูลส่วนบุคคล` });
  if (!password) return;
  await guard(async () => {
    await postDownload('/api/admin/export.xlsx', { password, from: xFrom.value, to: xTo.value }, `ข้อมูลเข้าแถว_${xFrom.value}_${xTo.value}.xlsx`);
    msg.value = 'ส่งออก Excel แล้ว';
  });
}

onMounted(async () => {
  load();
  timer = setInterval(() => load(), 5000);
  try { xTo.value = await serverToday(); xFrom.value = addDays(xTo.value, -30); } catch { /* ignore */ }
});
onUnmounted(() => clearInterval(timer));
</script>

<style scoped>
.h { display: flex; align-items: center; gap: 10px; font-size: 1.1rem; margin: 0 0 6px; }
.h .n { width: 28px; height: 28px; border-radius: 50%; background: var(--fill); color: #fff; display: inline-flex; align-items: center; justify-content: center; font-size: .9rem; flex: none; }
.h .n.bad { background: var(--bad); }
.bk { flex-wrap: wrap; }
.dl { display: flex; gap: 6px; align-items: flex-start; flex-wrap: wrap; justify-content: flex-end; }
.more { position: relative; }
.more summary { list-style: none; }
.more summary::-webkit-details-marker { display: none; }
.more .pop { position: absolute; right: 0; top: 40px; z-index: 3; display: grid; gap: 6px; padding: 8px; background: var(--card); border: 1px solid var(--line); border-radius: 12px; box-shadow: var(--shadow); white-space: nowrap; }
.danger-zone { border-color: var(--bad); }
.dangerfill { background: var(--bad); border-color: var(--bad); color: #fff; }
.drop { position: relative; display: flex; align-items: center; gap: 10px; min-height: 56px; padding: 10px 14px; border: 2px dashed var(--line); border-radius: 14px; cursor: pointer; color: var(--muted); font-weight: 600; }
.drop:hover, .drop:focus-within { border-color: var(--brand-2); color: var(--brand-2); }
.drop.has { border-style: solid; border-color: var(--ok); color: var(--text); }
.drop input { position: absolute; width: 1px; height: 1px; opacity: 0; }
.di { font-size: 1.4rem; }
.bar { position: relative; height: 26px; border-radius: 13px; background: var(--bg); border: 1px solid var(--line); overflow: hidden; }
.bar i { position: absolute; inset: 0 auto 0 0; background: var(--info-bg); transition: width .2s; }
.bar span { position: relative; display: block; text-align: center; font-size: .82rem; line-height: 24px; }
.guide ol { margin: 6px 0 0; padding-left: 20px; line-height: 1.7; }
</style>
