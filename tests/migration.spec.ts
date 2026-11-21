import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

type LegacyRecord = { key: string; value: unknown }

async function seedLegacyDb(page: Page, version: number, stores: Record<string, LegacyRecord[]>) {
  await page.evaluate(async ({ version, stores }) => {
    await new Promise<void>((resolve, reject) => {
      const deleteReq = indexedDB.deleteDatabase('sleep-well')
      deleteReq.onsuccess = () => resolve()
      deleteReq.onerror = () => reject(deleteReq.error)
    })
    await new Promise<void>((resolve, reject) => {
      const openReq = indexedDB.open('sleep-well', version)
      openReq.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        for (const [storeName, records] of Object.entries(stores)) {
          const store = db.createObjectStore(storeName)
          for (const record of records) {
            store.put(record.value, record.key)
          }
        }
      }
      openReq.onsuccess = () => {
        openReq.result.close()
        resolve()
      }
      openReq.onerror = () => reject(openReq.error)
    })
  }, { version, stores })
}

async function readDbRecord(page: Page, store: string, key: string): Promise<Record<string, unknown>> {
  return page.evaluate(async ({ store, key }: { store: string; key: string }) => {
    return new Promise((resolve, reject) => {
      const openReq = indexedDB.open('sleep-well')
      openReq.onsuccess = () => {
        const db = openReq.result
        const tx = db.transaction(store, 'readonly')
        const getReq = tx.objectStore(store).get(key)
        getReq.onsuccess = () => {
          db.close()
          resolve(getReq.result)
        }
        getReq.onerror = () => reject(getReq.error)
      }
      openReq.onerror = () => reject(openReq.error)
    })
  }, { store, key })
}

async function openAndSettle(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '把规律，慢慢带回夜晚。' })).toBeVisible()
  await expect(page.getByText('偏好已保存在此设备').first()).toBeVisible()
}

test('v2 diary entries with legacy field names migrate to current schema', async ({ page }) => {
  await openAndSettle(page)
  await page.waitForTimeout(500)

  await seedLegacyDb(page, 2, {
    diary: [{
      key: '2026-11-15',
      value: {
        date: '2026-11-15',
        bedTime: '23:00',
        wakeTime: '07:00',
        sol: 15,
        wasoMinutes: 20,
        quality: 3,
        nightWakesCount: 2,
        tags: ['caffeine'],
        recordedAt: '2026-11-15T08:00:00Z',
        updatedAt: '2026-11-15T08:00:00Z'
      }
    }],
    preferences: [{
      key: 'current',
      value: { reminderEnabled: true, wakeTime: '07:00' }
    }]
  })

  await page.reload()
  await expect(page.getByRole('heading', { name: '把规律，慢慢带回夜晚。' })).toBeVisible()
  await expect(page.getByText('偏好已保存在此设备').first()).toBeVisible()

  const entry = await readDbRecord(page, 'diary', '2026-11-15')
  expect(entry.lightsOffTime).toBe('23:00')
  expect(entry.outOfBedTime).toBe('07:00')
  expect(entry.sleepOnsetLatencyMinutes).toBe(15)
  expect(entry.waso).toEqual({ kind: 'minutes', minutes: 20 })
  expect(entry.sleepQuality).toBe(3)
  expect(entry.nightWakes).toBe('one-to-two')
  expect(entry.bedTime).toBeUndefined()
  expect(entry.wakeTime).toBeUndefined()
  expect(entry.sol).toBeUndefined()
  expect(entry.wasoMinutes).toBeUndefined()
  expect(entry.quality).toBeUndefined()
  expect(entry.nightWakesCount).toBeUndefined()

  const prefs = await readDbRecord(page, 'preferences', 'current')
  expect(prefs.backupReminders).toBe(true)
  expect(prefs.wakeTime).toBe('07:00')
  expect(prefs.reminderEnabled).toBeUndefined()
})

test('v3 diary entries with intermediate field names migrate to current schema', async ({ page }) => {
  await openAndSettle(page)
  await page.waitForTimeout(500)

  await seedLegacyDb(page, 3, {
    diary: [{
      key: '2026-11-10',
      value: {
        date: '2026-11-10',
        lightsOffTime: '22:30',
        outOfBedTime: '06:45',
        sleepOnsetLatencyMinutes: 10,
        lastAwakeTime: '06:15',
        wasoMinutes: 0,
        sleepQuality: 4,
        nightWakesCount: 0,
        tags: [],
        recordedAt: '2026-11-10T07:00:00Z',
        updatedAt: '2026-11-10T07:00:00Z'
      }
    }],
    preferences: [{
      key: 'current',
      value: { backupReminders: false, lastReminderOn: '2026-11-09' }
    }]
  })

  await page.reload()
  await expect(page.getByRole('heading', { name: '把规律，慢慢带回夜晚。' })).toBeVisible()
  await expect(page.getByText('偏好已保存在此设备').first()).toBeVisible()

  const entry = await readDbRecord(page, 'diary', '2026-11-10')
  expect(entry.finalWakeTime).toBe('06:15')
  expect(entry.waso).toEqual({ kind: 'none-remembered' })
  expect(entry.nightWakes).toBe('none')
  expect(entry.lastAwakeTime).toBeUndefined()
  expect(entry.wasoMinutes).toBeUndefined()
  expect(entry.nightWakesCount).toBeUndefined()

  const prefs = await readDbRecord(page, 'preferences', 'current')
  expect(prefs.backupReminders).toBe(false)
  expect(prefs.lastBackupReminderOn).toBe('2026-11-09')
  expect(prefs.lastReminderOn).toBeUndefined()
})

test('migration failure leaves old data intact without partial writes', async ({ page }) => {
  await openAndSettle(page)
  await page.waitForTimeout(500)

  await seedLegacyDb(page, 2, {
    diary: [
      {
        key: '2026-11-14',
        value: {
          date: '2026-11-14',
          bedTime: '23:00',
          wakeTime: '07:00',
          sol: 15,
          wasoMinutes: 20,
          quality: 3,
          nightWakesCount: 2,
          tags: [],
          recordedAt: '2026-11-14T08:00:00Z',
          updatedAt: '2026-11-14T08:00:00Z'
        }
      },
      {
        key: '2026-11-15',
        value: {
          date: '2026-11-15',
          bedTime: 123,
          wakeTime: '07:00',
          sol: 15,
          wasoMinutes: 20,
          quality: 3,
          nightWakesCount: 2,
          tags: [],
          recordedAt: '2026-11-15T08:00:00Z',
          updatedAt: '2026-11-15T08:00:00Z'
        }
      }
    ],
    preferences: [{
      key: 'current',
      value: { reminderEnabled: true }
    }]
  })

  await page.reload()
  await expect(page.getByRole('heading', { name: '把规律，慢慢带回夜晚。' })).toBeVisible()
  // 迁移失败不是"存储空间不足"：提示必须说明原有数据未被改动。
  await expect(page.getByText('数据迁移失败，此设备上的原有数据未被改动').first()).toBeVisible()
  await expect(page.getByText('数据持久化失败').first()).toBeHidden()

  const first = await readDbRecord(page, 'diary', '2026-11-14')
  expect(first.bedTime).toBe('23:00')
  expect(first.lightsOffTime).toBeUndefined()
  expect(first.wasoMinutes).toBe(20)

  const second = await readDbRecord(page, 'diary', '2026-11-15')
  expect(second.bedTime).toBe(123)

  const prefs = await readDbRecord(page, 'preferences', 'current')
  expect(prefs.reminderEnabled).toBe(true)
  expect(prefs.backupReminders).toBeUndefined()
})
