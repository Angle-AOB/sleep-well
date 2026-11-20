import { test, expect } from '@playwright/test'

test('用户保存训练偏好后刷新仍能读取', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '训练偏好' })).toBeVisible()

  await page.locator('#wake-time').fill('06:30')
  await page.locator('#backup-reminders').uncheck()
  await expect(page.getByText('偏好已保存在此设备').first()).toBeVisible()

  await page.reload()
  await expect(page.locator('#wake-time')).toHaveValue('06:30')
  await expect(page.locator('#backup-reminders')).not.toBeChecked()
})

test('应用壳在断网后仍可读取', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '把规律，慢慢带回夜晚。' })).toBeVisible()
  await expect(page.getByText('离线应用壳已准备')).toBeVisible({ timeout: 15_000 })

  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: '把规律，慢慢带回夜晚。' })).toBeVisible()
  await expect(page.getByText('你的数据留在此设备')).toBeVisible()
})
