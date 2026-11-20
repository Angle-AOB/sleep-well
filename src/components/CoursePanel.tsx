import { useEffect, useState } from 'react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import {
  assessCourse,
  isClockTime,
  medianOutOfBedTime,
  MINIMUM_COMPLETE_NIGHTS,
  startCourse,
  withWakeTime,
  withWorkPattern,
  type CourseProgress,
  type CourseState,
  type CourseWeek,
  type WindowView,
  type WorkPattern
} from '../domain/course'
import type { SleepDiaryEntry } from '../domain/diary'
import type { ScreeningRecord } from '../domain/screening'
import { readCourse, writeCourse } from '../data/course'
import { readDiaryEntries } from '../data/diary'
import { durationText, localToday } from '../format'

type CoursePanelProps = {
  storageUnavailable: boolean
  screening: ScreeningRecord | null
  /** 日记保存后递增，用来重新推导周次与候选窗口。 */
  diaryRevision: number
  /** 旧版本偏好中的期望起床时间，仅作预填，不直接生效。 */
  initialWakeTime?: string
}

type WeekContent = { title: string; body: string; note?: string; tasks: string[] }

const weeks: CourseWeek[] = [1, 2, 3, 4, 5, 6]

const weekContent: Record<CourseWeek, WeekContent> = {
  1: {
    title: 'week1Title',
    body: 'week1Body',
    tasks: ['week1Task1', 'week1Task2', 'week1Task3']
  },
  2: {
    title: 'week2Title',
    body: 'week2Body',
    tasks: ['week2Task1', 'week2Task2', 'week2Task3']
  },
  3: {
    title: 'week3Title',
    body: 'week3Body',
    tasks: ['week3Task1', 'week3Task2', 'week3Task3']
  },
  4: {
    title: 'week4Title',
    body: 'week4Body',
    note: 'week4Cognition',
    tasks: ['week4Task1', 'week4Task2', 'week4Task3']
  },
  5: {
    title: 'week5Title',
    body: 'week5Body',
    note: 'week5Cognition',
    tasks: ['week5Task1', 'week5Task2', 'week5Task3']
  },
  6: {
    title: 'week6Title',
    body: 'week6Body',
    tasks: ['week6Task1', 'week6Task2', 'week6Task3']
  }
}

function weekStatus(week: CourseWeek, currentWeek: CourseWeek, completed: boolean): 'done' | 'current' | 'locked' {
  if (completed) return 'done'
  if (week < currentWeek) return 'done'
  if (week === currentWeek) return 'current'
  return 'locked'
}

function windowUnavailableBody(
  t: TFunction,
  view: Extract<WindowView, { status: 'unavailable' }>,
  hasScreening: boolean
): string {
  switch (view.reason) {
    case 'baseline-in-progress':
      return t('windowBaseline')
    case 'insufficient-data':
      return t('windowDataInsufficient')
    case 'screening-paused':
      return hasScreening ? t('windowScreeningPaused') : t('windowScreeningPending')
    case 'shift-work-paused':
      return t('windowShiftPaused')
    case 'window-over-ten-hours':
      return t('windowOverTenHours', { duration: durationText(t, view.proposedMinutes ?? 0) })
    case 'wake-time-not-set':
      return t('windowNeedsWakeTime')
    case 'course-not-started':
      return t('courseNotStarted')
  }
}

export function CoursePanel({ storageUnavailable, screening, diaryRevision, initialWakeTime }: CoursePanelProps) {
  const { t } = useTranslation()
  const [today] = useState(localToday)
  const [course, setCourse] = useState<CourseState | null>(null)
  const [entries, setEntries] = useState<SleepDiaryEntry[]>([])
  const [fetchState, setFetchState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [wakeTimeInput, setWakeTimeInput] = useState('07:00')
  const [pattern, setPattern] = useState<WorkPattern>('regular')
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<'saved' | 'error' | null>(null)
  const [selectedWeek, setSelectedWeek] = useState<CourseWeek | null>(null)
  const loadState = storageUnavailable ? 'error' : fetchState

  useEffect(() => {
    if (storageUnavailable) return

    let active = true
    Promise.all([readCourse(), readDiaryEntries()])
      .then(([saved, diary]) => {
        if (!active) return
        setCourse(saved)
        setEntries(diary)
        setPattern(saved?.workPattern ?? 'regular')
        setWakeTimeInput(
          saved?.wakeTimes[saved.wakeTimes.length - 1]?.time
            ?? medianOutOfBedTime(diary, today)
            ?? initialWakeTime
            ?? '07:00'
        )
        setFetchState('ready')
      })
      .catch(() => {
        if (active) setFetchState('error')
      })
    return () => { active = false }
  }, [storageUnavailable, diaryRevision, today, initialWakeTime])

  const assessment = assessCourse({
    state: course,
    entries,
    screening: screening ? screening.result : null,
    today
  })

  async function persist(next: CourseState, onFailure?: () => void) {
    setBusy(true)
    setFeedback(null)
    try {
      await writeCourse(next)
      setCourse(next)
      setFeedback('saved')
    } catch {
      onFailure?.()
      setFeedback('error')
    } finally {
      setBusy(false)
    }
  }

  async function begin() {
    const next = startCourse(today, pattern)
    if (next) await persist(next)
  }

  async function changePattern(next: WorkPattern) {
    setPattern(next)
    if (!course) return
    await persist(withWorkPattern(course, next), () => setPattern(course.workPattern))
  }

  async function confirmWakeTime() {
    if (!course || !isClockTime(wakeTimeInput)) return
    await persist(withWakeTime(course, wakeTimeInput, today))
  }

  const heading = (
    <div className="panel-heading">
      <div><p className="panel-kicker">{t('courseKicker')}</p><h2 id="course-title">{t('courseTitle')}</h2></div>
      <span className="panel-symbol" aria-hidden="true">⑥</span>
    </div>
  )

  const patternField = (
    <>
      <fieldset className="pattern-fieldset">
        <legend className="field-label">{t('workPatternLegend')}</legend>
        {(['regular', 'shift-work'] as const).map((value) => (
          <label key={value} className="pattern-choice">
            <input
              type="radio"
              name="work-pattern"
              checked={pattern === value}
              onChange={() => void changePattern(value)}
              disabled={busy || storageUnavailable}
            />
            {value === 'regular' ? t('workPatternRegular') : t('workPatternShift')}
          </label>
        ))}
      </fieldset>
      <p className="field-hint">{t('workPatternHint')}</p>
    </>
  )

  if (loadState === 'loading') {
    return (
      <section className="course-panel" aria-labelledby="course-title">
        {heading}
        <p className="course-intro">{t('courseIntro')}</p>
        <p className="course-card-copy" role="status">{t('courseLoading')}</p>
      </section>
    )
  }

  if (loadState === 'error') {
    return (
      <section className="course-panel" aria-labelledby="course-title">
        {heading}
        <p className="diary-alert" role="alert">
          {storageUnavailable ? t('courseStorageUnavailable') : t('courseLoadError')}
        </p>
      </section>
    )
  }

  if (!assessment.started || !assessment.progress) {
    return (
      <section className="course-panel" aria-labelledby="course-title">
        {heading}
        <p className="course-intro">{t('courseIntro')}</p>
        <p className="course-card-copy">{t('courseNotStarted')}</p>
        {patternField}
        <div className="course-actions">
          <button type="button" className="primary-button" onClick={() => void begin()} disabled={busy}>
            {busy ? t('courseStarting') : t('courseStart')}
          </button>
        </div>
        {feedback === 'error' && <p className="diary-alert" role="alert">{t('courseSaveError')}</p>}
      </section>
    )
  }

  const progress: CourseProgress = assessment.progress
  const currentWeek = progress.week
  const completed = progress.completed
  const shownWeek = (selectedWeek === null ? currentWeek : Math.min(selectedWeek, currentWeek)) as CourseWeek
  const content = weekContent[shownWeek]
  const windowView = assessment.window

  return (
    <section className="course-panel" aria-labelledby="course-title">
      {heading}
      <p className="course-intro">{t('courseIntro')}</p>

      <div className="week-track" role="group" aria-label={t('weekTrackLabel')}>
        {weeks.map((week) => {
          const status = weekStatus(week, currentWeek, completed)
          return (
            <button
              key={week}
              type="button"
              className={`week-step is-${status}`}
              onClick={() => setSelectedWeek(week)}
              disabled={status === 'locked'}
              aria-current={status === 'current' ? 'step' : undefined}
            >
              <span className="week-number">{String(week).padStart(2, '0')}</span>
              <span className="week-name">{t(`weekShort${week}`)}</span>
              <span className="week-state">
                {status === 'done' ? t('weekStatusDone') : status === 'current' ? t('weekStatusCurrent') : t('weekStatusLocked')}
              </span>
            </button>
          )
        })}
      </div>

      <div className="course-progress-row">
        <p className="course-progress">
          {completed
            ? t('courseMaintenance')
            : progress.baselineExtended
              ? t('courseBaselineDay', { day: progress.dayOfWeek })
              : t('courseWeekDay', { week: currentWeek, day: progress.dayOfWeek })}
        </p>
        <p className="course-complete-nights">
          {t('courseCompleteNights', { complete: assessment.recentCompleteNights, required: MINIMUM_COMPLETE_NIGHTS })}
        </p>
      </div>

      {progress.baselineExtended && <p className="course-note is-warning" role="status">{t('courseBaselineExtended')}</p>}
      {completed && <p className="course-note">{t('courseCompletedNote')}</p>}

      <div className="course-grid">
        <section className="course-content" aria-labelledby="week-content-title">
          <p className="panel-kicker">{t('weekContentKicker')}</p>
          <h3 id="week-content-title">{t(content.title)}</h3>
          <p>{t(content.body)}</p>
          {content.note && <p className="cognition-note">{t(content.note)}</p>}
          <h4>{t('weekTasksTitle')}</h4>
          <ul className="task-list">
            {content.tasks.map((key) => (
              <li key={key}><span aria-hidden="true">+</span>{t(key)}</li>
            ))}
          </ul>
        </section>

        <div className="course-side">
          <section className="course-card" aria-labelledby="wake-time-title">
            <h3 id="wake-time-title">{t('wakeTimeTitle')}</h3>
            <p className="course-card-copy">{t('wakeTimeIntro')}</p>
            <p className="wake-time-current">
              {assessment.wakeTime.effective
                ? t('wakeTimeCurrent', { time: assessment.wakeTime.effective })
                : t('wakeTimeNone')}
            </p>
            {assessment.wakeTime.pending && (
              <p className="course-note is-warning" role="status">
                {currentWeek === 1
                  ? t('wakeTimePendingBaseline', { time: assessment.wakeTime.pending.time })
                  : assessment.wakeTime.pending.effectiveWeek <= 6
                    ? t('wakeTimePending', {
                      time: assessment.wakeTime.pending.time,
                      week: assessment.wakeTime.pending.effectiveWeek
                    })
                    : t('wakeTimePendingLater', { time: assessment.wakeTime.pending.time })}
              </p>
            )}
            <div className="wake-time-row">
              <div className="wake-time-field">
                <label className="field-label" htmlFor="fixed-wake-time">{t('wakeTimeInputLabel')}</label>
                <input
                  id="fixed-wake-time"
                  type="time"
                  value={wakeTimeInput}
                  onChange={(event) => { setWakeTimeInput(event.target.value); setFeedback(null) }}
                  disabled={busy}
                />
              </div>
              <button
                type="button"
                className="primary-button"
                onClick={() => void confirmWakeTime()}
                disabled={busy || !isClockTime(wakeTimeInput)}
              >
                {assessment.wakeTime.effective ? t('wakeTimeUpdate') : t('wakeTimeConfirm')}
              </button>
            </div>
            {assessment.wakeTime.suggestion ? (
              <p className="field-hint">
                {t('wakeTimeSuggestion', { time: assessment.wakeTime.suggestion })}{' '}
                <button
                  type="button"
                  className="link-button"
                  onClick={() => setWakeTimeInput(assessment.wakeTime.suggestion!)}
                >
                  {t('wakeTimeUseSuggestion')}
                </button>
              </p>
            ) : (
              <p className="field-hint">{t('wakeTimeSuggestionNone')}</p>
            )}
            <p className="field-hint">{t('wakeTimeRule')}</p>
          </section>

          <section className="course-card window-card" aria-labelledby="window-title">
            <div className="window-heading">
              <h3 id="window-title">
                {windowView.status === 'available'
                  ? windowView.mode === 'preview' ? t('windowCandidateTitle') : t('windowActiveTitle')
                  : t('windowTitle')}
              </h3>
              {windowView.status === 'available' && (
                <span className={`window-badge ${windowView.mode === 'preview' ? 'is-preview' : 'is-active'}`}>
                  {windowView.mode === 'preview' ? t('windowPreviewBadge') : t('windowActiveBadge')}
                </span>
              )}
            </div>

            {windowView.status === 'unavailable' ? (
              <p className={`course-card-copy ${
                windowView.reason === 'insufficient-data' || windowView.reason === 'window-over-ten-hours'
                  ? 'is-warning'
                  : ''
              }`}>
                {windowUnavailableBody(t, windowView, screening !== null)}
              </p>
            ) : (
              <>
                <p className="window-range" aria-label={t('windowRangeLabel', { start: windowView.startTime, end: windowView.endTime })}>
                  <span>{windowView.startTime}</span>
                  <span aria-hidden="true">–</span>
                  <span>{windowView.endTime}</span>
                </p>
                <p className="window-duration">
                  {t('windowDuration', { duration: durationText(t, windowView.durationMinutes) })}
                </p>
                <p className="course-card-copy">
                  {t('windowBasis', {
                    nights: windowView.calibration.completeNights,
                    tst: durationText(t, windowView.calibration.averageTotalSleepMinutes),
                    tib: durationText(t, windowView.calibration.averageTimeInBedMinutes)
                  })}
                </p>
                <p className="course-card-copy">
                  {t('windowTarget', { target: durationText(t, windowView.calibration.targetMinutes) })}
                </p>
                {windowView.calibration.limitedBy === 'average-tib' && (
                  <p className="course-card-copy">
                    {t('windowLimitTib', { tib: durationText(t, windowView.calibration.averageTimeInBedMinutes) })}
                  </p>
                )}
                {windowView.calibration.limitedBy === 'floor' && (
                  <p className="course-card-copy">{t('windowLimitFloor')}</p>
                )}
                {windowView.heldover && (
                  <p className="course-note is-warning" role="status">
                    {t('windowHeldover', {
                      complete: windowView.latestCompleteNights,
                      required: MINIMUM_COMPLETE_NIGHTS
                    })}
                  </p>
                )}
                <p className="field-hint">
                  {windowView.mode === 'preview' ? t('windowPreviewNote') : t('windowActiveNote')}
                </p>
              </>
            )}
          </section>

          {assessment.caffeine && (
            <section className="course-card caffeine-card" aria-labelledby="caffeine-title">
              <h3 id="caffeine-title">{t('caffeineTitle')}</h3>
              <p className="caffeine-time">{t('caffeineCutoff', { time: assessment.caffeine.cutoff })}</p>
              <p className="field-hint">
                {assessment.caffeine.basis === 'window' ? t('caffeineNoteWindow') : t('caffeineNoteRecent')}
              </p>
            </section>
          )}

          <section className="course-card" aria-labelledby="work-pattern-title">
            <h3 id="work-pattern-title">{t('workPatternTitle')}</h3>
            {patternField}
          </section>
        </div>
      </div>

      {feedback === 'saved' && <p className="course-status" role="status">{t('courseSaved')}</p>}
      {feedback === 'error' && <p className="diary-alert" role="alert">{t('courseSaveError')}</p>}
    </section>
  )
}
