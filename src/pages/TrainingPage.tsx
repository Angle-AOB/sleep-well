import { CoursePanel } from '../components/CoursePanel'
import type { ScreeningRecord } from '../domain/screening'

type TrainingPageProps = {
  visible: boolean
  storageUnavailable: boolean
  screening: ScreeningRecord | null
  diaryRevision: number
  initialWakeTime?: string
}

export function TrainingPage({ visible, storageUnavailable, screening, diaryRevision, initialWakeTime }: TrainingPageProps) {
  return (
    <section className="page" hidden={!visible} aria-labelledby="page-title">
      <CoursePanel
        storageUnavailable={storageUnavailable}
        screening={screening}
        diaryRevision={diaryRevision}
        visible={visible}
        initialWakeTime={initialWakeTime}
      />
    </section>
  )
}
