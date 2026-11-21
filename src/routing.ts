/** 四个顶层页面；顺序与底栏一致。 */
export type Page = 'today' | 'diary' | 'training' | 'settings'

/** 一次地址解析的结果：顶层页面加可选子页（`#/settings/screening`）。 */
export type Route = { page: Page; subPage: string | null }

const pagePaths: Record<Page, string> = {
  today: '/today',
  diary: '/diary',
  training: '/training',
  settings: '/settings'
}

/** 页面顺序的唯一定义：底栏与路由共用，新增页面只需改类型与这里。 */
export const pages = Object.keys(pagePaths) as Page[]

/**
 * 把地址栏 hash 解析为路由。空 hash、`#main-content` 这类非路由片段与未知顶层地址
 * 都返回 null；解析本身不读写浏览器历史。
 */
export function routeFromHash(hash: string): Route | null {
  const path = hash.startsWith('#') ? hash.slice(1) : hash
  const segments = path.split('/').filter((segment) => segment !== '')
  const [top, ...rest] = segments
  if (top === undefined) return null

  const page = pages.find((candidate) => pagePaths[candidate] === `/${top}`)
  if (page === undefined) return null

  return { page, subPage: rest.length > 0 ? rest.join('/') : null }
}

export function hashForPage(page: Page): string {
  return `#${pagePaths[page]}`
}

/** 子页地址共用顶层页面的写法，避免在组件里手写 `#/settings/backup` 这类字符串。 */
export function hashForSubPage(page: Page, subPage: string): string {
  return `${hashForPage(page)}/${subPage}`
}
