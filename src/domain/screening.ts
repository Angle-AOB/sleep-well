export type DistressLevel = 'none' | 'some' | 'a-lot'
export type ConcernDuration = 'less-than-week' | 'one-to-four-weeks' | 'one-to-three-months' | 'over-three-months'
export type AffectedNights = 'none' | 'one-to-two' | 'three-to-four' | 'five-to-seven'
export type DaytimeImpact = 'none' | 'some' | 'significant'
export type ImprovementGoal = 'fall-asleep' | 'stay-asleep' | 'regularity' | 'daytime'

export type ScreeningAnswers = {
  age: number
  bipolarOrMania: boolean
  seizureHistory: boolean
  osaRedFlags: boolean
  dangerousParasomnia: boolean
  pregnant: boolean
  severeSleepinessOrSafetyRisk: boolean
  acuteInstability: boolean
  distress: DistressLevel
  concernDuration?: ConcernDuration
  affectedNights?: AffectedNights
  daytimeImpact?: DaytimeImpact
  improvementGoal?: ImprovementGoal
}

export type ScreeningStatus = 'cleared' | 'needs-review'
export type ScreeningActivity = 'education' | 'diary' | 'export' | 'sleep-restriction'

/** 领域枚举的唯一来源；备份校验从这里导入，新增取值只改一处。 */
const distressValues: readonly DistressLevel[] = ['none', 'some', 'a-lot']
const concernDurationValues: readonly ConcernDuration[] = [
  'less-than-week',
  'one-to-four-weeks',
  'one-to-three-months',
  'over-three-months'
]
const affectedNightsValues: readonly AffectedNights[] = ['none', 'one-to-two', 'three-to-four', 'five-to-seven']
const daytimeImpactValues: readonly DaytimeImpact[] = ['none', 'some', 'significant']
const improvementGoalValues: readonly ImprovementGoal[] = ['fall-asleep', 'stay-asleep', 'regularity', 'daytime']
const screeningStatusValues: readonly ScreeningStatus[] = ['cleared', 'needs-review']
const screeningActivityValues: readonly ScreeningActivity[] = ['education', 'diary', 'export', 'sleep-restriction']

/**
 * 命中任一项即暂停睡眠限制的布尔字段。备份校验遍历同一份清单，
 * 新增筛查题时只需在这里加一个字段。
 */
export const SCREENING_BOOLEAN_KEYS = [
  'bipolarOrMania',
  'seizureHistory',
  'osaRedFlags',
  'dangerousParasomnia',
  'pregnant',
  'severeSleepinessOrSafetyRisk',
  'acuteInstability'
] as const

/** 未满该年龄属于安全关注项，需要监护人和专业人士参与。 */
export const MINIMUM_ADULT_AGE = 18
/** 年龄的结构合理性范围；超出说明备份内容不是有效答案。 */
export const MINIMUM_PLAUSIBLE_AGE = 0
export const MAXIMUM_PLAUSIBLE_AGE = 150

function isEnumValue<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (values as readonly string[]).includes(value)
}

export const isDistressLevel = (value: unknown): value is DistressLevel => isEnumValue(distressValues, value)
export const isConcernDuration = (value: unknown): value is ConcernDuration => isEnumValue(concernDurationValues, value)
export const isAffectedNights = (value: unknown): value is AffectedNights => isEnumValue(affectedNightsValues, value)
export const isDaytimeImpact = (value: unknown): value is DaytimeImpact => isEnumValue(daytimeImpactValues, value)
export const isImprovementGoal = (value: unknown): value is ImprovementGoal => isEnumValue(improvementGoalValues, value)
export const isScreeningStatus = (value: unknown): value is ScreeningStatus => isEnumValue(screeningStatusValues, value)
export const isScreeningActivity = (value: unknown): value is ScreeningActivity => isEnumValue(screeningActivityValues, value)

export type ScreeningResult = {
  status: ScreeningStatus
  sleepRestrictionPaused: boolean
  strongReferral: boolean
  rescreenRequired: boolean
  availableActivities: ScreeningActivity[]
  completedAt: string
}

export type ScreeningRecord = {
  answers: ScreeningAnswers
  result: ScreeningResult
}

const nonRestrictionActivities: ScreeningActivity[] = ['education', 'diary', 'export']

function availableActivitiesFor(safetyConcern: boolean): ScreeningActivity[] {
  return safetyConcern
    ? nonRestrictionActivities
    : [...nonRestrictionActivities, 'sleep-restriction']
}

function hasSafetyConcern(answers: ScreeningAnswers): boolean {
  return answers.age < MINIMUM_ADULT_AGE
    || answers.distress === 'a-lot'
    || SCREENING_BOOLEAN_KEYS.some((key) => answers[key])
}

function needsStrongReferral(answers: ScreeningAnswers): boolean {
  return answers.osaRedFlags
    || answers.severeSleepinessOrSafetyRisk
    || answers.acuteInstability
    || answers.distress === 'a-lot'
}

export function assessScreening(answers: ScreeningAnswers, completedAt: string): ScreeningResult {
  const safetyConcern = hasSafetyConcern(answers)

  return {
    status: safetyConcern ? 'needs-review' : 'cleared',
    sleepRestrictionPaused: safetyConcern,
    strongReferral: needsStrongReferral(answers),
    rescreenRequired: safetyConcern,
    availableActivities: availableActivitiesFor(safetyConcern),
    completedAt
  }
}

export function canUseSleepRestriction(result: ScreeningResult): boolean {
  return result.availableActivities.includes('sleep-restriction')
    && result.status === 'cleared'
    && !result.sleepRestrictionPaused
    && !result.rescreenRequired
}

export function createScreeningRecord(answers: ScreeningAnswers, completedAt: string): ScreeningRecord {
  return { answers, result: assessScreening(answers, completedAt) }
}
