import { useTranslation } from 'react-i18next'

/**
 * 备份提醒卡：只消费领域层给出的提醒结论，不读时钟、不请求系统通知权限，
 * 也不依赖后台或离线定时——提醒在用户打开应用且领域规则判定到期时展示。
 */
type ReminderCardProps = {
  kind: 'first' | 'weekly'
  entryCount: number
  /** 一键关闭备份提醒（写 preferences.backupReminders）。 */
  onDisable: () => void
  /** 本次会话不再展示；节奏记账由应用在展示时写入。 */
  onDismiss: () => void
}

export function ReminderCard({ kind, entryCount, onDisable, onDismiss }: ReminderCardProps) {
  const { t } = useTranslation()
  return (
    <section className="reminder-card" aria-labelledby="reminder-title">
      <h2 id="reminder-title">{t('reminderCardTitle')}</h2>
      <p>
        {kind === 'first'
          ? t('reminderCardBodyFirst', { count: entryCount })
          : t('reminderCardBodyWeekly')}
      </p>
      <div className="backup-actions">
        <a className="secondary-button reminder-link" href="#backup-title">{t('reminderCardGoBackup')}</a>
        <button type="button" className="secondary-button" onClick={onDismiss}>{t('reminderCardLater')}</button>
        <button type="button" className="primary-button" onClick={onDisable}>{t('reminderCardDisable')}</button>
      </div>
    </section>
  )
}
