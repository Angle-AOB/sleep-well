import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { readErrorRecords } from '../data/errorLog'
import { BACKUP_APP_VERSION } from '../domain/backup'
import {
  formatDiagnostics,
  formatIssueSummary,
  MAX_ERROR_RECORDS,
  type ErrorCategory,
  type ErrorRecord
} from '../domain/errorLog'

/**
 * 本地诊断信息面板：输出可检查的纯文本，提供复制与预填的 GitHub issue 链接。
 * 不做遥测、分析或自动上报；链接只含版本、环境与错误类别，用户公开前需自行检查隐私。
 * 诊断全文（含类别文案）不会自动上报；用户可自行检查后复制。
 */
export function ErrorLogPanel() {
  const { t } = useTranslation()
  const [records] = useState<readonly ErrorRecord[]>(() => readErrorRecords())
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')

  const meta = {
    appVersion: BACKUP_APP_VERSION,
    generatedAt: new Date().toISOString(),
    userAgent: navigator.userAgent,
    language: navigator.language
  }

  const diagnostics = formatDiagnostics(records, meta, {
    messageFor: (category: ErrorCategory) => t(`errorCategory.${category}`),
    note: t('errorLogPrivacyNote')
  })

  // issue 预填只带元信息与错误类别 code，不带错误消息原文与本地数据。
  const issueHref = 'https://github.com/Angle-AOB/sleep-well/issues/new'
    + `?title=${encodeURIComponent(t('errorLogIssueTitle', { version: BACKUP_APP_VERSION }))}`
    + `&body=${encodeURIComponent(formatIssueSummary(records, meta, {
      note: t('errorLogPrivacyNote')
    }))}`

  async function copyDiagnostics() {
    try {
      await navigator.clipboard.writeText(diagnostics)
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
  }

  return (
    <section className="error-log-panel" aria-label={t('errorLogTitle')}>
      <div className="error-log-body">
        <p className="field-hint">
          {t('errorLogCount', { count: records.length, max: MAX_ERROR_RECORDS })}
        </p>
        {records.length === 0 && <p className="field-hint">{t('errorLogEmpty')}</p>}
        <p className="backup-caution">{t('errorLogPrivacyNote')}</p>
        <p className="field-hint">{t('errorLogSessionOnlyNote')}</p>
        <pre className="error-log-text" tabIndex={0}>{diagnostics}</pre>
        <div className="backup-actions">
          <button type="button" className="primary-button" onClick={() => void copyDiagnostics()}>
            {t('errorLogCopy')}
          </button>
          <a
            className="secondary-button reminder-link"
            href={issueHref}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('errorLogIssueLink')}
          </a>
        </div>
        {copyState === 'copied' && <p className="backup-status" role="status">{t('errorLogCopied')}</p>}
        {copyState === 'failed' && <p className="diary-alert" role="alert">{t('errorLogCopyFailed')}</p>}
        <p className="field-hint">{t('errorLogIssueHint')}</p>
      </div>
    </section>
  )
}
