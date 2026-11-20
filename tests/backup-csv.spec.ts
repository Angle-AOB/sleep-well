import { test, expect } from '@playwright/test'
import { diaryCsv, escapeCsvCell } from '../src/domain/csv'
import type { SleepDiaryEntry } from '../src/domain/diary'

function entry(date: string, overrides: Partial<SleepDiaryEntry> = {}): SleepDiaryEntry {
  return {
    date,
    lightsOffTime: '23:00',
    sleepOnsetLatencyMinutes: 30,
    finalWakeTime: '06:30',
    outOfBedTime: '07:00',
    nightWakes: 'none',
    waso: { kind: 'none-remembered' },
    tags: [],
    recordedAt: `${date}T07:05:00.000Z`,
    updatedAt: `${date}T07:05:00.000Z`,
    ...overrides
  }
}

function rows(csv: string): string[][] {
  return csv
    .replace(/^\ufeff/, '')
    .split('\r\n')
    .filter((line) => line.length > 0)
    .map((line) => line.split(','))
}

test('CSV starts with a UTF-8 BOM and uses CRLF with a stable header', () => {
  const csv = diaryCsv([entry('2026-11-01')])
  expect(csv.startsWith('\ufeff')).toBe(true)
  expect(csv).toContain('\r\n')

  const header = rows(csv)[0]
  expect(header).toEqual([
    '日期',
    '关灯时间',
    '入睡潜伏期（分钟）',
    '最终醒来时间',
    '起床时间',
    '夜醒次数',
    '入睡后觉醒 WASO',
    '主观睡眠质量（1–5）',
    '咖啡因',
    '酒精',
    '午睡',
    '运动',
    '卧床时间（分钟）',
    '总睡眠时间（分钟）',
    '睡眠效率（%）'
  ])
})

test('CSV cells escape commas, quotes and new lines', () => {
  expect(escapeCsvCell('a,b')).toBe('"a,b"')
  expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""')
  expect(escapeCsvCell('第一行\n第二行')).toBe('"第一行\n第二行"')
  expect(escapeCsvCell('🌙')).toBe('🌙')
  expect(escapeCsvCell('')).toBe('')
})

test('unknown and range WASO never become fabricated exact minutes', () => {
  const unknown = rows(diaryCsv([entry('2026-11-01', { waso: { kind: 'unknown' } })]))[1]
  expect(unknown[6]).toBe('')
  // TIB 仍可计算，但 TST 与 SE 不可计算，因此留空而不是 0。
  expect(unknown[12]).toBe('480')
  expect(unknown[13]).toBe('')
  expect(unknown[14]).toBe('')

  const range = rows(diaryCsv([entry('2026-11-01', { waso: { kind: 'range', range: '15-to-30' } })]))[1]
  expect(range[6]).toBe('15-30')
  expect(range[13]).toBe('')
  expect(range[14]).toBe('')

  const none = rows(diaryCsv([entry('2026-11-01', { waso: { kind: 'none-remembered' } })]))[1]
  expect(none[6]).toBe('0')
  expect(none[13]).toBe('420')
  expect(none[14]).toBe('87.5')
})

test('exact WASO minutes and optional fields are exported as stable values', () => {
  const row = rows(diaryCsv([
    entry('2026-11-01', {
      waso: { kind: 'minutes', minutes: 25 },
      nightWakes: 'three-to-five',
      sleepQuality: 4,
      tags: ['caffeine', 'nap']
    })
  ]))[1]

  expect(row[0]).toBe('2026-11-01')
  expect(row[1]).toBe('23:00')
  expect(row[5]).toBe('3-5')
  expect(row[6]).toBe('25')
  expect(row[7]).toBe('4')
  expect(row[8]).toBe('是')
  expect(row[9]).toBe('')
  expect(row[10]).toBe('是')
  expect(row[11]).toBe('')
  expect(row[13]).toBe('395')
  expect(row[14]).toBe('82.3')
})

test('CSV exports diary nights in chronological order and leaves absent fields blank', () => {
  const csv = diaryCsv([
    entry('2026-11-03'),
    { ...entry('2026-11-01'), lightsOffTime: undefined, outOfBedTime: undefined, sleepOnsetLatencyMinutes: undefined, finalWakeTime: undefined, nightWakes: 'unknown', waso: { kind: 'unknown' }, tags: [] }
  ])
  const body = rows(csv).slice(1)
  expect(body.map((row) => row[0])).toEqual(['2026-11-01', '2026-11-03'])
  expect(body[0].slice(1, 6)).toEqual(['', '', '', '', ''])
})

test('an empty diary still produces a valid header-only CSV', () => {
  const csv = diaryCsv([])
  expect(rows(csv)).toHaveLength(1)
  expect(csv.endsWith('\r\n')).toBe(true)
})
