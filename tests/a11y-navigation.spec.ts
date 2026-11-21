import { test, expect } from '@playwright/test'
import { goTo, openPage, pageHeading, defaultClock, type AppPage } from './navigation'

// 四页壳的稳定契约：页面地址、底栏可访问名称、顶栏页名与当前项语义。
// 断言全部走地址、可访问角色/名称、可见性、焦点与几何尺寸，不碰路由或组件内部实现。

const pages: AppPage[] = ['today', 'diary', 'training', 'settings']

test('each page address opens directly, has one heading, and survives a reload', async ({ page }) => {
  for (const target of pages) {
    await openPage(page, target, '2026-11-20T09:00:00')
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(pageHeading[target])

    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name: pageHeading[target] })).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
  }
})

test('an empty address lands on today and is replaced with #/today', async ({ page }) => {
  await page.clock.setFixedTime(new Date(defaultClock))
  await page.goto('/')
  await expect(page).toHaveURL(/#\/today$/)
  await expect(page.getByRole('heading', { level: 1, name: '今日' })).toBeVisible()
})

test('an unknown address falls back to today and replaces the hash', async ({ page }) => {
  await page.clock.setFixedTime(new Date(defaultClock))
  await page.goto('/#/unknown-page')
  await expect(page).toHaveURL(/#\/today$/)
  await expect(page.getByRole('heading', { level: 1, name: '今日' })).toBeVisible()
})

test('a non-settings page with an extra segment falls back to today and replaces the hash', async ({ page }) => {
  await page.clock.setFixedTime(new Date(defaultClock))
  await page.goto('/#/diary/foo')
  await expect(page).toHaveURL(/#\/today$/)
  await expect(page.getByRole('heading', { level: 1, name: '今日' })).toBeVisible()
})

test('an unknown settings sub-page falls back to today and replaces the hash', async ({ page }) => {
  await page.clock.setFixedTime(new Date(defaultClock))
  await page.goto('/#/settings/unknown')
  await expect(page).toHaveURL(/#\/today$/)
  await expect(page.getByRole('heading', { level: 1, name: '今日' })).toBeVisible()
})

test('an in-page fragment such as #main-content is left alone', async ({ page }) => {
  await page.clock.setFixedTime(new Date(defaultClock))
  await page.goto('/#main-content')
  await expect(page).toHaveURL(/#main-content$/)
  await expect(page.getByRole('heading', { level: 1, name: '今日' })).toBeVisible()
})

test('a fragment that matches no element falls back to today and replaces the hash', async ({ page }) => {
  await page.clock.setFixedTime(new Date(defaultClock))
  await page.goto('/#foo')
  // `#foo` 既不是路由，文档里也没有这个 id：不能停在今日却把地址留在 #foo。
  await expect(page).toHaveURL(/#\/today$/)
  await expect(page.getByRole('heading', { level: 1, name: '今日' })).toBeVisible()
})

test('an unknown fragment does not leave a stale address behind when coming back', async ({ page }) => {
  await page.clock.setFixedTime(new Date(defaultClock))
  await page.goto('/#/diary')
  await page.goto('/#foo')
  await expect(page).toHaveURL(/#\/today$/)
  await page.goBack()
  await expect(page.getByRole('heading', { level: 1, name: '晨间睡眠日记' })).toBeVisible()
  await expect(page).toHaveURL(/#\/diary$/)
})

test('the skip link focuses main content without changing the page address', async ({ page }) => {
  await openPage(page, 'diary')
  const skip = page.getByRole('link', { name: '跳到主要内容' })
  await skip.focus()
  await page.keyboard.press('Enter')

  await expect(page.getByRole('main')).toBeFocused()
  await expect(page).toHaveURL(/#\/diary$/)
  await expect(page.getByRole('heading', { level: 1, name: '晨间睡眠日记' })).toBeVisible()
})

test('browser back and forward stay consistent with bottom-bar switching', async ({ page }) => {
  await openPage(page, 'today')
  await goTo(page, 'diary')
  await goTo(page, 'training')

  await page.goBack()
  await expect(page.getByRole('heading', { level: 1, name: '晨间睡眠日记' })).toBeVisible()
  const diary = page.getByRole('navigation', { name: '页面导航' }).getByRole('link', { name: '日记', exact: true })
  await expect(diary).toHaveAttribute('aria-current', 'page')

  await page.goForward()
  await expect(page.getByRole('heading', { level: 1, name: '训练' })).toBeVisible()
  const training = page.getByRole('navigation', { name: '页面导航' }).getByRole('link', { name: '训练', exact: true })
  await expect(training).toHaveAttribute('aria-current', 'page')
})

test('the bottom bar marks the current page with aria-current, colour and weight', async ({ page }) => {
  await openPage(page, 'today')
  const bar = page.getByRole('navigation', { name: '页面导航' })
  await expect(bar.getByRole('link')).toHaveCount(4)

  const current = bar.getByRole('link', { name: '今日', exact: true })
  const other = bar.getByRole('link', { name: '日记', exact: true })
  await expect(current).toHaveAttribute('aria-current', 'page')
  await expect(other).not.toHaveAttribute('aria-current', 'page')

  const styles = await Promise.all([current, other].map((link) =>
    link.evaluate((element) => {
      const style = getComputedStyle(element)
      return { color: style.color, weight: style.fontWeight }
    })
  ))
  const [currentStyle, otherStyle] = styles
  expect(currentStyle.color).not.toBe(otherStyle.color)
  expect(Number(currentStyle.weight)).toBeGreaterThan(Number(otherStyle.weight))
})

test('every bottom-bar target is at least 44 by 44 CSS pixels', async ({ page }) => {
  await openPage(page, 'today')
  const links = page.getByRole('navigation', { name: '页面导航' }).getByRole('link')
  const count = await links.count()
  expect(count).toBe(4)
  for (let index = 0; index < count; index += 1) {
    const box = await links.nth(index).boundingBox()
    expect(box!.width, `底栏第 ${index + 1} 项宽度`).toBeGreaterThanOrEqual(44)
    expect(box!.height, `底栏第 ${index + 1} 项高度`).toBeGreaterThanOrEqual(44)
  }
})

test('switching pages scrolls to the top and focuses the new page heading', async ({ page }) => {
  await openPage(page, 'diary', '2026-11-20T09:00:00')
  // 日记表单异步装载；等它出现再滚，否则页面还没变高，scrollY 永远到不了 0 以上。
  await expect(page.locator('#lights-off')).toBeVisible()
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)

  await goTo(page, 'settings')
  await expect(page.getByRole('heading', { level: 1, name: '设置' })).toBeFocused()
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
})

test('leaving a deeply linked settings sub-page lands on the settings list', async ({ page }) => {
  await page.clock.setFixedTime(new Date(defaultClock))
  await page.goto('/#/settings/backup')
  await expect(page.getByRole('heading', { level: 1, name: '备份与导出' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '本地备份与导出' })).toBeVisible()

  // 深链进入没有“离开列表时的滚动位置”，底栏「设置」回到列表时按普通切页处理：
  // 回到页顶并把焦点交给列表页标题。
  await goTo(page, 'settings')
  await expect(page.getByRole('heading', { level: 1, name: '设置' })).toBeFocused()
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
  await expect(page).toHaveURL(/#\/settings$/)
  await expect(page.getByRole('navigation', { name: '设置项' })).toBeVisible()
})

test('hidden pages leave the accessibility tree and the tab order', async ({ page }) => {
  await openPage(page, 'today', '2026-11-20T09:00:00')
  await expect(page.getByRole('heading', { name: '晨间睡眠日记' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '六周训练' })).toHaveCount(0)
  await expect(page.locator('#lights-off')).toBeHidden()
  await expect(page.locator('#lights-off')).not.toBeFocused()

  const visited: string[] = []
  for (let step = 0; step < 40; step += 1) {
    await page.keyboard.press('Tab')
    const id = await page.evaluate(() => (document.activeElement as HTMLElement | null)?.id ?? '')
    if (id) visited.push(id)
  }
  expect(visited).not.toContain('lights-off')
  expect(visited).not.toContain('fixed-wake-time')
  expect(visited).not.toContain('screening-age')
})

test('a diary draft survives switching away and back', async ({ page }) => {
  await openPage(page, 'diary', '2026-11-20T09:00:00')
  await page.locator('#lights-off').fill('23:00')
  await page.locator('#sleep-onset').fill('25')

  await goTo(page, 'training')
  await expect(page.locator('#lights-off')).toBeHidden()

  await goTo(page, 'diary')
  await expect(page.locator('#lights-off')).toHaveValue('23:00')
  await expect(page.locator('#sleep-onset')).toHaveValue('25')
})

test('no page scrolls horizontally', async ({ page }) => {
  for (const target of pages) {
    await openPage(page, target, '2026-11-20T09:00:00')
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth
    }))
    expect(overflow.scrollWidth, `${pageHeading[target]} 页横向溢出`).toBeLessThanOrEqual(overflow.clientWidth)
  }
})
