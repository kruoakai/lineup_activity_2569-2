export const STATUS = {
  present: { label: 'มาเข้าแถว', cls: 'ok' },
  absent: { label: 'ขาด', cls: 'bad' },
  official: { label: 'ไปราชการ', cls: 'info' },
  policy: { label: 'ติดงานนโยบาย', cls: 'info2' },
  leave: { label: 'ลา', cls: 'muted' },
  pending: { label: 'รอตรวจสอบ', cls: 'warn' },
  not_checked: { label: 'ยังไม่เช็ก', cls: 'muted' },
};

export const METHOD = {
  self_gps: 'เช็กเอง (GPS)',
  self_qr: 'เช็กเอง (QR)',
  self_tap: 'เช็กเอง (กดปุ่ม)',
  proxy_dept: 'ครูในแผนกเช็กแทน',
  proxy_peer: 'เพื่อนในแผนกเช็กแทน',
  proxy_activity: 'งานกิจกรรมบันทึก',
  hr: 'งานบุคลากรบันทึก',
  admin: 'ผู้ดูแลระบบบันทึก',
};

// ประเภทบุคลากร (ชื่อย่อ) — ตรงกับ backend/src/services/staffTypes.js
export const STAFF_SHORT = {
  executive: 'ผู้บริหาร', gov_teacher: 'ขรก.ครู', assistant_teacher: 'ครูผู้ช่วย', gov_38c2: 'ขรก.38ค(2)', gov_emp_teacher: 'พนักงานราชการ (ครู)',
  gov_emp_general: 'พนักงานราชการ', temp_teacher: 'ครูอัตราจ้าง', temp_officer: 'เจ้าหน้าที่', temp_janitor: 'นักการ',
  temp_driver: 'พนักงานขับรถ', temp_guard: 'ยาม', trainee: 'นศ.ฝึกสอน',
};

export const LEAVE_TYPE = { sick: 'ลาป่วย', personal: 'ลากิจ', other: 'ลาอื่น ๆ' };
// ป้ายสถานะ รวมประเภทการลา เช่น "ลาป่วย"
export const statusLabel = (r) => (r?.status === 'leave' && LEAVE_TYPE[r.leave_type]) || STATUS[r?.status]?.label || '';

export const ROLE = {
  staff: 'บุคลากร',
  dept_head: 'หัวหน้าแผนก',
  activity: 'เจ้าหน้าที่งานกิจกรรม',
  hr: 'เจ้าหน้าที่บุคลากร',
  executive: 'ผู้บริหาร',
  admin: 'ผู้ดูแลระบบ',
};

// รหัสอุปกรณ์แบบสุ่ม เก็บในเครื่อง ใช้ตรวจการเช็กชื่อหลายบัญชีจากเครื่องเดียว
export function deviceId() {
  try {
    let id = localStorage.getItem('lineup_device');
    if (!id) {
      id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem('lineup_device', id);
    }
    return id;
  } catch {
    return null;
  }
}

const TH_MONTH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const TH_DAY = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
export const TH_MONTHS = TH_MONTH;
export const TH_DAYS = TH_DAY;
export const TH_MONTHS_FULL = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

// 'YYYY-MM-DD' -> 'จ. 9 พ.ย. 69'
export function thaiDate(day, withWeekday = true) {
  if (!day) return '';
  const [y, m, d] = day.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${withWeekday ? `${TH_DAY[wd]} ` : ''}${d} ${TH_MONTH[m - 1]} ${String(y + 543).slice(-2)}`;
}

// ช่วงวันที่แบบสั้น: 26–30 ต.ค. 69 · 28 ต.ค. – 3 พ.ย. 69 · วันเดียว = 26 ต.ค. 69
export function thaiRange(from, to) {
  if (!from) return '';
  if (!to || from === to) return thaiDate(from, false);
  const [y1, m1, d1] = from.split('-').map(Number);
  const [y2, m2, d2] = to.split('-').map(Number);
  const yy = (y) => String(y + 543).slice(-2);
  if (y1 === y2 && m1 === m2) return `${d1}–${d2} ${TH_MONTH[m1 - 1]} ${yy(y1)}`;
  if (y1 === y2) return `${d1} ${TH_MONTH[m1 - 1]} – ${d2} ${TH_MONTH[m2 - 1]} ${yy(y2)}`;
  return `${thaiDate(from, false)} – ${thaiDate(to, false)}`;
}

// เวลา (ISO UTC) -> HH:MM ตามเวลาไทย
export function thaiTime(iso) {
  if (!iso) return '';
  const d = new Date(new Date(iso).getTime() + 7 * 3600_000);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

export function todayBkk() {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
}

// วันที่ "วันนี้" ตามเวลาเซิร์ฟเวอร์ (ไม่เชื่อนาฬิกาเครื่องผู้ใช้)
let serverDay = null;
export async function serverToday() {
  if (!serverDay) {
    try {
      const r = await fetch('/api/health');
      serverDay = (await r.json()).day;
    } catch {
      return todayBkk();
    }
  }
  return serverDay;
}

export function addDays(day, n) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// จันทร์ของสัปดาห์
export function weekStart(day) {
  const wd = new Date(`${day}T00:00:00Z`).getUTCDay();
  return addDays(day, wd === 0 ? -6 : 1 - wd);
}

// อ่านพิกัด: ขอหลายครั้งแล้วเลือกค่าที่แม่นยำที่สุดภายในเวลาที่กำหนด
export function getBestPosition({ timeoutMs = 8000, goodEnough = 25 } = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('อุปกรณ์ไม่รองรับการระบุตำแหน่ง'));
    let best = null;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      navigator.geolocation.clearWatch(watch);
      clearTimeout(timer);
      if (best) resolve(best);
      else reject(new Error('ไม่สามารถอ่านพิกัดได้ ลองออกไปที่โล่งแล้วลองใหม่'));
    };
    const watch = navigator.geolocation.watchPosition(
      (p) => {
        const c = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy };
        if (!best || c.accuracy < best.accuracy) best = c;
        if (c.accuracy <= goodEnough) finish();
      },
      (err) => {
        if (err.code === 1) {
          done = true;
          clearTimeout(timer);
          navigator.geolocation.clearWatch(watch);
          reject(new Error('ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง — เปิดสิทธิ์ตำแหน่งให้เว็บไซต์นี้ในการตั้งค่าเบราว์เซอร์'));
        }
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: timeoutMs },
    );
    const timer = setTimeout(finish, timeoutMs);
  });
}

export function distanceMeters(a, b) {
  const R = 6371000;
  const r = (x) => (x * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// ย่อรูปจากกล้องเป็น JPEG ไม่เกิน maxSide px
export function compressImage(file, maxSide = 1024, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => reject(new Error('อ่านไฟล์รูปไม่ได้'));
    img.src = url;
  });
}
