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

async function signAs(page, code) {
  await login(page, code);
  await page.locator('.sign-banner').click();
  await page.getByText('สรุปการปฏิบัติงาน').first().click();
  await expect(page.locator('.step.now')).toContainText('ถึงลำดับของท่าน');
  const useSaved = page.getByLabel('ใช้ลายเซ็นที่บันทึกไว้ในโปรไฟล์');
  if (await useSaved.count()) await useSaved.uncheck();
  await drawSignature(page);
}

// วันก่อนหน้า (ปิดเช็กชื่อแล้ว) ตามเวลาไทย
const yesterday = () => new Date(Date.now() + 7 * 3600_000 - 86400_000).toISOString().slice(0, 10);

test.describe('รายงานสรุปการปฏิบัติงานประจำวัน (งานบุคลากร)', () => {
  test('ผู้บริหารและงานกิจกรรมไม่มีฟอร์มสร้างเอกสาร', async ({ page }) => {
    await login(page, 'S3');
    await page.goto('/report-docs');
    await expect(page.getByRole('heading', { name: /สร้างรายงานสรุป/ })).toHaveCount(0);
    await logout(page);
    await login(page, 'AC');
    await page.goto('/report-docs');
    await expect(page.getByRole('heading', { name: /สร้างรายงานสรุป/ })).toHaveCount(0);
  });

  test('บุคลากรบันทึกลาป่วย + มาสาย → สร้าง → ลงนาม 3 ลำดับ ผู้อำนวยการเลือก ทราบ/มอบ', async ({ page }) => {
    await login(page, 'HR');
    await page.goto('/more');
    await page.locator('.tile', { hasText: 'งานบุคลากรประจำวัน' }).click();
    await expect(page).toHaveURL(/\/hr$/);
    await page.locator('.dpick input').fill(yesterday());
    await expect(page.locator('.plist li', { hasText: 'ครูทดสอบ สอง' })).toBeVisible();

    await page.locator('.plist li', { hasText: 'ครูทดสอบ สอง' }).click();
    await page.locator('.selbar').getByRole('button', { name: /ตั้งสถานะ/ }).click();
    await page.locator('.actionbar').getByRole('button', { name: 'ลาป่วย' }).click();
    await page.locator('.actionbar').getByRole('button', { name: /^บันทึก/ }).click();
    await expect(page.locator('.alert.ok')).toContainText('บันทึก "ลาป่วย" ให้ 1 คน');
    await expect(page.locator('.plist li', { hasText: 'ครูทดสอบ สอง' })).toContainText('ลาป่วย');

    await page.getByRole('tab', { name: /มาสาย/ }).click();
    await page.locator('.plist li', { hasText: 'ครูทดสอบ สาม' }).getByRole('button', { name: 'มาสาย' }).click();
    await page.getByRole('button', { name: /บันทึก \(มาสาย 1/ }).click();
    await expect(page.locator('.alert.ok')).toContainText('มาสาย 1 คน');

    await page.getByRole('button', { name: 'สร้างและส่งลงนาม' }).click();
    await expect(page).toHaveURL(/\/report-docs\/\d+/);
    const paper = page.locator('.paper');
    await expect(paper).toContainText('สรุปการปฏิบัติงานของข้าราชการครู และบุคลากรทางการศึกษา');
    await expect(paper.locator('.sec', { hasText: '3. ลา' })).toContainText('ครูทดสอบ สอง');
    await expect(paper.locator('.sec', { hasText: '6. ผู้มาลงเวลาเกินเวลากำหนด' })).toContainText('ครูทดสอบ สาม');
    await logout(page);

    await signAs(page, 'S1');
    await page.getByRole('button', { name: '✍ ลงนาม' }).click();
    await confirmPassword(page);
    await expect(page.locator('.step.done')).toHaveCount(1);
    await logout(page);

    await signAs(page, 'S2');
    await page.getByRole('button', { name: '✍ ลงนาม' }).click();
    await confirmPassword(page);
    await expect(page.locator('.step.done')).toHaveCount(2);
    await logout(page);

    await signAs(page, 'S3');
    await expect(page.locator('fieldset.decision')).toBeVisible();
    await page.locator('fieldset.decision').getByLabel('มอบ').check();
    await page.getByRole('button', { name: '✍ ลงนาม' }).click();
    await confirmPassword(page);
    await expect(page.locator('.alert.ok')).toContainText('ลงนามแล้ว');
    await expect(page.locator('.boss')).toContainText('☑ ทราบ');
    await expect(page.locator('.boss')).toContainText('☑ มอบ/หน.งานบริหารและพัฒนาทรัพยากรบุคคล');
  });
});
