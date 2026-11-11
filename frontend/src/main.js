import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import './style.css';
import './install'; // เก็บเหตุการณ์ติดตั้งแอปตั้งแต่เปิดหน้า
import { registerSW } from 'virtual:pwa-register';

// อัปเดตแอปอัตโนมัติ: มีเวอร์ชันใหม่บนเซิร์ฟเวอร์ → ติดตั้งแล้วโหลดหน้าใหม่ทันที
// ตรวจเมื่อกลับมาเปิดแอป และทุก 15 นาทีระหว่างเปิดค้างไว้
registerSW({
  immediate: true,
  onRegisteredSW(_url, reg) {
    if (!reg) return;
    const check = () => { if (navigator.onLine) reg.update().catch(() => {}); };
    setInterval(check, 15 * 60 * 1000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
  },
});

createApp(App).use(router).mount('#app');
