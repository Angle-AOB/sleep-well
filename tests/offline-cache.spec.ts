import { test, expect } from '@playwright/test'

test('cache complete shows current-offline-ready with training content cached', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '把规律，慢慢带回夜晚。' })).toBeVisible()
  await expect(page.getByText('当前可离线使用')).toBeVisible({ timeout: 30_000 })
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
  await expect(page.getByRole('button', { name: '重试' })).toBeVisible({ timeout: 30_000 })

  await page.evaluate(() => {
    ;(window as unknown as Record<string, { mode: string }>).__cacheTestState.mode = 'ok'
  })
  await page.waitForTimeout(500)
  await page.evaluate(() => {
    (document.querySelector('.status-retry') as HTMLButtonElement | null)?.click()
  })
  await expect(page.getByText('当前可离线使用')).toBeVisible({ timeout: 30_000 })
})

test('offline diagnostic never reads health data from IndexedDB', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('当前可离线使用')).toBeVisible({ timeout: 30_000 })
  const statusText = await page.locator('.status-row').innerText()
  expect(statusText).not.toMatch(/日记|筛查|睡眠质量|夜醒/)
  expect(statusText).toMatch(/离线|缓存/)
})

test('a failed service-worker update keeps the current version working with local data intact', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByText('当前可离线使用')).toBeVisible({ timeout: 30_000 })

  // 先留下本地内容，才谈得上"资源更新不摧毁健康数据"。
  const diary = page.getByRole('region', { name: '晨间睡眠日记' })
  await diary.locator('#diary-date').fill('2026-11-18')
  await diary.locator('#lights-off').fill('23:00')
  await diary.locator('#sleep-onset').fill('30')
  await diary.locator('#final-wake').fill('06:30')
  await diary.locator('#out-of-bed').fill('07:00')
  await diary.locator('#waso').selectOption('none-remembered')
  await diary.getByRole('button', { name: /保存日记|更新日记/ }).click()
  await expect(diary.getByText('日记已保存在此设备')).toBeVisible()

  // 让资源更新真的失败：替换 update() 并计数，失败必须确实被注入。
  await page.evaluate(() => {
    const state = { updateCalls: 0 }
    ;(window as unknown as Record<string, unknown>).__updateTestState = state
    const proto = ServiceWorkerRegistration.prototype as unknown as Record<string, unknown>
    proto.update = function update() {
      state.updateCalls += 1
      return Promise.reject(new Error('update-failed'))
    }
  })
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration()
    await registration?.update().catch(() => undefined)
  })
  const updateCalls = await page.evaluate(
    () => (window as unknown as { __updateTestState: { updateCalls: number } }).__updateTestState.updateCalls
  )
  expect(updateCalls).toBeGreaterThan(0)

  // 更新失败后旧版本继续工作，本地内容仍在。
  await expect(page.getByRole('heading', { name: '把规律，慢慢带回夜晚。' })).toBeVisible()
  await expect(page.getByText('当前可离线使用')).toBeVisible()
  await expect(diary.getByText('11 月 18 日')).toBeVisible()

  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: '把规律，慢慢带回夜晚。' })).toBeVisible()
  await expect(diary.getByText('11 月 18 日')).toBeVisible()
})

test('a half-written new cache is never claimed offline-ready and leaves local data alone', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('当前可离线使用')).toBeVisible({ timeout: 30_000 })

  const diary = page.getByRole('region', { name: '晨间睡眠日记' })
  await diary.locator('#diary-date').fill('2026-11-18')
  await diary.locator('#lights-off').fill('23:00')
  await diary.locator('#sleep-onset').fill('30')
  await diary.locator('#final-wake').fill('06:30')
  await diary.locator('#out-of-bed').fill('07:00')
  await diary.locator('#waso').selectOption('none-remembered')
  await diary.getByRole('button', { name: /保存日记|更新日记/ }).click()
  await expect(diary.getByText('日记已保存在此设备')).toBeVisible()

  // 模拟新缓存只抓了一半：预缓存条目消失，完整性检查不通过。
  // 桩要装在 init script 里，重载后仍然生效——状态是在打开应用时判定的。
  await page.addInitScript(() => {
    const state = { mode: 'half' as 'half' | 'ok' }
    ;(window as unknown as Record<string, unknown>).__cacheHalfState = state
    const realKeys = CacheStorage.prototype.keys.bind(caches)
    CacheStorage.prototype.keys = function (this: CacheStorage) {
      return realKeys().then((names) =>
        state.mode === 'half' ? names.filter((name) => !name.startsWith('workbox-precache')) : names
      )
    }
  })
  await page.reload()

  // 绝不谎称"当前可离线使用"，且给出重试入口；本地日记不受影响。
  await expect(page.getByText('当前可离线使用')).toBeHidden()
  await expect(page.getByRole('button', { name: '重试' })).toBeVisible({ timeout: 30_000 })
  await expect(diary.getByText('11 月 18 日')).toBeVisible()

  // 缓存补齐后重试可恢复。
  await page.evaluate(() => {
    ;(window as unknown as { __cacheHalfState: { mode: string } }).__cacheHalfState.mode = 'ok'
  })
  await page.getByRole('button', { name: '重试' }).click()
  await expect(page.getByText('当前可离线使用')).toBeVisible({ timeout: 30_000 })
  await expect(diary.getByText('11 月 18 日')).toBeVisible()
})
