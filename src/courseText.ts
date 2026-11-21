import type { TFunction } from 'i18next'
import {
  CAFFEINE_CUTOFF_HOURS,
  MINIMUM_COMPLETE_NIGHTS,
  WINDOW_AUTOMATION_LIMIT_MINUTES,
  type CourseWeek,
  type RestrictionPauseReason,
  type RestrictionStatus,
  type WindowView
} from './domain/course'
import { durationText } from './format'

/**
 * 训练页与今日页共用的课程文案：周次内容、窗口不可用原因、睡眠限制状态。
 * 只搬运既有规则与文案选择，不在这里新增派生判断。
 */
export type WeekContent = { title: string; body: string; note?: string; tasks: string[] }

export const weeks: CourseWeek[] = [1, 2, 3, 4, 5, 6]

export const weekContent: Record<CourseWeek, WeekContent> = {
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

/** 本周三条任务的可访问名称；咖啡因截止的“睡前 8 小时”由同一常量插值。 */
export function weekTaskText(t: TFunction, week: CourseWeek): string[] {
  return weekContent[week].tasks.map((key) => t(key, { hours: CAFFEINE_CUTOFF_HOURS }))
}

export function windowUnavailableBody(
  t: TFunction,
  view: Extract<WindowView, { status: 'unavailable' }>,
  hasScreening: boolean,
  restriction: RestrictionStatus
): string {
  // “W2 = 候选”由领域层通过 restriction 给出，界面不再按周次自己推断。
  const preview = restriction === 'preview'
  const limitHours = WINDOW_AUTOMATION_LIMIT_MINUTES / 60

  switch (view.reason) {
    case 'baseline-in-progress':
      return t('windowBaseline')
    case 'insufficient-data':
      return t('windowDataInsufficient', { required: MINIMUM_COMPLETE_NIGHTS })
    case 'screening-paused':
      if (!hasScreening) return t('windowScreeningPending')
      return preview ? t('windowCandidateScreeningBlocked') : t('windowScreeningPaused')
    case 'shift-work-paused':
      return t('windowShiftPaused')
    case 'window-over-ten-hours': {
      const values = { duration: durationText(t, view.proposedMinutes), limitHours }
      return preview
        ? t('windowCandidateOverLimit', values)
        : t('windowOverTenHours', values)
    }
    case 'wake-time-not-set':
      return t('windowNeedsWakeTime')
    case 'course-not-started':
      return t('courseNotStarted')
  }
}

const restrictionStatusKeys: Record<RestrictionStatus, string> = {
  'not-started': 'restrictionStatusNotStarted',
  preview: 'restrictionStatusPreview',
  active: 'restrictionStatusActive',
  paused: 'restrictionStatusPaused',
  'awaiting-window': 'restrictionStatusAwaitingWindow'
}

/** 睡眠限制状态行；暂停原因由领域层给出，这里只选对应文案，不做推断。 */
export function restrictionText(
  t: TFunction,
  restriction: RestrictionStatus,
  pausedBy: RestrictionPauseReason | null
): string {
  switch (pausedBy) {
    case 'screening':
      return t('restrictionPausedScreening')
    case 'shift-work':
      return t('restrictionPausedShift')
    case 'window-limit':
      return t('restrictionPausedReview')
    case null:
      return t('restrictionStatusLabel', { status: t(restrictionStatusKeys[restriction]) })
  }
}
