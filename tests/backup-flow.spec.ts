import { test, expect } from '@playwright/test'
import type { Download, Page, TestInfo } from '@playwright/test'
import { readFile, writeFile } from 'node:fs/promises'
import { deflateRawSync, inflateRawSync } from 'node:zlib'
import {
  createBackupPayload,
  type BackupData,
  type BackupPayload
} from '../src/domain/backup'
import { createBackupArchive, readBackupArchive } from '../src/domain/backupArchive'
import { crc32 } from '../src/domain/zip'
import type { SleepDiaryEntry } from '../src/domain/diary'

const deflate = async (bytes: Uint8Array): Promise<Uint8Array> => new Uint8Array(deflateRawSync(bytes))
const inflate = async (bytes: Uint8Array, maxBytes: number): Promise<Uint8Array> => {
  const result = new Uint8Array(inflateRawSync(bytes))
  if (result.byteLength > maxBytes) throw new Error('limit')
  return result
}

const encoder = new TextEncoder()

function backupPanel(page: Page) {
  return page.getByRole('region', { name: '本地备份与导出' })
}

function diaryPanel(page: Page) {
  return page.getByRole('region', { name: '晨间睡眠日记' })
}

function coursePanel(page: Page) {
  return page.getByRole('region', { name: '六周训练' })
}

async function openApp(page: Page, time = '2026-11-20T09:00:00') {
  await page.clock.setFixedTime(new Date(time))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '本地备份与导出' })).toBeVisible()
}

async function recordNight(page: Page, date: string, options: { waso?: string; quality?: string } = {}) {
  const diary = diaryPanel(page)
  await diary.locator('#diary-date').fill(date)
  await diary.locator('#lights-off').fill('23:00')
  await diary.locator('#sleep-onset').fill('30')
  await diary.locator('#final-wake').fill('06:30')
  await diary.locator('#out-of-bed').fill('07:00')
  if (options.waso === undefined) {
    await diary.locator('#waso').selectOption('none-remembered')
  } else {
    await diary.locator('#waso').selectOption(options.waso)
  }
  if (options.quality) {
    await diary.getByRole('radio', { name: options.quality }).check()
  }
  await diary.getByRole('button', { name: /保存日记|更新日记/ }).click()
  await expect(diary.getByText('日记已保存在此设备')).toBeVisible()
}

async function exportZip(page: Page): Promise<{ download: Download; bytes: Uint8Array; filename: string }> {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    backupPanel(page).getByRole('button', { name: '导出完整备份（ZIP）' }).click()
  ])
  const path = await download.path()
  expect(path).not.toBeNull()
  return { download, bytes: new Uint8Array(await readFile(path!)), filename: download.suggestedFilename() }
}

async function exportCsv(page: Page): Promise<{ text: string; filename: string }> {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    backupPanel(page).getByRole('button', { name: '导出日记（CSV）' }).click()
  ])
  const path = await download.path()
  expect(path).not.toBeNull()
  return { text: await readFile(path!, 'utf8'), filename: download.suggestedFilename() }
}

async function importFile(page: Page, testInfo: TestInfo, name: string, bytes: Uint8Array): Promise<void> {
  const path = testInfo.outputPath(name)
  await writeFile(path, bytes)
  await page.locator('input[type="file"]').setInputFiles(path)
}

function entry(date: string, overrides: Partial<SleepDiaryEntry> = {}): SleepDiaryEntry {
  return {
    date,
    lightsOffTime: '23:00',
    sleepOnsetLatencyMinutes: 30,
    finalWakeTime: '06:30',
    outOfBedTime: '07:00',
    nightWakes: 'none',
    waso: { kind: 'none-remembered' },
    tags: [],
    recordedAt: `${date}T07:05:00.000Z`,
    updatedAt: `${date}T07:05:00.000Z`,
    ...overrides
  }
}

function backupData(dates: string[]): BackupData {
  return {
    diary: dates.map((date) => entry(date)),
    course: { startedOn: '2026-11-10', workPattern: 'regular', wakeTimes: [{ time: '06:30', decidedOn: '2026-11-10' }], deferredTitrations: [] },
    preferences: { backupReminders: false },
    screening: null
  }
}

function payloadWith(dates: string[]): BackupPayload {
  return createBackupPayload(backupData(dates), { exportedAt: '2026-11-19T20:00:00.000Z' })
}

function archiveBytes(payload: BackupPayload): Promise<Uint8Array> {
  return createBackupArchive(payload, { deflate })
}

/** 用任意声明字段拼一个 ZIP，模拟伪造头部/路径穿越的恶意文件。 */
function forgeZip(entries: { name: string; data: string; declaredSize?: number; method?: number }[]): Uint8Array {
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0

  for (const item of entries) {
    const name = encoder.encode(item.name)
    const raw = encoder.encode(item.data)
    const compressed = item.method === 0 ? raw : new Uint8Array(deflateRawSync(raw))
    const uncompressedSize = item.declaredSize ?? raw.byteLength
    const method = item.method ?? 8
    const checksum = crc32(raw)

    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(4, 20, true)
    local.setUint16(6, 0x0800, true)
    local.setUint16(8, method, true)
    local.setUint32(14, checksum, true)
    local.setUint32(18, compressed.byteLength, true)
    local.setUint32(22, uncompressedSize, true)
    local.setUint16(26, name.byteLength, true)

    const central = new DataView(new ArrayBuffer(46))
    central.setUint32(0, 0x02014b50, true)
    central.setUint16(4, 20, true)
    central.setUint16(6, 20, true)
    central.setUint16(8, 0x0800, true)
    central.setUint16(10, method, true)
    central.setUint32(16, checksum, true)
    central.setUint32(20, compressed.byteLength, true)
    central.setUint32(24, uncompressedSize, true)
    central.setUint16(28, name.byteLength, true)
    central.setUint32(42, offset, true)

    locals.push(new Uint8Array(local.buffer), name, compressed)
    centrals.push(new Uint8Array(central.buffer), name)
    offset += 30 + name.byteLength + compressed.byteLength
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

test('a downloaded ZIP restores diary, course and settings after the device data is cleared', async ({ page }, testInfo) => {
  await openApp(page)
  await recordNight(page, '2026-11-18')
  await recordNight(page, '2026-11-19', { quality: '4 分' })

  // 关掉备份提醒，作为“设置随迁移包恢复”的观察点。导出与写入共用 IndexedDB 的
  // 事务顺序，因此这里不必等待界面回显就能读到最新设置。
  await page.getByLabel('启用备份提醒').uncheck()

  await coursePanel(page).getByRole('button', { name: '开始六周训练' }).click()
  await expect(coursePanel(page).getByText('第 1 周 · 第 1 天')).toBeVisible()

  const exported = await exportZip(page)
  expect(exported.filename).toMatch(/\.sleep-backup\.zip$/)
  await expect(backupPanel(page).getByText('已交给浏览器下载')).toBeVisible()

  const archive = await readBackupArchive(exported.bytes, { inflate })
  expect(archive.payload.diary).toHaveLength(2)
  expect(archive.payload.course?.startedOn).toBe('2026-11-20')
  expect(archive.payload.preferences.backupReminders).toBe(false)

  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('sleep-well')
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    request.onblocked = () => resolve()
  }))
  await page.reload()
  await expect(diaryPanel(page).getByText('还没有日记记录。')).toBeVisible()

  await importFile(page, testInfo, 'restore.sleep-backup.zip', exported.bytes)
  const panel = backupPanel(page)
  await expect(panel.getByText('备份摘要')).toBeVisible()
  await expect(panel.getByText('日记 2 夜').first()).toBeVisible()
  await expect(panel.getByRole('heading', { name: '当前数据' })).toBeVisible()
  await expect(panel.getByRole('heading', { name: '备份文件' })).toBeVisible()

  await panel.getByRole('button', { name: '覆盖恢复…' }).click()
  await expect(panel.getByText('确认覆盖当前数据？')).toBeVisible()
  await panel.getByRole('button', { name: '确认删除并恢复' }).click()
  await expect(panel.getByText('已覆盖恢复 2 夜日记')).toBeVisible()

  const diary = diaryPanel(page)
  await expect(diary.getByText('11 月 18 日')).toBeVisible()
  await expect(diary.getByText('11 月 19 日')).toBeVisible()
  await expect(page.getByLabel('启用备份提醒')).not.toBeChecked()
  await expect(coursePanel(page).getByText(/第 \d 周 · 第 \d 天/)).toBeVisible()
})

test('CSV contains only the diary, with BOM, CRLF and no fabricated values', async ({ page }) => {
  await openApp(page)
  await recordNight(page, '2026-11-18')
  await recordNight(page, '2026-11-19', { waso: 'unknown' })

  const csv = await exportCsv(page)
  expect(csv.filename).toMatch(/^sleep-well-diary-2026-11-20\.csv$/)
  expect(csv.text.startsWith('\ufeff')).toBe(true)
  expect(csv.text).toContain('\r\n')
  expect(csv.text).toContain('日期,关灯时间,入睡潜伏期（分钟）')

  const rows = csv.text.replace(/^\ufeff/, '').split('\r\n').filter(Boolean)
  expect(rows).toHaveLength(3)
  const unknown = rows.find((row) => row.startsWith('2026-11-19'))!
  const complete = rows.find((row) => row.startsWith('2026-11-18'))!
  // 未知 WASO 不伪造分钟，TST/SE 留空；完整夜给出精确值。
  expect(unknown.split(',')[6]).toBe('')
  expect(unknown.split(',')[13]).toBe('')
  expect(complete.split(',')[13]).toBe('420')
  expect(complete.split(',')[14]).toBe('87.5')
  await expect(backupPanel(page).getByText('已交给浏览器下载')).toBeVisible()
})

test('append keeps current settings and course, adds only unseen nights and preserves conflicts', async ({ page }, testInfo) => {
  await openApp(page)
  await recordNight(page, '2026-11-19', { quality: '4 分' })
  await coursePanel(page).getByRole('button', { name: '开始六周训练' }).click()
  await expect(coursePanel(page).getByText('第 1 周 · 第 1 天')).toBeVisible()

  await importFile(page, testInfo, 'append.sleep-backup.zip', await archiveBytes(payloadWith(['2026-11-18', '2026-11-19'])))
  const panel = backupPanel(page)
  await expect(panel.getByText('日记 2 夜').last()).toBeVisible()
  await expect(panel.getByText(/会追加 1 夜，跳过 1 夜/)).toBeVisible()

  await panel.getByRole('button', { name: '只新增日记' }).click()
  await expect(panel.getByText('已新增 1 夜日记，跳过 1 夜与当前重复的记录')).toBeVisible()

  const diary = diaryPanel(page)
  await expect(diary.getByText('11 月 18 日')).toBeVisible()

  // 冲突以当前为准：11 月 19 日仍是当前记录的 4 分，而不是备份里的未评分。
  await diary.locator('#diary-date').fill('2026-11-19')
  await expect(diary.getByRole('radio', { name: '4 分' })).toBeChecked()

  // 当前设置与疗程没有被追加策略改写。
  await expect(page.getByLabel('启用备份提醒')).toBeChecked()
  await expect(coursePanel(page).getByText('第 1 周 · 第 1 天')).toBeVisible()
})

test('cancel leaves both data and interface unchanged', async ({ page }, testInfo) => {
  await openApp(page)
  await recordNight(page, '2026-11-19')

  await importFile(page, testInfo, 'cancel.sleep-backup.zip', await archiveBytes(payloadWith(['2026-11-01'])))
  const panel = backupPanel(page)
  await expect(panel.getByText('备份摘要')).toBeVisible()
  await panel.getByRole('button', { name: '取消' }).click()

  await expect(panel.getByText('备份摘要')).toBeHidden()
  await expect(diaryPanel(page).getByText('11 月 19 日')).toBeVisible()
  await expect(diaryPanel(page).getByText('11 月 1 日')).toBeHidden()

  await page.reload()
  await expect(diaryPanel(page).getByText('11 月 19 日')).toBeVisible()
  await expect(diaryPanel(page).getByText('11 月 1 日')).toBeHidden()
})

test('corrupt, malicious and future-version archives never touch existing data', async ({ page }, testInfo) => {
  await openApp(page)
  await recordNight(page, '2026-11-19')
  const panel = backupPanel(page)
  const exported = await exportZip(page)

  // 损坏：翻转压缩数据中的一个字节，ZIP 自身的 CRC 校验先失败。
  const corrupted = exported.bytes.slice()
  const view = new DataView(corrupted.buffer, corrupted.byteOffset, corrupted.byteLength)
  const nameLength = view.getUint16(26, true)
  corrupted[30 + nameLength + 5] ^= 0xff
  await importFile(page, testInfo, 'corrupt.sleep-backup.zip', corrupted)
  await expect(panel.getByText(/不是完整、可信的备份/)).toBeVisible()

  // 路径穿越条目。
  await importFile(page, testInfo, 'traversal.sleep-backup.zip', forgeZip([{ name: '../evil.json', data: '{}', method: 0 }]))
  await expect(panel.getByText(/不是完整、可信的备份/)).toBeVisible()

  // 重复条目。
  const duplicated = forgeZip([
    { name: 'data.json', data: '{}', method: 0 },
    { name: 'data.json', data: '[]', method: 0 }
  ])
  await importFile(page, testInfo, 'duplicate.sleep-backup.zip', duplicated)
  await expect(panel.getByText(/不是完整、可信的备份/)).toBeVisible()

  // 声明解压后 3 MB，超过单条上限。
  await importFile(page, testInfo, 'oversized.sleep-backup.zip', forgeZip([{ name: 'data.json', data: '{}', declaredSize: 3 * 1024 * 1024 }]))
  await expect(panel.getByText(/超过大小限制/)).toBeVisible()

  // 未来 schema 版本。
  const future = await archiveBytes({ ...payloadWith(['2026-11-01']), schemaVersion: 99 } as BackupPayload)
  await importFile(page, testInfo, 'future.sleep-backup.zip', future)
  await expect(panel.getByText(/来自更新版本的应用/)).toBeVisible()

  await expect(diaryPanel(page).getByText('11 月 19 日')).toBeVisible()
  await expect(diaryPanel(page).getByText('11 月 1 日')).toBeHidden()
  await page.reload()
  await expect(diaryPanel(page).getByText('11 月 19 日')).toBeVisible()
  await expect(diaryPanel(page).getByText('11 月 1 日')).toBeHidden()

  // 导出的文件本身仍然可读，确认前面的拒绝不是导出问题。
  const archive = await readBackupArchive(exported.bytes, { inflate })
  expect(archive.payload.diary).toHaveLength(1)
})

test('a write failure during overwrite rolls back to the original data', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    const original = IDBObjectStore.prototype.put as (
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey
    ) => IDBRequest
    IDBObjectStore.prototype.put = function patchedPut(this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      if ((window as Window & { __failDiaryPut?: boolean }).__failDiaryPut && this.name === 'diary') {
        (window as Window & { __failDiaryPut?: boolean }).__failDiaryPut = false
        throw new DOMException('Simulated quota failure', 'QuotaExceededError')
      }
      return key === undefined ? original.call(this, value) : original.call(this, value, key)
    } as typeof IDBObjectStore.prototype.put
  })

  await openApp(page)
  await recordNight(page, '2026-11-19')
  await coursePanel(page).getByRole('button', { name: '开始六周训练' }).click()
  await expect(coursePanel(page).getByText('第 1 周 · 第 1 天')).toBeVisible()

  const panel = backupPanel(page)
  const incoming = await archiveBytes(payloadWith(['2026-11-01', '2026-11-02']))
  await importFile(page, testInfo, 'rollback.sleep-backup.zip', incoming)
  await expect(panel.getByText('备份摘要')).toBeVisible()

  await page.evaluate(() => { (window as Window & { __failDiaryPut?: boolean }).__failDiaryPut = true })
  await panel.getByRole('button', { name: '覆盖恢复…' }).click()
  await panel.getByRole('button', { name: '确认删除并恢复' }).click()
  await expect(panel.getByText('导入失败，当前数据保持不变')).toBeVisible()

  // 事务回滚：原日记、设置与疗程都还在，备份中的 11 月 1/2 日没有被写入。
  await expect(diaryPanel(page).getByText('11 月 19 日')).toBeVisible()
  await expect(diaryPanel(page).getByText('11 月 1 日')).toBeHidden()
  await expect(page.getByLabel('启用备份提醒')).toBeChecked()
  await expect(coursePanel(page).getByText('第 1 周 · 第 1 天')).toBeVisible()

  await page.reload()
  await expect(diaryPanel(page).getByText('11 月 19 日')).toBeVisible()
  await expect(page.getByLabel('启用备份提醒')).toBeChecked()
})
