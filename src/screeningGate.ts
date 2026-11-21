import type { ScreeningRecord } from './domain/screening'

/** 应用层维护的筛查读取状态：还没读完、读到了、读或写失败。 */
export type ScreeningLoadState = 'loading' | 'ready' | 'error'

/**
 * 开始训练前的筛查门禁，今日页与训练页共用这一份判断。
 * - loading：筛查状态还没读完，先不放行，避免读取窗口内绕过门禁；
 * - required：读到了、但确实没有记录，需要先完成安全自查；
 * - clear：已有筛查记录；
 * - unavailable：读或写失败（含存储不可用），按票面 fail-open，不拦截。
 */
export type ScreeningGate = 'loading' | 'required' | 'clear' | 'unavailable'

export function screeningGate(state: ScreeningLoadState, screening: ScreeningRecord | null): ScreeningGate {
  if (state === 'loading') return 'loading'
  if (state === 'error') return 'unavailable'
  return screening === null ? 'required' : 'clear'
}
