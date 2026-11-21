import { test, expect, type Page } from '@playwright/test'
import {
  goTo,
  goToSettingsSubPage,
  openPage,
  type AppPage,
  type SettingsSubPage
} from './navigation'

const pages: AppPage[] = ['today', 'diary', 'training', 'settings']
const subPages: SettingsSubPage[] = ['screening', 'reminders', 'backup', 'diagnostics', 'about']

/**
 * Readability is asserted at the rendered text seam. This deliberately avoids
 * CSS class names so a shell refactor cannot make the check tautological.
 */
async function renderedText(page: Page) {
  return page.evaluate(() => {
    const isVisible = (element: Element) => {
      if (!(element instanceof HTMLElement)) return false
      if (element.closest('[hidden], [aria-hidden="true"]')) return false
      const style = getComputedStyle(element)
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false
      const rect = element.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0
    }

    const parseColor = (value: string) => {
      const match = value.match(/rgba?\(([^)]+)\)/)
      if (!match) return null
      const channels = match[1].split(',').map((channel) => Number.parseFloat(channel.trim()))
      if (channels.length < 3 || channels.some((channel) => Number.isNaN(channel))) return null
      return { r: channels[0], g: channels[1], b: channels[2], alpha: channels[3] ?? 1 }
    }

    const backgroundFor = (element: Element) => {
      let current: Element | null = element
      while (current) {
        const color = parseColor(getComputedStyle(current).backgroundColor)
        if (color && color.alpha > 0) return color
        current = current.parentElement
      }
      return parseColor(getComputedStyle(document.documentElement).backgroundColor)
        ?? { r: 255, g: 255, b: 255, alpha: 1 }
    }

    const luminance = ({ r, g, b }: { r: number; g: number; b: number }) => {
      const channel = (value: number) => {
        const normalized = value / 255
        return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
    }

    const contrast = (foreground: ReturnType<typeof parseColor>, background: ReturnType<typeof parseColor>) => {
      if (!foreground || !background) return null
      const foregroundLum = luminance(foreground)
      const backgroundLum = luminance(background)
      return (Math.max(foregroundLum, backgroundLum) + 0.05) / (Math.min(foregroundLum, backgroundLum) + 0.05)
    }

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    const results: { text: string; size: number; family: string; ratio: number | null; large: boolean }[] = []
    let node: Node | null
    while ((node = walker.nextNode())) {
      const text = node.textContent?.replace(/\s+/g, ' ').trim() ?? ''
      const element = node.parentElement
      if (!text || !element || !isVisible(element)) continue
      const style = getComputedStyle(element)
      const size = Number.parseFloat(style.fontSize)
      const large = size >= 24 || (size >= 18.66 && Number.parseInt(style.fontWeight, 10) >= 700)
      results.push({
        text: text.slice(0, 80),
        size,
        family: style.fontFamily,
        ratio: contrast(parseColor(style.color), backgroundFor(element)),
        large
      })
    }
    return {
      bodySize: Number.parseFloat(getComputedStyle(document.body).fontSize),
      texts: results
    }
  })
}

test('four pages and settings sub-pages render readable sans-serif text', async ({ page }) => {
  for (const target of pages) {
    await openPage(page, target)
    const result = await renderedText(page)
    expect(result.bodySize, `${target} body font size`).toBeGreaterThanOrEqual(16)
    expect(result.texts.length, `${target} visible text`).toBeGreaterThan(0)
    for (const text of result.texts) {
      expect(text.size, `${target} text "${text.text}"`).toBeGreaterThanOrEqual(14)
      expect(text.family.toLowerCase(), `${target} text "${text.text}" font`).not.toMatch(/(^|,\s*)(georgia|times new roman|serif)(\s*,|$)/)
      expect(text.ratio, `${target} text "${text.text}" contrast`).not.toBeNull()
      expect(text.ratio!, `${target} text "${text.text}" contrast`).toBeGreaterThanOrEqual(text.large ? 3 : 4.5)
    }
  }

  for (const target of subPages) {
    await goToSettingsSubPage(page, target)
    const result = await renderedText(page)
    expect(result.bodySize, `settings/${target} body font size`).toBeGreaterThanOrEqual(16)
    expect(result.texts.length, `settings/${target} visible text`).toBeGreaterThan(0)
    for (const text of result.texts) {
      expect(text.size, `settings/${target} text "${text.text}"`).toBeGreaterThanOrEqual(14)
      expect(text.family.toLowerCase(), `settings/${target} text "${text.text}" font`).not.toMatch(/(^|,\s*)(georgia|times new roman|serif)(\s*,|$)/)
      expect(text.ratio, `settings/${target} text "${text.text}" contrast`).not.toBeNull()
      expect(text.ratio!, `settings/${target} text "${text.text}" contrast`).toBeGreaterThanOrEqual(text.large ? 3 : 4.5)
    }
  }
})

test('topbar keeps viewport-safe gutters and aligns with page content', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openPage(page, 'today')
  const narrow = await page.evaluate(() => {
    const header = document.querySelector('header')
    const heading = header?.querySelector('h1')
    const rect = heading?.getBoundingClientRect()
    return { left: rect?.left ?? 0, right: rect?.right ?? 0, width: window.innerWidth }
  })
  expect(narrow.left).toBeGreaterThanOrEqual(16)
  expect(narrow.right).toBeLessThanOrEqual(narrow.width - 16)

  await goToSettingsSubPage(page, 'about')
  const back = await page.getByRole('link', { name: '返回设置' }).boundingBox()
  const subHeading = await page.getByRole('heading', { level: 1 }).boundingBox()
  expect(back?.x ?? 0).toBeGreaterThanOrEqual(16)
  expect(subHeading?.x ?? 0).toBeGreaterThanOrEqual(16)

  await page.setViewportSize({ width: 1440, height: 900 })
  await openPage(page, 'today')
  const wide = await page.evaluate(() => {
    const headerHeading = document.querySelector('header h1')?.getBoundingClientRect()
    const main = document.querySelector('main')
    if (!headerHeading || !main) return null
    const style = getComputedStyle(main)
    return {
      headingLeft: headerHeading.left,
      contentLeft: main.getBoundingClientRect().left + Number.parseFloat(style.paddingLeft),
      headingRight: headerHeading.right,
      contentRight: main.getBoundingClientRect().right - Number.parseFloat(style.paddingRight)
    }
  })
  expect(wide).not.toBeNull()
  expect(wide!.headingLeft).toBeCloseTo(wide!.contentLeft, 0)
  expect(wide!.headingRight).toBeLessThanOrEqual(wide!.contentRight)
})
