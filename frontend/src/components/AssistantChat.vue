<template>
  <!-- น้องแถวดี: ปุ่มลอย + หน้าต่างแชต · พิมพ์หรือพูดถาม · อ่านคำตอบออกเสียง -->
  <div v-if="available" class="ast">
    <button v-show="!open" type="button" class="fab" aria-label="ถามน้องแถวดี" @click="openChat">
      <NongTaewDee :state="fabState" :size="64" />
      <span v-if="!greeted" class="bubble">ถามน้องได้นะคะ 💬</span>
    </button>

    <section v-if="open" class="panel" role="dialog" aria-label="น้องแถวดี ผู้ช่วยงานบุคลากร">
      <header class="hd">
        <NongTaewDee :state="charState" :size="52" />
        <div class="grow">
          <b>น้องแถวดี</b>
          <small>{{ STATE_TXT[charState] }}</small>
        </div>
        <button type="button" class="ic" :aria-pressed="speakOn" :title="speakOn ? 'ปิดเสียงตอบ' : 'เปิดเสียงตอบ'" @click="toggleSpeak">
          {{ speakOn ? '🔊' : '🔇' }}</button>
        <button type="button" class="ic" title="เริ่มคุยใหม่" aria-label="เริ่มคุยใหม่" @click="reset">↺</button>
        <button type="button" class="ic" aria-label="ปิดหน้าต่างแชต" @click="close">✕</button>
      </header>

      <div ref="scroller" class="msgs" aria-live="polite">
        <div class="m bot"><p>สวัสดีค่ะ {{ hello }} น้องแถวดีจากงานบุคลากรค่ะ ถามวิธีใช้ระบบเช็กชื่อเข้าแถวได้เลย พิมพ์หรือกด 🎤 พูดก็ได้นะคะ</p></div>
        <div v-for="(m, i) in messages" :key="i" class="m" :class="m.role === 'user' ? 'me' : 'bot'">
          <p v-if="m.role === 'user'">{{ m.content }}</p>
          <!-- eslint-disable-next-line vue/no-v-html -- ผ่าน escape แล้วใน fmt() -->
          <div v-else class="rich" v-html="fmt(m.content)" />
          <button v-if="m.role === 'assistant' && ttsOk" type="button" class="replay" aria-label="ฟังคำตอบนี้อีกครั้ง" @click="speak(m.content)">🔊</button>
        </div>
        <div v-if="busy" class="m bot"><p class="typing"><i /><i /><i /></p></div>
        <div v-if="error" class="err small">{{ error }}</div>
      </div>

      <div v-if="!messages.length" class="chips">
        <button v-for="q in suggestions" :key="q" type="button" @click="ask(q)">{{ q }}</button>
      </div>

      <form class="in" @submit.prevent="ask(text)">
        <button v-if="sttOk" type="button" class="mic" :class="{ on: listening }" :aria-pressed="listening"
          :aria-label="listening ? 'หยุดฟัง' : 'พูดคำถาม'" @click="toggleMic">🎤</button>
        <input ref="inputEl" v-model="text" maxlength="800" :placeholder="listening ? 'กำลังฟัง… พูดได้เลยค่ะ' : 'พิมพ์คำถาม…'" aria-label="คำถาม" />
        <button type="submit" class="send" :disabled="busy || !text.trim()" aria-label="ส่งคำถาม">➤</button>
      </form>
      <p v-if="micNote" class="small muted note">{{ micNote }}</p>
    </section>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { api, auth } from '../api';
import NongTaewDee from './NongTaewDee.vue';

const STATE_TXT = { idle: 'ผู้ช่วยงานบุคลากร · พร้อมช่วยค่ะ', listening: 'กำลังฟังค่ะ…', thinking: 'กำลังคิดคำตอบค่ะ…', talking: 'กำลังตอบค่ะ' };
const STORE = 'ntd-chat';
const SPEAK = 'ntd-speak';
const GREET = 'ntd-greeted';
const ss = { get(k) { try { return sessionStorage.getItem(k); } catch { return null; } }, set(k, v) { try { sessionStorage.setItem(k, v); } catch { /* ไม่มี storage */ } } };
const ls = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { /* ไม่มี storage */ } } };

const available = ref(false);
const open = ref(false);
const messages = ref(JSON.parse(ss.get(STORE) || '[]'));
const text = ref('');
const busy = ref(false);
const error = ref('');
const listening = ref(false);
const talking = ref(false);
const micNote = ref('');
const speakOn = ref(ls.get(SPEAK) !== '0');
const greeted = ref(ls.get(GREET) === '1');
const scroller = ref(null);
const inputEl = ref(null);

const Rec = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
const sttOk = !!Rec;
const ttsOk = typeof window !== 'undefined' && 'speechSynthesis' in window;
let rec = null;

const charState = computed(() => (listening.value ? 'listening' : busy.value ? 'thinking' : talking.value ? 'talking' : 'idle'));
const fabState = computed(() => (talking.value ? 'talking' : 'idle'));
const hello = computed(() => {
  if (auth.user?.honorific) return auth.user.honorific;
  const n = String(auth.user?.full_name || '').replace(/^(นาย|นางสาว|นาง|ว่าที่ร้อยตรี|ดร\.)\s*/, '').split(/\s+/)[0];
  return n ? (n.startsWith('ครู') ? n : `คุณครู${n}`) : '';
});
const SUGGEST = {
  staff: ['เช็กชื่อด้วย GPS ไม่ผ่านทำยังไง', 'มือถือเสีย ใครเช็กชื่อแทนได้', 'ดูสถิติการเข้าแถวของฉันตรงไหน', 'ติดตั้งแอปบนมือถือยังไง'],
  dept_head: ['เช็กแทนคนในแผนกยังไง', 'ดูรายงานแผนกตรงไหน', 'ส่งออก Excel ยังไง', 'ติดตั้งแอปบนมือถือยังไง'],
  activity: ['แสดง QR ที่ลานยังไง', 'อนุมัติคำขอตรวจสอบยังไง', 'ตั้งวันหยุดในปฏิทินยังไง', 'บันทึกไปราชการแทนยังไง'],
  hr: ['สร้างรายงานประจำวันยังไง', 'เอกสารถูกส่งกลับ แก้ยังไง', 'ครูมือถือเสีย เช็กชื่อแทนยังไง', 'ทำไมแก้ไขเอกสารไม่ได้'],
  executive: ['ลงนามเอกสารยังไง', 'ส่งกลับแก้ไขยังไง', 'อัปโหลดลายเซ็นยังไง', 'ดูรายงานผู้บริหารตรงไหน'],
  admin: ['เปิดอีเมลรีเซ็ตรหัสผ่านยังไง', 'นำเข้าผู้ใช้ด้วย Excel ยังไง', 'กู้คืนระบบจากไฟล์สำรองยังไง', 'ตั้งพื้นที่เข้าแถวยังไง'],
};
const suggestions = computed(() => SUGGEST[auth.user?.role] || SUGGEST.staff);

watch(messages, (m) => ss.set(STORE, JSON.stringify(m.slice(-20))), { deep: true });

// ข้อความคำตอบ: escape HTML แล้วแปลง **ตัวหนา** รายการ และขึ้นบรรทัด
function fmt(s) {
  const esc = String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const lines = esc.split(/\n/);
  let html = '';
  let list = null;
  for (const raw of lines) {
    const line = raw.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    const ol = /^\s*\d+[.)]\s+(.*)/.exec(line);
    const ul = /^\s*[-•*]\s+(.*)/.exec(line);
    if (ol || ul) {
      const tag = ol ? 'ol' : 'ul';
      if (list !== tag) { if (list) html += `</${list}>`; html += `<${tag}>`; list = tag; }
      html += `<li>${(ol || ul)[1]}</li>`;
    } else {
      if (list) { html += `</${list}>`; list = null; }
      if (line.trim()) html += `<p>${line}</p>`;
    }
  }
  if (list) html += `</${list}>`;
  return html;
}

function plain(s) {
  return String(s).replace(/\*\*/g, '').replace(/^\s*[-•*]\s+/gm, '').replace(/[`#>|]/g, ' ').replace(/https?:\/\/\S+/g, 'ลิงก์');
}

let thVoice = null;
function pickVoice() {
  if (!ttsOk) return;
  const vs = window.speechSynthesis.getVoices();
  thVoice = vs.find((v) => /th/i.test(v.lang) && /female|หญิง|premwadee|kanya|narisa/i.test(v.name)) || vs.find((v) => /^th/i.test(v.lang)) || null;
}

function speak(s) {
  if (!ttsOk) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(plain(s));
  u.lang = 'th-TH';
  if (thVoice) u.voice = thVoice;
  u.rate = 1.05;
  u.pitch = 1.25; // เสียงสดใส
  u.onstart = () => { talking.value = true; };
  u.onend = () => { talking.value = false; };
  u.onerror = () => { talking.value = false; };
  window.speechSynthesis.speak(u);
}

function stopSpeak() {
  if (ttsOk) window.speechSynthesis.cancel();
  talking.value = false;
}

function toggleSpeak() {
  speakOn.value = !speakOn.value;
  ls.set(SPEAK, speakOn.value ? '1' : '0');
  if (!speakOn.value) stopSpeak();
}

async function scrollDown() {
  await nextTick();
  if (scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight;
}

async function ask(q) {
  const question = String(q || '').trim();
  if (!question || busy.value) return;
  stopSpeak();
  error.value = '';
  text.value = '';
  messages.value.push({ role: 'user', content: question });
  busy.value = true;
  scrollDown();
  try {
    const r = await api('/api/assistant/chat', { method: 'POST', body: { messages: messages.value.slice(-10) } });
    messages.value.push({ role: 'assistant', content: r.reply });
    if (speakOn.value) speak(r.reply);
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
    scrollDown();
  }
}

function toggleMic() {
  if (listening.value) { rec?.stop(); return; }
  stopSpeak();
  micNote.value = '';
  rec = new Rec();
  rec.lang = 'th-TH';
  rec.interimResults = true;
  rec.maxAlternatives = 1;
  let finalText = '';
  rec.onstart = () => { listening.value = true; };
  rec.onresult = (ev) => {
    let interim = '';
    for (let i = ev.resultIndex; i < ev.results.length; i += 1) {
      const t = ev.results[i][0].transcript;
      if (ev.results[i].isFinal) finalText += t; else interim += t;
    }
    text.value = (finalText + interim).trim();
  };
  rec.onerror = (ev) => {
    micNote.value = ev.error === 'not-allowed' || ev.error === 'service-not-allowed'
      ? 'ยังไม่ได้อนุญาตไมโครโฟน — แตะไอคอนแม่กุญแจข้างที่อยู่เว็บ แล้วอนุญาตไมโครโฟนค่ะ'
      : ev.error === 'no-speech' ? 'ไม่ได้ยินเสียงค่ะ ลองกด 🎤 แล้วพูดใหม่อีกครั้ง' : 'ฟังเสียงไม่สำเร็จ ลองพิมพ์คำถามแทนได้ค่ะ';
  };
  rec.onend = () => {
    listening.value = false;
    if (finalText.trim()) ask(finalText);
  };
  try { rec.start(); } catch { listening.value = false; }
}

function openChat() {
  open.value = true;
  greeted.value = true;
  ls.set(GREET, '1');
  scrollDown();
  nextTick(() => inputEl.value?.focus());
}

function close() {
  open.value = false;
  rec?.stop();
  stopSpeak();
}

function reset() {
  stopSpeak();
  messages.value = [];
  error.value = '';
}

function onKey(e) { if (e.key === 'Escape' && open.value) close(); }

onMounted(async () => {
  try { available.value = (await api('/api/assistant')).enabled; } catch { available.value = false; }
  if (ttsOk) { pickVoice(); window.speechSynthesis.onvoiceschanged = pickVoice; }
  window.addEventListener('keydown', onKey);
});
onUnmounted(() => { window.removeEventListener('keydown', onKey); stopSpeak(); rec?.stop(); });
</script>

<style scoped>
.fab { position: fixed; right: 14px; bottom: calc(76px + env(safe-area-inset-bottom)); z-index: 40; border: 0; padding: 0; width: 72px; height: 72px; border-radius: 50%;
  background: radial-gradient(circle at 50% 40%, #fff, #ffe4ee); box-shadow: 0 6px 18px rgba(232, 93, 138, .35); cursor: pointer; display: flex; align-items: center; justify-content: center; }
.fab:hover, .fab:focus-visible { box-shadow: 0 8px 24px rgba(232, 93, 138, .5); outline: none; }
.bubble { position: absolute; right: 78px; bottom: 18px; white-space: nowrap; background: #fff; color: #b5475f; border: 1px solid #ffc2d4; border-radius: 14px 14px 4px 14px; padding: 6px 10px; font-size: .85rem; font-weight: 700; box-shadow: var(--shadow); animation: pop 3s ease-in-out infinite; }
@keyframes pop { 0%, 100% { transform: translateY(0) } 50% { transform: translateY(-3px) } }

.panel { position: fixed; right: 12px; bottom: calc(72px + env(safe-area-inset-bottom)); z-index: 60; width: min(380px, calc(100vw - 24px)); height: min(560px, calc(100vh - 150px));
  display: flex; flex-direction: column; background: var(--card); border: 1px solid var(--line); border-radius: 18px; box-shadow: 0 12px 40px rgba(16, 24, 40, .25); overflow: hidden; }
.hd { display: flex; align-items: center; gap: 8px; padding: 8px 10px; background: linear-gradient(90deg, #ffe4ee, #e6f0fa); color: #1c2430; }
.hd b { display: block; font-size: 1.05rem; }
.hd small { color: #6b7684; font-size: .78rem; }
.ic { width: 34px; height: 34px; border-radius: 50%; border: 0; background: rgba(255, 255, 255, .7); cursor: pointer; font-size: 1rem; }
.msgs { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
.m { max-width: 86%; position: relative; }
.m p { margin: 0; }
.m.bot { align-self: flex-start; background: var(--bg); border-radius: 14px 14px 14px 4px; padding: 8px 12px; }
.m.me { align-self: flex-end; background: var(--fill); color: #fff; border-radius: 14px 14px 4px 14px; padding: 8px 12px; }
.rich :deep(p) { margin: 0 0 4px; }
.rich :deep(ol), .rich :deep(ul) { margin: 2px 0 4px; padding-left: 20px; }
.rich :deep(li) { margin: 2px 0; }
.replay { position: absolute; right: -30px; bottom: 0; border: 0; background: none; cursor: pointer; opacity: .6; }
.typing { display: inline-flex; gap: 4px; }
.typing i { width: 7px; height: 7px; border-radius: 50%; background: #9aa5b4; animation: tp 1s infinite; }
.typing i:nth-child(2) { animation-delay: .15s; } .typing i:nth-child(3) { animation-delay: .3s; }
@keyframes tp { 0%, 100% { opacity: .3; transform: translateY(0) } 50% { opacity: 1; transform: translateY(-3px) } }
.err { color: var(--bad); background: var(--bad-bg); border-radius: 10px; padding: 6px 10px; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 12px 8px; }
.chips button { border: 1px solid #ffc2d4; background: #fff6f9; color: #b5475f; border-radius: 999px; padding: 5px 10px; font: inherit; font-size: .82rem; cursor: pointer; }
.in { display: flex; gap: 6px; padding: 8px; border-top: 1px solid var(--line); }
.in input { flex: 1; min-width: 0; }
.mic, .send { flex: none; width: 44px; height: 44px; border-radius: 50%; border: 0; cursor: pointer; font-size: 1.1rem; }
.mic { background: #fff0f5; }
.mic.on { background: #e85d8a; animation: rec 1s ease-in-out infinite; }
@keyframes rec { 0%, 100% { box-shadow: 0 0 0 0 rgba(232, 93, 138, .5) } 50% { box-shadow: 0 0 0 8px rgba(232, 93, 138, 0) } }
.send { background: var(--fill); color: #fff; }
.send:disabled { opacity: .5; cursor: default; }
.note { margin: 0; padding: 0 12px 8px; }
@media print { .ast { display: none; } }
</style>
