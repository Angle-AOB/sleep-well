import type { TFunction } from 'i18next'
import {
  SE_DECREASE_THRESHOLD,
  SE_INCREASE_THRESHOLD,
  TITRATION_NIGHTS,
  TITRATION_STEP_MINUTES,
  WINDOW_AUTOMATION_LIMIT_MINUTES,
  WINDOW_FLOOR_MINUTES,
  type TitrationView
} from './domain/course'
import { durationText, efficiencyText } from './format'

/**
 * 滴定卡文案。放在组件之外，既让组件保持只导出组件，也让测试可以直接断言
 * 文案里的平均 SE 与 85/90 判决一致。
 */
export function titrationBody(t: TFunction, view: TitrationView): string {
  const floorHours = WINDOW_FLOOR_MINUTES / 60
  const limitHours = WINDOW_AUTOMATION_LIMIT_MINUTES / 60
  const increaseThreshold = SE_INCREASE_THRESHOLD
  const decreaseThreshold = SE_DECREASE_THRESHOLD
  const stepMinutes = TITRATION_STEP_MINUTES

  switch (view.status) {
    case 'not-applicable':
      return ''
    case 'scheduled':
      return t('titrationScheduled', { week: view.nextWeek, nights: TITRATION_NIGHTS })
    case 'consolidation':
      return t('titrationConsolidation')
    case 'insufficient-data':
      return t('titrationInsufficient', { complete: view.completeNights, required: view.required })
    case 'deferred':
      return t('titrationDeferred', { duration: durationText(t, view.durationMinutes) })
    case 'paused':
      return view.reason === 'screening' ? t('titrationPausedScreening') : t('titrationPausedShift')
    case 'adjusted': {
      const values = {
        nights: view.change.basis.completeNights,
        se: efficiencyText(view.change.basis.averageSleepEfficiency),
        from: durationText(t, view.change.previousMinutes),
        to: durationText(t, view.change.durationMinutes),
        increaseThreshold,
        decreaseThreshold,
        stepMinutes
      }
      return view.change.rule === 'increase' ? t('titrationIncreased', values) : t('titrationDecreased', values)
    }
    case 'kept':
      return view.reason === 'in-band'
        ? t('titrationKeptInBand', {
          nights: view.basis.completeNights,
          se: efficiencyText(view.basis.averageSleepEfficiency),
          duration: durationText(t, view.durationMinutes),
          increaseThreshold,
          decreaseThreshold
        })
        : t('titrationKeptFloor', {
          nights: view.basis.completeNights,
          se: efficiencyText(view.basis.averageSleepEfficiency),
          floorHours,
          decreaseThreshold
        })
    case 'review':
      return view.basis
        ? t('titrationReview', {
          nights: view.basis.completeNights,
          se: efficiencyText(view.basis.averageSleepEfficiency),
          proposed: durationText(t, view.proposedMinutes),
          limitHours,
          increaseThreshold
        })
        : t('titrationReviewCalibration', {
          proposed: durationText(t, view.proposedMinutes),
          limitHours
        })
  }
}
