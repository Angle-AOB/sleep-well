/**
 * 旧版本 IndexedDB 记录的字段迁移。
 *
 * 项目没有历史发布版，这里的"旧版本"形状是为升级安全而定义的：v2 用 bedTime /
 * wakeTime / sol / wasoMinutes / quality / nightWakesCount，v3 把时间字段改成
 * 灯光/起床命名但仍保留 wasoMinutes / nightWakesCount 的扁平结构。当前版本把 WASO
 * 和夜醒次数改成了带判别的联合类型。迁移把这些旧字段改名 / 重组为当前结构。
 *
 * 迁移在 IndexedDB 的 versionchange 事务里执行：任何一条记录转换失败都会抛出并
 * abort 整个事务，浏览器回滚到升级前的状态——绝不会留下半份迁移结果。
 */

import type { NightWakesCount, SleepDiaryEntry, SleepQuality, WasoEstimate } from '../domain/diary'
import type { Preferences } from './preferences'

type RawRecord = Record<string, unknown>

function requireOptionalString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') throw new Error(`invalid-${field}`)
  return value
}

function requireOptionalNumber(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`invalid-${field}`)
  return value
}

function convertWaso(raw: RawRecord): WasoEstimate {
  if (raw.waso !== undefined) return raw.waso as WasoEstimate
  const minutes = raw.wasoMinutes
  if (minutes === undefined || minutes === null) return { kind: 'unknown' }
  if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes < 0) {
    throw new Error('invalid-waso')
  }
  if (minutes === 0) return { kind: 'none-remembered' }
  return { kind: 'minutes', minutes }
}

function convertNightWakes(raw: RawRecord): NightWakesCount {
  if (raw.nightWakes !== undefined) return raw.nightWakes as NightWakesCount
  const count = raw.nightWakesCount
  if (count === undefined || count === null) return 'unknown'
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) {
    throw new Error('invalid-night-wakes')
  }
  if (count === 0) return 'none'
  if (count <= 2) return 'one-to-two'
  if (count <= 5) return 'three-to-five'
  return 'six-plus'
}

export function migrateDiaryEntry(raw: RawRecord): SleepDiaryEntry {
  const date = raw.date
  if (typeof date !== 'string' || date.length === 0) throw new Error('invalid-date')

  const lightsOffTime = requireOptionalString(raw.lightsOffTime ?? raw.bedTime, 'lights-off')
  const outOfBedTime = requireOptionalString(raw.outOfBedTime ?? raw.wakeTime, 'out-of-bed')
  const finalWakeTime = requireOptionalString(raw.finalWakeTime ?? raw.lastAwakeTime, 'final-wake')
  const sleepOnsetLatencyMinutes = requireOptionalNumber(
    raw.sleepOnsetLatencyMinutes ?? raw.sol, 'sleep-onset'
  )
  const quality = raw.sleepQuality ?? raw.quality
  if (quality !== undefined && quality !== null) {
    if (typeof quality !== 'number' || quality < 1 || quality > 5) throw new Error('invalid-quality')
  }

  const recordedAt = raw.recordedAt
  const updatedAt = raw.updatedAt
  if (typeof recordedAt !== 'string' || recordedAt.length === 0) throw new Error('invalid-recorded-at')
  if (typeof updatedAt !== 'string' || updatedAt.length === 0) throw new Error('invalid-updated-at')

  return {
    date,
    lightsOffTime,
    sleepOnsetLatencyMinutes,
    finalWakeTime,
    outOfBedTime,
    nightWakes: convertNightWakes(raw),
    waso: convertWaso(raw),
    sleepQuality: quality as SleepQuality | undefined,
    tags: Array.isArray(raw.tags) ? (raw.tags as SleepDiaryEntry['tags']) : [],
    recordedAt,
    updatedAt
  }
}

export function migratePreferences(raw: RawRecord): Preferences {
  const backupReminders = raw.backupReminders ?? raw.reminderEnabled
  if (typeof backupReminders !== 'boolean') throw new Error('invalid-preferences')

  const wakeTime = requireOptionalString(raw.wakeTime, 'wake-time')
  const lastBackupReminderOn = requireOptionalString(
    raw.lastBackupReminderOn ?? raw.lastReminderOn, 'last-reminder'
  )
  const lastBackupAt = requireOptionalString(raw.lastBackupAt, 'last-backup')

  return { backupReminders, wakeTime, lastBackupReminderOn, lastBackupAt }
}
