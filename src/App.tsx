import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { FirstRunDialog } from './components/FirstRunDialog'
import { ReminderCard } from './components/ReminderCard'
import { DiaryPage } from './pages/DiaryPage'
import { SettingsPage } from './pages/SettingsPage'
import { TodayPage } from './pages/TodayPage'
import { TrainingPage } from './pages/TrainingPage'
import { defaultPreferences, readPreferences, readScreening, writePreferences, writeScreening, type Preferences } from './data/preferences'
import { readDiaryEntries } from './data/diary'
import { MigrationError } from './data/database'
import type { LocalDate } from './domain/diary'
import { evaluateBackupReminder, type BackupReminderDecision } from './domain/reminders'
import type { ScreeningRecord } from './domain/screening'
import { localToday } from './format'
import { hasSeenFirstRun, markFirstRunSeen } from './firstRun'
import { readCacheStatus } from './pwa'
import { hashForPage, hashForSettingsSubPage, pages, type Page } from './routing'
import { settingsSubPageHeadingKeys } from './settingsSubPages'
import { usePageRouting } from './usePageRouting'
import type { OfflineStatus, PersistenceStatus, StorageState } from './statusText'
import './style.css'

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

/** 首次说明的两种打开方式：本设备首次打开，或从「关于与隐私」主动复看。 */
type FirstRunMode = 'auto' | 'replay'

/** 底栏顺序来自 routing 的 `pages`，新增页面只改那一处。 */
const navigationItems = pages

/** 底栏线性图标：24×24、描边取 currentColor，随文字颜色一起标识当前项。 */
const tabIcons: Record<Page, ReactNode> = {
  today: (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.4 5.4l1.6 1.6M17 17l1.6 1.6M18.6 5.4 17 7M7 17l-1.6 1.6" />
    </svg>
  ),
  diary: (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 3v18M12.5 8h3.5M12.5 12h3.5" />
    </svg>
  ),
  training: (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
      <path d="M5 20v-5M12 20V11M19 20V6" />
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
      <path d="M4 7h16M4 12h16M4 17h16" />
      <circle cx="9" cy="7" r="2" />
      <circle cx="15" cy="12" r="2" />
      <circle cx="8" cy="17" r="2" />
    </svg>
  )
}

function App() {
  const { t } = useTranslation()
  const { page, subPage, headingRef } = usePageRouting()
  const mainRef = useRef<HTMLElement>(null)
  const [preferences, setPreferences] = useState<Preferences>(defaultPreferences)
  const [savedPreferences, setSavedPreferences] = useState<Preferences>(defaultPreferences)
  const [screening, setScreening] = useState<ScreeningRecord | null>(null)
  const [screeningState, setScreeningState] = useState<'loading' | 'ready' | 'error'>(() => 'loading')
  const [storageState, setStorageState] = useState<StorageState>(() =>
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
  /**
   * 日记面板保活，选中日期不会因切页复位。今日卡需要显式请求一个日期，
   * 递增 token 让面板只应用一次，而不是每次 entries 变化都重新选中。
   */
  const [diaryRequest, setDiaryRequest] = useState<{ date: LocalDate; token: number } | null>(null)
  const diaryRequestToken = useRef(0)
  /** 打开应用时由领域规则给出的提醒结论；只在本次访问展示，不做后台定时。 */
  const [reminder, setReminder] = useState<Extract<BackupReminderDecision, { remind: true }> | null>(null)
  /** 设置是否已从本地加载完成；未加载前不展示提醒，避免默认值被当成用户选择。 */
  const [preferencesLoaded, setPreferencesLoaded] = useState(false)
  const [pendingSaves, setPendingSaves] = useState(0)
  const saveQueue = useRef(Promise.resolve())
  /** 本设备首次打开时自动打开；从关于页复看时也复用同一个弹窗。 */
  const [firstRun, setFirstRun] = useState<FirstRunMode | null>(() =>
    hasSeenFirstRun() ? null : 'auto'
  )

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

  /** 今日卡的三个入口都请求「今天」：链接照常导航，面板据 token 选中请求日期。 */
  function openDiary(date: LocalDate) {
    diaryRequestToken.current += 1
    setDiaryRequest({ date, token: diaryRequestToken.current })
  }

  async function retryCacheCheck() {
    setOfflineStatus('pending')
    try {
      setOfflineStatus(await readCacheStatus())
    } catch {
      setOfflineStatus('error')
    }
  }

  /**
   * 关闭首次说明。只有本设备首次自动展示那次写标记；从关于页复看不重置。
   * 两个主入口都改 hash，交给同一套页面路由处理。
   */
  function closeFirstRun(destination?: 'screening' | 'today') {
    if (firstRun === 'auto') markFirstRunSeen()
    setFirstRun(null)
    if (destination === 'screening') window.location.hash = hashForSettingsSubPage('screening')
    if (destination === 'today') window.location.hash = hashForPage('today')
  }

  /** 同一张提醒卡：今日页嵌在页面内，其他页面提到 `<main>` 顶部，保证深链也能看到。 */
  const reminderCard = reminder && preferencesLoaded && preferences.backupReminders
    ? (
      <ReminderCard
        kind={reminder.kind}
        entryCount={reminder.entryCount}
        onDisable={disableReminders}
        onDismiss={() => setReminder(null)}
      />
    )
    : null

  const pageTitle = page === 'settings' && subPage !== null
    ? t(settingsSubPageHeadingKeys[subPage])
    : t(pageTitleKeys[page])

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
        {page === 'settings' && subPage !== null && (
          <a className="topbar-back" href={hashForPage('settings')} aria-label={t('settingsBack')}>
            <span aria-hidden="true">←</span>
          </a>
        )}
        <h1 id="page-title" ref={headingRef} tabIndex={-1}>{pageTitle}</h1>
      </header>

      <nav className="tabbar" aria-label={t('primaryNavigation')}>
        <div className="tabbar-inner">
          {navigationItems.map((item) => (
            <a
              key={item}
              className="tab-link"
              href={hashForPage(item)}
              aria-current={page === item ? 'page' : undefined}
            >
              <span className="tab-icon" aria-hidden="true">{tabIcons[item]}</span>
              <span>{t(pageTitleKeys[item])}</span>
            </a>
          ))}
        </div>
      </nav>

      <main className="page-shell" id="main-content" ref={mainRef} tabIndex={-1}>
        {page !== 'today' && reminderCard}

        <TodayPage
          visible={page === 'today'}
          offlineStatus={offlineStatus}
          storageState={storageState}
          pendingSaves={pendingSaves}
          screening={screeningState === 'ready' ? screening : null}
          screeningState={screeningState}
          storageUnavailable={storageState === 'unsupported'}
          diaryRevision={diaryRevision}
          reminder={page === 'today' ? reminderCard : null}
          onRetryCache={() => void retryCacheCheck()}
          onOpenDiary={openDiary}
        />

        <DiaryPage
          hidden={page !== 'diary'}
          storageUnavailable={storageState === 'unsupported'}
          reloadToken={reloadToken}
          request={diaryRequest}
          onSaved={() => setDiaryRevision((revision) => revision + 1)}
        />

        <TrainingPage
          visible={page === 'training'}
          storageUnavailable={storageState === 'unsupported'}
          screening={screeningState === 'ready' ? screening : null}
          diaryRevision={diaryRevision}
          initialWakeTime={preferences.wakeTime}
        />

        <SettingsPage
          hidden={page !== 'settings'}
          subPage={page === 'settings' ? subPage : null}
          preferences={preferences}
          storageState={storageState}
          pendingSaves={pendingSaves}
          offlineStatus={offlineStatus}
          persistenceStatus={persistenceStatus}
          screening={screening}
          screeningState={screeningState}
          reloadToken={reloadToken}
          onToggleReminders={(enabled) => void updatePreference({ ...preferences, backupReminders: enabled })}
          onSaveScreening={updateScreening}
          onImported={reloadAfterImport}
          onExported={(exportedAt) => updatePreference({ ...preferences, lastBackupAt: exportedAt })}
          onRetryCache={() => void retryCacheCheck()}
          onShowFirstRun={() => setFirstRun('replay')}
        />
      </main>

      {firstRun !== null && (
        <FirstRunDialog
          onStartScreening={() => closeFirstRun('screening')}
          onRecordDiary={() => closeFirstRun('today')}
          onDismiss={() => closeFirstRun()}
        />
      )}
    </>
  )
}

export default App
