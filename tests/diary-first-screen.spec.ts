import { test, expect, type Locator, type Page } from '@playwright/test'
import { openPage } from './navigation'

// 日记页首屏预算：核心记录（日期、关停灯/SOL/最终醒来/起床、指标摘要、保存）
// 必须在一屏内完成，保存按钮固定在底栏上方、滚动后仍在视口里。
// 断言只走可访问角色/名称、可见性、几何位置与滚动溢出，不碰组件内部结构。
// 本文件同时跑在桌面 chromium 与 Pixel 7（mobile-chromium）两个项目上。

const coreInputIds = ['lights-off', 'sleep-onset', 'final-wake', 'out-of-bed'] as const
const MIN_TARGET = 44

async function openDiary(page: Page) {
  await openPage(page, 'diary', '2026-11-20T08:00:00')
  // 日记表单异步装载：先等第一个核心输入出现，再量首屏。
  await expect(page.locator('#lights-off')).toBeVisible()
}

function saveButton(page: Page): Locator {
  return page.getByRole('button', { name: /保存日记|更新日记/ })
}

function summary(page: Page): Locator {
  return page.getByRole('group', { name: '指标摘要' })
}

async function expectAboveTheFold(page: Page, target: Locator, what: string) {
  const viewport = page.viewportSize()
  expect(viewport, '项目应声明视口尺寸').not.toBeNull()
  await expect(target, `${what}应可见`).toBeVisible()

  const box = await target.boundingBox()
  expect(box, `${what} 应有布局盒`).not.toBeNull()
  expect(box!.y, `${what} 顶部应在首屏内`).toBeGreaterThanOrEqual(0)
  expect(box!.y + box!.height, `${what} 底部应在首屏内（不滚动）`).toBeLessThanOrEqual(viewport!.height)
  expect(box!.x, `${what} 左侧应在视口内`).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width, `${what} 右侧应在视口内`).toBeLessThanOrEqual(viewport!.width)
  // 首屏意味着用户还没滚动过。
  expect(await page.evaluate(() => window.scrollY), '首屏断言前不应有滚动').toBe(0)
}

/** 固定保存栏的顶边：核心输入必须完全落在它上方，不能被栏体盖住。 */
async function saveBarTop(page: Page): Promise<number> {
  return saveButton(page).evaluate((button) => {
    const bar = button.closest('.diary-savebar')
    if (!bar) throw new Error('保存按钮应位于固定保存栏内')
    return bar.getBoundingClientRect().top
  })
}

async function inViewport(page: Page, target: Locator): Promise<boolean> {
  const viewport = page.viewportSize()!
  const box = await target.boundingBox()
  return box !== null && box.y >= 0 && box.y + box.height <= viewport.height
}

async function expectInViewport(page: Page, target: Locator, what: string) {
  await expect(target, `${what}应可见`).toBeVisible()
  await expect.poll(() => inViewport(page, target), {
    message: `${what}应滚入视口（顶部 ≥ 0 且底部 ≤ 视口高度）`
  }).toBe(true)
}

/** 等提交后的滚动副作用执行完（两帧），再断言页面没有被意外滚动。 */
async function settleScroll(page: Page) {
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  }))
}

test('opening the diary shows the save button in the first screen', async ({ page }) => {
  await openDiary(page)
  await expectAboveTheFold(page, saveButton(page), '保存按钮')
})

test('the four core inputs and the metric summary fit in the first screen', async ({ page }) => {
  await openDiary(page)

  // 日期是首屏记录的起点，和四项核心输入一起作为首屏预算的一部分。
  await expectAboveTheFold(page, page.locator('#diary-date'), '记录日期')

  const barTop = await saveBarTop(page)
  for (const id of coreInputIds) {
    const input = page.locator(`#${id}`)
    await expectAboveTheFold(page, input, `核心输入 #${id}`)
    const box = (await input.boundingBox())!
    expect(box.y + box.height, `核心输入 #${id} 不能被固定保存栏盖住`).toBeLessThanOrEqual(barTop)
  }

  const summaryRegion = summary(page)
  await expectAboveTheFold(page, summaryRegion, '指标摘要')
  await expect(summaryRegion).toContainText('TIB')
  await expect(summaryRegion).toContainText('TST')
  await expect(summaryRegion).toContainText('SE')
  await expect(summaryRegion).not.toContainText('终末清醒')
})

test('the save button stays in the viewport after scrolling to the second screen', async ({ page }) => {
  await openDiary(page)
  await page.locator('#lights-off').fill('23:00')
  await page.locator('#out-of-bed').fill('07:00')

  // 第二屏内容出现后整页才够高，滚动才有意义。
  await expect(page.getByRole('region', { name: '最近记录' })).toBeVisible()
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)

  const button = saveButton(page)
  const viewport = page.viewportSize()!
  const box = await button.boundingBox()
  expect(box!.y, '滚动后保存按钮顶部仍在视口内').toBeGreaterThanOrEqual(0)
  expect(box!.y + box!.height, '滚动后保存按钮底部仍在视口内').toBeLessThanOrEqual(viewport.height)

  // 滚到底时最后一项输入与最近记录都在保存栏上方，固定栏没有压住内容。
  const lastInput = (await page.getByRole('checkbox', { name: '运动' }).boundingBox())!
  expect(lastInput.y + lastInput.height, '滚到底时最后一项输入应在保存栏上方').toBeLessThanOrEqual(box!.y)
  const history = (await page.getByRole('region', { name: '最近记录' }).boundingBox())!
  expect(history.y + history.height, '滚到底时最近记录应在保存栏上方').toBeLessThanOrEqual(box!.y)

  // 底部固定栏可以盖住内容，但不能盖住按钮本身：点它必须能真正提交。
  await button.click()
  await expect(page.getByText('日记已保存在此设备')).toBeVisible()
})

test('saving from the first screen keeps the page at the top', async ({ page }) => {
  await openDiary(page)
  await page.locator('#lights-off').fill('23:00')
  await page.locator('#out-of-bed').fill('07:00')

  await saveButton(page).click()
  await expect(page.getByRole('status').filter({ hasText: '日记已保存在此设备' })).toBeVisible()
  await settleScroll(page)

  // 首屏保存时提示本来完整可见，不能因此把日期与输入顶出视口。
  expect(await page.evaluate(() => window.scrollY), '第一屏保存后不应滚动').toBe(0)
  await expectInViewport(page, page.locator('#diary-date'), '记录日期')
  await expectInViewport(page, saveButton(page), '保存按钮')
})

test('saving from the second screen scrolls the success status into view', async ({ page }) => {
  await openDiary(page)
  await page.locator('#lights-off').fill('23:00')
  await page.locator('#out-of-bed').fill('07:00')
  await page.locator('#waso').selectOption('none-remembered')

  await expect(page.getByRole('region', { name: '最近记录' })).toBeVisible()
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)

  await saveButton(page).click()
  await expectInViewport(
    page,
    page.getByRole('status').filter({ hasText: '日记已保存在此设备' }),
    '保存成功提示'
  )
})

test('saving with a validation problem scrolls the problem prompt into view', async ({ page }) => {
  await openDiary(page)
  await page.locator('#lights-off').fill('23:00')
  await page.locator('#final-wake').fill('08:00')
  await page.locator('#out-of-bed').fill('07:00')

  await expect(page.getByRole('region', { name: '最近记录' })).toBeVisible()
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)

  await saveButton(page).click()
  // 具体问题与“请先修正”都必须在提交后进入视口，播报语义保持 alert/status。
  await expectInViewport(
    page,
    page.getByRole('alert').filter({ hasText: '最终醒来时间晚于起床时间，请修正。' }),
    '校验问题'
  )
  await expectInViewport(
    page,
    page.getByRole('status').filter({ hasText: '请先修正上面的问题，再保存日记。' }),
    '请先修正提示'
  )
})

test('a save failure from the second screen scrolls the error alert into view', async ({ page }) => {
  await page.addInitScript(() => {
    IDBObjectStore.prototype.put = function put() {
      throw new DOMException('storage is full', 'QuotaExceededError')
    }
  })
  await openDiary(page)
  await page.locator('#lights-off').fill('23:00')
  await page.locator('#out-of-bed').fill('07:00')
  await page.locator('#waso').selectOption('none-remembered')

  await expect(page.getByRole('region', { name: '最近记录' })).toBeVisible()
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)

  await saveButton(page).click()
  await expectInViewport(
    page,
    page.getByRole('alert').filter({ hasText: '无法保存日记。请检查此设备存储空间后重试。' }),
    '保存失败提示'
  )
})

test('the second screen keeps night wakes, WASO, quality, tags, full metrics and history below the summary', async ({ page }) => {
  await openDiary(page)

  const summaryBox = (await summary(page).boundingBox())!
  const secondScreen: { name: string; target: Locator }[] = [
    { name: '夜醒次数', target: page.locator('#night-wakes') },
    { name: 'WASO', target: page.locator('#waso') },
    { name: '主观睡眠质量', target: page.getByRole('group', { name: '主观睡眠质量' }) },
    { name: '行为标签', target: page.getByRole('group', { name: '昨夜的行为标签' }) },
    { name: '完整指标', target: page.getByRole('region', { name: '本页指标' }) },
    { name: '最近记录', target: page.getByRole('region', { name: '最近记录' }) }
  ]

  for (const item of secondScreen) {
    await expect(item.target, `${item.name}应可见`).toBeVisible()
    const box = (await item.target.boundingBox())!
    expect(box.y, `${item.name} 应排在指标摘要之后`).toBeGreaterThan(summaryBox.y)
  }

  // 完整指标在第二屏是 2×2：四个指标都还在同一区域里。
  const metrics = page.getByRole('region', { name: '本页指标' })
  await expect(metrics.getByText('卧床时间 TIB')).toBeVisible()
  await expect(metrics.getByText('终末清醒')).toBeVisible()
  await expect(metrics.getByText('总睡眠时间 TST')).toBeVisible()
  await expect(metrics.getByText('睡眠效率 SE')).toBeVisible()
})

test('the diary page does not scroll horizontally and its controls meet the touch minimum', async ({ page }) => {
  await openDiary(page)

  const widths = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth
  }))
  expect(widths.scrollWidth, '日记页横向溢出').toBeLessThanOrEqual(widths.clientWidth)

  const targets: { name: string; target: Locator }[] = [
    ...coreInputIds.map((id) => ({ name: `核心输入 #${id}`, target: page.locator(`#${id}`) })),
    { name: '保存按钮', target: saveButton(page) }
  ]
  for (const { name, target } of targets) {
    const box = (await target.boundingBox())!
    expect(box.width, `${name} 宽度`).toBeGreaterThanOrEqual(MIN_TARGET)
    expect(box.height, `${name} 高度`).toBeGreaterThanOrEqual(MIN_TARGET)
  }
})
