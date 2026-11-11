<template>
  <!-- น้องแถวดี: ตัวละครผู้ช่วยงานบุคลากร (วาดเอง SVG) · state: idle | listening | thinking | talking -->
  <svg class="ntd" :class="state" :width="size" :height="size" viewBox="0 0 120 120" role="img" :aria-label="`น้องแถวดี ${STATE_TH[state]}`">
    <defs>
      <radialGradient id="ntd-face" cx="50%" cy="45%" r="60%">
        <stop offset="0" stop-color="#ffe3cf" /><stop offset="1" stop-color="#f6c7a6" />
      </radialGradient>
      <linearGradient id="ntd-hair" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#3b2a2a" /><stop offset="1" stop-color="#22161a" />
      </linearGradient>
    </defs>

    <!-- วงแสงตอนฟัง -->
    <circle class="ring" cx="60" cy="62" r="54" />

    <g class="body">
      <!-- ตัว: เสื้อเชิ้ตขาว ปกกรมท่า -->
      <path d="M26 118 C28 94 42 86 60 86 C78 86 92 94 94 118 Z" fill="#ffffff" stroke="#d8dde6" />
      <path d="M48 87 L60 100 L72 87 L67 85 L60 93 L53 85 Z" fill="#1d4e89" />
      <!-- สายคล้องบัตร + บัตรเจ้าหน้าที่ -->
      <path d="M50 88 L57 106 M70 88 L63 106" stroke="#2f6fb8" stroke-width="2" fill="none" />
      <rect x="52" y="104" width="16" height="12" rx="2" fill="#fff" stroke="#2f6fb8" stroke-width="1.5" />
      <rect x="54" y="106" width="5" height="5" rx="1" fill="#9cc3ef" />
      <path d="M60.5 107.5 h5 M60.5 110 h4" stroke="#1d4e89" stroke-width="1.2" />

      <!-- มือโบก -->
      <g class="hand">
        <path d="M92 104 C98 96 100 88 98 80" stroke="#ffffff" stroke-width="9" stroke-linecap="round" fill="none" />
        <circle cx="98" cy="76" r="6" fill="#f6c7a6" />
      </g>

      <g class="head">
        <!-- ผมด้านหลัง + มวยผม + โบว์ -->
        <circle cx="60" cy="19" r="11" fill="url(#ntd-hair)" />
        <path d="M51 13 l-8 -5 l1 10 z M69 13 l8 -5 l-1 10 z" fill="#e85d8a" />
        <circle cx="60" cy="13" r="3" fill="#ff86ac" />
        <path d="M26 56 C24 30 40 22 60 22 C80 22 96 30 94 56 L94 74 C90 66 30 66 26 74 Z" fill="url(#ntd-hair)" />
        <!-- หน้า -->
        <ellipse cx="60" cy="56" rx="29" ry="28" fill="url(#ntd-face)" />
        <!-- หูซ้ายขวา -->
        <ellipse cx="31" cy="58" rx="4" ry="6" fill="#f6c7a6" />
        <ellipse cx="89" cy="58" rx="4" ry="6" fill="#f6c7a6" />
        <!-- หน้าม้า -->
        <path d="M31 50 C34 30 50 27 60 29 C70 27 86 30 89 50 C82 40 76 37 70 38 C66 44 58 45 52 40 C44 40 37 44 31 50 Z" fill="url(#ntd-hair)" />
        <!-- ตา -->
        <g class="eyes">
          <ellipse class="eye" cx="48" cy="57" rx="4.2" ry="5.4" fill="#2a1d24" />
          <ellipse class="eye" cx="72" cy="57" rx="4.2" ry="5.4" fill="#2a1d24" />
          <circle cx="49.5" cy="55" r="1.5" fill="#fff" />
          <circle cx="73.5" cy="55" r="1.5" fill="#fff" />
        </g>
        <!-- คิ้ว -->
        <path class="brow" d="M42 47 q6 -3 11 0 M67 47 q6 -3 11 0" stroke="#3b2a2a" stroke-width="1.6" fill="none" stroke-linecap="round" />
        <!-- แก้มแดง -->
        <ellipse cx="41" cy="66" rx="5" ry="3" fill="#ff9fb4" opacity=".6" />
        <ellipse cx="79" cy="66" rx="5" ry="3" fill="#ff9fb4" opacity=".6" />
        <!-- ปาก -->
        <path class="smile" d="M53 68 q7 6 14 0" stroke="#b5475f" stroke-width="2" fill="none" stroke-linecap="round" />
        <ellipse class="mouth" cx="60" cy="69.5" rx="4.5" ry="3.2" fill="#b5475f" />
      </g>
    </g>

    <!-- ความคิด -->
    <g class="dots">
      <circle cx="94" cy="20" r="3" /><circle cx="103" cy="14" r="3" /><circle cx="112" cy="8" r="3" />
    </g>
  </svg>
</template>

<script setup>
defineProps({
  state: { type: String, default: 'idle' },
  size: { type: [Number, String], default: 64 },
});
const STATE_TH = { idle: 'พร้อมช่วยค่ะ', listening: 'กำลังฟัง', thinking: 'กำลังคิด', talking: 'กำลังตอบ' };
</script>

<style scoped>
.ntd { display: block; overflow: visible; }
.ring { fill: none; stroke: #ff86ac; stroke-width: 3; opacity: 0; }
.body { transform-origin: 60px 118px; animation: bob 2.6s ease-in-out infinite; }
.head { transform-origin: 60px 80px; animation: sway 3.8s ease-in-out infinite; }
.eyes { transform-origin: 60px 57px; animation: blink 4.5s infinite; }
.hand { transform-origin: 92px 104px; animation: wave 6s ease-in-out infinite; }
.mouth { opacity: 0; transform-origin: 60px 69px; }
.dots { fill: #9aa5b4; opacity: 0; }

/* ดุ๊กดิ๊ก */
@keyframes bob { 0%, 100% { transform: translateY(0) } 50% { transform: translateY(-3px) } }
@keyframes sway { 0%, 100% { transform: rotate(-3deg) } 50% { transform: rotate(3deg) } }
@keyframes blink { 0%, 92%, 100% { transform: scaleY(1) } 95% { transform: scaleY(.1) } }
@keyframes wave { 0%, 70%, 100% { transform: rotate(0) } 76% { transform: rotate(-18deg) } 82% { transform: rotate(10deg) } 88% { transform: rotate(-14deg) } 94% { transform: rotate(6deg) } }
@keyframes talk { 0%, 100% { transform: scaleY(.35) } 50% { transform: scaleY(1) } }
@keyframes pulse { 0% { opacity: .9; transform: scale(.92) } 100% { opacity: 0; transform: scale(1.08) } }
@keyframes think { 0%, 100% { opacity: .25 } 50% { opacity: 1 } }

.listening .ring { animation: pulse 1.2s ease-out infinite; transform-origin: 60px 62px; }
.listening .head { animation: tilt 1.4s ease-in-out infinite; }
@keyframes tilt { 0%, 100% { transform: rotate(6deg) } 50% { transform: rotate(9deg) } }
.thinking .dots { opacity: 1; }
.thinking .dots circle { animation: think 1.2s infinite; }
.thinking .dots circle:nth-child(2) { animation-delay: .2s; }
.thinking .dots circle:nth-child(3) { animation-delay: .4s; }
.thinking .brow { transform: translateY(-1.5px); }
.talking .smile { opacity: 0; }
.talking .mouth { opacity: 1; animation: talk .32s ease-in-out infinite; }
.talking .body { animation-duration: 1.4s; }

@media (prefers-reduced-motion: reduce) {
  .body, .head, .eyes, .hand, .ring, .dots circle, .mouth { animation: none !important; }
}
</style>
