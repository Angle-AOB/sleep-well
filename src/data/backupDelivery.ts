/**
 * 备份文件的交付层：命名、系统分享与浏览器下载。
 *
 * 与编解码分开，是因为「文件怎么生成」和「文件怎么交给用户」会独立变化：
 * 前者关心 ZIP/压缩，后者关心 Share API、下载回退与用户取消。
 */

import { BACKUP_FILE_NAME } from '../domain/backupArchive'

export type DeliveryOutcome = 'shared' | 'downloaded' | 'cancelled' | 'unsupported'

type ShareCapableNavigator = Navigator & {
  canShare?: (data?: ShareData) => boolean
  share?: (data: ShareData) => Promise<void>
}

/** 在基础文件名中插入导出日期；导出的 ZIP 始终以 `.sleep-backup.zip` 结尾。 */
export function backupFileName(exportedAt: string): string {
  const day = exportedAt.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(day)
    ? BACKUP_FILE_NAME.replace('.sleep-backup.zip', `-${day}.sleep-backup.zip`)
    : BACKUP_FILE_NAME
}

export function diaryFileName(today: string): string {
  return `sleep-well-diary-${today}.csv`
}

/**
 * 优先走系统分享（移动端可直接存到文件 App），不可用或失败时回退到下载。
 * 用户取消分享返回 'cancelled'：这不是错误，界面应给出中性提示。
 */
export async function deliverFile(blob: Blob, filename: string): Promise<DeliveryOutcome> {
  const sharing = navigator as ShareCapableNavigator
  const file = new File([blob], filename, { type: blob.type })

  if (typeof sharing.share === 'function'
    && typeof sharing.canShare === 'function'
    && sharing.canShare({ files: [file] })) {
    try {
      await sharing.share({ files: [file] })
      return 'shared'
    } catch (error) {
      // 用户取消分享不是错误；不同浏览器可能抛 DOMException 或其他带 name 的对象。
      if (typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AbortError') {
        return 'cancelled'
      }
    }
  }

  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') return 'unsupported'

  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener'
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
  return 'downloaded'
}
