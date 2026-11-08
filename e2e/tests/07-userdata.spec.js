const { test, expect } = require('@playwright/test');
const ExcelJS = require('../../backend/node_modules/exceljs');
const { login, confirmPassword } = require('./helpers');

async function filledTemplate(buf) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.getWorksheet('รายชื่อบุคลากร');
  ws.addRow(['E2E01', 'ครูนำเข้า หนึ่ง', 'e2e01@test.local', '', 'แผนกทดสอบ ก', 'ครู', 'บุคลากร', 'ใช่', 'ใช้งาน']);
  ws.addRow(['E2E02', 'ครูนำเข้า สอง', '', 'ฝ่ายใหม่', 'แผนกนำเข้าใหม่', '', 'หัวหน้าแผนก', '', '']);
  ws.addRow(['E2E03', '', '', '', 'แผนกทดสอบ ก', '', '', '', '']);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

test.describe('นำเข้า/ส่งออกผู้ใช้ และ API', () => {
  test('ดาวน์โหลดแม่แบบ → กรอก → อัปโหลด → ตรวจผล → บันทึก → คนใหม่เข้าระบบได้', async ({ page }) => {
    await login(page, 'AD');
    await page.goto('/more');
    await page.locator('.tile', { hasText: 'นำเข้า/ส่งออกผู้ใช้' }).click();
    await expect(page).toHaveURL(/\/admin\/user-data/);

    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /แม่แบบ \.xlsx/ }).click()]);
    expect(dl.suggestedFilename()).toMatch(/\.xlsx$/);
    const buf = await filledTemplate(await require('fs').promises.readFile(await dl.path()));

    await page.locator('.drop input[type=file]').setInputFiles({ name: 'รายชื่อ.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: buf });
    await expect(page.locator('.sum .s.new b')).toHaveText('2');
    await expect(page.locator('.sum .s.err b')).toHaveText('1');
    await expect(page.getByText('แผนกนำเข้าใหม่').first()).toBeVisible();
    await page.locator('.sum .s.err').click();
    await expect(page.locator('tr.error')).toContainText('ต้องมีชื่อ-สกุล');

    await page.getByRole('button', { name: /บันทึก 2 รายการ/ }).click();
    await confirmPassword(page);
    await expect(page.locator('.alert.ok')).toContainText('สร้างใหม่ 2 คน');

    // ส่งออก
    const [ex] = await Promise.all([page.waitForEvent('download'), (async () => {
      await page.getByRole('button', { name: /ส่งออก \.xlsx/ }).click();
      await confirmPassword(page);
    })()]);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await require('fs').promises.readFile(await ex.path()));
    const codes = [];
    wb.getWorksheet('รายชื่อบุคลากร').eachRow((r, n) => { if (n > 1) codes.push(String(r.getCell(1).value)); });
    expect(codes).toEqual(expect.arrayContaining(['E2E01', 'E2E02', 'T1']));
  });

  test('สร้างกุญแจ API → แสดงครั้งเดียว → ใช้เรียก API ได้ → ยกเลิกแล้วใช้ไม่ได้', async ({ page, request }) => {
    await login(page, 'AD');
    await page.goto('/admin/user-data');
    await page.getByRole('tab', { name: /API/ }).click();
    await page.getByLabel('ชื่อระบบที่จะเชื่อมต่อ').fill('ระบบทดสอบ E2E');
    await page.getByRole('button', { name: /สร้างกุญแจ/ }).click();
    await confirmPassword(page);
    const key = (await page.locator('code.key').textContent()).trim();
    expect(key).toMatch(/^lu_/);

    const me = await request.get('/api/ext/v1/users?limit=1', { headers: { Authorization: `Bearer ${key}` } });
    expect(me.status()).toBe(200);
    expect((await me.json()).items).toHaveLength(1);

    await page.getByRole('button', { name: 'เก็บเรียบร้อยแล้ว ปิด' }).click();
    await expect(page.locator('code.key')).toHaveCount(0);
    page.once('dialog', (d) => d.accept());
    await page.locator('.list li', { hasText: 'ระบบทดสอบ E2E' }).getByRole('button', { name: 'ยกเลิก' }).click();
    await expect(page.locator('.list li', { hasText: 'ระบบทดสอบ E2E' })).toContainText('ยกเลิกแล้ว');
    expect((await request.get('/api/ext/v1/me', { headers: { Authorization: `Bearer ${key}` } })).status()).toBe(401);
  });
});
