import type { ScreeningRecord } from '../domain/screening'
import { openDatabase } from './database'

export type Preferences = {
  wakeTime: string
  backupReminders: boolean
}

export const defaultPreferences: Preferences = {
  wakeTime: '07:00',
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
