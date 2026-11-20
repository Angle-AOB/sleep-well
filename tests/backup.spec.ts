import { test, expect } from '@playwright/test'
import { deflateRawSync, inflateRawSync } from 'node:zlib'
import { crc32, createZip, readZip, type ZipEntry } from '../src/domain/zip'

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
