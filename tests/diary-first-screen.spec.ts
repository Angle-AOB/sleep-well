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

test('opening the diary shows the save button in the first screen', async ({ page }) => {
  await openDiary(page)
  await expectAboveTheFold(page, saveButton(page), '保存按钮')
})

test('the four core inputs and the metric summary fit in the first screen', async ({ page }) => {
  await openDiary(page)

  for (const id of coreInputIds) {
    await expectAboveTheFold(page, page.locator(`#${id}`), `核心输入 #${id}`)
  }

  const summaryBox = await summary(page).boundingBox()
  expect(summaryBox, '指标摘要应有布局盒').not.toBeNull()
  await expect(summary(page)).toContainText('TIB')
  await expect(summary(page)).toContainText('TST')
  await expect(summary(page)).toContainText('SE')
  await expect(summary(page)).not.toContainText('终末清醒')
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
