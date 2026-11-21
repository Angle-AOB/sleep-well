import { CoursePanel } from '../components/CoursePanel'
import type { ScreeningRecord } from '../domain/screening'

type TrainingPageProps = {
  hidden: boolean
  storageUnavailable: boolean
  screening: ScreeningRecord | null
  diaryRevision: number
  initialWakeTime?: string
}

export function TrainingPage({ hidden, storageUnavailable, screening, diaryRevision, initialWakeTime }: TrainingPageProps) {
  return (
    <section className="page" hidden={hidden} aria-labelledby="page-title">
      <CoursePanel
        storageUnavailable={storageUnavailable}
        screening={screening}
        diaryRevision={diaryRevision}
        initialWakeTime={initialWakeTime}
      />
    </section>
  )
}
