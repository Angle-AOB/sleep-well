import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

function coursePanel(page: Page) {
  return page.getByRole('region', { name: '六周训练' })
}

function diaryPanel(page: Page) {
  return page.getByRole('region', { name: '晨间睡眠日记' })
}

async function openAt(page: Page, time: string) {
  await page.clock.setFixedTime(new Date(time))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '六周训练' })).toBeVisible()
}

async function completeScreening(page: Page) {
  await page.getByRole('button', { name: '开始自查' }).click()
  await page.getByLabel('你的年龄').fill('30')
  await page.getByRole('group', { name: '你是否曾被告知患有双相障碍，或有躁狂/轻躁狂发作史？' }).getByLabel('否').check()
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
  await expect(page.getByText('目前没有发现需要暂停睡眠限制的安全筛查项。')).toBeVisible()
}

async function startCourse(page: Page) {
  await coursePanel(page).getByRole('button', { name: '开始六周训练' }).click()
  await expect(coursePanel(page).getByText('第 1 周')).toBeVisible()
}

async function recordNight(page: Page, date: string) {
  const diary = diaryPanel(page)
  await diary.locator('#diary-date').fill(date)
  await diary.locator('#lights-off').fill('23:00')
  await diary.locator('#sleep-onset').fill('30')
  await diary.locator('#final-wake').fill('06:00')
  await diary.locator('#out-of-bed').fill('07:00')
  await diary.locator('#waso').selectOption('none-remembered')
  await diary.getByRole('button', { name: /保存日记|更新日记/ }).click()
  await expect(diary.getByText('日记已保存在此设备')).toBeVisible()
}

test('six-week course diary and screening are readable offline', async ({ page, context }) => {
  await openAt(page, '2026-12-13T09:00:00')
  await completeScreening(page)
  await startCourse(page)
  await recordNight(page, '2026-12-12')

  // Wait for SW cache to be ready before going offline
  await expect(page.getByText('当前可离线使用')).toBeVisible({ timeout: 15_000 })

  await context.setOffline(true)

  // Reload from cache — verifies the app shell and course content are cached
  await page.reload()
  await expect(page.getByRole('heading', { name: '六周训练' })).toBeVisible()

  // Week track is present with all six weeks
  const weekTrack = coursePanel(page).getByRole('group', { name: '疗程进度' })
  await expect(weekTrack).toBeVisible()
  for (const label of ['基线', '锚定', '限制启动', '巩固']) {
    await expect(weekTrack.getByText(label).first()).toBeVisible()
  }

  // Diary entry is visible
  await expect(diaryPanel(page).getByText('12 月 12 日')).toBeVisible()

  // Screening result is visible
  await expect(page.getByText('目前没有发现需要暂停睡眠限制的安全筛查项。')).toBeVisible()

  // Settings panel is visible
  await expect(page.getByRole('heading', { name: '训练偏好' })).toBeVisible()
})

test('diary recording and settings work offline', async ({ page, context }) => {
  await openAt(page, '2026-12-13T09:00:00')
  await completeScreening(page)
  await startCourse(page)
  await expect(page.getByText('当前可离线使用')).toBeVisible({ timeout: 15_000 })

  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: '六周训练' })).toBeVisible()

  // Record a new diary entry while offline
  await recordNight(page, '2026-12-13')

  // Toggle a setting while offline
  await page.locator('#backup-reminders').click()
  await expect(page.getByText('偏好已保存在此设备').first()).toBeVisible({ timeout: 10_000 })
})
