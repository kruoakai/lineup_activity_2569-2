<template>
  <div class="modal-back scan-back" @click.self="close">
    <div class="scan" role="dialog" aria-modal="true" aria-labelledby="scan-title">
      <div class="scan-head">
        <h2 id="scan-title">สแกน QR Code จุดเข้าแถว</h2>
        <button type="button" class="x" aria-label="ปิด" @click="close">✕</button>
      </div>
      <div class="view">
        <video ref="video" playsinline muted />
        <div class="frame" aria-hidden="true"><i /><i /><i /><i /><span class="laser" /></div>
        <p v-if="!ready && !error" class="wait">กำลังเปิดกล้อง…</p>
      </div>
      <p v-if="error" class="alert bad small" style="margin:12px 0 0">{{ error }}</p>
      <p v-else class="small muted center" style="margin:12px 0 0">หันกล้องไปที่ QR บนจอที่จุดเข้าแถว ระบบจะอ่านให้อัตโนมัติ</p>
    </div>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from 'vue';
import jsQR from 'jsqr';

const emit = defineEmits(['close', 'token']);
const video = ref(null);
const ready = ref(false);
const error = ref('');
let stream = null;
let raf = 0;
let detector = null;
let busy = false;
const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });

/** ดึง token จากข้อความใน QR: https://host/q/<token> หรือ ?qr=<token> */
function tokenFrom(text) {
  try {
    const u = new URL(text, location.origin);
    const m = u.pathname.match(/\/q\/([^/?#]+)/);
    if (m) return decodeURIComponent(m[1]);
    return u.searchParams.get('qr');
  } catch {
    return null;
  }
}

async function readFrame() {
  const v = video.value;
  if (!v || v.readyState < 2) return null;
  if (detector) {
    const codes = await detector.detect(v);
    return codes[0]?.rawValue || null;
  }
  const w = v.videoWidth;
  const h = v.videoHeight;
  const scale = Math.min(1, 640 / Math.max(w, h));
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })?.data || null;
}

async function loop() {
  if (!stream) return;
  if (!busy) {
    busy = true;
    try {
      const text = await readFrame();
      if (text) {
        const t = tokenFrom(text);
        if (t) {
          if (navigator.vibrate) navigator.vibrate(60);
          stop();
          emit('token', t);
          return;
        }
        error.value = 'QR นี้ไม่ใช่ QR จุดเข้าแถวของระบบ';
      }
    } catch { /* อ่านเฟรมถัดไป */ }
    busy = false;
  }
  raf = requestAnimationFrame(loop);
}

function stop() {
  cancelAnimationFrame(raf);
  if (stream) stream.getTracks().forEach((t) => t.stop());
  stream = null;
}

function close() {
  stop();
  emit('close');
}

onMounted(async () => {
  if (!navigator.mediaDevices?.getUserMedia) {
    error.value = 'เบราว์เซอร์นี้เปิดกล้องไม่ได้ — ใช้แอปกล้องของมือถือสแกน QR แทน';
    return;
  }
  try {
    if ('BarcodeDetector' in window) {
      const formats = await window.BarcodeDetector.getSupportedFormats();
      if (formats.includes('qr_code')) detector = new window.BarcodeDetector({ formats: ['qr_code'] });
    }
  } catch { detector = null; }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    video.value.srcObject = stream;
    await video.value.play();
    ready.value = true;
    loop();
  } catch (e) {
    error.value = e?.name === 'NotAllowedError'
      ? 'ไม่ได้รับอนุญาตให้ใช้กล้อง — อนุญาตกล้องในการตั้งค่าเบราว์เซอร์ หรือใช้แอปกล้องของมือถือสแกนแทน'
      : 'เปิดกล้องไม่ได้ — ใช้แอปกล้องของมือถือสแกน QR แทน';
  }
});
onUnmounted(stop);
</script>

<style scoped>
.scan-back { align-items: center; }
.scan { background: var(--card); width: 100%; max-width: 420px; border-radius: 20px; padding: 16px; margin: 0 12px; }
.scan-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 12px; }
.scan-head h2 { margin: 0; font-size: 1.1rem; }
.x { width: 40px; height: 40px; border-radius: 50%; border: 0; background: var(--bg); color: var(--text); font-size: 1.1rem; cursor: pointer; }
.view { position: relative; aspect-ratio: 1; border-radius: 16px; overflow: hidden; background: #0b1622; }
.view video { width: 100%; height: 100%; object-fit: cover; display: block; }
.wait { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: #cfe0f5; margin: 0; }
.frame { position: absolute; inset: 14%; pointer-events: none; }
.frame i { position: absolute; width: 34px; height: 34px; border: 4px solid #fff; border-radius: 6px; }
.frame i:nth-child(1) { top: 0; left: 0; border-right: 0; border-bottom: 0; }
.frame i:nth-child(2) { top: 0; right: 0; border-left: 0; border-bottom: 0; }
.frame i:nth-child(3) { bottom: 0; left: 0; border-right: 0; border-top: 0; }
.frame i:nth-child(4) { bottom: 0; right: 0; border-left: 0; border-top: 0; }
.laser { position: absolute; left: 6%; right: 6%; height: 2px; background: #4ade80; box-shadow: 0 0 10px #4ade80; animation: sweep 2s ease-in-out infinite alternate; }
@keyframes sweep { from { top: 6%; } to { top: 94%; } }
@media (prefers-reduced-motion: reduce) { .laser { animation: none; top: 50%; } }
</style>
