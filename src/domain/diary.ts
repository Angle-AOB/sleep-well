/**
 * 睡眠日记的纯领域引擎。
 *
 * 日记只保存用户输入的原始值（时间、估计值、标签）；TIB、TST、SE 等派生指标
 * 每次都按当前规则重新计算，因此规则升级后旧日记可以重建，不会被旧的派生值污染。
 *
 * 时间一律按日记所属的本地日期解析：起床时间与最终醒来时间落在日记日期的早晨，
 * 关灯时间取“不晚于最终醒来（缺失时用起床时间）”的最近一次出现，从而同时覆盖
 * 常见的跨午夜就寝与凌晨后就寝。
 */

export type LocalDate = string

export type NightWakesCount = 'unknown' | 'none' | 'one-to-two' | 'three-to-five' | 'six-plus'

export type WasoRange = 'under-15' | '15-to-30' | '30-to-60' | 'over-60'

export type WasoEstimate =
  | { kind: 'unknown' }
  | { kind: 'none-remembered' }
  | { kind: 'minutes'; minutes: number }
  | { kind: 'range'; range: WasoRange }

export type SleepQuality = 1 | 2 | 3 | 4 | 5

export type DiaryTag = 'caffeine' | 'alcohol' | 'nap' | 'exercise'

export type SleepDiaryEntry = {
  date: LocalDate
  lightsOffTime?: string
  sleepOnsetLatencyMinutes?: number
  finalWakeTime?: string
  outOfBedTime?: string
  nightWakes: NightWakesCount
  waso: WasoEstimate
  sleepQuality?: SleepQuality
  tags: DiaryTag[]
  recordedAt: string
  updatedAt: string
}

export type MetricUnavailableReason = 'missing-input' | 'approximate-input' | 'invalid-input'

export type Metric<T> =
  | { status: 'available'; value: T }
  | { status: 'unavailable'; reason: MetricUnavailableReason }

export type DiaryProblem =
  | { kind: 'final-wake-after-out-of-bed' }
  | { kind: 'night-components-exceed-time-in-bed'; timeInBedMinutes: number; componentMinutes: number }
  | { kind: 'invalid-duration'; field: 'sleep-onset-latency' | 'waso' }
  | { kind: 'invalid-time'; field: 'lights-off' | 'final-wake' | 'out-of-bed' }
  | { kind: 'lights-off-after-wake' }
  | { kind: 'time-in-bed-not-positive' }

export type NightAssessment = {
  date: LocalDate
  /** 完整夜：必要字段齐全、WASO 精确或明确为零、时间有效——只有完整夜参与 SE 与窗口滴定。 */
  complete: boolean
  timeInBed: Metric<number>
  terminalAwake: Metric<number>
  totalSleep: Metric<number>
  sleepEfficiency: Metric<number>
  problems: DiaryProblem[]
}

const clockPattern = /^([01][0-9]|2[0-3]):([0-5][0-9])$/
const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/

function available(value: number): Metric<number> {
  return { status: 'available', value }
}

function unavailable(reason: MetricUnavailableReason): Metric<number> {
  return { status: 'unavailable', reason }
}

function parseLocalDate(value: LocalDate): { year: number; month: number; day: number } | null {
  const match = datePattern.exec(value)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const probe = new Date(year, month - 1, day)
  const valid = probe.getFullYear() === year && probe.getMonth() === month - 1 && probe.getDate() === day
  return valid ? { year, month, day } : null
}

function localMoment(date: LocalDate, time: string, dayOffset = 0): Date | null {
  const parts = parseLocalDate(date)
  const clock = clockPattern.exec(time)
  if (!parts || !clock) return null

  const moment = new Date(
    parts.year,
    parts.month - 1,
    parts.day + dayOffset,
    Number(clock[1]),
    Number(clock[2])
  )
  return Number.isNaN(moment.getTime()) ? null : moment
}

function minutesBetween(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / 60_000)
}

type ParsedTime =
  | { status: 'absent' }
  | { status: 'valid'; moment: Date }
  | { status: 'invalid' }

function parseTime(date: LocalDate, time: string | undefined): ParsedTime {
  if (time === undefined) return { status: 'absent' }
  const moment = localMoment(date, time)
  return moment ? { status: 'valid', moment } : { status: 'invalid' }
}

type WasoResolution =
  | { status: 'minutes'; value: number }
  | { status: 'missing' }
  | { status: 'approximate'; floorMinutes: number }
  | { status: 'invalid' }

// 区间估计的下界：只用来判断“即使按最保守估计也超过卧床时间”的矛盾，不伪造精确值。
const wasoRangeFloor: Record<WasoRange, number> = {
  'under-15': 0,
  '15-to-30': 15,
  '30-to-60': 30,
  'over-60': 60
}

function resolveWaso(waso: WasoEstimate): WasoResolution {
  switch (waso.kind) {
    case 'none-remembered':
      return { status: 'minutes', value: 0 }
    case 'minutes':
      return Number.isInteger(waso.minutes) && waso.minutes >= 0
        ? { status: 'minutes', value: waso.minutes }
        : { status: 'invalid' }
    case 'range':
      return { status: 'approximate', floorMinutes: wasoRangeFloor[waso.range] }
    case 'unknown':
      return { status: 'missing' }
  }
}

type LightsOffResolution =
  | { status: 'resolved'; moment: Date }
  | { status: 'after-wake' }
  | { status: 'invalid' }

/**
 * 关灯时间先按日记日期解析；若它晚于最终醒来（缺失时用起床时间），
 * 中午之后的时刻视为前一晚，中午之前的时刻无法构成一夜，属于顺序矛盾，
 * 要求用户修正而不是挪到前一天伪装成有效数据。
 */
function resolveLightsOff(date: LocalDate, lightsOffTime: string, anchor: Date): LightsOffResolution {
  const sameDay = localMoment(date, lightsOffTime)
  if (!sameDay) return { status: 'invalid' }
  if (sameDay.getTime() <= anchor.getTime()) return { status: 'resolved', moment: sameDay }
  if (lightsOffTime < '12:00') return { status: 'after-wake' }

  const previousEvening = localMoment(date, lightsOffTime, -1)
  return previousEvening ? { status: 'resolved', moment: previousEvening } : { status: 'invalid' }
}

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10
}

export function evaluateNight(entry: SleepDiaryEntry): NightAssessment {
  const problems: DiaryProblem[] = []

  const outOfBed = parseTime(entry.date, entry.outOfBedTime)
  const finalWake = parseTime(entry.date, entry.finalWakeTime)

  if (outOfBed.status === 'invalid') problems.push({ kind: 'invalid-time', field: 'out-of-bed' })
  if (finalWake.status === 'invalid') problems.push({ kind: 'invalid-time', field: 'final-wake' })

  let terminalAwake: Metric<number> = unavailable('missing-input')
  if (finalWake.status === 'valid' && outOfBed.status === 'valid') {
    const minutes = minutesBetween(finalWake.moment, outOfBed.moment)
    if (minutes < 0) {
      problems.push({ kind: 'final-wake-after-out-of-bed' })
      terminalAwake = unavailable('invalid-input')
    } else {
      terminalAwake = available(minutes)
    }
  } else if (finalWake.status === 'invalid' || outOfBed.status === 'invalid') {
    terminalAwake = unavailable('invalid-input')
  }

  let latency = entry.sleepOnsetLatencyMinutes
  if (latency !== undefined && (!Number.isInteger(latency) || latency < 0)) {
    problems.push({ kind: 'invalid-duration', field: 'sleep-onset-latency' })
    latency = undefined
  }

  const waso = resolveWaso(entry.waso)
  if (waso.status === 'invalid') problems.push({ kind: 'invalid-duration', field: 'waso' })

  let timeInBed: Metric<number> = unavailable('missing-input')
  const lightsOff = parseTime(entry.date, entry.lightsOffTime)
  if (lightsOff.status === 'invalid') problems.push({ kind: 'invalid-time', field: 'lights-off' })

  if (lightsOff.status === 'valid' && outOfBed.status === 'valid') {
    const anchor = finalWake.status === 'valid' ? finalWake.moment : outOfBed.moment
    const start = resolveLightsOff(entry.date, entry.lightsOffTime!, anchor)
    if (start.status === 'after-wake') {
      problems.push({ kind: 'lights-off-after-wake' })
      timeInBed = unavailable('invalid-input')
    } else if (start.status === 'invalid') {
      problems.push({ kind: 'invalid-time', field: 'lights-off' })
      timeInBed = unavailable('invalid-input')
    } else {
      const minutes = minutesBetween(start.moment, outOfBed.moment)
      if (minutes <= 0) {
        problems.push({ kind: 'time-in-bed-not-positive' })
        timeInBed = unavailable('invalid-input')
      } else {
        timeInBed = available(minutes)
      }
    }
  } else if (lightsOff.status === 'invalid' || outOfBed.status === 'invalid') {
    timeInBed = unavailable('invalid-input')
  }

  let totalSleep: Metric<number> = unavailable('missing-input')
  let sleepEfficiency: Metric<number> = unavailable('missing-input')

  // 已知部分（缺失或区间字段按 0 计）已经超过卧床时间时，无论其余字段是否齐全都要求修正。
  const knownComponentMinutes = (latency ?? 0)
    + (waso.status === 'minutes' ? waso.value : waso.status === 'approximate' ? waso.floorMinutes : 0)
    + (terminalAwake.status === 'available' ? terminalAwake.value : 0)

  if (timeInBed.status === 'available' && knownComponentMinutes > timeInBed.value) {
    problems.push({
      kind: 'night-components-exceed-time-in-bed',
      timeInBedMinutes: timeInBed.value,
      componentMinutes: knownComponentMinutes
    })
    totalSleep = unavailable('invalid-input')
    sleepEfficiency = unavailable('invalid-input')
  } else if (problems.length > 0) {
    totalSleep = unavailable('invalid-input')
    sleepEfficiency = unavailable('invalid-input')
  } else if (timeInBed.status === 'available' && terminalAwake.status === 'available' && latency !== undefined) {
    if (waso.status === 'approximate') {
      totalSleep = unavailable('approximate-input')
      sleepEfficiency = unavailable('approximate-input')
    } else if (waso.status === 'minutes') {
      const totalSleepMinutes = timeInBed.value - knownComponentMinutes
      totalSleep = available(totalSleepMinutes)
      sleepEfficiency = available(roundToTenth((totalSleepMinutes / timeInBed.value) * 100))
    }
  }

  return {
    date: entry.date,
    complete: sleepEfficiency.status === 'available',
    timeInBed,
    terminalAwake,
    totalSleep,
    sleepEfficiency,
    problems
  }
}

export function isCompleteNight(entry: SleepDiaryEntry): boolean {
  return evaluateNight(entry).complete
}
