/** 四个顶层页面，顺序即底栏顺序；`Page` 由这份清单派生。 */
export const pages = ['today', 'diary', 'training', 'settings'] as const

export type Page = (typeof pages)[number]

/** 一次地址解析的结果：顶层页面加可选子页（`#/settings/screening`）。 */
export type Route = { page: Page; subPage: string | null }

/**
 * 设置页唯一的子页：备份面板。其他顶层页没有子页，所以这个常量只跟设置页组合，
 * 不在 `hashForSettingsSubPage` 里给无效页面留口子。
 */
export const SETTINGS_BACKUP = 'backup'

// 新增页面只改上面的 `pages`：这里的 `Record<Page, string>` 会强制补路径，
// App 里的标题与图标表同样是 `Record<Page, …>`，缺一项都编译不过。
const pagePaths: Record<Page, string> = {
  today: '/today',
  diary: '/diary',
  training: '/training',
  settings: '/settings'
}

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

/** 设置页子页地址：页面段与子页常量的唯一组合，避免在组件里手写 `#/settings/backup`。 */
export function hashForSettingsSubPage(subPage: typeof SETTINGS_BACKUP): string {
  return `${hashForPage('settings')}/${subPage}`
}
