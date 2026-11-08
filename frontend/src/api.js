import { reactive } from 'vue';

// สถานะการเข้าสู่ระบบ (access token เก็บในหน่วยความจำเท่านั้น, refresh token อยู่ใน httpOnly cookie)
export const auth = reactive({ token: null, user: null, ready: false });

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error || `เกิดข้อผิดพลาด (${status})`);
    this.status = status;
    this.code = body?.code;
    this.body = body;
  }
}

let refreshing = null;

export async function refresh() {
  if (!refreshing) {
    refreshing = fetch('/api/auth/refresh', { method: 'POST', credentials: 'same-origin' })
      .then(async (r) => {
        if (!r.ok) throw new ApiError(r.status, await r.json().catch(() => ({})));
        const body = await r.json();
        auth.token = body.accessToken;
        auth.user = body.user;
        return true;
      })
      .catch(() => {
        auth.token = null;
        auth.user = null;
        return false;
      })
      .finally(() => { refreshing = null; });
  }
  return refreshing;
}

export async function api(path, { method = 'GET', body, raw = false } = {}, retry = true) {
  const headers = {};
  if (auth.token) headers.Authorization = `Bearer ${auth.token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res;
  try {
    res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'same-origin' });
  } catch {
    throw new ApiError(0, { error: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ตรวจสอบอินเทอร์เน็ต' });
  }
  if (res.status === 401 && retry && !path.startsWith('/api/auth/login')) {
    if (await refresh()) return api(path, { method, body, raw }, false);
  }
  if (raw) {
    if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => ({})));
    return res;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

export async function login(username, password, deviceId, remember = true) {
  const r = await api('/api/auth/login', { method: 'POST', body: { username, password, deviceId, remember } }, false);
  auth.token = r.accessToken;
  auth.user = r.user;
  return r.user;
}

export async function logout() {
  await api('/api/auth/logout', { method: 'POST' }, false).catch(() => {});
  auth.token = null;
  auth.user = null;
}

// ดาวน์โหลดไฟล์ที่ต้องแนบ token
export async function download(path, filename) {
  const res = await api(path, { raw: true });
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ดาวน์โหลดไฟล์จาก POST (ใช้กับคำขอที่ต้องยืนยันรหัสผ่าน)
export async function postDownload(path, body, filename) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'ดาวน์โหลดไม่สำเร็จ');
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// โหลดรูปที่ต้องแนบ token เป็น object URL
export async function imageUrl(path) {
  const res = await api(path, { raw: true });
  return URL.createObjectURL(await res.blob());
}
