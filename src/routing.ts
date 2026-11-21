/** 四个顶层页面；顺序与底栏一致。 */
export type Page = 'today' | 'diary' | 'training' | 'settings'

const pagePaths: Record<Page, string> = {
  today: '/today',
  diary: '/diary',
  training: '/training',
  settings: '/settings'
}

/**
 * 把地址栏 hash 解析为页面。空 hash、非页面锚点与未知路径都返回 null，
 * 由调用方回落到今日并替换地址；解析本身不读写浏览器历史。
 */
export function pageFromHash(hash: string): Page | null {
  const path = hash.startsWith('#') ? hash.slice(1) : hash
  for (const page of Object.keys(pagePaths) as Page[]) {
    if (pagePaths[page] === path) return page
  }
  return null
}

export function hashForPage(page: Page): string {
  return `#${pagePaths[page]}`
}
