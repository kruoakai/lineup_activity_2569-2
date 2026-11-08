<template>
  <div class="sigpad">
    <canvas ref="canvas" @pointerdown="down" @pointermove="move" @pointerup="up" @pointerleave="up" @pointercancel="up" />
    <div class="row">
      <span class="small muted grow">เซ็นด้วยนิ้วหรือเมาส์ในกรอบ</span>
      <button type="button" class="btn sm" @click="clear">ล้าง</button>
      <label class="btn sm">อัปโหลดรูปลายเซ็น<input type="file" accept="image/png,image/jpeg" hidden @change="upload" /></label>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';

const emit = defineEmits(['change']);
const canvas = ref(null);
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
  const out = document.createElement('canvas');
  const scale = Math.min(1, 600 / w);
  out.width = Math.round(w * scale);
  out.height = Math.round(h * scale);
  out.getContext('2d').drawImage(c, minX - pad, minY - pad, w, h, 0, 0, out.width, out.height);
  emit('change', out.toDataURL('image/png'));
}

function upload(ev) {
  const f = ev.target.files?.[0];
  if (!f) return;
  const img = new Image();
  img.onload = () => {
    const c = canvas.value;
    clear();
    const w = c.clientWidth; const h = c.clientHeight;
    const s = Math.min(w / img.width, h / img.height);
    ctx.drawImage(img, (w - img.width * s) / 2, (h - img.height * s) / 2, img.width * s, img.height * s);
    dirty = true;
    emitValue();
    URL.revokeObjectURL(img.src);
  };
  img.src = URL.createObjectURL(f);
}

onMounted(setup);
</script>

<style scoped>
canvas { width: 100%; height: 160px; background: #fff; border: 1px dashed var(--line); border-radius: 10px; touch-action: none; display: block; margin-bottom: 6px; }
</style>
