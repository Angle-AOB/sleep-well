import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  BASELINE_LENGTH_DAYS,
  CAFFEINE_CUTOFF_HOURS,
  DAYS_PER_WEEK,
  isClockTime,
  medianOutOfBedTime,
  MINIMUM_COMPLETE_NIGHTS,
  startCourse,
  TITRATION_NIGHTS,
  TITRATION_STEP_MINUTES,
  WINDOW_FLOOR_MINUTES,
  WINDOW_TARGET_SURPLUS_MINUTES,
  withTitrationDeferral,
  withWakeTime,
  withWorkPattern,
  type CourseProgress,
  type CourseState,
  type CourseWeek,
  type WorkPattern
} from '../domain/course'
import type { ScreeningRecord } from '../domain/screening'
import { screeningGate } from '../screeningGate'
import { writeCourse } from '../data/course'
import { durationText, efficiencyText, localToday } from '../format'
import { restrictionText, weekContent, weekTaskText, weeks, windowUnavailableBody } from '../courseText'
import { hashForSettingsSubPage } from '../routing'
import { titrationBody } from '../titrationText'
import { useCourseAssessment } from '../useCourseAssessment'

type CoursePanelProps = {
  storageUnavailable: boolean
  screening: ScreeningRecord | null
  /** 筛查读取状态；只有明确读到「没有记录」才拦截开始，读不到时不拦截。 */
  screeningState: 'loading' | 'ready' | 'error'
  /** 日记保存后递增，用来重新推导周次与候选窗口。 */
  diaryRevision: number
  /** 当前页是否可见；隐藏页不读取课程，切回时重新读取。 */
  visible: boolean
  /** 旧版本偏好中的期望起床时间，仅作预填，不直接生效。 */
  initialWakeTime?: string
}

function weekStatus(week: CourseWeek, currentWeek: CourseWeek, completed: boolean): 'done' | 'current' | 'locked' {
  if (completed) return 'done'
  if (week < currentWeek) return 'done'
  if (week === currentWeek) return 'current'
  return 'locked'
}

export function CoursePanel({
  storageUnavailable,
  screening,
  screeningState,
  diaryRevision,
  visible,
  initialWakeTime
}: CoursePanelProps) {
  const { t } = useTranslation()
  const [today] = useState(localToday)
  const { course, entries, assessment, loadState, setCourse } = useCourseAssessment({
    screening,
    diaryRevision,
    visible,
    storageUnavailable
  })
  // 「是否拦开始」只有 screeningGate 一个来源；加载中也不放行，避免读取窗口内绕过门禁。
  const gate = screeningGate(screeningState, screening)
  const [wakeTimeDraft, setWakeTimeDraft] = useState<string | null>(null)
  const [patternDraft, setPatternDraft] = useState<WorkPattern | null>(null)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<'saved' | 'error' | null>(null)
  const [selectedWeek, setSelectedWeek] = useState<CourseWeek | null>(null)
  const [showTitrationDetails, setShowTitrationDetails] = useState(false)

  // 输入初值由已保存的起床时间、近 7 夜中位数与旧偏好依次兜底；用户一编辑就改用草稿。
  const wakeTimeInput = wakeTimeDraft
    ?? course?.wakeTimes[course.wakeTimes.length - 1]?.time
    ?? medianOutOfBedTime(entries, today)
    ?? initialWakeTime
    ?? '07:00'
  const pattern = patternDraft ?? course?.workPattern ?? 'regular'

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
    setPatternDraft(next)
    if (!course) return
    await persist(withWorkPattern(course, next), () => setPatternDraft(course.workPattern))
  }

  async function confirmWakeTime() {
    if (!course || !isClockTime(wakeTimeInput)) return
    await persist(withWakeTime(course, wakeTimeInput, today))
  }

  async function deferTitration() {
    if (!course || !assessment.progress) return
    await persist(withTitrationDeferral(
      course,
      assessment.progress.week,
      entries,
      assessment.progress.weekStartsOn
    ))
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

  if (loadState === 'error' && !storageUnavailable) {
    return (
      <section className="course-panel" aria-labelledby="course-title">
        {heading}
        <p className="diary-alert" role="alert">{t('courseLoadError')}</p>
      </section>
    )
  }

  if (!assessment.started || !assessment.progress) {
    return (
      <section className="course-panel" aria-labelledby="course-title">
        {heading}
        <p className="course-intro">{t('courseIntro')}</p>
        {storageUnavailable
          ? <p className="diary-alert" role="alert">{t('courseStorageUnavailable')}</p>
          : <p className="course-card-copy">{t('courseNotStarted')}</p>}
        {gate === 'loading' && (
          <p className="course-note" role="status">{t('screeningGateLoading')}</p>
        )}
        {gate === 'unavailable' && (
          <p className="course-note is-warning" role="status">{t('screeningGateUnavailable')}</p>
        )}
        {gate === 'required' && (
          <div role="status">
            <p className="course-note is-warning">{t('screeningGateRequired')}</p>
            <a className="link-button" href={hashForSettingsSubPage('screening')}>{t('screeningGateAction')}</a>
          </div>
        )}
        {patternField}
        <div className="course-actions">
          <button
            type="button"
            className="primary-button"
            onClick={() => void begin()}
            disabled={busy || gate === 'required' || gate === 'loading'}
          >
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
  // 六周内容都可查看（含未开始的周）；训练动作始终按当前周执行。
  const shownWeek = (selectedWeek ?? currentWeek) as CourseWeek
  const content = weekContent[shownWeek]
  const windowView = assessment.window
  const windowWarning = windowView.status === 'unavailable'
    && (windowView.reason === 'insufficient-data' || windowView.reason === 'window-over-ten-hours')
  const adjustments = windowView.status === 'available' ? windowView.adjustments : []

  return (
    <section className="course-panel" aria-labelledby="course-title">
      {heading}
      <p className="course-intro">{t('courseIntro')}</p>

      {gate === 'required' && (
        <div role="status">
          <p className="course-note is-warning">{t('courseScreeningMissingHint')}</p>
          <a className="link-button" href={hashForSettingsSubPage('screening')}>{t('screeningGateAction')}</a>
        </div>
      )}

      <div className="week-track" role="group" aria-label={t('weekTrackLabel')}>
        {weeks.map((week) => {
          const status = weekStatus(week, currentWeek, completed)
          return (
            <button
              key={week}
              type="button"
              className={`week-step is-${status}${shownWeek === week ? ' is-viewed' : ''}`}
              onClick={() => setSelectedWeek(week)}
              aria-current={status === 'current' ? 'step' : undefined}
              aria-pressed={shownWeek === week}
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
          {t('courseCompleteNights', {
            complete: assessment.recentCompleteNights,
            nights: TITRATION_NIGHTS,
            required: MINIMUM_COMPLETE_NIGHTS
          })}
        </p>
      </div>

      {progress.baselineExtended && (
        <p className="course-note is-warning" role="status">
          {t('courseBaselineExtended', {
            days: BASELINE_LENGTH_DAYS,
            nights: TITRATION_NIGHTS,
            required: MINIMUM_COMPLETE_NIGHTS
          })}
        </p>
      )}
      {completed && <p className="course-note">{t('courseCompletedNote')}</p>}
      {shownWeek !== currentWeek && (
        <p className="course-note" role="status">
          {t('courseWeekPreview', { week: shownWeek, current: currentWeek })}
        </p>
      )}

      <div className="course-grid">
        <section className="course-content" aria-labelledby="week-content-title">
          <p className="panel-kicker">{t('weekContentKicker')}</p>
          <h3 id="week-content-title">{t(content.title)}</h3>
          <p>{t(content.body)}</p>
          {content.note && <p className="cognition-note">{t(content.note)}</p>}
          <h4>{t('weekTasksTitle')}</h4>
          <ul className="task-list">
            {weekTaskText(t, shownWeek).map((task, index) => (
              <li key={content.tasks[index]}><span aria-hidden="true">+</span>{task}</li>
            ))}
          </ul>
        </section>

        <div className="course-side">
          <section className="course-card" aria-labelledby="wake-time-title">
            <h3 id="wake-time-title">{t('wakeTimeTitle')}</h3>
            <p className="course-card-copy">{t('wakeTimeIntro', { days: DAYS_PER_WEEK })}</p>
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
                  onChange={(event) => { setWakeTimeDraft(event.target.value); setFeedback(null) }}
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
                {t('wakeTimeSuggestion', { time: assessment.wakeTime.suggestion, nights: TITRATION_NIGHTS })}{' '}
                <button
                  type="button"
                  className="link-button"
                  onClick={() => setWakeTimeDraft(assessment.wakeTime.suggestion!)}
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

            <p
              className={`restriction-status ${assessment.restriction === 'paused' ? 'is-paused' : ''}`}
              role="status"
            >
              {restrictionText(t, assessment.restriction, assessment.restrictionPausedBy)}
            </p>

            {windowView.status === 'unavailable' ? (
              <p className={`course-card-copy ${windowWarning ? 'is-warning' : ''}`}>
                {windowUnavailableBody(t, windowView, screening !== null, assessment.restriction)}
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
                  {t(
                    windowView.calibration.calibratedFromWeek === 1
                      ? 'windowBasisBaseline'
                      : 'windowBasisAnchor',
                    {
                      nights: windowView.calibration.completeNights,
                      tst: durationText(t, windowView.calibration.averageTotalSleepMinutes),
                      tib: durationText(t, windowView.calibration.averageTimeInBedMinutes)
                    }
                  )}
                </p>
                <p className="course-card-copy">
                  {t('windowTarget', {
                    surplus: WINDOW_TARGET_SURPLUS_MINUTES,
                    step: TITRATION_STEP_MINUTES,
                    target: durationText(t, windowView.calibration.targetMinutes)
                  })}
                </p>
                {windowView.calibration.limitedBy === 'average-tib' && (
                  <p className="course-card-copy">
                    {t('windowLimitTib', { tib: durationText(t, windowView.calibration.averageTimeInBedMinutes) })}
                  </p>
                )}
                {windowView.calibration.limitedBy === 'floor' && (
                  <p className="course-card-copy">
                    {t('windowLimitFloor', { floorHours: WINDOW_FLOOR_MINUTES / 60 })}
                  </p>
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
                <p className="field-hint">{t('windowNoManualEdit')}</p>
              </>
            )}
          </section>

          {assessment.titration.status !== 'not-applicable' && (
            <section className="course-card titration-card" aria-labelledby="titration-title">
              <h3 id="titration-title">{t('titrationTitle')}</h3>
              <p className="course-card-copy">
                {titrationBody(t, assessment.titration)}
              </p>
              {assessment.canDeferTitration && (
                <button
                  type="button"
                  className="link-button"
                  onClick={() => void deferTitration()}
                  disabled={busy}
                >
                  {t('titrationDefer')}
                </button>
              )}
              {assessment.titration.status === 'adjusted' && !assessment.canDeferTitration && !completed && (
                <p className="field-hint">{t('titrationDeferLocked')}</p>
              )}
              {adjustments.length > 0 && (
                <div className="titration-details">
                  <button
                    type="button"
                    className="link-button"
                    aria-expanded={showTitrationDetails}
                    aria-controls="titration-details-body"
                    onClick={() => setShowTitrationDetails((open) => !open)}
                  >
                    {showTitrationDetails ? t('titrationHideDetails') : t('titrationShowDetails')}
                  </button>
                  {/* 容器始终挂载：aria-controls 的引用在折叠时也必须有效，用 hidden 控制显隐。 */}
                  <div className="titration-details-body" id="titration-details-body" hidden={!showTitrationDetails}>
                    <h4>{t('windowAdjustmentsTitle')}</h4>
                    <ul>
                      {adjustments.map((adjustment) => (
                        <li key={adjustment.week}>
                          {t(
                            adjustment.rule === 'increase'
                              ? 'windowAdjustmentIncrease'
                              : 'windowAdjustmentDecrease',
                            {
                              week: adjustment.week,
                              nights: adjustment.basis.completeNights,
                              se: efficiencyText(adjustment.basis.averageSleepEfficiency),
                              from: durationText(t, adjustment.previousMinutes),
                              change: durationText(t, adjustment.changeMinutes),
                              to: durationText(t, adjustment.durationMinutes)
                            }
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </section>
          )}

          {assessment.caffeine && (
            <section className="course-card caffeine-card" aria-labelledby="caffeine-title">
              <h3 id="caffeine-title">{t('caffeineTitle')}</h3>
              <p className="caffeine-time">{t('caffeineCutoff', { time: assessment.caffeine.cutoff, hours: CAFFEINE_CUTOFF_HOURS })}</p>
              <p className="field-hint">
                {assessment.caffeine.basis === 'window'
                  ? t('caffeineNoteWindow', { hours: CAFFEINE_CUTOFF_HOURS })
                  : t('caffeineNoteRecent', { hours: CAFFEINE_CUTOFF_HOURS, nights: TITRATION_NIGHTS })}
              </p>
            </section>
          )}

          {currentWeek >= 3 && (
            <section className="course-card stimulus-card" aria-labelledby="stimulus-title">
              <h3 id="stimulus-title">{t('stimulusTitle')}</h3>
              <p className="course-card-copy">{t('stimulusIntro')}</p>
              <ol className="stimulus-rules">
                <li>{t('stimulusRule1')}</li>
                <li>{t('stimulusRule2')}</li>
                <li>{t('stimulusRule3')}</li>
              </ol>
              <p className="field-hint">{t('stimulusNote')}</p>
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
