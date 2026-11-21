import { useEffect, useRef, useState } from 'react'
import { hashForPage, routeFromHash, settingsItemId, type Page, type Route, type SettingsSubPage } from './routing'

const todayRoute: Route = { page: 'today', subPage: null }

/**
 * 回到页顶。`html { scroll-behavior: smooth }` 会让进行中的平滑动画压过
 * `behavior: 'instant'`（切页时正好撞上子页定位的动画就会停在半路），
 * 所以复位期间临时关掉平滑滚动。
 */
function scrollToTop() {
  scrollToPosition(0)
}

/** 回到指定纵向位置；同样临时关掉平滑滚动，避免恢复动作被动画拖住。 */
function scrollToPosition(top: number) {
  const root = document.documentElement
  const previous = root.style.scrollBehavior
  root.style.scrollBehavior = 'auto'
  window.scrollTo(0, top)
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
  /** 离开设置列表时记下的滚动位置与触发项，返回列表时用来还原。 */
  const listScroll = useRef<number | null>(null)
  const listTrigger = useRef<SettingsSubPage | null>(null)

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

      // 必须在切页渲染之前记录：列表换成子页时，浏览器的滚动锚定会先移动位置。
      const leavingSettingsList = lastPage.current === 'settings'
        && lastSubPage.current === null
        && resolution.route.page === 'settings'
        && resolution.route.subPage !== null
      if (leavingSettingsList) {
        listScroll.current = window.scrollY
        listTrigger.current = resolution.route.subPage
      }

      setRoute(resolution.route)
    }

    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  // 首次加载不抢焦点。之后每次切页或换子页都回到页顶并聚焦新页标题；
  // 唯一例外是从设置子页返回列表：恢复离开列表时的滚动位置，并把焦点交回触发项。
  useEffect(() => {
    const previousPage = lastPage.current
    const previousSubPage = lastSubPage.current
    if (previousPage === route.page && previousSubPage === route.subPage) return

    const enteringSettingsList = previousPage === 'settings'
      && previousSubPage !== null
      && route.page === 'settings'
      && route.subPage === null

    lastPage.current = route.page
    lastSubPage.current = route.subPage

    if (enteringSettingsList && listScroll.current !== null) {
      const trigger = listTrigger.current
      scrollToPosition(listScroll.current)
      listScroll.current = null
      listTrigger.current = null
      if (trigger !== null) {
        document.getElementById(settingsItemId(trigger))?.focus({ preventScroll: true })
      }
      return
    }

    // 离开设置页后不再保留列表位置，避免下次从别处进入设置时误用旧值。
    if (route.page !== 'settings') {
      listScroll.current = null
      listTrigger.current = null
    }

    scrollToTop()
    headingRef.current?.focus()
  }, [route.page, route.subPage])

  return { page: route.page, subPage: route.subPage, headingRef }
}
