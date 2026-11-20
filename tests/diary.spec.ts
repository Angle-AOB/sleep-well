import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { evaluateNight, isCompleteNight, type SleepDiaryEntry } from '../src/domain/diary'

async function openDiary(page: Page) {
  // 固定本地日期，避免测试依赖真实系统时钟、在本地午夜边界上失败。
  await page.clock.setFixedTime(new Date(2026, 10, 20, 8, 0, 0))
  await page.goto('/')
}

function entry(overrides: Partial<SleepDiaryEntry> = {}): SleepDiaryEntry {
  return {
    date: '2026-11-20',
    nightWakes: 'unknown',
    waso: { kind: 'unknown' },
    tags: [],
    recordedAt: '2026-11-20T07:05:00.000Z',
    updatedAt: '2026-11-20T07:05:00.000Z',
    ...overrides
  }
}

const completeNightFields: Partial<SleepDiaryEntry> = {
  lightsOffTime: '23:00',
  sleepOnsetLatencyMinutes: 30,
  finalWakeTime: '06:30',
  outOfBedTime: '07:00',
  waso: { kind: 'none-remembered' }
}

test('a complete night across midnight yields TIB, terminal awake, TST and SE', () => {
  const assessment = evaluateNight(entry(completeNightFields))

  expect(assessment.problems).toEqual([])
  expect(assessment.complete).toBe(true)
  expect(assessment.timeInBed).toEqual({ status: 'available', value: 480 })
  expect(assessment.terminalAwake).toEqual({ status: 'available', value: 30 })
  expect(assessment.totalSleep).toEqual({ status: 'available', value: 420 })
  expect(assessment.sleepEfficiency).toEqual({ status: 'available', value: 87.5 })
  expect(isCompleteNight(entry(completeNightFields))).toBe(true)
})

test('terminal awake is subtracted from TST but still counts inside TIB', () => {
  const assessment = evaluateNight(entry({
    lightsOffTime: '22:45',
    sleepOnsetLatencyMinutes: 20,
    finalWakeTime: '05:15',
    outOfBedTime: '06:45',
    waso: { kind: 'minutes', minutes: 35 }
  }))

  expect(assessment.timeInBed).toEqual({ status: 'available', value: 480 })
  expect(assessment.terminalAwake).toEqual({ status: 'available', value: 90 })
  expect(assessment.totalSleep).toEqual({ status: 'available', value: 335 })
  expect(assessment.sleepEfficiency).toEqual({ status: 'available', value: 69.8 })
})

test('a bedtime after midnight still belongs to the same diary night', () => {
  const assessment = evaluateNight(entry({
    lightsOffTime: '00:30',
    sleepOnsetLatencyMinutes: 15,
    finalWakeTime: '07:30',
    outOfBedTime: '08:00',
    waso: { kind: 'none-remembered' }
  }))

  expect(assessment.timeInBed).toEqual({ status: 'available', value: 450 })
  expect(assessment.totalSleep).toEqual({ status: 'available', value: 405 })
  expect(assessment.sleepEfficiency).toEqual({ status: 'available', value: 90 })
})

test('unknown WASO keeps TIB available but leaves TST and SE not computable, never zero', () => {
  const assessment = evaluateNight(entry({
    lightsOffTime: '23:30',
    sleepOnsetLatencyMinutes: 25,
    finalWakeTime: '06:00',
    outOfBedTime: '06:30',
    waso: { kind: 'unknown' }
  }))

  expect(assessment.timeInBed).toEqual({ status: 'available', value: 420 })
  expect(assessment.totalSleep).toEqual({ status: 'unavailable', reason: 'missing-input' })
  expect(assessment.sleepEfficiency).toEqual({ status: 'unavailable', reason: 'missing-input' })
  expect(assessment.complete).toBe(false)
})

test('a range WASO is reported as approximate instead of being turned into exact minutes', () => {
  const assessment = evaluateNight(entry({
    lightsOffTime: '23:30',
    sleepOnsetLatencyMinutes: 25,
    finalWakeTime: '06:00',
    outOfBedTime: '06:30',
    waso: { kind: 'range', range: '15-to-30' }
  }))

  expect(assessment.problems).toEqual([])
  expect(assessment.totalSleep).toEqual({ status: 'unavailable', reason: 'approximate-input' })
  expect(assessment.sleepEfficiency).toEqual({ status: 'unavailable', reason: 'approximate-input' })
  expect(assessment.complete).toBe(false)
})

test('explicit zero WASO completes the night without inventing missing data', () => {
  const assessment = evaluateNight(entry({
    lightsOffTime: '23:30',
    sleepOnsetLatencyMinutes: 25,
    finalWakeTime: '06:00',
    outOfBedTime: '06:30',
    waso: { kind: 'minutes', minutes: 0 }
  }))

  expect(assessment.totalSleep).toEqual({ status: 'available', value: 365 })
  expect(assessment.sleepEfficiency).toEqual({ status: 'available', value: 86.9 })
  expect(assessment.complete).toBe(true)
})

test('night wake count does not decide whether TST and SE are computable', () => {
  const assessment = evaluateNight(entry({
    ...completeNightFields,
    nightWakes: 'six-plus'
  }))

  expect(assessment.complete).toBe(true)
  expect(assessment.sleepEfficiency).toEqual({ status: 'available', value: 87.5 })
})

test('a partial diary saves with only the metrics its inputs allow', () => {
  const partial = entry({ lightsOffTime: '23:00', outOfBedTime: '07:00' })
  const assessment = evaluateNight(partial)

  expect(assessment.problems).toEqual([])
  expect(assessment.timeInBed).toEqual({ status: 'available', value: 480 })
  expect(assessment.terminalAwake).toEqual({ status: 'unavailable', reason: 'missing-input' })
  expect(assessment.totalSleep).toEqual({ status: 'unavailable', reason: 'missing-input' })
  expect(assessment.sleepEfficiency).toEqual({ status: 'unavailable', reason: 'missing-input' })
  expect(isCompleteNight(partial)).toBe(false)
})

test('final wake later than getting out of bed is a contradiction that needs correction', () => {
  const assessment = evaluateNight(entry({
    ...completeNightFields,
    finalWakeTime: '07:30',
    outOfBedTime: '07:00'
  }))

  expect(assessment.problems.map((problem) => problem.kind)).toContain('final-wake-after-out-of-bed')
  expect(assessment.terminalAwake).toEqual({ status: 'unavailable', reason: 'invalid-input' })
  expect(assessment.sleepEfficiency).toEqual({ status: 'unavailable', reason: 'invalid-input' })
  expect(assessment.complete).toBe(false)
})

test('a morning lights-off later than the final wake is an ordering contradiction', () => {
  const assessment = evaluateNight(entry({
    ...completeNightFields,
    lightsOffTime: '07:10',
    finalWakeTime: '07:00',
    outOfBedTime: '07:30'
  }))

  expect(assessment.problems.map((problem) => problem.kind)).toContain('lights-off-after-wake')
  expect(assessment.timeInBed).toEqual({ status: 'unavailable', reason: 'invalid-input' })
  expect(assessment.complete).toBe(false)
})

test('a range WASO lower bound that already exceeds time in bed is rejected', () => {
  const assessment = evaluateNight(entry({
    lightsOffTime: '06:20',
    sleepOnsetLatencyMinutes: 5,
    finalWakeTime: '06:50',
    outOfBedTime: '07:00',
    waso: { kind: 'range', range: 'over-60' }
  }))

  expect(assessment.timeInBed).toEqual({ status: 'available', value: 40 })
  expect(assessment.problems.map((problem) => problem.kind)).toContain('night-components-exceed-time-in-bed')
})

test('known components longer than time in bed are rejected even when WASO is unknown', () => {
  const assessment = evaluateNight(entry({
    lightsOffTime: '23:00',
    sleepOnsetLatencyMinutes: 240,
    finalWakeTime: '00:30',
    outOfBedTime: '01:00',
    waso: { kind: 'unknown' }
  }))

  expect(assessment.timeInBed).toEqual({ status: 'available', value: 120 })
  expect(assessment.problems.map((problem) => problem.kind)).toContain('night-components-exceed-time-in-bed')
  expect(assessment.totalSleep).toEqual({ status: 'unavailable', reason: 'invalid-input' })
})

test('components longer than time in bed are rejected instead of being clamped', () => {
  const assessment = evaluateNight(entry({
    lightsOffTime: '00:30',
    sleepOnsetLatencyMinutes: 240,
    finalWakeTime: '05:00',
    outOfBedTime: '05:30',
    waso: { kind: 'minutes', minutes: 60 }
  }))

  expect(assessment.timeInBed).toEqual({ status: 'available', value: 300 })
  expect(assessment.problems.map((problem) => problem.kind)).toContain('night-components-exceed-time-in-bed')
  expect(assessment.totalSleep).toEqual({ status: 'unavailable', reason: 'invalid-input' })
  expect(assessment.sleepEfficiency).toEqual({ status: 'unavailable', reason: 'invalid-input' })
})

test('a negative sleep onset latency is rejected', () => {
  const assessment = evaluateNight(entry({
    ...completeNightFields,
    sleepOnsetLatencyMinutes: -10
  }))

  expect(assessment.problems.map((problem) => problem.kind)).toContain('invalid-duration')
  expect(assessment.totalSleep).toEqual({ status: 'unavailable', reason: 'invalid-input' })
  expect(assessment.complete).toBe(false)
})

test('a fractional sleep onset latency is not accepted as an exact minute value', () => {
  const assessment = evaluateNight(entry({ ...completeNightFields, sleepOnsetLatencyMinutes: 7.5 }))

  expect(assessment.problems.map((problem) => problem.kind)).toContain('invalid-duration')
  expect(assessment.totalSleep).toEqual({ status: 'unavailable', reason: 'invalid-input' })
})

test('identical lights-off and out-of-bed times do not produce a zero-length night', () => {
  const assessment = evaluateNight(entry({ lightsOffTime: '07:00', outOfBedTime: '07:00' }))

  expect(assessment.problems.map((problem) => problem.kind)).toContain('time-in-bed-not-positive')
  expect(assessment.timeInBed).toEqual({ status: 'unavailable', reason: 'invalid-input' })
  expect(assessment.sleepEfficiency).toEqual({ status: 'unavailable', reason: 'invalid-input' })
})

test('a complete night needs every necessary field, not just valid times', () => {
  const missingFinalWake = evaluateNight(entry({ ...completeNightFields, finalWakeTime: undefined }))
  const missingLatency = evaluateNight(entry({ ...completeNightFields, sleepOnsetLatencyMinutes: undefined }))

  expect(missingFinalWake.complete).toBe(false)
  expect(missingFinalWake.totalSleep).toEqual({ status: 'unavailable', reason: 'missing-input' })
  expect(missingLatency.complete).toBe(false)
  expect(missingLatency.totalSleep).toEqual({ status: 'unavailable', reason: 'missing-input' })
})

test('a saved complete night shows TIB, TST and SE and survives reload', async ({ page }) => {
  await openDiary(page)
  await expect(page.getByRole('heading', { name: '晨间睡眠日记' })).toBeVisible()

  const date = await page.locator('#diary-date').inputValue()
  await page.locator('#lights-off').fill('23:00')
  await page.locator('#sleep-onset').fill('30')
  await page.locator('#final-wake').fill('06:30')
  await page.locator('#out-of-bed').fill('07:00')
  await page.locator('#waso').selectOption('none-remembered')
  await page.locator('#night-wakes').selectOption('three-to-five')
  await page.getByRole('group', { name: '主观睡眠质量' }).getByLabel('4 分').check()
  await page.getByLabel('咖啡因').check()
  await page.getByLabel('午睡').check()
  await page.getByRole('button', { name: '保存日记' }).click()

  await expect(page.getByText('日记已保存在此设备')).toBeVisible()
  const metrics = page.getByRole('region', { name: '本页指标' })
  await expect(metrics.getByText('8 小时', { exact: true })).toBeVisible()
  await expect(metrics.getByText('30 分钟', { exact: true })).toBeVisible()
  await expect(metrics.getByText('7 小时', { exact: true })).toBeVisible()
  await expect(metrics.getByText('87.5%', { exact: true })).toBeVisible()

  await page.reload()
  await expect(page.locator('#diary-date')).toHaveValue(date)
  await expect(page.locator('#lights-off')).toHaveValue('23:00')
  await expect(page.locator('#night-wakes')).toHaveValue('three-to-five')
  await expect(page.getByLabel('咖啡因')).toBeChecked()
  await expect(page.getByLabel('午睡')).toBeChecked()
  await expect(page.getByRole('group', { name: '主观睡眠质量' }).getByLabel('4 分')).toBeChecked()
  await expect(page.getByRole('region', { name: '本页指标' }).getByText('87.5%', { exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: '最近记录' }).getByRole('button')).toContainText('完整夜')
  await expect(page.getByRole('region', { name: '最近记录' }).getByRole('button')).toHaveAttribute('aria-current', 'date')
})

test('a partial diary saves first and can be completed later', async ({ page }) => {
  await openDiary(page)

  await page.locator('#lights-off').fill('23:00')
  await page.locator('#out-of-bed').fill('07:00')
  await page.getByRole('button', { name: '保存日记' }).click()

  await expect(page.getByText('日记已保存在此设备')).toBeVisible()
  const metrics = page.getByRole('region', { name: '本页指标' })
  await expect(metrics.getByText('8 小时', { exact: true })).toBeVisible()
  await expect(metrics.getByText('7 小时', { exact: true })).toHaveCount(0)
  await expect(metrics.getByText('缺少必要字段').first()).toBeVisible()

  await page.reload()
  const history = page.getByRole('region', { name: '最近记录' })
  const partialEntry = history.getByRole('button', { name: /部分记录/ })
  await expect(partialEntry).toBeVisible()
  await partialEntry.click()
  await expect(page.locator('#lights-off')).toHaveValue('23:00')

  await page.locator('#sleep-onset').fill('20')
  await page.locator('#final-wake').fill('06:40')
  await page.locator('#waso').selectOption('minutes')
  await page.getByLabel('WASO 分钟数').fill('15')
  await page.getByRole('button', { name: '更新日记' }).click()

  await expect(page.getByText('日记已保存在此设备')).toBeVisible()
  await expect(metrics.getByText('7 小时 5 分钟', { exact: true })).toBeVisible()
  await expect(metrics.getByText('88.5%', { exact: true })).toBeVisible()
  await expect(history.getByRole('button')).toContainText('完整夜')
})

test('unknown WASO is shown as not computable rather than zero', async ({ page }) => {
  await openDiary(page)

  await page.locator('#lights-off').fill('23:30')
  await page.locator('#sleep-onset').fill('25')
  await page.locator('#final-wake').fill('06:00')
  await page.locator('#out-of-bed').fill('06:30')
  await page.locator('#waso').selectOption('unknown')
  await page.getByRole('button', { name: '保存日记' }).click()

  const metrics = page.getByRole('region', { name: '本页指标' })
  await expect(metrics.getByText('7 小时', { exact: true })).toBeVisible()
  await expect(metrics.getByText('数据不足').first()).toBeVisible()
  await expect(metrics.getByText('0 分钟', { exact: true })).toHaveCount(0)
  await expect(metrics.getByText('0%', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('region', { name: '最近记录' }).getByRole('button')).toContainText('部分记录')
})

test('a range WASO is reported as approximate instead of exact minutes', async ({ page }) => {
  await openDiary(page)

  await page.locator('#lights-off').fill('23:30')
  await page.locator('#sleep-onset').fill('25')
  await page.locator('#final-wake').fill('06:00')
  await page.locator('#out-of-bed').fill('06:30')
  await page.locator('#waso').selectOption('15-to-30')

  const metrics = page.getByRole('region', { name: '本页指标' })
  await expect(metrics.getByText('只有区间估计，无法精确计算').first()).toBeVisible()
  await expect(metrics.getByText('数据不足').first()).toBeVisible()
})

test('contradictory times must be corrected before the diary is saved', async ({ page }) => {
  await openDiary(page)

  await page.locator('#lights-off').fill('23:00')
  await page.locator('#sleep-onset').fill('30')
  await page.locator('#final-wake').fill('07:30')
  await page.locator('#out-of-bed').fill('07:00')

  await expect(page.getByText('最终醒来时间晚于起床时间，请修正。')).toBeVisible()
  await page.getByRole('button', { name: '保存日记' }).click()
  await expect(page.getByText('日记已保存在此设备')).toHaveCount(0)

  await page.reload()
  await expect(page.getByRole('region', { name: '最近记录' }).getByRole('button')).toHaveCount(0)
  await expect(page.getByText('还没有日记记录。')).toBeVisible()
})

test('selecting exact WASO minutes without a value asks for correction instead of saving unknown', async ({ page }) => {
  await openDiary(page)

  await page.locator('#lights-off').fill('23:30')
  await page.locator('#sleep-onset').fill('25')
  await page.locator('#final-wake').fill('06:00')
  await page.locator('#out-of-bed').fill('06:30')
  await page.locator('#waso').selectOption('minutes')

  await expect(page.getByText('选择“精确分钟”后需要填写具体分钟数。')).toBeVisible()
  await page.getByRole('button', { name: '保存日记' }).click()
  await expect(page.getByText('日记已保存在此设备')).toHaveCount(0)
})

test('a future date cannot be saved as a night', async ({ page }) => {
  await openDiary(page)

  await page.locator('#diary-date').fill('2026-11-25')
  await page.locator('#lights-off').fill('23:00')
  await page.locator('#out-of-bed').fill('07:00')

  await expect(page.getByText('记录日期不能晚于今天，请选择今天或更早的一夜。')).toBeVisible()
  await page.getByRole('button', { name: '保存日记' }).click()
  await expect(page.getByText('日记已保存在此设备')).toHaveCount(0)
})

test('without local storage the diary says nothing will be saved', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 10, 20, 8, 0, 0))
  await page.addInitScript(() => {
    Reflect.deleteProperty(window, 'indexedDB')
  })
  await page.goto('/')

  await expect(page.getByText('此浏览器无法使用本地存储，日记不会保存。')).toBeVisible()
})

test('a resumed app moves to the new local date after midnight', async ({ page }) => {
  await openDiary(page)
  await expect(page.locator('#diary-date')).toHaveValue('2026-11-20')

  await page.clock.setFixedTime(new Date(2026, 10, 21, 7, 0, 0))
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))

  await expect(page.locator('#diary-date')).toHaveValue('2026-11-21')
})

test('a resumed app keeps a backfilled past date selected after midnight', async ({ page }) => {
  await openDiary(page)

  await page.locator('#lights-off').fill('23:00')
  await page.locator('#out-of-bed').fill('07:00')
  await page.getByRole('button', { name: '保存日记' }).click()
  await expect(page.getByText('日记已保存在此设备')).toBeVisible()

  await page.locator('#diary-date').fill('2026-11-15')
  await page.locator('#lights-off').fill('22:30')
  await page.locator('#out-of-bed').fill('06:30')
  await page.getByRole('button', { name: '保存日记' }).click()
  await expect(page.getByText('日记已保存在此设备')).toBeVisible()

  await page.clock.setFixedTime(new Date(2026, 10, 21, 7, 0, 0))
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))

  await expect(page.locator('#diary-date')).toHaveValue('2026-11-15')
  await expect(page.locator('#lights-off')).toHaveValue('22:30')
  await expect(page.locator('#out-of-bed')).toHaveValue('06:30')
})
