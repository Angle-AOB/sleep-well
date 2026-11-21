import { test, expect, type Page } from '@playwright/test'

async function openApp(page: Page, time = '2026-11-20T09:00:00') {
  await page.clock.setFixedTime(new Date(time))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '本地备份与导出' })).toBeVisible()
}

test('the error log panel stays collapsed until asked and shows plain-text diagnostics', async ({ page }) => {
  await openApp(page)
  const panel = page.getByRole('region', { name: '诊断信息' })
  await expect(panel.getByText('sleep-well diagnostics')).toBeHidden()

  await panel.getByRole('button', { name: '诊断信息与错误报告' }).click()
  await expect(panel.getByText('sleep-well diagnostics')).toBeVisible()
  await expect(panel.getByText('appVersion: 0.1.0')).toBeVisible()
  await expect(panel.getByText('本次会话还没有错误记录')).toBeVisible()
  await expect(panel.getByRole('button', { name: '复制诊断信息' })).toBeVisible()

  const issueLink = panel.getByRole('link', { name: '打开 GitHub issue' })
  await expect(issueLink).toBeVisible()
  const href = await issueLink.getAttribute('href')
  expect(href).toContain('https://github.com/Angle-AOB/sleep-well/issues/new')
  expect(decodeURIComponent(href ?? '')).toContain('appVersion: 0.1.0')
})
