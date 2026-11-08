const { test, expect } = require('@playwright/test');
const { login, logout, PASSWORD } = require('./helpers');

test.describe('เข้าสู่ระบบ / ออกจากระบบ', () => {
  test('รหัสผ่านผิดแสดงข้อความและไม่เข้าระบบ', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('รหัสพนักงาน หรืออีเมล').fill('T1');
    await page.locator('#login-pass').fill('wrong-password');
    await page.getByRole('button', { name: /เข้าสู่ระบบ$/ }).click();
    await expect(page.getByRole('alert')).toContainText('ไม่ถูกต้อง');
    await expect(page).toHaveURL(/\/login/);
  });

  test('ปุ่มรูปตาแสดง/ซ่อนรหัสผ่าน', async ({ page }) => {
    await page.goto('/login');
    const pw = page.locator('#login-pass');
    await pw.fill('secret123');
    await expect(pw).toHaveAttribute('type', 'password');
    await page.getByRole('button', { name: 'แสดงรหัสผ่าน' }).click();
    await expect(pw).toHaveAttribute('type', 'text');
    await page.getByRole('button', { name: 'ซ่อนรหัสผ่าน' }).click();
    await expect(pw).toHaveAttribute('type', 'password');
  });

  test('เข้าระบบสำเร็จ เห็นชื่อมุมขวาบน แล้วออกจากระบบได้', async ({ page }) => {
    await login(page, 'T1');
    await expect(page.locator('.who')).toContainText('ครูทดสอบ หนึ่ง');
    await logout(page);
    await page.goto('/history');
    await expect(page).toHaveURL(/\/login/);
  });

  test('ครูเปิดหน้าผู้ดูแลไม่ได้ ถูกพากลับหน้าหลัก', async ({ page }) => {
    await login(page, 'T1');
    await page.goto('/admin/settings');
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { name: 'ตั้งค่าระบบ' })).toHaveCount(0);
  });

  test('เข้าครั้งแรก: บังคับตั้งรหัสใหม่และยอมรับ PDPA', async ({ page }) => {
    await login(page, 'FR');
    await expect(page).toHaveURL(/\/setup/);
    await page.getByLabel('รหัสผ่านเริ่มต้นที่ได้รับ').fill(PASSWORD);
    // ทั้ง 3 ช่องกดแสดง/ซ่อนรหัสได้
    const eyes = page.getByRole('button', { name: 'แสดงรหัสผ่าน' });
    await expect(eyes).toHaveCount(3);
    await eyes.first().click();
    await expect(page.getByLabel('รหัสผ่านเริ่มต้นที่ได้รับ')).toHaveAttribute('type', 'text');
    await page.getByRole('button', { name: 'ซ่อนรหัสผ่าน' }).click();
    await expect(page.getByLabel('รหัสผ่านเริ่มต้นที่ได้รับ')).toHaveAttribute('type', 'password');
    await page.getByLabel('รหัสผ่านใหม่ (อย่างน้อย 8 ตัวอักษร)').fill('12345678');
    await page.getByLabel('ยืนยันรหัสผ่านใหม่').fill('12345678');
    await page.getByRole('button', { name: 'บันทึกรหัสผ่าน' }).click();
    await expect(page.getByText(/ห้ามใช้รหัสผ่านเริ่มต้น|เดาง่าย/)).toBeVisible();
    await page.getByLabel('รหัสผ่านใหม่ (อย่างน้อย 8 ตัวอักษร)').fill('E2e-Pass-2569');
    await page.getByLabel('ยืนยันรหัสผ่านใหม่').fill('E2e-Pass-2569');
    await page.getByRole('button', { name: 'บันทึกรหัสผ่าน' }).click();
    await page.getByLabel('ข้าพเจ้ารับทราบและยินยอม').check();
    await page.getByRole('button', { name: 'เริ่มใช้งาน' }).click();
    await expect(page).toHaveURL(/\/$/);
  });
});
