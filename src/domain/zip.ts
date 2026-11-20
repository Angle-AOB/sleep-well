/**
 * 迁移包使用的 ZIP 容器编解码。
 *
 * 只实现迁移包需要的最小子集：DEFLATE（方法 8）条目、无 ZIP64、无加密、无注释。
 * 压缩与解压通过参数注入，领域层不直接依赖 CompressionStream，因此可以在 Node 的
 * 测试里用 zlib 适配器验证同一套结构。
 *
 * 读取侧把 ZIP 当成不可信输入：先定位 EOCD 与 central directory，再逐条校验名字、
 * 方法、声明大小与实际解压字节；任何异常都返回带类型的中文错误代码，绝不接受
 * 路径穿越、重复条目或超出限额的解压。
 */

export type ZipEntry = {
  name: string
  data: Uint8Array
}

export type DeflateRaw = (bytes: Uint8Array) => Promise<Uint8Array>

export type InflateRaw = (bytes: Uint8Array, maxBytes: number) => Promise<Uint8Array>

export const ZIP_LIMITS = {
  /** 单个条目解压后的上限。 */
  entryBytes: 2 * 1024 * 1024,
  /** 全部条目解压后的总上限。 */
  totalBytes: 5 * 1024 * 1024,
  /** 条目数量上限；迁移包只需要 manifest 与 data 两条。 */
  entries: 8
} as const

export type ZipErrorKind =
  | 'empty-archive'
  | 'missing-end-of-central-directory'
  | 'invalid-central-directory'
  | 'too-many-entries'
  | 'unsupported-compression'
  | 'encrypted-entry'
  | 'zip64-unsupported'
  | 'duplicate-entry'
  | 'unsafe-entry-name'
  | 'entry-too-large'
  | 'archive-too-large'
  | 'corrupt-entry'
  | 'unexpected-error'

export class ZipError extends Error {
  readonly kind: ZipErrorKind

  constructor(kind: ZipErrorKind) {
    super(kind)
    this.name = 'ZipError'
    this.kind = kind
  }
}

const localSignature = 0x04034b50
const centralSignature = 0x02014b50
const endSignature = 0x06054b50
const deflateMethod = 8
const storeMethod = 0
const utf8Flag = 0x0800
const encryptedFlag = 0x0001
const zip64Sizes = 0xffffffff
const maxEndRecordSearch = 66_000

const crcTable = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    }
    table[index] = value >>> 0
  }
  return table
})()

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function assertSafeName(name: string): void {
  if (name.length === 0 || name.length > 180) throw new ZipError('unsafe-entry-name')
  if (name.startsWith('/') || name.startsWith('\\') || /^[A-Za-z]:/.test(name)) {
    throw new ZipError('unsafe-entry-name')
  }
  if (name.includes('\\') || name.includes('\0')) throw new ZipError('unsafe-entry-name')
  if (name.split('/').some((segment) => segment === '..' || segment === '.' || segment === '')) {
    throw new ZipError('unsafe-entry-name')
  }
}

function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.max(date.getFullYear(), 1980)
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  }
}

type ByteWriter = {
  bytes: Uint8Array
  view: DataView
  offset: number
}

function writer(size: number): ByteWriter {
  const bytes = new Uint8Array(size)
  return { bytes, view: new DataView(bytes.buffer), offset: 0 }
}

function u16(target: ByteWriter, value: number): void {
  target.view.setUint16(target.offset, value, true)
  target.offset += 2
}

function u32(target: ByteWriter, value: number): void {
  target.view.setUint32(target.offset, value >>> 0, true)
  target.offset += 4
}

function raw(target: ByteWriter, value: Uint8Array): void {
  target.bytes.set(value, target.offset)
  target.offset += value.byteLength
}

export async function createZip(
  entries: ZipEntry[],
  options: { deflate: DeflateRaw; modifiedAt?: Date }
): Promise<Uint8Array> {
  if (entries.length === 0) throw new ZipError('empty-archive')
  if (entries.length > ZIP_LIMITS.entries) throw new ZipError('too-many-entries')

  const names = new Set<string>()
  for (const entry of entries) {
    assertSafeName(entry.name)
    if (names.has(entry.name)) throw new ZipError('duplicate-entry')
    names.add(entry.name)
    if (entry.data.byteLength > ZIP_LIMITS.entryBytes) throw new ZipError('entry-too-large')
  }

  const encoder = new TextEncoder()
  const { time, date } = dosDateTime(options.modifiedAt ?? new Date())
  const prepared: { name: Uint8Array; source: Uint8Array; compressed: Uint8Array; crc: number }[] = []

  for (const entry of entries) {
    prepared.push({
      name: encoder.encode(entry.name),
      source: entry.data,
      compressed: await options.deflate(entry.data),
      crc: crc32(entry.data)
    })
  }

  const totalSize = prepared.reduce((sum, entry) => sum + entry.source.byteLength, 0)
  if (totalSize > ZIP_LIMITS.totalBytes) throw new ZipError('archive-too-large')

  const localSize = prepared.reduce((sum, entry) => {
    return sum + 30 + entry.name.byteLength + entry.compressed.byteLength
  }, 0)
  const centralSize = prepared.reduce((sum, entry) => {
    return sum + 46 + entry.name.byteLength
  }, 0)
  const archive = writer(localSize + centralSize + 22)
  const offsets: number[] = []

  for (const entry of prepared) {
    offsets.push(archive.offset)
    u32(archive, localSignature)
    u16(archive, 20)
    u16(archive, utf8Flag)
    u16(archive, deflateMethod)
    u16(archive, time)
    u16(archive, date)
    u32(archive, entry.crc)
    u32(archive, entry.compressed.byteLength)
    u32(archive, entry.source.byteLength)
    u16(archive, entry.name.byteLength)
    u16(archive, 0)
    raw(archive, entry.name)
    raw(archive, entry.compressed)
  }

  const centralStart = archive.offset
  prepared.forEach((entry, index) => {
    u32(archive, centralSignature)
    u16(archive, 20)
    u16(archive, 20)
    u16(archive, utf8Flag)
    u16(archive, deflateMethod)
    u16(archive, time)
    u16(archive, date)
    u32(archive, entry.crc)
    u32(archive, entry.compressed.byteLength)
    u32(archive, entry.source.byteLength)
    u16(archive, entry.name.byteLength)
    u16(archive, 0)
    u16(archive, 0)
    u16(archive, 0)
    u16(archive, 0)
    u32(archive, 0)
    u32(archive, offsets[index])
    raw(archive, entry.name)
  })

  const centralBytes = archive.offset - centralStart

  u32(archive, endSignature)
  u16(archive, 0)
  u16(archive, 0)
  u16(archive, prepared.length)
  u16(archive, prepared.length)
  u32(archive, centralBytes)
  u32(archive, centralStart)
  u16(archive, 0)

  return archive.bytes
}

type CentralRecord = {
  name: string
  method: number
  flags: number
  crc: number
  compressedSize: number
  uncompressedSize: number
  localOffset: number
}

function findEndRecord(view: DataView, length: number): number {
  const start = Math.max(0, length - maxEndRecordSearch)
  for (let offset = length - 22; offset >= start; offset -= 1) {
    if (view.getUint32(offset, true) === endSignature) return offset
  }
  throw new ZipError('missing-end-of-central-directory')
}

function entryName(bytes: Uint8Array, start: number, length: number): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(start, start + length))
  } catch {
    throw new ZipError('unsafe-entry-name')
  }
}

function readCentralDirectory(bytes: Uint8Array, view: DataView, endOffset: number): CentralRecord[] {
  const count = view.getUint16(endOffset + 10, true)
  const size = view.getUint32(endOffset + 12, true)
  const start = view.getUint32(endOffset + 16, true)

  if (count === 0) throw new ZipError('empty-archive')
  if (count > ZIP_LIMITS.entries) throw new ZipError('too-many-entries')
  if (start + size > endOffset) throw new ZipError('invalid-central-directory')

  const records: CentralRecord[] = []
  let offset = start

  for (let index = 0; index < count; index += 1) {
    if (offset + 46 > endOffset || view.getUint32(offset, true) !== centralSignature) {
      throw new ZipError('invalid-central-directory')
    }

    const flags = view.getUint16(offset + 8, true)
    const method = view.getUint16(offset + 10, true)
    const crc = view.getUint32(offset + 16, true)
    const compressedSize = view.getUint32(offset + 20, true)
    const uncompressedSize = view.getUint32(offset + 24, true)
    const nameLength = view.getUint16(offset + 28, true)
    const extraLength = view.getUint16(offset + 30, true)
    const commentLength = view.getUint16(offset + 32, true)
    const localOffset = view.getUint32(offset + 42, true)
    const name = entryName(bytes, offset + 46, nameLength)

    assertSafeName(name)
    if (flags & encryptedFlag) throw new ZipError('encrypted-entry')
    if (method !== deflateMethod && method !== storeMethod) throw new ZipError('unsupported-compression')
    if (uncompressedSize === zip64Sizes || compressedSize === zip64Sizes) {
      throw new ZipError('zip64-unsupported')
    }

    records.push({ name, method, flags, crc, compressedSize, uncompressedSize, localOffset })
    offset += 46 + nameLength + extraLength + commentLength
  }

  const names = new Set<string>()
  for (const record of records) {
    if (names.has(record.name)) throw new ZipError('duplicate-entry')
    names.add(record.name)
  }

  const declaredTotal = records.reduce((sum, record) => sum + record.uncompressedSize, 0)
  if (declaredTotal > ZIP_LIMITS.totalBytes) throw new ZipError('archive-too-large')
  for (const record of records) {
    if (record.uncompressedSize > ZIP_LIMITS.entryBytes) throw new ZipError('entry-too-large')
  }

  return records
}

async function extractEntry(
  bytes: Uint8Array,
  view: DataView,
  record: CentralRecord,
  inflate: InflateRaw,
  budget: number
): Promise<Uint8Array> {
  const offset = record.localOffset
  if (offset + 30 > bytes.byteLength || view.getUint32(offset, true) !== localSignature) {
    throw new ZipError('corrupt-entry')
  }

  const localMethod = view.getUint16(offset + 8, true)
  const nameLength = view.getUint16(offset + 26, true)
  const extraLength = view.getUint16(offset + 28, true)
  const localName = entryName(bytes, offset + 30, nameLength)
  if (localName !== record.name || localMethod !== record.method) throw new ZipError('corrupt-entry')

  const dataStart = offset + 30 + nameLength + extraLength
  const dataEnd = dataStart + record.compressedSize
  if (dataEnd > bytes.byteLength) throw new ZipError('corrupt-entry')
  const compressed = bytes.subarray(dataStart, dataEnd)

  let data: Uint8Array
  if (record.method === storeMethod) {
    if (record.compressedSize !== record.uncompressedSize) throw new ZipError('corrupt-entry')
    data = compressed.slice()
  } else {
    try {
      data = await inflate(compressed, Math.min(budget, ZIP_LIMITS.entryBytes))
    } catch {
      throw new ZipError('corrupt-entry')
    }
  }

  if (data.byteLength !== record.uncompressedSize || crc32(data) !== record.crc) {
    throw new ZipError('corrupt-entry')
  }
  return data
}

export async function readZip(
  bytes: Uint8Array,
  options: { inflate: InflateRaw }
): Promise<ZipEntry[]> {
  if (bytes.byteLength === 0) throw new ZipError('empty-archive')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const endOffset = findEndRecord(view, bytes.byteLength)
  const records = readCentralDirectory(bytes, view, endOffset)

  const entries: ZipEntry[] = []
  let remaining = ZIP_LIMITS.totalBytes
  for (const record of records) {
    const data = await extractEntry(bytes, view, record, options.inflate, remaining)
    remaining -= data.byteLength
    entries.push({ name: record.name, data })
  }
  return entries
}
