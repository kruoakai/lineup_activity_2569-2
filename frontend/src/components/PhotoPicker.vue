<template>
  <div class="picker">
    <div class="thumbs">
      <div v-for="(p, i) in modelValue" :key="i" class="thumb">
        <img :src="p" alt="รูปหลักฐาน" />
        <button type="button" class="x" aria-label="ลบรูป" @click="remove(i)">×</button>
      </div>
      <label v-if="modelValue.length < max" class="add">
        <input type="file" accept="image/*" :capture="capture ? 'environment' : undefined" multiple @change="pick" />
        <span class="addi"><svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" /><circle cx="12" cy="13" r="3.3" fill="none" stroke="currentColor" stroke-width="1.8" /></svg>เพิ่มรูป</span>
      </label>
    </div>
    <p class="small muted">แนบได้สูงสุด {{ max }} รูป {{ required ? '(ต้องแนบอย่างน้อย 1 รูป)' : '(ไม่บังคับ)' }} · {{ modelValue.length }}/{{ max }}</p>
    <p v-if="error" class="small" style="color:var(--bad)">{{ error }}</p>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { compressImage } from '../util';

const props = defineProps({ modelValue: { type: Array, default: () => [] }, max: { type: Number, default: 3 }, capture: { type: Boolean, default: false }, required: { type: Boolean, default: false } });
const emit = defineEmits(['update:modelValue']);
const error = ref('');

async function pick(ev) {
  error.value = '';
  const list = [...(ev.target.files || [])];
  ev.target.value = '';
  const room = props.max - props.modelValue.length;
  if (list.length > room) error.value = `เลือกได้อีก ${room} รูป`;
  const out = [...props.modelValue];
  for (const f of list.slice(0, room)) {
    try { out.push(await compressImage(f, 1280, 0.72)); } catch (e) { error.value = e.message; }
  }
  emit('update:modelValue', out);
}

function remove(i) {
  const out = [...props.modelValue];
  out.splice(i, 1);
  emit('update:modelValue', out);
}
</script>

<style scoped>
.thumbs { display: flex; gap: 8px; flex-wrap: wrap; }
.thumb, .add { width: 84px; height: 84px; border-radius: 10px; overflow: hidden; position: relative; }
.thumb img { width: 100%; height: 100%; object-fit: cover; }
.x { position: absolute; top: 3px; right: 3px; width: 24px; height: 24px; border-radius: 50%; border: 0; background: rgba(0,0,0,.6); color: #fff; font-size: 16px; line-height: 1; cursor: pointer; }
.add { border: 2px dashed var(--line); display: flex; align-items: center; justify-content: center; text-align: center; color: var(--muted); font-size: .8rem; cursor: pointer; }
.add:hover { border-color: var(--brand-2); color: var(--brand-2); }
.addi { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.add input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
.picker p { margin: 6px 0 0; }
</style>
