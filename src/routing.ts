/** 四个顶层页面；顺序与底栏一致。 */
export type Page = 'today' | 'diary' | 'training' | 'settings'

const pagePaths: Record<Page, string> = {
  today: '/today',
  diary: '/diary',
  training: '/training',
  settings: '/settings'
}

/**
 * 把地址栏 hash 解析为页面。空 hash、非页面锚点与未知路径都返回 null；
 * 解析本身不读写浏览器历史。
 */
export function pageFromHash(hash: string): Page | null {
  const path = hash.startsWith('#') ? hash.slice(1) : hash
  for (const page of Object.keys(pagePaths) as Page[]) {
    if (pagePaths[page] === path) return page
  }
  return null
}

/**
 * 只有真正「想打开某个页面」的地址才该回落到今日：空 hash，
 * 或形如 `#/…` 却解析不到页面的路由地址。`#main-content` 这类页内片段
 * 属于当前页面的一部分，改地址会把用户从所在页带走。
 */
export function isUnknownRoute(hash: string): boolean {
  if (hash === '' || hash === '#') return true
  return hash.startsWith('#/') && pageFromHash(hash) === null
}

export function hashForPage(page: Page): string {
  return `#${pagePaths[page]}`
}
