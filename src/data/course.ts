import type { CourseState } from '../domain/course'
import { openDatabase } from './database'

export async function readCourse(): Promise<CourseState | null> {
  const database = await openDatabase()
  try {
    return (await database.get('course', 'current')) ?? null
  } finally {
    database.close()
  }
}

export async function writeCourse(course: CourseState): Promise<void> {
  const database = await openDatabase()
  try {
    await database.put('course', course, 'current')
  } finally {
    database.close()
  }
}
