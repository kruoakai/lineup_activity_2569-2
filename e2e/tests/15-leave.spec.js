// ครูแจ้งลา/ไปราชการเอง → เจ้าหน้าที่บุคลากรเห็นกล่องเตือน → ตรวจ → บันทึกลงรายงาน · ครูเห็นสถานะ
const { test, expect } = require('@playwright/test');
const { login, logout } = require('./helpers');

const SHOT = process.env.SHOT_DIR;
// วันทำงานถัดไปประมาณ 1 สัปดาห์ข้างหน้า (ไม่ชนกับการทดสอบอื่น)
function nextWorkDay(offset) {
  const d = new Date(Date.now() + 7 * 3600_000 + offset * 86400_000);
  while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

test('แจ้งไปราชการเอง → เจ้าหน้าที่บุคลากรบันทึก → ครูเห็น "บันทึกแล้ว"', async ({ page }) => {
  const day = nextWorkDay(8);
  await login(page, 'T4');
  await page.locator('.leave-tile').click();
  await expect(page).toHaveURL(/\/leave$/);
  await page.getByRole('radio', { name: /ไปราชการ/ }).click();
  await page.getByLabel('ตั้งแต่วันที่').fill(day);
  await page.getByLabel('ถึงวันที่').fill(day);
  const send = page.getByRole('button', { name: 'ส่งให้เจ้าหน้าที่บุคลากรตรวจ' });
  await expect(send).toBeDisabled(); // ไปราชการต้องมีรายละเอียด
  await page.getByLabel(/รายละเอียด/).fill('อบรมที่ สอศ. ตามคำสั่งที่ 99/2569');
  if (SHOT) await page.screenshot({ path: `${SHOT}/leave-form.png`, fullPage: true });
  await send.click();
  await expect(page.locator('.alert.ok')).toContainText('รอเจ้าหน้าที่บุคลากรตรวจ');
  await expect(page.locator('.req').first()).toContainText('รอตรวจ');
  await logout(page);

  await login(page, 'HR');
  await page.locator('.leave-banner').click();
  await expect(page).toHaveURL(/\/hr\?tab=leave/);
  const item = page.locator('.it', { hasText: 'ครูต่างแผนก' });
  await expect(item).toContainText('อบรมที่ สอศ.');
  if (SHOT) await page.screenshot({ path: `${SHOT}/leave-review.png`, fullPage: true });
  await item.getByRole('button', { name: /บันทึกลงรายงาน/ }).click();
  await expect(page.locator('.review .alert.ok')).toContainText('บันทึกไปราชการของ ครูต่างแผนก แล้ว 1 วันทำงาน');
  await page.getByRole('tab', { name: /ลา \/ ราชการ/ }).click();
  await page.locator('.dpick input').fill(day);
  await expect(page.locator('.plist li', { hasText: 'ครูต่างแผนก' })).toContainText('ไปราชการ');
  await logout(page);

  await login(page, 'T4');
  await page.goto('/leave');
  await expect(page.locator('.req').first()).toContainText('บันทึกแล้ว');
});

test('มือถือ: หน้าแจ้งลาไม่ล้นจอ', async ({ browser }, info) => {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, baseURL: info.project.use.baseURL });
  const page = await ctx.newPage();
  await login(page, 'T3');
  await page.goto('/leave');
  await expect(page.getByRole('radio', { name: /ลาป่วย/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)).toBe(false);
  if (SHOT) await page.screenshot({ path: `${SHOT}/leave-mobile.png`, fullPage: true });
  await ctx.close();
});
