/**
 * 错误记录的会话内存储。
 *
 * 记录只活在当前页面会话（内存），不写入本地数据库：一来写库失败时无法可靠落盘，
 * 二来错误记录不该进入备份内容。脱敏靠领域层的结构性入口——调用方只能给出类别与
 * 受限上下文，无法传入自由文本或异常消息。
 */

import {
  appendErrorRecord,
  createErrorRecord,
  type ErrorCategory,
  type ErrorContext,
  type ErrorRecord
} from '../domain/errorLog'

let records: ErrorRecord[] = []

export function recordError(
  category: ErrorCategory,
  context?: ErrorContext,
  recordedAt: string = new Date().toISOString()
): ErrorRecord {
  const record = createErrorRecord(category, context, recordedAt)
  records = appendErrorRecord(records, record)
  return record
}

export function readErrorRecords(): readonly ErrorRecord[] {
  return records
}
