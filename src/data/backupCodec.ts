/**
 * 浏览器侧的平台适配：把领域层的 ZIP/迁移包函数接到 CompressionStream、
 * 文件分享与下载上。所有能力在缺失或被拒绝时降级，不把用户取消分享当作错误。
 *
 * 解压时按块读取并累计字节数，超过上限立即取消流，防止压缩炸弹先把内存吃满。
 */

import { createBackupArchive, readBackupArchive, type ReadBackupResult } from '../domain/backupArchive'
import type { BackupPayload } from '../domain/backup'
import type { DeflateRaw, InflateRaw } from '../domain/zip'

export const MAX_COMPRESSED_BYTES = 8 * 1024 * 1024

export function supportsBackupCompression(): boolean {
  if (typeof CompressionStream !== 'function' || typeof DecompressionStream !== 'function') return false
  try {
    void new CompressionStream('deflate-raw')
    void new DecompressionStream('deflate-raw')
    return true
  } catch {
    return false
  }
}

function toBlob(bytes: Uint8Array): Blob {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return new Blob([copy])
}

/** 把字节数组包成 Blob；Uint8Array 的 buffer 可能是共享缓冲区，先复制再交给 Blob。 */
export function bytesBlob(bytes: Uint8Array): Blob {
  return toBlob(bytes)
}

async function deflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = toBlob(bytes).stream().pipeThrough(new CompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

const inflateRaw: InflateRaw = async (bytes, maxBytes) => {
  const stream = toBlob(bytes).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel()
        throw new Error('decompressed data exceeds the limit')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const output = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    output.set(chunk, offset)
    offset += chunk.byteLength
  }
  return output
}

const deflate: DeflateRaw = deflateRaw

export function backupFileName(exportedAt: string): string {
  const day = exportedAt.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? `sleep-well-${day}.sleep-backup.zip` : 'sleep-well.sleep-backup.zip'
}

export function diaryFileName(today: string): string {
  return `sleep-well-diary-${today}.csv`
}

export function createArchiveBytes(payload: BackupPayload): Promise<Uint8Array> {
  return createBackupArchive(payload, { deflate })
}

export function readArchiveBytes(bytes: Uint8Array): Promise<ReadBackupResult> {
  return readBackupArchive(bytes, { inflate: inflateRaw })
}

export type DeliveryOutcome = 'shared' | 'downloaded' | 'cancelled' | 'unsupported'

type ShareCapableNavigator = Navigator & {
  canShare?: (data?: ShareData) => boolean
  share?: (data: ShareData) => Promise<void>
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
