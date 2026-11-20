/**
 * 六周疗程的纯领域引擎。
 *
 * 疗程状态只保存用户输入与决定：开始日期、作息类型、固定起床时间的确认历史。
 * 周次、基线是否延长、候选睡眠窗口都由日记与当前日期重新推导，因此规则升级后
 * 可以重建，不会被旧的派生值污染。
 *
 * 周次推进以基线结束为锚点：第 1 周至少持续 7 天，且只有近 7 夜出现 4 个完整夜
 * 才允许进入第 2 周；数据不足时停留在基线周，后续周次顺延。睡眠窗口只在第 2 周
 * 预览、第 3 周重新校准后启用，周内不重算——固定起床时间在周内修改也只从下一个
 * 窗口周期生效。每周滴定与刺激控制由后续规则补充，本模块只负责窗口的基线校准。
 */

import { evaluateNight, type LocalDate, type SleepDiaryEntry } from './diary'
import { canUseSleepRestriction, type ScreeningResult } from './screening'

export type CourseWeek = 1 | 2 | 3 | 4 | 5 | 6

export type WorkPattern = 'regular' | 'shift-work'

export type CourseStage =
  | 'baseline'
  | 'anchor'
  | 'restriction-start'
  | 'titration'
  | 'consolidation'
  | 'maintenance'

export type WakeTimeDecision = {
  time: string
  decidedOn: LocalDate
}

export type CourseState = {
  startedOn: LocalDate
  workPattern: WorkPattern
  /** 每次确认或修改固定起床时间都追加一条；只影响下一个窗口周期。 */
  wakeTimes: WakeTimeDecision[]
}

export type CourseProgress = {
  week: CourseWeek
  dayOfWeek: number
  stage: CourseStage
  weekStartsOn: LocalDate
  weekEndsOn: LocalDate
  /** 第 1 周已满 7 天但完整夜不足，疗程继续停留在基线周。 */
  baselineExtended: boolean
  completed: boolean
}

export type WindowLimitedBy = 'target' | 'average-tib' | 'floor'

export type WindowCalibration = {
  completeNights: number
  averageTotalSleepMinutes: number
  averageTimeInBedMinutes: number
  /** 完整夜平均 TST + 30 分钟，按 15 分钟舍入后的目标值。 */
  targetMinutes: number
  durationMinutes: number
  limitedBy: WindowLimitedBy
  /** 校准使用的完整夜来自第 1 周基线还是第 2 周锚定周。 */
  calibratedFromWeek: 1 | 2
}

export type WindowUnavailableReason =
  | 'course-not-started'
  | 'baseline-in-progress'
  | 'insufficient-data'
  | 'screening-paused'
  | 'shift-work-paused'
  | 'window-over-ten-hours'
  | 'wake-time-not-set'

export type WindowView =
  | {
      status: 'unavailable'
      reason: WindowUnavailableReason
      completeNights: number
      /** 超过 10 小时暂停时，给出规则计算出的候选时长供说明。 */
      proposedMinutes?: number
    }
  | {
      status: 'available'
      startTime: string
      endTime: string
      durationMinutes: number
      mode: 'preview' | 'active'
      calibration: WindowCalibration
      /** 本周完整夜不足，沿用上一次校准的窗口。 */
      heldover: boolean
      /** 本周本应用于校准的完整夜数量，便于说明数据不足。 */
      latestCompleteNights: number
    }

export type RestrictionStatus = 'not-started' | 'preview' | 'active' | 'paused' | 'awaiting-window'

export type WakeTimeView = {
  /** 本周实际执行的固定起床时间；尚未生效时为 null。 */
  effective: string | null
  /** 已确认但要到下一个窗口周期才生效的修改。 */
  pending: { time: string; effectiveWeek: number } | null
  /** 近 7 夜实际起床时间中位数，仅作预填建议。 */
  suggestion: string | null
}

export type CaffeineAdvice = {
  cutoff: string
  /** window: 按当前睡眠窗口的上床时间倒推；recent-bedtime: 窗口不可用时按最近入睡时间中位数倒推。 */
  basis: 'window' | 'recent-bedtime'
}

export type CourseAssessment = {
  started: boolean
  progress: CourseProgress | null
  wakeTime: WakeTimeView
  window: WindowView
  restriction: RestrictionStatus
  caffeine: CaffeineAdvice | null
  /** 近 7 夜的完整夜数量，用于显示基线进度。 */
  recentCompleteNights: number
}

export type CourseInput = {
  state: CourseState | null
  entries: SleepDiaryEntry[]
  screening: ScreeningResult | null
  today: LocalDate
}

export const MINIMUM_COMPLETE_NIGHTS = 4
export const WINDOW_FLOOR_MINUTES = 5 * 60
export const WINDOW_AUTOMATION_LIMIT_MINUTES = 10 * 60
export const WINDOW_ABSOLUTE_LIMIT_MINUTES = 12 * 60
export const CAFFEINE_CUTOFF_HOURS = 8

const nightsPerCalibration = 7
const targetSurplusMinutes = 30
const roundingMinutes = 15
const daysPerWeek = 7
const baselineLengthDays = 7
const maintenanceCheckDay = 35
const maxScanDays = 3650

const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/
const clockPattern = /^([01][0-9]|2[0-3]):([0-5][0-9])$/

type DateParts = { year: number; month: number; day: number }

function parseDate(value: LocalDate): DateParts | null {
  const match = datePattern.exec(value)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const probe = new Date(Date.UTC(year, month - 1, day))
  const valid = probe.getUTCFullYear() === year
    && probe.getUTCMonth() === month - 1
    && probe.getUTCDate() === day
  return valid ? { year, month, day } : null
}

/** 用 UTC 日序号表示本地日期，避免夏令时让日期差变成 23 或 25 小时。 */
function dayNumber(value: LocalDate): number | null {
  const parts = parseDate(value)
  return parts ? Date.UTC(parts.year, parts.month - 1, parts.day) / 86_400_000 : null
}

function fromDayNumber(value: number): LocalDate {
  const date = new Date(value * 86_400_000)
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${date.getUTCFullYear()}-${month}-${day}`
}

function clockMinutes(time: string): number | null {
  const match = clockPattern.exec(time)
  return match ? Number(match[1]) * 60 + Number(match[2]) : null
}

export function isClockTime(value: string): boolean {
  return clockPattern.test(value)
}

function formatClock(minutes: number): string {
  const normalized = ((minutes % 1440) + 1440) % 1440
  const hours = String(Math.floor(normalized / 60)).padStart(2, '0')
  const rest = String(normalized % 60).padStart(2, '0')
  return `${hours}:${rest}`
}

function stageForWeek(week: number): CourseStage {
  if (week <= 1) return 'baseline'
  if (week === 2) return 'anchor'
  if (week === 3) return 'restriction-start'
  if (week <= 5) return 'titration'
  return 'consolidation'
}

function completeNightsBetween(entries: SleepDiaryEntry[], startDay: number, endDay: number): number {
  return entries.filter((entry) => {
    const day = dayNumber(entry.date)
    return day !== null && day >= startDay && day <= endDay && evaluateNight(entry).complete
  }).length
}

/**
 * 基线在第 7 天首次接受检验；数据不足时逐日向后滑动，直到某一天的近 7 夜
 * 出现 4 个完整夜。这个日期就是第 2 周窗口周期的开始。
 */
function findBaselineEnd(startDay: number, todayDay: number, entries: SleepDiaryEntry[]): number | null {
  const lastCandidate = Math.min(todayDay, startDay + maxScanDays)
  for (let candidate = startDay + baselineLengthDays; candidate <= lastCandidate; candidate += 1) {
    if (completeNightsBetween(entries, candidate - nightsPerCalibration, candidate - 1) >= MINIMUM_COMPLETE_NIGHTS) {
      return candidate
    }
  }
  return null
}

function resolveProgress(
  startedOn: LocalDate,
  startDay: number,
  todayDay: number,
  baselineEnd: number | null
): CourseProgress {
  const daysSinceStart = todayDay - startDay

  if (baselineEnd === null) {
    return {
      week: 1,
      dayOfWeek: daysSinceStart + 1,
      stage: 'baseline',
      weekStartsOn: startedOn,
      weekEndsOn: fromDayNumber(startDay + baselineLengthDays - 1),
      baselineExtended: daysSinceStart >= baselineLengthDays,
      completed: false
    }
  }

  const daysIntoCourse = todayDay - baselineEnd

  if (daysIntoCourse >= maintenanceCheckDay) {
    const lastWeekStart = baselineEnd + (6 - 2) * daysPerWeek
    return {
      week: 6,
      dayOfWeek: daysPerWeek,
      stage: 'maintenance',
      weekStartsOn: fromDayNumber(lastWeekStart),
      weekEndsOn: fromDayNumber(lastWeekStart + daysPerWeek - 1),
      baselineExtended: false,
      completed: true
    }
  }

  const weekIndex = 2 + Math.floor(daysIntoCourse / daysPerWeek)
  const weekStartDay = baselineEnd + (weekIndex - 2) * daysPerWeek

  return {
    week: weekIndex as CourseWeek,
    dayOfWeek: (daysIntoCourse % daysPerWeek) + 1,
    stage: stageForWeek(weekIndex),
    weekStartsOn: fromDayNumber(weekStartDay),
    weekEndsOn: fromDayNumber(weekStartDay + daysPerWeek - 1),
    baselineExtended: false,
    completed: false
  }
}

type CalibrationOutcome =
  | { status: 'ready'; calibration: WindowCalibration }
  | { status: 'insufficient-data'; completeNights: number }
  | { status: 'needs-review'; completeNights: number; proposedMinutes: number }

/**
 * 候选窗口 = 完整夜平均 TST + 30 分钟，按 15 分钟舍入；不超过平均 TIB，
 * 也不低于 5 小时产品下限。只有完整夜参与校准，缺失数据不按 0 计算。
 * 下限优先于「不超过平均 TIB」，因为过短的卧床窗口比略长的窗口更危险。
 */
function calibrateWindow(entries: SleepDiaryEntry[], endDay: number, fromWeek: 1 | 2): CalibrationOutcome {
  const startDay = endDay - nightsPerCalibration + 1
  const assessments = entries
    .filter((entry) => {
      const day = dayNumber(entry.date)
      return day !== null && day >= startDay && day <= endDay
    })
    .map((entry) => evaluateNight(entry))
    .filter((night) => night.complete)

  if (assessments.length < MINIMUM_COMPLETE_NIGHTS) {
    return { status: 'insufficient-data', completeNights: assessments.length }
  }

  const totalSleepMinutes = assessments.reduce((sum, night) => {
    return night.totalSleep.status === 'available' ? sum + night.totalSleep.value : sum
  }, 0)
  const timeInBedMinutes = assessments.reduce((sum, night) => {
    return night.timeInBed.status === 'available' ? sum + night.timeInBed.value : sum
  }, 0)

  const averageTotalSleepMinutes = Math.round(totalSleepMinutes / assessments.length)
  const averageTimeInBedMinutes = Math.round(timeInBedMinutes / assessments.length)
  const targetMinutes = averageTotalSleepMinutes + targetSurplusMinutes
  const roundedMinutes = Math.round(targetMinutes / roundingMinutes) * roundingMinutes
  const cappedMinutes = Math.min(roundedMinutes, averageTimeInBedMinutes)
  const durationMinutes = Math.max(cappedMinutes, WINDOW_FLOOR_MINUTES)
  const proposedMinutes = Math.min(durationMinutes, WINDOW_ABSOLUTE_LIMIT_MINUTES)

  // 超过 10 小时暂停自动窗口并建议专业评估；任何计算窗口不超过 12 小时。
  if (proposedMinutes > WINDOW_AUTOMATION_LIMIT_MINUTES) {
    return { status: 'needs-review', completeNights: assessments.length, proposedMinutes }
  }

  return {
    status: 'ready',
    calibration: {
      completeNights: assessments.length,
      averageTotalSleepMinutes,
      averageTimeInBedMinutes,
      targetMinutes: roundedMinutes,
      durationMinutes,
      limitedBy: cappedMinutes < WINDOW_FLOOR_MINUTES
        ? 'floor'
        : cappedMinutes < roundedMinutes
          ? 'average-tib'
          : 'target',
      calibratedFromWeek: fromWeek
    }
  }
}

/**
 * 首次确认是对锚点的建立，落在哪一周就从那一周生效（W1 内确认则 W2 执行）；
 * 之后的修改才顺延到下一个窗口周期。这样在 W2 才确认的用户仍能在本周看到窗口，
 * 而已有窗口不会因周内修改而移动。
 */
function effectiveWeekOf(
  decision: WakeTimeDecision,
  startDay: number,
  baselineEnd: number | null,
  firstDecision: boolean
): number {
  const decisionDay = dayNumber(decision.decidedOn)
  if (decisionDay === null || decisionDay < startDay) return 1
  if (baselineEnd === null || decisionDay < baselineEnd) return 2
  const currentWeek = 2 + Math.floor((decisionDay - baselineEnd) / daysPerWeek)
  return firstDecision ? Math.min(currentWeek, 6) : currentWeek + 1
}

function resolveWakeTime(
  state: CourseState,
  progress: CourseProgress,
  startDay: number,
  baselineEnd: number | null,
  entries: SleepDiaryEntry[],
  today: LocalDate
): WakeTimeView {
  const decisions = [...state.wakeTimes].sort((left, right) => left.decidedOn.localeCompare(right.decidedOn))
  const week = progress.week
  const effectiveWeek = (decision: WakeTimeDecision) => effectiveWeekOf(
    decision,
    startDay,
    baselineEnd,
    decision === decisions[0]
  )
  const effective = decisions.filter((decision) => progress.completed || effectiveWeek(decision) <= week)
  // 同一周期内多次修改时，最后一条决定才是实际生效的那条。
  const pending = progress.completed
    ? undefined
    : [...decisions].reverse().find((decision) => effectiveWeek(decision) > week)

  return {
    effective: effective.length > 0 ? effective[effective.length - 1].time : null,
    pending: pending ? { time: pending.time, effectiveWeek: effectiveWeek(pending) } : null,
    suggestion: medianOutOfBedTime(entries, today)
  }
}

/** 近 7 夜某个时钟字段的中位数；只取日期落在最近 7 夜内的记录，避免旧数据冒充近期。 */
function medianRecentClock(
  entries: SleepDiaryEntry[],
  today: LocalDate,
  pick: (entry: SleepDiaryEntry) => string | undefined
): string | null {
  const todayDay = dayNumber(today)
  if (todayDay === null) return null

  const minutes = entries
    .filter((entry) => {
      const day = dayNumber(entry.date)
      return day !== null && day >= todayDay - nightsPerCalibration + 1 && day <= todayDay
    })
    .map(pick)
    .filter((value): value is string => value !== undefined)
    .map(clockMinutes)
    .filter((value): value is number => value !== null)
    .sort((left, right) => left - right)

  if (minutes.length === 0) return null

  const middle = Math.floor(minutes.length / 2)
  const median = minutes.length % 2 === 1
    ? minutes[middle]
    : Math.round((minutes[middle - 1] + minutes[middle]) / 2)
  return formatClock(median)
}

/** 近 7 夜实际起床时间的中位数，作为固定起床时间的预填建议，不替代用户确认。 */
export function medianOutOfBedTime(entries: SleepDiaryEntry[], today: LocalDate): string | null {
  return medianRecentClock(entries, today, (entry) => entry.outOfBedTime)
}

/** 确认或修改固定起床时间；同一天多次修改只保留最后一次。 */
export function withWakeTime(state: CourseState, time: string, decidedOn: LocalDate): CourseState {
  if (!isClockTime(time) || dayNumber(decidedOn) === null) return state

  const wakeTimes = state.wakeTimes
    .filter((decision) => decision.decidedOn !== decidedOn)
    .concat({ time, decidedOn })
    .sort((left, right) => left.decidedOn.localeCompare(right.decidedOn))

  return { ...state, wakeTimes }
}

export function withWorkPattern(state: CourseState, workPattern: WorkPattern): CourseState {
  return { ...state, workPattern }
}

export function startCourse(startedOn: LocalDate, workPattern: WorkPattern = 'regular'): CourseState | null {
  return dayNumber(startedOn) === null ? null : { startedOn, workPattern, wakeTimes: [] }
}

function unavailable(
  reason: WindowUnavailableReason,
  completeNights: number,
  proposedMinutes?: number
): WindowView {
  return proposedMinutes === undefined
    ? { status: 'unavailable', reason, completeNights }
    : { status: 'unavailable', reason, completeNights, proposedMinutes }
}

function caffeineAdvice(
  window: WindowView,
  week: number,
  entries: SleepDiaryEntry[],
  today: LocalDate
): CaffeineAdvice | null {
  if (week < 2) return null

  if (window.status === 'available') {
    return {
      cutoff: formatClock(clockMinutes(window.startTime)! - CAFFEINE_CUTOFF_HOURS * 60),
      basis: 'window'
    }
  }

  // 窗口被安全筛查或轮班暂停时，仍按最近入睡时间给出咖啡因锚定建议。
  const bedtime = medianRecentClock(entries, today, (entry) => entry.lightsOffTime)
  return bedtime
    ? { cutoff: formatClock(clockMinutes(bedtime)! - CAFFEINE_CUTOFF_HOURS * 60), basis: 'recent-bedtime' }
    : null
}

export function assessCourse({ state, entries, screening, today }: CourseInput): CourseAssessment {
  const notStarted: CourseAssessment = {
    started: false,
    progress: null,
    wakeTime: { effective: null, pending: null, suggestion: null },
    window: unavailable('course-not-started', 0),
    restriction: 'not-started',
    caffeine: null,
    recentCompleteNights: 0
  }

  if (!state) return notStarted

  const startDay = dayNumber(state.startedOn)
  const todayDay = dayNumber(today)
  if (startDay === null || todayDay === null || todayDay < startDay) return notStarted

  const baselineEnd = findBaselineEnd(startDay, todayDay, entries)
  const progress = resolveProgress(state.startedOn, startDay, todayDay, baselineEnd)
  const wakeTime = resolveWakeTime(state, progress, startDay, baselineEnd, entries, today)
  const recentCompleteNights = completeNightsBetween(entries, todayDay - nightsPerCalibration + 1, todayDay)

  if (progress.week === 1) {
    const insufficient = progress.baselineExtended && recentCompleteNights < MINIMUM_COMPLETE_NIGHTS
    return {
      started: true,
      progress,
      wakeTime,
      window: unavailable(insufficient ? 'insufficient-data' : 'baseline-in-progress', recentCompleteNights),
      restriction: 'not-started',
      caffeine: null,
      recentCompleteNights
    }
  }

  // 第 2 周用基线夜校准，第 3 周起用锚定周重新校准；每周只校准一次，周内不重算。
  const anchorWeekEndDay = baselineEnd! + daysPerWeek - 1
  const useAnchorWeek = progress.week >= 3
  const primary = useAnchorWeek
    ? calibrateWindow(entries, anchorWeekEndDay, 2)
    : calibrateWindow(entries, baselineEnd! - 1, 1)
  const baselineCalibration = useAnchorWeek
    ? calibrateWindow(entries, baselineEnd! - 1, 1)
    : primary

  const calibrationNights = primary.status === 'ready' ? primary.calibration.completeNights : primary.completeNights
  const needsReview = primary.status === 'needs-review' ? primary : null
  const chosen = primary.status === 'ready'
    ? { calibration: primary.calibration, heldover: false, latestCompleteNights: primary.calibration.completeNights }
    : baselineCalibration.status === 'ready'
      ? { calibration: baselineCalibration.calibration, heldover: true, latestCompleteNights: primary.completeNights }
      : null

  const gated: WindowUnavailableReason | null = !screening || !canUseSleepRestriction(screening)
    ? 'screening-paused'
    : state.workPattern === 'shift-work'
      ? 'shift-work-paused'
      : null

  const mode = progress.week === 2 ? 'preview' : 'active'
  let window: WindowView
  let restriction: RestrictionStatus

  if (gated) {
    window = unavailable(gated, calibrationNights)
    restriction = 'paused'
  } else if (needsReview) {
    window = unavailable('window-over-ten-hours', needsReview.completeNights, needsReview.proposedMinutes)
    restriction = 'paused'
  } else if (!wakeTime.effective) {
    window = unavailable('wake-time-not-set', calibrationNights)
    restriction = progress.week === 2 ? 'preview' : 'awaiting-window'
  } else if (!chosen) {
    window = unavailable('insufficient-data', calibrationNights)
    restriction = progress.week === 2 ? 'preview' : 'awaiting-window'
  } else {
    window = {
      status: 'available',
      startTime: formatClock(clockMinutes(wakeTime.effective)! - chosen.calibration.durationMinutes),
      endTime: wakeTime.effective,
      durationMinutes: chosen.calibration.durationMinutes,
      mode,
      calibration: chosen.calibration,
      heldover: chosen.heldover,
      latestCompleteNights: chosen.latestCompleteNights
    }
    restriction = mode === 'preview' ? 'preview' : 'active'
  }

  return {
    started: true,
    progress,
    wakeTime,
    window,
    restriction,
    caffeine: caffeineAdvice(window, progress.week, entries, today),
    recentCompleteNights
  }
}
