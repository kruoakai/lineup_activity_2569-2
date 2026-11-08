const { test, expect } = require('@playwright/test');
const { login, logout, JPEG_1PX } = require('./helpers');

test.describe('ตัวแทนเช็กชื่อและเช็กแบบกลุ่ม', () => {
  test('ครูทั่วไปไม่มีเมนูรายชื่อ', async ({ page }) => {
    await login(page, 'T1');
    await expect(page.locator('.bottomnav')).not.toContainText('รายชื่อ');
  });

  test('ผู้ดูแลติ๊ก "เช็กแทน" → ครูเช็กแบบกลุ่มพร้อมรูปรวมได้', async ({ page }) => {
    await login(page, 'AD');
    await page.goto('/admin/users');
    const row = page.locator('.list li').filter({ hasText: 'ครูทดสอบ หนึ่ง' });
    await row.locator('label.proxy input').check();
    await expect(page.locator('.alert.ok')).toContainText('เป็นตัวแทนเช็กชื่อ');
    await logout(page);

    await login(page, 'T1');
    await page.locator('.bottomnav').getByText('รายชื่อ').click();
    await expect(page).toHaveURL(/\/roster/);
    await expect(page.locator('.list')).not.toContainText('ครูต่างแผนก'); // เห็นเฉพาะแผนกตัวเอง
    await page.getByRole('button', { name: /เช็กชื่อแบบกลุ่ม/ }).click();
    const modal = page.locator('.modal');
    await modal.locator('input[type=file]').setInputFiles({ name: 'group.jpg', mimeType: 'image/jpeg', buffer: JPEG_1PX });
    await expect(modal.locator('.thumb')).toHaveCount(1);
    await modal.getByRole('button', { name: /บันทึก "มาเข้าแถว"/ }).click();
    await expect(page.locator('.alert.ok')).toContainText('พร้อมรูปรวม');
    await expect(page.locator('.list li').filter({ hasText: 'ครูทดสอบ สอง' })).toContainText('มาเข้าแถว');
  });

  test('เจ้าตัวเปิดหน้าเช็กชื่อเห็นว่าใครเช็กแทน', async ({ page }) => {
    await login(page, 'T2');
    await expect(page.locator('section.result')).toContainText('เช็กแทนโดย ครูทดสอบ หนึ่ง');
  });
});
