import type { DBSchema, IDBPDatabase } from 'idb'
import { openDB } from 'idb'
import type { CourseState } from '../domain/course'
import type { SleepDiaryEntry } from '../domain/diary'
import type { ScreeningRecord } from '../domain/screening'
import type { Preferences } from './preferences'

export interface SleepWellDatabase extends DBSchema {
  preferences: {
    key: 'current'
    value: Preferences
  }
  screening: {
    key: 'current'
    value: ScreeningRecord
  }
  course: {
    key: 'current'
    value: CourseState
  }
  diary: {
    key: string
    value: SleepDiaryEntry
  }
}

const databaseName = 'sleep-well'
const databaseVersion = 4

export function openDatabase(): Promise<IDBPDatabase<SleepWellDatabase>> {
  return openDB<SleepWellDatabase>(databaseName, databaseVersion, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('preferences')) db.createObjectStore('preferences')
      if (!db.objectStoreNames.contains('screening')) db.createObjectStore('screening')
      if (!db.objectStoreNames.contains('course')) db.createObjectStore('course')
      if (!db.objectStoreNames.contains('diary')) db.createObjectStore('diary')
    }
  })
}
