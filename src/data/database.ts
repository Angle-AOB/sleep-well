import type { DBSchema, IDBPDatabase, IDBPTransaction } from 'idb'
import { openDB } from 'idb'
import type { CourseState } from '../domain/course'
import type { SleepDiaryEntry } from '../domain/diary'
import type { ScreeningRecord } from '../domain/screening'
import { migrateDiaryEntry, migratePreferences } from './migration'
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
const databaseVersion = 5

/**
 * 在 versionchange 事务里把旧字段名/旧结构的记录改写为当前 schema。
 * 任何一条记录转换失败都抛出并 abort 事务，浏览器自动回滚到升级前状态。
 */
function migrateLegacyRecords(
  transaction: IDBPTransaction<SleepWellDatabase, ('preferences' | 'screening' | 'course' | 'diary')[], 'versionchange'>
): void {
  const diaryStore = transaction.objectStore('diary')
  diaryStore.getAll().then((entries) => {
    for (const entry of entries) {
      const migrated = migrateDiaryEntry(entry as unknown as Record<string, unknown>)
      diaryStore.put(migrated, migrated.date)
    }
    return transaction.objectStore('preferences').get('current')
  }).then((prefs) => {
    if (prefs) {
      const prefStore = transaction.objectStore('preferences')
      prefStore.put(migratePreferences(prefs as unknown as Record<string, unknown>), 'current')
    }
  }).catch(() => {
    try { transaction.abort() } catch { /* 已中止 */ }
  })
}

export function openDatabase(): Promise<IDBPDatabase<SleepWellDatabase>> {
  return openDB<SleepWellDatabase>(databaseName, databaseVersion, {
    upgrade(db, _oldVersion, _newVersion, transaction) {
      if (!db.objectStoreNames.contains('preferences')) db.createObjectStore('preferences')
      if (!db.objectStoreNames.contains('screening')) db.createObjectStore('screening')
      if (!db.objectStoreNames.contains('course')) db.createObjectStore('course')
      if (!db.objectStoreNames.contains('diary')) db.createObjectStore('diary')

      if (_oldVersion > 0 && _oldVersion < 5) {
        migrateLegacyRecords(transaction)
      }
    }
  })
}
