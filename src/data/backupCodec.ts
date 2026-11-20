/**
 * 浏览器侧的编解码适配：把领域层的 ZIP/迁移包函数接到 CompressionStream 上。
 * 压缩能力在缺失时降级，不把用户取消分享当作错误（交付见 backupDelivery）。
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

export function createArchiveBytes(payload: BackupPayload): Promise<Uint8Array> {
  // 时间只在这里读取一次；同一份数据 + 同一个时间参数必须产生同一份字节。
  return createBackupArchive(payload, { deflate, modifiedAt: new Date() })
}

export function readArchiveBytes(bytes: Uint8Array): Promise<ReadBackupResult> {
  return readBackupArchive(bytes, { inflate: inflateRaw })
}
