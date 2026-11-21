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

test('diagnostic text carries version and environment but never health data', () => {
  // 这些值模拟日记字段、筛查答案、疗程状态与备份内容；它们在场，但绝不允许进入诊断文本。
  const diaryLightsOff = '21:47'
  const diaryWasoMinutes = '93'
  const screeningAge = '44'
  const courseWakeTime = '05:15'

  let records: ErrorRecord[] = []
  records = appendErrorRecord(records, createErrorRecord(
    'export-failed',
    { operation: 'export-backup' },
    '2026-11-21T08:00:00.000Z'
  ))
  records = appendErrorRecord(records, createErrorRecord(
    'import-failed',
    { operation: 'import-apply', fileBytes: 2048 },
    '2026-11-21T08:05:00.000Z'
  ))

  const text = formatDiagnostics(records, {
    appVersion: '0.1.0',
    generatedAt: '2026-11-21T09:00:00.000Z',
    userAgent: 'Mozilla/5.0 (test)',
    language: 'zh-CN'
  }, { note: '本诊断信息不含健康数据，公开前请自行检查。' })

  expect(text).toContain('appVersion: 0.1.0')
  expect(text).toContain('userAgent: Mozilla/5.0 (test)')
  expect(text).toContain('language: zh-CN')
  expect(text).toContain('export-failed')
  expect(text).toContain('operation=import-apply fileBytes=2048')

  expect(text).not.toContain(diaryLightsOff)
  expect(text).not.toContain(diaryWasoMinutes)
  expect(text).not.toContain(screeningAge)
  expect(text).not.toContain(courseWakeTime)
})
