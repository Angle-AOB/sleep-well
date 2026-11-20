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

import { evaluateNight, type LocalDate, type NightAssessment, type SleepDiaryEntry } from './diary'
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
  /** 用户明确推迟过的滴定周；该周的 ±15 分钟调整不生效，其余规则照常。 */
  deferredTitrations?: CourseWeek[]
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
      reason: Exclude<WindowUnavailableReason, 'window-over-ten-hours'>
      completeNights: number
    }
  | {
      status: 'unavailable'
      reason: 'window-over-ten-hours'
      completeNights: number
      /** 规则计算出的原始候选时长；该窗口不会生成。 */
      proposedMinutes: number
    }
  | {
      status: 'available'
      startTime: string
      endTime: string
      durationMinutes: number
      mode: 'preview' | 'active'
      calibration: WindowCalibration
      /** 按周叠加在新窗口上的滴定调整，最早的在最前。 */
      adjustments: WindowAdjustment[]
      /** 本周完整夜不足，沿用上一次校准的窗口。 */
      heldover: boolean
      /** 本周本应用于校准的完整夜数量，便于说明数据不足。 */
      latestCompleteNights: number
    }

export type RestrictionStatus = 'not-started' | 'preview' | 'active' | 'paused' | 'awaiting-window'

/** 睡眠限制暂停的原因；与窗口不可用的原因一一对应，供界面直接选文案。 */
export type RestrictionPauseReason = 'screening' | 'shift-work' | 'window-limit'

/** 滴定的数据依据：先算每夜 SE，再取算术平均；不是总 TST ÷ 总 TIB。 */
export type TitrationBasis = {
  completeNights: number
  /** 展示用平均值，保留两位小数；阈值比较只用 unroundedSleepEfficiency。 */
  averageSleepEfficiency: number
  /** 未舍入的算术平均，只用于阈值比较；避免 84.96 被显示成 85 后误判为保持。 */
  unroundedSleepEfficiency: number
}

export type WindowAdjustment = {
  week: CourseWeek
  rule: 'increase' | 'decrease'
  /** 绝对值；方向由 rule 表示。durationMinutes = previousMinutes ± changeMinutes。 */
  changeMinutes: number
  previousMinutes: number
  durationMinutes: number
  basis: TitrationBasis
}

export type TitrationView =
  | { status: 'not-applicable' }
  | { status: 'scheduled'; nextWeek: CourseWeek }
  | { status: 'consolidation' }
  | { status: 'insufficient-data'; completeNights: number; required: number }
  | { status: 'deferred'; durationMinutes: number }
  | { status: 'adjusted'; change: WindowAdjustment }
  | { status: 'kept'; basis: TitrationBasis; reason: 'in-band' | 'floor'; durationMinutes: number }
  | { status: 'paused'; reason: 'screening' | 'shift-work' }
  /**
   * 规则算出的窗口超过 10 小时产品上限：不生成新窗口，建议专业评估。
   * 校准阶段没有逐夜 SE 依据，basis 为 null；周滴定阶段带上依据。
   */
  | { status: 'review'; proposedMinutes: number; basis: TitrationBasis | null }

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
  /** 仅当 restriction 为 paused 时给出原因；界面据此选择说明，不再自行推断。 */
  restrictionPausedBy: RestrictionPauseReason | null
  titration: TitrationView
  caffeine: CaffeineAdvice | null
  /** 近 7 夜的完整夜数量，用于显示基线进度。 */
  recentCompleteNights: number
  /**
   * 本周的滴定调整是否还能推迟。规则是“执行前才能决定”：本周一旦有日记，
   * 已按新窗口执行的天数不能被回溯成旧窗口。
   */
  canDeferTitration: boolean
}

export type CourseInput = {
  state: CourseState | null
  entries: SleepDiaryEntry[]
  screening: ScreeningResult | null
  today: LocalDate
}

export const MINIMUM_COMPLETE_NIGHTS = 4
/** 首次候选窗口在完整夜平均 TST 之上预留的余量。 */
export const WINDOW_TARGET_SURPLUS_MINUTES = 30
export const WINDOW_FLOOR_MINUTES = 5 * 60
/**
 * 自动化上限：候选/新窗口一旦超过 10 小时，就暂停自动窗口并建议专业评估。
 * 它触发的是“暂停 + 建议”，不是静默裁剪。
 */
export const WINDOW_AUTOMATION_LIMIT_MINUTES = 10 * 60
/**
 * 12 小时绝对上限：产品边界，任何规则计算出的窗口都不得超过它。
 * 这是硬不变量，正常流程不可达（超过 10 小时会先进入 review），只作最后一道钳制。
 */
export const WINDOW_CEILING_MINUTES = 12 * 60
export const TITRATION_STEP_MINUTES = 15
/** 每周滴定回看的完整夜数；首次校准也使用同一段 7 夜，避免出现第二个 7。 */
export const TITRATION_NIGHTS = 7
/** 一周的天数；固定起床时间要求每天一致。 */
export const DAYS_PER_WEEK = 7
/** 第 1 周基线的天数。 */
export const BASELINE_LENGTH_DAYS = 7
export const SE_INCREASE_THRESHOLD = 90
export const SE_DECREASE_THRESHOLD = 85
export const CAFFEINE_CUTOFF_HOURS = 8

const nightsPerCalibration = TITRATION_NIGHTS
const targetSurplusMinutes = WINDOW_TARGET_SURPLUS_MINUTES
/** 舍入网格与滴定步长是同一个 15 分钟的产品常量，不另写一份。 */
const roundingMinutes = TITRATION_STEP_MINUTES
const daysPerWeek = DAYS_PER_WEEK
const baselineLengthDays = BASELINE_LENGTH_DAYS
const maintenanceCheckDay = 35
const maxScanDays = 3650
const titrationWeeks: readonly CourseWeek[] = [4, 5]

const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/
const clockPattern = /^([01][0-9]|2[0-3]):([0-5][0-9])$/

/**
 * 所有对外提议的窗口时长都经过这里。产品流程会先在 10 小时处进入 review，
 * 12 小时只是硬不变量：极端 TIB 也不能让界面显示超过 12 小时的窗口。
 */
function proposeWindowMinutes(minutes: number): number {
  return Math.min(minutes, WINDOW_CEILING_MINUTES)
}

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

const workPatternValues: readonly WorkPattern[] = ['regular', 'shift-work']

export function isWorkPattern(value: unknown): value is WorkPattern {
  return typeof value === 'string' && (workPatternValues as readonly string[]).includes(value)
}

export function isCourseWeek(value: unknown): value is CourseWeek {
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 6
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
  return completeNightsInWindow(entries, startDay, endDay).length
}

/** 某个闭区间内的完整夜，按日期升序；校准与周滴定共用同一套取数与过滤规则。 */
function completeNightsInWindow(
  entries: SleepDiaryEntry[],
  startDay: number,
  endDay: number
): NightAssessment[] {
  return entries
    .filter((entry) => {
      const day = dayNumber(entry.date)
      return day !== null && day >= startDay && day <= endDay
    })
    .map((entry) => evaluateNight(entry))
    .filter((night) => night.complete)
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
  const assessments = completeNightsInWindow(entries, startDay, endDay)

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
  const durationMinutes = proposeWindowMinutes(Math.max(cappedMinutes, WINDOW_FLOOR_MINUTES))

  // 超过 10 小时即暂停自动窗口并建议专业评估；因为不生成该窗口，实际交付的窗口
  // 不可能超过 12 小时。12 小时钳制在 proposeWindowMinutes 里统一执行。
  if (durationMinutes > WINDOW_AUTOMATION_LIMIT_MINUTES) {
    return { status: 'needs-review', completeNights: assessments.length, proposedMinutes: durationMinutes }
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
 * 某一周回顾所用的滴定依据：该周开始前 7 夜的完整夜，先逐夜算 SE 再取算术平均。
 * 缺失或非完整夜不参与，也不会按 0 拉低平均值。
 */
function weeklyTitrationBasis(entries: SleepDiaryEntry[], weekStartDay: number): TitrationBasis {
  const endDay = weekStartDay - 1
  const startDay = endDay - nightsPerCalibration + 1
  const efficiencies = completeNightsInWindow(entries, startDay, endDay)
    .map((night) => night.sleepEfficiency)
    .filter((metric): metric is { status: 'available'; value: number } => metric.status === 'available')
    .map((metric) => metric.value)

  if (efficiencies.length === 0) {
    return { completeNights: 0, averageSleepEfficiency: 0, unroundedSleepEfficiency: 0 }
  }

  const total = efficiencies.reduce((sum, value) => sum + value, 0)
  const average = total / efficiencies.length
  return {
    completeNights: efficiencies.length,
    averageSleepEfficiency: Math.round(average * 100) / 100,
    unroundedSleepEfficiency: average
  }
}

export type TitrationDecision =
  | { kind: 'increase' | 'decrease'; durationMinutes: number }
  | { kind: 'keep'; reason: 'in-band' | 'floor' }
  | { kind: 'review'; proposedMinutes: number }

/**
 * 单周 +/-15 分钟决策。阈值是严格比较：正好 85% 或 90% 属于保持区间。
 * 调用方必须传入**未舍入**的平均 SE，否则 84.96 会被显示值 85 掩盖成保持。
 * 5 小时下限优先于缩短；12 小时是硬不变量——正常流程先在 10 小时处进入 review，
 * proposeWindowMinutes 只是最后一道钳制，任何返回的时长都不会超过 720 分钟。
 * 超过 10 小时时不生成新窗口（返回 review），由调用方暂停窗口并提示专业评估。
 */
export function decideTitration(previousMinutes: number, averageSleepEfficiency: number): TitrationDecision {
  if (averageSleepEfficiency > SE_INCREASE_THRESHOLD) {
    const proposed = proposeWindowMinutes(previousMinutes + TITRATION_STEP_MINUTES)
    return proposed > WINDOW_AUTOMATION_LIMIT_MINUTES
      ? { kind: 'review', proposedMinutes: proposed }
      : { kind: 'increase', durationMinutes: proposed }
  }

  if (averageSleepEfficiency < SE_DECREASE_THRESHOLD) {
    const proposed = proposeWindowMinutes(Math.max(previousMinutes - TITRATION_STEP_MINUTES, WINDOW_FLOOR_MINUTES))
    return proposed >= previousMinutes
      ? { kind: 'keep', reason: 'floor' }
      : { kind: 'decrease', durationMinutes: proposed }
  }

  return { kind: 'keep', reason: 'in-band' }
}

type TitrationResolution = {
  adjustments: WindowAdjustment[]
  durationMinutes: number
  view: TitrationView
}

/**
 * W3 只启动限制并预告 W4 的第一次回顾；W3 之前没有滴定。
 * 未生成窗口的分支也用它，避免“W3 → scheduled”在两处各写一遍。
 */
function firstTitrationView(week: CourseWeek): TitrationView {
  return week === 3 ? { status: 'scheduled', nextWeek: 4 } : { status: 'not-applicable' }
}

/**
 * 窗口时长从 W3 的校准值出发，按周链式叠加 W4、W5 的调整；每周只回顾一次，
 * 且只看该周开始前的 7 夜。推迟、数据不足、风险暂停都会跳过当周调整而不清空
 * 之前的调整，因此窗口始终等于“校准值 + 已生效的周调整”。
 */
function resolveTitration(options: {
  entries: SleepDiaryEntry[]
  week: CourseWeek
  baselineEnd: number
  baseMinutes: number
  deferred: CourseWeek[]
}): TitrationResolution {
  const { entries, week, baselineEnd, baseMinutes, deferred } = options

  if (week <= 3) {
    return { adjustments: [], durationMinutes: baseMinutes, view: firstTitrationView(week) }
  }

  const adjustments: WindowAdjustment[] = []
  let durationMinutes = baseMinutes
  let currentView: TitrationView = { status: 'consolidation' }

  for (const titrationWeek of titrationWeeks) {
    if (titrationWeek > week) break

    const weekStartDay = baselineEnd + (titrationWeek - 2) * daysPerWeek
    const basis = weeklyTitrationBasis(entries, weekStartDay)
    const isCurrentWeek = titrationWeek === week

    if (deferred.includes(titrationWeek)) {
      if (isCurrentWeek) currentView = { status: 'deferred', durationMinutes }
      continue
    }

    if (basis.completeNights < MINIMUM_COMPLETE_NIGHTS) {
      if (isCurrentWeek) {
        currentView = {
          status: 'insufficient-data',
          completeNights: basis.completeNights,
          required: MINIMUM_COMPLETE_NIGHTS
        }
      }
      continue
    }

    const decision = decideTitration(durationMinutes, basis.unroundedSleepEfficiency)

    if (decision.kind === 'review') {
      if (isCurrentWeek) {
        currentView = {
          status: 'review',
          proposedMinutes: decision.proposedMinutes,
          basis
        }
      }
      continue
    }

    if (decision.kind === 'keep') {
      if (isCurrentWeek) {
        currentView = { status: 'kept', basis, reason: decision.reason, durationMinutes }
      }
      continue
    }

    const adjustment: WindowAdjustment = {
      week: titrationWeek,
      rule: decision.kind,
      changeMinutes: Math.abs(decision.durationMinutes - durationMinutes),
      previousMinutes: durationMinutes,
      durationMinutes: decision.durationMinutes,
      basis
    }
    adjustments.push(adjustment)
    durationMinutes = decision.durationMinutes
    if (isCurrentWeek) currentView = { status: 'adjusted', change: adjustment }
  }

  // 第 6 周起不再产生新的周调整，但前两周的调整继续生效。
  return {
    adjustments,
    durationMinutes,
    view: week >= 6 ? { status: 'consolidation' } : currentView
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

/** 推迟记录可能来自旧状态而缺失；只在这一个地方兜底。 */
function deferredWeeks(state: CourseState): CourseWeek[] {
  return state.deferredTitrations ?? []
}

/** 该周是否已经留下日记；只有尚未开始执行的一周才允许推迟。 */
function weekHasStarted(entries: SleepDiaryEntry[], weekStartsOn: LocalDate): boolean {
  const startDay = dayNumber(weekStartsOn)
  if (startDay === null) return true
  return entries.some((entry) => {
    const day = dayNumber(entry.date)
    return day !== null && day >= startDay
  })
}

/**
 * 推迟某一周的窗口调整；同一周只记录一次，窗口保持上一周的长度。
 * 本周一旦已有日记（已开始执行），推迟会把已按新窗口执行的天数回溯成旧窗口，
 * 因此领域层直接返回原状态，界面层的 `canDeferTitration` 只是展示依据。
 */
export function withTitrationDeferral(
  state: CourseState,
  week: CourseWeek,
  entries: SleepDiaryEntry[],
  weekStartsOn: LocalDate
): CourseState {
  if (weekHasStarted(entries, weekStartsOn)) return state

  const deferred = deferredWeeks(state)
  return deferred.includes(week)
    ? state
    : { ...state, deferredTitrations: [...deferred, week].sort((left, right) => left - right) }
}

export function startCourse(startedOn: LocalDate, workPattern: WorkPattern = 'regular'): CourseState | null {
  return dayNumber(startedOn) === null
    ? null
    : { startedOn, workPattern, wakeTimes: [], deferredTitrations: [] }
}

function unavailable(
  reason: Exclude<WindowUnavailableReason, 'window-over-ten-hours'>,
  completeNights: number
): WindowView {
  return { status: 'unavailable', reason, completeNights }
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
    restrictionPausedBy: null,
    titration: { status: 'not-applicable' },
    caffeine: null,
    recentCompleteNights: 0,
    canDeferTitration: false
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
      restrictionPausedBy: null,
      titration: { status: 'not-applicable' },
      caffeine: null,
      recentCompleteNights,
      canDeferTitration: false
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
  const pauseReason: 'screening' | 'shift-work' | null = gated === 'screening-paused'
    ? 'screening'
    : gated === 'shift-work-paused'
      ? 'shift-work'
      : null
  let window: WindowView
  let restriction: RestrictionStatus
  let restrictionPausedBy: RestrictionPauseReason | null = null
  let titration: TitrationView
  const firstTitration = firstTitrationView(progress.week)

  if (gated) {
    window = unavailable(gated, calibrationNights)
    // W2 只有候选窗口，还没有可暂停的睡眠限制；W3 起才进入暂停语义。
    const candidate = progress.week === 2
    restriction = candidate ? 'preview' : 'paused'
    restrictionPausedBy = candidate ? null : pauseReason
    titration = progress.week >= 3 && pauseReason
      ? { status: 'paused', reason: pauseReason }
      : { status: 'not-applicable' }
  } else if (needsReview) {
    // W2 尚未开始限制与滴定：超上限只是“候选窗口不生成”，不能写成已暂停。
    const candidate = progress.week === 2
    window = {
      status: 'unavailable',
      reason: 'window-over-ten-hours',
      completeNights: needsReview.completeNights,
      proposedMinutes: needsReview.proposedMinutes
    }
    restriction = candidate ? 'preview' : 'paused'
    restrictionPausedBy = candidate ? null : 'window-limit'
    titration = candidate
      ? firstTitration
      : { status: 'review', proposedMinutes: needsReview.proposedMinutes, basis: null }
  } else if (!wakeTime.effective) {
    window = unavailable('wake-time-not-set', calibrationNights)
    restriction = progress.week === 2 ? 'preview' : 'awaiting-window'
    titration = firstTitration
  } else if (!chosen) {
    window = unavailable('insufficient-data', calibrationNights)
    restriction = progress.week === 2 ? 'preview' : 'awaiting-window'
    titration = firstTitration
  } else {
    // 窗口时长 = 第 3 周的校准值 + 已生效的周滴定；校准与调整分开保存，
    // 这样界面既能看到“窗口从哪来”，也能看到“这周为什么变了”。
    const resolution = resolveTitration({
      entries,
      week: progress.week,
      baselineEnd: baselineEnd!,
      baseMinutes: chosen.calibration.durationMinutes,
      deferred: deferredWeeks(state)
    })
    if (resolution.view.status === 'review') {
      // 规则提议的新窗口超过 10 小时：按 #5 的语义暂停窗口，而不是保留一个
      // 看似可执行、实际已触及产品上限的窗口。
      window = {
        status: 'unavailable',
        reason: 'window-over-ten-hours',
        completeNights: resolution.view.basis?.completeNights ?? chosen.latestCompleteNights,
        proposedMinutes: resolution.view.proposedMinutes
      }
      restriction = 'paused'
      restrictionPausedBy = 'window-limit'
      titration = resolution.view
    } else {
      window = {
        status: 'available',
        startTime: formatClock(clockMinutes(wakeTime.effective)! - resolution.durationMinutes),
        endTime: wakeTime.effective,
        durationMinutes: resolution.durationMinutes,
        mode,
        calibration: chosen.calibration,
        adjustments: resolution.adjustments,
        heldover: chosen.heldover,
        latestCompleteNights: chosen.latestCompleteNights
      }
      restriction = mode === 'preview' ? 'preview' : 'active'
      titration = resolution.view
    }
  }

  return {
    started: true,
    progress,
    wakeTime,
    window,
    restriction,
    restrictionPausedBy,
    titration,
    caffeine: caffeineAdvice(window, progress.week, entries, today),
    recentCompleteNights,
    canDeferTitration: titration.status === 'adjusted'
      && !progress.completed
      && !weekHasStarted(entries, progress.weekStartsOn)
  }
}
