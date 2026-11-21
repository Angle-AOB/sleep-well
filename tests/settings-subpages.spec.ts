import { test, expect, type Page } from '@playwright/test'
import {
  goToSettingsSubPage,
  openPage,
  openSettingsSubPage,
  settingsSubPageHeading,
  type SettingsSubPage
} from './navigation'

// 设置是列表，五个子页各自承载一块内容：地址、顶栏标题、返回键与底栏当前项
// 都是对外契约。断言走地址、可访问名称、可见性、焦点与滚动位置。
const subPages: SettingsSubPage[] = ['screening', 'reminders', 'backup', 'diagnostics', 'about']

function settingsList(page: Page) {
  return page.getByRole('navigation', { name: '设置项' })
}

test('each settings sub-page opens directly and survives a reload', async ({ page }) => {
  for (const target of subPages) {
    await openSettingsSubPage(page, target, '2026-11-20T09:00:00')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(settingsSubPageHeading[target])
    await expect(page).toHaveURL(new RegExp(`#/settings/${target}$`))

    await page.reload()
    await expect(
      page.getByRole('heading', { level: 1, name: settingsSubPageHeading[target] })
    ).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
  }
})

test('the settings list has five entries and the status section, with no search', async ({ page }) => {
  await openPage(page, 'settings', '2026-11-20T09:00:00')

  const links = settingsList(page).getByRole('link')
  await expect(links).toHaveCount(5)
  for (const target of subPages) {
    await expect(settingsList(page).getByRole('link', { name: settingsSubPageHeading[target], exact: true })).toBeVisible()
  }

  await expect(page.getByRole('searchbox')).toHaveCount(0)

  const status = page.getByRole('region', { name: '应用状态' })
  await expect(status.getByRole('status').filter({ hasText: /当前可离线使用|训练内容缓存中|训练内容缓存失败/ }).first()).toBeVisible({ timeout: 30_000 })
  await expect(status.getByRole('status').filter({ hasText: /偏好已保存在此设备|正在保存偏好/ }).first()).toBeVisible()
})

test('each sub-page renders only its own content and the bottom bar keeps settings current', async ({ page }) => {
  await openPage(page, 'settings', '2026-11-20T09:00:00')

  for (const target of subPages) {
    await goToSettingsSubPage(page, target)

    // 列表与其他子页都不在该子页的可见树里。
    await expect(settingsList(page)).toHaveCount(0)
    for (const other of subPages) {
      if (other === target) continue
      await expect(
        settingsList(page).getByRole('link', { name: settingsSubPageHeading[other], exact: true })
      ).toHaveCount(0)
    }

    const settingsTab = page
      .getByRole('navigation', { name: '页面导航' })
      .getByRole('link', { name: '设置', exact: true })
    await expect(settingsTab).toHaveAttribute('aria-current', 'page')

    await page.getByRole('link', { name: '返回设置' }).click()
    await expect(page.getByRole('heading', { level: 1, name: '设置' })).toBeVisible()
    await expect(settingsList(page)).toBeVisible()
  }
})

test('entering a sub-page scrolls to the top and focuses the sub-page title', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 400 })
  await openPage(page, 'settings', '2026-11-20T09:00:00')
  await page.evaluate(() => {
    document.documentElement.style.scrollBehavior = 'auto'
    window.scrollTo(0, document.body.scrollHeight)
  })
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)

  await settingsList(page).getByRole('link', { name: '关于与隐私', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: '关于与隐私' })).toBeFocused()
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
})

test('the back button restores the list scroll position and focuses the triggering entry', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 400 })
  await openPage(page, 'settings', '2026-11-20T09:00:00')
  // 等离线状态从“缓存中 + 重试按钮”收敛到“可离线使用”，列表高度才稳定，
  // 否则返回时可比离开时短，滚动位置会被浏览器截断。
  await expect(page.getByText('当前可离线使用').last()).toBeVisible({ timeout: 30_000 })
  await page.evaluate(() => {
    document.documentElement.style.scrollBehavior = 'auto'
    window.scrollTo(0, document.body.scrollHeight)
  })
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)

  // 用 DOM 激活链接，避免鼠标/键盘把列表项滚进视野的动作混进“离开时的位置”；
  // 进入子页仍走同一套 hash 路由与焦点逻辑。
  const trigger = settingsList(page).getByRole('link', { name: '关于与隐私', exact: true })
  const listScroll = await page.evaluate(() => window.scrollY)
  await trigger.evaluate((element) => (element as HTMLElement).click())
  await expect(page.getByRole('heading', { level: 1, name: '关于与隐私' })).toBeVisible()

  await page.getByRole('link', { name: '返回设置' }).click()
  await expect(page.getByRole('heading', { level: 1, name: '设置' })).toBeVisible()
  await expect(settingsList(page).getByRole('link', { name: '关于与隐私', exact: true })).toBeFocused()
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(listScroll)
})

test('browser back also restores the list scroll position and focus', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 400 })
  await openPage(page, 'settings', '2026-11-20T09:00:00')
  await expect(page.getByText('当前可离线使用').last()).toBeVisible({ timeout: 30_000 })
  await page.evaluate(() => {
    document.documentElement.style.scrollBehavior = 'auto'
    window.scrollTo(0, document.body.scrollHeight)
  })
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)

  const trigger = settingsList(page).getByRole('link', { name: '关于与隐私', exact: true })
  const listScroll = await page.evaluate(() => window.scrollY)
  await trigger.evaluate((element) => (element as HTMLElement).click())
  await expect(page.getByRole('heading', { level: 1, name: '关于与隐私' })).toBeVisible()

  await page.goBack()
  await expect(page.getByRole('heading', { level: 1, name: '设置' })).toBeVisible()
  await expect(settingsList(page).getByRole('link', { name: '关于与隐私', exact: true })).toBeFocused()
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(listScroll)
})

test('about and privacy shows the brand, non-medical boundary and local-only promise', async ({ page }) => {
  await openSettingsSubPage(page, 'about', '2026-11-20T09:00:00')
  const about = page.getByRole('region', { name: '关于这个应用' })

  await expect(about.getByText('睡眠行为训练器', { exact: true })).toBeVisible()
  await expect(about.getByText(/非医疗服务/).first()).toBeVisible()
  await expect(about.getByRole('heading', { name: '你的数据留在此设备' })).toBeVisible()
  await expect(about.getByText('仅保存在此设备')).toBeVisible()
  await expect(about.getByText('不创建账号')).toBeVisible()
  await expect(about.getByText('不上传睡眠日记')).toBeVisible()
  await expect(about.getByText('错误只在本地显示')).toBeVisible()
  await expect(about.getByText('本地优先 · 离线可用')).toBeVisible()
})

test('an unknown settings sub-page still falls back to today', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-20T09:00:00'))
  await page.goto('/#/settings/not-a-page')
  await expect(page).toHaveURL(/#\/today$/)
  await expect(page.getByRole('heading', { level: 1, name: '今日' })).toBeVisible()
})
