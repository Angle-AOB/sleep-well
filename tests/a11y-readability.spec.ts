import { test, expect, type Page } from '@playwright/test'
import {
  goToSettingsSubPage,
  openPage,
  openSettingsSubPage,
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
      if (value === 'transparent') return { r: 0, g: 0, b: 0, alpha: 0 }
      const match = value.match(/rgba?\(([^)]+)\)/)
      if (!match) return null
      const channels = match[1].trim().split(/\s*[,/]\s*|\s+/).map((channel) => Number.parseFloat(channel))
      if (channels.length < 3 || channels.slice(0, 3).some((channel) => Number.isNaN(channel))) return null
      return { r: channels[0], g: channels[1], b: channels[2], alpha: channels[3] ?? 1 }
    }

    const luminance = ({ r, g, b }: { r: number; g: number; b: number }) => {
      const channel = (value: number) => {
        const normalized = value / 255
        return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
    }

    const composite = (
      foreground: NonNullable<ReturnType<typeof parseColor>>,
      background: { r: number; g: number; b: number },
      opacity = 1
    ) => {
      const alpha = Math.max(0, Math.min(1, foreground.alpha * opacity))
      return {
        r: foreground.r * alpha + background.r * (1 - alpha),
        g: foreground.g * alpha + background.g * (1 - alpha),
        b: foreground.b * alpha + background.b * (1 - alpha)
      }
    }

    const renderedPixels = (element: Element, foreground: ReturnType<typeof parseColor>) => {
      const ancestors: Element[] = []
      let current: Element | null = element
      while (current) {
        ancestors.unshift(current)
        current = current.parentElement
      }
      const pageBackground = parseColor(getComputedStyle(document.documentElement).backgroundColor)
        ?? { r: 255, g: 255, b: 255, alpha: 1 }

      const render = (index: number, backdrop: { r: number; g: number; b: number }) => {
        const layer = ancestors[index]
        const style = getComputedStyle(layer)
        const layerBackground = parseColor(style.backgroundColor) ?? { r: 0, g: 0, b: 0, alpha: 0 }
        const localBackground = composite(layerBackground, backdrop)
        let backgroundPixel = localBackground
        let foregroundPixel = localBackground
        if (index === ancestors.length - 1) {
          if (foreground) foregroundPixel = composite(foreground, localBackground)
        } else {
          const childPixels = render(index + 1, localBackground)
          backgroundPixel = childPixels.background
          foregroundPixel = childPixels.foreground
        }
        const opacity = Number.parseFloat(style.opacity)
        const groupOpacity = Number.isFinite(opacity) ? Math.max(0, Math.min(1, opacity)) : 1
        return {
          background: composite({ ...backgroundPixel, alpha: 1 }, backdrop, groupOpacity),
          foreground: composite({ ...foregroundPixel, alpha: 1 }, backdrop, groupOpacity)
        }
      }
      return render(0, { r: pageBackground.r, g: pageBackground.g, b: pageBackground.b })
    }

    const effectiveOpacity = (element: Element) => {
      let opacity = 1
      let current: Element | null = element
      while (current) {
        const value = Number.parseFloat(getComputedStyle(current).opacity)
        if (Number.isFinite(value)) opacity *= value
        current = current.parentElement
      }
      return opacity
    }

    const contrast = (foreground: ReturnType<typeof parseColor>, element: Element) => {
      if (!foreground) return null
      const pixels = renderedPixels(element, foreground)
      const foregroundLum = luminance(pixels.foreground)
      const backgroundLum = luminance(pixels.background)
      return (Math.max(foregroundLum, backgroundLum) + 0.05) / (Math.min(foregroundLum, backgroundLum) + 0.05)
    }

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    const results: { text: string; tag: string; size: number; family: string; ratio: number | null; opacity: number; large: boolean }[] = []
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
        tag: element.tagName.toLowerCase(),
        size,
        family: style.fontFamily,
        ratio: contrast(parseColor(style.color), element),
        opacity: effectiveOpacity(element),
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

test('diary, today, settings, and training body copy stays at least 16px', async ({ page }) => {
  const cases: {
    page: AppPage | SettingsSubPage
    settings?: boolean
    include: (text: { text: string; tag: string }) => boolean
  }[] = [
    {
      page: 'diary',
      include: (text) => text.tag === 'dd' || text.text.startsWith('在早晨回顾上一夜。')
    },
    {
      page: 'today',
      include: (text) => text.tag === 'p' && !/^[A-Z ]+$/.test(text.text) && text.text !== '维持期：六周训练已完成，固定起床时间与睡眠窗口继续适用。'
    },
    {
      page: 'about',
      settings: true,
      include: (text) => text.tag === 'p' && text.text !== '仅保存在此设备' && !/^[A-Z ]+$/.test(text.text)
    },
    {
      page: 'backup',
      settings: true,
      include: (text) => text.tag === 'p' && (text.text.startsWith('完整备份包含') || text.text.startsWith('ZIP 压缩不是加密'))
    },
    {
      page: 'training',
      include: (text) => (text.tag === 'li' || text.text.startsWith('疗程逐周解锁：') || text.text.startsWith('还没有开始六周训练。'))
    }
  ]

  for (const item of cases) {
    if (item.settings) await goToSettingsSubPage(page, item.page as SettingsSubPage)
    else await openPage(page, item.page as AppPage)
    const result = await renderedText(page)
    const bodyCopy = result.texts.filter(item.include)
    expect(bodyCopy.length, `${item.page} body copy should be rendered`).toBeGreaterThan(0)
    for (const text of bodyCopy) expect(text.size, `${item.page} body copy "${text.text}"`).toBeGreaterThanOrEqual(16)
  }
})

test('rendered contrast composites transparent text and nested translucent opacity groups', async ({ page }) => {
  await openPage(page, 'today')
  await page.evaluate(() => {
    const outer = document.createElement('div')
    outer.style.cssText = 'position:fixed;top:2px;left:2px;z-index:1000;background:rgba(0,0,0,.5);opacity:.5'
    const inner = document.createElement('div')
    inner.style.cssText = 'background:rgba(255,255,255,0);opacity:1'
    const text = document.createElement('span')
    text.dataset.testid = 'composited-contrast-probe'
    text.textContent = 'contrast probe'
    text.style.cssText = 'color:rgba(0,0,0,0);font-size:16px'
    inner.append(text)
    outer.append(inner)
    document.body.append(outer)
  })
  const result = await renderedText(page)
  const probe = result.texts.find((text) => text.text === 'contrast probe')
  expect(probe).toBeDefined()
  expect(probe!.ratio).toBeCloseTo(1, 5)

  await page.locator('[data-testid="composited-contrast-probe"]').evaluate((element) => {
    element.style.color = '#000'
  })
  const opaqueResult = await renderedText(page)
  const opaqueProbe = opaqueResult.texts.find((text) => text.text === 'contrast probe')
  expect(opaqueProbe).toBeDefined()
  expect(opaqueProbe!.ratio).toBeCloseTo(2.14625, 4)
})

test('error status text meets normal-text contrast on its rendered light background', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true })
  })
  await openSettingsSubPage(page, 'reminders')
  await expect(page.getByRole('status').getByText('此浏览器无法使用本地存储')).toBeVisible()
  const result = await renderedText(page)
  const renderedError = result.texts.find((text) => text.text.startsWith('此浏览器无法使用本地存储'))
  expect(renderedError).toBeDefined()
  expect(renderedError!.ratio).toBeGreaterThanOrEqual(4.5)
})

test('diary and training remain usable at a 200 percent equivalent viewport', async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 450 })
  for (const target of ['diary', 'training'] as const) {
    await openPage(page, target)
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth
    }))
    expect(dimensions.content, `${target} horizontal overflow`).toBeLessThanOrEqual(dimensions.viewport)

    const copy = target === 'diary'
      ? page.getByText('在早晨回顾上一夜。只填记得住的部分：不确定的字段可以留空或记为“不知道”，缺失不会被当成 0。', { exact: true })
      : page.getByText('疗程逐周解锁：第 1 周只记录基线，第 2 周锚定固定起床时间，第 3 周才启动睡眠限制，第 4–5 周滴定与认知练习，第 6 周巩固。', { exact: true })
    const heading = page.getByRole('heading', { level: 1 })
    const fixedActions = [page.getByRole('navigation', { name: '页面导航' })]
    if (target === 'diary') fixedActions.push(page.getByRole('button', { name: '保存日记' }))
    const fixedActionBounds = await Promise.all(fixedActions.map((action) => action.boundingBox()))
    for (const [name, locator] of [['title', heading], ['body copy', copy]] as const) {
      const unobscured = await locator.evaluate((element, bounds) => {
        const rect = element.getBoundingClientRect()
        const centerX = rect.left + rect.width / 2
        const centerY = rect.top + rect.height / 2
        const covered = bounds.some((bar) => bar !== null
          && centerX >= bar.x && centerX <= bar.x + bar.width
          && centerY >= bar.y && centerY <= bar.y + bar.height)
        return rect.width > 0 && rect.height > 0 && centerY >= 0 && centerY < window.innerHeight && !covered
      }, fixedActionBounds)
      expect(unobscured, `${target} ${name} should remain visible above fixed bars`).toBe(true)
    }

    const control = target === 'diary'
      ? page.getByLabel('记录哪一夜')
      : page.getByRole('radio', { name: '作息基本规律' })
    await expect(control).toBeVisible()
    await control.evaluate((element) => element.scrollIntoView({ block: 'center', inline: 'nearest' }))
    const isInteractable = await control.evaluate((element, bounds) => {
      const rect = element.getBoundingClientRect()
      const x = rect.left + rect.width / 2
      const y = rect.top + rect.height / 2
      const covered = bounds.some((bar) => bar !== null
        && x >= bar.x && x <= bar.x + bar.width
        && y >= bar.y && y <= bar.y + bar.height)
      const hit = document.elementFromPoint(x, y)
      return rect.width > 0 && rect.height > 0 && y >= 0 && y < window.innerHeight
        && !covered && !!hit && (element === hit || element.contains(hit) || hit.contains(element))
    }, fixedActionBounds)
    expect(isInteractable, `${target} primary control should be unobscured and hit-testable`).toBe(true)

    if (target === 'diary') {
      const saveButton = page.getByRole('button', { name: '保存日记' })
      await expect(saveButton).toBeVisible()
      const saveHit = await saveButton.evaluate((element) => {
        const rect = element.getBoundingClientRect()
        const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
        return rect.width > 0 && rect.height > 0 && !!hit && (element === hit || element.contains(hit) || hit.contains(element))
      })
      expect(saveHit, 'diary fixed save control should remain hit-testable').toBe(true)
    }
  }
})

test('training body copy stays at least 16px across viewports', async ({ page }) => {
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport)
    await openPage(page, 'training')
    const result = await renderedText(page)
    const copy = result.texts.filter((text) =>
      (text.tag === 'li' || (text.tag === 'p' && text.text !== '轮班/倒班作息不进入自动睡眠限制；仍可记录日记和查看训练内容。'))
      && !/^[A-Z ]+$/.test(text.text)
    )
    expect(copy.length, `training body copy at ${viewport.width}px`).toBeGreaterThan(0)
    for (const item of copy) {
      expect(item.size, `training body copy "${item.text}" at ${viewport.width}px`).toBeGreaterThanOrEqual(16)
    }
  }
})

test('training page contrast includes dimmed rendered text', async ({ page }) => {
  await openPage(page, 'training')
  await page.getByText('疗程逐周解锁：第 1 周只记录基线，第 2 周锚定固定起床时间，第 3 周才启动睡眠限制，第 4–5 周滴定与认知练习，第 6 周巩固。', { exact: true }).evaluate((element) => {
    const text = element as HTMLElement
    text.style.color = '#22302c'
    text.style.opacity = '0.75'
  })
  const result = await renderedText(page)
  const dimmed = result.texts.filter((text) => text.opacity < 1)
  expect(dimmed.length, 'training page should expose rendered text with opacity').toBeGreaterThan(0)
  for (const text of dimmed) {
    expect(text.ratio, `training dimmed text "${text.text}" contrast`).not.toBeNull()
    expect(text.ratio!, `training dimmed text "${text.text}" contrast`).toBeGreaterThanOrEqual(text.large ? 3 : 4.5)
  }
})

test('disabled backup controls keep normal-text contrast', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(File.prototype, 'arrayBuffer', {
      configurable: true,
      value: () => new Promise<ArrayBuffer>(() => {})
    })
  })
  await openSettingsSubPage(page, 'backup')

  const fileInput = page.locator('input[type="file"]')
  await fileInput.setInputFiles({ name: 'contrast-probe.zip', mimeType: 'application/zip', buffer: Buffer.from('probe') })
  await expect(fileInput).toBeDisabled()

  let result = await renderedText(page)
  const fileChoice = result.texts.find((text) => text.text === '选择备份文件')
  expect(fileChoice).toBeDefined()
  expect(fileChoice!.ratio, 'disabled file chooser text contrast').toBeGreaterThanOrEqual(4.5)

  const dangerPage = await page.context().newPage()
  await openSettingsSubPage(dangerPage, 'backup')
  const [download] = await Promise.all([
    dangerPage.waitForEvent('download'),
    dangerPage.getByRole('button', { name: '导出完整备份（ZIP）' }).click()
  ])
  const archivePath = await download.path()
  expect(archivePath).not.toBeNull()
  await dangerPage.locator('input[type="file"]').setInputFiles(archivePath!)
  await expect(dangerPage.getByText('备份摘要')).toBeVisible()
  await dangerPage.getByRole('button', { name: '覆盖恢复…' }).click()

  const danger = dangerPage.getByRole('button', { name: '确认删除并恢复' })
  await expect(danger).toBeVisible()
  await danger.evaluate((element) => element.setAttribute('disabled', ''))
  await expect(danger).toBeDisabled()
  result = await renderedText(dangerPage)
  const dangerText = result.texts.find((text) => text.text === '确认删除并恢复')
  expect(dangerText).toBeDefined()
  expect(dangerText!.ratio, 'disabled dangerous operation text contrast').toBeGreaterThanOrEqual(4.5)
  await dangerPage.close()
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
  const backLink = page.getByRole('link', { name: '返回设置' })
  const back = await backLink.boundingBox()
  const subHeading = await page.getByRole('heading', { level: 1 }).boundingBox()
  expect(back?.x ?? 0).toBeGreaterThanOrEqual(16)
  expect(subHeading?.x ?? 0).toBeGreaterThanOrEqual(16)
  const backSvg = backLink.locator('svg')
  await expect(backSvg).toHaveAttribute('viewBox', '0 0 24 24')
  await expect(backSvg).toHaveAttribute('width', '24')
  await expect(backSvg).toHaveAttribute('height', '24')
  await expect(backSvg.locator('path')).toHaveAttribute('d', 'M14.5 5 7.5 12l7 7')
  await expect(backLink).not.toContainText('←')

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
