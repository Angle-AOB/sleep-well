import { test, expect } from '@playwright/test'
import i18n from '../src/i18n'
import { titrationBody } from '../src/titrationText'
import type { SleepDiaryEntry } from '../src/domain/diary'
import { assessScreening, type ScreeningResult } from '../src/domain/screening'
import {
  assessCourse,
  decideTitration,
  medianOutOfBedTime,
  WINDOW_CEILING_MINUTES,
  WINDOW_FLOOR_MINUTES,
  withTitrationDeferral,
  withWakeTime,
  withWorkPattern,
  type CourseState
} from '../src/domain/course'

function clock(minutes: number): string {
  const normalized = ((minutes % 1440) + 1440) % 1440
  const hours = String(Math.floor(normalized / 60)).padStart(2, '0')
  const rest = String(normalized % 60).padStart(2, '0')
  return `${hours}:${rest}`
}

function night(
  date: string,
  { timeInBed = 480, totalSleep = 390, latency = 30 }: { timeInBed?: number; totalSleep?: number; latency?: number } = {}
): SleepDiaryEntry {
  const lightsOff = 23 * 60
  const outOfBed = lightsOff + timeInBed
  const terminalAwake = timeInBed - totalSleep - latency
  return {
    date,
    lightsOffTime: clock(lightsOff),
    sleepOnsetLatencyMinutes: latency,
    finalWakeTime: clock(outOfBed - terminalAwake),
    outOfBedTime: clock(outOfBed),
    nightWakes: 'unknown',
    waso: { kind: 'none-remembered' },
    tags: [],
    recordedAt: `${date}T07:30:00.000Z`,
    updatedAt: `${date}T07:30:00.000Z`
  }
}

function nights(dates: string[], options?: { timeInBed?: number; totalSleep?: number; latency?: number }) {
  return dates.map((date) => night(date, options))
}

const baselineNights = nights(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04'])

const ordinaryAnswers = {
  age: 30,
  bipolarOrMania: false,
  seizureHistory: false,
  osaRedFlags: false,
  dangerousParasomnia: false,
  pregnant: false,
  severeSleepinessOrSafetyRisk: false,
  acuteInstability: false,
  distress: 'some' as const
}

const cleared: ScreeningResult = assessScreening(ordinaryAnswers, '2026-11-01T00:00:00.000Z')
const needsReview: ScreeningResult = assessScreening(
  { ...ordinaryAnswers, osaRedFlags: true },
  '2026-11-01T00:00:00.000Z'
)

function state(overrides: Partial<CourseState> = {}): CourseState {
  return { startedOn: '2026-11-01', workPattern: 'regular', wakeTimes: [], ...overrides }
}

function assess(options: {
  entries?: SleepDiaryEntry[]
  screening?: ScreeningResult | null
  today: string
  state?: CourseState
}) {
  return assessCourse({
    state: options.state ?? state(),
    entries: options.entries ?? [],
    screening: options.screening === undefined ? cleared : options.screening,
    today: options.today
  })
}

test('W1 is a baseline week that asks for no behavior change and shows no window', () => {
  const result = assess({ today: '2026-11-01' })

  expect(result.started).toBe(true)
  expect(result.progress.week).toBe(1)
  expect(result.progress.dayOfWeek).toBe(1)
  expect(result.progress.stage).toBe('baseline')
  expect(result.progress.baselineExtended).toBe(false)
  expect(result.restriction).toBe('not-started')
  expect(result.window).toEqual({ status: 'unavailable', reason: 'baseline-in-progress', completeNights: 0 })
  expect(result.caffeine).toBeNull()
})

test('day seven still belongs to W1 even when the baseline already has enough complete nights', () => {
  const result = assess({ entries: baselineNights, today: '2026-11-07' })

  expect(result.progress.week).toBe(1)
  expect(result.progress.dayOfWeek).toBe(7)
  expect(result.progress.baselineExtended).toBe(false)
  expect(result.window.status).toBe('unavailable')
})

test('four complete nights advance the course to W2 on day eight', () => {
  const result = assess({ entries: baselineNights, today: '2026-11-08' })

  expect(result.progress.week).toBe(2)
  expect(result.progress.dayOfWeek).toBe(1)
  expect(result.progress.weekStartsOn).toBe('2026-11-08')
  expect(result.progress.stage).toBe('anchor')
  expect(result.restriction).toBe('preview')
})

test('a baseline with only three complete nights stays in W1 and names the data gap', () => {
  const result = assess({ entries: nights(['2026-11-03', '2026-11-04', '2026-11-05']), today: '2026-11-08' })

  expect(result.progress.week).toBe(1)
  expect(result.progress.baselineExtended).toBe(true)
  expect(result.progress.dayOfWeek).toBe(8)
  expect(result.window).toEqual({ status: 'unavailable', reason: 'insufficient-data', completeNights: 3 })
})

test('an extended baseline ends on the first day whose trailing seven nights hold four complete nights', () => {
  const entries = [
    ...nights(['2026-11-01', '2026-11-02', '2026-11-03']),
    ...nights(['2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11'])
  ]

  const stillExtended = assess({ entries, today: '2026-11-10' })
  const completed = assess({ entries, today: '2026-11-12' })

  expect(stillExtended.progress.week).toBe(1)
  expect(stillExtended.progress.baselineExtended).toBe(true)
  expect(completed.progress.week).toBe(2)
  expect(completed.progress.dayOfWeek).toBe(1)
  expect(completed.progress.weekStartsOn).toBe('2026-11-12')
  expect(completed.progress.baselineExtended).toBe(false)
})

test('weeks advance every seven days after the baseline and end in maintenance', () => {
  const w3 = assess({ entries: baselineNights, today: '2026-11-15' })
  const w5 = assess({ entries: baselineNights, today: '2026-11-29' })
  const w6 = assess({ entries: baselineNights, today: '2026-12-06' })
  const done = assess({ entries: baselineNights, today: '2026-12-13' })

  expect(w3.progress.week).toBe(3)
  expect(w3.progress.stage).toBe('restriction-start')
  expect(w5.progress.week).toBe(5)
  expect(w5.progress.stage).toBe('titration')
  expect(w6.progress.week).toBe(6)
  expect(w6.progress.stage).toBe('consolidation')
  expect(done.progress.completed).toBe(true)
  expect(done.progress.stage).toBe('maintenance')
})

test('the median of recent actual wake times prefills the fixed wake time', () => {
  const entries = [
    night('2026-11-01'),
    night('2026-11-02'),
    night('2026-11-03'),
    night('2026-11-04'),
    night('2026-11-05'),
    night('2026-11-06'),
    night('2026-11-07')
  ].map((entry, index) => ({ ...entry, outOfBedTime: ['06:40', '06:45', '06:50', '07:00', '07:05', '07:10', '07:20'][index] }))

  expect(medianOutOfBedTime(entries, '2026-11-07')).toBe('07:00')
  expect(medianOutOfBedTime([entries[0], entries[3]], '2026-11-07')).toBe('06:50')
  expect(medianOutOfBedTime([], '2026-11-07')).toBeNull()
})

test('the wake time prefill ignores nights without an actual wake time and future dates', () => {
  const partial = { ...night('2026-11-02'), outOfBedTime: undefined }
  const entries = [night('2026-11-01'), partial]

  expect(medianOutOfBedTime(entries, '2026-11-03')).toBe('07:00')
  expect(medianOutOfBedTime([night('2026-11-20')], '2026-11-03')).toBeNull()
  expect(medianOutOfBedTime([night('2026-10-20')], '2026-11-03')).toBeNull()
})

test('a wake time confirmed during baseline is announced as effective from W2', () => {
  const confirmed = withWakeTime(state(), '06:30', '2026-11-03')
  const duringBaseline = assess({ state: confirmed, entries: baselineNights, today: '2026-11-05' })
  const startOfW2 = assess({ state: confirmed, entries: baselineNights, today: '2026-11-08' })

  expect(duringBaseline.wakeTime.effective).toBeNull()
  expect(duringBaseline.wakeTime.pending).toEqual({ time: '06:30', effectiveWeek: 2 })
  expect(startOfW2.wakeTime.effective).toBe('06:30')
  expect(startOfW2.wakeTime.pending).toBeNull()
})

test('a wake time change inside a week waits for the next window cycle', () => {
  const confirmed = withWakeTime(state(), '07:00', '2026-11-02')
  const entries = [
    ...baselineNights,
    ...nights(['2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11'], { totalSleep: 450 })
  ]

  const w3 = assess({ state: confirmed, entries, today: '2026-11-15' })
  expect(w3.window).toMatchObject({ status: 'available', startTime: '23:00', endTime: '07:00', durationMinutes: 480 })

  const changed = withWakeTime(confirmed, '08:00', '2026-11-17')
  const laterThatWeek = assess({ state: changed, entries, today: '2026-11-17' })
  const nextCycle = assess({ state: changed, entries, today: '2026-11-22' })

  expect(laterThatWeek.wakeTime.effective).toBe('07:00')
  expect(laterThatWeek.wakeTime.pending).toEqual({ time: '08:00', effectiveWeek: 4 })
  expect(laterThatWeek.window).toMatchObject({ startTime: '23:00', endTime: '07:00', durationMinutes: 480 })
  expect(nextCycle.wakeTime.effective).toBe('08:00')
  expect(nextCycle.window).toMatchObject({ startTime: '00:00', endTime: '08:00', durationMinutes: 480 })
})

test('switching to shift work pauses automatic windows while keeping the course available', () => {
  const shift = withWorkPattern(state({ wakeTimes: [{ time: '07:00', decidedOn: '2026-11-02' }] }), 'shift-work')
  const result = assess({ state: shift, entries: baselineNights, today: '2026-11-10' })

  expect(result.progress.week).toBe(2)
  expect(result.window).toEqual({ status: 'unavailable', reason: 'shift-work-paused', completeNights: 4 })
  expect(result.restriction).toBe('paused')
  expect(result.caffeine).toEqual({ cutoff: '15:00', basis: 'recent-bedtime' })
})

test('a screening that needs review blocks every automatic window', () => {
  const confirmed = state({ wakeTimes: [{ time: '07:00', decidedOn: '2026-11-02' }] })
  const result = assess({ state: confirmed, entries: baselineNights, today: '2026-11-10', screening: needsReview })

  expect(result.window).toEqual({ status: 'unavailable', reason: 'screening-paused', completeNights: 4 })
  expect(result.restriction).toBe('paused')
  expect(result.caffeine).toEqual({ cutoff: '15:00', basis: 'recent-bedtime' })
})

test('an unconfirmed wake time leaves W3 without a window until the anchor is set', () => {
  const result = assess({ entries: [...baselineNights, ...nights(['2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11'])], today: '2026-11-15' })

  expect(result.progress.week).toBe(3)
  expect(result.window).toEqual({ status: 'unavailable', reason: 'wake-time-not-set', completeNights: 4 })
  expect(result.restriction).toBe('awaiting-window')
})

function confirmedWake(time = '07:00') {
  return state({ wakeTimes: [{ time, decidedOn: '2026-11-02' }] })
}

test('a first wake time confirmed in W2 applies to the current week', () => {
  const result = assess({
    state: state({ wakeTimes: [{ time: '07:00', decidedOn: '2026-11-10' }] }),
    entries: baselineNights,
    today: '2026-11-10'
  })

  expect(result.progress.week).toBe(2)
  expect(result.wakeTime.effective).toBe('07:00')
  expect(result.wakeTime.pending).toBeNull()
  expect(result.window).toMatchObject({ status: 'available', mode: 'preview', endTime: '07:00' })
})

test('several changes in one week show the latest one as pending', () => {
  const changedTwice = state({
    wakeTimes: [
      { time: '07:00', decidedOn: '2026-11-02' },
      { time: '06:30', decidedOn: '2026-11-09' },
      { time: '07:15', decidedOn: '2026-11-10' }
    ]
  })
  const result = assess({ state: changedTwice, entries: baselineNights, today: '2026-11-11' })

  expect(result.wakeTime.effective).toBe('07:00')
  expect(result.wakeTime.pending).toEqual({ time: '07:15', effectiveWeek: 3 })
})

test('a W2 candidate over the limit stays a candidate and never claims titration is paused', () => {
  const result = assess({
    state: confirmedWake(),
    entries: nights(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04'], { timeInBed: 660, totalSleep: 600 }),
    today: '2026-11-10'
  })

  expect(result.progress.week).toBe(2)
  expect(result.window).toEqual({
    status: 'unavailable',
    reason: 'window-over-ten-hours',
    completeNights: 4,
    proposedMinutes: 630
  })
  // W2 只预览候选窗口：窗口不生成属于候选语义，睡眠限制与滴定都还没开始。
  expect(result.restriction).toBe('preview')
  expect(result.titration).toEqual({ status: 'not-applicable' })
})

test('a proposed window from more than twelve hours in bed is capped at the twelve-hour ceiling', () => {
  const result = assess({
    state: confirmedWake(),
    entries: nights(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04'], { timeInBed: 840, totalSleep: 780 }),
    today: '2026-11-10'
  })

  // 原始计算值是 810 分钟，但任何对外提议都不得超过 12 小时硬上限。
  expect(result.window).toMatchObject({
    status: 'unavailable',
    reason: 'window-over-ten-hours',
    completeNights: 4
  })
  if (result.window.status !== 'unavailable' || result.window.reason !== 'window-over-ten-hours') {
    throw new Error('expected an over-limit candidate')
  }
  expect(result.window.proposedMinutes).toBe(720)
  expect(result.window.proposedMinutes).toBeLessThanOrEqual(WINDOW_CEILING_MINUTES)
})

test('W2 previews the candidate window from the baseline, with the 8-hour caffeine cutoff', () => {
  const result = assess({ state: confirmedWake(), entries: baselineNights, today: '2026-11-10' })

  expect(result.window).toEqual({
    status: 'available',
    startTime: '00:00',
    endTime: '07:00',
    durationMinutes: 420,
    mode: 'preview',
    calibration: {
      completeNights: 4,
      averageTotalSleepMinutes: 390,
      averageTimeInBedMinutes: 480,
      targetMinutes: 420,
      durationMinutes: 420,
      limitedBy: 'target',
      calibratedFromWeek: 1
    },
    adjustments: [],
    heldover: false,
    latestCompleteNights: 4
  })
  expect(result.caffeine).toEqual({ cutoff: '16:00', basis: 'window' })
  expect(result.restriction).toBe('preview')
})

test('the candidate window rounds to the nearest quarter hour', () => {
  const down = assess({
    state: confirmedWake(),
    entries: nights(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04'], { totalSleep: 380 }),
    today: '2026-11-10'
  })
  const up = assess({
    state: confirmedWake(),
    entries: nights(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04'], { totalSleep: 388 }),
    today: '2026-11-10'
  })

  expect(down.window).toMatchObject({ status: 'available', durationMinutes: 405, startTime: '00:15' })
  expect(up.window).toMatchObject({ status: 'available', durationMinutes: 420, startTime: '00:00' })
})

test('the candidate window never exceeds average time in bed', () => {
  const result = assess({
    state: confirmedWake(),
    entries: nights(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04'], { totalSleep: 480, latency: 0 }),
    today: '2026-11-10'
  })

  expect(result.window).toMatchObject({
    status: 'available',
    durationMinutes: 480,
    startTime: '23:00',
    calibration: { limitedBy: 'average-tib', targetMinutes: 510, averageTimeInBedMinutes: 480 }
  })
})

test('the candidate window never drops below the five-hour floor', () => {
  const result = assess({
    state: confirmedWake(),
    entries: nights(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04'], { totalSleep: 240, latency: 120 }),
    today: '2026-11-10'
  })

  expect(result.window).toMatchObject({
    status: 'available',
    durationMinutes: 300,
    startTime: '02:00',
    calibration: { limitedBy: 'floor', targetMinutes: 270 }
  })
})

test('partial nights do not dilute the calibration or count as complete nights', () => {
  const partial = (date: string): SleepDiaryEntry => ({
    ...night(date),
    sleepOnsetLatencyMinutes: undefined,
    finalWakeTime: undefined,
    waso: { kind: 'unknown' }
  })
  const result = assess({
    state: confirmedWake(),
    entries: [...baselineNights, partial('2026-11-05'), partial('2026-11-06'), partial('2026-11-07')],
    today: '2026-11-10'
  })

  expect(result.window).toMatchObject({
    status: 'available',
    durationMinutes: 420,
    calibration: { completeNights: 4, averageTotalSleepMinutes: 390 }
  })
})

test('W3 recalibrates from the anchor week and activates the window', () => {
  const entries = [
    ...baselineNights,
    ...nights(['2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11'], { totalSleep: 450 })
  ]
  const result = assess({ state: confirmedWake(), entries, today: '2026-11-15' })

  expect(result.progress.week).toBe(3)
  expect(result.window).toMatchObject({
    status: 'available',
    startTime: '23:00',
    endTime: '07:00',
    durationMinutes: 480,
    mode: 'active',
    heldover: false,
    calibration: { completeNights: 4, averageTotalSleepMinutes: 450, calibratedFromWeek: 2 }
  })
  expect(result.restriction).toBe('active')
  expect(result.caffeine).toEqual({ cutoff: '15:00', basis: 'window' })
})

test('W3 without four complete nights holds the previewed window and flags the gap', () => {
  const entries = [
    ...baselineNights,
    ...nights(['2026-11-08', '2026-11-09'], { totalSleep: 450 })
  ]
  const result = assess({ state: confirmedWake(), entries, today: '2026-11-15' })

  expect(result.window).toMatchObject({
    status: 'available',
    startTime: '00:00',
    endTime: '07:00',
    durationMinutes: 420,
    mode: 'active',
    heldover: true,
    latestCompleteNights: 2,
    calibration: { completeNights: 4, calibratedFromWeek: 1 }
  })
  expect(result.restriction).toBe('active')
})

// ---- 每周滴定：窗口是派生的，从 W3 校准值开始按周链式 ±15 ----

const anchorWeekNights = nights(['2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11'], { totalSleep: 450 })

/** 卧床 8 小时、终末清醒为 0 时，SE 只由入睡潜伏期决定：SE = (TIB − SOL) ÷ TIB。 */
function nightsAtLatency(dates: string[], latency: number, timeInBed = 480): SleepDiaryEntry[] {
  return nights(dates, { timeInBed, totalSleep: timeInBed - latency, latency })
}

function withAnchorWeek(extra: SleepDiaryEntry[] = []) {
  return [...baselineNights, ...anchorWeekNights, ...extra]
}

test('W3 only starts restriction and announces the first weekly review in W4', () => {
  const result = assess({ state: confirmedWake(), entries: withAnchorWeek(), today: '2026-11-15' })

  expect(result.progress.week).toBe(3)
  expect(result.window).toMatchObject({ status: 'available', durationMinutes: 480, mode: 'active' })
  expect(result.titration).toEqual({ status: 'scheduled', nextWeek: 4 })
})

test('a mean sleep efficiency above ninety percent lengthens the window by fifteen minutes in W4', () => {
  const result = assess({
    state: confirmedWake(),
    entries: withAnchorWeek(nightsAtLatency(['2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18'], 36)),
    today: '2026-11-22'
  })

  expect(result.progress.week).toBe(4)
  expect(result.window).toMatchObject({
    status: 'available',
    startTime: '22:45',
    endTime: '07:00',
    durationMinutes: 495,
    mode: 'active',
    // 校准本身仍是 W3 的 8 小时；多出来的 15 分钟来自第 4 周的滴定。
    calibration: { durationMinutes: 480, calibratedFromWeek: 2 },
    adjustments: [{ week: 4, rule: 'increase', changeMinutes: 15, previousMinutes: 480, durationMinutes: 495 }]
  })
  expect(result.titration).toMatchObject({
    status: 'adjusted',
    change: {
      week: 4,
      changeMinutes: 15,
      previousMinutes: 480,
      durationMinutes: 495,
      basis: { completeNights: 4, averageSleepEfficiency: 92.5 }
    }
  })
  expect(result.canDeferTitration).toBe(true)
  expect(result.restriction).toBe('active')
})

const fourthWeekDates = ['2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18']
const fifthWeekDates = ['2026-11-22', '2026-11-23', '2026-11-24', '2026-11-25']

function fourthWeekNights(latency: number, timeInBed = 480): SleepDiaryEntry[] {
  return nightsAtLatency(fourthWeekDates, latency, timeInBed)
}

function fifthWeekNights(latency: number, timeInBed = 480): SleepDiaryEntry[] {
  return nightsAtLatency(fifthWeekDates, latency, timeInBed)
}

test('sleep efficiency of exactly eighty-five or ninety percent keeps the window unchanged', () => {
  const at85 = assess({
    state: confirmedWake(),
    entries: withAnchorWeek(fourthWeekNights(72)),
    today: '2026-11-22'
  })
  const at90 = assess({
    state: confirmedWake(),
    entries: withAnchorWeek(fourthWeekNights(48)),
    today: '2026-11-22'
  })

  expect(at85.window).toMatchObject({ status: 'available', durationMinutes: 480, startTime: '23:00' })
  expect(at85.titration).toMatchObject({ status: 'kept', reason: 'in-band', basis: { averageSleepEfficiency: 85 } })
  expect(at90.window).toMatchObject({ status: 'available', durationMinutes: 480 })
  expect(at90.titration).toMatchObject({ status: 'kept', reason: 'in-band', basis: { averageSleepEfficiency: 90 } })
})

test('a mean sleep efficiency just below eighty-five percent shortens the window by fifteen minutes', () => {
  const result = assess({
    state: confirmedWake(),
    entries: withAnchorWeek(fourthWeekNights(73)),
    today: '2026-11-22'
  })

  expect(result.window).toMatchObject({
    status: 'available',
    startTime: '23:15',
    endTime: '07:00',
    durationMinutes: 465
  })
  expect(result.titration).toMatchObject({
    status: 'adjusted',
    change: {
      week: 4,
      rule: 'decrease',
      changeMinutes: 15,
      previousMinutes: 480,
      durationMinutes: 465,
      basis: { completeNights: 4, averageSleepEfficiency: 84.8 }
    }
  })
})

test('the window never shrinks below the five-hour floor', () => {
  const shortAnchorWeek = nights(['2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11'], {
    totalSleep: 240,
    latency: 120
  })
  const result = assess({
    state: confirmedWake(),
    entries: [...baselineNights, ...shortAnchorWeek, ...fourthWeekNights(73)],
    today: '2026-11-22'
  })

  expect(result.window).toMatchObject({
    status: 'available',
    startTime: '02:00',
    durationMinutes: 300
  })
  expect(result.titration).toMatchObject({ status: 'kept', reason: 'floor', basis: { averageSleepEfficiency: 84.8 } })
})

test('fewer than four complete nights keeps the window and reports the data gap', () => {
  const result = assess({
    state: confirmedWake(),
    entries: withAnchorWeek(nightsAtLatency(['2026-11-15', '2026-11-16', '2026-11-17'], 36)),
    today: '2026-11-22'
  })

  expect(result.window).toMatchObject({ status: 'available', durationMinutes: 480, adjustments: [] })
  expect(result.titration).toEqual({ status: 'insufficient-data', completeNights: 3, required: 4 })
})

test('a deferred weekly review keeps the previous window for that week', () => {
  const deferred = withTitrationDeferral(confirmedWake(), 4, [], '2026-11-22')
  const result = assess({ state: deferred, entries: withAnchorWeek(fourthWeekNights(36)), today: '2026-11-22' })

  expect(result.window).toMatchObject({ status: 'available', durationMinutes: 480, adjustments: [] })
  expect(result.titration).toEqual({ status: 'deferred', durationMinutes: 480 })
})

test('deferring one week does not block the next week review', () => {
  const deferred = withTitrationDeferral(confirmedWake(), 4, [], '2026-11-22')
  const result = assess({
    state: deferred,
    entries: withAnchorWeek([...fourthWeekNights(36), ...fifthWeekNights(36)]),
    today: '2026-11-29'
  })

  expect(result.window).toMatchObject({
    status: 'available',
    durationMinutes: 495,
    adjustments: [{ week: 5, rule: 'increase', previousMinutes: 480, durationMinutes: 495 }]
  })
  expect(result.titration).toMatchObject({ status: 'adjusted', change: { week: 5 } })
})

test('the domain refuses to defer a titration week that has already started', () => {
  const state = confirmedWake()
  const started = withTitrationDeferral(state, 4, [night('2026-11-22', { latency: 36 })], '2026-11-22')

  // 已开始执行后再推迟会回溯已按新窗口执行的天数，因此领域层直接拒绝且不写入。
  expect(started).toBe(state)
  expect(started.deferredTitrations ?? []).not.toContain(4)
})

test('a screening pause stops automatic titration without ending the course', () => {
  const result = assess({
    state: confirmedWake(),
    entries: withAnchorWeek(fourthWeekNights(36)),
    today: '2026-11-22',
    screening: needsReview
  })

  expect(result.progress.week).toBe(4)
  expect(result.window).toEqual({ status: 'unavailable', reason: 'screening-paused', completeNights: 4 })
  expect(result.titration).toEqual({ status: 'paused', reason: 'screening' })
  expect(result.restriction).toBe('paused')
})

test('shift work pauses titration with its own reason', () => {
  const shift = withWorkPattern(confirmedWake(), 'shift-work')
  const result = assess({ state: shift, entries: withAnchorWeek(fourthWeekNights(36)), today: '2026-11-22' })

  expect(result.window).toEqual({ status: 'unavailable', reason: 'shift-work-paused', completeNights: 4 })
  expect(result.titration).toEqual({ status: 'paused', reason: 'shift-work' })
})

test('the weekly review averages nightly sleep efficiency instead of total sleep over total time', () => {
  // 两个 100% 夜与两个 75% 夜：逐夜平均 87.5%（保持），而合并计算只有 83.9%（会缩短）。
  const efficient = nights(['2026-11-15', '2026-11-16'], { timeInBed: 400, totalSleep: 400, latency: 0 })
  const inefficient = nights(['2026-11-17', '2026-11-18'], { timeInBed: 720, totalSleep: 540, latency: 30 })
  const result = assess({
    state: confirmedWake(),
    entries: withAnchorWeek([...efficient, ...inefficient]),
    today: '2026-11-22'
  })

  expect(result.titration).toMatchObject({
    status: 'kept',
    reason: 'in-band',
    basis: { completeNights: 4, averageSleepEfficiency: 87.5 }
  })
  expect(result.window).toMatchObject({ status: 'available', durationMinutes: 480 })
})

test('a proposed extension past ten hours pauses the window and suggests professional review', () => {
  const longAnchorWeek = nights(['2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11'], {
    timeInBed: 600,
    totalSleep: 570
  })
  const result = assess({
    state: confirmedWake(),
    entries: [...baselineNights, ...longAnchorWeek, ...fourthWeekNights(36, 600)],
    today: '2026-11-22'
  })

  expect(result.progress.week).toBe(4)
  // 提议的 615 分钟超过 10 小时：不再展示 600 分钟的可用窗口，而是按 #5 的语义暂停。
  expect(result.window).toEqual({
    status: 'unavailable',
    reason: 'window-over-ten-hours',
    completeNights: 4,
    proposedMinutes: 615
  })
  expect(result.restriction).toBe('paused')
  expect(result.titration).toEqual({
    status: 'review',
    proposedMinutes: 615,
    basis: { completeNights: 4, averageSleepEfficiency: 94, unroundedSleepEfficiency: 94 }
  })
})

test('a review does not compound: the next week evaluates the same unchanged window', () => {
  const longAnchorWeek = nights(['2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11'], {
    timeInBed: 600,
    totalSleep: 570
  })
  const result = assess({
    state: confirmedWake(),
    entries: [
      ...baselineNights,
      ...longAnchorWeek,
      ...fourthWeekNights(36, 600),
      ...fifthWeekNights(36, 600)
    ],
    today: '2026-11-29'
  })

  expect(result.window).toEqual({
    status: 'unavailable',
    reason: 'window-over-ten-hours',
    completeNights: 4,
    proposedMinutes: 615
  })
  expect(result.restriction).toBe('paused')
  expect(result.titration).toMatchObject({ status: 'review', proposedMinutes: 615 })
})

test('W4 and W5 adjustments chain from the calibrated window in order', () => {
  const result = assess({
    state: confirmedWake(),
    entries: withAnchorWeek([...fourthWeekNights(36), ...fifthWeekNights(36)]),
    today: '2026-11-29'
  })

  expect(result.progress.week).toBe(5)
  expect(result.window).toMatchObject({
    status: 'available',
    startTime: '22:30',
    endTime: '07:00',
    durationMinutes: 510,
    adjustments: [
      { week: 4, rule: 'increase', changeMinutes: 15, previousMinutes: 480, durationMinutes: 495 },
      { week: 5, rule: 'increase', changeMinutes: 15, previousMinutes: 495, durationMinutes: 510 }
    ]
  })
  expect(result.titration).toMatchObject({ status: 'adjusted', change: { week: 5, durationMinutes: 510 } })
})

test('the consolidation week keeps the final window without another adjustment', () => {
  const result = assess({
    state: confirmedWake(),
    entries: withAnchorWeek([...fourthWeekNights(36), ...fifthWeekNights(36)]),
    today: '2026-12-06'
  })

  expect(result.progress.week).toBe(6)
  expect(result.progress.stage).toBe('consolidation')
  expect(result.window).toMatchObject({ status: 'available', durationMinutes: 510 })
  if (result.window.status !== 'available') throw new Error('expected an available window')
  expect(result.window.adjustments).toHaveLength(2)
  expect(result.titration).toEqual({ status: 'consolidation' })
})

test('the titration step respects the five-hour floor and twelve-hour ceiling directly', () => {
  expect(decideTitration(480, 95)).toEqual({ kind: 'increase', durationMinutes: 495 })
  expect(decideTitration(480, 84)).toEqual({ kind: 'decrease', durationMinutes: 465 })
  expect(decideTitration(WINDOW_FLOOR_MINUTES, 84)).toEqual({ kind: 'keep', reason: 'floor' })
  expect(decideTitration(810, 95)).toEqual({ kind: 'review', proposedMinutes: WINDOW_CEILING_MINUTES })
})

// ---- 审查修正：阈值用未舍入均值、推迟时机、12 小时硬不变量 ----

/** 卧床 1000 分钟时 SE = (1000 − SOL) ÷ 1000，可按 0.1% 精确构造边界值。 */
function wideNights(latencies: number[]): SleepDiaryEntry[] {
  const dates = ['2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19']
  return dates.map((date, index) => night(date, {
    timeInBed: 1000,
    latency: latencies[index],
    totalSleep: 1000 - latencies[index]
  }))
}

test('a mean of 84.96 percent shortens the window and is displayed as 84.96', () => {
  const result = assess({
    state: confirmedWake(),
    entries: withAnchorWeek(wideNights([151, 151, 150, 150, 150])),
    today: '2026-11-22'
  })

  expect(result.window).toMatchObject({ status: 'available', durationMinutes: 465 })
  expect(result.titration).toMatchObject({
    status: 'adjusted',
    change: { rule: 'decrease', basis: { completeNights: 5, averageSleepEfficiency: 84.96 } }
  })
  if (result.titration.status !== 'adjusted') throw new Error('expected an adjustment')
  expect(result.titration.change.basis.unroundedSleepEfficiency).toBeCloseTo(84.96, 5)
})

test('a mean of 90.04 percent lengthens the window and is displayed as 90.04', () => {
  const result = assess({
    state: confirmedWake(),
    entries: withAnchorWeek(wideNights([100, 100, 100, 100, 98])),
    today: '2026-11-22'
  })

  expect(result.window).toMatchObject({ status: 'available', durationMinutes: 495 })
  expect(result.titration).toMatchObject({
    status: 'adjusted',
    change: { rule: 'increase', basis: { completeNights: 5, averageSleepEfficiency: 90.04 } }
  })
  if (result.titration.status !== 'adjusted') throw new Error('expected an adjustment')
  expect(result.titration.change.basis.unroundedSleepEfficiency).toBeCloseTo(90.04, 5)
})

test('a weekly adjustment cannot be deferred once the week already has a diary entry', () => {
  const beforeAnyEntry = assess({
    state: confirmedWake(),
    entries: withAnchorWeek(fourthWeekNights(36)),
    today: '2026-11-22'
  })
  const afterFirstEntry = assess({
    state: confirmedWake(),
    entries: withAnchorWeek([...fourthWeekNights(36), night('2026-11-22', { latency: 36 })]),
    today: '2026-11-22'
  })

  expect(beforeAnyEntry.titration.status).toBe('adjusted')
  expect(beforeAnyEntry.canDeferTitration).toBe(true)
  expect(afterFirstEntry.titration.status).toBe('adjusted')
  expect(afterFirstEntry.canDeferTitration).toBe(false)
})

test('the titration step never returns a duration above the twelve-hour ceiling', () => {
  const efficiencies = [0, 50, 84, 84.9, 85, 90, 90.1, 100]
  const previousMinutes = [300, 480, 600, 705, 720, 900]

  for (const base of previousMinutes) {
    for (const se of efficiencies) {
      const decision = decideTitration(base, se)
      const duration = decision.kind === 'increase' || decision.kind === 'decrease'
        ? decision.durationMinutes
        : decision.kind === 'review'
          ? decision.proposedMinutes
          : null
      if (duration !== null) expect(duration).toBeLessThanOrEqual(WINDOW_CEILING_MINUTES)
    }
  }
})

test('the titration copy shows two decimals so the number never contradicts the decision', () => {
  const t = i18n.getFixedT('zh-CN')
  // 84.96% 若按一位小数显示成 85%，就会和“低于 85%”的判决自相矛盾。
  const below = assess({
    state: confirmedWake(),
    entries: withAnchorWeek(wideNights([151, 151, 150, 150, 150])),
    today: '2026-11-22'
  })
  if (below.titration.status !== 'adjusted') throw new Error('expected a decrease')
  const belowText = titrationBody(t, below.titration)
  expect(belowText).toContain('84.96%')
  expect(belowText).toContain('低于 85%')
  expect(belowText).not.toContain('85.00%')

  // 90.04% 同理不能显示成 90% 后仍写“高于 90%”。
  const above = assess({
    state: confirmedWake(),
    entries: withAnchorWeek(wideNights([100, 100, 100, 100, 98])),
    today: '2026-11-22'
  })
  if (above.titration.status !== 'adjusted') throw new Error('expected an increase')
  const aboveText = titrationBody(t, above.titration)
  expect(aboveText).toContain('90.04%')
  expect(aboveText).toContain('高于 90%')
  expect(aboveText).not.toContain('90.00%')

  // 常见的 92.5% 也必须补齐成 92.50%，同一张卡的数字格式保持一致。
  const exact = assess({
    state: confirmedWake(),
    entries: withAnchorWeek(nightsAtLatency(fourthWeekDates, 36)),
    today: '2026-11-22'
  })
  expect(titrationBody(t, exact.titration)).toContain('92.50%')
})

// ---- 文案里的规则数字只来自领域常量，资源文件不保存第二份真值 ----

test('rule copy takes every rule number from the caller instead of hardcoding it', () => {
  const t = i18n.getFixedT('zh-CN')

  // 故意传入与产品常量不同的数值：若资源里写死了 30/15/4/7，这些断言就会失败。
  expect(t('windowTarget', { surplus: 31, step: 16, target: '7 小时' })).toContain('31 分钟')
  expect(t('windowTarget', { surplus: 31, step: 16, target: '7 小时' })).toContain('16 分钟')
  expect(t('windowDataInsufficient', { required: 5 })).toContain('不足 5 夜')
  expect(t('courseBaselineExtended', { required: 5 })).toContain('不足 5 夜')
  expect(t('titrationScheduled', { week: 4, nights: 8 })).toContain('开始前 8 夜')
})

// ---- 暂停措辞：W3 起筛查/轮班拦截时，滴定尚未开始，不能写成“曾运行后暂停” ----

test('a W3 pause says restriction and titration are paused without implying titration ran', () => {
  const t = i18n.getFixedT('zh-CN')
  const result = assess({
    state: confirmedWake(),
    entries: withAnchorWeek(),
    today: '2026-11-15',
    screening: needsReview
  })

  expect(result.progress.week).toBe(3)
  expect(result.titration).toEqual({ status: 'paused', reason: 'screening' })
  const text = titrationBody(t, result.titration)
  expect(text).toContain('睡眠限制与每周滴定已暂停')
  expect(text).not.toContain('自动滴定已暂停')
  expect(text).toContain('专业评估')
})

test('the domain names why restriction is paused instead of letting the interface infer it', () => {
  const candidate = assess({
    state: confirmedWake(),
    entries: nights(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04'], { timeInBed: 660, totalSleep: 600 }),
    today: '2026-11-10'
  })
  const blocked = assess({
    state: confirmedWake(),
    entries: withAnchorWeek(),
    today: '2026-11-15',
    screening: needsReview
  })

  expect(candidate.restriction).toBe('preview')
  expect(candidate.restrictionPausedBy).toBeNull()
  expect(blocked.restriction).toBe('paused')
  expect(blocked.restrictionPausedBy).toBe('screening')
})
