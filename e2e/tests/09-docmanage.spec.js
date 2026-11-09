// จัดการเอกสารเสนอลงนาม (แก้ไข / ลบ) และช่องรายละเอียดที่จำเป็นในงานบุคลากร
const { test, expect } = require('@playwright/test');
const { login, confirmPassword } = require('./helpers');

const yesterday = () => new Date(Date.now() + 7 * 3600_000 - 2 * 86400_000).toISOString().slice(0, 10);
const SHOT = process.env.SHOT_DIR;

test('ไปราชการต้องกรอกรายละเอียด · รายการเอกสารกดเปิดได้ แก้ชื่อ และลบ', async ({ page }) => {
  await login(page, 'HR');
  await page.goto('/hr');
  await page.locator('.dpick input').fill(yesterday());
  await page.locator('.plist li', { hasText: 'ครูทดสอบ หนึ่ง' }).click();
  await page.locator('.selbar').getByRole('button', { name: /ตั้งสถานะ/ }).click();
  const bar = page.locator('.actionbar');
  await bar.getByRole('button', { name: 'ไปราชการ' }).click();
  await expect(bar.locator('.need-msg')).toBeVisible();
  await expect(bar.getByRole('button', { name: 'กรอกรายละเอียดก่อนบันทึก' })).toBeDisabled();
  await expect(bar.locator('input[required]')).toBeFocused();
  if (SHOT) await page.screenshot({ path: `${SHOT}/need-note.png` });
  await bar.locator('input[required]').fill('ประชุมที่ สอศ.');
  await bar.getByRole('button', { name: /^บันทึก "ไปราชการ"/ }).click();
  await expect(page.locator('.alert.ok')).toContainText('ไปราชการ');

  // เช็กชื่อแทน (มือถือเสีย)
  await page.locator('.plist li', { hasText: 'ครูทดสอบ สาม' }).click();
  await page.locator('.selbar').getByRole('button', { name: /ตั้งสถานะ/ }).click();
  await bar.getByRole('button', { name: 'มา (เช็กชื่อแทน)' }).click();
  await bar.locator('input').last().fill('มือถือเสีย');
  await bar.getByRole('button', { name: /^บันทึก "มา/ }).click();
  await expect(page.locator('.plist li', { hasText: 'ครูทดสอบ สาม' })).toContainText('มา');

  await page.getByRole('button', { name: 'สร้างและส่งลงนาม' }).click();
  await expect(page).toHaveURL(/\/report-docs\/\d+/);
  await page.getByRole('link', { name: '‹ รายการ' }).click();
  const row = page.locator('.doc').first();
  await expect(row.locator('.go')).toContainText('เปิดดู');
  if (SHOT) await page.screenshot({ path: `${SHOT}/doc-list.png`, fullPage: true });

  await row.getByRole('link', { name: /แก้ไข/ }).click();
  await expect(page.locator('#manage')).toBeVisible();
  await page.locator('#manage input').fill('รายงานทดสอบแก้ชื่อ');
  await page.getByRole('button', { name: /บันทึกชื่อเอกสาร/ }).click();
  await expect(page.locator('.alert.ok')).toContainText('บันทึกชื่อเอกสารแล้ว');
  if (SHOT) await page.screenshot({ path: `${SHOT}/doc-manage.png`, fullPage: true });

  await page.getByRole('button', { name: /ลบเอกสารนี้/ }).click();
  await confirmPassword(page);
  await expect(page).toHaveURL(/\/report-docs$/);
  await expect(page.locator('.doc', { hasText: 'รายงานทดสอบแก้ชื่อ' })).toHaveCount(0);
});
