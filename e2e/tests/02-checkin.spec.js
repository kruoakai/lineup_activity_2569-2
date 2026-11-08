const { test, expect } = require('@playwright/test');
const { login } = require('./helpers');

test.describe('เช็กชื่อเข้าแถว (โหมดกดปุ่มอย่างเดียว)', () => {
  test('ครูกดเช็กชื่อ ได้ "มาเข้าแถว" และไม่ซ้ำเมื่อโหลดใหม่', async ({ page }) => {
    await login(page, 'T3');
    await expect(page.locator('.phase')).toContainText('เปิดเช็กชื่อ');
    // ปุ่มสแกน QR และปุ่มแนบรูป (กดแล้วแสดงช่องเลือกรูป)
    await expect(page.getByRole('button', { name: /สแกน QR/ })).toBeVisible();
    const attach = page.getByRole('button', { name: /แนบรูป/ });
    await expect(attach).toHaveAttribute('aria-expanded', 'false');
    await attach.click();
    await expect(attach).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.photos-opt')).toBeVisible();
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
