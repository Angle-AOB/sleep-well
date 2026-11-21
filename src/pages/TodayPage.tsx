import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { evaluateNight } from '../domain/diary'
import type { ScreeningRecord } from '../domain/screening'
import { durationText, localToday } from '../format'
import { hashForPage, hashForSettingsSubPage } from '../routing'
import { weekContent, weekTaskText, windowUnavailableBody } from '../courseText'
import { useCourseAssessment } from '../useCourseAssessment'
import {
  offlineMessage,
  storageMessage,
  type OfflineStatus,
  type StorageState
} from '../statusText'

type TodayPageProps = {
  visible: boolean
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
  visible,
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
  const { entries, assessment: courseAssessment, loadState } = useCourseAssessment({
    screening,
    diaryRevision,
    visible,
    storageUnavailable
  })

  const ready = loadState === 'ready' && screeningState === 'ready'
  const assessment = ready ? courseAssessment : null
  // 今日卡与日记表单使用同一个默认日期：表单保存后，今日卡立即能读到同一天。
  const entry = entries.find((item) => item.date === today)
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

    if (assessment.window.status !== 'available') {
      return (
        <p className="today-card-copy">
          {windowUnavailableBody(t, assessment.window, screening !== null, assessment.restriction)}
        </p>
      )
    }

    const windowView = assessment.window
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
      </>
    )
  }

  /** 窗口可用与否都展示同一组锚点；没有值就写“尚未确认/暂无”，条件只在这里判断一次。 */
  function planFacts() {
    if (!assessment) return null
    const week = assessment.progress?.week ?? 1
    const facts = [
      { label: t('wakeTimeTitle'), value: assessment.wakeTime.effective ?? t('todayPlanWakeNone') },
      {
        label: t('caffeineTitle'),
        value: assessment.caffeine
          ? assessment.caffeine.cutoff
          : week >= 2 ? t('todayCaffeineNone') : t('todayCaffeineLater')
      }
    ]
    return (
      <dl className="today-plan-facts">
        {facts.map((fact) => (
          <div key={fact.label}>
            <dt>{fact.label}</dt>
            <dd>{fact.value}</dd>
          </div>
        ))}
      </dl>
    )
  }

  const progress = assessment?.started ? assessment.progress : null
  const content = progress ? weekContent[progress.week] : null
  const showStartCard = ready && assessment !== null && !assessment.started && !screenMissing
  const showWeekCard = !showStartCard

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
    if (!progress || !content) return null

    const tasks = weekTaskText(t, progress.week)
    return (
      <ul className="task-list">
        {tasks.map((task, index) => (
          <li key={`${progress.week}-${index}`}><span aria-hidden="true">+</span>{task}</li>
        ))}
      </ul>
    )
  }

  const weekTarget = screenMissing
    ? hashForSettingsSubPage('screening')
    : hashForPage('training')
  // 标题与动作都从同一个 progress/weekContent 结果派生，不再重复判断 started。
  const weekTitle = screenMissing
    ? t('todayScreeningTitle')
    : content ? t(content.title) : t('todayWeekRegion')
  const weekAction = screenMissing
    ? t('todayScreeningAction')
    : content ? t('todayWeekAction') : t('todayStartAction')

  return (
    <section className="page today-page" hidden={!visible} aria-labelledby="page-title">
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

      {showStartCard && (
        <section className="today-card today-card-week" aria-label={t('courseStart')}>
          <a className="today-card-link" href={hashForPage('training')}>
            <p className="panel-kicker">{t('courseKicker')}</p>
            <h2>{t('courseStart')}</h2>
            <p className="today-card-copy">{t('todayStartBody')}</p>
            <span className="today-card-action">{t('todayStartAction')}</span>
          </a>
        </section>
      )}

      <section className="today-card today-card-plan" aria-labelledby="today-plan-title">
        <a className="today-card-link" href={hashForPage('training')}>
          <p className="panel-kicker">{t('todayPlanKicker')}</p>
          <h2 id="today-plan-title">{t('todayPlanTitle')}</h2>
          {planBody()}
          {planFacts()}
          {assessment?.progress?.completed && (
            <p className="today-plan-maintenance">{t('todayMaintenance')}</p>
          )}
          <span className="today-card-action">{t('todayPlanAction')}</span>
          <span className="visually-hidden">{t('todayPlanOpen')}</span>
        </a>
      </section>

      {showWeekCard && (
        <section className="today-card today-card-week" aria-label={t('todayWeekRegion')}>
          <a className="today-card-link" href={weekTarget}>
            <p className="panel-kicker">{t('weekContentKicker')}</p>
            <h2>{weekTitle}</h2>
            {weekBody()}
            <span className="today-card-action">{weekAction}</span>
          </a>
        </section>
      )}

      {reminder}
    </section>
  )
}
