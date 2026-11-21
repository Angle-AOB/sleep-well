import { useCallback, useEffect, useState } from 'react'
import { assessCourse, type CourseState } from './domain/course'
import type { SleepDiaryEntry } from './domain/diary'
import type { ScreeningRecord } from './domain/screening'
import { readCourse } from './data/course'
import { readDiaryEntries } from './data/diary'
import { localToday } from './format'

type LoadState = 'loading' | 'ready' | 'error'

type UseCourseAssessmentOptions = {
  screening: ScreeningRecord | null
  /** 日记保存后递增，让课程评估按最新记录重算。 */
  diaryRevision: number
  /** 当前页是否可见；页面保活时只有可见页读取，切回时重新读取。 */
  visible: boolean
  storageUnavailable: boolean
}

/**
 * 训练页与今日页共用的课程评估数据。
 * 两页都常驻挂载：只有当前可见页读取课程与日记，隐藏页不抢先读；
 * 从隐藏变可见时重读，训练页保存后切回今日即可看到新状态。
 */
export function useCourseAssessment({
  screening,
  diaryRevision,
  visible,
  storageUnavailable
}: UseCourseAssessmentOptions) {
  const [today] = useState(localToday)
  const [course, setCourse] = useState<CourseState | null>(null)
  const [entries, setEntries] = useState<SleepDiaryEntry[]>([])
  const [fetchState, setFetchState] = useState<LoadState>('loading')
  const [reloadToken, setReloadToken] = useState(0)
  const loadState: LoadState = storageUnavailable ? 'error' : fetchState

  useEffect(() => {
    if (!visible || storageUnavailable) return

    let active = true
    Promise.all([readCourse(), readDiaryEntries()])
      .then(([saved, diary]) => {
        if (!active) return
        setCourse(saved)
        setEntries(diary)
        setFetchState('ready')
      })
      .catch(() => {
        if (active) setFetchState('error')
      })
    return () => { active = false }
  }, [visible, storageUnavailable, diaryRevision, reloadToken])

  const assessment = assessCourse({
    state: course,
    entries,
    screening: screening ? screening.result : null,
    today
  })

  const reload = useCallback(() => setReloadToken((token) => token + 1), [])

  return { course, entries, assessment, loadState, reload, setCourse }
}
