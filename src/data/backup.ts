/**
 * 本地数据的备份快照与导入事务。
 *
 * 覆盖与新增都在单个 IndexedDB 事务里完成：覆盖先 clear 全部 store 再写入完整
 * 快照；新增只打开日记 store，按日期去重、冲突保留当前记录。任何一次写入失败
 * 都会 abort 整个事务，浏览器回滚到导入前的状态，不会留下半份迁移。
 *
 * 读取快照同样放在一个只读事务里，避免导出时读到彼此不一致的几份数据。
 */

import type { BackupData, BackupPayload } from '../domain/backup'
import { mergeDiaryEntries } from '../domain/backup'
import { openDatabase } from './database'
import { defaultPreferences } from './preferences'

export type ImportStrategy = 'overwrite' | 'append'

export type ImportResult = {
  strategy: ImportStrategy
  added: number
  skipped: number
}

const allStores = ['diary', 'course', 'preferences', 'screening'] as const

export async function readBackupData(): Promise<BackupData> {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(allStores, 'readonly')
    const [diary, course, preferences, screening] = await Promise.all([
      transaction.objectStore('diary').getAll(),
      transaction.objectStore('course').get('current'),
      transaction.objectStore('preferences').get('current'),
      transaction.objectStore('screening').get('current')
    ])
    await transaction.done

    return {
      diary: diary.sort((left, right) => left.date.localeCompare(right.date)),
      course: course ?? null,
      preferences: preferences ?? defaultPreferences,
      screening: screening ?? null
    }
  } finally {
    database.close()
  }
}

function abortQuietly(transaction: { abort: () => void }): void {
  try {
    transaction.abort()
  } catch {
    // 写入失败时事务可能已被浏览器自动中止，这里的 abort 只是兜底。
  }
}

async function overwriteAll(payload: BackupPayload): Promise<ImportResult> {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(allStores, 'readwrite')
    try {
      await Promise.all(allStores.map((store) => transaction.objectStore(store).clear()))

      for (const entry of payload.diary) {
        transaction.objectStore('diary').put(entry, entry.date)
      }
      if (payload.course) transaction.objectStore('course').put(payload.course, 'current')
      transaction.objectStore('preferences').put(payload.preferences, 'current')
      if (payload.screening) transaction.objectStore('screening').put(payload.screening, 'current')

      await transaction.done
      return { strategy: 'overwrite', added: payload.diary.length, skipped: 0 }
    } catch (error) {
      abortQuietly(transaction)
      throw error
    }
  } finally {
    database.close()
  }
}

async function appendDiary(payload: BackupPayload): Promise<ImportResult> {
  const database = await openDatabase()
  try {
    const transaction = database.transaction('diary', 'readwrite')
    try {
      const current = await transaction.store.getAll()
      const merged = mergeDiaryEntries(current, payload.diary)
      for (const entry of merged.addedEntries) {
        transaction.store.put(entry, entry.date)
      }
      await transaction.done
      return { strategy: 'append', added: merged.added, skipped: merged.skipped }
    } catch (error) {
      abortQuietly(transaction)
      throw error
    }
  } finally {
    database.close()
  }
}

export function applyBackupImport(payload: BackupPayload, strategy: ImportStrategy): Promise<ImportResult> {
  return strategy === 'overwrite' ? overwriteAll(payload) : appendDiary(payload)
}
