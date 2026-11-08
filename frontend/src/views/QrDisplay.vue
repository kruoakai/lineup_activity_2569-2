<template>
  <div class="qr-screen">
    <router-link to="/more" class="back">‹ กลับ</router-link>
    <h1>สแกนเพื่อเช็กชื่อเข้าแถว</h1>
    <p class="sub">ใช้กล้องมือถือสแกน QR นี้ · QR เปลี่ยนทุก {{ interval }} วินาที</p>
    <div class="qr-box" :class="{ off: phase !== 'open' }">
      <canvas ref="canvas" />
      <div v-if="phase !== 'open'" class="overlay">{{ phase === 'before' ? 'ยังไม่เปิดเช็กชื่อ' : phase === 'closed' ? 'ปิดการเช็กชื่อแล้ว' : 'วันนี้ไม่มีการเข้าแถว' }}</div>
    </div>
    <div class="bar"><div :style="{ width: `${progress}%` }" /></div>
    <div class="time">{{ clockText || serverTime }}</div>
    <p v-if="error" class="err">{{ error }}</p>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from 'vue';
import QRCode from 'qrcode';
import { api } from '../api';

const canvas = ref(null);
const phase = ref('open');
const interval = ref(30);
const serverTime = ref('');
const clockText = ref('');
let serverBase = null;
let serverAt = 0;
const progress = ref(100);
const error = ref('');
let next = 0;
let expiresAt = 0;
let timer;
let wakeLock;

async function refreshQr() {
  try {
    const r = await api('/api/attendance/qr/current');
    phase.value = r.phase;
    interval.value = r.intervalS;
    serverTime.value = r.serverTime;
    serverBase = r.serverTime;
    serverAt = Date.now();
    error.value = '';
    const url = `${location.origin}/q/${r.token}`;
    const size = Math.min(window.innerWidth - 48, window.innerHeight - 260, 560);
    await QRCode.toCanvas(canvas.value, url, { width: Math.max(size, 220), margin: 1, errorCorrectionLevel: 'M' });
    expiresAt = Date.now() + r.expiresInMs;
    next = expiresAt + 300;
  } catch (e) {
    error.value = e.message;
    next = Date.now() + 5000;
  }
}

onMounted(async () => {
  await refreshQr();
  timer = setInterval(() => {
    if (serverTime.value && serverBase === null) { serverBase = serverTime.value; serverAt = Date.now(); }
    if (serverBase) {
      const [h, m, s] = serverBase.split(':').map(Number);
      const t = (h * 3600 + m * 60 + s + Math.floor((Date.now() - serverAt) / 1000)) % 86400;
      clockText.value = [Math.floor(t / 3600), Math.floor(t / 60) % 60, t % 60].map((n) => String(n).padStart(2, '0')).join(':');
    }
    const left = Math.max(0, expiresAt - Date.now());
    progress.value = (left / (interval.value * 1000)) * 100;
    if (Date.now() >= next) refreshQr();
  }, 250);
  // ให้หน้าจอไม่ดับระหว่างแสดง QR
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* ไม่รองรับ */ }
});
onUnmounted(() => {
  clearInterval(timer);
  wakeLock?.release?.();
});
</script>

<style scoped>
.qr-screen { min-height: 100vh; background: #0f2a4a; color: #fff; display: flex; flex-direction: column; align-items: center; padding: 20px 16px; text-align: center; }
.back { align-self: flex-start; color: #cfe0f5; text-decoration: none; }
h1 { font-size: 1.6rem; margin: 6px 0 2px; }
.sub { opacity: .8; margin: 0 0 16px; }
.qr-box { position: relative; background: #fff; padding: 14px; border-radius: 18px; }
.qr-box canvas { display: block; }
.qr-box.off canvas { filter: blur(8px); opacity: .3; }
.overlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: #0f2a4a; font-size: 1.4rem; font-weight: 700; }
.bar { width: min(560px, 90vw); height: 6px; background: rgba(255,255,255,.2); border-radius: 3px; margin-top: 14px; overflow: hidden; }
.bar div { height: 100%; background: #5fd38d; transition: width .25s linear; }
.time { font-size: 2.4rem; font-weight: 700; font-variant-numeric: tabular-nums; margin-top: 10px; }
.err { color: #ffb4b4; }
</style>
