<template>
  <!-- คู่มือการใช้งาน: เปิดได้โดยไม่ต้องเข้าสู่ระบบ อ่านง่ายบนมือถือ -->
  <div class="manuals">
    <div class="top">
      <router-link v-if="!auth.user" to="/login" class="btn sm">‹ เข้าสู่ระบบ</router-link>
      <h1>📖 คู่มือการใช้งาน</h1>
      <p class="small muted">ระบบเช็กชื่อเข้าแถว วิทยาลัยเทคนิคชัยภูมิ · แตะเพื่ออ่าน หรือดาวน์โหลด PDF ไว้พิมพ์</p>
    </div>
    <div v-if="error" class="alert bad">{{ error }}</div>

    <template v-if="mine.length">
      <h2 class="sec">สำหรับท่าน</h2>
      <ManualCard v-for="m in mine" :key="m.slug" :m="m" highlight />
    </template>
    <h2 class="sec">{{ mine.length ? 'คู่มืออื่น ๆ' : 'เลือกคู่มือตามหน้าที่' }}</h2>
    <ManualCard v-for="m in others" :key="m.slug" :m="m" />
    <Credits />
  </div>
</template>

<script setup>
import { computed, defineComponent, h, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { auth } from '../api';
import Credits from '../components/Credits.vue';

const list = ref([]);
const error = ref('');
const ICON = { teacher: '🧑‍🏫', 'dept-head': '👥', hr: '🗂', activity: '📣', executive: '✍️', admin: '⚙️', uat: '🧪' };

// ครูและบุคลากรทุกคนควรอ่านคู่มือครู + คู่มือตามบทบาท
const mine = computed(() => {
  if (!auth.user) return [];
  const role = auth.user.role;
  return list.value.filter((m) => m.slug === 'teacher' || m.roles.includes(role) || (role === 'staff' && auth.user.can_proxy && m.slug === 'dept-head'));
});
const others = computed(() => list.value.filter((m) => !mine.value.includes(m)));

const ManualCard = defineComponent({
  props: { m: { type: Object, required: true }, highlight: Boolean },
  setup(p) {
    return () => h('div', { class: ['mcard', { hl: p.highlight }] }, [
      h(RouterLink, { to: `/manuals/${p.m.slug}`, class: 'open' }, () => [
        h('span', { class: 'ico', 'aria-hidden': 'true' }, ICON[p.m.slug] || '📘'),
        h('span', { class: 'tt' }, [h('b', `คู่มือ${p.m.title}`), h('small', p.m.desc)]),
        h('span', { class: 'go' }, 'อ่าน ›'),
      ]),
      h('a', { href: `/manuals/${p.m.pdf}`, class: 'pdf', download: `คู่มือ${p.m.title}.pdf` }, '⬇ PDF'),
    ]);
  },
});

onMounted(async () => {
  try {
    const r = await fetch('/manuals/index.json', { cache: 'no-cache' });
    list.value = await r.json();
  } catch { error.value = 'โหลดรายการคู่มือไม่ได้ ตรวจอินเทอร์เน็ตแล้วลองใหม่'; }
});
</script>

<style scoped>
.manuals { max-width: 720px; margin: 0 auto; }
.top h1 { margin: 8px 0 2px; }
.sec { font-size: 1rem; margin: 18px 2px 8px; color: var(--muted); }
.manuals :deep(.mcard) { display: flex; align-items: stretch; gap: 0; background: var(--card); border: 1px solid var(--line); border-radius: 14px; margin-bottom: 10px; box-shadow: var(--shadow); overflow: hidden; }
.manuals :deep(.mcard.hl) { border-color: var(--brand-2); border-left: 5px solid var(--brand-2); }
.manuals :deep(.open) { flex: 1; display: flex; align-items: center; gap: 12px; padding: 12px 14px; color: inherit; text-decoration: none; min-width: 0; }
.manuals :deep(.ico) { flex: none; width: 44px; height: 44px; border-radius: 12px; background: var(--info-bg); display: flex; align-items: center; justify-content: center; font-size: 1.4rem; }
.manuals :deep(.tt) { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.manuals :deep(.tt small) { color: var(--muted); font-size: .82rem; line-height: 1.4; }
.manuals :deep(.go) { flex: none; font-weight: 700; color: var(--brand-2); }
.manuals :deep(.pdf) { flex: none; display: flex; align-items: center; padding: 0 14px; border-left: 1px solid var(--line); color: var(--muted); font-size: .85rem; text-decoration: none; }
.manuals :deep(.pdf:hover) { color: var(--brand-2); background: var(--bg); }
</style>
