import { test, expect } from '@playwright/test'
import type { SleepDiaryEntry } from '../src/domain/diary'
import { assessScreening, type ScreeningResult } from '../src/domain/screening'
import {
  assessCourse,
  medianOutOfBedTime,
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

test('a candidate window longer than ten hours pauses automation and suggests review', () => {
  const result = assess({
    state: confirmedWake(),
    entries: nights(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04'], { timeInBed: 660, totalSleep: 600 }),
    today: '2026-11-10'
  })

  expect(result.window).toEqual({
    status: 'unavailable',
    reason: 'window-over-ten-hours',
    completeNights: 4,
    proposedMinutes: 630
  })
  expect(result.restriction).toBe('paused')
})

test('an over-limit candidate reports its computed duration without generating a window', () => {
  const result = assess({
    state: confirmedWake(),
    entries: nights(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04'], { timeInBed: 840, totalSleep: 780 }),
    today: '2026-11-10'
  })

  expect(result.window).toEqual({
    status: 'unavailable',
    reason: 'window-over-ten-hours',
    completeNights: 4,
    proposedMinutes: 810
  })
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
    basis: { completeNights: 4, averageSleepEfficiency: 92.5 },
    change: { week: 4, changeMinutes: 15, previousMinutes: 480, durationMinutes: 495 }
  })
  expect(result.restriction).toBe('active')
})
