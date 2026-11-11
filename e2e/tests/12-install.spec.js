// ปุ่มติดตั้งแอปบนมือถือ: Android กดติดตั้ง · iPhone แสดงขั้นตอน · LINE ให้เปิดในเบราว์เซอร์ · คอมพิวเตอร์ไม่แสดงแถบ
const { test, expect } = require('@playwright/test');
const { login } = require('./helpers');

const UA = {
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
  ios: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  line: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.10.0',
};
const SHOT = process.env.SHOT_DIR;

async function phone(browser, info, ua) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: ua, isMobile: true, hasTouch: true, baseURL: info.project.use.baseURL });
  return { ctx, page: await ctx.newPage() };
}

// จำลองเหตุการณ์ที่ Chrome ส่งเมื่อแอปติดตั้งได้
const FAKE_PROMPT = () => {
  const e = new Event('beforeinstallprompt');
  e.prompt = () => { window.__prompted = true; };
  e.userChoice = Promise.resolve({ outcome: 'accepted' });
  window.dispatchEvent(e);
};

test('Android: แถบหน้าแรก กดติดตั้ง แล้วขึ้นว่าติดตั้งแล้ว', async ({ browser }, info) => {
  const { ctx, page } = await phone(browser, info, UA.android);
  await login(page, 'T3');
  await expect(page.locator('.install.banner')).toContainText('เมนู ⋮');
  await page.evaluate(FAKE_PROMPT);
  const btn = page.locator('.install.banner').getByRole('button', { name: '📲 ติดตั้งแอป' });
  await expect(btn).toBeVisible();
  if (SHOT) await page.screenshot({ path: `${SHOT}/install-android.png` });
  await btn.click();
  expect(await page.evaluate(() => window.__prompted)).toBe(true);
  await expect(page.locator('.install.banner')).toHaveCount(0);
  await page.getByRole('link', { name: /เพิ่มเติม/ }).click(); // เปลี่ยนหน้าในแอป (ไม่โหลดใหม่)
  await expect(page.locator('.install.card')).toContainText('ติดตั้งแอปแล้ว');
  await ctx.close();
});

test('iPhone: แสดงขั้นตอนเพิ่มไปยังหน้าจอโฮม และ "ไว้ทีหลัง" ซ่อนแถบ', async ({ browser }, info) => {
  const { ctx, page } = await phone(browser, info, UA.ios);
  await login(page, 'T3');
  const banner = page.locator('.install.banner');
  await expect(banner).toContainText('เพิ่มไปยังหน้าจอโฮม');
  if (SHOT) await page.screenshot({ path: `${SHOT}/install-ios.png` });
  await banner.getByRole('button', { name: 'ไว้ทีหลัง' }).click();
  await expect(banner).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.hero')).toBeVisible();
  await expect(page.locator('.install.banner')).toHaveCount(0);
  // หน้าเพิ่มเติมยังมีคำแนะนำเสมอ
  await page.goto('/more');
  await expect(page.locator('.install.card')).toContainText('เพิ่มไปยังหน้าจอโฮม');
  await ctx.close();
});

test('เปิดจากแอป LINE: แนะนำให้เปิดในเบราว์เซอร์', async ({ browser }, info) => {
  const { ctx, page } = await phone(browser, info, UA.line);
  await login(page, 'T3');
  await expect(page.locator('.install.banner')).toContainText('เปิดในเบราว์เซอร์');
  await ctx.close();
});

test('คอมพิวเตอร์: ไม่แสดงแถบชวนติดตั้งบนหน้าแรก', async ({ page }) => {
  await login(page, 'T3');
  await expect(page.locator('.hero')).toBeVisible();
  await expect(page.locator('.install.banner')).toHaveCount(0);
});

test('หน้าเข้าสู่ระบบบนมือถือ: เห็นปุ่ม/ขั้นตอนติดตั้งก่อนเข้าสู่ระบบ', async ({ browser }, info) => {
  const { ctx, page } = await phone(browser, info, UA.android);
  await page.goto('/login');
  await expect(page.locator('.install.banner')).toBeVisible();
  await page.evaluate(FAKE_PROMPT);
  await expect(page.locator('.install.banner').getByRole('button', { name: '📲 ติดตั้งแอป' })).toBeVisible();
  if (SHOT) await page.screenshot({ path: `${SHOT}/install-login.png`, fullPage: true });
  await ctx.close();
});
