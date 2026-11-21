import { test, expect, type Page } from '@playwright/test'
import { goTo, openPage, pageHeading, type AppPage } from './navigation'

// 键盘与焦点顺序：跳转链接 → 底栏 → 主内容；所有交互元素可聚焦且焦点可见；
// 记录日记这条主路径的导航、启用与提交用键盘走通（时间输入的值以 fill 注入，见下）。
// 断言焦点与可访问名，不碰 CSS 类名。

async function openApp(page: Page) {
  await page.clock.setFixedTime(new Date('2026-11-20T09:00:00'))
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: '今日' })).toBeVisible()
  // 等缓存就绪再测 Tab 顺序：状态区的重试按钮会插入一个 tab 停靠点。
  await expect(page.getByText('当前可离线使用')).toBeVisible({ timeout: 30_000 })
}

async function focusedInfo(page: Page) {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null
    if (!el || el === document.body) return null
    // 视觉隐藏的文件选择 input 由它的 label 承担焦点可见性。
    const probe = (el.offsetWidth <= 2 && el.closest('label')) || el
    const style = getComputedStyle(probe as Element)
    return {
      id: el.id,
      tag: el.tagName.toLowerCase(),
      type: el instanceof HTMLInputElement ? el.type : '',
      name: (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 20)
        || el.getAttribute('aria-label')
        || '',
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      boxShadow: style.boxShadow
    }
  })
}

test('the first tab stop is a skip link into the main content', async ({ page }) => {
  await openApp(page)
  await page.keyboard.press('Tab')
  const skip = page.getByRole('link', { name: '跳到主要内容' })
  await expect(skip).toBeFocused()

  await page.keyboard.press('Enter')
  await expect(page.getByRole('main')).toBeFocused()
})

test('tab order runs skip link then the bottom bar then main content', async ({ page }) => {
  await openApp(page)
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: '跳到主要内容' })).toBeFocused()

  await page.keyboard.press('Tab')
  await expect(page.getByRole('navigation', { name: '页面导航' }).getByRole('link', { name: '今日', exact: true })).toBeFocused()

  await page.keyboard.press('Tab')
  await expect(page.getByRole('navigation', { name: '页面导航' }).getByRole('link', { name: '日记', exact: true })).toBeFocused()
})

test('every keyboard focus stop on every page shows a visible focus indicator', async ({ page }) => {
  await openApp(page)
  const seen: string[] = []
  const pages: AppPage[] = ['today', 'diary', 'training', 'settings']

  for (const target of pages) {
    await goTo(page, target)
    for (let step = 0; step < 40; step += 1) {
      await page.keyboard.press('Tab')
      const info = await focusedInfo(page)
      if (!info) break
      const key = `${target}:${info.tag}#${info.id}#${info.name}`
      seen.push(key)

      const outlineVisible = info.outlineStyle !== 'none'
        && Number.parseFloat(info.outlineWidth) >= 2
      const shadowVisible = info.boxShadow !== 'none' && info.boxShadow !== ''
      // 例外（单独分组）：原生日期/时间输入的日历按钮获得焦点时，焦点环由 UA 自绘
      // （已截图核对 Chromium 渲染），不体现在 getComputedStyle(input) 里，也探测不到
      // UA shadow 内部；本应用里「日期/时间输入 + 轮廓为 none」只对应这一停靠点，
      // 其余停靠点必须有 ≥2px 的可见焦点环。
      const nativePickerRing = (info.type === 'date' || info.type === 'time')
        && info.outlineStyle === 'none'
      expect(outlineVisible || shadowVisible || nativePickerRing, `${info.tag}#${info.id} [${info.name}] 的焦点指示`).toBe(true)
    }
  }

  expect(seen.length).toBeGreaterThan(10)
  for (const target of pages) {
    expect(seen.some((key) => key.startsWith(`${target}:`)), `${pageHeading[target]} 页应有可聚焦控件`).toBe(true)
  }
})

test('a diary entry can be completed and saved with keyboard navigation and activation', async ({ page }) => {
  await openPage(page, 'diary', '2026-11-20T09:00:00')
  await expect(page.getByRole('button', { name: /保存日记|更新日记/ })).toBeVisible()

  // 日期/时间输入内部分段也占 Tab 停靠点，所以逐段 Tab 到目标控件再输入。
  async function tabUntil(match: (id: string, type: string) => boolean, what: string) {
    for (let step = 0; step < 40; step += 1) {
      await page.keyboard.press('Tab')
      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null
        return el ? { id: el.id, type: (el as HTMLInputElement).type ?? '' } : { id: '', type: '' }
      })
      if (match(info.id, info.type)) return
    }
    throw new Error(`未能用 Tab 到达 ${what}`)
  }

  // 键盘走位到每个字段后填值。headless Chromium 的时间分段不响应合成按键
  // （真机键盘输入不受此影响），值用 fill 注入；导航、启用与提交全用键盘。
  await tabUntil((id) => id === 'diary-date', '日记日期输入')
  await tabUntil((id) => id === 'lights-off', '关灯时间')
  await page.locator('#lights-off').fill('23:00')
  await tabUntil((id) => id === 'sleep-onset', '入睡潜伏期')
  await page.keyboard.type('30')
  await tabUntil((id) => id === 'final-wake', '最终醒来时间')
  await page.locator('#final-wake').fill('06:30')
  await tabUntil((id) => id === 'out-of-bed', '起床时间')
  await page.locator('#out-of-bed').fill('07:00')
  await tabUntil((_id, type) => type === 'submit', '保存按钮')

  await page.keyboard.press('Enter')
  await expect(page.getByRole('region', { name: '晨间睡眠日记' }).getByText('日记已保存在此设备')).toBeVisible()
})
