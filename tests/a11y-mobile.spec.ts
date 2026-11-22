import { test, expect } from '@playwright/test'
import { goTo, goToSettingsSubPage, openPage } from './navigation'

// 可访问性冒烟：应用在窄视口（mobile-chromium 项目，Pixel 7）下排版不横向溢出、
// 每页的主要入口完整可见。桌面全量回归也会跑本文件，两侧都必须成立。
test('应用在每个页面都无横向溢出且主要面板完整可见', async ({ page }) => {
  await openPage(page, 'today', '2026-11-20T09:00:00')
  await expect(page.getByRole('heading', { level: 1, name: '今日' })).toBeVisible()
  await expect(page.getByRole('region', { name: '昨夜记录' })).toBeVisible()
  await expect(page.getByRole('region', { name: '今夜安排' })).toBeVisible()
  await expect(page.getByRole('region', { name: '本周任务' })).toBeVisible()

  await goTo(page, 'diary')
  await expect(page.getByRole('heading', { name: '晨间睡眠日记' })).toBeVisible()

  await goTo(page, 'training')
  await expect(page.getByRole('heading', { level: 1, name: '训练' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '六周训练' })).toHaveCount(0)
  await expect(page.getByRole('region', { name: '六周训练' })).toBeVisible()

  await goTo(page, 'settings')
  await expect(page.getByRole('navigation', { name: '设置项' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: '设置项' }).getByRole('link')).toHaveCount(5)

  // 设置里内容最多的是备份子页；停在那里再整体检查一次文档宽度。
  await goToSettingsSubPage(page, 'backup')
  await expect(page.getByRole('heading', { name: '本地备份与导出' })).toBeVisible()

  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth
  }))
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth)
})

test('训练内容没有页面级外框且宽视口下主内容避开固定底栏', async ({ page }) => {
  await openPage(page, 'training', '2026-11-20T09:00:00')
  const panel = page.getByRole('region', { name: '六周训练' })
  await expect(panel).toBeVisible()
  const frame = await panel.evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      background: style.backgroundColor,
      borders: [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth],
      padding: style.padding
    }
  })
  expect(frame.background).toBe('rgba(0, 0, 0, 0)')
  expect(frame.borders).toEqual(['0px', '0px', '0px', '0px'])
  expect(frame.padding).toBe('0px')

  await page.setViewportSize({ width: 1024, height: 900 })
  const spacing = await page.getByRole('main').evaluate((main) => {
    const bottomBar = document.querySelector('nav[aria-label="页面导航"]')
    if (!bottomBar) throw new Error('页面导航缺失')
    return {
      mainPaddingBottom: Number.parseFloat(getComputedStyle(main).paddingBottom),
      bottomBarHeight: bottomBar.getBoundingClientRect().height
    }
  })
  expect(spacing.mainPaddingBottom, '主内容应避开固定底栏').toBeGreaterThanOrEqual(spacing.bottomBarHeight)
})

test('UI density surfaces keep approved neutral, control, hover, and warm semantic colors', async ({ page }) => {
  await openPage(page, 'today')
  const todayCard = page.getByRole('region', { name: '昨夜记录' })
  await expect(todayCard).toBeVisible()
  await expect.poll(() => todayCard.evaluate((element) => {
    const style = getComputedStyle(element)
    return { background: style.backgroundColor, border: style.borderTopColor }
  })).toEqual({ background: 'rgb(242, 247, 243)', border: 'rgb(210, 223, 215)' })
  const todayLink = todayCard.getByRole('link').first()
  await todayLink.hover()
  await expect.poll(() => todayLink.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgb(238, 244, 239)')

  await goTo(page, 'diary')
  const summary = page.getByRole('group', { name: '指标摘要' })
  await expect(summary).toBeVisible()
  await expect.poll(() => summary.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgb(242, 247, 243)')
  await expect.poll(() => page.getByRole('main').getByRole('textbox').first().evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgb(247, 250, 246)')

  await goTo(page, 'training')
  await expect(page.getByRole('region', { name: '六周训练' })).toBeVisible()

  await goTo(page, 'settings')
  const settingsItem = page.getByRole('navigation', { name: '设置项' }).getByRole('link').first()
  await expect.poll(() => settingsItem.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgb(242, 247, 243)')
  await expect.poll(() => settingsItem.locator('span').last().evaluate((element) => getComputedStyle(element).color)).toBe('rgb(53, 96, 75)')

  await goToSettingsSubPage(page, 'backup')
  const backup = page.locator('section[aria-labelledby="backup-title"]')
  await expect(backup).toBeVisible()
  const backupCaution = backup.getByText('ZIP 压缩不是加密：备份文件没有密码保护，请自行保管，不要上传到公开位置。点击导出只是把文件交给浏览器或系统分享，并不代表备份已经保存到本设备之外。')
  await expect.poll(() => backupCaution.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgb(243, 236, 228)')

  await goToSettingsSubPage(page, 'screening')
  const screening = page.locator('section[aria-labelledby="screening-title"]')
  await expect(screening).toBeVisible()

  await page.emulateMedia({ forcedColors: 'active' })
  await goTo(page, 'today')
  const forcedTodayCard = page.getByRole('region', { name: '昨夜记录' })
  await expect.poll(() => forcedTodayCard.evaluate((element) => getComputedStyle(element).borderTopColor)).toBe('rgb(0, 0, 0)')
  await expect.poll(() => forcedTodayCard.evaluate((element) => getComputedStyle(element).borderTopWidth)).toBe('1px')
})
