// อัปโหลดรูปถ่ายลายเซ็นบนกระดาษ (มือถือความละเอียดสูง): พื้นหลังโปร่งใส ขนาดไม่เกินที่เซิร์ฟเวอร์รับ บันทึกได้
const path = require('path');
const { test, expect } = require('@playwright/test');
const { login, confirmPassword } = require('./helpers');

const PHOTO = path.join(__dirname, '..', 'fixtures', 'signature-photo.jpg');

test('อัปโหลดรูปถ่ายลายเซ็นจากมือถือแล้วบันทึกได้', async ({ browser }, info) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, baseURL: info.project.use.baseURL });
  const page = await ctx.newPage();
  await login(page, 'T2');
  await page.goto('/profile');
  await page.locator('.sigpad input[type=file]').setInputFiles(PHOTO);
  await expect(page.locator('.sigpad')).toContainText('ปรับพื้นหลังให้โปร่งใสแล้ว');
  // พื้นหลังกระดาษถูกลบ: มุมซ้ายบนของกรอบโปร่งใส
  const alpha = await page.locator('.sigpad canvas').evaluate((c) => c.getContext('2d').getImageData(4, 4, 1, 1).data[3]);
  expect(alpha).toBe(0);
  const res = page.waitForResponse((r) => r.url().endsWith('/api/profile/signature') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'บันทึกลายเซ็น' }).click();
  await confirmPassword(page);
  expect((await res).status()).toBe(200);
  await expect(page.locator('.alert.ok')).toContainText('บันทึกลายเซ็นแล้ว');
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/sig-after.png`, fullPage: true });
  await ctx.close();
});

test('ไฟล์ที่ไม่ใช่รูป แจ้งเตือนชัดเจน', async ({ page }) => {
  await login(page, 'T2');
  await page.goto('/profile');
  await page.locator('.sigpad input[type=file]').setInputFiles({ name: 'sig.heic', mimeType: 'image/heic', buffer: Buffer.from('not an image') });
  await expect(page.locator('.sigpad .bad')).toContainText('เปิดไฟล์รูปนี้ไม่ได้');
});
