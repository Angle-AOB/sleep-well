import type { DBSchema } from 'idb'
import { openDB } from 'idb'
import type { ScreeningRecord } from '../domain/screening'

export type Preferences = {
  wakeTime: string
  backupReminders: boolean
}

interface SleepWellDatabase extends DBSchema {
  preferences: {
    key: 'current'
    value: Preferences
  }
  screening: {
    key: 'current'
    value: ScreeningRecord
  }
}

const databaseName = 'sleep-well'
const databaseVersion = 2

export const defaultPreferences: Preferences = {
  wakeTime: '07:00',
  backupReminders: true
}

async function openDatabase() {
  return openDB<SleepWellDatabase>(databaseName, databaseVersion, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('preferences')) db.createObjectStore('preferences')
      if (!db.objectStoreNames.contains('screening')) db.createObjectStore('screening')
    }
  })
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
