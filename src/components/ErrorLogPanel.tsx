import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { readErrorRecords } from '../data/errorLog'
import { BACKUP_APP_VERSION } from '../domain/backup'
import { formatDiagnostics, MAX_ERROR_RECORDS, type ErrorRecord } from '../domain/errorLog'

/**
 * 本地诊断信息面板：默认折叠，输出可检查的纯文本，提供复制与预填的 GitHub issue 链接。
 * 不做遥测、分析或自动上报；链接只含版本与环境，用户公开前需自行检查隐私。
 */
export function ErrorLogPanel() {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const [records, setRecords] = useState<readonly ErrorRecord[]>(() => readErrorRecords())
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')

  function toggle() {
    setRecords(readErrorRecords())
    setCopyState('idle')
    setExpanded((current) => !current)
  }

  const diagnostics = formatDiagnostics(records, {
    appVersion: BACKUP_APP_VERSION,
    generatedAt: new Date().toISOString(),
    userAgent: navigator.userAgent,
    language: navigator.language
  }, { note: t('errorLogPrivacyNote') })

  const issueHref = 'https://github.com/Angle-AOB/sleep-well/issues/new'
    + `?title=${encodeURIComponent(t('errorLogIssueTitle', { version: BACKUP_APP_VERSION }))}`
    + `&body=${encodeURIComponent(diagnostics)}`

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
      <button
        type="button"
        className="secondary-button"
        aria-expanded={expanded}
        onClick={toggle}
      >
        {t('errorLogToggle')}
      </button>

      {expanded && (
        <div className="error-log-body">
          <p className="field-hint">
            {t('errorLogCount', { count: records.length, max: MAX_ERROR_RECORDS })}
          </p>
          {records.length === 0 && <p className="field-hint">{t('errorLogEmpty')}</p>}
          <p className="backup-caution">{t('errorLogPrivacyNote')}</p>
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
      )}
    </section>
  )
}
