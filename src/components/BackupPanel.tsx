import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import {
  compareBackup,
  createBackupPayload,
  type BackupComparison,
  type BackupPayload,
  type BackupSummary
} from '../domain/backup'
import { BackupArchiveError, type BackupManifest } from '../domain/backupArchive'
import { diaryCsv } from '../domain/csv'
import { applyBackupImport, readBackupData, type BackupFailure, type BackupFailureReason } from '../data/backup'
import {
  backupFileName,
  bytesBlob,
  createArchiveBytes,
  deliverFile,
  diaryFileName,
  MAX_COMPRESSED_BYTES,
  readArchiveBytes,
  supportsBackupCompression
} from '../data/backupCodec'
import { localToday } from '../format'

type Notice = {
  tone: 'success' | 'info' | 'error'
  key: string
  values?: Record<string, unknown>
}

type Preview = {
  payload: BackupPayload
  manifest: BackupManifest
  comparison: BackupComparison
}

type BackupPanelProps = {
  storageUnavailable: boolean
  /** 导入成功后让应用重新读取日记、疗程、设置与筛查状态。 */
  onImported?: () => Promise<void> | void
  /** 留给后续错误面板消费的脱敏失败信息。 */
  onFailure?: (failure: BackupFailure) => void
}

function formatDay(value: string): string {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return value
  return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
    .format(new Date(year, month - 1, day))
}

function formatMoment(value: string): string {
  const moment = new Date(value)
  return Number.isNaN(moment.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(moment)
}

function summaryLines(t: TFunction, summary: BackupSummary): string[] {
  const lines: string[] = []
  if (summary.diaryCount === 0) {
    lines.push(t('backupSummaryNoDiary'))
  } else {
    lines.push(t('backupSummaryDiary', { count: summary.diaryCount }))
    if (summary.firstDate && summary.lastDate) {
      lines.push(t('backupSummaryRange', { first: formatDay(summary.firstDate), last: formatDay(summary.lastDate) }))
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
  return lines
}

function archiveFailureReason(error: unknown): BackupFailureReason {
  if (error instanceof BackupArchiveError) {
    if (error.kind === 'entry-too-large' || error.kind === 'archive-too-large' || error.kind === 'too-many-entries') {
      return 'archive-too-large'
    }
    if (error.kind === 'unsupported-schema') return 'future-version'
  }
  return 'archive-rejected'
}

function noticeForReason(reason: BackupFailureReason): Notice {
  switch (reason) {
    case 'storage-unavailable':
      return { tone: 'error', key: 'backupStorageUnavailable' }
    case 'compression-unsupported':
      return { tone: 'error', key: 'backupCompressionUnsupported' }
    case 'delivery-failed':
      return { tone: 'error', key: 'backupDeliveryFailed' }
    case 'unreadable-file':
      return { tone: 'error', key: 'backupFileUnreadable' }
    case 'archive-too-large':
      return { tone: 'error', key: 'backupArchiveTooLarge' }
    case 'future-version':
      return { tone: 'error', key: 'backupFutureVersion' }
    case 'archive-rejected':
      return { tone: 'error', key: 'backupArchiveRejected' }
    case 'import-failed':
      return { tone: 'error', key: 'backupImportFailed' }
    case 'export-failed':
      return { tone: 'error', key: 'backupExportError' }
  }
}

export function BackupPanel({ storageUnavailable, onImported, onFailure }: BackupPanelProps) {
  const { t } = useTranslation()
  const today = localToday()
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [confirmingOverwrite, setConfirmingOverwrite] = useState(false)
  const [csvWasEmpty, setCsvWasEmpty] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  function fail(operation: BackupFailure['operation'], reason: BackupFailureReason) {
    setNotice(noticeForReason(reason))
    onFailure?.({ operation, reason })
  }

  async function exportZip() {
    if (storageUnavailable) return fail('export-zip', 'storage-unavailable')
    if (!supportsBackupCompression()) return fail('export-zip', 'compression-unsupported')

    setBusy(true)
    setNotice(null)
    try {
      const data = await readBackupData()
      const payload = createBackupPayload(data, { exportedAt: new Date().toISOString() })
      const bytes = await createArchiveBytes(payload)
      const outcome = await deliverFile(bytesBlob(bytes), backupFileName(payload.exportedAt))
      if (outcome === 'cancelled') setNotice({ tone: 'info', key: 'backupDeliveredCancelled' })
      else if (outcome === 'shared') setNotice({ tone: 'success', key: 'backupDeliveredShared' })
      else if (outcome === 'downloaded') setNotice({ tone: 'success', key: 'backupDeliveredDownloaded' })
      else fail('export-zip', 'delivery-failed')
    } catch {
      fail('export-zip', 'export-failed')
    } finally {
      setBusy(false)
    }
  }

  async function exportCsv() {
    if (storageUnavailable) return fail('export-csv', 'storage-unavailable')

    setBusy(true)
    setNotice(null)
    try {
      const data = await readBackupData()
      setCsvWasEmpty(data.diary.length === 0)
      const csv = diaryCsv(data.diary)
      const outcome = await deliverFile(
        new Blob([csv], { type: 'text/csv;charset=utf-8' }),
        diaryFileName(today)
      )
      if (outcome === 'cancelled') setNotice({ tone: 'info', key: 'backupDeliveredCancelled' })
      else if (outcome === 'shared') setNotice({ tone: 'success', key: 'backupDeliveredShared' })
      else if (outcome === 'downloaded') setNotice({ tone: 'success', key: 'backupDeliveredDownloaded' })
      else fail('export-csv', 'delivery-failed')
    } catch {
      fail('export-csv', 'export-failed')
    } finally {
      setBusy(false)
    }
  }

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // 允许用户取消后再次选择同一个文件。
    event.target.value = ''
    if (!file) return

    setNotice(null)
    setPreview(null)
    setConfirmingOverwrite(false)
    setBusy(true)
    try {
      if (file.size > MAX_COMPRESSED_BYTES) return fail('import', 'archive-too-large')
      const bytes = new Uint8Array(await file.arrayBuffer())
      const archive = await readArchiveBytes(bytes)
      const current = await readBackupData()
      setPreview({
        payload: archive.payload,
        manifest: archive.manifest,
        comparison: compareBackup(current, archive.payload, today)
      })
    } catch (error) {
      fail('import', archiveFailureReason(error))
    } finally {
      setBusy(false)
    }
  }

  async function runImport(strategy: 'overwrite' | 'append') {
    if (!preview) return
    setBusy(true)
    setNotice(null)
    try {
      const result = await applyBackupImport(preview.payload, strategy)
      await onImported?.()
      setPreview(null)
      setConfirmingOverwrite(false)
      setNotice(strategy === 'overwrite'
        ? { tone: 'success', key: 'backupImportedOverwrite', values: { count: result.added } }
        : { tone: 'success', key: 'backupImportedAppend', values: { added: result.added, skipped: result.skipped } })
    } catch {
      fail('import', 'import-failed')
    } finally {
      setBusy(false)
    }
  }

  function discardPreview() {
    setPreview(null)
    setConfirmingOverwrite(false)
    setNotice(null)
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
          {busy && <span role="status">{t('backupReading')}</span>}
        </div>

        {comparison && preview && (
          <div className="backup-preview" aria-labelledby="backup-preview-title">
            <h3 id="backup-preview-title">{t('backupPreviewTitle')}</h3>
            <p className="field-hint">{t('backupSummaryExportedAt', { time: formatMoment(preview.manifest.exportedAt) })}</p>
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

        {busy && preview === null && <p role="status">{t('backupImporting')}</p>}
        {notice && (
          <p className={notice.tone === 'error' ? 'diary-alert' : 'backup-status'} role={notice.tone === 'error' ? 'alert' : 'status'}>
            {t(notice.key, notice.values ?? {})}
          </p>
        )}
      </section>
    </section>
  )
}
