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
