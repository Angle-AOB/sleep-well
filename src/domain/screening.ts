export type DistressLevel = 'none' | 'some' | 'a-lot'

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
  concernDuration?: 'less-than-week' | 'one-to-four-weeks' | 'one-to-three-months' | 'over-three-months'
  affectedNights?: 'none' | 'one-to-two' | 'three-to-four' | 'five-to-seven'
  daytimeImpact?: 'none' | 'some' | 'significant'
  improvementGoal?: 'fall-asleep' | 'stay-asleep' | 'regularity' | 'daytime'
}

export type ScreeningStatus = 'cleared' | 'needs-review'
export type ScreeningActivity = 'education' | 'diary' | 'export' | 'sleep-restriction'

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
  return answers.age < 18
    || answers.bipolarOrMania
    || answers.seizureHistory
    || answers.osaRedFlags
    || answers.dangerousParasomnia
    || answers.pregnant
    || answers.severeSleepinessOrSafetyRisk
    || answers.acuteInstability
    || answers.distress === 'a-lot'
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
