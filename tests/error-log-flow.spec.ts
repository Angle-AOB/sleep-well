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

test('a failed import is recorded and diagnostics carry no health data', async ({ page }) => {
  await openApp(page)
  const diary = page.getByRole('region', { name: '晨间睡眠日记' })
  await diary.locator('#diary-date').fill('2026-11-19')
  await diary.locator('#lights-off').fill('21:47')
  await diary.locator('#sleep-onset').fill('137')
  await diary.locator('#final-wake').fill('06:30')
  await diary.locator('#out-of-bed').fill('07:00')
  await diary.locator('#waso').selectOption('none-remembered')
  await diary.getByRole('button', { name: /保存日记|更新日记/ }).click()
  await expect(diary.getByText('日记已保存在此设备')).toBeVisible()

  await page.locator('input[type="file"]').setInputFiles({
    name: 'corrupt.sleep-backup.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from('this is not a backup archive')
  })
  await expect(page.getByText('这个文件不是完整、可信的备份，或已经损坏。当前数据未被改动。')).toBeVisible()

  const panel = page.getByRole('region', { name: '诊断信息' })
  await panel.getByRole('button', { name: '诊断信息与错误报告' }).click()
  await expect(panel.getByText('备份文件校验失败')).toBeVisible()

  const diagnostics = (await panel.locator('.error-log-text').textContent()) ?? ''
  expect(diagnostics).toContain('archive-rejected')
  expect(diagnostics).not.toContain('21:47')
  expect(diagnostics).not.toContain('137')

  const issueLink = panel.getByRole('link', { name: '打开 GitHub issue' })
  const body = decodeURIComponent((await issueLink.getAttribute('href')) ?? '')
  expect(body).toContain('appVersion: 0.1.0')
  expect(body).not.toContain('21:47')
  expect(body).not.toContain('137')
})

test('the copy button puts the plain-text diagnostics on the clipboard', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await openApp(page)
  const panel = page.getByRole('region', { name: '诊断信息' })
  await panel.getByRole('button', { name: '诊断信息与错误报告' }).click()
  await panel.getByRole('button', { name: '复制诊断信息' }).click()
  await expect(panel.getByText('诊断信息已复制到剪贴板')).toBeVisible()

  const clipboard = await page.evaluate(() => navigator.clipboard.readText())
  expect(clipboard).toContain('sleep-well diagnostics')
  expect(clipboard).toContain('appVersion: 0.1.0')
})

test('a failed export is recorded in the error log as well', async ({ page }) => {
  await page.addInitScript(() => {
    URL.createObjectURL = () => { throw new Error('blob urls unavailable') }
  })
  await openApp(page)

  const backup = page.getByRole('region', { name: '本地备份与导出' })
  await backup.getByRole('button', { name: '导出完整备份（ZIP）' }).click()
  await expect(backup.getByText('无法生成备份文件。请检查此设备的存储空间后重试。')).toBeVisible()

  const panel = page.getByRole('region', { name: '诊断信息' })
  await panel.getByRole('button', { name: '诊断信息与错误报告' }).click()
  await expect(panel.getByText('备份导出失败')).toBeVisible()
})
