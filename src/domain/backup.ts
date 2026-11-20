/**
 * 迁移包的载荷结构与校验。
 *
 * 迁移包内的 JSON 同样不可信：导入前必须逐字段确认日期、枚举、可选时间与筛查
 * 结构，任何一条不合格都整包拒绝，绝不把半份数据写进本地库。schema 版本是向前
 * 兼容的唯一闸门：更高的未知版本直接拒绝并保留当前数据；已知版本按本文件解析。
 *
 * 摘要与对比只统计数量、日期范围、完整夜和疗程周次，便于用户判断影响；本模块
 * 不包含任何界面文案，错误只给出结构性的错误类型，不带日记内容或筛查答案。
 */

import { assessCourse, type CourseState, type CourseWeek } from './course'
import { evaluateNight, type LocalDate, type SleepDiaryEntry } from './diary'
import type { ScreeningRecord } from './screening'

export const BACKUP_SCHEMA_VERSION = 1
export const BACKUP_APP_VERSION = '0.1.0'
export const BACKUP_RULES_VERSION = '2026-11'
export const BACKUP_COURSE_VERSION = 'six-week-v1'

export type BackupPreferences = {
  backupReminders: boolean
  wakeTime?: string
}

export type BackupData = {
  diary: SleepDiaryEntry[]
  course: CourseState | null
  preferences: BackupPreferences
  screening: ScreeningRecord | null
}

export type BackupPayload = BackupData & {
  schemaVersion: number
  appVersion: string
  rulesVersion: string
  courseVersion: string
  exportedAt: string
}

export type BackupErrorKind =
  | 'not-an-object'
  | 'unsupported-schema'
  | 'invalid-metadata'
  | 'invalid-diary'
  | 'invalid-course'
  | 'invalid-preferences'
  | 'invalid-screening'

export type BackupError = { kind: BackupErrorKind }

export type ParseResult =
  | { ok: true; payload: BackupPayload }
  | { ok: false; error: BackupError }

const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/
const clockPattern = /^([01][0-9]|2[0-3]):([0-5][0-9])$/
const tagValues = new Set(['caffeine', 'alcohol', 'nap', 'exercise'])
const nightWakeValues = new Set(['unknown', 'none', 'one-to-two', 'three-to-five', 'six-plus'])
const wasoRangeValues = new Set(['under-15', '15-to-30', '30-to-60', 'over-60'])
const workPatternValues = new Set(['regular', 'shift-work'])
const screeningStatusValues = new Set(['cleared', 'needs-review'])
const activityValues = new Set(['education', 'diary', 'export', 'sleep-restriction'])
const distressValues = new Set(['none', 'some', 'a-lot'])
const concernDurationValues = new Set(['less-than-week', 'one-to-four-weeks', 'one-to-three-months', 'over-three-months'])
const affectedNightsValues = new Set(['none', 'one-to-two', 'three-to-four', 'five-to-seven'])
const daytimeImpactValues = new Set(['none', 'some', 'significant'])
const improvementGoalValues = new Set(['fall-asleep', 'stay-asleep', 'regularity', 'daytime'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isLocalDate(value: unknown): value is LocalDate {
  if (typeof value !== 'string') return false
  const match = datePattern.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const probe = new Date(Date.UTC(year, month - 1, day))
  return probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day
}

function isClock(value: unknown): value is string {
  return typeof value === 'string' && clockPattern.test(value)
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && !Number.isNaN(Date.parse(value))
}

function isWaso(value: unknown): boolean {
  if (!isRecord(value)) return false
  switch (value.kind) {
    case 'unknown':
    case 'none-remembered':
      return true
    case 'minutes':
      return isNonNegativeInteger(value.minutes)
    case 'range':
      return typeof value.range === 'string' && wasoRangeValues.has(value.range)
    default:
      return false
  }
}

function isValidDiaryEntry(value: unknown): value is SleepDiaryEntry {
  if (!isRecord(value)) return false
  if (!isLocalDate(value.date)) return false
  if (value.lightsOffTime !== undefined && !isClock(value.lightsOffTime)) return false
  if (value.finalWakeTime !== undefined && !isClock(value.finalWakeTime)) return false
  if (value.outOfBedTime !== undefined && !isClock(value.outOfBedTime)) return false
  if (value.sleepOnsetLatencyMinutes !== undefined && !isNonNegativeInteger(value.sleepOnsetLatencyMinutes)) return false
  if (typeof value.nightWakes !== 'string' || !nightWakeValues.has(value.nightWakes)) return false
  if (!isWaso(value.waso)) return false
  if (value.sleepQuality !== undefined) {
    const quality = value.sleepQuality
    if (!Number.isInteger(quality) || (quality as number) < 1 || (quality as number) > 5) return false
  }
  if (!Array.isArray(value.tags) || value.tags.some((tag) => typeof tag !== 'string' || !tagValues.has(tag))) return false
  return isIsoTimestamp(value.recordedAt) && isIsoTimestamp(value.updatedAt)
}

function isValidCourse(value: unknown): value is CourseState {
  if (!isRecord(value)) return false
  if (!isLocalDate(value.startedOn)) return false
  if (typeof value.workPattern !== 'string' || !workPatternValues.has(value.workPattern)) return false
  if (!Array.isArray(value.wakeTimes)) return false
  for (const decision of value.wakeTimes) {
    if (!isRecord(decision) || !isClock(decision.time) || !isLocalDate(decision.decidedOn)) return false
  }
  if (value.deferredTitrations !== undefined) {
    if (!Array.isArray(value.deferredTitrations)) return false
    for (const week of value.deferredTitrations) {
      if (!Number.isInteger(week) || (week as number) < 1 || (week as number) > 6) return false
    }
  }
  return true
}

function isValidPreferences(value: unknown): value is BackupPreferences {
  if (!isRecord(value)) return false
  if (typeof value.backupReminders !== 'boolean') return false
  return value.wakeTime === undefined || isClock(value.wakeTime)
}

function isOptionalEnum(value: unknown, allowed: Set<string>): boolean {
  return value === undefined || (typeof value === 'string' && allowed.has(value))
}

function isValidScreening(value: unknown): value is ScreeningRecord {
  if (!isRecord(value)) return false
  const answers = value.answers
  const result = value.result
  if (!isRecord(answers) || !isRecord(result)) return false

  if (!Number.isInteger(answers.age) || (answers.age as number) < 0 || (answers.age as number) > 150) return false
  for (const key of [
    'bipolarOrMania',
    'seizureHistory',
    'osaRedFlags',
    'dangerousParasomnia',
    'pregnant',
    'severeSleepinessOrSafetyRisk',
    'acuteInstability'
  ]) {
    if (typeof answers[key] !== 'boolean') return false
  }
  if (typeof answers.distress !== 'string' || !distressValues.has(answers.distress)) return false
  if (!isOptionalEnum(answers.concernDuration, concernDurationValues)) return false
  if (!isOptionalEnum(answers.affectedNights, affectedNightsValues)) return false
  if (!isOptionalEnum(answers.daytimeImpact, daytimeImpactValues)) return false
  if (!isOptionalEnum(answers.improvementGoal, improvementGoalValues)) return false

  if (typeof result.status !== 'string' || !screeningStatusValues.has(result.status)) return false
  if (typeof result.sleepRestrictionPaused !== 'boolean') return false
  if (typeof result.strongReferral !== 'boolean') return false
  if (typeof result.rescreenRequired !== 'boolean') return false
  if (!isIsoTimestamp(result.completedAt)) return false
  return Array.isArray(result.availableActivities)
    && result.availableActivities.every((activity) => typeof activity === 'string' && activityValues.has(activity))
}

function validatePayload(value: unknown): ParseResult {
  if (!isRecord(value)) return { ok: false, error: { kind: 'not-an-object' } }

  const schemaVersion = value.schemaVersion
  if (!Number.isInteger(schemaVersion) || (schemaVersion as number) < 1 || (schemaVersion as number) > BACKUP_SCHEMA_VERSION) {
    return { ok: false, error: { kind: 'unsupported-schema' } }
  }
  if (!isIsoTimestamp(value.exportedAt)
    || typeof value.appVersion !== 'string'
    || typeof value.rulesVersion !== 'string'
    || typeof value.courseVersion !== 'string') {
    return { ok: false, error: { kind: 'invalid-metadata' } }
  }

  if (!Array.isArray(value.diary)) return { ok: false, error: { kind: 'invalid-diary' } }
  const dates = new Set<string>()
  for (const item of value.diary) {
    if (!isValidDiaryEntry(item)) return { ok: false, error: { kind: 'invalid-diary' } }
    if (dates.has(item.date)) return { ok: false, error: { kind: 'invalid-diary' } }
    dates.add(item.date)
  }

  if (value.course !== null && !isValidCourse(value.course)) {
    return { ok: false, error: { kind: 'invalid-course' } }
  }
  if (!isValidPreferences(value.preferences)) return { ok: false, error: { kind: 'invalid-preferences' } }
  if (value.screening !== null && !isValidScreening(value.screening)) {
    return { ok: false, error: { kind: 'invalid-screening' } }
  }

  return {
    ok: true,
    payload: {
      schemaVersion: schemaVersion as number,
      appVersion: value.appVersion,
      rulesVersion: value.rulesVersion,
      courseVersion: value.courseVersion,
      exportedAt: value.exportedAt,
      diary: value.diary as SleepDiaryEntry[],
      course: (value.course as CourseState | null) ?? null,
      preferences: value.preferences,
      screening: (value.screening as ScreeningRecord | null) ?? null
    }
  }
}

export function parseBackupPayload(value: unknown): ParseResult {
  return validatePayload(value)
}

export function createBackupPayload(
  data: BackupData,
  options: { exportedAt: string; appVersion?: string }
): BackupPayload {
  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    appVersion: options.appVersion ?? BACKUP_APP_VERSION,
    rulesVersion: BACKUP_RULES_VERSION,
    courseVersion: BACKUP_COURSE_VERSION,
    exportedAt: options.exportedAt,
    diary: data.diary,
    course: data.course,
    preferences: data.preferences,
    screening: data.screening
  }
}

export type BackupSummary = {
  diaryCount: number
  firstDate: LocalDate | null
  lastDate: LocalDate | null
  completeNights: number
  courseStartedOn: LocalDate | null
  courseWeek: CourseWeek | null
  courseCompleted: boolean
  screeningStatus: ScreeningRecord['result']['status'] | null
  backupReminders: boolean
}

/** 摘要使用与疗程相同的一套推导，避免备份预览与主界面给出不同的周次。 */
export function summarizeBackup(data: BackupData, today: LocalDate): BackupSummary {
  const dates = data.diary.map((entry) => entry.date).sort((left, right) => left.localeCompare(right))
  const assessment = assessCourse({
    state: data.course,
    entries: data.diary,
    screening: data.screening ? data.screening.result : null,
    today
  })

  return {
    diaryCount: data.diary.length,
    firstDate: dates[0] ?? null,
    lastDate: dates[dates.length - 1] ?? null,
    completeNights: data.diary.filter((entry) => evaluateNight(entry).complete).length,
    courseStartedOn: data.course?.startedOn ?? null,
    courseWeek: assessment.progress?.week ?? null,
    courseCompleted: assessment.progress?.completed ?? false,
    screeningStatus: data.screening?.result.status ?? null,
    backupReminders: data.preferences.backupReminders
  }
}

export type BackupComparison = {
  current: BackupSummary
  backup: BackupSummary
  /** 新增策略下会真正追加的夜数（按日期去重，冲突以当前为准）。 */
  addedNights: number
  duplicateNights: number
}

export function compareBackup(current: BackupData, backup: BackupData, today: LocalDate): BackupComparison {
  const currentDates = new Set(current.diary.map((entry) => entry.date))
  const incomingDates = new Set(backup.diary.map((entry) => entry.date))
  let duplicateNights = 0
  for (const date of incomingDates) {
    if (currentDates.has(date)) duplicateNights += 1
  }

  return {
    current: summarizeBackup(current, today),
    backup: summarizeBackup(backup, today),
    addedNights: incomingDates.size - duplicateNights,
    duplicateNights
  }
}

export type MergeResult = {
  entries: SleepDiaryEntry[]
  added: number
  skipped: number
}

/** 新增策略只追加日记；日期即日记身份，冲突时保留当前记录。 */
export function mergeDiaryEntries(current: SleepDiaryEntry[], incoming: SleepDiaryEntry[]): MergeResult {
  const byDate = new Map(current.map((entry) => [entry.date, entry]))
  let added = 0
  let skipped = 0

  for (const entry of incoming) {
    if (byDate.has(entry.date)) {
      skipped += 1
      continue
    }
    byDate.set(entry.date, entry)
    added += 1
  }

  return {
    entries: [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date)),
    added,
    skipped
  }
}

