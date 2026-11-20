import { test, expect } from '@playwright/test'
import { evaluateNight, type SleepDiaryEntry } from '../src/domain/diary'

function entry(overrides: Partial<SleepDiaryEntry> = {}): SleepDiaryEntry {
  return {
    date: '2026-03-08',
    lightsOffTime: '23:00',
    sleepOnsetLatencyMinutes: 30,
    finalWakeTime: '06:30',
    outOfBedTime: '07:00',
    nightWakes: 'unknown',
    waso: { kind: 'none-remembered' },
    tags: [],
    recordedAt: '2026-03-08T07:05:00.000Z',
    updatedAt: '2026-03-08T07:05:00.000Z',
    ...overrides
  }
}

test.describe('daylight saving transitions', () => {
  const originalTimezone = process.env.TZ

  test.beforeAll(() => {
    process.env.TZ = 'America/New_York'
  })

  test.afterAll(() => {
    if (originalTimezone === undefined) delete process.env.TZ
    else process.env.TZ = originalTimezone
  })

  test('a spring-forward night measures elapsed time instead of wall-clock hours', () => {
    // 墙钟 23:00 → 07:00 标称 8 小时，但 2026-03-08 02:00 进入夏令时，实际只有 7 小时。
    const assessment = evaluateNight(entry({ date: '2026-03-08' }))

    expect(assessment.timeInBed).toEqual({ status: 'available', value: 420 })
    expect(assessment.totalSleep).toEqual({ status: 'available', value: 360 })
    expect(assessment.sleepEfficiency).toEqual({ status: 'available', value: 85.7 })
  })

  test('a fall-back night measures elapsed time instead of wall-clock hours', () => {
    // 2026-11-01 02:00 退出夏令时，墙钟 8 小时实际为 9 小时。
    const assessment = evaluateNight(entry({ date: '2026-11-01' }))

    expect(assessment.timeInBed).toEqual({ status: 'available', value: 540 })
    expect(assessment.totalSleep).toEqual({ status: 'available', value: 480 })
    expect(assessment.sleepEfficiency).toEqual({ status: 'available', value: 88.9 })
  })
})
