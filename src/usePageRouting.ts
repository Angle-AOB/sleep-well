import { useEffect, useRef, useState } from 'react'
import { hashForPage, routeFromHash, type Page, type Route, type SettingsSubPage } from './routing'

const todayRoute: Route = { page: 'today', subPage: null }

/**
 * 回到页顶。`html { scroll-behavior: smooth }` 会让进行中的平滑动画压过
 * `behavior: 'instant'`（切页时正好撞上子页定位的动画就会停在半路），
 * 所以复位期间临时关掉平滑滚动。
 */
function scrollToTop() {
  const root = document.documentElement
  const previous = root.style.scrollBehavior
  root.style.scrollBehavior = 'auto'
  window.scrollTo(0, 0)
  root.style.scrollBehavior = previous
}

/**
 * 一次地址判定的结论：打开某个路由、保持当前页的页内锚点，或回落到今日并替换地址。
 * `route` 为 null 表示地址指向文档里真实存在的元素，属于页内锚点，不切页也不改地址。
 */
type HashResolution = { route: Route | null; replace: boolean }

/** 地址里的片段 id 是用户可输入的：解码失败按未知地址处理。 */
function decodeId(raw: string): string | null {
  try {
    return decodeURIComponent(raw)
  } catch {
    return null
  }
}

function resolveHash(hash: string): HashResolution {
  if (hash === '' || hash === '#') return { route: todayRoute, replace: true }

  const route = routeFromHash(hash)
  if (route !== null) return { route, replace: false }

  // `#/foo` 看起来就是路由，解析不到顶层页面时不能停在原地。
  if (hash.startsWith('#/')) return { route: todayRoute, replace: true }

  // 其余都是 `#foo` 形式的候选片段：只有文档里真有这个元素才当作页内锚点。
  const id = hash.startsWith('#') ? decodeId(hash.slice(1)) : null
  if (id !== null && document.getElementById(id) !== null) return { route: null, replace: false }

  return { route: todayRoute, replace: true }
}

/**
 * 四页壳的地址状态：解析 hash、未知地址回落今日、切页或换子页时回到页顶并把焦点交给页标题。
 * 只为这四个顶层页面服务；子页由页面自己消费。
 */
export function usePageRouting() {
  const [route, setRoute] = useState<Route>(() => routeFromHash(window.location.hash) ?? todayRoute)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const lastPage = useRef<Page>(route.page)
  const lastSubPage = useRef<SettingsSubPage | null>(route.subPage)

  // 初始状态已经把无法解析的地址当成今日；这里只把地址栏改成一致的 `#/today`。
  useEffect(() => {
    const { replace } = resolveHash(window.location.hash)
    if (replace) window.history.replaceState(null, '', hashForPage('today'))
  }, [])

  useEffect(() => {
    function onHashChange() {
      const hash = window.location.hash
      const resolution = resolveHash(hash)
      // 页内锚点：停在当前页，地址保持不动。
      if (resolution.route === null) return
      if (resolution.replace) window.history.replaceState(null, '', hashForPage('today'))
      setRoute(resolution.route)
    }

    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  // 首次加载不抢焦点；之后每次切页或换子页（含从 `#/settings/backup` 回到 `#/settings`）
  // 都回到页顶，并把焦点交给新页标题。设置页的备份定位排在下一帧，最终由它接管焦点。
  useEffect(() => {
    if (lastPage.current === route.page && lastSubPage.current === route.subPage) return
    lastPage.current = route.page
    lastSubPage.current = route.subPage
    scrollToTop()
    headingRef.current?.focus()
  }, [route.page, route.subPage])

  return { page: route.page, subPage: route.subPage, headingRef }
}
