/**
 * 睡眠日记 CSV 导出。
 *
 * 只导出日记，不承担恢复；表头与「是」等面向用户的文字由调用方（i18n）提供，
 * 领域层只负责稳定的机器可读格式：日期为日记所属本地日期 `YYYY-MM-DD`，时间为
 * 24 小时制 `HH:mm`，区间与未知保留为文字或留空，不伪造成精确分钟。UTF-8 BOM 与
 * CRLF 让 Excel/WPS 直接打开中文不出乱码，逗号、引号和换行按 RFC 4180 转义。
 */

import { evaluateNight, type SleepDiaryEntry } from './diary'

const CRLF = '\r\n'
const BOM = '\ufeff'

export type DiaryCsvLabels = {
  /** 与列顺序一致的 15 个表头标签。 */
  header: readonly string[]
  /** 标签命中时的肯定词，例如「是」。 */
  yes: string
}

const nightWakeLabels: Record<SleepDiaryEntry['nightWakes'], string> = {
  unknown: '',
  none: '0',
  'one-to-two': '1-2',
  'three-to-five': '3-5',
  'six-plus': '6+'
}

const wasoRangeLabels = {
  'under-15': '<15',
  '15-to-30': '15-30',
  '30-to-60': '30-60',
  'over-60': '>60'
} as const

export function escapeCsvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

function wasoText(entry: SleepDiaryEntry): string {
  switch (entry.waso.kind) {
    case 'unknown':
      return ''
    case 'none-remembered':
      return '0'
    case 'minutes':
      return String(entry.waso.minutes)
    case 'range':
      return wasoRangeLabels[entry.waso.range]
  }
}

function metric(value: number | undefined): string {
  return value === undefined ? '' : String(value)
}

function row(entry: SleepDiaryEntry, labels: DiaryCsvLabels): string[] {
  const assessment = evaluateNight(entry)
  return [
    entry.date,
    entry.lightsOffTime ?? '',
    entry.sleepOnsetLatencyMinutes === undefined ? '' : String(entry.sleepOnsetLatencyMinutes),
    entry.finalWakeTime ?? '',
    entry.outOfBedTime ?? '',
    nightWakeLabels[entry.nightWakes],
    wasoText(entry),
    entry.sleepQuality === undefined ? '' : String(entry.sleepQuality),
    entry.tags.includes('caffeine') ? labels.yes : '',
    entry.tags.includes('alcohol') ? labels.yes : '',
    entry.tags.includes('nap') ? labels.yes : '',
    entry.tags.includes('exercise') ? labels.yes : '',
    metric(assessment.timeInBed.status === 'available' ? assessment.timeInBed.value : undefined),
    metric(assessment.totalSleep.status === 'available' ? assessment.totalSleep.value : undefined),
    metric(assessment.sleepEfficiency.status === 'available' ? assessment.sleepEfficiency.value : undefined)
  ]
}

export function diaryCsv(entries: SleepDiaryEntry[], labels: DiaryCsvLabels): string {
  const sorted = [...entries].sort((left, right) => left.date.localeCompare(right.date))
  const lines = [
    [...labels.header],
    ...sorted.map((entry) => row(entry, labels))
  ]
  return BOM + lines.map((cells) => cells.map(escapeCsvCell).join(',')).join(CRLF) + CRLF
}
