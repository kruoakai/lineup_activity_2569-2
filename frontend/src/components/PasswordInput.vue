<template>
  <div class="pwbox">
    <svg class="lk" viewBox="0 0 24 24" aria-hidden="true"><rect x="4.5" y="10.5" width="15" height="10" rx="2.5" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /><path d="M12 14.5v2.5" /></svg>
    <input ref="el" :value="modelValue" :type="show ? 'text' : 'password'" v-bind="$attrs" autocapitalize="none" spellcheck="false"
      @input="$emit('update:modelValue', $event.target.value)" />
    <button type="button" class="eye" :aria-label="show ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'" :aria-pressed="show" :title="show ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'" @click="show = !show">
      <svg v-if="!show" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
      <svg v-else viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18" /><path d="M10.6 5.1A9.8 9.8 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a9.6 9.6 0 0 0 5.4-1.6" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>
    </button>
  </div>
</template>

<script setup>
import { ref } from 'vue';

defineOptions({ inheritAttrs: false });
defineProps({ modelValue: { type: String, default: '' } });
defineEmits(['update:modelValue']);
const show = ref(false);
const el = ref(null);
defineExpose({ focus: () => el.value?.focus() });
</script>

<style scoped>
.pwbox { display: flex; align-items: center; gap: 8px; min-height: 48px; padding: 0 4px 0 12px; border-radius: 12px; border: 1px solid var(--line); background: var(--card); transition: border-color .15s, box-shadow .15s; }
.pwbox:focus-within { border-color: var(--brand-2); box-shadow: 0 0 0 3px rgba(47, 111, 184, .18); }
.pwbox input { border: 0; background: transparent; min-height: 46px; padding: 0; flex: 1; min-width: 0; outline: none; box-shadow: none; color: var(--text); font: inherit; }
.lk { width: 20px; height: 20px; flex: none; fill: none; stroke: var(--muted); stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.pwbox:focus-within .lk { stroke: var(--brand-2); }
.eye { flex: none; width: 40px; height: 40px; border: 0; background: transparent; border-radius: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
.eye:hover, .eye:focus-visible { background: var(--line); }
.eye svg { width: 20px; height: 20px; fill: none; stroke: var(--muted); stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
</style>
