// คู่มือการใช้งานบนเว็บ: เปิดได้โดยไม่ต้องเข้าสู่ระบบ · คู่มือตามบทบาทขึ้นก่อน · สารบัญ · PDF · มือถือไม่ล้นจอ
const { test, expect } = require('@playwright/test');
const { login } = require('./helpers');

const SHOT = process.env.SHOT_DIR;

test('ยังไม่เข้าสู่ระบบ: ลิงก์จากหน้าเข้าสู่ระบบ → รายการคู่มือ → อ่านพร้อมสารบัญ', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('link', { name: /คู่มือการใช้งาน/ }).click();
  await expect(page).toHaveURL(/\/manuals$/);
  await expect(page.locator('.mcard')).toHaveCount(7);
  await page.locator('.mcard', { hasText: 'ครูและบุคลากร' }).getByRole('link', { name: /อ่าน/ }).click();
  await expect(page).toHaveURL(/\/manuals\/teacher$/);
  await expect(page.locator('.manual h1')).toHaveText('คู่มือครูและบุคลากร');
  await expect(page.locator('.toc li').first()).toContainText('เริ่มต้นใช้งาน');
  await expect(page.locator('.body')).toContainText('เช็กชื่อเข้าแถว');
  const pdf = await page.request.get('/manuals/teacher.pdf');
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()['content-type']).toContain('pdf');
  await page.goto('/manuals/no-such');
  await expect(page.locator('.alert.bad')).toContainText('ไม่พบคู่มือนี้');
});

test('เข้าสู่ระบบแล้ว: คู่มือของบทบาทตนขึ้นก่อน และเปิดจากเมนูเพิ่มเติมได้', async ({ page }) => {
  await login(page, 'HR');
  await page.goto('/more');
  await page.locator('.tile', { hasText: 'คู่มือการใช้งาน' }).click();
  await expect(page).toHaveURL(/\/manuals$/);
  const mine = page.locator('.mcard.hl');
  await expect(mine).toHaveCount(2);
  await expect(mine.nth(0)).toContainText('ครูและบุคลากร');
  await expect(mine.nth(1)).toContainText('เจ้าหน้าที่บุคลากร');
  await expect(page.locator('.bottomnav')).toBeVisible();
});

test('มือถือ: อ่านคู่มือไม่ต้องเลื่อนซ้ายขวา (ตารางเลื่อนในกรอบ)', async ({ browser }, info) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, baseURL: info.project.use.baseURL });
  const page = await ctx.newPage();
  await page.goto('/manuals/hr');
  await expect(page.locator('.body table').first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow).toBe(false);
  if (SHOT) await page.screenshot({ path: `${SHOT}/manual-mobile.png` });
  await ctx.close();
});
