import { useEffect, useState } from 'react'
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

function localToday(): LocalDate {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

function formatDiaryDate(date: LocalDate): string {
  const [, month, day] = date.split('-')
  return `${Number(month)} 月 ${Number(day)} 日`
}

function optionalNumber(value: string): number | undefined {
  const trimmed = value.trim()
  if (trimmed === '') return undefined
  const parsed = Number(trimmed)
  return Number.isNaN(parsed) ? undefined : parsed
}

function wasoFromForm(form: DiaryFormState): WasoEstimate {
  switch (form.wasoChoice) {
    case 'unknown':
      return { kind: 'unknown' }
    case 'none-remembered':
      return { kind: 'none-remembered' }
    case 'minutes': {
      const minutes = optionalNumber(form.wasoMinutes)
      return minutes === undefined ? { kind: 'unknown' } : { kind: 'minutes', minutes }
    }
    default:
      return { kind: 'range', range: form.wasoChoice }
  }
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

function entryFromForm(date: LocalDate, form: DiaryFormState, existing?: SleepDiaryEntry): SleepDiaryEntry {
  const timestamp = new Date().toISOString()
  return {
    date,
    lightsOffTime: form.lightsOffTime || undefined,
    sleepOnsetLatencyMinutes: optionalNumber(form.sleepOnsetLatencyMinutes),
    finalWakeTime: form.finalWakeTime || undefined,
    outOfBedTime: form.outOfBedTime || undefined,
    nightWakes: form.nightWakes,
    waso: wasoFromForm(form),
    sleepQuality: form.sleepQuality === '' ? undefined : (Number(form.sleepQuality) as SleepQuality),
    tags: form.tags,
    recordedAt: existing?.recordedAt ?? timestamp,
    updatedAt: timestamp
  }
}

function durationText(t: TFunction, minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return t('durationMinutes', { minutes: rest })
  if (rest === 0) return t('durationHours', { hours })
  return t('durationHoursMinutes', { hours, minutes: rest })
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
    case 'time-in-bed-not-positive':
      return t('diaryProblemEmptyTimeInBed')
  }
}

function MetricValue({ metric, format }: { metric: Metric<number>; format: (value: number) => string }) {
  const { t } = useTranslation()

  if (metric.status === 'available') return <>{format(metric.value)}</>

  return (
    <>
      <span className="metric-unavailable">{t('metricUnavailable')}</span>
      <span className="metric-reason">{reasonText(t, metric.reason)}</span>
    </>
  )
}

export function DiaryPanel({ storageUnavailable }: { storageUnavailable: boolean }) {
  const { t } = useTranslation()
  const [today] = useState(localToday)
  const [selectedDate, setSelectedDate] = useState<LocalDate>(today)
  const [form, setForm] = useState<DiaryFormState>(emptyForm)
  const [entries, setEntries] = useState<SleepDiaryEntry[]>([])
  const [loadedState, setLoadedState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [saving, setSaving] = useState(false)
  const loadState = storageUnavailable ? 'error' : loadedState

  useEffect(() => {
    if (storageUnavailable) return

    let active = true
    readDiaryEntries()
      .then((loaded) => {
        if (!active) return
        setEntries(loaded)
        setForm(formFromEntry(loaded.find((entry) => entry.date === today) ?? null))
        setLoadedState('ready')
      })
      .catch(() => {
        if (active) setLoadedState('error')
      })
    return () => { active = false }
  }, [storageUnavailable, today])

  const savedEntry = entries.find((entry) => entry.date === selectedDate)
  const assessment = evaluateNight(entryFromForm(selectedDate, form, savedEntry))
  const problems = assessment.problems
  const wasoMinutesMissing = form.wasoChoice === 'minutes' && optionalNumber(form.wasoMinutes) === undefined

  function update(changes: Partial<DiaryFormState>) {
    setForm((current) => ({ ...current, ...changes }))
    setFeedback(null)
  }

  function chooseDate(date: LocalDate) {
    if (!date) return
    setSelectedDate(date)
    setForm(formFromEntry(entries.find((entry) => entry.date === date) ?? null))
    setFeedback(null)
  }

  function toggleTag(tag: DiaryTag) {
    update({ tags: form.tags.includes(tag) ? form.tags.filter((item) => item !== tag) : [...form.tags, tag] })
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (problems.length > 0 || wasoMinutesMissing) {
      setFeedback('invalid')
      return
    }

    setSaving(true)
    try {
      const entry = entryFromForm(selectedDate, form, savedEntry)
      await writeDiaryEntry(entry)
      const loaded = await readDiaryEntries()
      setEntries(loaded)
      setForm(formFromEntry(loaded.find((item) => item.date === selectedDate) ?? entry))
      setFeedback('saved')
    } catch {
      setFeedback('save-error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="diary-panel" aria-labelledby="diary-title">
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">DIARY</p>
          <h2 id="diary-title">{t('diaryTitle')}</h2>
        </div>
        <span className="panel-symbol" aria-hidden="true">☾</span>
      </div>
      <p className="diary-intro">{t('diaryIntro')}</p>

      {loadState === 'loading' && <p role="status">{t('diaryLoading')}</p>}
      {loadState === 'error' && (
        <p className="diary-alert" role="alert">
          {storageUnavailable ? t('diaryStorageUnavailable') : t('diaryLoadError')}
        </p>
      )}

      {loadState === 'ready' && (
        <>
          <form className="diary-form" onSubmit={(event) => void save(event)}>
            <div className="diary-date-field">
              <label className="field-label" htmlFor="diary-date">{t('diaryDateLabel')}</label>
              <input
                id="diary-date"
                type="date"
                value={selectedDate}
                max={today}
                onChange={(event) => chooseDate(event.target.value)}
              />
            </div>

            <div className="diary-grid">
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
                  <dd><MetricValue metric={assessment.sleepEfficiency} format={(value) => `${value}%`} /></dd>
                </div>
              </dl>
              <p className="field-hint">{t('diaryMetricsNote')}</p>
            </section>

            {(problems.length > 0 || wasoMinutesMissing) && (
              <div className="diary-alert" role="alert">
                <p>{t('diaryProblemsTitle')}</p>
                <ul>
                  {problems.map((problem, index) => (
                    <li key={`${problem.kind}-${index}`}>{problemText(t, problem)}</li>
                  ))}
                  {wasoMinutesMissing && <li>{t('diaryProblemWasoMinutesMissing')}</li>}
                </ul>
              </div>
            )}

            {feedback === 'saved' && <p className="diary-status" role="status">{t('diarySaved')}</p>}
            {feedback === 'save-error' && <p className="diary-alert" role="alert">{t('diarySaveError')}</p>}

            <div className="diary-actions">
              <button type="submit" className="primary-button" disabled={saving}>
                {saving ? t('diarySaving') : savedEntry ? t('diaryUpdate') : t('diarySave')}
              </button>
            </div>
          </form>

          <section className="diary-history" aria-labelledby="diary-history-title">
            <h3 id="diary-history-title">{t('diaryHistoryTitle')}</h3>
            {entries.length === 0 ? (
              <p className="field-hint">{t('diaryEmpty')}</p>
            ) : (
              <ul>
                {entries.slice(0, 7).map((entry) => {
                  const entryAssessment = evaluateNight(entry)
                  return (
                    <li key={entry.date}>
                      <button
                        type="button"
                        className={`history-entry ${entry.date === selectedDate ? 'is-current' : ''}`}
                        onClick={() => chooseDate(entry.date)}
                      >
                        <span className="history-date">{formatDiaryDate(entry.date)}</span>
                        <span aria-hidden="true">·</span>
                        <span className={`history-status ${entryAssessment.complete ? 'is-complete' : ''}`}>
                          {entryAssessment.complete ? t('diaryComplete') : t('diaryPartial')}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="history-metric">
                          {entryAssessment.sleepEfficiency.status === 'available'
                            ? `${t('metricSe')} ${entryAssessment.sleepEfficiency.value}%`
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
