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
import { evaluateBackupReminder, type BackupReminderDecision } from './domain/reminders'
import type { ScreeningRecord } from './domain/screening'
import { localToday } from './format'
import './style.css'

type OfflineStatus = 'pending' | 'ready' | 'unsupported' | 'error'
type PersistenceStatus = 'pending' | 'granted' | 'denied' | 'unsupported'

declare global {
  interface Window {
    __SW_READY__?: Promise<ServiceWorkerRegistration>
  }
}

function App() {
  const { t } = useTranslation()
  const [preferences, setPreferences] = useState<Preferences>(defaultPreferences)
  const [savedPreferences, setSavedPreferences] = useState<Preferences>(defaultPreferences)
  const [screening, setScreening] = useState<ScreeningRecord | null>(null)
  const [screeningState, setScreeningState] = useState<'loading' | 'ready' | 'error'>(() => 'loading')
  const [storageState, setStorageState] = useState<'loading' | 'ready' | 'error' | 'unsupported'>(() =>
    'indexedDB' in window ? 'loading' : 'unsupported'
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

  useEffect(() => {
    if (!('indexedDB' in window)) return

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
    }).catch(() => {
      if (active) {
        setStorageState('error')
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
    async function checkCache() {
      const ready = window.__SW_READY__
      if (!ready) {
        if (active) setOfflineStatus('error')
        return
      }
      try {
        await ready
        const registration = await navigator.serviceWorker.ready
        const worker = registration.active
        if (!worker) throw new Error('Service worker is not active')
        const cacheNames = await caches.keys()
        const cacheName = cacheNames.find((name) => name.startsWith('workbox-precache'))
        if (!cacheName) {
          if (active) setOfflineStatus('pending')
          return
        }
        const cache = await caches.open(cacheName)
        const cachedRequests = await cache.keys()
        const hasDocument = cachedRequests.some((request) => new URL(request.url).pathname.endsWith('/index.html'))
        const hasApplicationCode = cachedRequests.some((request) => /\/assets\/index-.+\.js$/.test(new URL(request.url).pathname))
        if (active) setOfflineStatus(hasDocument && hasApplicationCode ? 'ready' : 'pending')
      } catch {
        if (active) setOfflineStatus('error')
      }
    }
    void checkCache()
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
      const ready = window.__SW_READY__
      if (!ready) throw new Error('no sw')
      await ready
      const registration = await navigator.serviceWorker.ready
      const worker = registration.active
      if (!worker) throw new Error('Service worker is not active')
      const cacheNames = await caches.keys()
      const cacheName = cacheNames.find((name) => name.startsWith('workbox-precache'))
      if (!cacheName) {
        setOfflineStatus('pending')
        return
      }
      const cache = await caches.open(cacheName)
      const cachedRequests = await cache.keys()
      const hasDocument = cachedRequests.some((request) => new URL(request.url).pathname.endsWith('/index.html'))
      const hasApplicationCode = cachedRequests.some((request) => /\/assets\/index-.+\.js$/.test(new URL(request.url).pathname))
      setOfflineStatus(hasDocument && hasApplicationCode ? 'ready' : 'pending')
    } catch {
      setOfflineStatus('error')
    }
  }

  return (
    <main className="page-shell">
      <header className="topbar">
        <a className="wordmark" href="#top" aria-label={t('brand')}>
          <span className="brand-mark" aria-hidden="true">眠</span>
          <span>{t('brand')}</span>
        </a>
        <span className="local-tag"><span className="status-dot" />{t('localOnly')}</span>
      </header>

      <section className="intro" id="top" aria-labelledby="page-title">
        <div className="intro-copy">
          <p className="eyebrow">{t('eyebrow')}</p>
          <h1 id="page-title">{t('title')}</h1>
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
      </section>

      <ScreeningPanel
        key={`${screeningState}-${reloadToken}`}
        initialRecord={screeningState === 'ready' ? screening : null}
        loading={screeningState === 'loading'}
        storageUnavailable={storageState === 'unsupported' || screeningState === 'error'}
        onSave={updateScreening}
      />

      <CoursePanel
        storageUnavailable={storageState === 'unsupported'}
        screening={screeningState === 'ready' ? screening : null}
        diaryRevision={diaryRevision}
        initialWakeTime={preferences.wakeTime}
      />

      <DiaryPanel
        storageUnavailable={storageState === 'unsupported'}
        reloadToken={reloadToken}
        onSaved={() => setDiaryRevision((revision) => revision + 1)}
      />

      <BackupPanel
        storageUnavailable={storageState === 'unsupported'}
        onImported={reloadAfterImport}
        onExported={(exportedAt) => updatePreference({ ...preferences, lastBackupAt: exportedAt })}
      />

      <ErrorLogPanel />

      <footer className="footer"><span>{t('footer')}</span><span>{t('footerMeta')}</span></footer>
    </main>
  )
}

export default App
