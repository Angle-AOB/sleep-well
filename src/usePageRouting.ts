import { useEffect, useRef, useState } from 'react'
import { hashForPage, routeFromHash, type Page, type Route } from './routing'

const todayRoute: Route = { page: 'today', subPage: null }

/** 空地址或 `#/…` 才是「想打开某个页面」；`#main-content` 属于当前页内的片段。 */
function isRouteLike(hash: string): boolean {
  return hash === '' || hash === '#' || hash.startsWith('#/')
}

/**
 * 四页壳的地址状态：解析 hash、未知路由回落今日、切页回到页顶并把焦点交给页标题。
 * 只为这四个顶层页面服务，子页目前只解析不渲染。
 */
export function usePageRouting() {
  const [route, setRoute] = useState<Route>(() => routeFromHash(window.location.hash) ?? todayRoute)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const lastPage = useRef<Page>(route.page)

  // 只有空地址、未知路由才回落到今日并替换地址；页内片段不动地址。
  // 初始状态已经把 null 解析成今日，这里只需要改写地址栏。
  useEffect(() => {
    const hash = window.location.hash
    if (!isRouteLike(hash) || routeFromHash(hash) !== null) return
    window.history.replaceState(null, '', hashForPage('today'))
  }, [])

  useEffect(() => {
    function onHashChange() {
      const hash = window.location.hash
      const next = routeFromHash(hash)
      if (next !== null) {
        setRoute(next)
        return
      }
      // 页内片段不切页；只有看起来是路由的地址才回落到今日。
      if (isRouteLike(hash)) {
        window.history.replaceState(null, '', hashForPage('today'))
        setRoute(todayRoute)
      }
    }

    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  // 首次加载不抢焦点；之后每次切页都回到页顶，并把焦点交给新页标题。
  useEffect(() => {
    if (lastPage.current === route.page) return
    lastPage.current = route.page
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
    headingRef.current?.focus()
  }, [route.page])

  return { page: route.page, subPage: route.subPage, headingRef }
}
