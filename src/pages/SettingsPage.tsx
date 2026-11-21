import { useTranslation } from 'react-i18next'
import { BackupPanel } from '../components/BackupPanel'
import { ErrorLogPanel } from '../components/ErrorLogPanel'
import { ScreeningPanel } from '../components/ScreeningPanel'
import type { Preferences } from '../data/preferences'
import type { ScreeningRecord } from '../domain/screening'
import { storageMessage, type StorageState } from '../statusText'

type SettingsPageProps = {
  hidden: boolean
  preferences: Preferences
  storageState: StorageState
  pendingSaves: number
  screening: ScreeningRecord | null
  screeningState: 'loading' | 'ready' | 'error'
  /** 导入备份后递增，让筛查面板重新挂载并读取已存储的记录。 */
  reloadToken: number
  onToggleReminders: (enabled: boolean) => void
  onSaveScreening: (record: ScreeningRecord) => Promise<void>
  onImported: () => Promise<void> | void
  onExported: (exportedAt: string) => Promise<void> | void
}

export function SettingsPage({
  hidden,
  preferences,
  storageState,
  pendingSaves,
  screening,
  screeningState,
  reloadToken,
  onToggleReminders,
  onSaveScreening,
  onImported,
  onExported
}: SettingsPageProps) {
  const { t } = useTranslation()
  const storageText = storageMessage(t, storageState, pendingSaves)

  return (
    <section className="page" hidden={hidden} aria-labelledby="page-title">
      <section className="preferences-panel" aria-labelledby="preferences-title">
        <div className="panel-heading">
          <div><p className="panel-kicker">{t('preferencesKicker')}</p><h2 id="preferences-title">{t('preferencesTitle')}</h2></div>
          <span className="panel-symbol" aria-hidden="true">◷</span>
        </div>
        <label className="toggle-row" htmlFor="backup-reminders">
          <span>{t('reminderLabel')}</span>
          <input
            id="backup-reminders"
            type="checkbox"
            checked={preferences.backupReminders}
            onChange={(event) => onToggleReminders(event.target.checked)}
            disabled={storageState === 'unsupported'}
          />
        </label>
        <p className={`storage-note ${storageState === 'error' || storageState === 'unsupported' ? 'note-error' : ''}`} role="status">{storageText}</p>
      </section>

      <ScreeningPanel
        key={`${screeningState}-${reloadToken}`}
        initialRecord={screeningState === 'ready' ? screening : null}
        loading={screeningState === 'loading'}
        storageUnavailable={storageState === 'unsupported' || screeningState === 'error'}
        onSave={onSaveScreening}
      />

      <BackupPanel
        storageUnavailable={storageState === 'unsupported'}
        onImported={onImported}
        onExported={onExported}
      />

      <ErrorLogPanel />

      <footer className="footer"><span>{t('footer')}</span><span>{t('footerMeta')}</span></footer>
    </section>
  )
}
