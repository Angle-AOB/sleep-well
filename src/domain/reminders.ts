/**
 * 备份提醒的纯领域规则。
 *
 * 提醒的目的只是“本地数据值得在设备之外留一份”，不涉及睡眠质量、依从性或医疗建议。
 * 时机完全由输入决定：日记、设置、最近一次提醒/导出日期与今天；本模块不读时钟、
 * 不碰浏览器 API，因此可以在测试里直接给定日期。
 *
 * 规则（产品决定）：
 * 1. 用户在设置里关闭即完全不提醒；
 * 2. 已保存日记少于 3 夜时不提醒——提醒的理由是“数据值得备份”，与完整夜无关；
 * 3. 上次成功导出之后没有更新的日记时不提醒，刚备份完不应立刻被再次催促；
 * 4. 首次提醒在任何时间展示一次，之后至少间隔 7 天——每周一次是上限，不是日程。
 */

import type { LocalDate, SleepDiaryEntry } from './diary'

export const FIRST_REMINDER_NIGHTS = 3
export const REMINDER_INTERVAL_DAYS = 7

export type ReminderPreferences = {
  backupReminders: boolean
  /** 最近一次在应用内展示备份提醒的本地日期。 */
  lastBackupReminderOn?: LocalDate
  /** 最近一次成功生成并交付备份文件的时刻（ISO 时间戳）。 */
  lastBackupAt?: string
}

export type BackupReminderDecision =
  | { remind: false }
  | { remind: true; kind: 'first' | 'weekly'; entryCount: number }

export type ReminderInput = {
  entries: readonly Pick<SleepDiaryEntry, 'date' | 'updatedAt'>[]
  preferences: ReminderPreferences
  today: LocalDate
  /** 设置是否已从本地加载完成。未加载时一律不提醒，避免默认值造成误提醒。 */
  prefsLoaded: boolean
}

const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/

/** 用 UTC 日序号做差值，避免本地时区/夏令时把“7 天”算成 6 或 8 天。 */
function dayNumber(value: LocalDate): number | null {
  const match = datePattern.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const probe = new Date(Date.UTC(year, month - 1, day))
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
    return null
  }
  return probe.getTime() / 86_400_000
}

export function evaluateBackupReminder(input: ReminderInput): BackupReminderDecision {
  const { entries, preferences, today, prefsLoaded } = input

  // 设置尚未加载时一律不提醒：默认值或另一标签页的改动不能被当作用户的选择。
  if (!prefsLoaded) return { remind: false }
  if (!preferences.backupReminders) return { remind: false }
  if (entries.length < FIRST_REMINDER_NIGHTS) return { remind: false }

  const todayNumber = dayNumber(today)
  if (todayNumber === null) return { remind: false }

  // 用户刚导出过备份：只有在那之后出现新日记才值得再次提醒。
  if (preferences.lastBackupAt !== undefined) {
    const exportedAt = Date.parse(preferences.lastBackupAt)
    if (!Number.isNaN(exportedAt)) {
      const newestEntry = entries.reduce(
        (newest, entry) => Math.max(newest, Date.parse(entry.updatedAt) || 0),
        0
      )
      if (newestEntry <= exportedAt) return { remind: false }
    }
  }

  if (preferences.lastBackupReminderOn === undefined) {
    return { remind: true, kind: 'first', entryCount: entries.length }
  }

  const lastNumber = dayNumber(preferences.lastBackupReminderOn)
  // 上次提醒日期损坏或来自未来时不催促，等下一次用户回到应用再判断。
  if (lastNumber === null || lastNumber > todayNumber) return { remind: false }
  if (todayNumber - lastNumber < REMINDER_INTERVAL_DAYS) return { remind: false }

  return { remind: true, kind: 'weekly', entryCount: entries.length }
}
