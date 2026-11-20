import type { ScreeningRecord } from '../domain/screening'
import { openDatabase } from './database'

export type Preferences = {
  backupReminders: boolean
  /**
   * 旧版本把期望起床时间存在偏好里；现在由疗程状态按周管理。
   * 保留该字段，仅用于迁移时预填固定起床时间输入框，不直接生效。
   */
  wakeTime?: string
}

export const defaultPreferences: Preferences = {
  backupReminders: true
}

export async function readPreferences(): Promise<Preferences> {
  const database = await openDatabase()
  try {
    return (await database.get('preferences', 'current')) ?? defaultPreferences
  } finally {
    database.close()
  }
}

export async function writePreferences(preferences: Preferences): Promise<void> {
  const database = await openDatabase()
  try {
    await database.put('preferences', preferences, 'current')
  } finally {
    database.close()
  }
}

export async function readScreening(): Promise<ScreeningRecord | null> {
  const database = await openDatabase()
  try {
    return (await database.get('screening', 'current')) ?? null
  } finally {
    database.close()
  }
}

export async function writeScreening(screening: ScreeningRecord): Promise<void> {
  const database = await openDatabase()
  try {
    await database.put('screening', screening, 'current')
  } finally {
    database.close()
  }
}
