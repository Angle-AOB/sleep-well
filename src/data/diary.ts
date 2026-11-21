import type { SleepDiaryEntry } from '../domain/diary'
import { openDatabase } from './database'
import { recordError } from './errorLog'

// 每夜一条日记，本地日期即日记身份；导入去重也以此为准。
export async function readDiaryEntries(): Promise<SleepDiaryEntry[]> {
  const database = await openDatabase()
  try {
    const entries = await database.getAll('diary')
    return entries.sort((left, right) => right.date.localeCompare(left.date))
  } finally {
    database.close()
  }
}

export async function writeDiaryEntry(entry: SleepDiaryEntry): Promise<void> {
  const database = await openDatabase()
  try {
    await database.put('diary', entry, entry.date)
  } catch (error) {
    // 写入失败只记录类别与操作，不带日记字段。
    recordError('storage-write-failed', { operation: 'storage-write' })
    throw error
  } finally {
    database.close()
  }
}
