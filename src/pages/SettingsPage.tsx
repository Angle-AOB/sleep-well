import { useTranslation } from 'react-i18next'
import { BackupPanel } from '../components/BackupPanel'
import { ErrorLogPanel } from '../components/ErrorLogPanel'
import { ScreeningPanel } from '../components/ScreeningPanel'
import type { Preferences } from '../data/preferences'
import type { ScreeningRecord } from '../domain/screening'
import {
  hashForSettingsSubPage,
  settingsItemId,
  settingsSubPages,
  type SettingsSubPage
} from '../routing'
import { settingsSubPageTitleKeys } from '../settingsSubPages'
import {
  offlineMessage,
  storageMessage,
  type OfflineStatus,
  type PersistenceStatus,
  type StorageState
} from '../statusText'

type SettingsPageProps = {
  hidden: boolean
  /** 路由里的设置子页；为 null 时渲染列表。 */
  subPage: SettingsSubPage | null
  preferences: Preferences
  storageState: StorageState
  pendingSaves: number
  offlineStatus: OfflineStatus
  persistenceStatus: PersistenceStatus
  screening: ScreeningRecord | null
  screeningState: 'loading' | 'ready' | 'error'
  /** 导入备份后递增，让筛查面板重新挂载并读取已存储的记录。 */
  reloadToken: number
  onToggleReminders: (enabled: boolean) => void
  onSaveScreening: (record: ScreeningRecord) => Promise<void>
  onImported: () => Promise<void> | void
  onExported: (exportedAt: string) => Promise<void> | void
  onRetryCache: () => void
  /** 打开同一份首次说明；只复看，不重置「已看过」标记。 */
  onShowFirstRun: () => void
}

function PreferencesPanel({
  preferences,
  storageState,
  pendingSaves,
  onToggleReminders
}: Pick<SettingsPageProps, 'preferences' | 'storageState' | 'pendingSaves' | 'onToggleReminders'>) {
  const { t } = useTranslation()
  const storageText = storageMessage(t, storageState, pendingSaves)

  return (
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
  )
}

function AboutPanel({ onShowFirstRun }: { onShowFirstRun: () => void }) {
  const { t } = useTranslation()

  return (
    <section className="about-panel" aria-labelledby="about-title">
      <div className="panel-heading">
        <div><p className="panel-kicker">{t('aboutKicker')}</p><h2 id="about-title">{t('aboutTitle')}</h2></div>
        <span className="panel-symbol" aria-hidden="true">◇</span>
      </div>

      <p className="about-brand">{t('brand')}</p>
      <p className="about-statement">{t('aboutNonMedical')}</p>

      <h3>{t('scopeTitle')}</h3>
      <p>{t('scopeBody')}</p>

      <h3>{t('privacyTitle')}</h3>
      <p>{t('privacyBody')}</p>
      <ul className="boundary-list">
        <li><span aria-hidden="true">+</span> {t('noAccount')}</li>
        <li><span aria-hidden="true">+</span> {t('noUpload')}</li>
        <li><span aria-hidden="true">+</span> {t('localErrors')}</li>
      </ul>
      <p className="local-only">{t('localOnly')}</p>

      <button type="button" className="secondary-button about-replay" onClick={onShowFirstRun}>
        {t('firstRunReplay')}
      </button>

      <footer className="footer"><span>{t('footer')}</span><span>{t('footerMeta')}</span></footer>
    </section>
  )
}

function SettingsStatus({
  offlineStatus,
  storageState,
  persistenceStatus,
  pendingSaves,
  onRetryCache
}: Pick<SettingsPageProps, 'offlineStatus' | 'storageState' | 'persistenceStatus' | 'pendingSaves' | 'onRetryCache'>) {
  const { t } = useTranslation()
  const offlineText = offlineMessage(t, offlineStatus)
  const storageText = storageMessage(t, storageState, pendingSaves)

  return (
    <section className="status-row settings-status" aria-label={t('statusLabel')}>
      <div className={`status-item ${offlineStatus === 'ready' ? 'is-ready' : ''}`} role="status">
        <span className="status-icon" aria-hidden="true">⌁</span>
        <span>
          {offlineText}
          {offlineStatus === 'ready' && ` · ${t('offlineCacheComplete')}`}
        </span>
        {(offlineStatus === 'error' || offlineStatus === 'pending') && (
          <button type="button" className="status-retry" onClick={onRetryCache}>
            {t('offlineRetry')}
          </button>
        )}
      </div>
      <div className={`status-item ${storageState === 'error' || storageState === 'unsupported' ? 'is-error' : ''}`} role="status">
        <span className="status-icon" aria-hidden="true">◉</span>
        <span>{storageText}</span>
      </div>
      {persistenceStatus !== 'unsupported' && persistenceStatus !== 'pending' && (
        <div className="status-item" role="status">
          <span className="status-icon" aria-hidden="true">◇</span>
          <span>{persistenceStatus === 'granted' ? t('storagePersisted') : t('storageBestEffort')}</span>
        </div>
      )}
    </section>
  )
}

export function SettingsPage({
  hidden,
  subPage,
  preferences,
  storageState,
  pendingSaves,
  offlineStatus,
  persistenceStatus,
  screening,
  screeningState,
  reloadToken,
  onToggleReminders,
  onSaveScreening,
  onImported,
  onExported,
  onRetryCache,
  onShowFirstRun
}: SettingsPageProps) {
  const { t } = useTranslation()

  return (
    <section className="page" hidden={hidden} aria-labelledby="page-title">
      {subPage === null ? (
        <>
          <nav className="settings-list" aria-label={t('settingsListLabel')}>
            <ul>
              {settingsSubPages.map((item) => (
                <li key={item}>
                  <a
                    id={settingsItemId(item)}
                    className="settings-item"
                    href={hashForSettingsSubPage(item)}
                  >
                    <span>{t(settingsSubPageTitleKeys[item])}</span>
                    <span className="settings-item-symbol" aria-hidden="true">→</span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          {/* 隐藏时不渲染状态段：出屏内容不能与今日页的同名状态文本冲突。 */}
          {!hidden && (
            <SettingsStatus
              offlineStatus={offlineStatus}
              storageState={storageState}
              persistenceStatus={persistenceStatus}
              pendingSaves={pendingSaves}
              onRetryCache={onRetryCache}
            />
          )}
        </>
      ) : (
        <div className="settings-subpage">
          {subPage === 'screening' && (
            <ScreeningPanel
              key={`${screeningState}-${reloadToken}`}
              initialRecord={screeningState === 'ready' ? screening : null}
              loading={screeningState === 'loading'}
              storageUnavailable={storageState === 'unsupported' || screeningState === 'error'}
              onSave={onSaveScreening}
            />
          )}

          {subPage === 'reminders' && (
            <PreferencesPanel
              preferences={preferences}
              storageState={storageState}
              pendingSaves={pendingSaves}
              onToggleReminders={onToggleReminders}
            />
          )}

          {subPage === 'backup' && (
            <BackupPanel
              storageUnavailable={storageState === 'unsupported'}
              onImported={onImported}
              onExported={onExported}
            />
          )}

          {subPage === 'diagnostics' && <ErrorLogPanel />}

          {subPage === 'about' && <AboutPanel onShowFirstRun={onShowFirstRun} />}
        </div>
      )}
    </section>
  )
}
