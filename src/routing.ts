/** 四个顶层页面，顺序即底栏顺序；`Page` 由这份清单派生。 */
export const pages = ['today', 'diary', 'training', 'settings'] as const

export type Page = (typeof pages)[number]

/**
 * 设置页唯一的子页：备份面板。其他顶层页没有子页，所以这个常量只跟设置页组合，
 * 不在 `hashForSettingsSubPage` 里给无效页面留口子。
 */
export const SETTINGS_BACKUP = 'backup'

/** 设置页允许的子页取值；#13 的其它子页到时候加在这里。 */
export type SettingsSubPage = typeof SETTINGS_BACKUP

/** 一次地址解析的结果：顶层页面加可选子页（`#/settings/backup`）。 */
export type Route = { page: Page; subPage: SettingsSubPage | null }

// 新增页面只改上面的 `pages`：这里的 `Record<Page, string>` 会强制补路径，
// App 里的标题与图标表同样是 `Record<Page, …>`，缺一项都编译不过。
const pagePaths: Record<Page, string> = {
  today: '/today',
  diary: '/diary',
  training: '/training',
  settings: '/settings'
}

/**
 * 把地址栏 hash 解析为路由。空 hash、`#main-content` 这类非路由片段、未知顶层地址，
 * 以及带无效子段的地址（`#/diary/foo`、`#/settings/unknown`）都返回 null；
 * 解析本身不读写浏览器历史。
 *
 * 只有设置页允许子页，且额外段必须恰好一段并等于 `SETTINGS_BACKUP`；
 * `#/settings` 与 `#/settings/` 都是 `{ page: 'settings', subPage: null }`。
 */
export function routeFromHash(hash: string): Route | null {
  const path = hash.startsWith('#') ? hash.slice(1) : hash
  const segments = path.split('/').filter((segment) => segment !== '')
  const [top, ...rest] = segments
  if (top === undefined) return null

  const page = pages.find((candidate) => pagePaths[candidate] === `/${top}`)
  if (page === undefined) return null

  // 非设置页没有子页：任何额外段都说明地址不是已知路由。
  if (page !== 'settings') return rest.length === 0 ? { page, subPage: null } : null

  if (rest.length === 0) return { page: 'settings', subPage: null }
  const [subPage] = rest
  if (rest.length === 1 && subPage === SETTINGS_BACKUP) return { page: 'settings', subPage }
  return null
}

export function hashForPage(page: Page): string {
  return `#${pagePaths[page]}`
}

/** 设置页子页地址：页面段与子页常量的唯一组合，避免在组件里手写 `#/settings/backup`。 */
export function hashForSettingsSubPage(subPage: SettingsSubPage): string {
  return `${hashForPage('settings')}/${subPage}`
}
