import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { assessScreening, canUseSleepRestriction, type ScreeningAnswers } from '../src/domain/screening'
import { goTo, openPage } from './navigation'

const ordinaryAnswers: ScreeningAnswers = {
  age: 30,
  bipolarOrMania: false,
  seizureHistory: false,
  osaRedFlags: false,
  dangerousParasomnia: false,
  pregnant: false,
  severeSleepinessOrSafetyRisk: false,
  acuteInstability: false,
  distress: 'some'
}

async function completeOrdinaryScreening(page: Page) {
  await page.getByRole('button', { name: '开始自查' }).click()
  await page.getByLabel('你的年龄').fill('30')
  await page.getByRole('group', { name: '你是否曾被告知患有双相障碍，或有躁狂/轻躁狂发作史？' }).getByLabel('否').check()
  await page.getByRole('group', { name: '你是否有癫痫或惊厥病史？' }).getByLabel('否').check()
  await page.getByRole('group', { name: '你是否有响亮鼾声、目击呼吸暂停、白天嗜睡或高血压等情况？' }).getByLabel('否').check()
  await page.getByRole('group', { name: '你是否有危险性异态睡眠，例如梦游时可能受伤？' }).getByLabel('否').check()
  await page.getByRole('group', { name: '你目前是否怀孕？' }).getByLabel('否').check()
  await page.getByRole('group', { name: '你是否会在驾驶或高风险工作时难以保持清醒？' }).getByLabel('否').check()
  await page.getByRole('group', { name: '你目前是否有急性不稳定的身心状况，需要尽快获得专业评估？' }).getByLabel('否').check()
  await page.getByLabel('睡眠困扰持续多久？').selectOption('one-to-four-weeks')
  await page.getByLabel('最近一周，大约有几晚受到睡眠困扰影响？').selectOption('one-to-two')
  await page.getByLabel('睡眠困扰对日间生活影响多大？').selectOption('some')
  await page.getByRole('group', { name: '目前这件事给你带来多大困扰？' }).getByLabel('有一些困扰').check()
  await page.getByLabel('你最希望改善什么？').selectOption('fall-asleep')
}

test('each safety concern pauses restriction while keeping non-restrictive activities available', () => {
  const safetyAnswers: Partial<ScreeningAnswers>[] = [
    { age: 17 },
    { bipolarOrMania: true },
    { seizureHistory: true },
    { osaRedFlags: true },
    { dangerousParasomnia: true },
    { pregnant: true },
    { severeSleepinessOrSafetyRisk: true },
    { acuteInstability: true }
  ]

  for (const answers of safetyAnswers) {
    const result = assessScreening({ ...ordinaryAnswers, ...answers }, '2026-11-20T10:00:00.000Z')
    expect(result.sleepRestrictionPaused).toBe(true)
    expect(result.availableActivities).toEqual(['education', 'diary', 'export'])
    expect(canUseSleepRestriction(result)).toBe(false)
  }
})

test('ordinary answers allow sleep restriction without a clinical label', () => {
  const result = assessScreening(ordinaryAnswers, '2026-11-20T10:00:00.000Z')

  expect(result.status).toBe('cleared')
  expect(result.sleepRestrictionPaused).toBe(false)
  expect(result.strongReferral).toBe(false)
  expect(result.availableActivities).toContain('sleep-restriction')
  expect(canUseSleepRestriction(result)).toBe(true)
})

test('risk answers pause sleep restriction while keeping diary and education available', () => {
  const result = assessScreening({ ...ordinaryAnswers, osaRedFlags: true }, '2026-11-20T10:00:00.000Z')

  expect(result.status).toBe('needs-review')
  expect(result.sleepRestrictionPaused).toBe(true)
  expect(result.strongReferral).toBe(true)
  expect(result.availableActivities).toEqual(['education', 'diary', 'export'])
  expect(canUseSleepRestriction(result)).toBe(false)
})

test('rescreening is required before restriction can resume', () => {
  const previous = assessScreening({ ...ordinaryAnswers, seizureHistory: true }, '2026-11-20T10:00:00.000Z')
  const pending = { ...previous, rescreenRequired: true }

  expect(canUseSleepRestriction(pending)).toBe(false)
  expect(canUseSleepRestriction(assessScreening(ordinaryAnswers, '2026-11-21T10:00:00.000Z'))).toBe(true)
})

test('severe self-reported distress pauses restriction and recommends professional assessment', () => {
  const result = assessScreening({ ...ordinaryAnswers, distress: 'a-lot' }, '2026-11-20T10:00:00.000Z')

  expect(result.status).toBe('needs-review')
  expect(result.strongReferral).toBe(true)
  expect(result.sleepRestrictionPaused).toBe(true)
  expect(result.availableActivities).toEqual(['education', 'diary', 'export'])
})

test('ordinary user can complete and persist the non-diagnostic screening', async ({ page }) => {
  await openPage(page, 'settings')
  await page.getByRole('heading', { name: '睡眠困扰与安全自查' }).waitFor()
  await completeOrdinaryScreening(page)
  await page.getByRole('button', { name: '提交自查' }).click()

  await expect(page.getByText('目前没有发现需要暂停睡眠限制的安全筛查项。')).toBeVisible()
  await expect(page.getByText('已完成自有的非诊断性问卷')).toBeVisible()
  await page.reload()
  await expect(page.getByText('目前没有发现需要暂停睡眠限制的安全筛查项。')).toBeVisible()
})

test('a safety concern pauses restriction and can be cleared only by completing the screening again', async ({ page }) => {
  await openPage(page, 'settings')
  await page.getByRole('button', { name: '开始自查' }).click()
  await page.getByLabel('你的年龄').fill('30')
  await page.getByRole('group', { name: '你是否曾被告知患有双相障碍，或有躁狂/轻躁狂发作史？' }).getByLabel('是').check()
  await page.getByRole('group', { name: '你是否有癫痫或惊厥病史？' }).getByLabel('否').check()
  await page.getByRole('group', { name: '你是否有响亮鼾声、目击呼吸暂停、白天嗜睡或高血压等情况？' }).getByLabel('否').check()
  await page.getByRole('group', { name: '你是否有危险性异态睡眠，例如梦游时可能受伤？' }).getByLabel('否').check()
  await page.getByRole('group', { name: '你目前是否怀孕？' }).getByLabel('否').check()
  await page.getByRole('group', { name: '你是否会在驾驶或高风险工作时难以保持清醒？' }).getByLabel('否').check()
  await page.getByRole('group', { name: '你目前是否有急性不稳定的身心状况，需要尽快获得专业评估？' }).getByLabel('否').check()
  await page.getByLabel('睡眠困扰持续多久？').selectOption('one-to-four-weeks')
  await page.getByLabel('最近一周，大约有几晚受到睡眠困扰影响？').selectOption('one-to-two')
  await page.getByLabel('睡眠困扰对日间生活影响多大？').selectOption('some')
  await page.getByRole('group', { name: '目前这件事给你带来多大困扰？' }).getByLabel('有一些困扰').check()
  await page.getByLabel('你最希望改善什么？').selectOption('fall-asleep')
  await page.getByRole('button', { name: '提交自查' }).click()

  await expect(page.getByText('睡眠限制暂时暂停。')).toBeVisible()
  await expect(page.getByText('建议先咨询睡眠或医疗专业人士，再决定是否进行睡眠限制。')).toBeVisible()
  await expect(page.getByText('睡眠限制与自动滴定暂停；睡眠日记仍可继续记录，教育内容与数据导出将在相应功能上线后可用。')).toBeVisible()

  await goTo(page, 'training')
  await expect(page.getByRole('button', { name: '开始六周训练' })).toBeEnabled()
  await goTo(page, 'diary')
  await expect(page.getByRole('heading', { name: '晨间睡眠日记' })).toBeVisible()

  await goTo(page, 'settings')
  await page.reload()
  await expect(page.getByText('睡眠限制暂时暂停。')).toBeVisible()

  await page.getByRole('button', { name: '重新进行安全筛查' }).click()
  await page.reload()
  await expect(page.getByText('睡眠限制暂时暂停。')).toBeVisible()

  await page.getByRole('button', { name: '重新进行安全筛查' }).click()
  await completeOrdinaryScreening(page)
  await page.getByRole('button', { name: '提交自查' }).click()
  await expect(page.getByText('目前没有发现需要暂停睡眠限制的安全筛查项。')).toBeVisible()
})
