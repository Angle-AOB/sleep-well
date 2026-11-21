import { test, expect } from '@playwright/test'
import { FIRST_RUN_SEEN_KEY, SEEN_VALUE } from '../src/firstRun'
import { defaultClock, goToSettingsSubPage } from './navigation'

// 首次说明是唯一需要「没看过」状态的用例组：关掉 config 里统一的标记播种。
// 其余用例通过 playwright.config.ts 的 storageState 默认带上标记，不会被弹窗挡住。
test.use({ storageState: { cookies: [], origins: [] } })

// 按仓库约定固定本地日期；不依赖真实系统时钟，时钟在导航前就位。
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(defaultClock))
})

const startScreening = '开始安全自查'
const recordDiary = '先记录日记'
const closeFirstRun = '关闭首次说明'

test('首次打开显示说明弹窗；关闭后刷新不再出现', async ({ page }) => {
  await page.goto('/')

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  // 复用既有文案：品牌、产品自称、适用范围与本地边界。
  await expect(dialog).toContainText('睡眠行为训练器')
  await expect(dialog).toContainText('把规律，慢慢带回夜晚。')
  await expect(dialog).toContainText('先了解这是什么')
  await expect(dialog).toContainText('你的数据留在此设备')
  await expect(dialog).toContainText('仅保存在此设备')
  // 不是知情同意：没有勾选门槛。
  await expect(dialog.getByRole('checkbox')).toHaveCount(0)

  await dialog.getByRole('button', { name: closeFirstRun }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: '今日' })).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('清除本设备的首次标记后说明再次出现', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('dialog').getByRole('button', { name: closeFirstRun }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await page.evaluate((key) => localStorage.removeItem(key), FIRST_RUN_SEEN_KEY)
  await page.reload()
  await expect(page.getByRole('dialog')).toBeVisible()
})

test('主按钮关闭弹窗并进入安全自查子页', async ({ page }) => {
  await page.goto('/#/settings')
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()

  await dialog.getByRole('button', { name: startScreening }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('heading', { level: 1, name: '安全自查' })).toBeVisible()
  await expect(page).toHaveURL(/#\/settings\/screening$/)
})

test('次按钮关闭弹窗并进入日记页', async ({ page }) => {
  await page.goto('/#/settings')
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()

  await dialog.getByRole('button', { name: recordDiary }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('heading', { level: 1, name: '晨间睡眠日记' })).toBeVisible()
  await expect(page).toHaveURL(/#\/diary$/)
})

test('Esc 关闭首次说明弹窗', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('dialog')).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('heading', { level: 1, name: '今日' })).toBeVisible()
})

test('自动弹出的说明按 Esc 关闭后焦点落到今日标题', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('dialog')).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // 自动弹出没有触发元素：焦点应交给当前页标题，而不是留在 body。
  const title = page.locator('#page-title')
  await expect(title).toHaveText('今日')
  await expect(title).toBeFocused()
})

test('关于与隐私可以复看同一说明，关闭后回到关于页且不重置标记', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('dialog').getByRole('button', { name: recordDiary }).click()

  await goToSettingsSubPage(page, 'about')
  expect(await page.evaluate((key) => localStorage.getItem(key), FIRST_RUN_SEEN_KEY)).toBe(SEEN_VALUE)

  const replay = page.getByRole('button', { name: '再看一次首次说明' })
  await replay.click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('睡眠行为训练器')
  await expect(dialog).toContainText('仅保存在此设备')

  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  // 关闭后仍停在关于页，焦点回到触发它的按钮。
  await expect(page.getByRole('heading', { level: 1, name: '关于与隐私' })).toBeVisible()
  await expect(page).toHaveURL(/#\/settings\/about$/)
  await expect(replay).toBeFocused()

  // 复看不重置标记：刷新后依然不再自动出现。
  expect(await page.evaluate((key) => localStorage.getItem(key), FIRST_RUN_SEEN_KEY)).toBe(SEEN_VALUE)
  await page.reload()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('heading', { level: 1, name: '关于与隐私' })).toBeVisible()
})

test('焦点陷阱：Tab 不会离开弹窗，背景处于模态', async ({ page }) => {
  await page.goto('/')
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()

  for (let step = 0; step < 12; step += 1) {
    await page.keyboard.press('Tab')
    const inside = await page.evaluate(() =>
      document.querySelector('dialog')?.contains(document.activeElement) ?? false
    )
    expect(inside, `第 ${step + 1} 次 Tab 后焦点应仍在弹窗内`).toBe(true)
  }

  // 原生模态：浏览器把背景标为不可交互。
  expect(await page.evaluate(() => document.querySelector('dialog')?.matches(':modal'))).toBe(true)
})

test('首次标记只写入 localStorage，不进入偏好', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('dialog').getByRole('button', { name: recordDiary }).click()

  // 触发一次偏好写入，确保 IndexedDB 里确实有偏好记录可检查。
  await goToSettingsSubPage(page, 'reminders')
  await page.locator('#backup-reminders').click()
  await expect(
    page.getByRole('region', { name: '训练偏好' }).getByText('偏好已保存在此设备')
  ).toBeVisible()

  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([FIRST_RUN_SEEN_KEY])

  const preferences = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('sleep-well')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      return await new Promise<unknown>((resolve, reject) => {
        const transaction = database.transaction('preferences', 'readonly')
        const request = transaction.objectStore('preferences').get('current')
        request.onsuccess = () => resolve(request.result ?? null)
        request.onerror = () => reject(request.error)
      })
    } finally {
      database.close()
    }
  })

  expect(preferences).not.toBeNull()
  const fields = Object.keys(preferences as Record<string, unknown>)
  expect(fields).toContain('backupReminders')
  expect(fields.some((field) => field.toLowerCase().includes('first-run'))).toBe(false)
})

test.describe('小屏', () => {
  test.use({ viewport: { width: 412, height: 915 } })

  test('小屏不横向溢出，按钮不小于 44×44', async ({ page }) => {
    await page.goto('/')
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    const layout = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth
    }))
    expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth)

    for (const name of [startScreening, recordDiary, closeFirstRun]) {
      const box = await dialog.getByRole('button', { name }).boundingBox()
      expect(box, `${name} 应有可测量的尺寸`).not.toBeNull()
      expect(box!.width, `${name} 宽度`).toBeGreaterThanOrEqual(44)
      expect(box!.height, `${name} 高度`).toBeGreaterThanOrEqual(44)
    }
  })
})
