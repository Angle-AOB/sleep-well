import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import {
  BACKUP_RULES_VERSION,
  compareBackup,
  createBackupPayload,
  type BackupComparison,
  type BackupPayload,
  type BackupSummary
} from '../domain/backup'
import { BackupArchiveError, type BackupManifest } from '../domain/backupArchive'
import { diaryCsv, type DiaryCsvLabels } from '../domain/csv'
import type { ErrorCategory, ErrorContext } from '../domain/errorLog'
import { applyBackupImport, readBackupData } from '../data/backup'
import { recordError } from '../data/errorLog'
import {
  bytesBlob,
  createArchiveBytes,
  MAX_COMPRESSED_BYTES,
  readArchiveBytes,
  supportsBackupCompression
} from '../data/backupCodec'
import {
  backupFileName,
  deliverFile,
  diaryFileName,
  type DeliveryOutcome
} from '../data/backupDelivery'
import { dateLongText, localToday, momentText } from '../format'

/** 失败原因沿用错误日志的类别体系；界面提示与诊断记录共享同一分类。 */
type FailureReason = ErrorCategory

/** 界面本地的脱敏失败状态；只保留界面真正渲染的失败原因。 */
type LocalBackupError = { reason: FailureReason }

type Notice = { key: string; values?: Record<string, unknown> }

type Preview = {
  payload: BackupPayload
  manifest: BackupManifest
  comparison: BackupComparison
}

type BackupPanelProps = {
  storageUnavailable: boolean
  /** 导入成功后让应用重新读取日记、疗程、设置与筛查状态。 */
  onImported?: () => Promise<void> | void
  /** 完整备份交付成功后记账（preferences.lastBackupAt），让备份提醒保持安静。 */
  onExported?: (exportedAt: string) => Promise<void> | void
}

function csvLabels(t: TFunction): DiaryCsvLabels {
  return {
    yes: t('backupCsvYes'),
    header: [
      t('backupCsvHeaderDate'),
      t('backupCsvHeaderLightsOff'),
      t('backupCsvHeaderLatency'),
      t('backupCsvHeaderFinalWake'),
      t('backupCsvHeaderOutOfBed'),
      t('backupCsvHeaderNightWakes'),
      t('backupCsvHeaderWaso'),
      t('backupCsvHeaderQuality'),
      t('backupCsvHeaderCaffeine'),
      t('backupCsvHeaderAlcohol'),
      t('backupCsvHeaderNap'),
      t('backupCsvHeaderExercise'),
      t('backupCsvHeaderTib'),
      t('backupCsvHeaderTst'),
      t('backupCsvHeaderSe')
    ]
  }
}

function summaryLines(t: TFunction, summary: BackupSummary): string[] {
  const lines: string[] = []
  if (summary.diaryCount === 0) {
    lines.push(t('backupSummaryNoDiary'))
  } else {
    lines.push(t('backupSummaryDiary', { count: summary.diaryCount }))
    if (summary.firstDate && summary.lastDate) {
      lines.push(t('backupSummaryRange', {
        first: dateLongText(t, summary.firstDate),
        last: dateLongText(t, summary.lastDate)
      }))
    }
    lines.push(t('backupSummaryComplete', { count: summary.completeNights }))
  }
  if (summary.courseCompleted) {
    lines.push(t('backupSummaryCourseCompleted'))
  } else if (summary.courseWeek !== null) {
    lines.push(t('backupSummaryCourseWeek', { week: summary.courseWeek }))
  } else {
    lines.push(t('backupSummaryCourseNone'))
  }
  lines.push(summary.screeningStatus === null
    ? t('backupSummaryScreeningNone')
    : t('backupSummaryScreeningIncluded'))
  lines.push(summary.backupReminders
    ? t('backupSummaryRemindersOn')
    : t('backupSummaryRemindersOff'))
  lines.push(summary.wakeTime === null
    ? t('backupSummaryWakeTimeNone')
    : t('backupSummaryWakeTime', { time: summary.wakeTime }))
  return lines
}

function archiveFailureReason(error: unknown): FailureReason {
  if (error instanceof BackupArchiveError) {
    if (error.kind === 'entry-too-large' || error.kind === 'archive-too-large' || error.kind === 'too-many-entries') {
      return 'archive-too-large'
    }
    if (error.kind === 'unsupported-schema') return 'future-version'
    if (error.kind === 'unsupported-compression') return 'archive-unsupported'
  }
  return 'archive-rejected'
}

const reasonKey: Record<FailureReason, string> = {
  'storage-unavailable': 'backupStorageUnavailable',
  'compression-unsupported': 'backupCompressionUnsupported',
  'delivery-failed': 'backupDeliveryFailed',
  'unreadable-file': 'backupFileUnreadable',
  'archive-rejected': 'backupArchiveRejected',
  'archive-unsupported': 'backupArchiveUnsupported',
  'archive-too-large': 'backupArchiveTooLarge',
  'future-version': 'backupFutureVersion',
  'storage-error': 'backupStorageReadFailed',
  'import-failed': 'backupImportFailed',
  'refresh-failed': 'backupImportedRefreshFailed',
  'export-failed': 'backupExportError',
  'storage-write-failed': 'storageWriteError'
}

function deliveryNotice(outcome: DeliveryOutcome): Notice | null {
  switch (outcome) {
    case 'cancelled':
      return { key: 'backupDeliveredCancelled' }
    case 'shared':
      return { key: 'backupDeliveredShared' }
    case 'downloaded':
      return { key: 'backupDeliveredDownloaded' }
    case 'unsupported':
      return null
  }
}

export function BackupPanel({ storageUnavailable, onImported, onExported }: BackupPanelProps) {
  const { t } = useTranslation()
  const today = localToday()
  const [activity, setActivity] = useState<'export' | 'read' | 'import' | null>(null)
  const busy = activity !== null
  const [notice, setNotice] = useState<Notice | null>(null)
  const [localError, setLocalError] = useState<LocalBackupError | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [confirmingOverwrite, setConfirmingOverwrite] = useState(false)
  const [csvWasEmpty, setCsvWasEmpty] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  function clearNotice() {
    setNotice(null)
    setLocalError(null)
  }

  function fail(reason: FailureReason, context: ErrorContext) {
    recordError(reason, context)
    setLocalError({ reason })
    setNotice(null)
  }

  /** 读取当前数据失败是存储故障，不是备份文件损坏；两者必须给出不同文案。 */
  async function readCurrent() {
    try {
      return await readBackupData()
    } catch {
      fail('storage-error', { operation: 'storage-read' })
      return null
    }
  }

  async function deliver(blob: Blob, filename: string) {
    const outcome = await deliverFile(blob, filename)
    const mapped = deliveryNotice(outcome)
    if (mapped) setNotice(mapped)
    else fail('delivery-failed', { operation: 'export-csv' })
  }

  async function exportZip() {
    if (storageUnavailable) return fail('storage-unavailable', { operation: 'export-backup' })
    if (!supportsBackupCompression()) return fail('compression-unsupported', { operation: 'export-backup' })

    setActivity('export')
    clearNotice()
    try {
      const data = await readCurrent()
      if (!data) return
      const payload = createBackupPayload(data, { exportedAt: new Date().toISOString() })
      const bytes = await createArchiveBytes(payload)
      const outcome = await deliverFile(bytesBlob(bytes), backupFileName(payload.exportedAt))
      const mapped = deliveryNotice(outcome)
      if (!mapped) return fail('delivery-failed', { operation: 'export-backup' })
      // 记账先落盘再给成功提示：提示可见即代表 lastBackupAt 已写入，提醒不会再催促。
      await onExported?.(payload.exportedAt)
      setNotice(mapped)
    } catch {
      fail('export-failed', { operation: 'export-backup' })
    } finally {
      setActivity(null)
    }
  }

  async function exportCsv() {
    if (storageUnavailable) return fail('storage-unavailable', { operation: 'export-csv' })

    setActivity('export')
    clearNotice()
    try {
      const data = await readCurrent()
      if (!data) return
      setCsvWasEmpty(data.diary.length === 0)
      const csv = diaryCsv(data.diary, csvLabels(t))
      await deliver(
        new Blob([csv], { type: 'text/csv;charset=utf-8' }),
        diaryFileName(today)
      )
    } catch {
      fail('export-failed', { operation: 'export-csv' })
    } finally {
      setActivity(null)
    }
  }

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // 允许用户取消后再次选择同一个文件。
    event.target.value = ''
    if (!file) return

    clearNotice()
    setPreview(null)
    setConfirmingOverwrite(false)
    setActivity('read')
    try {
      const context: ErrorContext = { operation: 'import-read', fileBytes: file.size }
      if (file.size > MAX_COMPRESSED_BYTES) return fail('archive-too-large', context)

      let bytes: Uint8Array
      try {
        bytes = new Uint8Array(await file.arrayBuffer())
      } catch {
        return fail('unreadable-file', context)
      }

      let archive
      try {
        archive = await readArchiveBytes(bytes)
      } catch (error) {
        return fail(archiveFailureReason(error), context)
      }

      const current = await readCurrent()
      if (!current) return
      setPreview({
        payload: archive.payload,
        manifest: archive.manifest,
        comparison: compareBackup(current, archive.payload, today)
      })
    } finally {
      setActivity(null)
    }
  }

  async function runImport(strategy: 'overwrite' | 'append') {
    if (!preview) return
    setActivity('import')
    clearNotice()

    let result
    try {
      result = await applyBackupImport(preview.payload, strategy)
    } catch {
      fail('import-failed', { operation: 'import-apply' })
      setActivity(null)
      return
    }

    setPreview(null)
    setConfirmingOverwrite(false)
    try {
      await onImported?.()
      setNotice(strategy === 'overwrite'
        ? { key: 'backupImportedOverwrite', values: { count: result.added } }
        : { key: 'backupImportedAppend', values: { added: result.added, skipped: result.skipped } })
    } catch {
      // 导入已经提交，不能说“当前数据未变”；这条错误记录留给错误面板。
      fail('refresh-failed', { operation: 'refresh' })
    } finally {
      setActivity(null)
    }
  }

  function discardPreview() {
    setPreview(null)
    setConfirmingOverwrite(false)
    clearNotice()
    if (fileInput.current) fileInput.current.value = ''
  }

  const comparison = preview?.comparison
  const disabled = busy || storageUnavailable

  return (
    <section className="backup-panel" aria-labelledby="backup-title">
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">{t('backupKicker')}</p>
          <h2 id="backup-title">{t('backupTitle')}</h2>
        </div>
        <span className="panel-symbol" aria-hidden="true">⇅</span>
      </div>
      <p className="backup-intro">{t('backupIntro')}</p>
      <p className="backup-caution">{t('backupEncryptionNote')}</p>

      {storageUnavailable && <p className="diary-alert" role="alert">{t('backupStorageUnavailable')}</p>}

      <div className="backup-actions">
        <button type="button" className="primary-button" onClick={() => void exportZip()} disabled={disabled}>
          {t('backupExportZip')}
        </button>
        <button type="button" className="secondary-button" onClick={() => void exportCsv()} disabled={disabled}>
          {t('backupExportCsv')}
        </button>
      </div>
      <p className="field-hint">{t('backupCsvNote')}</p>
      {csvWasEmpty && <p className="field-hint">{t('backupNoDiaryWarning')}</p>}
      <p className="field-hint">{t('backupLimitNote')}</p>

      <section className="backup-import" aria-labelledby="backup-import-title">
        <h3 id="backup-import-title">{t('backupImportTitle')}</h3>
        <p className="field-hint">{t('backupImportIntro')}</p>
        <div className="backup-file-row">
          <label className={`secondary-button backup-file-button ${disabled ? 'is-disabled' : ''}`}>
            {t('backupChooseFile')}
            <input
              ref={fileInput}
              className="visually-hidden"
              type="file"
              accept=".zip,application/zip"
              onChange={(event) => void chooseFile(event)}
              disabled={disabled}
            />
          </label>
        </div>

        {comparison && preview && (
          <div className="backup-preview" aria-labelledby="backup-preview-title">
            <h3 id="backup-preview-title">{t('backupPreviewTitle')}</h3>
            <p className="field-hint">{t('backupSummaryExportedAt', { time: momentText(t, preview.manifest.exportedAt) })}</p>
            {preview.manifest.rulesVersion !== BACKUP_RULES_VERSION && (
              <p className="backup-caution">
                {t('backupRulesRecomputed', { version: preview.manifest.rulesVersion })}
              </p>
            )}
            <div className="backup-compare">
              <section aria-label={t('backupPreviewCurrent')}>
                <h4>{t('backupPreviewCurrent')}</h4>
                <ul>
                  {summaryLines(t, comparison.current).map((line) => <li key={line}>{line}</li>)}
                </ul>
              </section>
              <section aria-label={t('backupPreviewBackup')}>
                <h4>{t('backupPreviewBackup')}</h4>
                <ul>
                  {summaryLines(t, comparison.backup).map((line) => <li key={line}>{line}</li>)}
                </ul>
              </section>
            </div>
            <p className="field-hint">
              {t('backupAppendPreview', { added: comparison.addedNights, skipped: comparison.duplicateNights })}
            </p>
            <p className="backup-caution">{t('backupOverwriteWarning')}</p>

            {confirmingOverwrite ? (
              <div className="backup-confirm" role="group" aria-labelledby="backup-confirm-title">
                <h4 id="backup-confirm-title">{t('backupOverwriteConfirmTitle')}</h4>
                <p>{t('backupOverwriteConfirmBody')}</p>
                <div className="backup-actions">
                  <button
                    type="button"
                    className="danger-button"
                    onClick={() => void runImport('overwrite')}
                    disabled={busy}
                  >
                    {t('backupOverwriteConfirm')}
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setConfirmingOverwrite(false)}
                    disabled={busy}
                  >
                    {t('backupOverwriteBack')}
                  </button>
                </div>
              </div>
            ) : (
              <div className="backup-actions">
                <button type="button" className="primary-button" onClick={() => void runImport('append')} disabled={busy}>
                  {t('backupAppend')}
                </button>
                <button type="button" className="danger-button" onClick={() => setConfirmingOverwrite(true)} disabled={busy}>
                  {t('backupOverwrite')}
                </button>
                <button type="button" className="secondary-button" onClick={discardPreview} disabled={busy}>
                  {t('backupCancelImport')}
                </button>
              </div>
            )}
          </div>
        )}

        {activity && (
          <p role="status">
            {activity === 'export' ? t('backupExporting') : activity === 'read' ? t('backupReading') : t('backupImporting')}
          </p>
        )}
        {notice && (
          <p className="backup-status" role="status">
            {t(notice.key, notice.values ?? {})}
          </p>
        )}
        {localError && (
          <p className="diary-alert" role="alert">
            {t(reasonKey[localError.reason])}
          </p>
        )}
      </section>
    </section>
  )
}
