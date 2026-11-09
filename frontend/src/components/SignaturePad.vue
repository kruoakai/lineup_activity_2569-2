<template>
  <div class="sigpad">
    <canvas ref="canvas" @pointerdown="down" @pointermove="move" @pointerup="up" @pointerleave="up" @pointercancel="up" />
    <div class="row">
      <span class="small muted grow">เซ็นด้วยนิ้วหรือเมาส์ในกรอบ</span>
      <button type="button" class="btn sm" @click="clear">ล้าง</button>
      <label class="btn sm">อัปโหลดรูปลายเซ็น<input type="file" accept="image/*" hidden @change="upload" /></label>
    </div>
    <p v-if="note" class="small" :class="noteBad ? 'bad' : 'muted'" style="margin:4px 0 0">{{ note }}</p>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';

const emit = defineEmits(['change']);
const canvas = ref(null);
const note = ref('');
const noteBad = ref(false);
const MAX_CHARS = 480_000; // เซิร์ฟเวอร์รับ PNG ไม่เกิน 400 KB (base64 ~ 533,000 ตัวอักษร)
let ctx;
let drawing = false;
let dirty = false;
let last = null;

function setup() {
  const c = canvas.value;
  const ratio = window.devicePixelRatio || 1;
  const w = c.clientWidth;
  const h = c.clientHeight;
  c.width = w * ratio;
  c.height = h * ratio;
  ctx = c.getContext('2d');
  ctx.scale(ratio, ratio);
  ctx.lineWidth = 2.6;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#0b2a6f';
}

function pos(e) {
  const r = canvas.value.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}
function down(e) { drawing = true; last = pos(e); canvas.value.setPointerCapture(e.pointerId); }
function move(e) {
  if (!drawing) return;
  const p = pos(e);
  ctx.beginPath();
  ctx.moveTo(last.x, last.y);
  ctx.lineTo(p.x, p.y);
  ctx.stroke();
  last = p;
  dirty = true;
}
function up() { if (drawing) { drawing = false; emitValue(); } }
function clear() {
  ctx.clearRect(0, 0, canvas.value.width, canvas.value.height);
  dirty = false;
  emit('change', null);
}

// ส่งออกเป็น PNG ที่ตัดขอบว่างออก
function emitValue() {
  if (!dirty) return emit('change', null);
  const c = canvas.value;
  const data = ctx.getImageData(0, 0, c.width, c.height).data;
  let minX = c.width; let minY = c.height; let maxX = 0; let maxY = 0;
  for (let y = 0; y < c.height; y += 2) {
    for (let x = 0; x < c.width; x += 2) {
      if (data[(y * c.width + x) * 4 + 3] > 0) {
        if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y;
      }
    }
  }
  const pad = 8;
  const w = Math.max(1, maxX - minX + pad * 2);
  const h = Math.max(1, maxY - minY + pad * 2);
  // ขนาดพอดีช่องลงนาม (กว้าง ≤ 600, สูง ≤ 200) และไม่เกินขนาดที่เซิร์ฟเวอร์รับ
  let scale = Math.min(1, 600 / w, 200 / h);
  let url = '';
  for (let i = 0; i < 6; i += 1) {
    const out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(w * scale));
    out.height = Math.max(1, Math.round(h * scale));
    out.getContext('2d').drawImage(c, minX - pad, minY - pad, w, h, 0, 0, out.width, out.height);
    url = out.toDataURL('image/png');
    if (url.length <= MAX_CHARS) break;
    scale *= 0.7;
  }
  emit('change', url);
}

// ทำพื้นหลังกระดาษให้โปร่งใส เหลือเฉพาะหมึก (ภาพถ่าย/สแกนลายเซ็นบนกระดาษ) แล้วตัดขอบว่าง
function inkOnly(img) {
  const s = Math.min(1, 1200 / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * s));
  const h = Math.max(1, Math.round(img.height * s));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0, w, h);
  const im = x.getImageData(0, 0, w, h);
  const d = im.data;
  // ภาพที่โปร่งใสอยู่แล้ว (PNG ลายเซ็น) ใช้ตามเดิม
  let clear = 0;
  for (let i = 3; i < d.length; i += 16) if (d[i] < 250) clear += 1;
  if (clear > d.length / 16 * 0.05) return c;
  // ระดับความสว่างของพื้นกระดาษ = ค่าสว่างที่ percentile 70
  const hist = new Array(256).fill(0);
  for (let i = 0; i < d.length; i += 4) hist[(d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000 | 0] += 1;
  let acc = 0; let bg = 255;
  for (let v = 0; v < 256; v += 1) { acc += hist[v]; if (acc >= (d.length / 4) * 0.7) { bg = v; break; } }
  const hi = bg - 25; // สว่างกว่านี้ = พื้นหลัง
  const lo = Math.max(0, bg - 110); // มืดกว่านี้ = หมึกเต็ม
  for (let i = 0; i < d.length; i += 4) {
    const l = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
    const a = l >= hi ? 0 : l <= lo ? 255 : Math.round(((hi - l) / (hi - lo)) * 255);
    d[i + 3] = a;
  }
  x.putImageData(im, 0, 0);
  return c;
}

function upload(ev) {
  const input = ev.target;
  const f = input.files?.[0];
  input.value = ''; // เลือกไฟล์เดิมซ้ำได้
  if (!f) return;
  note.value = '';
  noteBad.value = false;
  if (f.size > 15_000_000) { note.value = 'ไฟล์ใหญ่เกิน 15 MB — ถ่ายใหม่หรือย่อรูปก่อน'; noteBad.value = true; return; }
  const img = new Image();
  img.onload = () => {
    URL.revokeObjectURL(img.src);
    const src = inkOnly(img);
    const c = canvas.value;
    clear();
    const w = c.clientWidth; const h = c.clientHeight;
    const s = Math.min((w - 16) / src.width, (h - 16) / src.height);
    ctx.drawImage(src, (w - src.width * s) / 2, (h - src.height * s) / 2, src.width * s, src.height * s);
    dirty = true;
    emitValue();
    note.value = 'ปรับพื้นหลังให้โปร่งใสแล้ว — ตรวจลายเซ็นในกรอบก่อนบันทึก';
  };
  img.onerror = () => {
    URL.revokeObjectURL(img.src);
    note.value = 'เปิดไฟล์รูปนี้ไม่ได้ (เช่น HEIC จาก iPhone) — ใช้ไฟล์ JPG หรือ PNG หรือแคปหน้าจอรูปลายเซ็นแล้วอัปโหลดแทน';
    noteBad.value = true;
  };
  img.src = URL.createObjectURL(f);
}

onMounted(setup);
</script>

<style scoped>
.bad { color: var(--bad); }
canvas { width: 100%; height: 160px; background: #fff; border: 1px dashed var(--line); border-radius: 10px; touch-action: none; display: block; margin-bottom: 6px; }
</style>
