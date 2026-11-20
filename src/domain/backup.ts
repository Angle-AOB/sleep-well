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

import {
  isCourseWeek,
  isClockTime,
  isWorkPattern,
  assessCourse,
  type CourseState,
  type CourseWeek
} from './course'
import {
  isDiaryTag,
  isLocalDate,
  isNightWakesCount,
  isSleepQuality,
  isWasoEstimate,
  evaluateNight,
  type LocalDate,
  type SleepDiaryEntry
} from './diary'
import {
  createScreeningRecord,
  isAffectedNights,
  isConcernDuration,
  isDaytimeImpact,
  isDistressLevel,
  isImprovementGoal,
  isScreeningActivity,
  isScreeningStatus,
  type ScreeningRecord
} from './screening'

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && !Number.isNaN(Date.parse(value))
}

function isValidDiaryEntry(value: unknown): value is SleepDiaryEntry {
  if (!isRecord(value)) return false
  if (!isLocalDate(value.date)) return false
  if (value.lightsOffTime !== undefined && !(typeof value.lightsOffTime === 'string' && isClockTime(value.lightsOffTime))) return false
  if (value.finalWakeTime !== undefined && !(typeof value.finalWakeTime === 'string' && isClockTime(value.finalWakeTime))) return false
  if (value.outOfBedTime !== undefined && !(typeof value.outOfBedTime === 'string' && isClockTime(value.outOfBedTime))) return false
  if (value.sleepOnsetLatencyMinutes !== undefined && !isNonNegativeInteger(value.sleepOnsetLatencyMinutes)) return false
  if (!isNightWakesCount(value.nightWakes)) return false
  if (!isWasoEstimate(value.waso)) return false
  if (value.sleepQuality !== undefined && !isSleepQuality(value.sleepQuality)) return false
  if (!Array.isArray(value.tags) || !value.tags.every((tag) => isDiaryTag(tag))) return false
  return isIsoTimestamp(value.recordedAt) && isIsoTimestamp(value.updatedAt)
}

function isValidCourse(value: unknown): value is CourseState {
  if (!isRecord(value)) return false
  if (!isLocalDate(value.startedOn)) return false
  if (!isWorkPattern(value.workPattern)) return false
  if (!Array.isArray(value.wakeTimes)) return false
  for (const decision of value.wakeTimes) {
    if (!isRecord(decision)
      || typeof decision.time !== 'string'
      || !isClockTime(decision.time)
      || !isLocalDate(decision.decidedOn)) {
      return false
    }
  }
  if (value.deferredTitrations !== undefined) {
    if (!Array.isArray(value.deferredTitrations)) return false
    for (const week of value.deferredTitrations) {
      if (!isCourseWeek(week)) return false
    }
  }
  return true
}

function isValidPreferences(value: unknown): value is BackupPreferences {
  if (!isRecord(value)) return false
  if (typeof value.backupReminders !== 'boolean') return false
  return value.wakeTime === undefined
    || (typeof value.wakeTime === 'string' && isClockTime(value.wakeTime))
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
  if (typeof answers.distress !== 'string' || !isDistressLevel(answers.distress)) return false
  if (answers.concernDuration !== undefined && !isConcernDuration(answers.concernDuration)) return false
  if (answers.affectedNights !== undefined && !isAffectedNights(answers.affectedNights)) return false
  if (answers.daytimeImpact !== undefined && !isDaytimeImpact(answers.daytimeImpact)) return false
  if (answers.improvementGoal !== undefined && !isImprovementGoal(answers.improvementGoal)) return false

  if (typeof result.status !== 'string' || !isScreeningStatus(result.status)) return false
  if (typeof result.sleepRestrictionPaused !== 'boolean') return false
  if (typeof result.strongReferral !== 'boolean') return false
  if (typeof result.rescreenRequired !== 'boolean') return false
  if (!isIsoTimestamp(result.completedAt)) return false
  return Array.isArray(result.availableActivities)
    && result.availableActivities.every((activity) => isScreeningActivity(activity))
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

  // 筛查结果是答案的派生值：导入时按当前安全规则重算，避免旧包或篡改过的包
  // 用一份“已通过”的结果绕过暂停睡眠限制的产品边界。
  const screening = value.screening === null
    ? null
    : createScreeningRecord(
      (value.screening as ScreeningRecord).answers,
      (value.screening as ScreeningRecord).result.completedAt
    )

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
      screening
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
  /** 旧版遗留的预填起床时间；没有值时用 null 与合法的 "HH:mm" 区分。 */
  wakeTime: string | null
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
    backupReminders: data.preferences.backupReminders,
    wakeTime: data.preferences.wakeTime ?? null
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
  /** 只包含真正新增的记录；调用方直接写入这些记录，不必再自行去重。 */
  addedEntries: SleepDiaryEntry[]
  added: number
  skipped: number
}

/** 新增策略只追加日记；日期即日记身份，冲突时保留当前记录。 */
export function mergeDiaryEntries(current: SleepDiaryEntry[], incoming: SleepDiaryEntry[]): MergeResult {
  const byDate = new Map(current.map((entry) => [entry.date, entry]))
  const addedEntries: SleepDiaryEntry[] = []
  let skipped = 0

  for (const entry of incoming) {
    if (byDate.has(entry.date)) {
      skipped += 1
      continue
    }
    byDate.set(entry.date, entry)
    addedEntries.push(entry)
  }

  return {
    entries: [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date)),
    addedEntries,
    added: addedEntries.length,
    skipped
  }
}

