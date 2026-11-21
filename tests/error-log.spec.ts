import { test, expect } from '@playwright/test'
import {
  appendErrorRecord,
  createErrorRecord,
  formatDiagnostics,
  MAX_ERROR_RECORDS,
  type ErrorRecord
} from '../src/domain/errorLog'

function record(overrides: Partial<ErrorRecord> = {}): ErrorRecord {
  return {
    recordedAt: '2026-11-21T08:00:00.000Z',
    category: 'export-failed',
    message: '备份导出失败',
    ...overrides
  }
}

test('a created error record carries a timestamp, category and readable message', () => {
  const created = createErrorRecord('import-failed', { operation: 'import-apply', fileBytes: 2048 }, '2026-11-21T09:30:00.000Z')

  expect(created.recordedAt).toBe('2026-11-21T09:30:00.000Z')
  expect(created.category).toBe('import-failed')
  expect(created.message.length).toBeGreaterThan(0)
  expect(created.context).toEqual({ operation: 'import-apply', fileBytes: 2048 })
})

test('the error log keeps only the most recent bounded number of records', () => {
  let records: ErrorRecord[] = []
  for (let index = 1; index <= MAX_ERROR_RECORDS + 5; index += 1) {
    records = appendErrorRecord(records, record({
      recordedAt: `2026-11-21T08:00:${String(index).padStart(2, '0')}.000Z`,
      message: `第 ${index} 条`
    }))
  }

  expect(records).toHaveLength(MAX_ERROR_RECORDS)
  expect(records[0].message).toBe(`第 6 条`)
  expect(records[records.length - 1].message).toBe(`第 ${MAX_ERROR_RECORDS + 5} 条`)
})
