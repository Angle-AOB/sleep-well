import { CoursePanel } from '../components/CoursePanel'
import type { ScreeningRecord } from '../domain/screening'

type TrainingPageProps = {
  visible: boolean
  storageUnavailable: boolean
  screening: ScreeningRecord | null
  screeningState: 'loading' | 'ready' | 'error'
  diaryRevision: number
  initialWakeTime?: string
}

export function TrainingPage({
  visible,
  storageUnavailable,
  screening,
  screeningState,
  diaryRevision,
  initialWakeTime
}: TrainingPageProps) {
  return (
    <section className="page" hidden={!visible} aria-labelledby="page-title">
      <CoursePanel
        storageUnavailable={storageUnavailable}
        screening={screening}
        screeningState={screeningState}
        diaryRevision={diaryRevision}
        visible={visible}
        initialWakeTime={initialWakeTime}
      />
    </section>
  )
}
