<template>
  <!-- ปุ่ม/คำแนะนำติดตั้งแอปบนมือถือ — variant="banner" (หน้าแรก ปิดได้) หรือ "card" (หน้าเพิ่มเติม แสดงเสมอ) -->
  <section v-if="variant === 'card' || showBanner" class="card install" :class="variant" aria-label="ติดตั้งแอป">
    <div class="top">
      <img src="/icon-192.png" alt="" class="ico" width="44" height="44" />
      <div class="grow">
        <b>{{ install.installed ? 'ติดตั้งแอปแล้ว' : 'ติดตั้งแอป “เข้าแถว” บนมือถือ' }}</b>
        <div class="small muted">{{ sub }}</div>
      </div>
      <button v-if="variant === 'banner'" type="button" class="x" aria-label="ปิดแถบติดตั้ง" @click="dismissInstall">✕</button>
    </div>

    <template v-if="!install.installed">
      <button v-if="mode === 'prompt'" type="button" class="btn primary block" @click="go">📲 ติดตั้งแอป</button>

      <ol v-else-if="mode === 'ios'" class="steps">
        <li>แตะปุ่ม <b>แชร์</b> <span class="key" aria-hidden="true">⬆︎</span> ที่แถบล่าง (หรือบนขวาของ iPad) ของ Safari</li>
        <li>เลื่อนลงแล้วแตะ <b>“เพิ่มไปยังหน้าจอโฮม”</b> <span class="key" aria-hidden="true">＋</span></li>
        <li>แตะ <b>“เพิ่ม”</b> — ไอคอน “เข้าแถว” จะอยู่บนหน้าจอโฮม</li>
      </ol>

      <div v-else-if="mode === 'inapp'" class="small">
        <p style="margin:0 0 6px">ตอนนี้เปิดผ่านแอป LINE / Facebook ซึ่งติดตั้งไม่ได้ —
          แตะเมนู <b>⋮</b> หรือ <b>…</b> แล้วเลือก <b>“เปิดในเบราว์เซอร์”</b> ({{ install.isIOS ? 'Safari' : 'Chrome' }}) จากนั้นกลับมาที่หน้านี้</p>
        <button type="button" class="btn sm" @click="copy">{{ copied ? '✓ คัดลอกแล้ว' : '📋 คัดลอกลิงก์' }}</button>
      </div>

      <ol v-else-if="mode === 'menu'" class="steps">
        <li>แตะเมนู <b>⋮</b> มุมขวาบนของ Chrome</li>
        <li>เลือก <b>“ติดตั้งแอป”</b> หรือ <b>“เพิ่มลงในหน้าจอหลัก”</b></li>
      </ol>

      <p v-else class="small muted" style="margin:0">
        Android (Chrome): เมนู ⋮ → “ติดตั้งแอป” · iPhone (Safari): ปุ่มแชร์ → “เพิ่มไปยังหน้าจอโฮม”
        <template v-if="!install.mobile"> · บนคอมพิวเตอร์ใช้ผ่านเบราว์เซอร์ได้ตามปกติ</template></p>

      <button v-if="variant === 'banner'" type="button" class="btn sm later" @click="dismissInstall">ไว้ทีหลัง</button>
    </template>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue';
import { install, installMode, showBanner, promptInstall, dismissInstall } from '../install';

defineProps({ variant: { type: String, default: 'banner' } });

const mode = installMode;
const copied = ref(false);
const sub = computed(() => {
  if (install.justInstalled) return 'เปิดจากไอคอน “เข้าแถว” บนหน้าจอหลักได้เลย';
  if (install.installed) return 'กำลังใช้งานแบบแอป เปิดได้จากไอคอนบนหน้าจอหลัก';
  return 'เปิดเร็วจากหน้าจอหลัก เต็มจอเหมือนแอป และอัปเดตเองอัตโนมัติ';
});

async function go() {
  await promptInstall();
}

async function copy() {
  try { await navigator.clipboard.writeText(location.origin); copied.value = true; } catch { copied.value = false; }
}
</script>

<style scoped>
.install { display: grid; gap: 10px; }
.install.banner { border: 1px solid var(--brand-2); background: linear-gradient(0deg, var(--card), var(--info-bg)); }
.top { display: flex; align-items: center; gap: 12px; }
.ico { border-radius: 12px; flex: none; box-shadow: var(--shadow); }
.x { flex: none; width: 36px; height: 36px; border-radius: 50%; border: 0; background: transparent; color: var(--muted); font-size: 1rem; cursor: pointer; }
.x:hover { background: var(--bg); }
.steps { margin: 0; padding-left: 22px; line-height: 1.7; font-size: .92rem; }
.key { display: inline-flex; align-items: center; justify-content: center; min-width: 22px; height: 22px; border: 1px solid var(--line); border-radius: 6px; background: var(--card); font-size: .8rem; }
.later { justify-self: end; }
</style>
