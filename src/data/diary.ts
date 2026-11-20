import type { SleepDiaryEntry } from '../domain/diary'
import { openDatabase } from './database'

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
  } finally {
    database.close()
  }
}
