import type { TFunction } from 'i18next'

/** 把分钟数格式化为“X 小时 Y 分钟”，0 小时时只显示分钟。 */
export function durationText(t: TFunction, minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return t('durationMinutes', { minutes: rest })
  if (rest === 0) return t('durationHours', { hours })
  return t('durationHoursMinutes', { hours, minutes: rest })
}

/** 用户本地的今天，格式为 YYYY-MM-DD；不使用 UTC，避免夜间记录落到错误日期。 */
export function localToday(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}
