// ประวัติของฉัน: มุมมองปฏิทิน / รายเดือน / เวลาเช็กชื่อ
const { test, expect } = require('@playwright/test');
const { login } = require('./helpers');

const SHOT = process.env.SHOT_DIR;

test('สลับมุมมองสถิติ และจำมุมมองที่เลือกไว้', async ({ page }) => {
  await login(page, 'ST');
  await page.goto('/history');
  await expect(page.getByRole('tab', { name: /รายการ/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.list li').first()).toBeVisible();

  await page.getByRole('tab', { name: /ปฏิทิน/ }).click();
  await expect(page.locator('.cal .c.present').first()).toBeVisible();
  await expect(page.locator('.cal .c.absent').first()).toBeVisible();
  await page.locator('.cal .c.duty').first().click();
  await expect(page.locator('.cal .detail')).toContainText('ไปราชการ');
  if (SHOT) await page.screenshot({ path: `${SHOT}/st-cal.png`, fullPage: true });
  await page.locator('.cal .head button').first().click();
  await expect(page.locator('.cal .c.present').first()).toBeVisible();

  await page.getByRole('tab', { name: /รายเดือน/ }).click();
  await expect(page.locator('.mon .col').first()).toBeVisible();
  await expect(page.locator('.mon .kpi').first()).toContainText('%');
  await page.getByRole('button', { name: '3 เดือนล่าสุด' }).click();
  await expect(page.locator('.mon .tbl tbody tr').first()).toBeVisible();
  if (SHOT) await page.screenshot({ path: `${SHOT}/st-mon.png`, fullPage: true });

  await page.getByRole('tab', { name: /เวลาเช็กชื่อ/ }).click();
  await expect(page.locator('.tim .brow').first()).toBeVisible();
  await expect(page.locator('.tim .streak b').first()).not.toHaveText('');
  if (SHOT) await page.screenshot({ path: `${SHOT}/st-time.png`, fullPage: true });

  await page.reload();
  await expect(page.getByRole('tab', { name: /เวลาเช็กชื่อ/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.tim .brow').first()).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('tab', { name: /รายเดือน/ }).click();
  await expect(page.locator('.mon .col').first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow).toBe(false);
  if (SHOT) await page.screenshot({ path: `${SHOT}/st-mon-mobile.png`, fullPage: true });
  await page.getByRole('tab', { name: /ปฏิทิน/ }).click();
  if (SHOT) await page.screenshot({ path: `${SHOT}/st-cal-mobile.png`, fullPage: true });
});
