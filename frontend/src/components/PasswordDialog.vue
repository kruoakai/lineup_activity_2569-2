<template>
  <div v-if="pwDialog.open" class="modal-back" @click.self="cancel">
    <form class="modal stack" @submit.prevent="ok">
      <h2 style="margin:0">{{ pwDialog.title }}</h2>
      <p v-if="pwDialog.detail" class="small" :class="pwDialog.danger ? 'alert bad' : 'muted'" style="white-space:pre-line">{{ pwDialog.detail }}</p>
      <label class="field"><span>รหัสผ่านของท่าน</span>
        <input ref="input" v-model="pw" type="password" autocomplete="current-password" required /></label>
      <div class="row">
        <button type="button" class="btn grow" @click="cancel">ยกเลิก</button>
        <button class="btn grow" :class="pwDialog.danger ? 'dangerfill' : 'primary'">ยืนยัน</button>
      </div>
    </form>
  </div>
</template>

<script setup>
import { nextTick, ref, watch } from 'vue';
import { pwDialog, closePassword } from '../confirm';

const pw = ref('');
const input = ref(null);
watch(() => pwDialog.open, async (o) => {
  if (o) { pw.value = ''; await nextTick(); input.value?.focus(); }
});
function ok() { closePassword(pw.value); }
function cancel() { closePassword(null); }
</script>

<style scoped>
.dangerfill { background: var(--bad); border-color: var(--bad); color: #fff; }
</style>
