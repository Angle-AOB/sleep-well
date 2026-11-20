import type { TFunction } from 'i18next'

/** 把分钟数格式化为“X 小时 Y 分钟”，0 小时时只显示分钟。 */
export function durationText(t: TFunction, minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return t('durationMinutes', { minutes: rest })
  if (rest === 0) return t('durationHours', { hours })
  return t('durationHoursMinutes', { hours, minutes: rest })
}

/**
 * 滴定依据的平均 SE 固定显示两位小数。
 * 平均值可能落在阈值边界（84.96 / 90.04），按一位小数显示会把判决在文案里
 * 说反，因此这里不做四舍五入到整数或一位小数。
 */
export function efficiencyText(value: number): string {
  return value.toFixed(2)
}

/** 用户本地的今天，格式为 YYYY-MM-DD；不使用 UTC，避免夜间记录落到错误日期。 */
export function localToday(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** 日记日期等本地日期的长格式，走 i18n 而不是在组件里另起 locale。 */
export function dateLongText(t: TFunction, value: string): string {
  const [year, month, day] = value.split('-').map(Number)
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return value
  return t('dateLong', { year, month, day })
}

/** ISO 时间戳按设备本地时区显示为「日期 时间」；无效值原样返回。 */
export function momentText(t: TFunction, value: string): string {
  const moment = new Date(value)
  if (Number.isNaN(moment.getTime())) return value
  const date = `${moment.getFullYear()}-${pad(moment.getMonth() + 1)}-${pad(moment.getDate())}`
  return t('dateTimeShort', {
    date: dateLongText(t, date),
    time: `${pad(moment.getHours())}:${pad(moment.getMinutes())}`
  })
}
