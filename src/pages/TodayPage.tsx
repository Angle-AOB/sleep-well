import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  offlineMessage,
  storageMessage,
  type OfflineStatus,
  type PersistenceStatus,
  type StorageState
} from '../statusText'

type TodayPageProps = {
  hidden: boolean
  offlineStatus: OfflineStatus
  storageState: StorageState
  persistenceStatus: PersistenceStatus
  pendingSaves: number
  /** 到期提醒卡由应用决定是否出现，今日页只负责把它放在说明之前。 */
  reminder: ReactNode
  onRetryCache: () => void
}

export function TodayPage({
  hidden,
  offlineStatus,
  storageState,
  persistenceStatus,
  pendingSaves,
  reminder,
  onRetryCache
}: TodayPageProps) {
  const { t } = useTranslation()
  const offlineText = offlineMessage(t, offlineStatus)
  const storageText = storageMessage(t, storageState, pendingSaves)

  return (
    <section className="page" hidden={hidden} aria-labelledby="page-title">
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

      {reminder}

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
  )
}
