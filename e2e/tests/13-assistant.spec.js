// น้องแถวดี: ปุ่มลอย → แชต → คำตอบ (จำลอง API) · พูดถามด้วยไมค์ (จำลอง SpeechRecognition) · ปิดเมื่อไม่ได้ตั้งค่า
const { test, expect } = require('@playwright/test');
const { login } = require('./helpers');

const SHOT = process.env.SHOT_DIR;

async function mockAssistant(page, reply = 'ทำตามนี้ค่ะ\n1. แตะปุ่ม **สแกน QR**\n2. ส่องกล้องไปที่ QR ที่ลาน') {
  const asked = [];
  await page.route('**/api/assistant', (r) => r.fulfill({ json: { enabled: true, name: 'น้องแถวดี' } }));
  await page.route('**/api/assistant/chat', async (r) => {
    asked.push(JSON.parse(r.request().postData()));
    await r.fulfill({ json: { reply } });
  });
  return asked;
}

test('ไม่ได้ตั้งค่าคีย์ → ไม่แสดงปุ่มน้องแถวดี', async ({ page }) => {
  await login(page, 'T1');
  await expect(page.locator('.hero')).toBeVisible();
  await expect(page.locator('.ast .fab')).toHaveCount(0);
});

test('เปิดแชต กดคำถามแนะนำ ได้คำตอบเป็นขั้นตอน', async ({ page }) => {
  const asked = await mockAssistant(page);
  await login(page, 'T1');
  const fab = page.getByRole('button', { name: 'ถามน้องแถวดี' });
  await expect(fab).toBeVisible();
  if (SHOT) await page.screenshot({ path: `${SHOT}/ntd-fab.png` });
  await fab.click();
  const panel = page.getByRole('dialog', { name: /น้องแถวดี/ });
  await expect(panel).toContainText('สวัสดีค่ะ');
  await panel.locator('.chips button').first().click();
  await expect(panel.locator('.m.bot .rich li')).toHaveCount(2);
  await expect(panel.locator('.m.bot .rich b')).toHaveText('สแกน QR');
  expect(asked[0].messages.at(-1)).toMatchObject({ role: 'user' });
  // พิมพ์ถามต่อ ส่งประวัติไปด้วย
  await panel.getByLabel('คำถาม', { exact: true }).fill('แล้วถ้า GPS ไม่ผ่านล่ะ');
  await panel.getByRole('button', { name: 'ส่งคำถาม' }).click();
  await expect(panel.locator('.m.me')).toHaveCount(2);
  expect(asked[1].messages).toHaveLength(3);
  if (SHOT) await page.screenshot({ path: `${SHOT}/ntd-chat.png` });
  await panel.getByRole('button', { name: 'ปิดหน้าต่างแชต' }).click();
  await expect(panel).toHaveCount(0);
});

test('พูดถามด้วยไมโครโฟน (ภาษาไทย) แล้วส่งอัตโนมัติ', async ({ page }) => {
  await page.addInitScript(() => {
    // จำลอง Web Speech API: ได้ยินประโยคเดียวแล้วจบ
    window.SpeechRecognition = window.webkitSpeechRecognition = class {
      start() {
        window.__sttLang = this.lang;
        setTimeout(() => this.onstart?.(), 10);
        setTimeout(() => this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: 'ลืมรหัสผ่านทำยังไง' }], { isFinal: true })] }), 60);
        setTimeout(() => this.onend?.(), 120);
      }
      stop() { this.onend?.(); }
    };
  });
  const asked = await mockAssistant(page, 'กด **ลืมรหัสผ่าน?** ที่หน้าเข้าสู่ระบบค่ะ');
  await login(page, 'T1');
  await page.getByRole('button', { name: 'ถามน้องแถวดี' }).click();
  const panel = page.getByRole('dialog', { name: /น้องแถวดี/ });
  await panel.getByRole('button', { name: 'พูดคำถาม' }).click();
  await expect(panel.locator('.m.me')).toHaveText('ลืมรหัสผ่านทำยังไง');
  await expect(panel.locator('.m.bot .rich')).toContainText('ลืมรหัสผ่าน?');
  expect(await page.evaluate(() => window.__sttLang)).toBe('th-TH');
  expect(asked[0].messages.at(-1).content).toBe('ลืมรหัสผ่านทำยังไง');
});

test('มือถือ: ปุ่มไม่บังเมนูล่าง และหน้าต่างพอดีจอ', async ({ browser }, info) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, baseURL: info.project.use.baseURL });
  const page = await ctx.newPage();
  await mockAssistant(page);
  await login(page, 'T1');
  const fab = await page.getByRole('button', { name: 'ถามน้องแถวดี' }).boundingBox();
  const nav = await page.locator('.bottomnav').boundingBox();
  expect(fab.y + fab.height).toBeLessThanOrEqual(nav.y);
  await page.getByRole('button', { name: 'ถามน้องแถวดี' }).click();
  await page.locator('.chips button').first().click();
  await expect(page.locator('.m.bot .rich')).toBeVisible();
  const panel = await page.getByRole('dialog', { name: /น้องแถวดี/ }).boundingBox();
  expect(panel.x).toBeGreaterThanOrEqual(0);
  expect(panel.x + panel.width).toBeLessThanOrEqual(390);
  if (SHOT) await page.screenshot({ path: `${SHOT}/ntd-mobile.png` });
  await ctx.close();
});

test('ผู้ดูแลวางคีย์ที่หน้าตั้งค่าระบบ → ปุ่มน้องแถวดีขึ้น → ลบคีย์แล้วหายไป', async ({ page }) => {
  const { confirmPassword } = require('./helpers');
  await login(page, 'AD');
  await page.goto('/more');
  await page.locator('.tile', { hasText: 'น้องแถวดี (AI ผู้ช่วย)' }).click();
  const sec = page.locator('#assistant');
  await expect(sec).toContainText('ยังไม่ได้ใส่คีย์');
  await sec.locator('input[type=password]').fill('sk-or-v1-e2etestkey0000000000000000000000TEST');
  await sec.locator('select').selectOption('anthropic/claude-haiku-5.5');
  await sec.getByRole('button', { name: /บันทึก/ }).click();
  await confirmPassword(page);
  await expect(sec).toContainText('เปิดใช้งานอยู่');
  await expect(sec).toContainText('…TEST');
  await expect(sec.locator('input[type=password]')).toHaveValue('');
  if (SHOT) await page.screenshot({ path: `${SHOT}/ntd-settings.png`, fullPage: true });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'ถามน้องแถวดี' })).toBeVisible();
  await page.goto('/admin/settings#assistant');
  page.once('dialog', (d) => d.accept());
  await page.locator('#assistant').getByRole('button', { name: 'ลบคีย์' }).click();
  await confirmPassword(page);
  await expect(page.locator('#assistant')).toContainText('ยังไม่ได้ใส่คีย์');
  await page.goto('/');
  await expect(page.locator('.hero')).toBeVisible();
  await expect(page.getByRole('button', { name: 'ถามน้องแถวดี' })).toHaveCount(0);
});
