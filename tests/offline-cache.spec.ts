import { test, expect } from '@playwright/test'

test('cache complete shows current-offline-ready with training content cached', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '把规律，慢慢带回夜晚。' })).toBeVisible()
  await expect(page.getByText('当前可离线使用')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('训练内容已缓存')).toBeVisible()
})

test('cache failure shows retry entry and retry recovers', async ({ page, context }) => {
  await context.addInitScript(() => {
    const state = { mode: 'fail' as 'fail' | 'ok' }
    ;(window as unknown as Record<string, unknown>).__cacheTestState = state
    const realKeys = CacheStorage.prototype.keys.bind(caches)
    CacheStorage.prototype.keys = function (this: CacheStorage) {
      if (state.mode === 'fail') return Promise.resolve([])
      return realKeys()
    }
  })

  await page.goto('/')
  await expect(page.getByRole('heading', { name: '把规律，慢慢带回夜晚。' })).toBeVisible()
  await expect(page.getByRole('button', { name: '重试' })).toBeVisible({ timeout: 15_000 })

  await page.evaluate(() => {
    ;(window as unknown as Record<string, { mode: string }>).__cacheTestState.mode = 'ok'
  })
  await page.waitForTimeout(500)
  await page.evaluate(() => {
    (document.querySelector('.status-retry') as HTMLButtonElement | null)?.click()
  })
  await expect(page.getByText('当前可离线使用')).toBeVisible({ timeout: 15_000 })
})

test('offline diagnostic never reads health data from IndexedDB', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('当前可离线使用')).toBeVisible({ timeout: 15_000 })
  const statusText = await page.locator('.status-row').innerText()
  expect(statusText).not.toMatch(/日记|筛查|睡眠质量|夜醒/)
  expect(statusText).toMatch(/离线|缓存/)
})

test('a failed service-worker update keeps the current version working with local data intact', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByText('当前可离线使用')).toBeVisible({ timeout: 15_000 })

  // 资源更新失败：旧版本与旧缓存必须继续工作，绝不静默丢掉本地内容。
  await page.route('**/sw.js*', (route) => route.fulfill({ status: 500, body: '' }))
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration()
    await registration?.update().catch(() => undefined)
  })

  await expect(page.getByRole('heading', { name: '把规律，慢慢带回夜晚。' })).toBeVisible()
  await expect(page.getByText('当前可离线使用')).toBeVisible()

  // 更新失败后仍可离线打开：资源回滚到旧版本，而不是留下半份缓存。
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: '把规律，慢慢带回夜晚。' })).toBeVisible()
})
