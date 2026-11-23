import { test, expect, type Page } from '@playwright/test'
import { goTo, goToSettingsSubPage, openPage } from './navigation'

// 今日页只回答「今天该做什么」：日记卡 → 今夜安排卡 → 本周任务卡 → 备份提醒。
// 断言走可访问角色/名称、可见文本、几何位置与地址；不碰 CSS 类名或组件内部状态。
// 本文件同时跑在桌面 chromium 与 Pixel 7（mobile-chromium）两个项目上。

const CLOCK = '2026-11-20T09:00:00'

function diaryCard(page: Page) {
  return page.getByRole('region', { name: '昨夜记录' })
}

function planCard(page: Page) {
  return page.getByRole('region', { name: '今夜安排' })
}

function weekCard(page: Page) {
  return page.getByRole('region', { name: '本周任务' })
}

function coursePanel(page: Page) {
  return page.getByRole('region', { name: '六周训练' })
}

function diaryPanel(page: Page) {
  return page.getByRole('region', { name: '晨间睡眠日记' })
}

async function openToday(page: Page) {
  await openPage(page, 'today', CLOCK)
}

async function recordNight(page: Page, options: { complete?: boolean } = {}) {
  await goTo(page, 'diary')
  const diary = diaryPanel(page)
  await diary.locator('#lights-off').fill('23:00')
  if (options.complete !== false) {
    await diary.locator('#sleep-onset').fill('30')
    await diary.locator('#final-wake').fill('06:30')
  }
  await diary.locator('#out-of-bed').fill('07:00')
  if (options.complete !== false) {
    await diary.locator('#waso').selectOption('none-remembered')
  }
  await diary.getByRole('button', { name: /保存日记|更新日记/ }).click()
  await expect(diary.getByText('日记已保存在此设备').filter({ visible: true }).first()).toBeVisible()
  await goTo(page, 'today')
}

async function completeScreening(page: Page, options: { pausesRestriction?: boolean } = {}) {
  await goToSettingsSubPage(page, 'screening')
  await page.getByRole('button', { name: '开始自查' }).click()
  await page.getByLabel('你的年龄').fill('30')
  await page
    .getByRole('group', { name: '你是否曾被告知患有双相障碍，或有躁狂/轻躁狂发作史？' })
    .getByLabel(options.pausesRestriction ? '是' : '否')
    .check()
  for (const question of [
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
  await expect(page.getByText(
    options.pausesRestriction ? '睡眠限制暂时暂停。' : '目前没有发现需要暂停睡眠限制的安全筛查项。'
  )).toBeVisible()
  await goTo(page, 'training')
}

async function startCourse(page: Page) {
  await goTo(page, 'training')
  await completeScreening(page)
  await coursePanel(page).getByRole('button', { name: '开始六周训练' }).click()
  await expect(coursePanel(page).getByText('第 1 周 · 第 1 天')).toBeVisible()
}

async function recordBaseline(page: Page, finalWake = '06:00') {
  // 日记不能记未来夜：先推进到基线周末，再补齐四夜。
  await advanceTo(page, '2026-11-05T09:00:00')
  for (const date of ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04']) {
    await goTo(page, 'diary')
    const diary = diaryPanel(page)
    await diary.locator('#diary-date').fill(date)
    await diary.locator('#lights-off').fill('23:00')
    await diary.locator('#sleep-onset').fill('30')
    await diary.locator('#final-wake').fill(finalWake)
    await diary.locator('#out-of-bed').fill('07:00')
    await diary.locator('#waso').selectOption('none-remembered')
    await diary.getByRole('button', { name: /保存日记|更新日记/ }).click()
    await expect(diary.getByText('日记已保存在此设备').filter({ visible: true }).first()).toBeVisible()
  }
}

async function advanceTo(page: Page, time: string) {
  await page.clock.setFixedTime(new Date(time))
  await page.reload()
}

function inFirstScreen(box: { y: number; height: number } | null, viewportHeight: number): boolean {
  return box !== null && box.y >= 0 && box.y + box.height <= viewportHeight
}

test('today shows diary, plan and week cards in that order without a permanent status row', async ({ page }) => {
  await openToday(page)

  await expect(diaryCard(page)).toBeVisible()
  await expect(planCard(page)).toBeVisible()
  // 没有安全自查时，自查入口占据本周任务卡的位置。
  await expect(weekCard(page).getByRole('heading', { name: '先完成安全自查' })).toBeVisible()
  await expect(page.getByRole('region', { name: '今日提示' })).toHaveCount(0)
  // 产品大标题与两段说明只留在首次说明与「关于与隐私」，不再占据今日页。
  await expect(page.getByText('把规律，慢慢带回夜晚。')).toHaveCount(0)
  await expect(page.getByText('你的数据留在此设备')).toHaveCount(0)
  await expect(page.getByText('先了解这是什么')).toHaveCount(0)

  const diaryBox = (await diaryCard(page).boundingBox())!
  const planBox = (await planCard(page).boundingBox())!
  const weekBox = (await weekCard(page).boundingBox())!
  expect(diaryBox.y).toBeLessThan(planBox.y)
  expect(planBox.y).toBeLessThan(weekBox.y)
})

test('ordinary Today cards expose concise right-side actions and decorative arrows', async ({ page }) => {
  await openToday(page)
  const diary = diaryCard(page).getByRole('link')
  const plan = planCard(page).getByRole('link')
  const week = weekCard(page).getByRole('link')

  await expect(diary).toContainText('记录昨夜')
  await expect(plan).toContainText('查看训练')
  await expect(week).toBeVisible()
  await expect(diary.locator('[aria-hidden="true"]').last()).toBeVisible()
  await expect(diary.locator('[aria-hidden="true"]').last()).toHaveAttribute('aria-hidden', 'true')
  const titleBox = await diary.getByRole('heading').boundingBox()
  const actionBox = await diary.locator('.today-card-action').boundingBox()
  const arrowBox = await diary.locator('[aria-hidden="true"]').last().boundingBox()
  expect(Math.abs(titleBox!.y - actionBox!.y)).toBeLessThan(16)
  expect(actionBox!.x).toBeGreaterThan(titleBox!.x)
  expect(arrowBox!.x).toBeGreaterThan(actionBox!.x)
  await expect(diary.getByRole('link')).toHaveCount(0)
})

test('ordinary card titles stay on one line and clipped mobile titles scroll', async ({ page }) => {
  await openToday(page)
  const titles = [diaryCard(page).getByRole('heading'), planCard(page).getByRole('heading'), weekCard(page).getByRole('heading')]
  for (const title of titles) await expect(title).toHaveCSS('white-space', 'nowrap')
  if (page.viewportSize()!.width <= 700) {
    const title = weekCard(page).getByRole('heading')
    await page.addStyleTag({ content: '[aria-label="本周任务"] .today-card-head { width: 180px !important; } [aria-label="本周任务"] h2 { width: 40px !important; }' })
    await expect(title).toHaveAttribute('data-overflow-scroll', 'true')
    await expect(title).toHaveCSS('animation-play-state', 'running')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect(title).toHaveCSS('animation-play-state', 'running')
    await expect(title).toHaveCSS('animation-name', 'none')
  }
})

test('an unrecorded night puts the record action in the first screen', async ({ page }) => {
  await openToday(page)

  const record = diaryCard(page).getByRole('link', { name: /记录昨夜/ })
  await expect(record).toBeVisible()
  const viewport = page.viewportSize()!
  expect(inFirstScreen(await record.boundingBox(), viewport.height), '记录昨夜应在首屏内').toBe(true)
  expect(await page.evaluate(() => window.scrollY)).toBe(0)

  await record.click()
  await expect(page.getByRole('heading', { level: 1, name: '晨间睡眠日记' })).toBeVisible()
  await expect(page).toHaveURL(/#\/diary$/)
})

test('a complete last night summarises SE and TST with view-or-edit', async ({ page }) => {
  await openToday(page)
  await recordNight(page)

  await expect(diaryCard(page).getByText('SE')).toBeVisible()
  await expect(diaryCard(page).getByText('TST')).toBeVisible()
  await expect(diaryCard(page).getByText('87.5%')).toBeVisible()

  const action = diaryCard(page).getByRole('link', { name: /查看或修改/ })
  await expect(action).toBeVisible()
  await action.click()
  await expect(page.getByRole('heading', { level: 1, name: '晨间睡眠日记' })).toBeVisible()
  await expect(diaryPanel(page).locator('#diary-date')).toHaveValue('2026-11-20')
})

test('recording from the today card saves the form default date and then offers view-or-edit', async ({ page }) => {
  await openToday(page)
  await diaryCard(page).getByRole('link', { name: /记录昨夜/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: '晨间睡眠日记' })).toBeVisible()

  // 今日卡查找的日期必须与表单默认日期一致，否则按默认保存后今日卡仍显示未记录。
  const diary = diaryPanel(page)
  await expect(diary.locator('#diary-date')).toHaveValue('2026-11-20')
  await diary.locator('#lights-off').fill('23:00')
  await diary.locator('#sleep-onset').fill('30')
  await diary.locator('#final-wake').fill('06:30')
  await diary.locator('#out-of-bed').fill('07:00')
  await diary.locator('#waso').selectOption('none-remembered')
  await diary.getByRole('button', { name: /保存日记|更新日记/ }).click()
  await expect(diary.getByText('日记已保存在此设备').filter({ visible: true }).first()).toBeVisible()

  await goTo(page, 'today')
  await expect(diaryCard(page).getByRole('link', { name: /查看或修改/ })).toBeVisible()
})

test('a partially recorded night offers completion instead of a summary', async ({ page }) => {
  await openToday(page)
  await recordNight(page, { complete: false })

  const action = diaryCard(page).getByRole('link', { name: /补全记录/ })
  await expect(action).toBeVisible()
  await expect(diaryCard(page).getByText(/只记录了一部分/)).toBeVisible()
  await action.click()
  await expect(page.getByRole('heading', { level: 1, name: '晨间睡眠日记' })).toBeVisible()
})

test('the plan card shows window, fixed wake time and caffeine cutoff', async ({ page }) => {
  await openPage(page, 'training', '2026-11-01T09:00:00')
  await startCourse(page)
  await coursePanel(page).getByRole('button', { name: '确认起床时间' }).click()
  await expect(coursePanel(page).getByText('07:00 已确认，将从第 2 周开始执行。')).toBeVisible()

  await recordBaseline(page)
  await advanceTo(page, '2026-11-08T09:00:00')
  await goTo(page, 'today')

  const plan = planCard(page)
  await expect(plan.getByText('00:00', { exact: true })).toBeVisible()
  await expect(plan.getByText('07:00', { exact: true }).first()).toBeVisible()
  await expect(plan.getByText('窗口长度 7 小时')).toBeVisible()
  await expect(plan.getByText('固定起床时间')).toBeVisible()
  await expect(plan.getByText('咖啡因截止')).toBeVisible()
  await expect(plan.getByText('16:00', { exact: true })).toBeVisible()
  await expect(plan.getByText(/维持期/)).toHaveCount(0)

  await plan.getByRole('link').click()
  await expect(page.getByRole('heading', { level: 1, name: '训练' })).toBeVisible()
  await expect(page).toHaveURL(/#\/training$/)
})

test('an unavailable window explains why and still links into training', async ({ page }) => {
  await openToday(page)

  const plan = planCard(page)
  await expect(plan.getByText(/还没有开始六周训练/)).toBeVisible()
  await expect(plan.getByRole('link')).toBeVisible()

  await plan.getByRole('link').click()
  await expect(page.getByRole('heading', { level: 1, name: '训练' })).toBeVisible()
})

test('a cleared screening without a course shows the start-course card right after the diary', async ({ page }) => {
  await openToday(page)
  await completeScreening(page)
  await goTo(page, 'today')

  const start = page.getByRole('region', { name: '开始六周训练' })
  await expect(start.getByRole('heading', { name: '开始六周训练' })).toBeVisible()
  await expect(start.getByRole('link', { name: /进入训练/ })).toBeVisible()
  await expect(start.locator('[aria-hidden="true"]')).toHaveCount(0)
  // 未开始疗程时不再渲染本周任务卡，开始卡紧跟日记卡。
  await expect(weekCard(page)).toHaveCount(0)

  const diaryBox = (await diaryCard(page).boundingBox())!
  const startBox = (await start.boundingBox())!
  const planBox = (await planCard(page).boundingBox())!
  expect(diaryBox.y).toBeLessThan(startBox.y)
  expect(startBox.y).toBeLessThan(planBox.y)

  await start.getByRole('link').click()
  await expect(page.getByRole('heading', { level: 1, name: '训练' })).toBeVisible()
  await expect(page).toHaveURL(/#\/training$/)
})

test('a missing screening routes to the screening sub-page from the week slot', async ({ page }) => {
  await openToday(page)

  const week = weekCard(page)
  await expect(week.getByRole('heading', { name: '先完成安全自查' })).toBeVisible()
  await week.getByRole('link').click()

  await expect(page.getByRole('heading', { level: 1, name: '安全自查' })).toBeVisible()
  await expect(page).toHaveURL(/#\/settings\/screening$/)
})

test('an active course shows the current week title and its three tasks', async ({ page }) => {
  await openPage(page, 'training', '2026-11-01T09:00:00')
  await startCourse(page)
  await goTo(page, 'today')

  const week = weekCard(page)
  await expect(week.getByRole('heading', { name: '第 1 周 · 记录基线' })).toBeVisible()
  await expect(week.getByRole('listitem')).toHaveCount(3)
  await expect(week.getByText('每天早晨完成睡眠日记')).toBeVisible()
  await expect(week.getByText('选择并确认期望的固定起床时间')).toBeVisible()
  await expect(week.getByText('如身体或情绪状况变化，重新完成安全筛查')).toBeVisible()
  await expect(week.getByRole('link', { name: /查看本周内容/ })).toBeVisible()
  if (page.viewportSize()!.width <= 700) {
    await week.locator('.today-card-head').evaluate((element) => { (element as HTMLElement).style.width = '180px' })
    await expect(week.getByText('查看', { exact: true })).toBeVisible()
    await expect(week.getByText('查看本周内容', { exact: true })).toBeHidden()
  }
})

test('a paused restriction still shows the week tasks and explains the pause on the plan card', async ({ page }) => {
  await openPage(page, 'training', '2026-11-01T09:00:00')
  await startCourse(page)

  await recordBaseline(page)
  await advanceTo(page, '2026-11-08T09:00:00')
  await goTo(page, 'training')
  await coursePanel(page).getByRole('radio', { name: '轮班/倒班' }).check()
  await expect(coursePanel(page).getByText('疗程状态已保存在此设备')).toBeVisible()
  await goTo(page, 'today')

  await expect(weekCard(page).getByRole('heading', { name: '第 2 周 · 锚定固定起床时间' })).toBeVisible()
  await expect(planCard(page).getByText('轮班/倒班作息不进入自动睡眠限制，因此不会生成睡眠窗口。')).toBeVisible()
})

test('maintenance keeps the Today plan concise and preserves the week tasks', async ({ page }) => {
  await openPage(page, 'training', '2026-11-01T09:00:00')
  await startCourse(page)
  await recordBaseline(page)

  await advanceTo(page, '2026-12-13T09:00:00')
  await goTo(page, 'today')

  await expect(planCard(page).getByText(/维持期/)).toHaveCount(0)
  await expect(weekCard(page).getByRole('heading', { name: '第 6 周 · 巩固与复发预防' })).toBeVisible()
  await expect(weekCard(page).getByRole('listitem')).toHaveCount(3)
})

test('today only surfaces abnormal status, with a retry action while the cache is filling', async ({ page }) => {
  await page.addInitScript(() => {
    CacheStorage.prototype.keys = function (this: CacheStorage) {
      return Promise.resolve([])
    }
  })
  await openToday(page)

  const notice = page.getByRole('region', { name: '今日提示' })
  await expect(notice.getByText('训练内容缓存中…')).toBeVisible({ timeout: 30_000 })
  await expect(notice.getByRole('button', { name: '重试' })).toBeVisible()
})

test('a normal cache leaves no status row on today, while settings still reports it', async ({ page }) => {
  await openToday(page)
  await goTo(page, 'settings')
  const status = page.getByRole('region', { name: '应用状态' })
  await expect(status.getByText('当前可离线使用')).toBeVisible({ timeout: 30_000 })
  await expect(status.getByText('偏好已保存在此设备')).toBeVisible()

  await goTo(page, 'today')
  await expect(page.getByRole('region', { name: '今日提示' })).toHaveCount(0)
  await expect(page.getByText('当前可离线使用')).toHaveCount(0)
})

test('storage unavailable surfaces a single-line notice on today', async ({ browser }) => {
  const context = await browser.newContext()
  await context.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true })
  })
  const page = await context.newPage()
  await openPage(page, 'today', CLOCK)

  const notice = page.getByRole('region', { name: '今日提示' })
  await expect(notice.getByText('此浏览器无法使用本地存储')).toBeVisible()
  // 日记卡本身仍然可达，不被状态提示替换。
  await expect(diaryCard(page)).toBeVisible()
  await context.close()
})
