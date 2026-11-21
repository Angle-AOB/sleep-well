import { test, expect, type Page } from '@playwright/test'

async function openApp(page: Page, time = '2026-11-20T09:00:00') {
  await page.clock.setFixedTime(new Date(time))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '本地备份与导出' })).toBeVisible()
}

async function recordNight(page: Page, date: string) {
  const diary = page.getByRole('region', { name: '晨间睡眠日记' })
  await diary.locator('#diary-date').fill(date)
  await diary.locator('#lights-off').fill('23:00')
  await diary.locator('#sleep-onset').fill('30')
  await diary.locator('#final-wake').fill('06:30')
  await diary.locator('#out-of-bed').fill('07:00')
  await diary.locator('#waso').selectOption('none-remembered')
  await diary.getByRole('button', { name: /保存日记|更新日记/ }).click()
  await expect(diary.getByText('日记已保存在此设备')).toBeVisible()
}

test('opening the app after three saved nights shows the backup reminder', async ({ page }) => {
  await openApp(page)
  await recordNight(page, '2026-11-17')
  await recordNight(page, '2026-11-18')
  await recordNight(page, '2026-11-19')

  await page.reload()
  await expect(page.getByRole('heading', { name: '备份提醒' })).toBeVisible()
  await expect(page.getByText('已经记录 3 夜睡眠日记')).toBeVisible()
  await expect(page.getByRole('button', { name: '关闭提醒' })).toBeVisible()
})

test('two saved nights are not worth a backup reminder yet', async ({ page }) => {
  await openApp(page)
  await recordNight(page, '2026-11-18')
  await recordNight(page, '2026-11-19')

  await page.reload()
  await expect(page.getByRole('heading', { name: '备份提醒' })).toBeHidden()
})

test('one click on the reminder card turns backup reminders off for good', async ({ page }) => {
  await openApp(page)
  await recordNight(page, '2026-11-17')
  await recordNight(page, '2026-11-18')
  await recordNight(page, '2026-11-19')
  await page.reload()
  await expect(page.getByRole('heading', { name: '备份提醒' })).toBeVisible()

  await page.getByRole('button', { name: '关闭提醒' }).click()
  await expect(page.getByRole('heading', { name: '备份提醒' })).toBeHidden()
  await expect(page.locator('#backup-reminders')).not.toBeChecked()
  await expect(page.getByText('正在保存偏好…').first()).toBeVisible()
  await expect(page.getByText('偏好已保存在此设备').first()).toBeVisible()

  await page.reload()
  await expect(page.getByRole('heading', { name: '备份提醒' })).toBeHidden()
  await expect(page.locator('#backup-reminders')).not.toBeChecked()
})

test('showing the reminder marks it seen, so it returns at most once a week', async ({ page }) => {
  await openApp(page)
  await recordNight(page, '2026-11-17')
  await recordNight(page, '2026-11-18')
  await recordNight(page, '2026-11-19')
  await page.reload()
  await expect(page.getByRole('heading', { name: '备份提醒' })).toBeVisible()
  await expect(page.getByText('偏好已保存在此设备').first()).toBeVisible()

  await page.getByRole('button', { name: '稍后再说' }).click()
  await expect(page.getByRole('heading', { name: '备份提醒' })).toBeHidden()

  // 同一天再次打开：每周上限之内，保持安静。
  await page.reload()
  await expect(page.getByRole('heading', { name: '备份提醒' })).toBeHidden()

  // 七天后打开：提醒回来，仍是应用内提示。
  await openApp(page, '2026-11-27T09:00:00')
  await expect(page.getByRole('heading', { name: '备份提醒' })).toBeVisible()
  await expect(page.getByText('又到了每周一次的备份提醒')).toBeVisible()
})
