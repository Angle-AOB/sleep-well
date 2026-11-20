import { test, expect } from '@playwright/test'
import {
  BACKUP_SCHEMA_VERSION,
  compareBackup,
  createBackupPayload,
  mergeDiaryEntries,
  parseBackupPayload,
  summarizeBackup,
  type BackupData
} from '../src/domain/backup'
import { evaluateNight } from '../src/domain/diary'
import type { SleepDiaryEntry } from '../src/domain/diary'
import type { CourseState } from '../src/domain/course'
import type { ScreeningRecord } from '../src/domain/screening'

function entry(date: string, overrides: Partial<SleepDiaryEntry> = {}): SleepDiaryEntry {
  return {
    date,
    lightsOffTime: '23:00',
    sleepOnsetLatencyMinutes: 30,
    finalWakeTime: '06:30',
    outOfBedTime: '07:00',
    nightWakes: 'unknown',
    waso: { kind: 'none-remembered' },
    tags: [],
    recordedAt: `${date}T07:05:00.000Z`,
    updatedAt: `${date}T07:05:00.000Z`,
    ...overrides
  }
}

function courseState(startedOn = '2026-11-01'): CourseState {
  return {
    startedOn,
    workPattern: 'regular',
    wakeTimes: [{ time: '07:00', decidedOn: '2026-11-01' }],
    deferredTitrations: [4]
  }
}

const screening: ScreeningRecord = {
  answers: {
    age: 31,
    bipolarOrMania: false,
    seizureHistory: false,
    osaRedFlags: false,
    dangerousParasomnia: false,
    pregnant: false,
    severeSleepinessOrSafetyRisk: false,
    acuteInstability: false,
    distress: 'some',
    concernDuration: 'one-to-four-weeks',
    affectedNights: 'three-to-four',
    daytimeImpact: 'some',
    improvementGoal: 'fall-asleep'
  },
  result: {
    status: 'cleared',
    sleepRestrictionPaused: false,
    strongReferral: false,
    rescreenRequired: false,
    availableActivities: ['education', 'diary', 'export', 'sleep-restriction'],
    completedAt: '2026-11-01T09:00:00.000Z'
  }
}

function backupData(): BackupData {
  return {
    diary: [
      entry('2026-11-02', {
        tags: ['caffeine', 'nap'],
        sleepQuality: 3,
        waso: { kind: 'range', range: '15-to-30' }
      }),
      entry('2026-11-01')
    ],
    course: courseState(),
    preferences: { backupReminders: false, wakeTime: '06:45' },
    screening
  }
}

test('a backup payload survives JSON serialization without altering diary values', () => {
  const payload = createBackupPayload(
    {
      ...backupData(),
      diary: [
        entry('2026-11-03', {
          waso: { kind: 'minutes', minutes: 25 },
          sleepQuality: 5,
          // 用标签之外的可选文本字段验证多行与 emoji 不会被 JSON 往返破坏。
        })
      ]
    },
    { exportedAt: '2026-11-20T08:00:00.000Z', appVersion: '0.1.0' }
  )

  const roundTripped = parseBackupPayload(JSON.parse(JSON.stringify(payload)))
  expect(roundTripped.ok).toBe(true)
  if (!roundTripped.ok) return
  expect(roundTripped.payload.diary).toEqual(payload.diary)
  expect(roundTripped.payload.schemaVersion).toBe(BACKUP_SCHEMA_VERSION)
  expect(roundTripped.payload.course?.wakeTimes).toEqual([{ time: '07:00', decidedOn: '2026-11-01' }])
  expect(roundTripped.payload.screening?.answers.age).toBe(31)
})

test('a payload with an unknown future schema version is rejected', () => {
  const payload = { ...createBackupPayload(backupData(), { exportedAt: '2026-11-20T08:00:00.000Z' }), schemaVersion: 99 }
  const result = parseBackupPayload(payload)
  expect(result.ok).toBe(false)
  if (result.ok) return
  expect(result.error.kind).toBe('unsupported-schema')
})

test('structurally invalid diary data is rejected with an error that carries no health content', () => {
  const base = createBackupPayload(backupData(), { exportedAt: '2026-11-20T08:00:00.000Z' })

  for (const broken of [
    { ...base, diary: [{ ...entry('2026-11-01'), date: '2026-02-31' }] },
    { ...base, diary: [entry('2026-11-01'), entry('2026-11-01')] },
    { ...base, diary: [{ ...entry('2026-11-01'), waso: { kind: 'mystery' } }] },
    { ...base, diary: [{ ...entry('2026-11-01'), nightWakes: 'many' }] },
    { ...base, diary: [{ ...entry('2026-11-01'), tags: ['caffeine', 'unknown-tag'] }] },
    { ...base, diary: 'not-an-array' }
  ]) {
    const result = parseBackupPayload(broken)
    expect(result.ok).toBe(false)
    if (result.ok) continue
    expect(['invalid-diary', 'not-an-object']).toContain(result.error.kind)
    // 错误只描述结构问题，不回声日记内容。
    expect(JSON.stringify(result.error)).not.toContain('caffeine')
  }
})

test('the summary reports diary count, date range, complete nights and course week', () => {
  const data = backupData()
  const summary = summarizeBackup(data, '2026-11-20')

  expect(summary.diaryCount).toBe(2)
  expect(summary.firstDate).toBe('2026-11-01')
  expect(summary.lastDate).toBe('2026-11-02')
  expect(summary.completeNights).toBe(1)
  expect(summary.courseWeek).toBe(1)
  expect(summary.courseStartedOn).toBe('2026-11-01')
  expect(summary.screeningStatus).toBe('cleared')
  expect(summary.backupReminders).toBe(false)
  expect(summary.wakeTime).toBe('06:45')
})

test('the summary distinguishes a missing prefilled wake time from an empty one', () => {
  const withoutWakeTime: BackupData = {
    ...backupData(),
    preferences: { backupReminders: true }
  }
  expect(summarizeBackup(withoutWakeTime, '2026-11-20').wakeTime).toBeNull()
})

test('the comparison counts diary nights that would actually be added', () => {
  const current = { ...backupData(), diary: [entry('2026-11-02'), entry('2026-11-05')] }
  const backup = { ...backupData(), diary: [entry('2026-11-02'), entry('2026-11-03')] }
  const comparison = compareBackup(current, backup, '2026-11-20')

  expect(comparison.addedNights).toBe(1)
  expect(comparison.duplicateNights).toBe(1)
  expect(comparison.current.diaryCount).toBe(2)
  expect(comparison.backup.diaryCount).toBe(2)
})

test('append merge deduplicates by date and keeps the current record on conflict', () => {
  const current = [entry('2026-11-02', { sleepQuality: 4 }), entry('2026-11-04')]
  const incoming = [entry('2026-11-02', { sleepQuality: 1 }), entry('2026-11-03')]

  const merged = mergeDiaryEntries(current, incoming)

  expect(merged.added).toBe(1)
  expect(merged.skipped).toBe(1)
  expect(merged.addedEntries.map((item) => item.date)).toEqual(['2026-11-03'])
  expect(merged.entries.map((item) => item.date)).toEqual(['2026-11-02', '2026-11-03', '2026-11-04'])
  expect(merged.entries.find((item) => item.date === '2026-11-02')?.sleepQuality).toBe(4)
})

test('a backup cannot smuggle a cleared screening past the safety rules', () => {
  const payload = createBackupPayload(
    {
      ...backupData(),
      screening: {
        ...screening,
        answers: { ...screening.answers, bipolarOrMania: true },
        result: { ...screening.result, status: 'cleared', sleepRestrictionPaused: false, rescreenRequired: false }
      }
    },
    { exportedAt: '2026-11-20T08:00:00.000Z' }
  )

  const parsed = parseBackupPayload(JSON.parse(JSON.stringify(payload)))
  expect(parsed.ok).toBe(true)
  if (!parsed.ok) return
  expect(parsed.payload.screening?.result.status).toBe('needs-review')
  expect(parsed.payload.screening?.result.sleepRestrictionPaused).toBe(true)
  expect(parsed.payload.screening?.result.rescreenRequired).toBe(true)
  expect(parsed.payload.screening?.result.availableActivities).not.toContain('sleep-restriction')
})

test('complete-night detection after import uses the existing domain rules', () => {
  const payload = createBackupPayload(backupData(), { exportedAt: '2026-11-20T08:00:00.000Z' })
  const parsed = parseBackupPayload(JSON.parse(JSON.stringify(payload)))
  expect(parsed.ok).toBe(true)
  if (!parsed.ok) return
  // 区间 WASO 的夜可以导入，但不构成完整夜；明确零 WASO 的夜仍是完整夜。
  expect(evaluateNight(parsed.payload.diary.find((item) => item.date === '2026-11-02')!).complete).toBe(false)
  expect(evaluateNight(parsed.payload.diary.find((item) => item.date === '2026-11-01')!).complete).toBe(true)
})

test('reminder bookkeeping survives a backup round trip', () => {
  const data: BackupData = {
    ...backupData(),
    preferences: {
      backupReminders: true,
      lastBackupReminderOn: '2026-11-10',
      lastBackupAt: '2026-11-12T09:30:00.000Z'
    }
  }
  const payload = createBackupPayload(data, { exportedAt: '2026-11-20T08:00:00.000Z' })
  const parsed = parseBackupPayload(JSON.parse(JSON.stringify(payload)))

  expect(parsed.ok).toBe(true)
  if (!parsed.ok) return
  expect(parsed.payload.preferences).toEqual(data.preferences)
})

test('a backup with malformed reminder bookkeeping is rejected', () => {
  const base = createBackupPayload(backupData(), { exportedAt: '2026-11-20T08:00:00.000Z' })

  for (const preferences of [
    { backupReminders: true, lastBackupReminderOn: '2026-02-31' },
    { backupReminders: true, lastBackupReminderOn: 20261110 },
    { backupReminders: true, lastBackupAt: 'not-a-time' }
  ]) {
    const result = parseBackupPayload({ ...base, preferences })
    expect(result.ok).toBe(false)
    if (result.ok) continue
    expect(result.error.kind).toBe('invalid-preferences')
  }
})
