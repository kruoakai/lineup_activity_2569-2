const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const db = require('../db');
const config = require('../config');
const clock = require('../clock');
const settings = require('./settings');
const schedule = require('./schedule');
const geo = require('./geo');
const qr = require('./qr');
const { canRecordFor, MANAGE_ALL } = require('./permissions');
const { HttpError } = require('../middleware/auth');
const files = require('./files');

const STATUSES = ['present', 'absent', 'official', 'policy', 'leave', 'pending'];
const STATUS_LABELS = {
  present: 'มาเข้าแถว',
  absent: 'ขาด',
  official: 'ไปราชการ',
  policy: 'ติดงานนโยบาย',
  leave: 'ลา',
  pending: 'รอตรวจสอบ',
};
// สถานะที่บันทึกโดยเจ้าหน้าที่ ผู้ใช้เช็กชื่อเองทับไม่ได้
const STAFF_ONLY = new Set(['official', 'policy', 'leave', 'absent']);

const MAX_PHOTOS = 3;

// รูปหลักฐานแนบได้สูงสุด 3 รูปต่อรายการ (body.photos = [dataUrl, ...]; รองรับ body.photo แบบเดิม)
function photosOf(body) {
  const list = Array.isArray(body.photos) ? body.photos : body.photo ? [body.photo] : [];
  const clean = list.filter((x) => typeof x === 'string' && x.length);
  if (clean.some((x) => !x.startsWith('data:image/jpeg;base64,'))) throw new HttpError(400, 'รูปภาพต้องเป็นไฟล์ JPEG');
  if (clean.length > MAX_PHOTOS) throw new HttpError(400, `แนบรูปได้ไม่เกิน ${MAX_PHOTOS} รูป`);
  return clean;
}

async function addPhotos(attendanceId, photos, uploaderId, day) {
  if (!photos.length) return 0;
  const [{ n }] = await db.query('SELECT COUNT(*) AS n FROM attendance_photos WHERE attendance_id = ?', [attendanceId]);
  if (n + photos.length > MAX_PHOTOS) throw new HttpError(400, `รายการนี้มีรูปแล้ว ${n} รูป แนบเพิ่มได้อีก ${MAX_PHOTOS - n} รูป`);
  for (const dataUrl of photos) {
    const rel = await files.saveImage(dataUrl, { dir: day, prefix: `att-${attendanceId}`, types: ['jpeg'] });
    await db.query('INSERT INTO attendance_photos (attendance_id, path, uploaded_by, created_at) VALUES (?, ?, ?, ?)',
      [attendanceId, rel, uploaderId, clock.now()]);
  }
  return photos.length;
}

async function getRow(q, userId, day, forUpdate = false) {
  const rows = await q.query(
    `SELECT * FROM attendance WHERE user_id = ? AND day = ?${forUpdate ? ' FOR UPDATE' : ''}`,
    [userId, day],
  );
  return rows[0] || null;
}

async function logEvent(q, ev) {
  await q.query(
    `INSERT INTO attendance_events
       (attendance_id, user_id, day, action, old_status, new_status, method, actor_id, reason, detail, ip)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [ev.attendanceId, ev.userId, ev.day, ev.action, ev.oldStatus ?? null, ev.newStatus, ev.method,
      ev.actorId, ev.reason || '', ev.detail ? JSON.stringify(ev.detail) : null, ev.ip || null],
  );
}

// เขียนหรือแก้แถว attendance พร้อม audit log ใน transaction เดียว
async function upsert({ userId, day, fields, actorId, reason, ip, detail, action }) {
  return db.transaction(async (q) => {
    const existing = await getRow(q, userId, day, true);
    const now = clock.now();
    let id;
    if (!existing) {
      const res = await q.query(
        `INSERT INTO attendance
           (user_id, day, status, leave_type, method, checked_by, checked_at, lat, lng, accuracy_m, distance_m,
            in_zone, qr_ok, device_id, note, flagged, flag_reason)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, day, fields.status, fields.leave_type ?? null, fields.method, actorId, now, fields.lat ?? null, fields.lng ?? null,
          fields.accuracy_m ?? null, fields.distance_m ?? null, fields.in_zone ?? null, fields.qr_ok ? 1 : 0,
          fields.device_id ?? null, fields.note || '', fields.flagged ? 1 : 0,
          fields.flag_reason || ''],
      );
      id = res.insertId;
    } else {
      id = existing.id;
      const cols = { ...fields, checked_by: actorId, checked_at: now, is_demo: 0 }; // ข้อมูลจริงแทนที่ข้อมูลจำลอง
      const keys = Object.keys(cols);
      await q.query(
        `UPDATE attendance SET ${keys.map((k) => `\`${k}\` = ?`).join(', ')} WHERE id = ?`,
        [...keys.map((k) => (typeof cols[k] === 'boolean' ? (cols[k] ? 1 : 0) : cols[k])), id],
      );
    }
    await logEvent(q, {
      attendanceId: id, userId, day,
      action: action || (existing ? 'update' : 'create'),
      oldStatus: existing?.status, newStatus: fields.status, method: fields.method,
      actorId, reason, ip, detail,
    });
    return { id, created: !existing, previous: existing };
  });
}

const hhmm = (d) => clock.bangkok(new Date(d)).time.slice(0, 5);
// ข้อความบอกว่าใครเช็กชื่อให้แล้ว เช่น "มาเข้าแถวแล้ว — เช็กแทนโดย ครู ก เวลา 07:41 น."
function whoText(rec, ownerId) {
  const staff = ['proxy_activity', 'hr', 'admin'].includes(rec.method);
  const by = rec.checked_by === ownerId ? 'เช็กเอง' : `${staff ? 'บันทึก' : 'เช็กแทน'}โดย ${rec.checked_by_name}`;
  return `${STATUS_LABELS[rec.status]}แล้ว — ${by} เวลา ${hhmm(rec.checked_at)} น.`;
}

async function findRecord(userId, day) {
  const [row] = await db.query(
    `SELECT a.id, a.day, a.status, a.leave_type, a.method, a.checked_at, a.distance_m, a.in_zone, a.qr_ok, a.flagged,
            a.flag_reason, a.note, a.is_demo, cb.full_name AS checked_by_name, a.checked_by,
            (SELECT COUNT(*) FROM attendance_photos p WHERE p.attendance_id = a.id) AS photo_count
       FROM attendance a JOIN users cb ON cb.id = a.checked_by
      WHERE a.user_id = ? AND a.day = ?`,
    [userId, day],
  );
  return row || null;
}

/**
 * บุคลากรเช็กชื่อด้วยตนเอง
 * body: { lat, lng, accuracy, qrToken, deviceId, photo, requestReview, note }
 */
async function selfCheckIn(user, body, ip) {
  try {
    return await selfCheckInOnce(user, body, ip);
  } catch (e) {
    // กดพร้อมกันหลายครั้ง: แถวถูกสร้างไปแล้วโดยอีกคำขอ — ลองใหม่ครั้งเดียวจะได้ผล "เช็กชื่อแล้ว"
    if (e.code === 'ER_DUP_ENTRY' || e.code === 'ER_LOCK_DEADLOCK') return selfCheckInOnce(user, body, ip);
    throw e;
  }
}

async function selfCheckInOnce(user, body, ip) {
  const state = await schedule.windowState();
  if (state.phase === 'no_assembly') throw new HttpError(409, `วันนี้ไม่มีการเข้าแถว${state.dayNote ? ` (${state.dayNote})` : ''}`, 'NO_ASSEMBLY');
  if (state.phase === 'before') throw new HttpError(409, `ยังไม่ถึงเวลาเช็กชื่อ (เปิด ${state.openTime} น.)`, 'NOT_OPEN');
  if (state.phase === 'closed') throw new HttpError(409, `ปิดการเช็กชื่อแล้ว (${state.closeTime} น.) ติดต่อเจ้าหน้าที่งานกิจกรรม`, 'CLOSED');
  if (!user.must_assemble) throw new HttpError(400, 'บัญชีนี้ไม่อยู่ในเกณฑ์ต้องเข้าแถว');

  const existing = await findRecord(user.id, state.day);
  if (existing && (existing.status === 'present' || STAFF_ONLY.has(existing.status))) {
    const prefix = existing.checked_by === user.id ? 'ท่าน' : 'มีผู้บันทึกให้ท่านแล้ว: ';
    return { alreadyChecked: true, record: existing, message: `${prefix}${whoText(existing, user.id)}` };
  }

  const s = await settings.getAll();
  const loc = {
    lat: Number(body.lat), lng: Number(body.lng),
    accuracy: body.accuracy === undefined ? NaN : Number(body.accuracy),
  };
  const g = geo.evaluate(Number.isFinite(loc.lat) && Number.isFinite(loc.lng) ? loc : null, s);
  const qrOk = body.qrToken ? qr.verify(body.qrToken, s.qr_interval_s) : false;
  if (body.qrToken && !qrOk) throw new HttpError(400, 'QR Code หมดอายุหรือไม่ถูกต้อง กรุณาสแกนใหม่', 'QR_INVALID');

  // ตัดสินผล
  let status = null;
  let method = qrOk ? 'self_qr' : 'self_gps';
  const flags = [];
  if (s.check_mode === 'none') {
    // โหมดไม่ต้องตั้งค่า: กดปุ่มแล้วบันทึก "มาเข้าแถว" ทันที (เก็บพิกัดไว้ถ้าเครื่องส่งมา)
    status = 'present';
    method = qrOk ? 'self_qr' : 'self_tap';
  } else {
    if (s.check_mode === 'qr_required' && !qrOk) {
      throw new HttpError(400, 'ต้องสแกน QR Code ที่จุดเข้าแถว', 'QR_REQUIRED');
    }
    if (g.result === 'in_zone' && (s.check_mode !== 'qr_required' || qrOk)) status = 'present';
    else if (qrOk && g.result !== 'out_of_zone') status = 'present';
    else if (qrOk && g.result === 'out_of_zone') flags.push(`QR ถูกต้องแต่พิกัดห่าง ${g.distance} ม.`);

    if (status === 'present' && g.result === 'not_configured') flags.push('ยังไม่ได้กำหนดพื้นที่เข้าแถว');
  }

  const geoMessage = {
    out_of_zone: `อยู่นอกพื้นที่เข้าแถว (ห่าง ${g.distance} ม.)`,
    low_accuracy: 'สัญญาณ GPS ไม่แม่นยำพอ',
    no_location: 'ไม่ได้รับพิกัดจากอุปกรณ์',
    not_configured: 'ผู้ดูแลยังไม่ได้กำหนดพื้นที่เข้าแถว',
    in_zone: '',
  }[g.result];

  if (!status) {
    if (!body.requestReview) {
      // ยังไม่บันทึก — ให้ผู้ใช้เลือกลองใหม่ สแกน QR หรือส่งคำขอตรวจสอบ
      return {
        needsReview: true,
        geo: g.result,
        distance: g.distance,
        message: flags[0] || geoMessage,
      };
    }
    status = 'pending';
  }

  // ตรวจอุปกรณ์ซ้ำ: เครื่องเดียวกันเช็กชื่อให้หลายบัญชีในวันเดียว
  const deviceId = typeof body.deviceId === 'string' ? body.deviceId.slice(0, 64) : null;
  let sameDevice = [];
  if (deviceId) {
    sameDevice = await db.query(
      `SELECT id FROM attendance WHERE day = ? AND device_id = ? AND user_id <> ? AND method IN ('self_gps','self_qr')`,
      [state.day, deviceId, user.id],
    );
    if (sameDevice.length) flags.push('อุปกรณ์เดียวกันถูกใช้เช็กชื่อหลายบัญชี');
  }

  const photos = photosOf(body);
  const note = typeof body.note === 'string' ? body.note.slice(0, 500) : '';
  const fields = {
    status, method,
    lat: Number.isFinite(loc.lat) ? loc.lat : null,
    lng: Number.isFinite(loc.lng) ? loc.lng : null,
    accuracy_m: Number.isFinite(loc.accuracy) ? Math.round(loc.accuracy) : null,
    distance_m: g.distance,
    in_zone: g.result === 'in_zone' ? 1 : g.result === 'out_of_zone' ? 0 : null,
    qr_ok: qrOk,
    device_id: deviceId,
    flagged: flags.length > 0,
    flag_reason: flags.join('; ').slice(0, 255),
    note: status === 'pending' ? (note || geoMessage) : note,
  };

  const saved = await upsert({
    userId: user.id, day: state.day, fields, actorId: user.id, ip,
    detail: { geo: g.result, distance: g.distance, accuracy: fields.accuracy_m, qr: qrOk, mode: s.check_mode, photos: photos.length },
  });
  await addPhotos(saved.id, photos, user.id, state.day);
  if (sameDevice.length) {
    await db.query(
      `UPDATE attendance SET flagged = 1,
         flag_reason = LEFT(CONCAT_WS('; ', NULLIF(flag_reason, ''), 'อุปกรณ์เดียวกันถูกใช้เช็กชื่อหลายบัญชี'), 255)
       WHERE id IN (?) AND flag_reason NOT LIKE '%อุปกรณ์เดียวกัน%'`,
      [sameDevice.map((r) => r.id)],
    );
  }
  const record = await findRecord(user.id, state.day);
  return {
    ok: true,
    record,
    message: status === 'present' ? 'เช็กชื่อสำเร็จ' : 'ส่งคำขอตรวจสอบแล้ว รอเจ้าหน้าที่ยืนยัน',
  };
}

/**
 * บันทึกสถานะแทนผู้อื่น (ครูในแผนก / งานกิจกรรม / ผู้ดูแล)
 * body: { userId, status, reason, day? }  — day ใช้ได้เฉพาะงานกิจกรรมและผู้ดูแล (แก้ย้อนหลัง)
 */
async function recordFor(actor, body, ip, opts = {}) {
  const status = body.status;
  if (!STATUSES.includes(status) || status === 'pending') throw new HttpError(400, 'สถานะไม่ถูกต้อง');
  const targetId = Number(body.userId);
  const [target] = await db.query('SELECT id, full_name, department_id, active, must_assemble FROM users WHERE id = ?', [targetId]);
  if (!target || !target.active) throw new HttpError(404, 'ไม่พบบุคลากร');

  const state = await schedule.windowState();
  let day = state.day;
  let phase = state.phase;
  if (body.day && body.day !== state.day) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.day)) throw new HttpError(400, 'รูปแบบวันที่ไม่ถูกต้อง');
    if (body.day > state.day) throw new HttpError(400, 'บันทึกล่วงหน้าไม่ได้');
    day = body.day;
    phase = 'closed';
  }
  if (phase === 'no_assembly' || !(await schedule.dayInfo(day)).isAssemblyDay) {
    throw new HttpError(409, 'วันดังกล่าวไม่ใช่วันเข้าแถว');
  }
  if (phase === 'before') {
    // ก่อนเปิด อนุญาตเฉพาะบันทึกสถานะที่ไม่ใช่ "มาเข้าแถว" ล่วงหน้า เช่น ไปราชการ
    if (status === 'present') throw new HttpError(409, 'ยังไม่ถึงเวลาเช็กชื่อ');
  }

  const perm = canRecordFor(actor, target, phase === 'before' ? 'open' : phase, status);
  if (!perm.ok) throw new HttpError(403, perm.reason);

  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : '';
  const existing = await findRecord(targetId, day);
  if (existing && existing.status === status) {
    return { ok: true, unchanged: true, alreadyChecked: true, record: existing, message: `${target.full_name} ${whoText(existing, targetId)}` };
  }

  const peer = perm.method === 'proxy_dept' || perm.method === 'proxy_peer';
  if (peer && existing && existing.status !== 'pending') {
    throw new HttpError(409, `${target.full_name} ${whoText(existing, targetId)}`, 'ALREADY_CHECKED');
  }
  const needsReason = status !== 'present' || phase !== 'open' || (existing && existing.status !== 'pending');
  if (perm.method !== 'proxy_dept' && needsReason && !reason) {
    throw new HttpError(400, 'กรุณาระบุเหตุผล/หลักฐานประกอบ');
  }

  const photos = photosOf(body);
  if (!opts.skipPhotoRule && perm.method === 'proxy_peer' && !photos.length && (await settings.getAll()).group_checkin_photo === '1') {
    throw new HttpError(400, 'การเช็กแทนเพื่อนในแผนกต้องแนบรูปถ่ายอย่างน้อย 1 รูป', 'PHOTO_REQUIRED');
  }
  const fields = { status, method: perm.method, note: reason, flagged: false, flag_reason: '' };
  if (existing && existing.status === 'pending' && status === 'present') {
    // อนุมัติคำขอตรวจสอบ: คงวิธีเช็กชื่อเดิมไว้ ผู้อนุมัติถูกบันทึกเป็น checked_by และใน audit log
    fields.method = existing.method;
  }
  const saved = await upsert({
    userId: targetId, day, fields, actorId: actor.id, reason, ip,
    action: existing && existing.status === 'pending' ? 'review' : undefined,
    detail: { phase, by_role: actor.role, photos: photos.length, ...(opts.batch ? { batch: opts.batch } : {}) },
  });
  await addPhotos(saved.id, photos, actor.id, day);
  return { ok: true, record: await findRecord(targetId, day) };
}

/**
 * เช็กชื่อแบบกลุ่ม: เลือกหลายคน + รูปถ่ายรวม 1–3 รูป (บันทึกไฟล์ครั้งเดียว ทุกคนอ้างรูปชุดเดียวกัน)
 * body: { userIds: [..], photos: [dataUrl..], reason? }
 * คืน { saved, skipped: [{ userId, message }] } — คนที่เช็กแล้ว/ไม่มีสิทธิ์จะถูกข้ามพร้อมเหตุผล
 */
async function recordBatch(actor, body, ip) {
  const ids = [...new Set((Array.isArray(body.userIds) ? body.userIds : []).map(Number).filter((x) => Number.isInteger(x) && x > 0))];
  if (!ids.length) throw new HttpError(400, 'กรุณาเลือกอย่างน้อย 1 คน');
  if (ids.length > 250) throw new HttpError(400, 'เลือกได้ครั้งละไม่เกิน 250 คน');
  const photos = photosOf(body);
  const manager = MANAGE_ALL.has(actor.role);
  if (!manager && !photos.length) throw new HttpError(400, 'กรุณาถ่ายรูปรวมอย่างน้อย 1 รูป', 'PHOTO_REQUIRED');
  const state = await schedule.windowState();
  if (!manager && state.phase !== 'open') throw new HttpError(409, 'อยู่นอกช่วงเวลาเช็กชื่อ');

  const rels = [];
  for (const dataUrl of photos) rels.push(await files.saveImage(dataUrl, { dir: state.day, prefix: `group-${actor.id}`, types: ['jpeg'] }));
  const batchId = crypto.randomBytes(6).toString('hex');
  const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim().slice(0, 500) : 'เช็กชื่อแบบกลุ่ม (รูปถ่ายรวม)';
  const saved = [];
  const skipped = [];
  for (const userId of ids) {
    try {
      const r = await recordFor(actor, { userId, status: 'present', reason }, ip, { skipPhotoRule: true, batch: batchId });
      if (r.alreadyChecked) { skipped.push({ userId, message: r.message }); continue; }
      const [{ n }] = await db.query('SELECT COUNT(*) AS n FROM attendance_photos WHERE attendance_id = ?', [r.record.id]);
      for (const rel of rels.slice(0, Math.max(0, MAX_PHOTOS - n))) {
        await db.query('INSERT INTO attendance_photos (attendance_id, path, uploaded_by, created_at) VALUES (?, ?, ?, ?)',
          [r.record.id, rel, actor.id, clock.now()]);
      }
      saved.push(userId);
    } catch (e) {
      if (!e.status) throw e;
      skipped.push({ userId, message: e.message });
    }
  }
  if (!saved.length) for (const rel of rels) await files.removeUpload(rel);
  return { ok: true, saved: saved.length, savedIds: saved, skipped, batch: batchId };
}

// รายชื่อพร้อมสถานะของวัน สำหรับหน้าเช็กแทน / ตรวจสอบ
async function roster({ day, departmentId, status, search }) {
  const where = ['u.active = 1', 'u.must_assemble = 1'];
  const params = [day];
  if (departmentId) { where.push('u.department_id = ?'); params.push(departmentId); }
  if (search) {
    where.push('(u.full_name LIKE ? OR u.employee_code LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }
  if (status === 'none') where.push('a.id IS NULL');
  else if (status === 'flagged') where.push('a.flagged = 1');
  else if (status) { where.push('a.status = ?'); params.push(status); }
  return db.query(
    `SELECT u.id AS user_id, u.employee_code, u.full_name, u.department_id, d.name AS department_name,
            a.id AS attendance_id, a.status, a.method, a.checked_at, a.distance_m, a.in_zone, a.qr_ok,
            a.flagged, a.flag_reason, a.note, a.is_demo, cb.full_name AS checked_by_name,
            (SELECT COUNT(*) FROM attendance_photos p WHERE p.attendance_id = a.id) AS photo_count, u.avatar_path IS NOT NULL AS has_avatar
       FROM users u
       LEFT JOIN departments d ON d.id = u.department_id
       LEFT JOIN attendance a ON a.user_id = u.id AND a.day = ?
       LEFT JOIN users cb ON cb.id = a.checked_by
      WHERE ${where.join(' AND ')}
      ORDER BY d.name, u.full_name`,
    params,
  );
}

async function history(userId, limit = 60) {
  return db.query(
    `SELECT a.day, a.status, a.leave_type, a.method, a.checked_at, a.flagged, a.note, cb.full_name AS checked_by_name
       FROM attendance a JOIN users cb ON cb.id = a.checked_by
      WHERE a.user_id = ? ORDER BY a.day DESC LIMIT ?`,
    [userId, limit],
  );
}

async function events(attendanceId) {
  return db.query(
    `SELECT e.action, e.old_status, e.new_status, e.method, e.reason, e.detail, e.ip, e.created_at,
            u.full_name AS actor_name
       FROM attendance_events e JOIN users u ON u.id = e.actor_id
      WHERE e.attendance_id = ? ORDER BY e.id`,
    [attendanceId],
  );
}

module.exports = {
  recordBatch, addPhotos, photosOf, MAX_PHOTOS, selfCheckIn, recordFor, roster, history, events, findRecord, upsert, STATUSES, STATUS_LABELS };
