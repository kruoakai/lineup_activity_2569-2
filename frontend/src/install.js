// ติดตั้งเป็นแอปบนมือถือ (PWA)
// Android/Chrome: เก็บเหตุการณ์ beforeinstallprompt ไว้ แล้วให้ผู้ใช้กดปุ่ม "ติดตั้ง" เอง
// iPhone/iPad: ไม่มี API ติดตั้ง — แสดงขั้นตอน แชร์ → เพิ่มไปยังหน้าจอโฮม
import { computed, reactive } from 'vue';

const DISMISS_KEY = 'install-dismissed-at';
const DISMISS_DAYS = 14;
const DEMO_KEY = 'install-demo';

// ลิงก์สาธิต ?install=demo: ล้าง "ไว้ทีหลัง" และแสดงการ์ดติดตั้งเสมอ (ทุกหน้าจนปิดแท็บ) · ?install=off ปิดโหมดสาธิต
function demoMode() {
  try {
    const q = new URLSearchParams(window.location.search).get('install');
    if (q === 'demo') {
      sessionStorage.setItem(DEMO_KEY, '1');
      localStorage.removeItem(DISMISS_KEY);
    } else if (q === 'off') {
      sessionStorage.removeItem(DEMO_KEY);
    }
    return sessionStorage.getItem(DEMO_KEY) === '1';
  } catch { return false; }
}

const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent || '';
const isIOS = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1);
const isAndroid = /Android/i.test(ua);
// เบราว์เซอร์ในแอป (LINE / Facebook / Instagram) ติดตั้งไม่ได้
const inApp = /\bLine\/|FBAN|FBAV|Instagram|; wv\)/i.test(ua);

function standaloneNow() {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  } catch { return false; }
}

function dismissedRecently() {
  try {
    const t = Number(localStorage.getItem(DISMISS_KEY) || 0);
    return t > 0 && Date.now() - t < DISMISS_DAYS * 86400_000;
  } catch { return false; }
}

const demo = typeof window !== 'undefined' && demoMode();

export const install = reactive({
  demo,
  deferred: null, // เหตุการณ์ beforeinstallprompt ที่ยังไม่ได้ใช้
  installed: typeof window !== 'undefined' && standaloneNow(),
  justInstalled: false,
  dismissed: !demo && dismissedRecently(),
  isIOS,
  isAndroid,
  inApp,
  mobile: isIOS || isAndroid || /Mobile/i.test(ua),
});

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    install.deferred = e;
  });
  window.addEventListener('appinstalled', () => {
    install.deferred = null;
    install.installed = true;
    install.justInstalled = true;
  });
  try {
    window.matchMedia('(display-mode: standalone)').addEventListener('change', (e) => { if (e.matches) install.installed = true; });
  } catch { /* เบราว์เซอร์เก่า */ }
}

// วิธีติดตั้งที่ใช้ได้บนเครื่องนี้: 'prompt' (กดปุ่มแล้วติดตั้ง) | 'ios' (ทำตามขั้นตอน) | 'inapp' (เปิดในเบราว์เซอร์ก่อน) | 'menu' (เมนูเบราว์เซอร์) | null
export const installMode = computed(() => {
  if (install.installed) return null;
  if (install.deferred) return 'prompt';
  if (install.inApp) return 'inapp';
  if (install.isIOS) return 'ios';
  if (install.isAndroid) return 'menu';
  if (install.demo) return 'desktop';
  return null;
});

// แสดงแถบชวนติดตั้งบนหน้าแรก: เฉพาะมือถือ ยังไม่ติดตั้ง และไม่ได้กด "ไว้ทีหลัง" ภายใน 14 วัน
export const showBanner = computed(() => {
  if (install.demo) return !install.dismissed && !install.installed;
  return !install.dismissed && !!installMode.value && (install.mobile || installMode.value === 'prompt');
});

export async function promptInstall() {
  const e = install.deferred;
  if (!e) return 'unavailable';
  e.prompt();
  const choice = await e.userChoice.catch(() => ({ outcome: 'dismissed' }));
  install.deferred = null;
  if (choice.outcome === 'accepted') { install.installed = true; install.justInstalled = true; }
  return choice.outcome;
}

export function dismissInstall() {
  install.dismissed = true;
  try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* ไม่มี storage */ }
}
