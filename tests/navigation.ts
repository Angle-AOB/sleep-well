import { expect, type Page } from '@playwright/test'

export type AppPage = 'today' | 'diary' | 'training' | 'settings'

/** 页面地址与顶栏页名共用同一份契约，测试按可访问名称导航，不碰 CSS 类名或 hash 实现。 */
export const pageHeading: Record<AppPage, string> = {
  today: '今日',
  diary: '日记',
  training: '训练',
  settings: '设置'
}

export async function openPage(page: Page, target: AppPage, at?: string): Promise<void> {
  if (at) await page.clock.setFixedTime(new Date(at))
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
    .getByRole('link', { name: pageHeading[target], exact: true })
    .click()
  await expect(page.getByRole('heading', { level: 1, name: pageHeading[target] })).toBeVisible()
}
