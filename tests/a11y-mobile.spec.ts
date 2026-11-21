import { test, expect } from '@playwright/test'
import { goTo, openPage } from './navigation'

// 可访问性冒烟：应用在窄视口（mobile-chromium 项目，Pixel 7）下排版不横向溢出、
// 每页的主要入口完整可见。桌面全量回归也会跑本文件，两侧都必须成立。
test('应用在每个页面都无横向溢出且主要面板完整可见', async ({ page }) => {
  await openPage(page, 'today', '2026-11-20T09:00:00')
  await expect(page.getByRole('heading', { level: 1, name: '今日' })).toBeVisible()
  await expect(page.getByText('把规律，慢慢带回夜晚。')).toBeVisible()
  await expect(page.getByText('你的数据留在此设备')).toBeVisible()

  await goTo(page, 'diary')
  await expect(page.getByRole('heading', { name: '晨间睡眠日记' })).toBeVisible()

  await goTo(page, 'training')
  await expect(page.getByRole('heading', { name: '六周训练' })).toBeVisible()

  await goTo(page, 'settings')
  await expect(page.getByRole('heading', { name: '训练偏好' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '本地备份与导出' })).toBeVisible()

  // 最后停在内容最多的设置页，再整体检查一次文档宽度。
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth
  }))
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth)
})
