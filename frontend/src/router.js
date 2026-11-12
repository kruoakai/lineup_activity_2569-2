import { createRouter, createWebHistory } from 'vue-router';
import { auth, refresh } from './api';

const VIEW_REPORT = (u) => ['activity', 'hr', 'executive', 'admin', 'dept_head'].includes(u.role) || u.can_proxy;
const HR = (u) => ['hr', 'admin'].includes(u.role);
const MANAGE = (u) => ['activity', 'admin'].includes(u.role);

const routes = [
  { path: '/login', component: () => import('./views/Login.vue'), meta: { public: true } },
  { path: '/forgot', component: () => import('./views/Forgot.vue'), meta: { public: true, anon: true } },
  { path: '/reset', component: () => import('./views/Reset.vue'), meta: { public: true, anon: true } },
  // คู่มือการใช้งาน: เปิดได้ทั้งก่อนและหลังเข้าสู่ระบบ
  { path: '/manuals', component: () => import('./views/Manuals.vue'), meta: { anon: true } },
  { path: '/manuals/:slug', component: () => import('./views/Manual.vue'), meta: { anon: true } },
  { path: '/setup', component: () => import('./views/Setup.vue'), meta: { setup: true } },
  { path: '/profile', component: () => import('./views/Profile.vue') },
  { path: '/executive', component: () => import('./views/Executive.vue') },
  { path: '/my-backup', component: () => import('./views/MyBackup.vue') },
  { path: '/hr', component: () => import('./views/Hr.vue'), meta: { can: HR } },
  { path: '/report-docs', component: () => import('./views/ReportDocs.vue') },
  { path: '/report-docs/:id', component: () => import('./views/ReportDoc.vue') },
  { path: '/admin/data', component: () => import('./views/admin/DataTools.vue'), meta: { can: (u) => u.role === 'admin' } },
  { path: '/admin/user-data', component: () => import('./views/admin/UserData.vue'), meta: { can: (u) => u.role === 'admin' } },
  { path: '/admin/backups', component: () => import('./views/admin/Backups.vue'), meta: { can: (u) => u.role === 'admin' } },
  { path: '/admin/report-setup', component: () => import('./views/admin/ReportSetup.vue'), meta: { can: (u) => u.role === 'admin' } },
  { path: '/', component: () => import('./views/Home.vue') },
  // ลิงก์จาก QR ที่จุดเข้าแถว (สแกนด้วยกล้องมือถือได้เลย)
  { path: '/q/:token', redirect: (to) => ({ path: '/', query: { qr: to.params.token } }) },
  { path: '/history', component: () => import('./views/History.vue') },
  { path: '/roster', component: () => import('./views/Roster.vue'), meta: { can: (u) => VIEW_REPORT(u) || u.peer_check } },
  { path: '/reports', component: () => import('./views/Reports.vue'), meta: { can: VIEW_REPORT } },
  { path: '/qr', component: () => import('./views/QrDisplay.vue'), meta: { can: MANAGE, bare: true } },
  { path: '/calendar', component: () => import('./views/admin/Calendar.vue'), meta: { can: MANAGE } },
  { path: '/admin/users', component: () => import('./views/admin/Users.vue'), meta: { can: (u) => u.role === 'admin' } },
  { path: '/admin/settings', component: () => import('./views/admin/Settings.vue'), meta: { can: (u) => u.role === 'admin' } },
  { path: '/more', component: () => import('./views/More.vue') },
  { path: '/:pathMatch(.*)*', redirect: '/' },
];

const router = createRouter({ history: createWebHistory(), routes });

router.beforeEach(async (to) => {
  if (!auth.ready) {
    await refresh();
    auth.ready = true;
  }
  if (to.meta.anon) return true;
  if (to.meta.public) return auth.user ? { path: '/' } : true;
  if (!auth.user) return { path: '/login', query: to.fullPath !== '/' ? { next: to.fullPath } : {} };
  const needsSetup = auth.user.must_change_password || !auth.user.consented;
  if (needsSetup && !to.meta.setup) return { path: '/setup', query: { next: to.fullPath } };
  if (!needsSetup && to.meta.setup) return { path: '/' };
  if (to.meta.can && !to.meta.can(auth.user)) return { path: '/' };
  return true;
});

export default router;
export { VIEW_REPORT, MANAGE };
