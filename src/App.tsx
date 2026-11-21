import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BackupPanel } from './components/BackupPanel'
import { CoursePanel } from './components/CoursePanel'
import { DiaryPanel } from './components/DiaryPanel'
import { ErrorLogPanel } from './components/ErrorLogPanel'
import { ReminderCard } from './components/ReminderCard'
import { ScreeningPanel } from './components/ScreeningPanel'
import { defaultPreferences, readPreferences, readScreening, writePreferences, writeScreening, type Preferences } from './data/preferences'
import { readDiaryEntries } from './data/diary'
import { MigrationError } from './data/database'
import { evaluateBackupReminder, type BackupReminderDecision } from './domain/reminders'
import type { ScreeningRecord } from './domain/screening'
import { localToday } from './format'
import { readCacheStatus } from './pwa'
import { hashForPage, pageFromHash, type Page } from './routing'
import './style.css'

type OfflineStatus = 'pending' | 'ready' | 'unsupported' | 'error'
type PersistenceStatus = 'pending' | 'granted' | 'denied' | 'unsupported'

declare global {
  interface Window {
    __SW_READY__?: Promise<ServiceWorkerRegistration>
  }
}

const pageTitleKeys: Record<Page, string> = {
  today: 'pageToday',
  diary: 'pageDiary',
  training: 'pageTraining',
  settings: 'pageSettings'
}

const navigationItems: { page: Page; icon: string }[] = [
  { page: 'today', icon: '◐' },
  { page: 'diary', icon: '☾' },
  { page: 'training', icon: '⑥' },
  { page: 'settings', icon: '◈' }
]

function App() {
  const { t } = useTranslation()
  const [page, setPage] = useState<Page>(() => pageFromHash(window.location.hash) ?? 'today')
  const headingRef = useRef<HTMLHeadingElement>(null)
  const mainRef = useRef<HTMLElement>(null)
  const lastPage = useRef<Page>(page)
  const [preferences, setPreferences] = useState<Preferences>(defaultPreferences)
  const [savedPreferences, setSavedPreferences] = useState<Preferences>(defaultPreferences)
  const [screening, setScreening] = useState<ScreeningRecord | null>(null)
  const [screeningState, setScreeningState] = useState<'loading' | 'ready' | 'error'>(() => 'loading')
  const [storageState, setStorageState] = useState<'loading' | 'ready' | 'error' | 'unsupported' | 'migration-failed'>(() =>
    window.indexedDB ? 'loading' : 'unsupported'
  )
  const [persistenceStatus, setPersistenceStatus] = useState<PersistenceStatus>(() =>
    'storage' in navigator && 'persist' in navigator.storage ? 'pending' : 'unsupported'
  )
  const [offlineStatus, setOfflineStatus] = useState<OfflineStatus>(() => {
    if (!('serviceWorker' in navigator)) return 'unsupported'
    return window.__SW_READY__ ? 'pending' : 'error'
  })
  const [diaryRevision, setDiaryRevision] = useState(0)
  const [reloadToken, setReloadToken] = useState(0)
  /** 打开应用时由领域规则给出的提醒结论；只在本次访问展示，不做后台定时。 */
  const [reminder, setReminder] = useState<Extract<BackupReminderDecision, { remind: true }> | null>(null)
  /** 设置是否已从本地加载完成；未加载前不展示提醒，避免默认值被当成用户选择。 */
  const [preferencesLoaded, setPreferencesLoaded] = useState(false)
  const [pendingSaves, setPendingSaves] = useState(0)
  const saveQueue = useRef(Promise.resolve())

  // 空地址、非页面锚点与未知地址都回落到今日，并替换地址，避免历史里留下无效项。
  useEffect(() => {
    if (pageFromHash(window.location.hash) === null) {
      window.history.replaceState(null, '', hashForPage('today'))
    }
  }, [])

  useEffect(() => {
    function onHashChange() {
      const next = pageFromHash(window.location.hash)
      if (next === null) {
        window.history.replaceState(null, '', hashForPage('today'))
        setPage('today')
        return
      }
      setPage(next)
    }

    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  // 首次加载不抢焦点；之后每次切页都回到页顶，并把焦点交给新页标题。
  useEffect(() => {
    if (lastPage.current === page) return
    lastPage.current = page
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
    headingRef.current?.focus()
  }, [page])

  useEffect(() => {
    if (!window.indexedDB) return

    let active = true
    Promise.all([readPreferences(), readScreening(), readDiaryEntries()]).then(([saved, savedScreening, entries]) => {
      if (!active) return
      setPreferences(saved)
      setSavedPreferences(saved)
      setPreferencesLoaded(true)
      setScreening(savedScreening)
      setStorageState('ready')
      setScreeningState('ready')

      const today = localToday()
      const decision = evaluateBackupReminder({ entries, preferences: saved, today, prefsLoaded: true })
      if (decision.remind) {
        setReminder(decision)
        // 展示即记账：写入最近提醒日期，才能保证每周最多一次。
        if (saved.lastBackupReminderOn !== today) {
          void updatePreference({ ...saved, lastBackupReminderOn: today })
        }
      }
    }).catch((error: unknown) => {
      if (active) {
        // 迁移失败不是存储空间问题：原有数据未被改动，提示必须区分。
        setStorageState(error instanceof MigrationError ? 'migration-failed' : 'error')
        setScreeningState('error')
      }
    })
    return () => { active = false }
    // 提醒评估只在打开应用时做一次；updatePreference 仅用于展示记账，不是本效果的依赖。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!('storage' in navigator) || !('persist' in navigator.storage)) return

    navigator.storage.persist().then((granted) => {
      setPersistenceStatus(granted ? 'granted' : 'denied')
    }).catch(() => {
      setPersistenceStatus('denied')
    })
  }, [])

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    let active = true
    readCacheStatus().then((status) => {
      if (active) setOfflineStatus(status)
    }).catch(() => {
      if (active) setOfflineStatus('error')
    })
    return () => { active = false }
  }, [])

  async function updatePreference(next: Preferences) {
    setPreferences(next)
    if (storageState === 'unsupported') return
    setStorageState('loading')
    // 计数未落盘的写入：只有队列清空后才提示“已保存”，避免下一次刷新丢掉刚点的设置。
    setPendingSaves((count) => count + 1)
    saveQueue.current = saveQueue.current.then(async () => {
      try {
        await writePreferences(next)
        setSavedPreferences(next)
        setStorageState('ready')
      } catch {
        setPreferences(savedPreferences)
        setStorageState('error')
      } finally {
        setPendingSaves((count) => count - 1)
      }
    })
    await saveQueue.current
  }

  async function updateScreening(next: ScreeningRecord) {
    if (storageState === 'unsupported') throw new Error('Local storage unavailable')
    setScreeningState('loading')
    try {
      await writeScreening(next)
      setScreening(next)
      setScreeningState('ready')
    } catch (error) {
      setScreeningState('error')
      throw error
    }
  }

  /** 导入提交成功后重新读取所有 store，避免界面继续展示导入前的状态。 */
  async function reloadAfterImport() {
    if (storageState === 'unsupported') return
    const [saved, savedScreening] = await Promise.all([readPreferences(), readScreening()])
    setPreferences(saved)
    setSavedPreferences(saved)
    setScreening(savedScreening)
    setScreeningState('ready')
    setDiaryRevision((revision) => revision + 1)
    setReloadToken((revision) => revision + 1)
  }

  function disableReminders() {
    setReminder(null)
    void updatePreference({ ...preferences, backupReminders: false })
  }

  const storageMessage = pendingSaves > 0
    ? t('saving')
    : storageState === 'ready'
      ? t('saved')
      : storageState === 'unsupported'
        ? t('storageUnavailable')
        : storageState === 'migration-failed'
          ? t('storageMigrationFailed')
          : storageState === 'error'
            ? t('storageError')
            : t('saving')

  const offlineMessage = offlineStatus === 'ready'
    ? t('offlineReady')
    : offlineStatus === 'unsupported'
      ? t('offlineUnsupported')
      : offlineStatus === 'error'
        ? t('offlineError')
        : t('offlinePending')

  async function retryCacheCheck() {
    setOfflineStatus('pending')
    try {
      setOfflineStatus(await readCacheStatus())
    } catch {
      setOfflineStatus('error')
    }
  }

  return (
    <>
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault()
          mainRef.current?.focus()
        }}
      >
        {t('skipToContent')}
      </a>

      <header className="topbar">
        <h1 id="page-title" ref={headingRef} tabIndex={-1}>{t(pageTitleKeys[page])}</h1>
      </header>

      <nav className="tabbar" aria-label={t('primaryNavigation')}>
        <div className="tabbar-inner">
          {navigationItems.map((item) => (
            <a
              key={item.page}
              className="tab-link"
              href={hashForPage(item.page)}
              aria-current={page === item.page ? 'page' : undefined}
            >
              <span className="tab-icon" aria-hidden="true">{item.icon}</span>
              <span>{t(pageTitleKeys[item.page])}</span>
            </a>
          ))}
        </div>
      </nav>

      <main className="page-shell" id="main-content" ref={mainRef} tabIndex={-1}>
        <section className="page" hidden={page !== 'today'} aria-labelledby="page-title">
          <section className="intro" aria-labelledby="intro-title">
            <div className="intro-copy">
              <p className="eyebrow">{t('eyebrow')}</p>
              <p className="intro-title" id="intro-title">{t('title')}</p>
              <p className="lead">{t('intro')}</p>
            </div>
            <div className="night-art" aria-hidden="true">
              <div className="moon" />
              <div className="horizon horizon-back" />
              <div className="horizon horizon-front" />
              <span className="star star-one">✳</span><span className="star star-two">✧</span>
              <span className="art-label">01 <i /> 06</span>
            </div>
          </section>

          <section className="status-row" aria-label={t('statusLabel')}>
            <div className={`status-item ${offlineStatus === 'ready' ? 'is-ready' : ''}`} role="status">
              <span className="status-icon" aria-hidden="true">⌁</span>
              <span>
                {offlineMessage}
                {offlineStatus === 'ready' && ` · ${t('offlineCacheComplete')}`}
              </span>
              {(offlineStatus === 'error' || offlineStatus === 'pending') && (
                <button type="button" className="status-retry" onClick={() => void retryCacheCheck()}>
                  {t('offlineRetry')}
                </button>
              )}
            </div>
            <div className={`status-item ${storageState === 'error' || storageState === 'unsupported' ? 'is-error' : ''}`} role="status">
              <span className="status-icon" aria-hidden="true">◉</span>
              <span>{storageMessage}</span>
            </div>
            {persistenceStatus !== 'unsupported' && persistenceStatus !== 'pending' && (
              <div className="status-item" role="status">
                <span className="status-icon" aria-hidden="true">◇</span>
                <span>{persistenceStatus === 'granted' ? t('storagePersisted') : t('storageBestEffort')}</span>
              </div>
            )}
          </section>

          {reminder && preferencesLoaded && preferences.backupReminders && (
            <ReminderCard
              kind={reminder.kind}
              entryCount={reminder.entryCount}
              onDisable={disableReminders}
              onDismiss={() => setReminder(null)}
            />
          )}

          <section className="content-grid" aria-label={t('productLabel')}>
            <article className="info-section">
              <div className="section-heading"><span className="section-index">01</span><h2>{t('scopeTitle')}</h2></div>
              <p>{t('scopeBody')}</p>
              <div className="info-rule" />
              <div className="section-heading"><span className="section-index">02</span><h2>{t('privacyTitle')}</h2></div>
              <p>{t('privacyBody')}</p>
              <ul className="boundary-list">
                <li><span aria-hidden="true">+</span> {t('noAccount')}</li>
                <li><span aria-hidden="true">+</span> {t('noUpload')}</li>
                <li><span aria-hidden="true">+</span> {t('localErrors')}</li>
              </ul>
            </article>
          </section>
        </section>

        <section className="page" hidden={page !== 'diary'} aria-labelledby="page-title">
          <DiaryPanel
            storageUnavailable={storageState === 'unsupported'}
            reloadToken={reloadToken}
            onSaved={() => setDiaryRevision((revision) => revision + 1)}
          />
        </section>

        <section className="page" hidden={page !== 'training'} aria-labelledby="page-title">
          <CoursePanel
            storageUnavailable={storageState === 'unsupported'}
            screening={screeningState === 'ready' ? screening : null}
            diaryRevision={diaryRevision}
            initialWakeTime={preferences.wakeTime}
          />
        </section>

        <section className="page" hidden={page !== 'settings'} aria-labelledby="page-title">
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
                onChange={(event) => void updatePreference({ ...preferences, backupReminders: event.target.checked })}
                disabled={storageState === 'unsupported'}
              />
            </label>
            <p className={`storage-note ${storageState === 'error' || storageState === 'unsupported' ? 'note-error' : ''}`} role="status">{storageMessage}</p>
          </section>

          <ScreeningPanel
            key={`${screeningState}-${reloadToken}`}
            initialRecord={screeningState === 'ready' ? screening : null}
            loading={screeningState === 'loading'}
            storageUnavailable={storageState === 'unsupported' || screeningState === 'error'}
            onSave={updateScreening}
          />

          <BackupPanel
            storageUnavailable={storageState === 'unsupported'}
            onImported={reloadAfterImport}
            onExported={(exportedAt) => updatePreference({ ...preferences, lastBackupAt: exportedAt })}
          />

          <ErrorLogPanel />

          <footer className="footer"><span>{t('footer')}</span><span>{t('footerMeta')}</span></footer>
        </section>
      </main>
    </>
  )
}

export default App
