import { expect, type Page } from '@playwright/test'

export type AppPage = 'today' | 'diary' | 'training' | 'settings'

export type SettingsSubPage = 'screening' | 'reminders' | 'backup' | 'diagnostics' | 'about'

/** 页面地址与顶栏页名共用同一份契约，测试按可访问名称导航，不碰 CSS 类名或 hash 实现。 */
export const pageHeading: Record<AppPage, string> = {
  today: '今日',
  diary: '晨间睡眠日记',
  training: '训练',
  settings: '设置'
}

export const pageNavigationName: Record<AppPage, string> = {
  today: '今日',
  diary: '日记',
  training: '训练',
  settings: '设置'
}

/** 设置列表项名称；诊断页顶栏改用另一措辞，因此与 `settingsSubPageHeading` 分开维护。 */
export const settingsSubPageItemName: Record<SettingsSubPage, string> = {
  screening: '安全自查',
  reminders: '提醒与偏好',
  backup: '备份与导出',
  diagnostics: '诊断信息',
  about: '关于与隐私'
}

/** 子页顶栏标题：与列表项同名，只有诊断页用「诊断与反馈」避免与面板名称重复。 */
export const settingsSubPageHeading: Record<SettingsSubPage, string> = {
  ...settingsSubPageItemName,
  diagnostics: '诊断与反馈'
}

/** 约定所有端到端用例固定本地日期；个别用例需要别的日期时显式传入。 */
export const defaultClock = '2026-11-20T09:00:00'

export async function openPage(page: Page, target: AppPage, at = defaultClock): Promise<void> {
  await page.clock.setFixedTime(new Date(at))
  const url = `/#/${target}`
  // 同一个 hash 地址的 goto 在 Chromium 里是原地锚点导航，不会重新挂载应用；
  // 「重新打开应用」必须显式 reload，日期推进与提醒评估才会重新执行。
  if (new URL(page.url()).hash === `#/${target}`) {
    await page.reload()
  } else {
    await page.goto(url)
  }
  await expect(page.getByRole('heading', { level: 1, name: pageHeading[target] })).toBeVisible()
}

/** 用底栏切换页面，等顶栏页名更新。 */
export async function goTo(page: Page, target: AppPage): Promise<void> {
  await page
    .getByRole('navigation', { name: '页面导航' })
    .getByRole('link', { name: pageNavigationName[target], exact: true })
    .click()
  await expect(page.getByRole('heading', { level: 1, name: pageHeading[target] })).toBeVisible()
}

/** 直接打开设置子页；与 top-level 页面一样支持刷新与深链。 */
export async function openSettingsSubPage(
  page: Page,
  target: SettingsSubPage,
  at = defaultClock
): Promise<void> {
  await page.clock.setFixedTime(new Date(at))
  const hash = `#/settings/${target}`
  if (new URL(page.url()).hash === hash) {
    await page.reload()
  } else {
    await page.goto(`/${hash}`)
  }
  await expect(
    page.getByRole('heading', { level: 1, name: settingsSubPageHeading[target] })
  ).toBeVisible()
}

/** 从设置列表进入子页：先经底栏到设置，再点对应列表项。 */
export async function goToSettingsSubPage(page: Page, target: SettingsSubPage): Promise<void> {
  await goTo(page, 'settings')
  await page
    .getByRole('navigation', { name: '设置项' })
    .getByRole('link', { name: settingsSubPageItemName[target], exact: true })
    .click()
  await expect(
    page.getByRole('heading', { level: 1, name: settingsSubPageHeading[target] })
  ).toBeVisible()
}
