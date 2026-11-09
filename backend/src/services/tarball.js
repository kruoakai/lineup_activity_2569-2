/**
 * ไฟล์ .tar แบบง่าย (ustar ไม่บีบอัด) สำหรับรวมไฟล์สำรองทั้งระบบเป็นไฟล์เดียว
 * ไฟล์ข้างในบีบอัดอยู่แล้ว (.sql.gz / .tar.gz) จึงไม่ต้อง gzip ซ้ำ · เปิดด้วย 7-Zip / tar ได้
 */
const fs = require('fs');
const fsp = require('fs/promises');

const BLOCK = 512;

function header(name, size, mtime = new Date()) {
  const b = Buffer.alloc(BLOCK, 0);
  const put = (str, off, len) => b.write(str, off, Math.min(len, Buffer.byteLength(str)), 'utf8');
  const oct = (n, len) => `${n.toString(8).padStart(len - 1, '0')}\0`;
  if (Buffer.byteLength(name) > 100) throw new Error(`ชื่อไฟล์ยาวเกินไป: ${name}`);
  put(name, 0, 100);
  b.write(oct(0o644, 8), 100, 8, 'ascii');
  b.write(oct(0, 8), 108, 8, 'ascii');
  b.write(oct(0, 8), 116, 8, 'ascii');
  b.write(oct(size, 12), 124, 12, 'ascii');
  b.write(oct(Math.floor(mtime.getTime() / 1000), 12), 136, 12, 'ascii');
  b.write('        ', 148, 8, 'ascii');
  b.write('0', 156, 1, 'ascii');
  b.write('ustar\0', 257, 6, 'ascii');
  b.write('00', 263, 2, 'ascii');
  let sum = 0;
  for (const x of b) sum += x;
  b.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii');
  return b;
}

const pad = (size) => Buffer.alloc((BLOCK - (size % BLOCK)) % BLOCK, 0);

/**
 * เขียน tar ลง stream: entries = [{ name, buffer } | { name, file }]
 */
async function write(entries, out) {
  const send = (chunk) => new Promise((resolve, reject) => {
    if (out.write(chunk)) resolve(); else out.once('drain', resolve);
    out.once('error', reject);
  });
  for (const e of entries) {
    if (e.buffer) {
      await send(header(e.name, e.buffer.length));
      await send(e.buffer);
      await send(pad(e.buffer.length));
    } else {
      const st = await fsp.stat(e.file);
      await send(header(e.name, st.size, st.mtime));
      for await (const chunk of fs.createReadStream(e.file)) await send(chunk);
      await send(pad(st.size));
    }
  }
  await send(Buffer.alloc(BLOCK * 2, 0));
}

/** รายการไฟล์ใน tar: [{ name, size, offset }] */
async function list(file) {
  const fh = await fsp.open(file, 'r');
  try {
    const { size: total } = await fh.stat();
    const out = [];
    let pos = 0;
    const h = Buffer.alloc(BLOCK);
    while (pos + BLOCK <= total) {
      await fh.read(h, 0, BLOCK, pos);
      if (h.every((x) => x === 0)) break;
      if (h.toString('ascii', 257, 262) !== 'ustar') throw new Error('ไม่ใช่ไฟล์ tar');
      const name = h.toString('utf8', 0, 100).replace(/\0.*$/s, '');
      const size = parseInt(h.toString('ascii', 124, 136).replace(/\0.*$/s, '').trim() || '0', 8);
      const type = h.toString('ascii', 156, 157);
      if (Number.isNaN(size)) throw new Error('ส่วนหัว tar เสียหาย');
      if (type === '0' || type === '\0') out.push({ name, size, offset: pos + BLOCK });
      pos += BLOCK + size + ((BLOCK - (size % BLOCK)) % BLOCK);
      if (out.length > 50) throw new Error('ไฟล์ในชุดสำรองมากผิดปกติ');
    }
    return out;
  } finally {
    await fh.close();
  }
}

/** คัดลอกไฟล์ข้างใน tar ออกมาเป็นไฟล์ */
async function extract(file, entry, dest) {
  await new Promise((resolve, reject) => {
    if (entry.size === 0) { fs.writeFile(dest, '', (e) => (e ? reject(e) : resolve())); return; }
    fs.createReadStream(file, { start: entry.offset, end: entry.offset + entry.size - 1 })
      .pipe(fs.createWriteStream(dest, { mode: 0o600 }))
      .on('finish', resolve).on('error', reject);
  });
}

async function readText(file, entry, max = 64 * 1024) {
  const fh = await fsp.open(file, 'r');
  try {
    const n = Math.min(entry.size, max);
    const b = Buffer.alloc(n);
    await fh.read(b, 0, n, entry.offset);
    return b.toString('utf8');
  } finally {
    await fh.close();
  }
}

module.exports = { write, list, extract, readText };
