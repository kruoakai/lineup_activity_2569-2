const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const config = require('../config');
const { HttpError } = require('../middleware/auth');

const MAGIC = {
  jpeg: (b) => b[0] === 0xff && b[1] === 0xd8,
  png: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
};

/**
 * บันทึกรูปจาก data URL ลงโฟลเดอร์ uploads แล้วคืน path สัมพัทธ์
 * @param {string} dataUrl  data:image/jpeg;base64,... หรือ data:image/png;base64,...
 * @param {object} opt { dir, prefix, types: ['jpeg','png'], maxBytes }
 */
async function saveImage(dataUrl, { dir, prefix = 'img', types = ['jpeg'], maxBytes = 1_500_000 }) {
  const m = /^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m || !types.includes(m[1])) {
    throw new HttpError(400, `รูปภาพต้องเป็นไฟล์ ${types.map((t) => t.toUpperCase()).join(' หรือ ')}`);
  }
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > maxBytes) throw new HttpError(413, 'รูปภาพมีขนาดใหญ่เกินไป');
  if (!MAGIC[m[1]](buf)) throw new HttpError(400, 'ไฟล์รูปภาพไม่ถูกต้อง');
  const ext = m[1] === 'png' ? 'png' : 'jpg';
  const rel = path.posix.join(dir, `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`);
  const abs = path.join(config.uploadDir, rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, buf);
  return rel;
}

// path สัมพัทธ์ -> path จริง (กัน path traversal)
function resolveUpload(rel) {
  const base = path.resolve(config.uploadDir);
  const abs = path.resolve(base, rel || '');
  if (!rel || !abs.startsWith(base + path.sep)) return null;
  return abs;
}

async function copyUpload(rel, dir, prefix) {
  const src = resolveUpload(rel);
  if (!src) return null;
  const ext = path.extname(rel);
  const out = path.posix.join(dir, `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`);
  const dst = path.join(config.uploadDir, out);
  await fs.mkdir(path.dirname(dst), { recursive: true });
  await fs.copyFile(src, dst);
  return out;
}

async function removeUpload(rel) {
  const abs = resolveUpload(rel);
  if (abs) await fs.rm(abs, { force: true });
}

module.exports = { saveImage, resolveUpload, copyUpload, removeUpload };
