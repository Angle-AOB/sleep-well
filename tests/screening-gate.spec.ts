import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { goTo, goToSettingsSubPage, openPage } from './navigation'

// 安全筛查是「开始六周训练」的前提，但只拦这一件事：日记、导出、已有课程都不受影响。
// 断言走可访问角色、可见文案与地址，不碰组件内部状态。

function coursePanel(page: Page) {
  return page.getByRole('region', { name: '六周训练' })
}

test('without a screening record the start button is disabled, explains why, and links to screening', async ({ page }) => {
  await openPage(page, 'training', '2026-11-20T09:00:00')
  const panel = coursePanel(page)

  await expect(panel.getByRole('button', { name: '开始六周训练' })).toBeDisabled()
  await expect(panel.getByText('完成安全自查后才能开始六周训练；记录日记与导出数据不受影响。')).toBeVisible()

  await panel.getByRole('link', { name: '去完成安全自查' }).click()
  await expect(page.getByRole('heading', { level: 1, name: '安全自查' })).toBeVisible()
  await expect(page).toHaveURL(/#\/settings\/screening$/)
})

async function fillScreeningForm(page: Page, options: { pausesRestriction?: boolean } = {}) {
  await goToSettingsSubPage(page, 'screening')
  await page.getByRole('button', { name: '开始自查' }).click()
  await page.getByLabel('你的年龄').fill('30')
  const bipolar = options.pausesRestriction ? '是' : '否'
  await page.getByRole('group', { name: '你是否曾被告知患有双相障碍，或有躁狂/轻躁狂发作史？' }).getByLabel(bipolar).check()
  for (const question of [
    '你是否有癫痫或惊厥病史？',
    '你是否有响亮鼾声、目击呼吸暂停、白天嗜睡或高血压等情况？',
    '你是否有危险性异态睡眠，例如梦游时可能受伤？',
    '你目前是否怀孕？',
    '你是否会在驾驶或高风险工作时难以保持清醒？',
    '你目前是否有急性不稳定的身心状况，需要尽快获得专业评估？'
  ]) {
    await page.getByRole('group', { name: question }).getByLabel('否').check()
  }
  await page.getByLabel('睡眠困扰持续多久？').selectOption('one-to-four-weeks')
  await page.getByLabel('最近一周，大约有几晚受到睡眠困扰影响？').selectOption('one-to-two')
  await page.getByLabel('睡眠困扰对日间生活影响多大？').selectOption('some')
  await page.getByRole('group', { name: '目前这件事给你带来多大困扰？' }).getByLabel('有一些困扰').check()
  await page.getByLabel('你最希望改善什么？').selectOption('fall-asleep')
  await page.getByRole('button', { name: '提交自查' }).click()
}

async function completeScreening(page: Page, options: { pausesRestriction?: boolean } = {}) {
  await fillScreeningForm(page, options)
  await expect(page.getByText(
    options.pausesRestriction ? '睡眠限制暂时暂停。' : '目前没有发现需要暂停睡眠限制的安全筛查项。'
  )).toBeVisible()
  await goTo(page, 'training')
}

async function advanceTo(page: Page, time: string) {
  await page.clock.setFixedTime(new Date(time))
  await page.reload()
}

async function recordNight(page: Page, date: string) {
  await goTo(page, 'diary')
  const diary = page.getByRole('region', { name: '晨间睡眠日记' })
  await diary.locator('#diary-date').fill(date)
  await diary.locator('#lights-off').fill('23:00')
  await diary.locator('#sleep-onset').fill('30')
  await diary.locator('#final-wake').fill('07:00')
  await diary.locator('#out-of-bed').fill('07:00')
  await diary.locator('#waso').selectOption('none-remembered')
  await diary.getByRole('button', { name: /保存日记|更新日记/ }).click()
  await expect(diary.getByText('日记已保存在此设备')).toBeVisible()
  await goTo(page, 'training')
}

test('a completed low-risk screening enables the start button and the course starts', async ({ page }) => {
  await openPage(page, 'training', '2026-11-01T09:00:00')
  await completeScreening(page)

  const start = coursePanel(page).getByRole('button', { name: '开始六周训练' })
  await expect(start).toBeEnabled()
  await start.click()
  await expect(coursePanel(page).getByText('第 1 周 · 第 1 天')).toBeVisible()
})

test('a high-risk screening still allows starting and shows restriction and titration paused', async ({ page }) => {
  await openPage(page, 'training', '2026-11-01T09:00:00')
  await completeScreening(page, { pausesRestriction: true })

  const start = coursePanel(page).getByRole('button', { name: '开始六周训练' })
  await expect(start).toBeEnabled()
  await start.click()
  await expect(coursePanel(page).getByText('第 1 周 · 第 1 天')).toBeVisible()

  await advanceTo(page, '2026-11-05T09:00:00')
  for (const date of ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04']) {
    await recordNight(page, date)
  }
  await advanceTo(page, '2026-11-11T09:00:00')
  for (const date of ['2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11']) {
    await recordNight(page, date)
  }
  await advanceTo(page, '2026-11-15T09:00:00')

  const panel = coursePanel(page)
  await expect(panel.getByText('第 3 周 · 第 1 天')).toBeVisible()
  await expect(panel.getByText('睡眠限制：暂停（安全筛查提示需要专业评估）')).toBeVisible()
  await expect(panel.getByText('安全筛查提示需要专业评估：睡眠限制与每周滴定已暂停，窗口保持不变。')).toBeVisible()
})

test('an existing course without a screening record is not blocked and keeps its progress', async ({ page }) => {
  await openPage(page, 'training', '2026-11-01T09:00:00')
  await completeScreening(page)
  await coursePanel(page).getByRole('button', { name: '开始六周训练' }).click()
  await expect(coursePanel(page).getByText('第 1 周 · 第 1 天')).toBeVisible()

  // 模拟旧版本留下的课程进度：只删筛查记录，课程状态保持不变。
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('sleep-well')
      request.onsuccess = () => {
        const database = request.result
        const transaction = database.transaction('screening', 'readwrite')
        transaction.objectStore('screening').delete('current')
        transaction.oncomplete = () => { database.close(); resolve() }
        transaction.onerror = () => reject(transaction.error)
      }
      request.onerror = () => reject(request.error)
    })
  })
  await page.reload()

  const panel = coursePanel(page)
  await expect(panel.getByText('第 1 周 · 第 1 天')).toBeVisible()
  await expect(panel.getByRole('button', { name: '开始六周训练' })).toHaveCount(0)
  await expect(panel.getByText('还没有完成安全自查。已有课程进度不受影响，但不会生成自动睡眠窗口；完成自查后会重新评估。')).toBeVisible()

  await panel.getByRole('link', { name: '去完成安全自查' }).click()
  await expect(page.getByRole('heading', { level: 1, name: '安全自查' })).toBeVisible()
  await expect(page).toHaveURL(/#\/settings\/screening$/)
})

test('unavailable storage is reported as such and still lets the user try to start', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true })
  })
  await page.clock.setFixedTime(new Date('2026-11-20T09:00:00'))
  await page.goto('/#/training')

  await expect(page.getByRole('heading', { level: 1, name: '训练' })).toBeVisible()
  const panel = coursePanel(page)
  await expect(panel.getByText('此浏览器无法使用本地存储，疗程状态不会保存。')).toBeVisible()
  await expect(panel.getByText('完成安全自查后才能开始六周训练；记录日记与导出数据不受影响。')).toHaveCount(0)

  const start = panel.getByRole('button', { name: '开始六周训练' })
  await expect(start).toBeVisible()
  await expect(start).toBeEnabled()
  await start.click()
  await expect(panel.getByText('无法保存疗程状态。请检查此设备存储空间后重试。')).toBeVisible()
})

test('a screening that is still loading keeps the start button disabled instead of opening the gate', async ({ page }) => {
  await page.addInitScript(() => {
    const original = IDBObjectStore.prototype.get as (
      this: IDBObjectStore,
      query: IDBValidKey | IDBKeyRange
    ) => IDBRequest
    IDBObjectStore.prototype.get = function patchedGet(this: IDBObjectStore, query: IDBValidKey | IDBKeyRange) {
      const request = original.call(this, query)
      if (this.name !== 'screening') return request
      // 让筛查读取永远停在 loading：课程与日记照常读到，门禁不能因此先放行。
      const pending = Object.create(IDBRequest.prototype) as IDBRequest
      Object.defineProperty(pending, 'addEventListener', { value: () => { /* 不派发任何事件 */ } })
      return pending
    } as typeof IDBObjectStore.prototype.get
  })

  await openPage(page, 'training', '2026-11-20T09:00:00')
  const panel = coursePanel(page)

  await expect(panel.getByText('正在读取安全自查状态…')).toBeVisible()
  await expect(panel.getByRole('button', { name: '开始六周训练' })).toBeDisabled()
  await expect(panel.getByText('完成安全自查后才能开始六周训练；记录日记与导出数据不受影响。')).toHaveCount(0)
})

test('a screening write failure never blocks starting and reports the storage failure', async ({ page }) => {
  await page.addInitScript(() => {
    // 写入失败：读取与打开数据库仍然正常，只有 put 抛错。
    IDBObjectStore.prototype.put = function patchedPut() {
      throw new DOMException('Quota exceeded', 'QuotaExceededError')
    } as typeof IDBObjectStore.prototype.put
  })

  await openPage(page, 'training', '2026-11-20T09:00:00')
  await fillScreeningForm(page)
  // 筛查页明确报告保存失败；随后训练页必须按 fail-open 放行。
  await expect(page.getByText('此浏览器无法保存筛查状态，因此暂不能开始训练流程。')).toBeVisible()

  await goTo(page, 'training')
  const panel = coursePanel(page)
  await expect(panel.getByRole('button', { name: '开始六周训练' })).toBeEnabled()
  await expect(panel.getByText('无法读取或保存安全自查状态，本次不拦截开始训练。请检查浏览器存储设置。')).toBeVisible()
  await expect(panel.getByText('完成安全自查后才能开始六周训练；记录日记与导出数据不受影响。')).toHaveCount(0)
})

