import { test, expect, type Page } from '@playwright/test'
import { goTo } from './navigation'

// 状态不能只靠颜色：每个状态提示都要有可读文本，并且落在 role=status / role=alert
// 的语义区域里，屏幕阅读器在状态变化时能播报。断言一律走可访问文本，不碰 CSS 类名。

async function openApp(page: Page) {
  await page.clock.setFixedTime(new Date('2026-11-20T09:00:00'))
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: '今日' })).toBeVisible()
}

test('offline and storage states announce readable status text', async ({ page }) => {
  await openApp(page)
  const offline = page.getByRole('status').filter({ hasText: /当前可离线使用|训练内容缓存中|训练内容缓存失败|此浏览器不支持离线应用壳/ })
  await expect(offline.first()).toBeVisible({ timeout: 30_000 })

  const storage = page.getByRole('status').filter({ hasText: /偏好已保存在此设备|正在保存偏好|数据持久化失败|此浏览器无法使用本地存储|数据迁移失败/ })
  await expect(storage.first()).toBeVisible()
})

test('cache still filling exposes readable pending text with a retry action', async ({ page }) => {
  await page.addInitScript(() => {
    CacheStorage.prototype.keys = function (this: CacheStorage) {
      return Promise.resolve([])
    }
  })
  await openApp(page)
  const pending = page.getByRole('status').filter({ hasText: '训练内容缓存中…' })
  await expect(pending.first()).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('button', { name: '重试' })).toBeVisible()
})

test('cache failure exposes readable error text with a retry action', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.serviceWorker, 'ready', {
      configurable: true,
      value: Promise.reject(new Error('service worker never became ready'))
    })
  })
  await openApp(page)
  const failure = page.getByRole('status').filter({ hasText: '训练内容缓存失败' })
  await expect(failure.first()).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('button', { name: '重试' })).toBeVisible()
})

test('diary save failure announces a readable alert, not just a colour change', async ({ page }) => {
  await page.addInitScript(() => {
    IDBObjectStore.prototype.put = function put() {
      throw new DOMException('storage is full', 'QuotaExceededError')
    }
  })
  await openApp(page)
  await goTo(page, 'diary')
  const diary = page.getByRole('region', { name: '晨间睡眠日记' })
  await diary.locator('#diary-date').fill('2026-11-19')
  await diary.locator('#lights-off').fill('23:00')
  await diary.locator('#sleep-onset').fill('30')
  await diary.locator('#final-wake').fill('06:30')
  await diary.locator('#out-of-bed').fill('07:00')
  await diary.locator('#waso').selectOption('none-remembered')
  await diary.getByRole('button', { name: /保存日记|更新日记/ }).click()

  const alert = page.getByRole('alert').filter({ hasText: '无法保存日记。请检查此设备存储空间后重试。' })
  await expect(alert.first()).toBeVisible()
})

test('a safety pause announces readable status text, not just a colour change', async ({ page }) => {
  await openApp(page)
  await goTo(page, 'settings')
  await page.getByRole('button', { name: '开始自查' }).click()
  await page.getByLabel('你的年龄').fill('30')
  await page.getByRole('group', { name: '你是否曾被告知患有双相障碍，或有躁狂/轻躁狂发作史？' }).getByLabel('是').check()
  await page.getByRole('group', { name: '你是否有癫痫或惊厥病史？' }).getByLabel('否').check()
  await page.getByRole('group', { name: '你是否有响亮鼾声、目击呼吸暂停、白天嗜睡或高血压等情况？' }).getByLabel('否').check()
  await page.getByRole('group', { name: '你是否有危险性异态睡眠，例如梦游时可能受伤？' }).getByLabel('否').check()
  await page.getByRole('group', { name: '你目前是否怀孕？' }).getByLabel('否').check()
  await page.getByRole('group', { name: '你是否会在驾驶或高风险工作时难以保持清醒？' }).getByLabel('否').check()
  await page.getByRole('group', { name: '你目前是否有急性不稳定的身心状况，需要尽快获得专业评估？' }).getByLabel('否').check()
  await page.getByLabel('睡眠困扰持续多久？').selectOption('one-to-four-weeks')
  await page.getByLabel('最近一周，大约有几晚受到睡眠困扰影响？').selectOption('one-to-two')
  await page.getByLabel('睡眠困扰对日间生活影响多大？').selectOption('some')
  await page.getByRole('group', { name: '目前这件事给你带来多大困扰？' }).getByLabel('有一些困扰').check()
  await page.getByLabel('你最希望改善什么？').selectOption('fall-asleep')
  await page.getByRole('button', { name: '提交自查' }).click()

  await expect(page.getByText('睡眠限制暂时暂停。')).toBeVisible()
  const paused = page.getByRole('status').filter({ hasText: '睡眠限制暂时暂停。' })
  await expect(paused.first()).toBeVisible()

  const cleared = page.getByText('建议先咨询睡眠或医疗专业人士，再决定是否进行睡眠限制。')
  await expect(cleared).toBeVisible()
})

test('missing metrics read as unavailable with a reason, never as colour alone', async ({ page }) => {
  await openApp(page)
  await goTo(page, 'diary')
  const diary = page.getByRole('region', { name: '晨间睡眠日记' })
  await diary.locator('#diary-date').fill('2026-11-19')
  await diary.locator('#lights-off').fill('23:00')
  // 只填部分字段：指标区必须写出“数据不足”与原因，而不是靠颜色暗示。
  await expect(diary.getByText('数据不足').first()).toBeVisible()
  await expect(diary.getByText('缺少必要字段').first()).toBeVisible()
})
