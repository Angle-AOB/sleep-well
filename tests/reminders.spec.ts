import { test, expect } from '@playwright/test'
import { evaluateBackupReminder } from '../src/domain/reminders'

function night(date: string, updatedAt = `${date}T07:00:00.000Z`) {
  return { date, updatedAt }
}

test('two saved nights are not yet worth a backup reminder', () => {
  const decision = evaluateBackupReminder({
    entries: [night('2026-11-18'), night('2026-11-19')],
    preferences: { backupReminders: true },
    today: '2026-11-20'
  })

  expect(decision).toEqual({ remind: false })
})

test('the third saved night triggers the first in-app reminder', () => {
  const decision = evaluateBackupReminder({
    entries: [night('2026-11-17'), night('2026-11-18'), night('2026-11-19')],
    preferences: { backupReminders: true },
    today: '2026-11-20'
  })

  expect(decision).toEqual({ remind: true, kind: 'first', entryCount: 3 })
})

test('turning reminders off suppresses them no matter how much history exists', () => {
  const decision = evaluateBackupReminder({
    entries: [night('2026-11-17'), night('2026-11-18'), night('2026-11-19')],
    preferences: {
      backupReminders: false,
      lastBackupReminderOn: '2026-10-01'
    },
    today: '2026-11-20'
  })

  expect(decision).toEqual({ remind: false })
})

test('the weekly cap keeps the reminder quiet for six days', () => {
  const decision = evaluateBackupReminder({
    entries: [night('2026-11-01'), night('2026-11-02'), night('2026-11-03')],
    preferences: {
      backupReminders: true,
      lastBackupReminderOn: '2026-11-14'
    },
    today: '2026-11-20'
  })

  expect(decision).toEqual({ remind: false })
})

test('after seven days the reminder returns, still capped at one per week', () => {
  const decision = evaluateBackupReminder({
    entries: [night('2026-11-01'), night('2026-11-02'), night('2026-11-03')],
    preferences: {
      backupReminders: true,
      lastBackupReminderOn: '2026-11-13'
    },
    today: '2026-11-20'
  })

  expect(decision).toEqual({ remind: true, kind: 'weekly', entryCount: 3 })
})

test('a fresh backup keeps the reminder quiet until a newer night arrives', () => {
  const preferences = {
    backupReminders: true,
    lastBackupReminderOn: '2026-11-01',
    lastBackupAt: '2026-11-05T09:00:00.000Z'
  }
  const backedUp = [night('2026-11-01'), night('2026-11-02'), night('2026-11-03')]

  expect(evaluateBackupReminder({ entries: backedUp, preferences, today: '2026-11-20' }))
    .toEqual({ remind: false })

  const afterBackup = [...backedUp, night('2026-11-06', '2026-11-06T07:10:00.000Z')]
  expect(evaluateBackupReminder({ entries: afterBackup, preferences, today: '2026-11-20' }))
    .toEqual({ remind: true, kind: 'weekly', entryCount: 4 })
})
