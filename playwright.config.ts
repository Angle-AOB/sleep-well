import { defineConfig, devices } from '@playwright/test'

// 每个 worktree 用不同端口，避免并行实现时互相复用别人的预览服务。
const port = Number(process.env.PLAYWRIGHT_PORT ?? 4173)
const baseURL = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'html',
  use: {
    baseURL,
    locale: 'zh-CN',
    trace: 'on-first-retry'
  },
  webServer: {
    command: `npm run build && npm run preview -- --host 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // 可访问性测试在移动视口里跑；桌面 chromium 项目继续跑全部测试文件（全量回归）。
    { name: 'mobile-chromium', testMatch: /a11y-.*\.spec\.ts/, use: { ...devices['Pixel 7'] } }
  ]
})
