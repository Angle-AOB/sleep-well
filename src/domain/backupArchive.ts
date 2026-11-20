/**
 * 迁移包的组装与读取。
 *
 * 容器固定包含两个条目：manifest.json 描述格式、版本、导出时间、条目大小和
 * data.json 的 CRC32 校验和；data.json 是完整载荷。读取时先校验 ZIP 结构，
 * 再校验校验和，最后才解析并校验载荷，任何一步失败都整包拒绝。
 */

import {
  parseBackupPayload,
  type BackupPayload
} from './backup'
import { crc32, createZip, readZip, ZipError, type DeflateRaw, type InflateRaw, type ZipErrorKind } from './zip'

export const MANIFEST_ENTRY = 'manifest.json'
export const DATA_ENTRY = 'data.json'
export const BACKUP_FILE_NAME = 'sleep-well.sleep-backup.zip'
export const BACKUP_FORMAT = 'sleep-well-backup'

export type BackupManifest = {
  format: typeof BACKUP_FORMAT
  schemaVersion: number
  appVersion: string
  rulesVersion: string
  courseVersion: string
  exportedAt: string
  checksum: { algorithm: 'crc32'; value: string }
  entries: { name: string; bytes: number }[]
}

export type BackupArchiveErrorKind =
  | ZipErrorKind
  | 'missing-entry'
  | 'unexpected-entry'
  | 'invalid-manifest'
  | 'invalid-json'
  | 'checksum-mismatch'
  | 'manifest-mismatch'
  | 'invalid-diary'
  | 'invalid-course'
  | 'invalid-preferences'
  | 'invalid-screening'
  | 'invalid-metadata'
  | 'not-an-object'
  | 'unsupported-schema'

export class BackupArchiveError extends Error {
  readonly kind: BackupArchiveErrorKind

  constructor(kind: BackupArchiveErrorKind) {
    super(kind)
    this.name = 'BackupArchiveError'
    this.kind = kind
  }
}

const encoder = new TextEncoder()

function decorateError(error: unknown): never {
  if (error instanceof ZipError) throw new BackupArchiveError(error.kind)
  if (error instanceof BackupArchiveError) throw error
  throw new BackupArchiveError('unexpected-error')
}

function decodeJson(bytes: Uint8Array): unknown {
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new BackupArchiveError('invalid-json')
  }
  try {
    return JSON.parse(text)
  } catch {
    throw new BackupArchiveError('invalid-json')
  }
}

function hex(value: number): string {
  return value.toString(16).padStart(8, '0')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseManifest(value: unknown): BackupManifest {
  if (!isRecord(value) || value.format !== BACKUP_FORMAT) throw new BackupArchiveError('invalid-manifest')
  if (!Number.isInteger(value.schemaVersion)) throw new BackupArchiveError('invalid-manifest')
  if (typeof value.appVersion !== 'string'
    || typeof value.rulesVersion !== 'string'
    || typeof value.courseVersion !== 'string'
    || typeof value.exportedAt !== 'string') {
    throw new BackupArchiveError('invalid-manifest')
  }
  const checksum = value.checksum
  if (!isRecord(checksum) || checksum.algorithm !== 'crc32' || typeof checksum.value !== 'string') {
    throw new BackupArchiveError('invalid-manifest')
  }
  if (!/^[0-9a-f]{8}$/.test(checksum.value)) throw new BackupArchiveError('invalid-manifest')
  if (!Array.isArray(value.entries)) throw new BackupArchiveError('invalid-manifest')
  const entries: { name: string; bytes: number }[] = []
  for (const item of value.entries) {
    if (!isRecord(item) || typeof item.name !== 'string' || !Number.isInteger(item.bytes)) {
      throw new BackupArchiveError('invalid-manifest')
    }
    entries.push({ name: item.name, bytes: item.bytes as number })
  }

  return {
    format: BACKUP_FORMAT,
    schemaVersion: value.schemaVersion as number,
    appVersion: value.appVersion,
    rulesVersion: value.rulesVersion,
    courseVersion: value.courseVersion,
    exportedAt: value.exportedAt,
    checksum: { algorithm: 'crc32', value: checksum.value },
    entries
  }
}

export function createBackupManifest(payload: BackupPayload, dataBytes: Uint8Array): BackupManifest {
  return {
    format: BACKUP_FORMAT,
    schemaVersion: payload.schemaVersion,
    appVersion: payload.appVersion,
    rulesVersion: payload.rulesVersion,
    courseVersion: payload.courseVersion,
    exportedAt: payload.exportedAt,
    checksum: { algorithm: 'crc32', value: hex(crc32(dataBytes)) },
    entries: [{ name: DATA_ENTRY, bytes: dataBytes.byteLength }]
  }
}

export async function createBackupArchive(
  payload: BackupPayload,
  options: { deflate: DeflateRaw; modifiedAt?: Date }
): Promise<Uint8Array> {
  try {
    const dataBytes = encoder.encode(JSON.stringify(payload))
    const manifest = createBackupManifest(payload, dataBytes)
    return await createZip(
      [
        { name: MANIFEST_ENTRY, data: encoder.encode(JSON.stringify(manifest)) },
        { name: DATA_ENTRY, data: dataBytes }
      ],
      options
    )
  } catch (error) {
    return decorateError(error)
  }
}

export type ReadBackupResult = {
  payload: BackupPayload
  manifest: BackupManifest
}

export async function readBackupArchive(
  bytes: Uint8Array,
  options: { inflate: InflateRaw }
): Promise<ReadBackupResult> {
  try {
    const entries = await readZip(bytes, options)
    const byName = new Map(entries.map((entry) => [entry.name, entry]))

    if (!byName.has(MANIFEST_ENTRY) || !byName.has(DATA_ENTRY)) {
      throw new BackupArchiveError('missing-entry')
    }
    if (entries.length !== 2 || entries.some((entry) => entry.name !== MANIFEST_ENTRY && entry.name !== DATA_ENTRY)) {
      throw new BackupArchiveError('unexpected-entry')
    }

    const manifest = parseManifest(decodeJson(byName.get(MANIFEST_ENTRY)!.data))
    const dataBytes = byName.get(DATA_ENTRY)!.data

    if (hex(crc32(dataBytes)) !== manifest.checksum.value) {
      throw new BackupArchiveError('checksum-mismatch')
    }
    const declared = manifest.entries.find((item) => item.name === DATA_ENTRY)
    if (!declared || declared.bytes !== dataBytes.byteLength) {
      throw new BackupArchiveError('manifest-mismatch')
    }

    const parsed = parseBackupPayload(decodeJson(dataBytes))
    if (!parsed.ok) throw new BackupArchiveError(parsed.error.kind)
    const payload = parsed.payload

    if (payload.schemaVersion !== manifest.schemaVersion
      || payload.appVersion !== manifest.appVersion
      || payload.rulesVersion !== manifest.rulesVersion
      || payload.courseVersion !== manifest.courseVersion
      || payload.exportedAt !== manifest.exportedAt) {
      throw new BackupArchiveError('manifest-mismatch')
    }

    return { payload, manifest }
  } catch (error) {
    return decorateError(error)
  }
}
