import type { DBSchema } from 'idb'
import { openDB } from 'idb'

export type Preferences = {
  wakeTime: string
  backupReminders: boolean
}

interface SleepWellDatabase extends DBSchema {
  preferences: {
    key: 'current'
    value: Preferences
  }
}

const databaseName = 'sleep-well'
const databaseVersion = 1

export const defaultPreferences: Preferences = {
  wakeTime: '07:00',
  backupReminders: true
}

async function openDatabase() {
  return openDB<SleepWellDatabase>(databaseName, databaseVersion, {
    upgrade(db) {
      db.createObjectStore('preferences')
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
