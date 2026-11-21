import { test, expect, type Page } from '@playwright/test'
import { goTo, openPage } from './navigation'

async function openApp(page: Page, time = '2026-11-20T09:00:00') {
  await openPage(page, 'today', time)
  await expect(page.getByRole('heading', { level: 1, name: '今日' })).toBeVisible()
}

/** 重新打开应用并等到偏好加载完成（提醒结论与偏好同批渲染），“没有提醒卡”断言才不是空过。 */
async function reloadApp(page: Page) {
  await goTo(page, 'today')
  await page.reload()
  await expect(page.getByText('偏好已保存在此设备').first()).toBeVisible()
}

async function recordNight(page: Page, date: string) {
  await goTo(page, 'diary')
  const diary = page.getByRole('region', { name: '晨间睡眠日记' })
  await diary.locator('#diary-date').fill(date)
  await diary.locator('#lights-off').fill('23:00')
  await diary.locator('#sleep-onset').fill('30')
  await diary.locator('#final-wake').fill('06:30')
  await diary.locator('#out-of-bed').fill('07:00')
  await diary.locator('#waso').selectOption('none-remembered')
  await diary.getByRole('button', { name: /保存日记|更新日记/ }).click()
  await expect(diary.getByText('日记已保存在此设备')).toBeVisible()
  await goTo(page, 'today')
}

test('opening the app after three saved nights shows the backup reminder', async ({ page }) => {
  await openApp(page)
  await recordNight(page, '2026-11-17')
  await recordNight(page, '2026-11-18')
  await recordNight(page, '2026-11-19')

  await reloadApp(page)
  await expect(page.getByRole('heading', { name: '备份提醒' })).toBeVisible()
  await expect(page.getByText('已经记录 3 夜睡眠日记')).toBeVisible()
  await expect(page.getByRole('button', { name: '关闭提醒' })).toBeVisible()
})

test('a deep link to another page still shows a due reminder', async ({ page }) => {
  await openApp(page)
  await recordNight(page, '2026-11-17')
  await recordNight(page, '2026-11-18')
  await recordNight(page, '2026-11-19')

  // 同一文档内换 hash 不会重新挂载应用；整页加载才算「再次进入应用」。
  await page.goto('/#/diary')
  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: '日记' })).toBeVisible()

  await expect(page.getByRole('heading', { name: '备份提醒' })).toBeVisible()
  await expect(page.getByText('已经记录 3 夜睡眠日记')).toBeVisible()

  await page.getByRole('button', { name: '稍后再说' }).click()
  await expect(page.getByRole('heading', { name: '备份提醒' })).toBeHidden()
})

test('two saved nights are not worth a backup reminder yet', async ({ page }) => {
  await openApp(page)
  await recordNight(page, '2026-11-18')
  await recordNight(page, '2026-11-19')

  await reloadApp(page)
  await expect(page.getByRole('heading', { name: '备份提醒' })).toBeHidden()
})

test('one click on the reminder card turns backup reminders off for good', async ({ page }) => {
  await openApp(page)
  await recordNight(page, '2026-11-17')
  await recordNight(page, '2026-11-18')
  await recordNight(page, '2026-11-19')
  await reloadApp(page)
  await expect(page.getByRole('heading', { name: '备份提醒' })).toBeVisible()

  await page.getByRole('button', { name: '关闭提醒' }).click()
  await expect(page.getByRole('heading', { name: '备份提醒' })).toBeHidden()
  await expect(page.locator('#backup-reminders')).not.toBeChecked()
  // 保存状态行始终在“正在保存偏好…”与“偏好已保存在此设备”之间切换；
  // 不去抓瞬态的“正在保存”，避免与写入速度赛跑，只断言最终落盘。
  await expect(page.getByText(/正在保存偏好|偏好已保存在此设备/).first()).toBeVisible()
  await expect(page.getByText('偏好已保存在此设备').first()).toBeVisible()

  await reloadApp(page)
  await expect(page.getByRole('heading', { name: '备份提醒' })).toBeHidden()
  await expect(page.locator('#backup-reminders')).not.toBeChecked()
})

test('showing the reminder marks it seen, so it returns at most once a week', async ({ page }) => {
  await openApp(page)
  await recordNight(page, '2026-11-17')
  await recordNight(page, '2026-11-18')
  await recordNight(page, '2026-11-19')
  await reloadApp(page)
  await expect(page.getByRole('heading', { name: '备份提醒' })).toBeVisible()
  await expect(page.getByText('偏好已保存在此设备').first()).toBeVisible()

  await page.getByRole('button', { name: '稍后再说' }).click()
  await expect(page.getByRole('heading', { name: '备份提醒' })).toBeHidden()

  // 同一天再次打开：每周上限之内，保持安静。
  await reloadApp(page)
  await expect(page.getByRole('heading', { name: '备份提醒' })).toBeHidden()

  // 七天后打开：提醒回来，仍是应用内提示。
  await openApp(page, '2026-11-27T09:00:00')
  await expect(page.getByRole('heading', { name: '备份提醒' })).toBeVisible()
  await expect(page.getByText('又到了每周一次的备份提醒')).toBeVisible()
})

test('the settings switch silences reminders even with enough history', async ({ page }) => {
  await openApp(page)
  await goTo(page, 'settings')
  await page.locator('#backup-reminders').uncheck()
  await expect(page.getByRole('region', { name: '训练偏好' }).getByText('偏好已保存在此设备')).toBeVisible()
  await goTo(page, 'today')
  await recordNight(page, '2026-11-17')
  await recordNight(page, '2026-11-18')
  await recordNight(page, '2026-11-19')

  await reloadApp(page)
  await expect(page.getByRole('heading', { name: '备份提醒' })).toBeHidden()
})

test('a delivered backup keeps the reminder quiet until a newer night arrives', async ({ page }) => {
  await openApp(page)
  await recordNight(page, '2026-11-17')
  await recordNight(page, '2026-11-18')
  await recordNight(page, '2026-11-19')

  await goTo(page, 'settings')
  const backup = page.getByRole('region', { name: '本地备份与导出' })
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    backup.getByRole('button', { name: '导出完整备份（ZIP）' }).click()
  ])
  expect(await download.path()).not.toBeNull()
  await expect(backup.getByText('已交给浏览器下载')).toBeVisible()
  await expect(page.getByRole('region', { name: '训练偏好' }).getByText('偏好已保存在此设备')).toBeVisible()

  // 刚备份完：打开应用不再催促。
  await reloadApp(page)
  await expect(page.getByRole('heading', { name: '备份提醒' })).toBeHidden()

  // 出现备份之后的新夜，提醒才回来。
  await openApp(page, '2026-11-21T10:00:00')
  await recordNight(page, '2026-11-21')
  await reloadApp(page)
  await expect(page.getByRole('heading', { name: '备份提醒' })).toBeVisible()
})

test('the in-app reminder works even when system notifications are denied', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'Notification', {
      configurable: true,
      value: { permission: 'denied', requestPermission: () => Promise.resolve('denied') }
    })
  })
  await openApp(page)
  await recordNight(page, '2026-11-17')
  await recordNight(page, '2026-11-18')
  await recordNight(page, '2026-11-19')

  await reloadApp(page)
  await expect(page.getByRole('heading', { name: '备份提醒' })).toBeVisible()
  await expect(page.getByRole('button', { name: '关闭提醒' })).toBeVisible()
})

test('the in-app reminder works even when the Notification API is missing', async ({ page }) => {
  await page.addInitScript(() => {
    Reflect.deleteProperty(window, 'Notification')
  })
  await openApp(page)
  await recordNight(page, '2026-11-17')
  await recordNight(page, '2026-11-18')
  await recordNight(page, '2026-11-19')

  await reloadApp(page)
  await expect(page.getByRole('heading', { name: '备份提醒' })).toBeVisible()
  await expect(page.getByRole('button', { name: '关闭提醒' })).toBeVisible()
})

test('cancelling the share sheet does not count as a backup', async ({ page }) => {
  await page.addInitScript(() => {
    const share = () => Promise.reject(new DOMException('cancelled', 'AbortError'))
    Object.defineProperty(Navigator.prototype, 'share', { configurable: true, value: share })
    Object.defineProperty(Navigator.prototype, 'canShare', { configurable: true, value: () => true })
  })
  await openApp(page)
  await recordNight(page, '2026-11-17')
  await recordNight(page, '2026-11-18')
  await recordNight(page, '2026-11-19')

  const backup = page.getByRole('region', { name: '本地备份与导出' })
  await goTo(page, 'settings')
  await backup.getByRole('button', { name: '导出完整备份（ZIP）' }).click()
  await expect(backup.getByText('已取消分享，没有生成新的备份文件。')).toBeVisible()
  await expect(page.getByRole('region', { name: '训练偏好' }).getByText('偏好已保存在此设备')).toBeVisible()

  // 取消分享不算备份：提醒不静音，打开应用仍会提示。
  await reloadApp(page)
  await expect(page.getByRole('heading', { name: '备份提醒' })).toBeVisible()
})
