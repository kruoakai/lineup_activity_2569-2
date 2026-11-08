import { reactive } from 'vue';

// กล่องยืนยันด้วยรหัสผ่าน (ใช้ร่วมกันทั้งแอป): const pw = await askPassword('ยืนยันการล้างข้อมูล')
export const pwDialog = reactive({ open: false, title: '', detail: '', danger: false, resolve: null });

export function askPassword(title, { detail = '', danger = false } = {}) {
  return new Promise((resolve) => {
    Object.assign(pwDialog, { open: true, title, detail, danger, resolve });
  });
}

export function closePassword(value) {
  const r = pwDialog.resolve;
  Object.assign(pwDialog, { open: false, resolve: null });
  if (r) r(value);
}
