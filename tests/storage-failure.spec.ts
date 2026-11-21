import { test, expect } from '@playwright/test'
import { FIRST_RUN_SEEN_KEY } from '../src/firstRun'
import { goTo, goToSettingsSubPage } from './navigation'

/**
 * 这些用例手动创建上下文，不会带上 config 里统一播种的首次说明标记；
 * 不播种的话弹窗会挡住页面里的点击。
 */
function seenFirstRun(baseURL: string | undefined) {
  if (!baseURL) throw new Error('baseURL 未配置')
  return {
    cookies: [],
    origins: [{ origin: baseURL, localStorage: [{ name: FIRST_RUN_SEEN_KEY, value: '1' }] }]
  }
}

test('disabled IndexedDB shows storage-unavailable and app still renders', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ storageState: seenFirstRun(baseURL) })
  await context.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true })
  })
  const page = await context.newPage()
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: '今日' })).toBeVisible()
  await expect(page.getByText('此浏览器无法使用本地存储').first()).toBeVisible()
  await context.close()
})

test('transaction write failure shows persistence-failed message and app continues', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ storageState: seenFirstRun(baseURL) })
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
  await expect(page.getByRole('heading', { level: 1, name: '今日' })).toBeVisible()

  // Trigger a write by toggling the backup-reminders preference
  await goToSettingsSubPage(page, 'reminders')
  await page.locator('#backup-reminders').click()
  await expect(page.getByRole('region', { name: '训练偏好' }).getByText(/数据持久化失败/)).toBeVisible({ timeout: 10_000 })

  // App continues to render core content
  await goTo(page, 'today')
  await expect(page.getByRole('region', { name: '昨夜记录' })).toBeVisible()
  await context.close()
})

test('estimate() failure does not crash the app', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ storageState: seenFirstRun(baseURL) })
  await context.addInitScript(() => {
    if (navigator.storage) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (navigator.storage as any).estimate = () => Promise.reject(new Error('estimate failed'))
    }
  })
  const page = await context.newPage()
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: '今日' })).toBeVisible()
  await goTo(page, 'settings')
  await expect(
    page.getByRole('region', { name: '应用状态' }).getByText('偏好已保存在此设备')
  ).toBeVisible({ timeout: 10_000 })
  await context.close()
})

test('a denied storage-persist request degrades to best-effort and the app keeps working', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ storageState: seenFirstRun(baseURL) })
  const page = await context.newPage()
  await page.addInitScript(() => {
    const storage = navigator.storage as StorageManager & { persist?: () => Promise<boolean> }
    storage.persist = () => Promise.resolve(false)
  })
  await page.clock.setFixedTime(new Date('2026-11-20T09:00:00'))
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: '今日' })).toBeVisible()
  // 拒绝持久化不是错误：降级说明在设置状态段，应用仍可使用。
  await goTo(page, 'settings')
  await expect(
    page.getByRole('region', { name: '应用状态' }).getByText('浏览器未批准增强保留；清除站点数据可能导致记录丢失。')
  ).toBeVisible()
  await goTo(page, 'diary')
  await expect(page.getByRole('region', { name: '晨间睡眠日记' })).toBeVisible()
  await context.close()
})
