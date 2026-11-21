import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import {
  evaluateNight,
  type DiaryProblem,
  type DiaryTag,
  type LocalDate,
  type Metric,
  type MetricUnavailableReason,
  type NightWakesCount,
  type SleepDiaryEntry,
  type SleepQuality,
  type WasoEstimate,
  type WasoRange
} from '../domain/diary'
import { readDiaryEntries, writeDiaryEntry } from '../data/diary'
import { durationText, localToday } from '../format'

type WasoChoice = 'unknown' | 'none-remembered' | 'minutes' | WasoRange
type QualityChoice = '' | '1' | '2' | '3' | '4' | '5'

type DiaryFormState = {
  lightsOffTime: string
  sleepOnsetLatencyMinutes: string
  finalWakeTime: string
  outOfBedTime: string
  nightWakes: NightWakesCount
  wasoChoice: WasoChoice
  wasoMinutes: string
  sleepQuality: QualityChoice
  tags: DiaryTag[]
}

type Feedback = 'saved' | 'save-error' | 'invalid'

const emptyForm = (): DiaryFormState => ({
  lightsOffTime: '',
  sleepOnsetLatencyMinutes: '',
  finalWakeTime: '',
  outOfBedTime: '',
  nightWakes: 'unknown',
  wasoChoice: 'unknown',
  wasoMinutes: '',
  sleepQuality: '',
  tags: []
})

const diaryTags: DiaryTag[] = ['caffeine', 'alcohol', 'nap', 'exercise']
const recentEntryLimit = 7

const tagLabelKeys: Record<DiaryTag, string> = {
  caffeine: 'diaryTagCaffeine',
  alcohol: 'diaryTagAlcohol',
  nap: 'diaryTagNap',
  exercise: 'diaryTagExercise'
}

const wasoOptions: { value: WasoChoice; labelKey: string }[] = [
  { value: 'unknown', labelKey: 'diaryWasoUnknown' },
  { value: 'none-remembered', labelKey: 'diaryWasoNoneRemembered' },
  { value: 'under-15', labelKey: 'diaryWasoUnder15' },
  { value: '15-to-30', labelKey: 'diaryWaso15To30' },
  { value: '30-to-60', labelKey: 'diaryWaso30To60' },
  { value: 'over-60', labelKey: 'diaryWasoOver60' },
  { value: 'minutes', labelKey: 'diaryWasoExact' }
]

const nightWakesOptions: { value: NightWakesCount; labelKey: string }[] = [
  { value: 'unknown', labelKey: 'diaryNightWakesUnknown' },
  { value: 'none', labelKey: 'diaryNightWakesNone' },
  { value: 'one-to-two', labelKey: 'diaryNightWakesOneToTwo' },
  { value: 'three-to-five', labelKey: 'diaryNightWakesThreeToFive' },
  { value: 'six-plus', labelKey: 'diaryNightWakesSixPlus' }
]

const qualityOptions: { value: QualityChoice; labelKey: string }[] = [
  { value: '', labelKey: 'diaryQualityUnset' },
  { value: '1', labelKey: 'diaryQuality1' },
  { value: '2', labelKey: 'diaryQuality2' },
  { value: '3', labelKey: 'diaryQuality3' },
  { value: '4', labelKey: 'diaryQuality4' },
  { value: '5', labelKey: 'diaryQuality5' }
]

function formatDiaryDate(t: TFunction, date: LocalDate): string {
  const [, month, day] = date.split('-')
  return t('diaryDateShort', { month: Number(month), day: Number(day) })
}

function optionalNumber(value: string): number | undefined {
  const trimmed = value.trim()
  if (trimmed === '') return undefined
  const parsed = Number(trimmed)
  return Number.isNaN(parsed) ? undefined : parsed
}

// 返回 null 表示选择了“精确分钟”却没填数值；调用方必须阻止保存，不能悄悄改成未知。
function wasoFromForm(form: DiaryFormState): WasoEstimate | null {
  switch (form.wasoChoice) {
    case 'unknown':
      return { kind: 'unknown' }
    case 'none-remembered':
      return { kind: 'none-remembered' }
    case 'minutes': {
      const minutes = optionalNumber(form.wasoMinutes)
      return minutes === undefined ? null : { kind: 'minutes', minutes }
    }
    default:
      return { kind: 'range', range: form.wasoChoice }
  }
}

function findEntry(entries: SleepDiaryEntry[], date: LocalDate): SleepDiaryEntry | undefined {
  return entries.find((entry) => entry.date === date)
}

function formFromEntry(entry: SleepDiaryEntry | null): DiaryFormState {
  if (!entry) return emptyForm()

  return {
    lightsOffTime: entry.lightsOffTime ?? '',
    sleepOnsetLatencyMinutes: entry.sleepOnsetLatencyMinutes === undefined ? '' : String(entry.sleepOnsetLatencyMinutes),
    finalWakeTime: entry.finalWakeTime ?? '',
    outOfBedTime: entry.outOfBedTime ?? '',
    nightWakes: entry.nightWakes,
    wasoChoice: entry.waso.kind === 'range' ? entry.waso.range : entry.waso.kind,
    wasoMinutes: entry.waso.kind === 'minutes' ? String(entry.waso.minutes) : '',
    sleepQuality: entry.sleepQuality === undefined ? '' : (String(entry.sleepQuality) as QualityChoice),
    tags: [...entry.tags]
  }
}

function draftFromForm(date: LocalDate, form: DiaryFormState): SleepDiaryEntry {
  return {
    date,
    lightsOffTime: form.lightsOffTime || undefined,
    sleepOnsetLatencyMinutes: optionalNumber(form.sleepOnsetLatencyMinutes),
    finalWakeTime: form.finalWakeTime || undefined,
    outOfBedTime: form.outOfBedTime || undefined,
    nightWakes: form.nightWakes,
    waso: wasoFromForm(form) ?? { kind: 'unknown' },
    sleepQuality: form.sleepQuality === '' ? undefined : (Number(form.sleepQuality) as SleepQuality),
    tags: form.tags,
    recordedAt: '',
    updatedAt: ''
  }
}

function reasonText(t: TFunction, reason: MetricUnavailableReason): string {
  switch (reason) {
    case 'missing-input':
      return t('metricMissingInput')
    case 'approximate-input':
      return t('metricApproximateInput')
    case 'invalid-input':
      return t('metricInvalidInput')
  }
}

function problemText(t: TFunction, problem: DiaryProblem): string {
  switch (problem.kind) {
    case 'final-wake-after-out-of-bed':
      return t('diaryProblemFinalWakeAfterOutOfBed')
    case 'night-components-exceed-time-in-bed':
      return t('diaryProblemComponentsExceed', {
        timeInBed: durationText(t, problem.timeInBedMinutes),
        components: durationText(t, problem.componentMinutes)
      })
    case 'invalid-duration':
      return problem.field === 'waso' ? t('diaryProblemInvalidWaso') : t('diaryProblemInvalidLatency')
    case 'invalid-time':
      return t('diaryProblemInvalidTime')
    case 'lights-off-after-wake':
      return t('diaryProblemLightsOffAfterWake')
    case 'time-in-bed-not-positive':
      return t('diaryProblemEmptyTimeInBed')
  }
}

function MetricValue({ metric, format, compact = false }: { metric: Metric<number>; format: (value: number) => string; compact?: boolean }) {
  const { t } = useTranslation()

  if (metric.status === 'available') return <>{format(metric.value)}</>

  return (
    <>
      <span className="metric-unavailable">{t('metricUnavailable')}</span>
      {/* 一行摘要只报“数据不足”，具体原因留在第二屏的完整指标里。 */}
      {!compact && <span className="metric-reason">{reasonText(t, metric.reason)}</span>}
    </>
  )
}

export function DiaryPanel({ storageUnavailable, onSaved, reloadToken = 0 }: { storageUnavailable: boolean; onSaved?: () => void; reloadToken?: number }) {
  const { t } = useTranslation()
  const [initialDate] = useState(localToday)
  const [today, setToday] = useState(initialDate)
  const [selectedDate, setSelectedDate] = useState<LocalDate>(initialDate)
  const [form, setForm] = useState<DiaryFormState>(emptyForm)
  const [entries, setEntries] = useState<SleepDiaryEntry[]>([])
  const [fetchState, setFetchState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [feedbackSeq, setFeedbackSeq] = useState(0)
  const feedbackRef = useRef<HTMLDivElement>(null)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const lastReload = useRef(reloadToken)
  const loadState = storageUnavailable ? 'error' : fetchState

  /**
   * 初次挂载与导入后的重载共用同一条读取路径：读取日记、按指定日期预填表单。
   * 普通保存走本地状态更新，不调用这里，因此不会重置用户正在编辑的表单。
   */
  const loadEntries = useCallback((date: LocalDate, isActive: () => boolean) => {
    readDiaryEntries()
      .then((loaded) => {
        if (!isActive()) return
        setEntries(loaded)
        setForm(formFromEntry(findEntry(loaded, date) ?? null))
        setDirty(false)
        setFetchState('ready')
      })
      .catch(() => {
        if (isActive()) setFetchState('error')
      })
  }, [])

  useEffect(() => {
    if (storageUnavailable) return

    let active = true
    // 只按首次进入应用时的日期预填一次，后续本地日期变化由 syncLocalDate 处理。
    loadEntries(initialDate, () => active)
    return () => { active = false }
  }, [storageUnavailable, initialDate, loadEntries])

  // 导入备份后由外部递增 reloadToken，重新读取日记并把当前选中日期同步到新数据。
  useEffect(() => {
    if (lastReload.current === reloadToken) return
    lastReload.current = reloadToken
    if (storageUnavailable) return

    let active = true
    loadEntries(selectedDate, () => active)
    return () => { active = false }
  }, [reloadToken, storageUnavailable, selectedDate, loadEntries])

  useEffect(() => {
    function syncLocalDate() {
      const current = localToday()
      if (current === today) return
      setToday(current)
      // 用户停留在“今天”且没有未保存修改时，跟随本地日期进入新的一夜。
      if (selectedDate === today && !dirty) {
        setSelectedDate(current)
        setForm(formFromEntry(findEntry(entries, current) ?? null))
        setFeedback(null)
      }
    }

    document.addEventListener('visibilitychange', syncLocalDate)
    window.addEventListener('focus', syncLocalDate)
    return () => {
      document.removeEventListener('visibilitychange', syncLocalDate)
      window.removeEventListener('focus', syncLocalDate)
    }
  }, [today, selectedDate, dirty, entries])

  /**
   * 提交结果渲染在第一屏底部，而固定保存栏在第二屏也能点到：提交后把提示滚进视口，
   * 保证「已保存」「请先修正」「保存失败」都不会落在视口外。序号让重复提交同一结果也能再次滚动。
   */
  useEffect(() => {
    if (feedbackSeq === 0) return
    feedbackRef.current?.scrollIntoView({ block: 'center', behavior: 'instant' })
  }, [feedbackSeq])

  const savedEntry = findEntry(entries, selectedDate)
  const draft = draftFromForm(selectedDate, form)
  const assessment = evaluateNight(draft)
  const problems = assessment.problems
  const wasoMinutesMissing = wasoFromForm(form) === null
  const futureDate = selectedDate > today
  const blocked = problems.length > 0 || wasoMinutesMissing || futureDate

  function update(changes: Partial<DiaryFormState>) {
    setForm((current) => ({ ...current, ...changes }))
    setDirty(true)
    setFeedback(null)
  }

  function chooseDate(date: LocalDate) {
    if (!date) return
    setSelectedDate(date)
    setForm(formFromEntry(findEntry(entries, date) ?? null))
    setDirty(false)
    setFeedback(null)
  }

  function toggleTag(tag: DiaryTag) {
    update({ tags: form.tags.includes(tag) ? form.tags.filter((item) => item !== tag) : [...form.tags, tag] })
  }

  /** 提交结果统一走这里：更新播报文案并触发一次滚动序号。 */
  function announce(next: Feedback) {
    setFeedback(next)
    setFeedbackSeq((seq) => seq + 1)
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (blocked) {
      announce('invalid')
      return
    }

    setSaving(true)
    const timestamp = new Date().toISOString()
    const entry: SleepDiaryEntry = {
      ...draft,
      recordedAt: savedEntry?.recordedAt ?? timestamp,
      updatedAt: timestamp
    }

    try {
      await writeDiaryEntry(entry)
    } catch {
      announce('save-error')
      return
    } finally {
      setSaving(false)
    }

    // 写入已成功：本地状态据此更新，不再依赖第二次读取是否成功。
    setEntries((current) => [
      ...current.filter((item) => item.date !== entry.date),
      entry
    ].sort((left, right) => right.date.localeCompare(left.date)))
    setForm(formFromEntry(entry))
    setDirty(false)
    announce('saved')
    onSaved?.()
  }

  return (
    <section className="diary-panel" aria-labelledby="diary-title">
      <div className="diary-head">
        <p className="panel-kicker">{t('diaryKicker')}</p>
        <h2 id="diary-title">{t('diaryTitle')}</h2>
        <p className="diary-intro">{t('diaryIntro')}</p>
      </div>

      {loadState === 'loading' && <p role="status">{t('diaryLoading')}</p>}
      {loadState === 'error' && (
        <p className="diary-alert" role="alert">
          {storageUnavailable ? t('diaryStorageUnavailable') : t('diaryLoadError')}
        </p>
      )}

      {loadState === 'ready' && (
        <>
          <form className="diary-form" onSubmit={(event) => void save(event)}>
            {/* 第一屏：日期、四项核心输入、一行指标摘要与保存按钮。 */}
            <div className="diary-first">
              <div className="diary-date-row">
                <label className="field-label" htmlFor="diary-date">{t('diaryDateLabel')}</label>
                <input
                  id="diary-date"
                  type="date"
                  value={selectedDate}
                  max={today}
                  onChange={(event) => chooseDate(event.target.value)}
                />
              </div>

              <div className="diary-grid diary-grid-core">
                <div className="diary-field">
                  <label className="field-label" htmlFor="lights-off">{t('diaryLightsOffLabel')}</label>
                  <input
                    id="lights-off"
                    type="time"
                    value={form.lightsOffTime}
                    onChange={(event) => update({ lightsOffTime: event.target.value })}
                  />
                </div>
                <div className="diary-field">
                  <label className="field-label" htmlFor="sleep-onset">{t('diaryLatencyLabel')}</label>
                  <input
                    id="sleep-onset"
                    type="number"
                    min="0"
                    max="720"
                    step="1"
                    inputMode="numeric"
                    value={form.sleepOnsetLatencyMinutes}
                    onChange={(event) => update({ sleepOnsetLatencyMinutes: event.target.value })}
                  />
                  <p className="field-hint">{t('diaryLatencyHint')}</p>
                </div>
                <div className="diary-field">
                  <label className="field-label" htmlFor="final-wake">{t('diaryFinalWakeLabel')}</label>
                  <input
                    id="final-wake"
                    type="time"
                    value={form.finalWakeTime}
                    onChange={(event) => update({ finalWakeTime: event.target.value })}
                  />
                </div>
                <div className="diary-field">
                  <label className="field-label" htmlFor="out-of-bed">{t('diaryOutOfBedLabel')}</label>
                  <input
                    id="out-of-bed"
                    type="time"
                    value={form.outOfBedTime}
                    onChange={(event) => update({ outOfBedTime: event.target.value })}
                  />
                </div>
              </div>

              <div className="diary-summary" role="group" aria-label={t('diarySummaryLabel')}>
                <dl className="diary-summary-list">
                  <div className="diary-summary-item">
                    <dt>{t('metricTibShort')}</dt>
                    <dd><MetricValue metric={assessment.timeInBed} compact format={(value) => durationText(t, value)} /></dd>
                  </div>
                  <div className="diary-summary-item">
                    <dt>{t('metricTstShort')}</dt>
                    <dd><MetricValue metric={assessment.totalSleep} compact format={(value) => durationText(t, value)} /></dd>
                  </div>
                  <div className="diary-summary-item">
                    <dt>{t('metricSeShort')}</dt>
                    <dd><MetricValue metric={assessment.sleepEfficiency} compact format={(value) => t('metricPercent', { value })} /></dd>
                  </div>
                </dl>
              </div>

              {(blocked || feedback !== null) && (
                <div className="diary-feedback" ref={feedbackRef}>
                  {blocked && (
                    <div className="diary-alert" role="alert">
                      <p>{t('diaryProblemsTitle')}</p>
                      <ul>
                        {problems.map((problem, index) => (
                          <li key={`${problem.kind}-${index}`}>{problemText(t, problem)}</li>
                        ))}
                        {wasoMinutesMissing && <li>{t('diaryProblemWasoMinutesMissing')}</li>}
                        {futureDate && <li>{t('diaryProblemFutureDate')}</li>}
                      </ul>
                    </div>
                  )}

                  {feedback === 'invalid' && <p className="diary-status is-warning" role="status">{t('diaryFixBeforeSave')}</p>}
                  {feedback === 'saved' && <p className="diary-status" role="status">{t('diarySaved')}</p>}
                  {feedback === 'save-error' && <p className="diary-alert" role="alert">{t('diarySaveError')}</p>}
                </div>
              )}
            </div>

            {/* 第二屏：可选字段、完整指标与最近记录。 */}
            <div className="diary-second">
              <h3 className="diary-second-title">{t('diaryMoreTitle')}</h3>

              <div className="diary-grid diary-grid-extra">
                <div className="diary-field">
                  <label className="field-label" htmlFor="night-wakes">{t('diaryNightWakesLabel')}</label>
                  <select
                    id="night-wakes"
                    value={form.nightWakes}
                    onChange={(event) => update({ nightWakes: event.target.value as NightWakesCount })}
                  >
                    {nightWakesOptions.map((option) => (
                      <option key={option.value} value={option.value}>{t(option.labelKey)}</option>
                    ))}
                  </select>
                </div>
                <div className="diary-field">
                  <label className="field-label" htmlFor="waso">{t('diaryWasoLabel')}</label>
                  <select
                    id="waso"
                    value={form.wasoChoice}
                    onChange={(event) => update({ wasoChoice: event.target.value as WasoChoice })}
                  >
                    {wasoOptions.map((option) => (
                      <option key={option.value} value={option.value}>{t(option.labelKey)}</option>
                    ))}
                  </select>
                  {form.wasoChoice === 'minutes' && (
                    <input
                      id="waso-minutes"
                      className="diary-inline-input"
                      type="number"
                      min="0"
                      max="720"
                      step="1"
                      inputMode="numeric"
                      aria-label={t('diaryWasoMinutesLabel')}
                      value={form.wasoMinutes}
                      onChange={(event) => update({ wasoMinutes: event.target.value })}
                    />
                  )}
                </div>
              </div>

              <fieldset className="diary-fieldset">
                <legend className="field-label">{t('diaryQualityLabel')}</legend>
                <p className="field-hint">{t('diaryQualityHint')}</p>
                <div className="choice-row choice-row-wide">
                  {qualityOptions.map((option) => (
                    <label key={option.value || 'unset'}>
                      <input
                        type="radio"
                        name="diary-quality"
                        checked={form.sleepQuality === option.value}
                        onChange={() => update({ sleepQuality: option.value })}
                      />
                      {t(option.labelKey)}
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset className="diary-fieldset">
                <legend className="field-label">{t('diaryTagsLabel')}</legend>
                <div className="tag-row">
                  {diaryTags.map((tag) => (
                    <label key={tag} className="tag-choice">
                      <input type="checkbox" checked={form.tags.includes(tag)} onChange={() => toggleTag(tag)} />
                      {t(tagLabelKeys[tag])}
                    </label>
                  ))}
                </div>
              </fieldset>

              <section className="diary-metrics" aria-labelledby="diary-metrics-title">
                <h3 id="diary-metrics-title">{t('diaryMetricsTitle')}</h3>
                <dl className="metric-grid">
                  <div className="metric-cell">
                    <dt>{t('metricTib')}</dt>
                    <dd><MetricValue metric={assessment.timeInBed} format={(value) => durationText(t, value)} /></dd>
                  </div>
                  <div className="metric-cell">
                    <dt>{t('metricTerminalAwake')}</dt>
                    <dd><MetricValue metric={assessment.terminalAwake} format={(value) => durationText(t, value)} /></dd>
                  </div>
                  <div className="metric-cell">
                    <dt>{t('metricTst')}</dt>
                    <dd><MetricValue metric={assessment.totalSleep} format={(value) => durationText(t, value)} /></dd>
                  </div>
                  <div className="metric-cell">
                    <dt>{t('metricSe')}</dt>
                    <dd><MetricValue metric={assessment.sleepEfficiency} format={(value) => t('metricPercent', { value })} /></dd>
                  </div>
                </dl>
                <p className="field-hint">{t('diaryMetricsNote')}</p>
              </section>
            </div>

            {/* 保存栏固定在底栏上方：滚动到任何位置都能直接保存。 */}
            <div className="diary-savebar">
              <div className="diary-savebar-inner">
                <button type="submit" className="primary-button" disabled={saving}>
                  {saving ? t('diarySaving') : savedEntry ? t('diaryUpdate') : t('diarySave')}
                </button>
              </div>
            </div>
          </form>

          <section className="diary-history" aria-labelledby="diary-history-title">
            <h3 id="diary-history-title">{t('diaryHistoryTitle')}</h3>
            {entries.length === 0 ? (
              <p className="field-hint">{t('diaryEmpty')}</p>
            ) : (
              <ul>
                {entries.slice(0, recentEntryLimit).map((entry) => {
                  const entryAssessment = evaluateNight(entry)
                  return (
                    <li key={entry.date}>
                      <button
                        type="button"
                        className={`history-entry ${entry.date === selectedDate ? 'is-current' : ''}`}
                        aria-current={entry.date === selectedDate ? 'date' : undefined}
                        onClick={() => chooseDate(entry.date)}
                      >
                        <span className="history-date">{formatDiaryDate(t, entry.date)}</span>
                        <span aria-hidden="true">·</span>
                        <span className={`history-status ${entryAssessment.complete ? 'is-complete' : ''}`}>
                          {entryAssessment.complete ? t('diaryComplete') : t('diaryPartial')}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="history-metric">
                          {entryAssessment.sleepEfficiency.status === 'available'
                            ? `${t('metricSe')} ${t('metricPercent', { value: entryAssessment.sleepEfficiency.value })}`
                            : t('metricUnavailable')}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </section>
  )
}
