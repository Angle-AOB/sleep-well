import { test, expect } from '@playwright/test'
import { deflateRawSync, inflateRawSync } from 'node:zlib'
import {
  crc32,
  createZip,
  readZip,
  ZipError,
  ZIP_LIMITS,
  type ZipEntry,
  type ZipErrorKind
} from '../src/domain/zip'

const deflate = async (bytes: Uint8Array): Promise<Uint8Array> => new Uint8Array(deflateRawSync(bytes))
const inflate = async (bytes: Uint8Array, maxBytes: number): Promise<Uint8Array> => {
  const result = new Uint8Array(inflateRawSync(bytes))
  if (result.byteLength > maxBytes) throw new Error('decompressed data exceeds the limit')
  return result
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function zip(entries: ZipEntry[]) {
  return createZip(entries, { deflate, modifiedAt: new Date(2026, 10, 20, 8, 0, 0) })
}

async function expectZipError(action: () => Promise<unknown>, kind: ZipErrorKind) {
  await expect(action()).rejects.toMatchObject({ name: 'ZipError', kind })
}

/** 用任意声明字段拼一个 ZIP，用来模拟伪造头部的恶意文件。 */
function forgeZip(
  entries: { name: string; compressed: Uint8Array; uncompressedSize: number; crc: number; method?: number }[]
): Uint8Array {
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0

  for (const entry of entries) {
    const name = encoder.encode(entry.name)
    const method = entry.method ?? 8
    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(4, 20, true)
    local.setUint16(6, 0x0800, true)
    local.setUint16(8, method, true)
    local.setUint16(10, 0, true)
    local.setUint16(12, 0x5021, true)
    local.setUint32(14, entry.crc, true)
    local.setUint32(18, entry.compressed.byteLength, true)
    local.setUint32(22, entry.uncompressedSize, true)
    local.setUint16(26, name.byteLength, true)
    local.setUint16(28, 0, true)

    const central = new DataView(new ArrayBuffer(46))
    central.setUint32(0, 0x02014b50, true)
    central.setUint16(4, 20, true)
    central.setUint16(6, 20, true)
    central.setUint16(8, 0x0800, true)
    central.setUint16(10, method, true)
    central.setUint16(12, 0, true)
    central.setUint16(14, 0x5021, true)
    central.setUint32(16, entry.crc, true)
    central.setUint32(20, entry.compressed.byteLength, true)
    central.setUint32(24, entry.uncompressedSize, true)
    central.setUint16(28, name.byteLength, true)
    central.setUint32(42, offset, true)

    locals.push(new Uint8Array(local.buffer), name, entry.compressed)
    centrals.push(new Uint8Array(central.buffer), name)
    offset += 30 + name.byteLength + entry.compressed.byteLength
  }

  const centralSize = centrals.reduce((sum, part) => sum + part.byteLength, 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true)
  end.setUint16(8, entries.length, true)
  end.setUint16(10, entries.length, true)
  end.setUint32(12, centralSize, true)
  end.setUint32(16, offset, true)

  const parts = [...locals, ...centrals, new Uint8Array(end.buffer)]
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0)
  const output = new Uint8Array(total)
  let written = 0
  for (const part of parts) {
    output.set(part, written)
    written += part.byteLength
  }
  return output
}

function replaceBytes(bytes: Uint8Array, from: string, to: string): Uint8Array {
  const copy = bytes.slice()
  const needle = encoder.encode(from)
  const replacement = encoder.encode(to)
  if (needle.byteLength !== replacement.byteLength) throw new Error('replacement must keep the same length')
  for (let index = 0; index <= copy.byteLength - needle.byteLength; index += 1) {
    if (needle.every((byte, inner) => copy[index + inner] === byte)) copy.set(replacement, index)
  }
  return copy
}


test('CRC32 matches the standard check value', () => {
  expect(crc32(encoder.encode('123456789'))).toBe(0xcbf43926)
})

test('a backup archive round-trips names and bytes through DEFLATE', async () => {
  const entries: ZipEntry[] = [
    { name: 'manifest.json', data: encoder.encode('{"schemaVersion":1}') },
    { name: 'data.json', data: encoder.encode('{"diary":[]}') }
  ]

  const bytes = await zip(entries)
  // 本地文件头 signature，且压缩方法字段为 8（DEFLATE）。
  expect(bytes[0]).toBe(0x50)
  expect(bytes[1]).toBe(0x4b)
  expect(bytes[8]).toBe(8)

  const read = await readZip(bytes, { inflate })
  expect(read.map((entry) => entry.name)).toEqual(['manifest.json', 'data.json'])
  expect(decoder.decode(read[0].data)).toBe('{"schemaVersion":1}')
  expect(decoder.decode(read[1].data)).toBe('{"diary":[]}')
})

test('repetitive JSON is actually compressed', async () => {
  const payload = encoder.encode(JSON.stringify({ notes: '安静 '.repeat(2000) }))
  const bytes = await zip([{ name: 'data.json', data: payload }])
  expect(bytes.byteLength).toBeLessThan(payload.byteLength / 2)
})

test('writing rejects duplicate and path-traversal entry names', async () => {
  const duplicate = [
    { name: 'data.json', data: encoder.encode('{}') },
    { name: 'data.json', data: encoder.encode('[]') }
  ]
  await expectZipError(() => zip(duplicate), 'duplicate-entry')

  for (const name of ['../evil.json', '/absolute.json', 'folder\\evil.json', 'a/../../b.json', 'C:/evil.json']) {
    await expectZipError(() => zip([{ name, data: encoder.encode('{}') }]), 'unsafe-entry-name')
  }
})

test('reading rejects a duplicate entry name even if the archive claims to be valid', async () => {
  const bytes = await zip([
    { name: 'data.json', data: encoder.encode('{}') },
    { name: 'meta.json', data: encoder.encode('[]') }
  ])
  await expectZipError(() => readZip(replaceBytes(bytes, 'meta.json', 'data.json'), { inflate }), 'duplicate-entry')
})

test('reading rejects absolute paths and parent-directory segments', async () => {
  const traversal = await zip([{ name: 'manifest.json', data: encoder.encode('{}') }])
  await expectZipError(
    () => readZip(replaceBytes(traversal, 'manifest.json', '../manifest.x'), { inflate }),
    'unsafe-entry-name'
  )

  const absolute = forgeZip([{ name: '/etc/passwd', compressed: encoder.encode('x'), uncompressedSize: 1, crc: crc32(encoder.encode('x')), method: 0 }])
  await expectZipError(() => readZip(absolute, { inflate }), 'unsafe-entry-name')
})

test('reading rejects an unsupported or encrypted entry', async () => {
  const payload = encoder.encode('{}')
  const unsupported = forgeZip([
    { name: 'data.json', compressed: payload, uncompressedSize: payload.byteLength, crc: crc32(payload), method: 99 }
  ])
  await expectZipError(() => readZip(unsupported, { inflate }), 'unsupported-compression')

  const encrypted = await zip([{ name: 'data.json', data: payload }])
  const view = new DataView(encrypted.buffer, encrypted.byteOffset, encrypted.byteLength)
  const centralOffset = view.getUint32(encrypted.byteLength - 6, true)
  view.setUint16(centralOffset + 8, 0x0001, true)
  await expectZipError(() => readZip(encrypted, { inflate }), 'encrypted-entry')
})

test('an entry that declares itself too large is rejected before decompression', async () => {
  const bytes = await zip([{ name: 'data.json', data: encoder.encode('{}') }])
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const centralOffset = view.getUint32(bytes.byteLength - 6, true)
  view.setUint32(centralOffset + 24, ZIP_LIMITS.entryBytes + 1, true)

  await expectZipError(() => readZip(bytes, { inflate }), 'entry-too-large')
})

test('declared uncompressed sizes above the total budget are rejected', async () => {
  const payload = encoder.encode('{}')
  const bytes = forgeZip(
    ['a.json', 'b.json', 'c.json'].map((name) => ({
      name,
      compressed: payload,
      uncompressedSize: 1_900_000,
      crc: crc32(payload)
    }))
  )
  await expectZipError(() => readZip(bytes, { inflate }), 'archive-too-large')
})

test('a small file that decompresses past the entry budget is rejected as corrupt', async () => {
  // 压缩炸弹：声明 1 KB，实际解压 3 MB（超过单条上限）。
  const bomb = new Uint8Array(3 * 1024 * 1024)
  const declared = bomb.subarray(0, 1024)
  const bytes = forgeZip([
    {
      name: 'data.json',
      compressed: new Uint8Array(deflateRawSync(bomb)),
      uncompressedSize: declared.byteLength,
      crc: crc32(declared)
    }
  ])
  await expectZipError(() => readZip(bytes, { inflate }), 'corrupt-entry')
})

test('the decompression budget is reduced by every entry already extracted', async () => {
  const chunk = new Uint8Array(1_900_000)
  const small = encoder.encode('{}')
  const seen: number[] = []
  const bytes = await zip([
    { name: 'first.json', data: chunk },
    { name: 'second.json', data: chunk },
    { name: 'third.json', data: small }
  ])

  await readZip(bytes, {
    inflate: async (input, maxBytes) => {
      seen.push(maxBytes)
      return inflate(input, maxBytes)
    }
  })

  expect(seen[0]).toBe(ZIP_LIMITS.entryBytes)
  expect(seen[1]).toBe(ZIP_LIMITS.entryBytes)
  // 前两条已解压 3.8 MB，第三条只剩 1.2 MB 的总额度。
  expect(seen[2]).toBe(ZIP_LIMITS.totalBytes - chunk.byteLength * 2)
})

test('corrupted compressed data and truncated archives are rejected', async () => {
  const bytes = await zip([{ name: 'data.json', data: encoder.encode('{"diary":[]}') }])
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const nameLength = view.getUint16(26, true)
  const corrupted = bytes.slice()
  corrupted[30 + nameLength + 6] ^= 0xff
  await expectZipError(() => readZip(corrupted, { inflate }), 'corrupt-entry')

  await expectZipError(() => readZip(bytes.slice(0, bytes.byteLength - 10), { inflate }), 'missing-end-of-central-directory')
  await expectZipError(() => readZip(new Uint8Array(), { inflate }), 'empty-archive')
})

test('ZipError is the only failure surface for malformed archives', async () => {
  const error = await readZip(new Uint8Array([1, 2, 3]), { inflate }).catch((reason: unknown) => reason)
  expect(error).toBeInstanceOf(ZipError)
})

