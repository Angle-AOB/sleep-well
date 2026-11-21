import { test, expect, type Page } from '@playwright/test'
import { goTo, openPage } from './navigation'

// 日记面板保活：选中日期会停在用户上次回看的历史日期。
// 今日卡的三个入口都必须显式请求「今天」，否则保存会写回旧日期，今日卡继续显示未记录。
// 断言走可访问角色/名称与输入框值，不碰组件内部状态。

const CLOCK = '2026-11-20T09:00:00'
const TODAY = '2026-11-20'

function diaryPanel(page: Page) {
  return page.getByRole('region', { name: '晨间睡眠日记' })
}

function diaryCard(page: Page) {
  return page.getByRole('region', { name: '昨夜记录' })
}

async function recordCompleteNight(page: Page) {
  const diary = diaryPanel(page)
  await diary.locator('#lights-off').fill('23:00')
  await diary.locator('#sleep-onset').fill('30')
  await diary.locator('#final-wake').fill('06:30')
  await diary.locator('#out-of-bed').fill('07:00')
  await diary.locator('#waso').selectOption('none-remembered')
  await diary.getByRole('button', { name: /保存日记|更新日记/ }).click()
  await expect(diary.getByText('日记已保存在此设备')).toBeVisible()
}

async function recordPastPartialNight(page: Page) {
  const diary = diaryPanel(page)
  await diary.locator('#diary-date').fill('2026-11-15')
  await diary.locator('#lights-off').fill('22:00')
  await diary.locator('#out-of-bed').fill('06:00')
  await diary.getByRole('button', { name: /保存日记|更新日记/ }).click()
  await expect(diary.getByText('日记已保存在此设备')).toBeVisible()
}

test('the today card resets a history date to today with an empty form', async ({ page }) => {
  await openPage(page, 'diary', CLOCK)
  const diary = diaryPanel(page)
  await recordPastPartialNight(page)

  // 重新打开日记页，再用「最近记录」切回这个历史日期。
  await page.reload()
  await expect(diary.locator('#diary-date')).toHaveValue(TODAY)
  await diary.getByRole('region', { name: '最近记录' }).getByRole('button', { name: /部分记录/ }).click()
  await expect(diary.locator('#diary-date')).toHaveValue('2026-11-15')
  await expect(diary.locator('#lights-off')).toHaveValue('22:00')

  await goTo(page, 'today')
  await diaryCard(page).getByRole('link', { name: /记录昨夜/ }).click()

  await expect(page.getByRole('heading', { level: 1, name: '日记' })).toBeVisible()
  await expect(diary.locator('#diary-date')).toHaveValue(TODAY)
  await expect(diary.locator('#lights-off')).toHaveValue('')
  await expect(diary.locator('#sleep-onset')).toHaveValue('')
  await expect(diary.locator('#final-wake')).toHaveValue('')
  await expect(diary.locator('#out-of-bed')).toHaveValue('')
  await expect(diary.locator('#waso')).toHaveValue('unknown')
})

test('a complete night opens from the today card on today and loads that night', async ({ page }) => {
  await openPage(page, 'diary', CLOCK)
  await recordCompleteNight(page)
  // 把面板留在历史日期，确认查看入口会把它拉回今天。
  await recordPastPartialNight(page)
  await expect(diaryPanel(page).locator('#diary-date')).toHaveValue('2026-11-15')

  await goTo(page, 'today')
  await diaryCard(page).getByRole('link', { name: /查看或修改/ }).click()

  const diary = diaryPanel(page)
  await expect(page.getByRole('heading', { level: 1, name: '日记' })).toBeVisible()
  await expect(diary.locator('#diary-date')).toHaveValue(TODAY)
  await expect(diary.locator('#lights-off')).toHaveValue('23:00')
  await expect(diary.locator('#sleep-onset')).toHaveValue('30')
  await expect(diary.locator('#final-wake')).toHaveValue('06:30')
  await expect(diary.locator('#out-of-bed')).toHaveValue('07:00')
  await expect(diary.locator('#waso')).toHaveValue('none-remembered')
})

test('saving from the today card writes today and then offers view-or-edit', async ({ page }) => {
  await openPage(page, 'diary', CLOCK)
  await recordPastPartialNight(page)

  await goTo(page, 'today')
  await diaryCard(page).getByRole('link', { name: /记录昨夜/ }).click()
  const diary = diaryPanel(page)
  await expect(diary.locator('#diary-date')).toHaveValue(TODAY)

  await recordCompleteNight(page)

  await goTo(page, 'today')
  await expect(diaryCard(page).getByRole('link', { name: /查看或修改/ })).toBeVisible()
  await expect(diaryCard(page).getByText('87.5%')).toBeVisible()
})

test('a resumed app moves the today card to the new local date after midnight', async ({ page }) => {
  await openPage(page, 'diary', CLOCK)
  await recordCompleteNight(page)
  await goTo(page, 'today')
  await expect(diaryCard(page).getByRole('link', { name: /查看或修改/ })).toBeVisible()

  await page.clock.setFixedTime(new Date(2026, 10, 21, 7, 0, 0))
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))

  await expect(diaryCard(page).getByRole('link', { name: /记录昨夜/ })).toBeVisible()
  await expect(diaryCard(page).getByRole('link', { name: /查看或修改/ })).toHaveCount(0)
})
