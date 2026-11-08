// ทดสอบบนหน้าจอมือถือ (Pixel 7): ทุกหน้าหลักต้องไม่เลื่อนซ้าย-ขวา และปุ่มหลักอยู่ในจอ
const { test, expect } = require('@playwright/test');
const { login } = require('./helpers');

const noHorizontalScroll = async (page) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
};

test('หน้าเข้าสู่ระบบบนมือถือ', async ({ page }) => {
  await page.goto('/login');
  await noHorizontalScroll(page);
  await expect(page.getByRole('button', { name: /เข้าสู่ระบบ$/ })).toBeInViewport();
});

for (const [code, paths] of [
  ['T1', ['/', '/history', '/more', '/profile']],
  ['AC', ['/roster', '/reports', '/calendar', '/report-docs', '/executive']],
  ['AD', ['/admin/users', '/admin/settings', '/admin/backups', '/admin/data']],
]) {
  test(`${code}: หน้าหลักไม่ล้นจอ`, async ({ page }) => {
    await login(page, code);
    for (const p of paths) {
      await page.goto(p);
      await page.waitForLoadState('networkidle');
      await noHorizontalScroll(page);
      await expect(page.locator('.bottomnav')).toBeVisible();
    }
  });
}

test('เมนูเพิ่มเติมเป็นปุ่ม ไม่มีขีดเส้นใต้', async ({ page }) => {
  await login(page, 'AD');
  await page.goto('/more');
  await expect(page.locator('.tile', { hasText: 'ตั้งค่าการเช็กชื่อ' })).toBeVisible();
  const deco = await page.locator('.tile').first().evaluate((el) => getComputedStyle(el).textDecorationLine);
  expect(deco).toBe('none');
  await page.locator('.tile', { hasText: 'ตั้งค่าการเช็กชื่อ' }).click();
  await expect(page).toHaveURL(/\/admin\/settings/);
});
