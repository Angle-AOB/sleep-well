import { useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
  createScreeningRecord,
  MINIMUM_ADULT_AGE,
  SCREENING_BOOLEAN_KEYS,
  type DistressLevel,
  type ScreeningAnswers,
  type ScreeningRecord
} from '../domain/screening'

type Duration = NonNullable<ScreeningAnswers['concernDuration']>
type AffectedNights = NonNullable<ScreeningAnswers['affectedNights']>
type DaytimeImpact = NonNullable<ScreeningAnswers['daytimeImpact']>
type SafetyKey = (typeof SCREENING_BOOLEAN_KEYS)[number]

type FormState = {
  age: number | ''
  bipolarOrMania: boolean | null
  seizureHistory: boolean | null
  osaRedFlags: boolean | null
  dangerousParasomnia: boolean | null
  pregnant: boolean | null
  severeSleepinessOrSafetyRisk: boolean | null
  acuteInstability: boolean | null
  concernDuration: Duration | ''
  affectedNights: AffectedNights | ''
  daytimeImpact: DaytimeImpact | ''
  distress: DistressLevel | null
  improvementGoal: ScreeningAnswers['improvementGoal'] | ''
}

type ScreeningPanelProps = {
  initialRecord: ScreeningRecord | null
  loading: boolean
  storageUnavailable: boolean
  onSave: (record: ScreeningRecord) => Promise<void>
}

const emptyForm: FormState = {
  age: '',
  bipolarOrMania: null,
  seizureHistory: null,
  osaRedFlags: null,
  dangerousParasomnia: null,
  pregnant: null,
  severeSleepinessOrSafetyRisk: null,
  acuteInstability: null,
  concernDuration: '',
  affectedNights: '',
  daytimeImpact: '',
  distress: null,
  improvementGoal: ''
}


function toFormAnswers(form: FormState): ScreeningAnswers {
  return {
    age: form.age === '' ? 0 : form.age,
    bipolarOrMania: form.bipolarOrMania === true,
    seizureHistory: form.seizureHistory === true,
    osaRedFlags: form.osaRedFlags === true,
    dangerousParasomnia: form.dangerousParasomnia === true,
    pregnant: form.pregnant === true,
    severeSleepinessOrSafetyRisk: form.severeSleepinessOrSafetyRisk === true,
    acuteInstability: form.acuteInstability === true,
    distress: form.distress ?? 'none',
    concernDuration: form.concernDuration || undefined,
    affectedNights: form.affectedNights || undefined,
    daytimeImpact: form.daytimeImpact || undefined,
    improvementGoal: form.improvementGoal || undefined
  }
}

function ScreeningQuestion({
  id,
  label,
  value,
  onChange,
  yesLabel,
  noLabel,
  description
}: {
  id: string
  label: string
  value: boolean | null
  onChange: (value: boolean) => void
  yesLabel: string
  noLabel: string
  description?: string
}) {
  return (
    <fieldset className="screening-question" aria-describedby={description ? `${id}-description` : undefined}>
      <legend>{label}</legend>
      {description && <p id={`${id}-description`} className="question-note">{description}</p>}
      <div className="choice-row">
        <label><input type="radio" name={id} checked={value === true} onChange={() => onChange(true)} />{yesLabel}</label>
        <label><input type="radio" name={id} checked={value === false} onChange={() => onChange(false)} />{noLabel}</label>
      </div>
    </fieldset>
  )
}

function ScreeningForm({ onSubmit, onCancel }: { onSubmit: (record: ScreeningRecord) => Promise<void>; onCancel?: () => void }) {
  const { t } = useTranslation()
  const [form, setForm] = useState<FormState>(emptyForm)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function setSafetyAnswer(key: SafetyKey, value: boolean) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const missingQuestionAnswer = !form.concernDuration || !form.affectedNights || !form.daytimeImpact || !form.improvementGoal
    const missingSafetyAnswer = form.age === '' || !Number.isInteger(form.age) || form.age < 1 || form.age > 120 || !form.distress || SCREENING_BOOLEAN_KEYS.some((key) => form[key] === null)
    if (missingSafetyAnswer || missingQuestionAnswer) {
      setError(t('screeningValidationError'))
      return
    }

    setError('')
    setSaving(true)
    try {
      await onSubmit(createScreeningRecord(toFormAnswers(form), new Date().toISOString()))
    } catch {
      setError(t('screeningSaveError'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="screening-form" onSubmit={(event) => void submit(event)}>
      <div className="screening-form-intro">
        <p>{t('screeningFormIntro')}</p>
        <p className="question-note">{t('screeningNonDiagnostic')}</p>
      </div>

      <fieldset className="screening-question">
        <legend>{t('ageQuestion')}</legend>
        <label className="field-label" htmlFor="screening-age">{t('ageLabel')}</label>
        <input
          id="screening-age"
          type="number"
          min="1"
          max="120"
          step="1"
          value={form.age}
          onChange={(event) => setForm((current) => ({ ...current, age: event.target.value === '' ? '' : Number(event.target.value) }))}
        />
        <p className="question-note">{t('underageNote', { years: MINIMUM_ADULT_AGE })}</p>
      </fieldset>

      <ScreeningQuestion
        id="bipolar-or-mania"
        label={t('bipolarQuestion')}
        value={form.bipolarOrMania}
        onChange={(value) => setSafetyAnswer('bipolarOrMania', value)}
        yesLabel={t('yes')}
        noLabel={t('no')}
      />
      <ScreeningQuestion
        id="seizure-history"
        label={t('seizureQuestion')}
        value={form.seizureHistory}
        onChange={(value) => setSafetyAnswer('seizureHistory', value)}
        yesLabel={t('yes')}
        noLabel={t('no')}
      />
      <ScreeningQuestion
        id="osa-red-flags"
        label={t('osaQuestion')}
        value={form.osaRedFlags}
        onChange={(value) => setSafetyAnswer('osaRedFlags', value)}
        yesLabel={t('yes')}
        noLabel={t('no')}
      />
      <ScreeningQuestion
        id="dangerous-parasomnia"
        label={t('parasomniaQuestion')}
        value={form.dangerousParasomnia}
        onChange={(value) => setSafetyAnswer('dangerousParasomnia', value)}
        yesLabel={t('yes')}
        noLabel={t('no')}
      />
      <ScreeningQuestion
        id="pregnancy"
        label={t('pregnancyQuestion')}
        value={form.pregnant}
        onChange={(value) => setSafetyAnswer('pregnant', value)}
        yesLabel={t('yes')}
        noLabel={t('no')}
      />
      <ScreeningQuestion
        id="severe-sleepiness"
        label={t('sleepinessQuestion')}
        value={form.severeSleepinessOrSafetyRisk}
        onChange={(value) => setSafetyAnswer('severeSleepinessOrSafetyRisk', value)}
        yesLabel={t('yes')}
        noLabel={t('no')}
      />
      <ScreeningQuestion
        id="acute-instability"
        label={t('acuteInstabilityQuestion')}
        value={form.acuteInstability}
        onChange={(value) => setSafetyAnswer('acuteInstability', value)}
        yesLabel={t('yes')}
        noLabel={t('no')}
      />

      <div className="screening-question">
        <label className="field-label" htmlFor="concern-duration">{t('concernDurationLabel')}</label>
        <select id="concern-duration" value={form.concernDuration} onChange={(event) => setForm((current) => ({ ...current, concernDuration: event.target.value as Duration | '' }))}>
          <option value="">{t('selectPlaceholder')}</option>
          <option value="less-than-week">{t('durationLessThanWeek')}</option>
          <option value="one-to-four-weeks">{t('durationOneToFourWeeks')}</option>
          <option value="one-to-three-months">{t('durationOneToThreeMonths')}</option>
          <option value="over-three-months">{t('durationOverThreeMonths')}</option>
        </select>
      </div>

      <div className="screening-question">
        <label className="field-label" htmlFor="affected-nights">{t('affectedNightsLabel')}</label>
        <select id="affected-nights" value={form.affectedNights} onChange={(event) => setForm((current) => ({ ...current, affectedNights: event.target.value as AffectedNights | '' }))}>
          <option value="">{t('selectPlaceholder')}</option>
          <option value="none">{t('nightsNone')}</option>
          <option value="one-to-two">{t('nightsOneToTwo')}</option>
          <option value="three-to-four">{t('nightsThreeToFour')}</option>
          <option value="five-to-seven">{t('nightsFiveToSeven')}</option>
        </select>
      </div>

      <div className="screening-question">
        <label className="field-label" htmlFor="daytime-impact">{t('daytimeImpactLabel')}</label>
        <select id="daytime-impact" value={form.daytimeImpact} onChange={(event) => setForm((current) => ({ ...current, daytimeImpact: event.target.value as DaytimeImpact | '' }))}>
          <option value="">{t('selectPlaceholder')}</option>
          <option value="none">{t('impactNone')}</option>
          <option value="some">{t('impactSome')}</option>
          <option value="significant">{t('impactSignificant')}</option>
        </select>
      </div>

      <fieldset className="screening-question">
        <legend>{t('distressQuestion')}</legend>
        <p className="question-note">{t('distressDescription')}</p>
        <div className="choice-row choice-row-wide">
          {(['none', 'some', 'a-lot'] as const).map((level) => (
            <label key={level}>
              <input type="radio" name="distress-level" checked={form.distress === level} onChange={() => setForm((current) => ({ ...current, distress: level }))} />
              {t(`distress${level === 'none' ? 'None' : level === 'some' ? 'Some' : 'ALot'}`)}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="screening-question">
        <label className="field-label" htmlFor="improvement-goal">{t('improvementGoalLabel')}</label>
        <select id="improvement-goal" value={form.improvementGoal} onChange={(event) => setForm((current) => ({ ...current, improvementGoal: event.target.value as FormState['improvementGoal'] }))}>
          <option value="">{t('selectPlaceholder')}</option>
          <option value="fall-asleep">{t('goalFallAsleep')}</option>
          <option value="stay-asleep">{t('goalStayAsleep')}</option>
          <option value="regularity">{t('goalRegularity')}</option>
          <option value="daytime">{t('goalDaytime')}</option>
        </select>
      </div>
      {error && <p className="screening-error" role="alert">{error}</p>}
      <div className="screening-actions">
        {onCancel && <button type="button" className="secondary-button" onClick={onCancel}>{t('cancelScreening')}</button>}
        <button type="submit" className="primary-button" disabled={saving}>{saving ? t('savingScreening') : t('submitScreening')}</button>
      </div>
    </form>
  )
}

export function ScreeningPanel({ initialRecord, loading, storageUnavailable, onSave }: ScreeningPanelProps) {
  const { t } = useTranslation()
  const [record, setRecord] = useState<ScreeningRecord | null>(initialRecord)
  const [editing, setEditing] = useState(false)
  const [rescreenPending, setRescreenPending] = useState(false)

  async function saveRecord(next: ScreeningRecord) {
    await onSave(next)
    setRecord(next)
    setEditing(false)
    setRescreenPending(false)
  }

  if (editing) {
    return (
      <section className="screening-panel" aria-labelledby="screening-title">
        <div className="panel-heading">
          <div><p className="panel-kicker">{t('screeningKicker')}</p><h2 id="screening-title">{t('screeningTitle')}</h2></div>
          <span className="panel-symbol" aria-hidden="true">◌</span>
        </div>
        <ScreeningForm onSubmit={saveRecord} onCancel={record ? () => setEditing(false) : undefined} />
      </section>
    )
  }

  if (loading) {
    return (
      <section className="screening-panel" aria-labelledby="screening-title">
        <div className="panel-heading">
          <div><p className="panel-kicker">{t('screeningKicker')}</p><h2 id="screening-title">{t('screeningTitle')}</h2></div>
          <span className="panel-symbol" aria-hidden="true">◌</span>
        </div>
        <p className="screening-summary">{t('screeningLoading')}</p>
      </section>
    )
  }

  if (!record || rescreenPending) {
    return (
      <section className="screening-panel" aria-labelledby="screening-title">
        <div className="panel-heading">
          <div><p className="panel-kicker">{t('screeningKicker')}</p><h2 id="screening-title">{t('screeningTitle')}</h2></div>
          <span className="panel-symbol" aria-hidden="true">◌</span>
        </div>
        <p className="screening-summary">{t('screeningIntro')}</p>
        <p className="question-note">{t('screeningNonDiagnostic')}</p>
        {storageUnavailable && <p className="screening-error" role="alert">{t('screeningStorageUnavailable')}</p>}
        <button type="button" className="primary-button" onClick={() => { setRescreenPending(false); setEditing(true) }} disabled={storageUnavailable}>{t('startScreening')}</button>
      </section>
    )
  }

  const paused = record.result.sleepRestrictionPaused
  return (
    <section className={`screening-panel screening-result ${paused ? 'is-paused' : 'is-cleared'}`} aria-labelledby="screening-result-title">
      <div className="panel-heading">
        <div><p className="panel-kicker">{t('screeningKicker')}</p><h2 id="screening-result-title">{t('screeningResultTitle')}</h2></div>
        <span className="panel-symbol" aria-hidden="true">{paused ? '!' : '✓'}</span>
      </div>
      {paused ? (
        <>
          <p className="result-title" role="status">{t('restrictionPaused')}</p>
          <p>{t('professionalReview')}</p>
          <p>{t('availableActivities')}</p>
          {record.result.strongReferral && <p className="referral-note">{t('strongReferral')}</p>}
        </>
      ) : (
        <>
          <p className="result-title" role="status">{t('screeningCleared')}</p>
          <p>{t('screeningCompleted')}</p>
          {record.result.strongReferral && <p className="referral-note">{t('strongReferral')}</p>}
        </>
      )}
      <button type="button" className="secondary-button" onClick={() => setRescreenPending(true)}>{t('rescreenScreening')}</button>
    </section>
  )
}
