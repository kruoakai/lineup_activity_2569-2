const { expect } = require('@playwright/test');

// รหัสผ่านทดสอบเดียวกับ backend/tests/helpers.js (บัญชีในฐานข้อมูลทดสอบเท่านั้น)
const PASSWORD = 'Passw0rd!x';

async function login(page, code, password = PASSWORD) {
  await page.goto('/login');
  await page.getByLabel('รหัสพนักงาน หรืออีเมล').fill(code);
  await page.locator('#login-pass').fill(password);
  await page.getByRole('button', { name: /เข้าสู่ระบบ$/ }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

async function logout(page) {
  await page.getByRole('button', { name: 'ออกจากระบบ' }).first().click();
  await page.locator('.logout-box').getByRole('button', { name: 'ออกจากระบบ' }).click();
  await expect(page).toHaveURL(/\/login/);
}

// รูป JPEG ขนาดเล็กที่ถูกต้อง (1×1 px) สำหรับแนบเป็นหลักฐาน
const JPEG_1PX = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  'base64',
);

async function confirmPassword(page, password = PASSWORD) {
  const box = page.locator('.modal').filter({ has: page.locator('input[type=password]') });
  await box.locator('input[type=password]').fill(password);
  await box.getByRole('button', { name: 'ยืนยัน' }).click();
}

module.exports = { PASSWORD, login, logout, JPEG_1PX, confirmPassword };
