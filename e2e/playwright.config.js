// E2E: ทดสอบผ่านเบราว์เซอร์จริง (Google Chrome ที่ติดตั้งในเครื่อง) กับเซิร์ฟเวอร์ทดสอบ
// รัน: cd e2e && npm test   (ต้องเปิด MySQL ทดสอบที่พอร์ต 33306 ไว้ก่อน — ดู TESTING.md)
const { defineConfig, devices } = require('@playwright/test');

const PORT = 3199;

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1, // ทุกไฟล์ใช้ฐานข้อมูลทดสอบชุดเดียวกัน
  retries: 0,
  timeout: 60_000,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'report' }]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    channel: 'chrome',
    locale: 'th-TH',
    timezoneId: 'Asia/Bangkok',
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel: 'chrome' }, testIgnore: /mobile/ },
    { name: 'mobile', use: { ...devices['Pixel 7'], channel: 'chrome' }, testMatch: /mobile/ },
  ],
  webServer: {
    command: 'npm --prefix ../frontend run build && node server.js',
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'pipe',
  },
});
