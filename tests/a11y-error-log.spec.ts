import { test, expect, type Page } from '@playwright/test'
import { openSettingsSubPage } from './navigation'

// 问题反馈链接与隐私提示：链接有可访问名称、可键盘触发；隐私提示在面板里可读。
// 断言可访问名与可读文本，不碰 CSS 类名。

async function openApp(page: Page) {
  await openSettingsSubPage(page, 'diagnostics', '2026-11-20T09:00:00')
}

test('the issue link has an accessible name and keyboard activation reaches GitHub issues', async ({ page, context }) => {
  await openApp(page)
  const panel = page.getByRole('region', { name: '诊断信息' })
  const issueLink = panel.getByRole('link', { name: '打开 GitHub issue' })
  await expect(issueLink).toBeVisible()
  await expect(issueLink).toHaveAttribute('href', /https:\/\/github\.com\/Angle-AOB\/sleep-well\/issues\/new/)

  // 键盘走到链接并回车触发。链接按设计在新标签打开，所以拦截的是 context 里的
  // 新页面请求；只观察行为，不让浏览器真的离开应用。
  await context.route('https://github.com/**', (route) => route.fulfill({ status: 200, body: 'stubbed' }))
  const popupPromise = context.waitForEvent('page')
  for (let step = 0; step < 60; step += 1) {
    await page.keyboard.press('Tab')
    const isIssueLink = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null
      return (el?.textContent ?? '').includes('打开 GitHub issue')
    })
    if (isIssueLink) break
    if (step === 59) throw new Error('未能用 Tab 到达问题反馈链接')
  }
  await page.keyboard.press('Enter')
  const popup = await popupPromise
  await expect(popup).toHaveURL(/github\.com\/Angle-AOB\/sleep-well\/issues\/new/)
})

test('the diagnostics privacy notices are readable text', async ({ page }) => {
  await openApp(page)
  const panel = page.getByRole('region', { name: '诊断信息' })

  // 诊断页进入后直接展示信息，不再需要展开按钮。
  // 同一段隐私说明也会嵌进诊断全文；断言独立成段的提示本身可读.
  await expect(panel.getByText(/诊断信息只包含版本、环境与错误类别，不含睡眠日记、筛查答案、疗程状态或备份内容/).first()).toBeVisible()
  await expect(panel.getByText(/链接会预填版本、环境与错误类别，不会自动提交 issue，也不会附加错误详情或本地数据/).first()).toBeVisible()
  await expect(panel.getByText(/错误记录只保存在本次会话中，刷新或关闭页面后会丢失/).first()).toBeVisible()
})
