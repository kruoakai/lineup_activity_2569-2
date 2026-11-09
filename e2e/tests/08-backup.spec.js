const { test, expect } = require('@playwright/test');
const { login, confirmPassword } = require('./helpers');

test.describe('สำรองข้อมูล', () => {
  test('เจ้าหน้าที่บุคลากรดาวน์โหลด Excel งานของตนเอง', async ({ page }) => {
    await login(page, 'HR');
    await page.goto('/more');
    await page.locator('.tile', { hasText: 'สำรองข้อมูลงานของฉัน' }).click();
    await expect(page.locator('.sheets')).toContainText('มาสาย-ไม่ลงเวลากลับ');
    await page.getByRole('button', { name: 'เดือนที่แล้ว' }).click();
    const [dl] = await Promise.all([page.waitForEvent('download'), (async () => {
      await page.getByRole('button', { name: /ดาวน์โหลด Excel/ }).click();
      await confirmPassword(page);
    })()]);
    expect(dl.suggestedFilename()).toMatch(/^สำรองข้อมูลงาน-HR-.*\.xlsx$/);
  });

  test('ครูทั่วไปไม่มีเมนูสำรองข้อมูล / ผู้ดูแลเห็นหน้ากู้คืนระบบ', async ({ page }) => {
    await login(page, 'T1');
    await page.goto('/more');
    await expect(page.locator('.tile', { hasText: 'สำรองข้อมูลงานของฉัน' })).toHaveCount(0);
    await page.goto('/admin/backups');
    await expect(page).not.toHaveURL(/admin\/backups/);
  });

  test('ผู้ดูแล: ปุ่มกู้คืนเปิดเมื่อเลือกไฟล์และพิมพ์ยืนยันครบ', async ({ page }) => {
    await login(page, 'AD');
    await page.goto('/admin/backups');
    await expect(page.getByRole('heading', { name: '3 กู้คืนระบบ' })).toBeVisible();
    const btn = page.getByRole('button', { name: '⚠ กู้คืนระบบ' });
    await expect(btn).toBeDisabled();
    await page.getByRole('tab', { name: 'อัปโหลดไฟล์จากเครื่อง' }).click();
    await page.locator('.drop input[type=file]').setInputFiles({ name: 'bad.tar', mimeType: 'application/x-tar', buffer: Buffer.from('not a backup') });
    await expect(page.locator('.alert.bad')).toContainText('รองรับเฉพาะไฟล์');
    await page.getByLabel(/พิมพ์คำว่า/).fill('กู้คืนระบบ');
    await expect(btn).toBeDisabled();
  });
});
