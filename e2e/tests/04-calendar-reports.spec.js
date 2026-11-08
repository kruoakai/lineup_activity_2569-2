const { test, expect } = require('@playwright/test');
const { login, logout } = require('./helpers');

test.describe('ปฏิทินและรายงาน (งานกิจกรรม)', () => {
  test('ตั้งวันนี้เป็น "งดเข้าแถว" → ครูเช็กชื่อไม่ได้ → ลบแล้วกลับมาเช็กได้', async ({ page }) => {
    await login(page, 'AC');
    await page.goto('/calendar');
    await page.locator('.type').filter({ hasText: 'งดเข้าแถว' }).click();
    await page.getByPlaceholder('เหตุผล เช่น ฝนตก').fill('ทดสอบ E2E');
    await page.getByRole('button', { name: /^บันทึก/ }).first().click();
    await expect(page.locator('.alert.ok')).toContainText('งดเข้าแถว');
    await logout(page);

    await login(page, 'T4');
    await expect(page.locator('.phase')).toContainText('ไม่มีการเข้าแถว');
    await expect(page.locator('.phase')).toContainText('งดเข้าแถวตามปฏิทิน');
    await logout(page);

    await login(page, 'AC');
    await page.goto('/calendar');
    await page.locator('.list li').filter({ hasText: 'ทดสอบ E2E' }).getByRole('button', { name: 'ลบ' }).click();
    await expect(page.locator('.list li').filter({ hasText: 'ทดสอบ E2E' })).toHaveCount(0);
  });

  test('รายงานแสดงร้อยละรายหน่วยงานและภาพรวม และดาวน์โหลด Excel ได้', async ({ page }) => {
    await login(page, 'AC');
    await page.goto('/reports');
    await expect(page.getByRole('heading', { name: /รายหน่วยงาน/ })).toBeVisible();
    await expect(page.locator('.total-row')).toContainText('ภาพรวมทั้งวิทยาลัย');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: '⬇ Excel' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.xlsx$/);
  });
});
