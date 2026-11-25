// ภาพจำลองการเข้าแถว: เฉพาะผู้ดูแลระบบ · เล่นซ้ำสถานการณ์ได้ · ทดลองกฎด้วยค่าจริง
const { test, expect } = require('@playwright/test');
const { login, logout } = require('./helpers');

const SHOT = process.env.SHOT_DIR;

test('ผู้ดูแลเปิดภาพจำลอง เล่นซ้ำ และทดลองกฎ · ครูเปิดไม่ได้', async ({ page }) => {
  await login(page, 'AD');
  await page.goto('/more');
  await page.getByRole('link', { name: /ภาพจำลองการเข้าแถว/ }).click();
  await expect(page).toHaveURL(/\/admin\/simulation/);
  await expect(page.getByRole('heading', { name: 'ภาพจำลองการเข้าแถว' })).toBeVisible();
  // เลื่อนไปท้ายวัน → ตัวเลขตรงกับรายงานของระบบ
  await page.getByLabel('เลื่อนเวลา').fill(String(6300));
  await expect(page.locator('.okline')).toContainText('ตรงกับรายงานของระบบ');
  await expect(page.locator('.scene .pp').first()).toBeVisible();
  if (SHOT) await page.screenshot({ path: `${SHOT}/sim-replay.png`, fullPage: true });
  // สถานการณ์เน็ตล่ม
  await page.getByRole('tab', { name: /เน็ตล่ม/ }).click();
  await page.getByLabel('เลื่อนเวลา').fill(String(3500));
  await expect(page.locator('.net-banner')).toBeVisible();

  await page.getByRole('tab', { name: 'ทดลองกฎด้วยค่าจริง' }).click();
  const rows = page.locator('.plist li');
  // เซิร์ฟเวอร์ทดสอบตั้งค่า "กดปุ่มอย่างเดียว" → ทุกคนผ่าน · ลองเปลี่ยนเป็น GPS หรือ QR (ไม่บันทึกลงระบบ)
  await expect(rows.nth(2).locator('.res')).toHaveText('ผ่าน');
  await page.getByLabel('วิธีเช็กชื่อ').selectOption('gps_or_qr');
  await expect(rows.nth(0).locator('.res')).toHaveText('ผ่าน');
  await expect(rows.nth(2).locator('.res')).toHaveText('ไม่ผ่าน'); // ร่มไม้ นอกพื้นที่
  await page.getByRole('button', { name: 'เริ่มทดลอง' }).click();
  await expect(page.locator('.cmp tbody tr').first()).toBeVisible();
  if (SHOT) await page.screenshot({ path: `${SHOT}/sim-rules.png`, fullPage: true });
  await logout(page);

  await login(page, 'T1');
  await page.goto('/admin/simulation');
  await expect(page).not.toHaveURL(/simulation/);
});
