/**
 * 首次说明的「本设备已看过」标记。
 *
 * 它只属于这台设备的这个浏览器：写在 localStorage 里，不进入偏好、不进备份，
 * 也不参与导入导出。换设备或清除站点数据后会重新展示。
 */
export const FIRST_RUN_SEEN_KEY = 'sleep-well.first-run-seen'

const SEEN_VALUE = '1'

type StorageLike = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/**
 * 只用最小接口取用 localStorage：访问本身在隐私模式或禁用站点数据时会抛错，
 * 所以连取存储对象都要包在 try 里。
 */
function deviceStorage(): StorageLike | null {
  try {
    return (globalThis as { localStorage?: StorageLike }).localStorage ?? null
  } catch {
    return null
  }
}

/** localStorage 不可用时的会话内兜底：本次访问只展示一次，刷新后重新判断。 */
let seenThisSession = false

export function hasSeenFirstRun(): boolean {
  if (seenThisSession) return true
  try {
    return deviceStorage()?.getItem(FIRST_RUN_SEEN_KEY) === SEEN_VALUE
  } catch {
    return false
  }
}

/** 写入失败不阻塞应用：退化为本次会话内不再自动出现。 */
export function markFirstRunSeen(): void {
  seenThisSession = true
  try {
    deviceStorage()?.setItem(FIRST_RUN_SEEN_KEY, SEEN_VALUE)
  } catch {
    // 会话内兜底已经生效，不把存储异常升级成界面错误。
  }
}
