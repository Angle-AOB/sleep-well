/**
 * 睡眠日记 CSV 导出。
 *
 * 只导出日记，不承担恢复；表头是中文，字段值使用稳定的机器可读格式：
 * 日期为日记所属本地日期 `YYYY-MM-DD`，时间为 24 小时制 `HH:mm`，区间与未知
 * 保留为文字或留空，不伪造成精确分钟。UTF-8 BOM 与 CRLF 让 Excel/WPS 直接打开
 * 中文不出乱码，逗号、引号和换行按 RFC 4180 转义。
 */

import { evaluateNight, type SleepDiaryEntry } from './diary'

const CRLF = '\r\n'
const BOM = '\ufeff'

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

export const DIARY_CSV_HEADER = [
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
] as const

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

function row(entry: SleepDiaryEntry): string[] {
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
    entry.tags.includes('caffeine') ? '是' : '',
    entry.tags.includes('alcohol') ? '是' : '',
    entry.tags.includes('nap') ? '是' : '',
    entry.tags.includes('exercise') ? '是' : '',
    metric(assessment.timeInBed.status === 'available' ? assessment.timeInBed.value : undefined),
    metric(assessment.totalSleep.status === 'available' ? assessment.totalSleep.value : undefined),
    metric(assessment.sleepEfficiency.status === 'available' ? assessment.sleepEfficiency.value : undefined)
  ]
}

export function diaryCsv(entries: SleepDiaryEntry[]): string {
  const sorted = [...entries].sort((left, right) => left.date.localeCompare(right.date))
  const lines = [
    [...DIARY_CSV_HEADER],
    ...sorted.map(row)
  ]
  return BOM + lines.map((cells) => cells.map(escapeCsvCell).join(',')).join(CRLF) + CRLF
}
