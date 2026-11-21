import { test, expect } from '@playwright/test'

// 可访问性冒烟：应用在窄视口（mobile-chromium 项目，Pixel 7）下排版不横向溢出、
// 主流程入口完整可见。桌面全量回归也会跑本文件，两侧都必须成立。
test('应用在当前视口下无横向溢出且主要面板完整可见', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '把规律，慢慢带回夜晚。' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '训练偏好' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '晨间睡眠日记' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '本地备份与导出' })).toBeVisible()

  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth
  }))
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth)
})
