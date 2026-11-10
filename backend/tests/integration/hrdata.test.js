// งานบุคลากร: แก้ชื่อ-สกุล/ตำแหน่ง (ทีละคน · แม่แบบ · ส่งออกแล้วนำเข้าใหม่) และส่งออกรายงานสรุปเป็น Excel
const ExcelJS = require('exceljs');
const h = require('../helpers');

const { api, PASSWORD, clock, bkk } = h;
let ids;
let hr;
let adm;
let teacher;

const binary = (res, cb) => {
  const chunks = [];
  res.on('data', (c) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};
async function readXlsx(buf) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  return wb;
}
async function xlsx(rows) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('รายชื่อ');
  ws.addRow(['รหัสพนักงาน*', 'ชื่อ-สกุล', 'ตำแหน่ง', 'ประเภทบุคลากร']);
  rows.forEach((r) => ws.addRow(r));
  return (await wb.xlsx.writeBuffer()).toString('base64');
}

beforeAll(async () => {
  await h.resetDb();
  const it = await h.createDept('เทคโนโลยีสารสนเทศ');
  ids = {
    admin: await h.createUser({ code: 'ADM', name: 'ผู้ดูแล', role: 'admin', mustAssemble: false }),
    hr: await h.createUser({ code: 'HR1', name: 'เจ้าหน้าที่บุคลากร', role: 'hr', mustAssemble: false }),
    t1: await h.createUser({ code: 'T1', name: 'นายครูหนึ่ง สะกดผิด', dept: it }),
    t2: await h.createUser({ code: 'T2', name: 'นางครูสอง', dept: it }),
  };
  hr = api(await h.login('HR1'));
  adm = api(await h.login('ADM'));
  teacher = api(await h.login('T1'));
});

afterAll(async () => {
  clock.setNow(null);
  await h.db.close();
});

describe('แก้ข้อมูลบุคลากรทีละคน', () => {
  test('เจ้าหน้าที่บุคลากรแก้ชื่อ ตำแหน่ง ประเภท ได้ · ครูทั่วไปไม่ได้ · บัญชีผู้ดูแลแก้ไม่ได้', async () => {
    await teacher.patch(`/api/hr/users/${ids.t2}`).send({ full_name: 'x' }).expect(403);
    await hr.patch(`/api/hr/users/${ids.admin}`).send({ full_name: 'x' }).expect(403);
    await hr.patch(`/api/hr/users/${ids.t1}`).send({ full_name: '  ' }).expect(400);
    await hr.patch(`/api/hr/users/${ids.t1}`).send({ staff_type: 'king' }).expect(400);
    const r = await hr.patch(`/api/hr/users/${ids.t1}`).send({ full_name: 'นายครูหนึ่ง  ถูกต้อง', position_title: 'ครูชำนาญการ', staff_type: 'gov_teacher' }).expect(200);
    expect(r.body.changed).toBe(3);
    const [u] = await h.db.query('SELECT full_name, position_title, staff_type FROM users WHERE id = ?', [ids.t1]);
    expect(u).toEqual({ full_name: 'นายครูหนึ่ง ถูกต้อง', position_title: 'ครูชำนาญการ', staff_type: 'gov_teacher' });
    // ล้างตำแหน่ง / ประเภทได้
    await hr.patch(`/api/hr/users/${ids.t1}`).send({ full_name: 'นายครูหนึ่ง ถูกต้อง', position_title: '', staff_type: null }).expect(200);
    const [u2] = await h.db.query('SELECT position_title, staff_type FROM users WHERE id = ?', [ids.t1]);
    expect(u2).toEqual({ position_title: '', staff_type: null });
    const [log] = await h.db.query("SELECT target FROM admin_logs WHERE action = 'hr.user_update' ORDER BY id DESC LIMIT 1");
    expect(log.target).toBe('T1');
  });
});

describe('Excel: แม่แบบ / ส่งออก / นำเข้า', () => {
  test('แม่แบบและไฟล์ส่งออกมีคอลัมน์ที่แก้ได้ · ไม่มีบัญชีผู้ดูแล', async () => {
    await teacher.get('/api/hr/people/export.xlsx').expect(403);
    const t = await hr.get('/api/hr/people/template.xlsx').buffer(true).parse(binary).expect(200);
    const tw = await readXlsx(t.body);
    expect(tw.getWorksheet('รายชื่อบุคลากร').getRow(1).values.slice(1)).toEqual(['รหัสพนักงาน*', 'ชื่อ-สกุล', 'ตำแหน่ง', 'ประเภทบุคลากร', 'แผนก/งาน (อ่านอย่างเดียว)']);
    const e = await hr.get('/api/hr/people/export.xlsx').buffer(true).parse(binary).expect(200);
    const ws = (await readXlsx(e.body)).getWorksheet('รายชื่อบุคลากร');
    const codes = [];
    ws.eachRow((row, n) => { if (n > 1 && row.getCell(1).value) codes.push(row.getCell(1).value); });
    expect(codes.sort()).toEqual(['HR1', 'T1', 'T2']);
  });

  test('ดาวน์โหลดไปแก้แล้วนำเข้าใหม่: ตรวจก่อน แล้วบันทึกด้วยรหัสผ่าน', async () => {
    const e = await hr.get('/api/hr/people/export.xlsx').buffer(true).parse(binary);
    const wb = await readXlsx(e.body);
    const ws = wb.getWorksheet('รายชื่อบุคลากร');
    ws.eachRow((row) => {
      if (row.getCell(1).value === 'T2') { row.getCell(2).value = 'นางครูสอง แก้แล้ว'; row.getCell(3).value = 'ครู'; row.getCell(4).value = 'ครูอัตราจ้าง'; }
    });
    const file = (await wb.xlsx.writeBuffer()).toString('base64');
    const p = await hr.post('/api/hr/people/import/preview').send({ file }).expect(200);
    expect(p.body.summary).toMatchObject({ update: 1, error: 0 });
    expect(p.body.rows.find((r) => r.employee_code === 'T2').changes).toEqual({
      full_name: { from: 'นางครูสอง', to: 'นางครูสอง แก้แล้ว' }, position_title: { from: '', to: 'ครู' }, staff_type: { from: '', to: 'temp_teacher' },
    });
    await hr.post('/api/hr/people/import').send({ file }).expect(400);
    await hr.post('/api/hr/people/import').send({ file, password: 'wrong' }).expect(403);
    const r = await hr.post('/api/hr/people/import').send({ file, password: PASSWORD }).expect(200);
    expect(r.body.update).toBe(1);
    const [u] = await h.db.query('SELECT full_name, position_title, staff_type FROM users WHERE id = ?', [ids.t2]);
    expect(u).toEqual({ full_name: 'นางครูสอง แก้แล้ว', position_title: 'ครู', staff_type: 'temp_teacher' });
  });

  test('แม่แบบกรอกเฉพาะคนที่แก้: ช่องว่าง = คงเดิม · รหัสไม่พบ/ผู้ดูแล/ซ้ำ ถูกข้าม', async () => {
    const file = await xlsx([
      ['T1', '', 'ครูผู้ช่วย', ''],
      ['NOPE', 'ใครก็ไม่รู้', '', ''],
      ['ADM', 'แอดมิน', '', ''],
      ['T1', 'ซ้ำ', '', ''],
      ['T2', '', '', 'ผิดประเภท'],
      ['ตัวอย่าง001', 'ข้าม', '', ''],
    ]);
    const p = await hr.post('/api/hr/people/import/preview').send({ file }).expect(200);
    expect(p.body.summary).toMatchObject({ rows: 5, update: 1, error: 4 });
    const t1 = p.body.rows.find((r) => r.employee_code === 'T1' && r.action === 'update');
    expect(t1.changes).toEqual({ position_title: { from: '', to: 'ครูผู้ช่วย' } });
    expect(t1.full_name).toBe('นายครูหนึ่ง ถูกต้อง');
    await hr.post('/api/hr/people/import').send({ file, password: PASSWORD }).expect(200);
    const [a] = await h.db.query('SELECT full_name FROM users WHERE id = ?', [ids.admin]);
    expect(a.full_name).toBe('ผู้ดูแล');
  });

  test('ผู้ดูแลระบบใช้ได้ด้วย · ไฟล์ผิดรูปแบบแจ้งชัด', async () => {
    await adm.get('/api/hr/people/template.xlsx').expect(200);
    expect((await hr.post('/api/hr/people/import/preview').send({ file: Buffer.from('hello').toString('base64') })).status).toBe(400);
  });
});

describe('ส่งออกรายงานสรุปการปฏิบัติงานเป็น Excel', () => {
  test('รายวัน · ทั้งเดือน · จากเอกสาร · ชีตผู้ไม่เข้าแถวในรายงานเข้าแถว', async () => {
    clock.setNow(bkk('2027-02-03', '10:00:00')); // พุธ
    await hr.post('/api/hr/status').send({ userIds: [ids.t1], from: '2027-02-01', status: 'leave', leaveType: 'sick' }).expect(200);
    await teacher.get('/api/hr/report/day.xlsx?day=2027-02-01').expect(403);
    const d = await hr.get('/api/hr/report/day.xlsx?day=2027-02-01').buffer(true).parse(binary).expect(200);
    const dw = await readXlsx(d.body);
    expect(dw.worksheets.map((w) => w.name)).toEqual(['รายงานประจำวัน', 'รายชื่อ']);
    const list = [];
    dw.getWorksheet('รายชื่อ').eachRow((row, n) => { if (n > 1) list.push([row.getCell(2).value, row.getCell(4).value]); });
    expect(list).toContainEqual(['3.1 ลาป่วย', 'นายครูหนึ่ง ถูกต้อง']);
    expect(list).toContainEqual(['5. ผู้ไม่เข้ากิจกรรมหน้าเสาธง', 'นางครูสอง แก้แล้ว']);

    const m = await hr.get('/api/hr/report/range.xlsx?from=2027-02-01&to=2027-02-28').buffer(true).parse(binary).expect(200);
    const mw = await readXlsx(m.body);
    expect(mw.worksheets.map((w) => w.name).slice(0, 3)).toEqual(['สรุปรายวัน', 'รายชื่อทุกวัน', 'รายบุคคล']);
    const days = [];
    mw.getWorksheet('สรุปรายวัน').eachRow((row, n) => { if (n > 1) days.push(row.getCell(1).value); });
    expect(days).toEqual(['2027-02-01', '2027-02-02', '2027-02-03']); // ไม่เกินวันนี้
    expect((await hr.get('/api/hr/report/range.xlsx?from=2027-01-01&to=2027-03-01')).status).toBe(400);

    const { snapshot } = await require('../../src/services/hr').dailySummary('2027-02-01');
    const ins = await h.db.query(
      "INSERT INTO report_docs (kind, title, period_from, period_to, snapshot, snapshot_hash, steps, created_by, created_at) VALUES ('hr_daily', 't', ?, ?, ?, 'x', '[]', ?, NOW())",
      ['2027-02-01', '2027-02-01', JSON.stringify(snapshot), ids.hr]);
    const doc = { body: { id: ins.insertId } };
    const x = await hr.get(`/api/report-docs/${doc.body.id}/export.xlsx`).buffer(true).parse(binary).expect(200);
    expect((await readXlsx(x.body)).worksheets[0].name).toBe('รายงานประจำวัน');
    await teacher.get(`/api/report-docs/${doc.body.id}/export.xlsx`).expect(403);

    const s = await hr.get('/api/reports/summary.xlsx?from=2027-02-01&to=2027-02-02').buffer(true).parse(binary).expect(200);
    const miss = [];
    (await readXlsx(s.body)).getWorksheet('ผู้ไม่เข้าแถว').eachRow((row, n) => { if (n > 1) miss.push([row.getCell(1).value, row.getCell(2).value, row.getCell(5).value]); });
    expect(miss).toEqual([['2027-02-02', 'T2', 'ขาด'], ['2027-02-02', 'T1', 'ขาด'], ['2027-02-01', 'T2', 'ขาด']]);
  });
});
