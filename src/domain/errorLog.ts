/**
 * 本地错误记录与诊断文本的纯领域规则。
 *
 * 错误只留在本设备，供用户自行查看、复制与自愿报告；不接入遥测、分析或自动上报。
 * 脱敏是结构性的：记录只接受类别与受限上下文（操作枚举、字节数），没有自由文本入口，
 * 因此日记字段、筛查答案、疗程状态与备份内容都不可能进入诊断文本。
 * 用户可见文案由调用方通过 `messageFor` 注入——本模块不持有任何面向用户的语言资源。
 */

export type ErrorCategory =
  | 'storage-unavailable'
  | 'compression-unsupported'
  | 'delivery-failed'
  | 'unreadable-file'
  | 'archive-rejected'
  | 'archive-unsupported'
  | 'archive-too-large'
  | 'future-version'
  | 'storage-error'
  | 'import-failed'
  | 'refresh-failed'
  | 'export-failed'
  | 'storage-write-failed'

export type ErrorOperation =
  | 'export-backup'
  | 'export-csv'
  | 'import-read'
  | 'import-apply'
  | 'refresh'
  | 'storage-read'
  | 'storage-write'

/** 上下文摘要只允许枚举操作与字节数；调用方无法把任意文本塞进记录。 */
export type ErrorContext = {
  operation: ErrorOperation
  fileBytes?: number
}

export type ErrorRecord = {
  /** ISO 时间戳。 */
  recordedAt: string
  category: ErrorCategory
  context?: ErrorContext
}

export const MAX_ERROR_RECORDS = 20

export function createErrorRecord(
  category: ErrorCategory,
  context: ErrorContext | undefined,
  recordedAt: string
): ErrorRecord {
  const record: ErrorRecord = { recordedAt, category }
  if (context) record.context = { ...context }
  return record
}

/** 有界追加：超出上限时丢弃最旧的记录，保留最近现场。 */
export function appendErrorRecord(records: readonly ErrorRecord[], record: ErrorRecord): ErrorRecord[] {
  return [...records, record].slice(-MAX_ERROR_RECORDS)
}

export type DiagnosticMeta = {
  appVersion: string
  generatedAt: string
  userAgent: string
  language: string
}

function contextText(record: ErrorRecord): string {
  if (!record.context) return ''
  const parts = [`operation=${record.context.operation}`]
  if (record.context.fileBytes !== undefined) parts.push(`fileBytes=${record.context.fileBytes}`)
  return ` | ${parts.join(' ')}`
}

function metaLines(meta: DiagnosticMeta): string[] {
  return [
    'sleep-well diagnostics',
    `appVersion: ${meta.appVersion}`,
    `generatedAt: ${meta.generatedAt}`,
    `userAgent: ${meta.userAgent}`,
    `language: ${meta.language}`
  ]
}

/**
 * 输出可检查的纯文本诊断信息：版本、环境、错误记录。
 * 不包含睡眠日记、筛查答案、疗程状态或备份内容；结尾附带隐私提醒。
 * `messageFor` 由界面层提供（i18n），本模块不持有用户可见文案。
 */
export function formatDiagnostics(
  records: readonly ErrorRecord[],
  meta: DiagnosticMeta,
  options: {
    messageFor: (category: ErrorCategory) => string
    note?: string
  }
): string {
  const lines = [
    ...metaLines(meta),
    `records (${records.length}/${MAX_ERROR_RECORDS}):`
  ]
  if (records.length === 0) {
    lines.push('(none)')
  } else {
    for (const record of records) {
      lines.push(
        `${record.recordedAt} | ${record.category} | ${options.messageFor(record.category)}${contextText(record)}`
      )
    }
  }
  if (options.note) lines.push(`note: ${options.note}`)
  return lines.join('\n')
}

/**
 * 供 GitHub issue 预填的摘要：只含版本、环境与错误类别 code，
 * 不含错误消息原文、上下文或任何本地数据——诊断全文只能由用户主动复制后自行粘贴。
 */
export function formatIssueSummary(
  records: readonly ErrorRecord[],
  meta: DiagnosticMeta,
  options: { note?: string } = {}
): string {
  const lines = [
    ...metaLines(meta),
    `categories: ${records.length === 0 ? '(none)' : records.map((record) => record.category).join(', ')}`
  ]
  if (options.note) lines.push(`note: ${options.note}`)
  return lines.join('\n')
}
