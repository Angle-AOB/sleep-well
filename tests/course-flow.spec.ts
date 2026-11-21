import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import i18n from '../src/i18n'
import { durationText } from '../src/format'

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

async function advanceTo(page: Page, time: string) {
  await page.clock.setFixedTime(new Date(time))
  await page.reload()
}

async function startCourse(page: Page) {
  await coursePanel(page).getByRole('button', { name: '开始六周训练' }).click()
  await expect(coursePanel(page).getByText('第 1 周 · 第 1 天')).toBeVisible()
}

async function completeScreening(page: Page, options: { pausesRestriction?: boolean } = {}) {
  await page.getByRole('button', { name: '开始自查' }).click()
  await page.getByLabel('你的年龄').fill('30')
  const bipolar = options.pausesRestriction ? '是' : '否'
  await page.getByRole('group', { name: '你是否曾被告知患有双相障碍，或有躁狂/轻躁狂发作史？' }).getByLabel(bipolar).check()
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

  await expect(page.getByText(
    options.pausesRestriction ? '睡眠限制暂时暂停。' : '目前没有发现需要暂停睡眠限制的安全筛查项。'
  )).toBeVisible()
}

async function recordCompleteNight(page: Page, date: string, finalWake = '06:00') {
  const diary = diaryPanel(page)
  await diary.locator('#diary-date').fill(date)
  await diary.locator('#lights-off').fill('23:00')
  await diary.locator('#sleep-onset').fill('30')
  await diary.locator('#final-wake').fill(finalWake)
  await diary.locator('#out-of-bed').fill('07:00')
  await diary.locator('#waso').selectOption('none-remembered')
  await diary.getByRole('button', { name: /保存日记|更新日记/ }).click()
  await expect(diary.getByText('日记已保存在此设备')).toBeVisible()
}

async function recordBaseline(page: Page) {
  for (const date of ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04']) {
    await recordCompleteNight(page, date)
  }
}

/** 卧床 11 小时（22:00–09:00）的一夜，用于构造超过 10 小时的产品上限。 */
async function recordLongNight(page: Page, date: string) {
  const diary = diaryPanel(page)
  await diary.locator('#diary-date').fill(date)
  await diary.locator('#lights-off').fill('22:00')
  await diary.locator('#sleep-onset').fill('30')
  await diary.locator('#final-wake').fill('08:30')
  await diary.locator('#out-of-bed').fill('09:00')
  await diary.locator('#waso').selectOption('none-remembered')
  await diary.getByRole('button', { name: /保存日记|更新日记/ }).click()
  await expect(diary.getByText('日记已保存在此设备')).toBeVisible()
}

test('an over-limit W2 candidate is shown as a candidate, with no titration or pause claim', async ({ page }) => {
  await openAt(page, '2026-11-01T09:00:00')
  await startCourse(page)
  await completeScreening(page)
  await coursePanel(page).locator('#fixed-wake-time').fill('09:00')
  await coursePanel(page).getByRole('button', { name: '确认起床时间' }).click()
  await expect(coursePanel(page).getByText('09:00 已确认，将从第 2 周开始执行。')).toBeVisible()

  await advanceTo(page, '2026-11-05T09:00:00')
  for (const date of ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04']) {
    await recordLongNight(page, date)
  }
  await advanceTo(page, '2026-11-08T09:00:00')

  const panel = coursePanel(page)
  await expect(panel.getByText('第 2 周 · 第 1 天')).toBeVisible()
  await expect(panel.getByRole('heading', { name: '候选睡眠窗口' })).toHaveCount(0)
  await expect(panel.getByText('睡眠限制：预览')).toBeVisible()
  // 22:00–09:00 卧床 660 分钟，SOL 30、终末清醒 30、WASO 0 → TST 600；+30 分钟 = 630。
  const expectedCandidate = durationText(i18n.getFixedT('zh-CN'), 630)
  await expect(panel.getByText(new RegExp(
    `^按规则计算的候选窗口约为 ${expectedCandidate}，超过 10 小时的产品上限：候选窗口暂不生成`
  ))).toBeVisible()
  // W2 还没有滴定：既没有滴定卡，也不应出现“已暂停”的说法。
  await expect(panel.getByRole('heading', { name: '每周滴定' })).toHaveCount(0)
  await expect(panel.getByText(/睡眠限制：暂停/)).toHaveCount(0)
  await expect(panel.getByText(/暂停/)).toHaveCount(0)
})

test('starting the course opens the baseline week and survives a reload', async ({ page }) => {
  await openAt(page, '2026-11-01T09:00:00')
  const panel = coursePanel(page)
  await expect(panel.getByText('还没有开始六周训练。')).toBeVisible()

  await startCourse(page)

  await expect(panel.getByRole('heading', { name: '第 1 周 · 记录基线' })).toBeVisible()
  await expect(panel.getByText('基线周只记录日记，不生成睡眠窗口。')).toBeVisible()
  await expect(panel.getByText('疗程状态已保存在此设备')).toBeVisible()
  // W1 还没有刺激控制内容。
  await expect(panel.getByRole('heading', { name: '刺激控制' })).toHaveCount(0)

  await page.reload()
  await expect(coursePanel(page).getByText('第 1 周 · 第 1 天')).toBeVisible()
  await expect(coursePanel(page).getByRole('heading', { name: '第 1 周 · 记录基线' })).toBeVisible()
})

test('W2 previews the baseline window, defers a wake-time change, and W3 activates it', async ({ page }) => {
  await openAt(page, '2026-11-01T09:00:00')
  await startCourse(page)
  await completeScreening(page)
  await coursePanel(page).getByRole('button', { name: '确认起床时间' }).click()
  await expect(coursePanel(page).getByText('07:00 已确认，将从第 2 周开始执行。')).toBeVisible()

  await advanceTo(page, '2026-11-05T09:00:00')
  await recordBaseline(page)
  await advanceTo(page, '2026-11-08T09:00:00')

  const panel = coursePanel(page)
  await expect(panel.getByText('第 2 周 · 第 1 天')).toBeVisible()
  await expect(panel.getByRole('heading', { name: '候选睡眠窗口' })).toBeVisible()
  await expect(panel.getByText('预览', { exact: true })).toBeVisible()
  await expect(panel.getByText('睡眠限制：预览')).toBeVisible()
  // W2 仍未进入刺激控制。
  await expect(panel.getByRole('heading', { name: '刺激控制' })).toHaveCount(0)
  await expect(panel.getByText('00:00', { exact: true })).toBeVisible()
  await expect(panel.getByText('07:00', { exact: true })).toBeVisible()
  await expect(panel.getByText('窗口长度 7 小时')).toBeVisible()
  await expect(panel.getByText('依据第 1 周基线中的 4 个完整夜：平均 TST 6 小时 30 分钟，平均 TIB 8 小时。')).toBeVisible()
  await expect(panel.getByText('第 2 周仅预览候选窗口，不执行睡眠限制；第 3 周重新校准后才正式启用。')).toBeVisible()
  await expect(panel.getByText('睡前 8 小时：16:00 前停止摄入咖啡因。')).toBeVisible()
  await expect(panel.getByText('近 7 夜实际起床时间中位数是 07:00，可以作为预填建议。')).toBeVisible()

  await panel.locator('#fixed-wake-time').fill('06:30')
  await panel.getByRole('button', { name: '更新起床时间' }).click()
  await expect(panel.getByText('06:30 将从第 3 周窗口周期生效；本周窗口保持不变。')).toBeVisible()
  await expect(panel.getByText('00:00', { exact: true })).toBeVisible()
  await expect(panel.getByText('07:00', { exact: true })).toBeVisible()

  await advanceTo(page, '2026-11-11T09:00:00')
  for (const date of ['2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11']) {
    await recordCompleteNight(page, date, '07:00')
  }
  await advanceTo(page, '2026-11-15T09:00:00')

  await expect(panel.getByText('第 3 周 · 第 1 天')).toBeVisible()
  await expect(panel.getByRole('heading', { name: '本周睡眠窗口' })).toBeVisible()
  await expect(panel.getByText('已启用', { exact: true })).toBeVisible()
  await expect(panel.getByText('22:30', { exact: true })).toBeVisible()
  await expect(panel.getByText('06:30', { exact: true })).toBeVisible()
  await expect(panel.getByText('窗口长度 8 小时')).toBeVisible()
  await expect(panel.getByText('依据第 2 周锚定周中的 4 个完整夜：平均 TST 7 小时 30 分钟，平均 TIB 8 小时。')).toBeVisible()
  await expect(panel.getByText('睡前 8 小时：14:30 前停止摄入咖啡因。')).toBeVisible()
})

test('shift work keeps the course and diary available while pausing automatic windows', async ({ page }) => {
  await openAt(page, '2026-11-01T09:00:00')
  await startCourse(page)
  await completeScreening(page)

  await advanceTo(page, '2026-11-05T09:00:00')
  await recordBaseline(page)
  await advanceTo(page, '2026-11-08T09:00:00')

  const panel = coursePanel(page)
  await expect(panel.getByText('第 2 周 · 第 1 天')).toBeVisible()
  await panel.getByRole('radio', { name: '轮班/倒班' }).check()

  await expect(panel.getByText('轮班/倒班作息不进入自动睡眠限制，因此不会生成睡眠窗口。')).toBeVisible()
  // W2 只预览：安全闸门仍然拦截窗口，但此刻没有可暂停的睡眠限制。
  await expect(panel.getByText('睡眠限制：预览')).toBeVisible()
  await expect(panel.getByText(/暂停/)).toHaveCount(0)
  await expect(panel.getByText('窗口长度', { exact: false })).toHaveCount(0)
  await expect(panel.getByRole('heading', { name: '第 2 周 · 锚定固定起床时间' })).toBeVisible()
  await expect(diaryPanel(page)).toBeVisible()

  // 到 W3 后滴定卡独立于窗口渲染，轮班暂停文案必须可达。
  await advanceTo(page, '2026-11-11T09:00:00')
  for (const date of ['2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11']) {
    await recordCompleteNight(page, date)
  }
  await advanceTo(page, '2026-11-15T09:00:00')
  await expect(panel.getByRole('heading', { name: '每周滴定' })).toBeVisible()
  await expect(panel.getByText('轮班/倒班作息不进入自动睡眠限制与滴定：窗口保持不变。如仍希望进行睡眠限制，建议先咨询睡眠或医疗专业人士。')).toBeVisible()
})

test('a screening that needs review blocks the automatic window without blocking the diary', async ({ page }) => {
  await openAt(page, '2026-11-01T09:00:00')
  await startCourse(page)
  await completeScreening(page, { pausesRestriction: true })

  await advanceTo(page, '2026-11-05T09:00:00')
  await recordBaseline(page)
  await advanceTo(page, '2026-11-08T09:00:00')

  const panel = coursePanel(page)
  await expect(panel.getByText('安全筛查提示需要专业评估：本周不生成候选窗口。仍可记录日记和查看训练内容。')).toBeVisible()
  // W2 尚未启用睡眠限制：状态是预览，不能出现“暂停”。
  await expect(panel.getByText('睡眠限制：预览')).toBeVisible()
  await expect(panel.getByText(/暂停/)).toHaveCount(0)
  await expect(panel.getByText('窗口长度', { exact: false })).toHaveCount(0)
  await expect(panel.getByText('睡前 8 小时：15:30 前停止摄入咖啡因。')).toBeVisible()
  await expect(panel.getByText('按最近 7 夜入睡时间的中位数倒推 8 小时')).toBeVisible()
  await expect(diaryPanel(page)).toBeVisible()

  // 高风险暂停同样要能在滴定卡上看到，而不是只藏在窗口卡里。
  await advanceTo(page, '2026-11-11T09:00:00')
  for (const date of ['2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11']) {
    await recordCompleteNight(page, date)
  }
  await advanceTo(page, '2026-11-15T09:00:00')
  await expect(panel.getByRole('heading', { name: '每周滴定' })).toBeVisible()
  await expect(panel.getByText('安全筛查提示需要专业评估：睡眠限制与每周滴定已暂停，窗口保持不变。')).toBeVisible()
})

test('W4 explains the weekly adjustment, teaches stimulus control, and can defer the change', async ({ page }) => {
  await openAt(page, '2026-11-01T09:00:00')
  await startCourse(page)
  await completeScreening(page)
  await coursePanel(page).getByRole('button', { name: '确认起床时间' }).click()
  await expect(coursePanel(page).getByText('07:00 已确认，将从第 2 周开始执行。')).toBeVisible()

  await advanceTo(page, '2026-11-05T09:00:00')
  await recordBaseline(page)
  await advanceTo(page, '2026-11-11T09:00:00')
  for (const date of ['2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11']) {
    await recordCompleteNight(page, date, '07:00')
  }

  await advanceTo(page, '2026-11-15T09:00:00')
  const panel = coursePanel(page)
  await expect(panel.getByText('第 3 周 · 第 1 天')).toBeVisible()
  await expect(panel.getByRole('heading', { name: '刺激控制' })).toBeVisible()
  await expect(panel.getByText('“约 20 分钟”是近似判断，不必看钟，也不需要夜间使用手机计时器。')).toBeVisible()
  await expect(panel.getByText('窗口长度由规则计算，不能手动修改。')).toBeVisible()
  await expect(panel.getByText('第 4 周将进行第一次滴定：依据该周开始前 7 夜的完整夜平均 SE，窗口最多调整一次。')).toBeVisible()

  await advanceTo(page, '2026-11-18T09:00:00')
  for (const date of ['2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18']) {
    await recordCompleteNight(page, date, '07:00')
  }
  await advanceTo(page, '2026-11-22T09:00:00')

  await expect(panel.getByText('第 4 周 · 第 1 天')).toBeVisible()
  await expect(panel.getByText('窗口长度 8 小时 15 分钟')).toBeVisible()
  await expect(panel.getByText('22:45', { exact: true })).toBeVisible()
  await expect(panel.getByText('睡眠限制：进行中')).toBeVisible()
  // W4 的窗口校准仍来自第 2 周锚定周，而不是“最近 7 夜”的滑动窗口。
  await expect(panel.getByText('依据第 2 周锚定周中的 4 个完整夜：平均 TST 7 小时 30 分钟，平均 TIB 8 小时。')).toBeVisible()
  await expect(panel.getByText(
    '该滴定周之前的 4 个完整夜平均 SE 93.80%（高于 90%）：窗口从 8 小时延长到 8 小时 15 分钟（+15 分钟）。'
  )).toBeVisible()
  // 8 小时 15 分钟必须能追溯到它来自第 4 周的 +15 分钟。
  await expect(panel.getByRole('heading', { name: '滴定明细' })).toBeVisible()
  await expect(panel.getByText(
    '第 4 周：依据该周之前的 4 个完整夜（平均 SE 93.80%），窗口从 8 小时延长 15 分钟，变为 8 小时 15 分钟。'
  )).toBeVisible()

  await panel.getByRole('button', { name: '推迟本周滴定' }).click()
  await expect(panel.getByText('窗口长度 8 小时')).toBeVisible()
  await expect(panel.getByText(
    '你已推迟本周滴定：窗口保持 8 小时。推迟只影响这一周，下一周仍会照常滴定。'
  )).toBeVisible()

  await page.reload()
  await expect(coursePanel(page).getByText('窗口长度 8 小时')).toBeVisible()
  await expect(coursePanel(page).getByText('你已推迟本周滴定：窗口保持 8 小时。推迟只影响这一周，下一周仍会照常滴定。')).toBeVisible()
})

test('a titration adjustment cannot be deferred after the week has started', async ({ page }) => {
  await openAt(page, '2026-11-01T09:00:00')
  await startCourse(page)
  await completeScreening(page)
  await coursePanel(page).getByRole('button', { name: '确认起床时间' }).click()
  await expect(coursePanel(page).getByText('07:00 已确认，将从第 2 周开始执行。')).toBeVisible()

  await advanceTo(page, '2026-11-05T09:00:00')
  await recordBaseline(page)
  await advanceTo(page, '2026-11-11T09:00:00')
  for (const date of ['2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11']) {
    await recordCompleteNight(page, date, '07:00')
  }
  await advanceTo(page, '2026-11-18T09:00:00')
  for (const date of ['2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18']) {
    await recordCompleteNight(page, date, '07:00')
  }
  await advanceTo(page, '2026-11-22T09:00:00')

  const panel = coursePanel(page)
  await expect(panel.getByText('第 4 周 · 第 1 天')).toBeVisible()
  await expect(panel.getByText('窗口长度 8 小时 15 分钟')).toBeVisible()
  await expect(panel.getByRole('button', { name: '推迟本周滴定' })).toBeVisible()

  // 本周第一份日记落库后，调整已开始执行，不能把它回溯成旧窗口。
  await recordCompleteNight(page, '2026-11-22', '07:00')

  await expect(panel.getByText('窗口长度 8 小时 15 分钟')).toBeVisible()
  await expect(panel.getByRole('button', { name: '推迟本周滴定' })).toHaveCount(0)
  await expect(panel.getByText('本周已开始执行，滴定调整不能撤回。')).toBeVisible()

  await page.reload()
  await expect(coursePanel(page).getByText('窗口长度 8 小时 15 分钟')).toBeVisible()
  await expect(coursePanel(page).getByRole('button', { name: '推迟本周滴定' })).toHaveCount(0)
})

test('all six weeks are viewable; future weeks show a preview banner and keep actions on the current week', async ({ page }) => {
  await openAt(page, '2026-11-01T09:00:00')
  await startCourse(page)
  await completeScreening(page)
  const panel = coursePanel(page)
  const weekTrack = panel.getByRole('group', { name: '疗程进度' })

  // 未开始的周也能查看内容——六周内容应当完整可见。
  await weekTrack.getByRole('button', { name: /05/ }).click()
  await expect(panel.getByRole('heading', { name: '第 5 周 · 滴定与认知练习' })).toBeVisible()
  await expect(panel.getByText('正在查看第 5 周内容；当前进行到第 1 周。这里只是内容预览，训练动作仍按当前周执行。')).toBeVisible()

  // 预览期间训练动作仍作用于当前周：确认固定起床时间能正常保存。
  await panel.locator('#fixed-wake-time').fill('07:00')
  await panel.getByRole('button', { name: '确认起床时间' }).click()
  await expect(panel.getByText('疗程状态已保存在此设备')).toBeVisible()

  // 回到第 1 周，提示消失。
  await weekTrack.getByRole('button', { name: /01/ }).click()
  await expect(panel.getByRole('heading', { name: '第 1 周 · 记录基线' })).toBeVisible()
  await expect(panel.getByText(/正在查看第/)).toBeHidden()
})
