import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import type { CourseState } from '../src/domain/course'
import type { SleepDiaryEntry } from '../src/domain/diary'
import { assessScreening, type ScreeningAnswers, type ScreeningRecord } from '../src/domain/screening'

function clock(minutes: number): string {
  const normalized = ((minutes % 1440) + 1440) % 1440
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`
}

function offsetDate(offset: number): string {
  const date = new Date()
  date.setDate(date.getDate() + offset)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function night(date: string, totalSleep: number): SleepDiaryEntry {
  const lightsOff = 23 * 60
  const outOfBed = lightsOff + 480
  const terminalAwake = 480 - totalSleep - 30
  return {
    date,
    lightsOffTime: clock(lightsOff),
    sleepOnsetLatencyMinutes: 30,
    finalWakeTime: clock(outOfBed - terminalAwake),
    outOfBedTime: clock(outOfBed),
    nightWakes: 'unknown',
    waso: { kind: 'none-remembered' },
    tags: [],
    recordedAt: `${date}T07:30:00.000Z`,
    updatedAt: `${date}T07:30:00.000Z`
  }
}

const ordinaryAnswers: ScreeningAnswers = {
  age: 30,
  bipolarOrMania: false,
  seizureHistory: false,
  osaRedFlags: false,
  dangerousParasomnia: false,
  pregnant: false,
  severeSleepinessOrSafetyRisk: false,
  acuteInstability: false,
  distress: 'some'
}

function clearedScreening(): ScreeningRecord {
  return {
    answers: ordinaryAnswers,
    result: assessScreening(ordinaryAnswers, new Date().toISOString())
  }
}

async function seed(
  page: Page,
  data: { course: CourseState; nights: SleepDiaryEntry[]; screening?: ScreeningRecord }
) {
  await page.evaluate(async ({ course, nights, screening }) => {
    const request = indexedDB.open('sleep-well')
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })

    const stores = screening ? ['course', 'diary', 'screening'] : ['course', 'diary']
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(stores, 'readwrite')
      transaction.objectStore('course').put(course, 'current')
      if (screening) transaction.objectStore('screening').put(screening, 'current')
      for (const entry of nights) transaction.objectStore('diary').put(entry, entry.date)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
    database.close()
  }, { course: data.course, nights: data.nights, screening: data.screening ?? null })
}

function coursePanel(page: Page) {
  return page.getByRole('region', { name: '六周训练' })
}

test('starting the course opens the baseline week and survives a reload', async ({ page }) => {
  await page.goto('/')
  const panel = coursePanel(page)
  await expect(panel.getByText('还没有开始六周训练。')).toBeVisible()

  await panel.getByRole('button', { name: '开始六周训练' }).click()

  await expect(panel.getByText('第 1 周 · 第 1 天')).toBeVisible()
  await expect(panel.getByRole('heading', { name: '第 1 周 · 记录基线' })).toBeVisible()
  await expect(panel.getByText('基线周只记录日记，不生成睡眠窗口。')).toBeVisible()
  await expect(panel.getByText('疗程状态已保存在此设备')).toBeVisible()

  await page.reload()
  await expect(coursePanel(page).getByText('第 1 周 · 第 1 天')).toBeVisible()
  await expect(coursePanel(page).getByRole('heading', { name: '第 1 周 · 记录基线' })).toBeVisible()
})

test('W2 previews the baseline candidate window and defers a wake time change', async ({ page }) => {
  await page.goto('/')
  await expect(coursePanel(page)).toBeVisible()

  await seed(page, {
    course: {
      startedOn: offsetDate(-8),
      workPattern: 'regular',
      wakeTimes: [{ time: '07:00', decidedOn: offsetDate(-8) }]
    },
    nights: [night(offsetDate(-8), 390), night(offsetDate(-7), 390), night(offsetDate(-6), 390), night(offsetDate(-5), 390)],
    screening: clearedScreening()
  })
  await page.reload()

  const panel = coursePanel(page)
  await expect(panel.getByText('第 2 周 · 第 2 天')).toBeVisible()
  await expect(panel.getByRole('heading', { name: '候选睡眠窗口' })).toBeVisible()
  await expect(panel.locator('.window-range')).toContainText('00:00')
  await expect(panel.locator('.window-range')).toContainText('07:00')
  await expect(panel.getByText('窗口长度 7 小时')).toBeVisible()
  await expect(panel.getByText('依据最近 7 夜中的 4 个完整夜：平均 TST 6 小时 30 分钟，平均 TIB 8 小时。')).toBeVisible()
  await expect(panel.getByText('第 2 周仅预览候选窗口，不执行睡眠限制；第 3 周重新校准后才正式启用。')).toBeVisible()
  await expect(panel.getByText('睡前 8 小时：16:00 前停止摄入咖啡因。')).toBeVisible()
  await expect(panel.getByText('近 7 夜实际起床时间中位数是 07:00，可以作为预填建议。')).toBeVisible()

  await panel.locator('#fixed-wake-time').fill('06:30')
  await panel.getByRole('button', { name: '更新起床时间' }).click()

  await expect(panel.getByText('06:30 将从第 3 周窗口周期生效；本周窗口保持不变。')).toBeVisible()
  await expect(panel.locator('.window-range')).toContainText('00:00')
  await expect(panel.locator('.window-range')).toContainText('07:00')
})

test('W3 recalibrates from the anchor week and activates the window', async ({ page }) => {
  await page.goto('/')
  await expect(coursePanel(page)).toBeVisible()

  await seed(page, {
    course: {
      startedOn: offsetDate(-15),
      workPattern: 'regular',
      wakeTimes: [{ time: '07:00', decidedOn: offsetDate(-15) }]
    },
    nights: [
      night(offsetDate(-15), 390),
      night(offsetDate(-14), 390),
      night(offsetDate(-13), 390),
      night(offsetDate(-12), 390),
      night(offsetDate(-7), 450),
      night(offsetDate(-6), 450),
      night(offsetDate(-5), 450),
      night(offsetDate(-4), 450)
    ],
    screening: clearedScreening()
  })
  await page.reload()

  const panel = coursePanel(page)
  await expect(panel.getByText('第 3 周 · 第 2 天')).toBeVisible()
  await expect(panel.getByRole('heading', { name: '本周睡眠窗口' })).toBeVisible()
  await expect(panel.getByText('已启用')).toBeVisible()
  await expect(panel.locator('.window-range')).toContainText('23:00')
  await expect(panel.locator('.window-range')).toContainText('07:00')
  await expect(panel.getByText('窗口长度 8 小时')).toBeVisible()
  await expect(panel.getByText('睡前 8 小时：15:00 前停止摄入咖啡因。')).toBeVisible()
})

test('shift work keeps the course and diary available while pausing automatic windows', async ({ page }) => {
  await page.goto('/')
  await expect(coursePanel(page)).toBeVisible()

  await seed(page, {
    course: {
      startedOn: offsetDate(-8),
      workPattern: 'shift-work',
      wakeTimes: [{ time: '07:00', decidedOn: offsetDate(-8) }]
    },
    nights: [night(offsetDate(-8), 390), night(offsetDate(-7), 390), night(offsetDate(-6), 390), night(offsetDate(-5), 390)],
    screening: clearedScreening()
  })
  await page.reload()

  const panel = coursePanel(page)
  await expect(panel.getByText('第 2 周 · 第 2 天')).toBeVisible()
  await expect(panel.getByRole('heading', { name: '第 2 周 · 锚定固定起床时间' })).toBeVisible()
  await expect(panel.getByText('轮班/倒班作息不进入自动睡眠限制，因此不会生成睡眠窗口。')).toBeVisible()
  await expect(panel.locator('.window-range')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '晨间睡眠日记' })).toBeVisible()
})

test('a screening that needs review blocks the automatic window without blocking the diary', async ({ page }) => {
  await page.goto('/')
  await expect(coursePanel(page)).toBeVisible()

  const screening: ScreeningRecord = {
    answers: { ...ordinaryAnswers, osaRedFlags: true },
    result: assessScreening({ ...ordinaryAnswers, osaRedFlags: true }, new Date().toISOString())
  }

  await seed(page, {
    course: {
      startedOn: offsetDate(-8),
      workPattern: 'regular',
      wakeTimes: [{ time: '07:00', decidedOn: offsetDate(-8) }]
    },
    nights: [night(offsetDate(-8), 390), night(offsetDate(-7), 390), night(offsetDate(-6), 390), night(offsetDate(-5), 390)],
    screening
  })
  await page.reload()

  const panel = coursePanel(page)
  await expect(panel.getByText('安全筛查提示需要专业评估，自动睡眠窗口已暂停。仍可记录日记、查看训练内容并导出数据。')).toBeVisible()
  await expect(panel.locator('.window-range')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '晨间睡眠日记' })).toBeVisible()
})
