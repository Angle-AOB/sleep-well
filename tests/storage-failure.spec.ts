import { test, expect } from '@playwright/test'

test('disabled IndexedDB shows storage-unavailable and app still renders', async ({ browser }) => {
  const context = await browser.newContext()
  await context.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true })
  })
  const page = await context.newPage()
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '把规律，慢慢带回夜晚。' })).toBeVisible()
  await expect(page.getByText('此浏览器无法使用本地存储').first()).toBeVisible()
  await context.close()
})

test('transaction write failure shows persistence-failed message and app continues', async ({ browser }) => {
  const context = await browser.newContext()
  await context.addInitScript(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (IDBObjectStore.prototype as any).put = function () {
      throw new DOMException('Quota exceeded', 'QuotaExceededError')
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(IDBObjectStore.prototype as any).add = function () {
      throw new DOMException('Quota exceeded', 'QuotaExceededError')
    }
  })
  const page = await context.newPage()
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '把规律，慢慢带回夜晚。' })).toBeVisible()

  // Trigger a write by toggling the backup-reminders preference
  await page.locator('#backup-reminders').click()
  await expect(page.getByText(/数据持久化失败/).first()).toBeVisible({ timeout: 10_000 })

  // App continues to render core content
  await expect(page.getByRole('heading', { name: '先了解这是什么' })).toBeVisible()
  await context.close()
})

test('estimate() failure does not crash the app', async ({ browser }) => {
  const context = await browser.newContext()
  await context.addInitScript(() => {
    if (navigator.storage) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (navigator.storage as any).estimate = () => Promise.reject(new Error('estimate failed'))
    }
  })
  const page = await context.newPage()
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '把规律，慢慢带回夜晚。' })).toBeVisible()
  await expect(page.getByText('偏好已保存在此设备').first()).toBeVisible({ timeout: 10_000 })
  await context.close()
})
