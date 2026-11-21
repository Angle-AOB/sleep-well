import type { TFunction } from 'i18next'

export type OfflineStatus = 'pending' | 'ready' | 'unsupported' | 'error'
export type PersistenceStatus = 'pending' | 'granted' | 'denied' | 'unsupported'
export type StorageState = 'loading' | 'ready' | 'error' | 'unsupported' | 'migration-failed'

/** 还有未落盘的写入时先显示“正在保存”，避免用户以为设置已经保存。 */
export function storageMessage(t: TFunction, state: StorageState, pendingSaves: number): string {
  if (pendingSaves > 0) return t('saving')
  if (state === 'ready') return t('saved')
  if (state === 'unsupported') return t('storageUnavailable')
  if (state === 'migration-failed') return t('storageMigrationFailed')
  if (state === 'error') return t('storageError')
  return t('saving')
}

export function offlineMessage(t: TFunction, status: OfflineStatus): string {
  if (status === 'ready') return t('offlineReady')
  if (status === 'unsupported') return t('offlineUnsupported')
  if (status === 'error') return t('offlineError')
  return t('offlinePending')
}
