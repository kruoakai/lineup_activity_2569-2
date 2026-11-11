<template>
  <!-- ตั้งค่าน้องแถวดี (AI ผู้ช่วย) — วางคีย์ OpenRouter / เลือกโมเดล / เปิด-ปิด / ทดสอบ -->
  <section id="assistant" class="card stack ast-set">
    <div class="row">
      <NongTaewDee :state="testing ? 'thinking' : 'idle'" :size="56" />
      <div class="grow">
        <h2 style="margin:0">น้องแถวดี (AI ผู้ช่วย)</h2>
        <span class="small" :class="v?.enabled ? 'okc' : 'muted'">{{ statusText }}</span>
      </div>
    </div>

    <div v-if="err" class="alert bad small" style="margin:0">{{ err }}</div>
    <div v-if="msg" class="alert ok small" style="margin:0">{{ msg }}</div>

    <template v-if="v">
      <p v-if="v.broken" class="alert warn small" style="margin:0">คีย์ที่เคยบันทึกอ่านไม่ได้แล้ว (เปลี่ยนรหัสลับของเซิร์ฟเวอร์) — วางคีย์ใหม่อีกครั้ง</p>
      <p v-if="v.source === 'env'" class="small muted" style="margin:0">ตอนนี้ใช้คีย์จากไฟล์ .env บนเซิร์ฟเวอร์ (…{{ v.last4 }}) ซึ่งมีผลเหนือคีย์ที่วางในหน้านี้</p>

      <ol class="steps small">
        <li>เปิด <b>openrouter.ai</b> → เข้าสู่ระบบ → <b>Keys</b> → <b>Create Key</b> (ตั้งวงเงิน Credit limit ไว้ด้วย เช่น 10 ดอลลาร์)</li>
        <li>คัดลอกคีย์ (ขึ้นต้นด้วย <code>sk-or-</code>) มาวางในช่องด้านล่าง แล้วกด <b>บันทึก</b></li>
        <li>กด <b>ทดสอบ</b> ถ้าน้องตอบกลับมา แปลว่าใช้งานได้ ครูทุกคนจะเห็นปุ่มน้องแถวดีมุมขวาล่าง</li>
      </ol>

      <label class="field">
        <span>คีย์ OpenRouter <template v-if="v.hasKey && v.source === 'settings'"> · บันทึกไว้แล้ว (…{{ v.last4 }}) วางใหม่เพื่อเปลี่ยน</template></span>
        <input v-model.trim="key" type="password" autocomplete="off" spellcheck="false" :placeholder="v.hasKey ? '•••••••••••• (เว้นว่าง = ใช้คีย์เดิม)' : 'sk-or-v1-…'" />
      </label>

      <label class="field"><span>โมเดล</span>
        <select v-model="model">
          <option v-for="m in v.models" :key="m.id" :value="m.id">{{ m.label }}</option>
          <option v-if="!v.models.some((m) => m.id === model)" :value="model">{{ model }}</option>
        </select>
      </label>

      <label class="row tog"><input v-model="on" type="checkbox" /> เปิดให้บุคลากรใช้น้องแถวดี</label>

      <div class="row" style="flex-wrap:wrap">
        <button type="button" class="btn primary grow" :disabled="busy" @click="save">💾 บันทึก</button>
        <button type="button" class="btn grow" :disabled="busy || testing || !v.hasKey" @click="test">{{ testing ? 'กำลังทดสอบ…' : '🧪 ทดสอบ' }}</button>
        <button v-if="v.hasKey && v.source === 'settings'" type="button" class="btn danger" :disabled="busy" @click="clearKey">ลบคีย์</button>
      </div>
      <p v-if="reply" class="small reply">น้องแถวดีตอบ: “{{ reply }}”</p>
      <p class="small muted" style="margin:0">คีย์ถูกเข้ารหัสก่อนเก็บ หน้านี้แสดงเฉพาะ 4 ตัวท้าย · จำกัด 40 คำถาม/ชั่วโมง/คน · ส่งให้ AI เฉพาะคำถามและบทบาทของผู้ถาม ไม่ส่งข้อมูลคนอื่น</p>
    </template>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { api } from '../api';
import { askPassword } from '../confirm';
import NongTaewDee from './NongTaewDee.vue';

const v = ref(null);
const key = ref('');
const model = ref('');
const on = ref(true);
const busy = ref(false);
const testing = ref(false);
const err = ref('');
const msg = ref('');
const reply = ref('');

const statusText = computed(() => {
  if (!v.value) return 'กำลังโหลด…';
  if (!v.value.hasKey) return 'ยังไม่ได้ใส่คีย์ — ปุ่มน้องแถวดียังไม่แสดง';
  if (!v.value.switchedOn) return 'ปิดอยู่ — บุคลากรไม่เห็นปุ่มน้องแถวดี';
  return '✓ เปิดใช้งานอยู่';
});

function fill(d) {
  v.value = d;
  model.value = d.model;
  on.value = d.switchedOn;
}

async function load() {
  try { fill(await api('/api/admin/assistant')); } catch (e) { err.value = e.message; }
}

async function put(body, okText) {
  const password = await askPassword('ยืนยันการตั้งค่าน้องแถวดี');
  if (!password) return;
  busy.value = true; err.value = ''; msg.value = ''; reply.value = '';
  try {
    fill(await api('/api/admin/assistant', { method: 'PUT', body: { ...body, password } }));
    key.value = '';
    msg.value = okText;
  } catch (e) { err.value = e.message; } finally { busy.value = false; }
}

async function save() {
  await put({ key: key.value || undefined, model: model.value, switchedOn: on.value }, 'บันทึกแล้ว — กด “ทดสอบ” เพื่อตรวจว่าคีย์ใช้ได้');
}

async function clearKey() {
  if (!window.confirm('ลบคีย์ OpenRouter ที่บันทึกไว้? น้องแถวดีจะหยุดทำงานทันที')) return;
  await put({ clearKey: true }, 'ลบคีย์แล้ว');
}

async function test() {
  testing.value = true; err.value = ''; msg.value = ''; reply.value = '';
  try {
    const r = await api('/api/admin/assistant/test', { method: 'POST' });
    reply.value = r.reply;
    msg.value = `ใช้งานได้ ✓ (${r.model}, ${(r.ms / 1000).toFixed(1)} วินาที)`;
  } catch (e) { err.value = e.message; } finally { testing.value = false; }
}

onMounted(async () => {
  await load();
  if (location.hash === '#assistant') setTimeout(() => document.getElementById('assistant')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
});
</script>

<style scoped>
.ast-set { border-left: 4px solid #e85d8a; }
.steps { margin: 0; padding-left: 20px; line-height: 1.7; }
.tog { gap: 8px; }
.okc { color: var(--ok); font-weight: 700; }
.reply { margin: 0; background: #fff6f9; border: 1px solid #ffc2d4; border-radius: 10px; padding: 8px 10px; }
</style>
