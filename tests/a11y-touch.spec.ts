import { test, expect, type Page } from '@playwright/test'
import { goTo, goToSettingsSubPage, pageHeading, type AppPage } from './navigation'

// 触控目标测量约定（判断与理由见收工报告）：
// - 有 label 包裹/关联的 checkbox、radio、file input，触控目标是整个 label
//   （WCAG 2.5.8 允许把 label 区域计入目标尺寸）；控件本身另按 WCAG 2.2 AA
//   的 2.5.8 最低 24×24 CSS px 单独检查（文件选择由 label 承担，不量原生 input）。
// - 例外（如正文内联链接）必须写明理由后单独分组断言，并与常规控件区分；
//   当前界面没有需要豁免的控件。

const MIN_TARGET = 44
const MIN_WCAG_TARGET = 24

type Box = { label: string; width: number; height: number }

async function tapTargets(page: Page): Promise<Box[]> {
  return page.evaluate(() => {
    const visible = (el: Element): boolean => {
      if (!(el instanceof HTMLElement)) return false
      const style = getComputedStyle(el)
      if (style.display === 'none' || style.visibility === 'hidden') return false
      const rect = el.getBoundingClientRect()
      return rect.width > 0 || rect.height > 0
    }
    const surfaceOf = (el: HTMLInputElement): Element | null => {
      // 只有勾选类控件由 label 承担触控面；文本/时间输入必须量控件本身。
      if (el.type !== 'checkbox' && el.type !== 'radio' && el.type !== 'file') return el
      const label = el.closest('label') ?? (el.id ? document.querySelector(`label[for="${el.id}"]`) : null)
      return label ?? (el.type === 'file' ? null : el)
    }
    const results: { label: string; width: number; height: number }[] = []
    const controls = document.querySelectorAll('a[href], button, input, select, textarea')
    for (const el of Array.from(controls)) {
      if (!visible(el)) continue
      let surface: Element | null = el
      if (el instanceof HTMLInputElement) surface = surfaceOf(el)
      if (!surface) continue
      const rect = surface.getBoundingClientRect()
      const name = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 24)
        || el.getAttribute('aria-label')
        || (el instanceof HTMLInputElement ? el.type : el.tagName.toLowerCase())
      results.push({ label: `${el.tagName.toLowerCase()}[${name}]`, width: rect.width, height: rect.height })
    }
    return results
  })
}

async function rawToggleSizes(page: Page): Promise<Box[]> {
  return page.evaluate(() => {
    const visible = (el: Element): boolean => {
      if (!(el instanceof HTMLElement)) return false
      const style = getComputedStyle(el)
      if (style.display === 'none' || style.visibility === 'hidden') return false
      const rect = el.getBoundingClientRect()
      return rect.width > 0 || rect.height > 0
    }
    const results: { label: string; width: number; height: number }[] = []
    for (const el of Array.from(document.querySelectorAll('input[type="checkbox"], input[type="radio"]'))) {
      if (!visible(el)) continue
      const rect = el.getBoundingClientRect()
      results.push({ label: `input[${el instanceof HTMLInputElement ? el.type : ''}]`, width: rect.width, height: rect.height })
    }
    return results
  })
}

function expectAtLeast(boxes: Box[], size: number, what: string) {
  expect(boxes.length, `${what} 应至少有一个可测控件`).toBeGreaterThan(0)
  for (const box of boxes) {
    expect(box.width, `${box.label} 的宽度（${what}）`).toBeGreaterThanOrEqual(size)
    expect(box.height, `${box.label} 的高度（${what}）`).toBeGreaterThanOrEqual(size)
  }
}

async function openApp(page: Page) {
  await page.clock.setFixedTime(new Date('2026-11-20T09:00:00'))
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: '今日' })).toBeVisible()
}

async function completeScreening(page: Page) {
  await goToSettingsSubPage(page, 'screening')
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

test('main actions meet the 44x44 CSS px touch target on every page', async ({ page }) => {
  await openApp(page)
  const pages: AppPage[] = ['today', 'diary', 'training', 'settings']
  let total = 0

  for (const target of pages) {
    await goTo(page, target)
    if (target === 'diary') {
      await expect(page.getByRole('button', { name: /保存日记|更新日记/ })).toBeVisible()
    }
    if (target === 'training') {
      await expect(page.getByRole('button', { name: '开始六周训练' })).toBeVisible()
    }
    if (target === 'settings') {
      await expect(page.getByRole('navigation', { name: '设置项' })).toBeVisible()
    }

    const targets = await tapTargets(page)
    expect(targets.length, `${pageHeading[target]} 页应有可测控件`).toBeGreaterThan(0)
    total += targets.length
    expectAtLeast(targets, MIN_TARGET, `${pageHeading[target]} 页主要操作触控目标`)
  }

  expect(total).toBeGreaterThan(10)
})

test('checkbox and radio controls themselves meet the WCAG 2.2 AA 24x24 minimum', async ({ page }) => {
  await openApp(page)
  await goTo(page, 'diary')
  await expect(page.getByRole('button', { name: /保存日记|更新日记/ })).toBeVisible()
  const boxes = await rawToggleSizes(page)

  await goToSettingsSubPage(page, 'reminders')
  await expect(page.locator('#backup-reminders')).toBeVisible()
  boxes.push(...await rawToggleSizes(page))

  expectAtLeast(boxes, MIN_WCAG_TARGET, 'WCAG 2.2 AA 2.5.8 控件本体')
})

test('the cache retry button meets the 44x44 CSS px touch target', async ({ page }) => {
  await page.addInitScript(() => {
    const realKeys = CacheStorage.prototype.keys.bind(caches)
    CacheStorage.prototype.keys = function (this: CacheStorage) {
      void realKeys
      return Promise.resolve([])
    }
  })
  await openApp(page)
  const retry = page.getByRole('button', { name: '重试' })
  await expect(retry).toBeVisible({ timeout: 30_000 })
  const box = await retry.boundingBox()
  expect(box!.width).toBeGreaterThanOrEqual(MIN_TARGET)
  expect(box!.height).toBeGreaterThanOrEqual(MIN_TARGET)
})

test('week step buttons meet the 44x44 CSS px touch target', async ({ page }) => {
  await openApp(page)
  await goTo(page, 'training')
  await completeScreening(page)
  await page.getByRole('button', { name: '开始六周训练' }).click()
  await expect(page.getByRole('heading', { name: '第 1 周 · 记录基线' })).toBeVisible()

  const steps = page.locator('.week-step')
  await expect(steps).toHaveCount(6)
  for (let index = 0; index < 6; index += 1) {
    const box = await steps.nth(index).boundingBox()
    expect(box!.width, `week-step[${index}] 宽度`).toBeGreaterThanOrEqual(MIN_TARGET)
    expect(box!.height, `week-step[${index}] 高度`).toBeGreaterThanOrEqual(MIN_TARGET)
  }
})

test('diagnostics copy and issue actions meet the 44x44 CSS px touch target', async ({ page }) => {
  await openApp(page)
  await goToSettingsSubPage(page, 'diagnostics')
  const panel = page.getByRole('region', { name: '诊断信息' })

  const copy = panel.getByRole('button', { name: '复制诊断信息' })
  const issueLink = panel.getByRole('link', { name: '打开 GitHub issue' })
  for (const target of [copy, issueLink]) {
    const box = await target.boundingBox()
    expect(box!.width).toBeGreaterThanOrEqual(MIN_TARGET)
    expect(box!.height).toBeGreaterThanOrEqual(MIN_TARGET)
  }
})
