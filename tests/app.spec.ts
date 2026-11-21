import { test, expect } from '@playwright/test'

test('用户保存训练偏好后刷新仍能读取', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '训练偏好' })).toBeVisible()

  await page.locator('#backup-reminders').uncheck()
  await expect(page.getByText('偏好已保存在此设备').first()).toBeVisible()

  await page.reload()
  await expect(page.locator('#backup-reminders')).not.toBeChecked()
})

test('应用壳在断网后仍可读取', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '把规律，慢慢带回夜晚。' })).toBeVisible()
  await expect(page.getByText('当前可离线使用')).toBeVisible({ timeout: 30_000 })

  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: '把规律，慢慢带回夜晚。' })).toBeVisible()
  await expect(page.getByText('你的数据留在此设备')).toBeVisible()
})

test('本地存储与备份加密警告的文案对用户可见', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-20T09:00:00'))
  await page.goto('/')

  // 隐私说明：本地存储、无账号/云同步/遥测、清除数据会丢失。
  await expect(page.getByText('偏好保存在此浏览器的本地数据库中。没有账号、云端同步、分析或遥测。', { exact: false })).toBeVisible()

  // 备份警告：ZIP 压缩不是加密，且"导出"不等于已保存到本设备之外。
  await expect(page.getByText('ZIP 压缩不是加密：备份文件没有密码保护', { exact: false })).toBeVisible()
  await expect(page.getByText('并不代表备份已经保存到本设备之外', { exact: false })).toBeVisible()
})

test('所有界面文案都在 i18n 资源里且非空', async () => {
  // i18n 完整性：资源里每个键都必须有非空文案，且不能原样留键名占位。
  const { default: i18n } = await import('../src/i18n/index')
  const bundle = i18n.getResourceBundle('zh-CN', 'translation') as Record<string, unknown>
  const entries = Object.entries(bundle)
  expect(entries.length).toBeGreaterThan(50)
  for (const [key, value] of entries) {
    expect(typeof value, key).toBe('string')
    expect((value as string).trim().length, key).toBeGreaterThan(0)
  }
})
