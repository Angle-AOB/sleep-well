import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'html',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    locale: 'zh-CN',
    trace: 'on-first-retry'
  },
  webServer: {
    command: 'npm run build && npm run preview -- --host 127.0.0.1',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // 可访问性测试在移动视口里跑；桌面 chromium 项目继续跑全部测试文件（全量回归）。
    { name: 'mobile-chromium', testMatch: /a11y-.*\.spec\.ts/, use: { ...devices['Pixel 7'] } }
  ]
})
