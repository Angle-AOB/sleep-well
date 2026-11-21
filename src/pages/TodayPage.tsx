import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { assessCourse } from '../domain/course'
import { evaluateNight, type SleepDiaryEntry } from '../domain/diary'
import type { ScreeningRecord } from '../domain/screening'
import { readCourse } from '../data/course'
import { readDiaryEntries } from '../data/diary'
import { durationText, localToday, previousLocalDate } from '../format'
import { hashForPage, hashForSettingsSubPage } from '../routing'
import { weekContent, weekTaskText, windowUnavailableBody } from '../courseText'
import {
  offlineMessage,
  storageMessage,
  type OfflineStatus,
  type StorageState
} from '../statusText'

type TodayPageProps = {
  hidden: boolean
  offlineStatus: OfflineStatus
  storageState: StorageState
  pendingSaves: number
  screening: ScreeningRecord | null
  screeningState: 'loading' | 'ready' | 'error'
  storageUnavailable: boolean
  /** 日记保存后递增，让今夜的课程评估按最新记录重算。 */
  diaryRevision: number
  /** 到期提醒卡由应用决定是否出现，今日页只负责把它放在最后。 */
  reminder: ReactNode
  onRetryCache: () => void
}

/**
 * 今日页只回答「今天该做什么」：昨夜是否已记录、今夜窗口与咖啡因截止、本周任务。
 * 数据全部来自既有的领域评估：课程用 assessCourse，日记摘要用 evaluateNight。
 */
export function TodayPage({
  hidden,
  offlineStatus,
  storageState,
  pendingSaves,
  screening,
  screeningState,
  storageUnavailable,
  diaryRevision,
  reminder,
  onRetryCache
}: TodayPageProps) {
  const { t } = useTranslation()
  const [today] = useState(localToday)
  const [lastNight] = useState(() => previousLocalDate(today))
  const [course, setCourse] = useState<Awaited<ReturnType<typeof readCourse>>>(null)
  const [entries, setEntries] = useState<SleepDiaryEntry[]>([])
  const [fetchState, setFetchState] = useState<'loading' | 'ready' | 'error'>('loading')
  const loadState = storageUnavailable ? 'error' : fetchState

  useEffect(() => {
    // 页面保活时，课程可能在训练页被修改；每次回到今日都按最新状态重新读取。
    if (hidden || storageUnavailable) return

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
  }, [hidden, storageUnavailable, diaryRevision])

  const ready = loadState === 'ready' && screeningState === 'ready'
  const assessment = ready
    ? assessCourse({
      state: course,
      entries,
      screening: screening ? screening.result : null,
      today
    })
    : null
  const entry = entries.find((item) => item.date === lastNight)
  const night = entry ? evaluateNight(entry) : null
  const screenMissing = screeningState === 'ready' && screening === null

  const offlineProblem = offlineStatus === 'pending' || offlineStatus === 'error'
  const storageProblem = storageState === 'unsupported'
    || storageState === 'error'
    || storageState === 'migration-failed'
  const showStatus = offlineProblem || storageProblem

  const storageText = storageMessage(t, storageState, pendingSaves)

  function diarySummary() {
    if (loadState === 'loading') {
      return <p className="today-card-copy" role="status">{t('diaryLoading')}</p>
    }
    if (loadState === 'error') {
      return (
        <p className="diary-alert" role="alert">
          {storageUnavailable ? t('todayDiaryUnavailable') : t('todayDiaryLoadError')}
        </p>
      )
    }
    if (!night) return <p className="today-card-copy">{t('todayDiaryEmpty')}</p>
    if (night.complete && night.sleepEfficiency.status === 'available' && night.totalSleep.status === 'available') {
      return (
        <dl className="today-diary-metrics">
          <div>
            <dt>{t('metricSeShort')}</dt>
            <dd>{t('metricPercent', { value: night.sleepEfficiency.value })}</dd>
          </div>
          <div>
            <dt>{t('metricTstShort')}</dt>
            <dd>{durationText(t, night.totalSleep.value)}</dd>
          </div>
        </dl>
      )
    }
    return <p className="today-card-copy">{t('todayDiaryPartial')}</p>
  }

  function diaryAction(): string {
    if (loadState !== 'ready') return t('todayDiaryOpen')
    if (!night) return t('todayDiaryRecord')
    if (night.complete) return t('todayDiaryReview')
    return t('todayDiaryComplete')
  }

  function planBody() {
    if (loadState === 'loading' || screeningState === 'loading') {
      return <p className="today-card-copy" role="status">{t('courseLoading')}</p>
    }
    if (loadState === 'error' || screeningState === 'error' || !assessment) {
      return (
        <p className="diary-alert" role="alert">
          {t('todayCourseLoadError')}
        </p>
      )
    }

    if (assessment.window.status === 'available') {
      const windowView = assessment.window
      const caffeine = assessment.caffeine
      const week = assessment.progress?.week ?? 1
      return (
        <>
          <p
            className="today-plan-range"
            aria-label={t('todayPlanRangeLabel', { start: windowView.startTime, end: windowView.endTime })}
          >
            <span>{windowView.startTime}</span>
            <span aria-hidden="true">–</span>
            <span>{windowView.endTime}</span>
          </p>
          <p className="today-card-copy">
            {t('windowDuration', { duration: durationText(t, windowView.durationMinutes) })}
          </p>
          <dl className="today-plan-facts">
            <div>
              <dt>{t('wakeTimeTitle')}</dt>
              <dd>{assessment.wakeTime.effective ?? t('todayPlanWakeNone')}</dd>
            </div>
            <div>
              <dt>{t('caffeineTitle')}</dt>
              <dd>{caffeine ? caffeine.cutoff : week < 2 ? t('todayCaffeineLater') : t('todayCaffeineNone')}</dd>
            </div>
          </dl>
        </>
      )
    }

    return (
      <p className="today-card-copy">
        {windowUnavailableBody(t, assessment.window, screening !== null, assessment.restriction)}
      </p>
    )
  }

  function planFactsFallback() {
    if (!assessment || assessment.window.status === 'available') return null
    // 窗口不可用时仍然给出唯一确定的两项锚点；没有值就写“尚未确认/暂无”。
    return (
      <dl className="today-plan-facts">
        <div>
          <dt>{t('wakeTimeTitle')}</dt>
          <dd>{assessment?.wakeTime.effective ?? t('todayPlanWakeNone')}</dd>
        </div>
        <div>
          <dt>{t('caffeineTitle')}</dt>
          <dd>
            {assessment?.caffeine
              ? assessment.caffeine.cutoff
              : assessment && assessment.progress && assessment.progress.week >= 2
                ? t('todayCaffeineNone')
                : t('todayCaffeineLater')}
          </dd>
        </div>
      </dl>
    )
  }

  function weekBody() {
    if (screenMissing) {
      return <p className="today-card-copy">{t('todayScreeningBody')}</p>
    }
    if (loadState === 'loading' || screeningState === 'loading') {
      return <p className="today-card-copy" role="status">{t('courseLoading')}</p>
    }
    if (loadState === 'error' || screeningState === 'error' || !assessment) {
      return (
        <p className="diary-alert" role="alert">
          {t('todayCourseLoadError')}
        </p>
      )
    }
    if (!assessment.started || !assessment.progress) {
      return <p className="today-card-copy">{t('todayStartBody')}</p>
    }

    const tasks = weekTaskText(t, assessment.progress.week)
    return (
      <ul className="task-list">
        {tasks.map((task, index) => (
          <li key={`${assessment.progress?.week}-${index}`}><span aria-hidden="true">+</span>{task}</li>
        ))}
      </ul>
    )
  }

  const weekTarget = screenMissing
    ? hashForSettingsSubPage('screening')
    : hashForPage('training')
  const weekTitle = screenMissing
    ? t('todayScreeningTitle')
    : ready && assessment && assessment.started && assessment.progress
      ? t(weekContent[assessment.progress.week].title)
      : assessment && !assessment.started
        ? t('courseStart')
        : t('todayWeekRegion')
  const weekAction = screenMissing
    ? t('todayScreeningAction')
    : ready && assessment && assessment.started
      ? t('todayWeekAction')
      : t('todayStartAction')

  return (
    <section className="page today-page" hidden={hidden} aria-labelledby="page-title">
      {showStatus && (
        <section className="today-status" aria-labelledby="today-status-title">
          <h2 className="visually-hidden" id="today-status-title">{t('todayStatusLabel')}</h2>
          {offlineProblem && (
            <p className="today-status-item" role="status">
              <span>{offlineMessage(t, offlineStatus)}</span>
              <button type="button" className="status-retry" onClick={onRetryCache}>
                {t('offlineRetry')}
              </button>
            </p>
          )}
          {storageProblem && (
            <p className="today-status-item is-error" role="status">
              <span>{storageText}</span>
            </p>
          )}
        </section>
      )}

      <section className="today-card today-card-diary" aria-labelledby="today-diary-title">
        <a className="today-card-link" href={hashForPage('diary')}>
          <p className="panel-kicker">{t('todayDiaryKicker')}</p>
          <h2 id="today-diary-title">{t('todayDiaryTitle')}</h2>
          {diarySummary()}
          <span className="today-card-action">{diaryAction()}</span>
        </a>
      </section>

      <section className="today-card today-card-plan" aria-labelledby="today-plan-title">
        <a className="today-card-link" href={hashForPage('training')}>
          <p className="panel-kicker">{t('todayPlanKicker')}</p>
          <h2 id="today-plan-title">{t('todayPlanTitle')}</h2>
          {planBody()}
          {planFactsFallback()}
          {assessment?.progress?.completed && (
            <p className="today-plan-maintenance">{t('todayMaintenance')}</p>
          )}
          <span className="today-card-action">{t('todayPlanAction')}</span>
          <span className="visually-hidden">{t('todayPlanOpen')}</span>
        </a>
      </section>

      <section className="today-card today-card-week" aria-label={t('todayWeekRegion')}>
        <a className="today-card-link" href={weekTarget}>
          <p className="panel-kicker">{t('weekContentKicker')}</p>
          <h2>{weekTitle}</h2>
          {weekBody()}
          <span className="today-card-action">{weekAction}</span>
        </a>
      </section>

      {reminder}
    </section>
  )
}
