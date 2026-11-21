/**
 * 本地错误记录与诊断文本的纯领域规则。
 *
 * 错误只留在本设备，供用户自行查看、复制与自愿报告；不接入遥测、分析或自动上报。
 * 脱敏是结构性的：记录只接受类别与受限上下文（操作枚举、字节数），没有自由文本入口，
 * 因此日记字段、筛查答案、疗程状态与备份内容都不可能进入诊断文本。
 * 消息由类别决定，与备份面板共用同一套失败原因分类，不另造平行体系。
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
  /** 由类别推导的可读消息，不含任何用户数据。 */
  message: string
  context?: ErrorContext
}

export const MAX_ERROR_RECORDS = 20

const ERROR_MESSAGES: Record<ErrorCategory, string> = {
  'storage-unavailable': '此浏览器无法使用本地存储',
  'compression-unsupported': '此浏览器不支持压缩备份',
  'delivery-failed': '无法交付备份文件',
  'unreadable-file': '无法读取所选文件',
  'archive-rejected': '备份文件校验失败',
  'archive-unsupported': '备份压缩方式不受支持',
  'archive-too-large': '备份文件超过大小限制',
  'future-version': '备份来自更新版本的应用',
  'storage-error': '无法读取本地数据库',
  'import-failed': '备份导入失败',
  'refresh-failed': '导入后界面刷新失败',
  'export-failed': '备份导出失败',
  'storage-write-failed': '本地数据库写入失败'
}

export function createErrorRecord(
  category: ErrorCategory,
  context: ErrorContext | undefined,
  recordedAt: string
): ErrorRecord {
  const record: ErrorRecord = {
    recordedAt,
    category,
    message: ERROR_MESSAGES[category]
  }
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

/**
 * 输出可检查的纯文本诊断信息：版本、环境、错误记录。
 * 不包含睡眠日记、筛查答案、疗程状态或备份内容；结尾附带隐私提醒。
 */
export function formatDiagnostics(
  records: readonly ErrorRecord[],
  meta: DiagnosticMeta,
  options: { note?: string } = {}
): string {
  const lines: string[] = [
    'sleep-well diagnostics',
    `appVersion: ${meta.appVersion}`,
    `generatedAt: ${meta.generatedAt}`,
    `userAgent: ${meta.userAgent}`,
    `language: ${meta.language}`,
    `records (${records.length}/${MAX_ERROR_RECORDS}):`
  ]
  if (records.length === 0) {
    lines.push('(none)')
  } else {
    for (const record of records) {
      lines.push(`${record.recordedAt} | ${record.category} | ${record.message}${contextText(record)}`)
    }
  }
  if (options.note) lines.push(`note: ${options.note}`)
  return lines.join('\n')
}
