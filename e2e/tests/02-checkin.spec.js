const { test, expect } = require('@playwright/test');
const { login } = require('./helpers');

test.describe('เช็กชื่อเข้าแถว (โหมดกดปุ่มอย่างเดียว)', () => {
  test('ครูกดเช็กชื่อ ได้ "มาเข้าแถว" และไม่ซ้ำเมื่อโหลดใหม่', async ({ page }) => {
    await login(page, 'T3');
    await expect(page.locator('.phase')).toContainText('เปิดเช็กชื่อ');
    await page.locator('button.checkin').click();
    const result = page.locator('section.result');
    await expect(result).toContainText('มาเข้าแถว');
    await expect(result).toContainText('เช็กเอง (กดปุ่ม)');
    await page.reload();
    await expect(page.locator('section.result')).toContainText('มาเข้าแถว');
    await expect(page.locator('button.checkin')).toHaveCount(0);
  });

  test('ประวัติแสดงรายการวันนี้', async ({ page }) => {
    await login(page, 'T3');
    await page.goto('/history');
    await expect(page.getByText('มาเข้าแถว').first()).toBeVisible();
  });
});
