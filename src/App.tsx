import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { defaultPreferences, readPreferences, writePreferences, type Preferences } from './data/preferences'
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
  const saveQueue = useRef(Promise.resolve())

  useEffect(() => {
    if (!('indexedDB' in window)) return

    let active = true
    readPreferences().then((saved) => {
      if (active) {
        setPreferences(saved)
        setSavedPreferences(saved)
        setStorageState('ready')
      }
    }).catch(() => {
      if (active) setStorageState('error')
    })
    return () => { active = false }
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
    const ready = window.__SW_READY__
    if (!ready) return

    ready.then(async () => {
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
    }).catch(() => {
      if (active) setOfflineStatus('error')
    })
    return () => { active = false }
  }, [])

  async function updatePreference(next: Preferences) {
    setPreferences(next)
    if (storageState === 'unsupported') return
    setStorageState('loading')
    saveQueue.current = saveQueue.current.then(async () => {
      try {
        await writePreferences(next)
        setSavedPreferences(next)
        setStorageState('ready')
      } catch {
        setPreferences(savedPreferences)
        setStorageState('error')
      }
    })
    await saveQueue.current
  }

  const storageMessage = storageState === 'ready'
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
          <span>{offlineMessage}</span>
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
          <label className="field-label" htmlFor="wake-time">{t('wakeTimeLabel')}</label>
          <input
            id="wake-time"
            type="time"
            value={preferences.wakeTime}
            onChange={(event) => void updatePreference({ ...preferences, wakeTime: event.target.value })}
            disabled={storageState === 'unsupported'}
          />
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

      <footer className="footer"><span>{t('footer')}</span><span>{t('footerMeta')}</span></footer>
    </main>
  )
}

export default App
