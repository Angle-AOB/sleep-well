import { test, expect } from '@playwright/test'
import { deflateRawSync, inflateRawSync } from 'node:zlib'
import {
  createBackupArchive,
  createBackupManifest,
  DATA_ENTRY,
  MANIFEST_ENTRY,
  readBackupArchive,
  type BackupArchiveError
} from '../src/domain/backupArchive'
import { BACKUP_SCHEMA_VERSION, createBackupPayload, type BackupData } from '../src/domain/backup'
import { createZip } from '../src/domain/zip'
import type { SleepDiaryEntry } from '../src/domain/diary'

const deflate = async (bytes: Uint8Array): Promise<Uint8Array> => new Uint8Array(deflateRawSync(bytes))
const inflate = async (bytes: Uint8Array, maxBytes: number): Promise<Uint8Array> => {
  const result = new Uint8Array(inflateRawSync(bytes))
  if (result.byteLength > maxBytes) throw new Error('limit')
  return result
}
const encoder = new TextEncoder()
const archiveDate = new Date(2026, 10, 20, 8, 0, 0)
const decoder = new TextDecoder()

function entry(date: string): SleepDiaryEntry {
  return {
    date,
    lightsOffTime: '23:00',
    sleepOnsetLatencyMinutes: 30,
    finalWakeTime: '06:30',
    outOfBedTime: '07:00',
    nightWakes: 'none',
    waso: { kind: 'none-remembered' },
    tags: ['caffeine'],
    recordedAt: `${date}T07:05:00.000Z`,
    updatedAt: `${date}T07:05:00.000Z`
  }
}

function data(): BackupData {
  return {
    diary: [entry('2026-11-01'), entry('2026-11-02')],
    course: { startedOn: '2026-11-01', workPattern: 'regular', wakeTimes: [], deferredTitrations: [] },
    preferences: { backupReminders: true },
    screening: null
  }
}

function payload(appVersion = '0.1.0') {
  return createBackupPayload(data(), { exportedAt: '2026-11-20T08:00:00.000Z', appVersion })
}

async function expectArchiveError(action: () => Promise<unknown>, kind: BackupArchiveError['kind']) {
  await expect(action()).rejects.toMatchObject({ name: 'BackupArchiveError', kind })
}

test('a built archive round-trips the payload and its manifest', async () => {
  const source = payload()
  const bytes = await createBackupArchive(source, { deflate, modifiedAt: new Date(2026, 10, 20, 8, 0, 0) })
  const archive = await readBackupArchive(bytes, { inflate })

  expect(archive.payload).toEqual(source)
  expect(archive.manifest.format).toBe('sleep-well-backup')
  expect(archive.manifest.schemaVersion).toBe(BACKUP_SCHEMA_VERSION)
  expect(archive.manifest.appVersion).toBe('0.1.0')
  expect(archive.manifest.checksum.algorithm).toBe('crc32')
  expect(archive.manifest.checksum.value).toMatch(/^[0-9a-f]{8}$/)
})

test('the same payload and timestamp produce byte-identical archives', async () => {
  const modifiedAt = new Date(2026, 10, 20, 8, 0, 0)
  const first = await createBackupArchive(payload(), { deflate, modifiedAt })
  const second = await createBackupArchive(payload(), { deflate, modifiedAt })
  const later = await createBackupArchive(payload(), { deflate, modifiedAt: new Date(2026, 10, 21, 8, 0, 0) })

  expect(second).toEqual(first)
  expect(later).not.toEqual(first)
})

test('Chinese, emoji and line breaks in metadata survive the archive', async () => {
  const source = payload('版本一\n🌙 beta')
  const bytes = await createBackupArchive(source, { deflate, modifiedAt: archiveDate })
  const archive = await readBackupArchive(bytes, { inflate })
  expect(archive.payload.appVersion).toBe('版本一\n🌙 beta')
})

test('the data entry checksum is verified before the payload is trusted', async () => {
  const source = payload()
  const dataBytes = encoder.encode(JSON.stringify(source))
  const manifest = createBackupManifest(source, dataBytes)
  const tampered = new Uint8Array(dataBytes)
  tampered[tampered.length - 3] ^= 0x01

  const bytes = await createZip(
    [
      { name: MANIFEST_ENTRY, data: encoder.encode(JSON.stringify(manifest)) },
      { name: DATA_ENTRY, data: tampered }
    ],
    { deflate, modifiedAt: archiveDate }
  )

  await expectArchiveError(() => readBackupArchive(bytes, { inflate }), 'checksum-mismatch')
})

test('missing or unexpected entries are rejected', async () => {
  const source = payload()
  const dataBytes = encoder.encode(JSON.stringify(source))
  const manifest = createBackupManifest(source, dataBytes)

  const missing = await createZip([{ name: MANIFEST_ENTRY, data: encoder.encode(JSON.stringify(manifest)) }], { deflate, modifiedAt: archiveDate })
  await expectArchiveError(() => readBackupArchive(missing, { inflate }), 'missing-entry')

  const extra = await createZip(
    [
      { name: MANIFEST_ENTRY, data: encoder.encode(JSON.stringify(manifest)) },
      { name: DATA_ENTRY, data: dataBytes },
      { name: 'photo.jpg', data: encoder.encode('x') }
    ],
    { deflate, modifiedAt: archiveDate }
  )
  await expectArchiveError(() => readBackupArchive(extra, { inflate }), 'unexpected-entry')
})

test('invalid JSON and invalid payloads are rejected', async () => {
  const source = payload()
  const brokenJson = encoder.encode('{"schemaVersion":')
  const manifestForBroken = createBackupManifest(source, brokenJson)
  const broken = await createZip(
    [
      { name: MANIFEST_ENTRY, data: encoder.encode(JSON.stringify(manifestForBroken)) },
      { name: DATA_ENTRY, data: brokenJson }
    ],
    { deflate, modifiedAt: archiveDate }
  )
  await expectArchiveError(() => readBackupArchive(broken, { inflate }), 'invalid-json')

  const future = encoder.encode(JSON.stringify({ ...source, schemaVersion: 99 }))
  const futureManifest = createBackupManifest({ ...source, schemaVersion: 99 } as typeof source, future)
  const futureArchive = await createZip(
    [
      { name: MANIFEST_ENTRY, data: encoder.encode(JSON.stringify(futureManifest)) },
      { name: DATA_ENTRY, data: future }
    ],
    { deflate, modifiedAt: archiveDate }
  )
  await expectArchiveError(() => readBackupArchive(futureArchive, { inflate }), 'unsupported-schema')
})

test('a manifest that disagrees with the payload is rejected', async () => {
  const source = payload()
  const dataBytes = encoder.encode(JSON.stringify(source))
  const manifest = { ...createBackupManifest(source, dataBytes), schemaVersion: 0 }
  const bytes = await createZip(
    [
      { name: MANIFEST_ENTRY, data: encoder.encode(JSON.stringify(manifest)) },
      { name: DATA_ENTRY, data: dataBytes }
    ],
    { deflate, modifiedAt: archiveDate }
  )
  await expectArchiveError(() => readBackupArchive(bytes, { inflate }), 'manifest-mismatch')
})

test('zip-level attacks surface as archive errors', async () => {
  const bytes = await createBackupArchive(payload(), { deflate, modifiedAt: archiveDate })
  const truncated = bytes.slice(0, bytes.byteLength - 8)
  await expectArchiveError(() => readBackupArchive(truncated, { inflate }), 'missing-end-of-central-directory')

  const corrupted = bytes.slice()
  const view = new DataView(corrupted.buffer, corrupted.byteOffset, corrupted.byteLength)
  const nameLength = view.getUint16(26, true)
  corrupted[30 + nameLength + 4] ^= 0xff
  await expectArchiveError(() => readBackupArchive(corrupted, { inflate }), 'corrupt-entry')
})

test('the archive rejects a payload it cannot read even when the JSON is syntactically valid', async () => {
  const source = payload()
  const dataBytes = encoder.encode(JSON.stringify({ ...source, diary: [{ date: 'not-a-date' }] }))
  const manifest = createBackupManifest(source, dataBytes)
  const bytes = await createZip(
    [
      { name: MANIFEST_ENTRY, data: encoder.encode(JSON.stringify(manifest)) },
      { name: DATA_ENTRY, data: dataBytes }
    ],
    { deflate, modifiedAt: archiveDate }
  )
  await expectArchiveError(() => readBackupArchive(bytes, { inflate }), 'invalid-diary')
})

test('the manifest declares the data entry and its byte size', async () => {
  const source = payload()
  const manifest = createBackupManifest(source, encoder.encode(JSON.stringify(source)))
  expect(manifest.entries).toEqual([{ name: DATA_ENTRY, bytes: encoder.encode(JSON.stringify(source)).byteLength }])
  expect(decoder.decode(encoder.encode(JSON.stringify(manifest)))).toContain('data.json')
})

test('an independent reader using only zlib can read the exported bytes', async () => {
  const bytes = await createBackupArchive(payload(), { deflate, modifiedAt: archiveDate })
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const names: string[] = []
  let offset = 0

  // 只按 ZIP local file header 的公开布局扫描，不经过 src/domain/zip.ts。
  while (offset + 30 <= bytes.byteLength && view.getUint32(offset, true) === 0x04034b50) {
    const method = view.getUint16(offset + 8, true)
    const compressedSize = view.getUint32(offset + 18, true)
    const nameLength = view.getUint16(offset + 26, true)
    const extraLength = view.getUint16(offset + 28, true)
    const name = decoder.decode(bytes.subarray(offset + 30, offset + 30 + nameLength))
    const dataStart = offset + 30 + nameLength + extraLength
    const data = inflateRawSync(bytes.subarray(dataStart, dataStart + compressedSize))

    expect(method).toBe(8)
    if (name === DATA_ENTRY) {
      expect(JSON.parse(decoder.decode(data)).diary).toHaveLength(2)
    }
    names.push(name)
    offset = dataStart + compressedSize
  }

  expect(names).toEqual([MANIFEST_ENTRY, DATA_ENTRY])
})
