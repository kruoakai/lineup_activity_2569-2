const { test, expect } = require('@playwright/test');
const { login, logout, confirmPassword } = require('./helpers');

async function drawSignature(page) {
  const canvas = page.locator('.sigpad canvas').first();
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + 20, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 10; i += 1) await page.mouse.move(box.x + 20 + i * 15, box.y + box.height / 2 + (i % 2 ? 12 : -12));
  await page.mouse.up();
}

test.describe('เอกสารเสนอลงนาม', () => {
  test('ผู้บริหารไม่มีฟอร์มสร้างเอกสาร', async ({ page }) => {
    await login(page, 'S3');
    await page.goto('/report-docs');
    await expect(page.getByRole('heading', { name: 'สร้างเอกสารใหม่' })).toHaveCount(0);
  });

  test('งานกิจกรรมสร้าง → ลำดับ 1 ลงนาม → เอกสารไปลำดับ 2', async ({ page }) => {
    await login(page, 'AC');
    await page.goto('/report-docs');
    await page.getByLabel('ชื่อเอกสาร (เว้นว่างได้)').fill('เอกสารทดสอบ E2E');
    await page.getByRole('button', { name: 'สร้างและส่งลงนาม' }).click();
    await expect(page.getByText('เอกสารทดสอบ E2E').first()).toBeVisible();
    await logout(page);

    await login(page, 'S1');
    await expect(page.locator('.sign-banner')).toContainText('มีเอกสารรอท่านลงนาม 1 ฉบับ');
    await page.locator('.sign-banner').click();
    await page.getByText('เอกสารทดสอบ E2E').first().click();
    await expect(page.locator('.step.now')).toContainText('ถึงลำดับของท่าน');
    const useSaved = page.getByLabel('ใช้ลายเซ็นที่บันทึกไว้ในโปรไฟล์');
    if (await useSaved.count()) await useSaved.uncheck();
    await drawSignature(page);
    await page.getByRole('button', { name: '✍ ลงนาม' }).click();
    await confirmPassword(page);
    await expect(page.locator('.alert.ok')).toContainText('ลงนามแล้ว');
    await expect(page.locator('.step.done')).toHaveCount(1);
    await expect(page.locator('.step.now')).toContainText('ผู้ลงนามสอง');
  });
});
