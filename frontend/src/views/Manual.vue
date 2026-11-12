<template>
  <!-- อ่านคู่มือ 1 ฉบับ: ตัวอักษรใหญ่ อ่านง่ายบนมือถือ มีสารบัญกระโดดไปหัวข้อ -->
  <article class="manual">
    <div class="bar">
      <router-link to="/manuals" class="btn sm">‹ คู่มือทั้งหมด</router-link>
      <span class="grow" />
      <a v-if="meta" :href="`/manuals/${meta.pdf}`" class="btn sm" :download="`คู่มือ${meta.title}.pdf`">⬇ PDF</a>
    </div>
    <h1>คู่มือ{{ meta?.title || '' }}</h1>
    <div v-if="error" class="alert bad">{{ error }}</div>

    <details v-if="toc.length" class="toc" open>
      <summary>สารบัญ</summary>
      <ul>
        <li v-for="t in toc" :key="t.id"><a :href="`#${t.id}`" @click.prevent="jump(t.id)">{{ t.text }}</a></li>
      </ul>
    </details>

    <!-- เนื้อหามาจากไฟล์คู่มือของระบบเอง (สร้างจาก docs/*.docx) -->
    <!-- eslint-disable-next-line vue/no-v-html -->
    <div ref="body" class="body" v-html="html" />

    <button v-if="html" type="button" class="btn block totop" @click="jump(null)">↑ กลับขึ้นด้านบน</button>
  </article>
</template>

<script setup>
import { nextTick, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const html = ref('');
const meta = ref(null);
const toc = ref([]);
const error = ref('');
const body = ref(null);

async function load(slug) {
  error.value = '';
  html.value = '';
  toc.value = [];
  try {
    const [idx, page] = await Promise.all([
      fetch('/manuals/index.json', { cache: 'no-cache' }).then((r) => r.json()),
      fetch(`/manuals/${encodeURIComponent(slug)}.html`, { cache: 'no-cache' }).then((r) => {
        if (!r.ok) throw new Error('ไม่พบคู่มือนี้');
        return r.text();
      }),
    ]);
    meta.value = idx.find((m) => m.slug === slug) || null;
    if (!meta.value || /<html/i.test(page)) throw new Error('ไม่พบคู่มือนี้');
    html.value = page;
    document.title = `คู่มือ${meta.value.title} · เช็กชื่อเข้าแถว`;
    await nextTick();
    const hs = [...body.value.querySelectorAll('h2')];
    toc.value = hs.map((el, i) => { el.id = `s${i + 1}`; return { id: el.id, text: el.textContent }; });
  } catch (e) {
    error.value = e.message === 'ไม่พบคู่มือนี้' ? e.message : 'โหลดคู่มือไม่ได้ ตรวจอินเทอร์เน็ตแล้วลองใหม่';
  }
}

function jump(id) {
  if (!id) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

watch(() => route.params.slug, (s) => { if (s) load(String(s)); }, { immediate: true });
</script>

<style scoped>
.manual { max-width: 760px; margin: 0 auto; }
.bar { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
h1 { font-size: 1.35rem; margin: 6px 0 12px; }
.toc { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 10px 14px; margin-bottom: 14px; }
.toc summary { font-weight: 700; cursor: pointer; }
.toc ul { margin: 8px 0 2px; padding-left: 4px; list-style: none; line-height: 1.9; }
.toc a { color: var(--brand-2); text-decoration: none; }
.body { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 14px 16px; font-size: 1.02rem; line-height: 1.75; overflow-wrap: anywhere; }
.body :deep(h2) { font-size: 1.15rem; margin: 22px 0 8px; padding-top: 10px; border-top: 1px solid var(--line); scroll-margin-top: 70px; color: var(--brand); }
.body :deep(h2:first-child) { border-top: 0; margin-top: 0; padding-top: 0; }
.body :deep(h3) { font-size: 1.02rem; margin: 16px 0 6px; }
.body :deep(p) { margin: 6px 0; }
.body :deep(ol), .body :deep(ul) { padding-left: 22px; margin: 6px 0; }
.body :deep(li) { margin: 3px 0; }
.body :deep(strong) { color: var(--text); }
.body :deep(.tw) { overflow-x: auto; margin: 10px 0; -webkit-overflow-scrolling: touch; }
.body :deep(table) { border-collapse: collapse; width: 100%; min-width: 480px; font-size: .92rem; }
.body :deep(th), .body :deep(td) { border: 1px solid var(--line); padding: 6px 8px; vertical-align: top; text-align: left; }
.body :deep(tr:first-child td), .body :deep(th) { background: var(--bg); font-weight: 700; }
.body :deep(a) { color: var(--brand-2); }
.totop { margin-top: 14px; }
@media (max-width: 520px) { .body { padding: 12px; font-size: 1rem; } }
</style>
