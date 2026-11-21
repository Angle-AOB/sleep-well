import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { goTo, openPage } from './navigation'

// 训练页两屏预算与六周轨道的行为契约。全部断言走可访问角色、可见性与几何尺寸，
// 不绑定组件内部结构；视口固定为 Pixel 7（412×915）以覆盖真实移动端度量。

test.use({ viewport: { width: 412, height: 915 } })

function coursePanel(page: Page) {
  return page.getByRole('region', { name: '六周训练' })
}

function weekTrack(page: Page) {
  return coursePanel(page).getByRole('group', { name: '疗程进度' })
}

async function startCourse(page: Page) {
  await openPage(page, 'training', '2026-11-01T09:00:00')
  await coursePanel(page).getByRole('button', { name: '开始六周训练' }).click()
  await expect(coursePanel(page).getByText('第 1 周 · 第 1 天')).toBeVisible()
}

async function advanceTo(page: Page, time: string) {
  await page.clock.setFixedTime(new Date(time))
  await page.reload()
}

async function completeScreening(page: Page) {
  await goTo(page, 'settings')
  await page.getByRole('button', { name: '开始自查' }).click()
  await page.getByLabel('你的年龄').fill('30')
  for (const question of [
    '你是否曾被告知患有双相障碍，或有躁狂/轻躁狂发作史？',
    '你是否有癫痫或惊厥病史？',
    '你是否有响亮鼾声、目击呼吸暂停、白天嗜睡或高血压等情况？',
    '你是否有危险性异态睡眠，例如梦游时可能受伤？',
    '你目前是否怀孕？',
    '你是否会在驾驶或高风险工作时难以保持清醒？',
    '你目前是否有急性不稳定的身心状况，需要尽快获得专业评估？'
  ]) {
    await page.getByRole('group', { name: question }).getByLabel('否').check()
  }
  await page.getByLabel('睡眠困扰持续多久？').selectOption('one-to-four-weeks')
  await page.getByLabel('最近一周，大约有几晚受到睡眠困扰影响？').selectOption('one-to-two')
  await page.getByLabel('睡眠困扰对日间生活影响多大？').selectOption('some')
  await page.getByRole('group', { name: '目前这件事给你带来多大困扰？' }).getByLabel('有一些困扰').check()
  await page.getByLabel('你最希望改善什么？').selectOption('fall-asleep')
  await page.getByRole('button', { name: '提交自查' }).click()
  await expect(page.getByText('目前没有发现需要暂停睡眠限制的安全筛查项。')).toBeVisible()
  await goTo(page, 'training')
}

async function recordCompleteNight(page: Page, date: string, finalWake = '06:00') {
  await goTo(page, 'diary')
  const diary = page.getByRole('region', { name: '晨间睡眠日记' })
  await diary.locator('#diary-date').fill(date)
  await diary.locator('#lights-off').fill('23:00')
  await diary.locator('#sleep-onset').fill('30')
  await diary.locator('#final-wake').fill(finalWake)
  await diary.locator('#out-of-bed').fill('07:00')
  await diary.locator('#waso').selectOption('none-remembered')
  await diary.getByRole('button', { name: /保存日记|更新日记/ }).click()
  await expect(diary.getByText('日记已保存在此设备')).toBeVisible()
  await goTo(page, 'training')
}

async function reachWeekThree(page: Page) {
  await startCourse(page)
  await completeScreening(page)
  await coursePanel(page).getByRole('button', { name: '确认起床时间' }).click()
  await expect(coursePanel(page).getByText('07:00 已确认，将从第 2 周开始执行。')).toBeVisible()

  await advanceTo(page, '2026-11-05T09:00:00')
  for (const date of ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04']) {
    await recordCompleteNight(page, date)
  }
  await advanceTo(page, '2026-11-11T09:00:00')
  for (const date of ['2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11']) {
    await recordCompleteNight(page, date, '07:00')
  }
  await advanceTo(page, '2026-11-15T09:00:00')
  await expect(coursePanel(page).getByText('第 3 周 · 第 1 天')).toBeVisible()
}

async function reachWeekFour(page: Page) {
  await reachWeekThree(page)
  await advanceTo(page, '2026-11-18T09:00:00')
  for (const date of ['2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18']) {
    await recordCompleteNight(page, date, '07:00')
  }
  await advanceTo(page, '2026-11-22T09:00:00')
  await expect(coursePanel(page).getByText('第 4 周 · 第 1 天')).toBeVisible()
}

test('the six-week track scrolls sideways on its own without widening the page', async ({ page }) => {
  await startCourse(page)
  const track = weekTrack(page)
  await expect(track.getByRole('button')).toHaveCount(6)

  const before = await track.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    overflowX: getComputedStyle(element).overflowX
  }))
  expect(before.overflowX, '轨道自身承担横向滑动').toBe('auto')
  expect(before.scrollWidth, '六周卡片应超出一行宽度').toBeGreaterThan(before.clientWidth)

  await track.evaluate((element) => element.scrollTo({ left: element.scrollWidth }))
  await expect.poll(() => track.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0)

  const documentWidth = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth
  }))
  expect(documentWidth.scrollWidth, '轨道横滑不得撑宽整页').toBeLessThanOrEqual(documentWidth.clientWidth)
})

test('previewing another week keeps the current week marked and says so above the content', async ({ page }) => {
  await startCourse(page)
  const track = weekTrack(page)
  const current = track.getByRole('button', { name: /01/ })
  const other = track.getByRole('button', { name: /05/ })
  await expect(current).toHaveAttribute('aria-current', 'step')

  await other.click()
  await expect(coursePanel(page).getByText('正在预览第 5 周')).toBeVisible()
  await expect(coursePanel(page).getByRole('heading', { name: '第 5 周 · 滴定与认知练习' })).toBeVisible()

  // 预览只改内容，不改变“当前进行到第几周”的语义。
  await expect(current).toHaveAttribute('aria-current', 'step')
  await expect(other).not.toHaveAttribute('aria-current', 'step')
})

test('this week content and the sleep window both fit within two screens', async ({ page }) => {
  await reachWeekThree(page)
  const viewportHeight = page.viewportSize()!.height
  const content = coursePanel(page).getByRole('region', { name: '第 3 周 · 启动睡眠限制' })
  const wakeTime = coursePanel(page).getByRole('region', { name: '固定起床时间' })
  const windowCard = coursePanel(page).getByRole('region', { name: '本周睡眠窗口' })

  for (const [label, region] of [['本周内容', content], ['固定起床时间', wakeTime], ['睡眠窗口', windowCard]] as const) {
    const box = await region.boundingBox()
    expect(box, `${label}应有布局盒`).not.toBeNull()
    expect(
      box!.y + box!.height,
      `${label}的底边应在两屏内（视口 ${viewportHeight}px）`
    ).toBeLessThanOrEqual(viewportHeight * 2)
  }
})

test('titration details start collapsed and expand on demand', async ({ page }) => {
  await reachWeekFour(page)
  const panel = coursePanel(page)
  const toggle = panel.getByRole('button', { name: '展开滴定明细' })
  await expect(toggle).toBeVisible()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(panel.getByRole('heading', { name: '滴定明细' })).toHaveCount(0)
  await expect(panel.getByText(/第 4 周：依据该周之前的 4 个完整夜/)).toBeHidden()

  await toggle.click()
  await expect(panel.getByRole('button', { name: '收起滴定明细' })).toHaveAttribute('aria-expanded', 'true')
  await expect(panel.getByRole('heading', { name: '滴定明细' })).toBeVisible()
  await expect(panel.getByText(/第 4 周：依据该周之前的 4 个完整夜/)).toBeVisible()
})
