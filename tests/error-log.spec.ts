import { test, expect } from '@playwright/test'
import {
  appendErrorRecord,
  createErrorRecord,
  formatDiagnostics,
  formatIssueSummary,
  MAX_ERROR_RECORDS,
  type ErrorRecord
} from '../src/domain/errorLog'

function record(overrides: Partial<ErrorRecord> = {}): ErrorRecord {
  return {
    recordedAt: '2026-11-21T08:00:00.000Z',
    category: 'export-failed',
    ...overrides
  }
}

const meta = {
  appVersion: '0.1.0',
  generatedAt: '2026-11-21T09:00:00.000Z',
  userAgent: 'Mozilla/5.0 (test)',
  language: 'zh-CN'
}

test('a created error record carries a timestamp, category and structured context', () => {
  const created = createErrorRecord('import-failed', { operation: 'import-apply', fileBytes: 2048 }, '2026-11-21T09:30:00.000Z')

  expect(created.recordedAt).toBe('2026-11-21T09:30:00.000Z')
  expect(created.category).toBe('import-failed')
  expect(created.context).toEqual({ operation: 'import-apply', fileBytes: 2048 })
})

test('the error log keeps only the most recent bounded number of records', () => {
  let records: ErrorRecord[] = []
  for (let index = 1; index <= MAX_ERROR_RECORDS + 5; index += 1) {
    records = appendErrorRecord(records, record({
      recordedAt: `2026-11-21T08:00:${String(index).padStart(2, '0')}.000Z`
    }))
  }

  expect(records).toHaveLength(MAX_ERROR_RECORDS)
  expect(records[0].recordedAt).toBe('2026-11-21T08:00:06.000Z')
  expect(records[records.length - 1].recordedAt).toBe(`2026-11-21T08:00:${MAX_ERROR_RECORDS + 5}.000Z`)
})

test('the domain layer holds no user-visible copy; messages are injected by the caller', () => {
  const created = createErrorRecord('export-failed', undefined, '2026-11-21T08:00:00.000Z')
  expect(created).not.toHaveProperty('message')

  const text = formatDiagnostics([created], meta, {
    messageFor: (category) => `label:${category}`
  })
  expect(text).toContain('label:export-failed')
  expect(text).not.toMatch(/[\u4e00-\u9fff]/)
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

  const text = formatDiagnostics(records, meta, {
    messageFor: () => '备份导出失败',
    note: '本诊断信息不含健康数据，公开前请自行检查。'
  })

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

test('the issue summary carries only categories, never messages or contexts', () => {
  const records = [
    createErrorRecord('export-failed', { operation: 'export-backup' }, '2026-11-21T08:00:00.000Z'),
    createErrorRecord('import-failed', { operation: 'import-apply', fileBytes: 2048 }, '2026-11-21T08:05:00.000Z')
  ]

  const summary = formatIssueSummary(records, meta, { note: '公开前请自查隐私。' })

  expect(summary).toContain('categories: export-failed, import-failed')
  expect(summary).not.toContain('operation=')
  expect(summary).not.toContain('fileBytes=')
  expect(summary).not.toContain('messageFor')
  expect(summary).toContain('公开前请自查隐私。')
})
