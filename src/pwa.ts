/**
 * Service Worker 缓存状态的读取：判断"训练内容是否已缓存"。
 * 只读缓存键名，不触碰任何健康数据；应用内离线诊断与重试入口共用这一条路径。
 */

export type CacheStatus = 'ready' | 'pending'

/** 预缓存完整才算"当前可离线使用"：文档与应用代码都必须在缓存里。 */
export async function readCacheStatus(): Promise<CacheStatus> {
  const ready = window.__SW_READY__
  if (!ready) throw new Error('service worker is not registered')
  await ready
  const registration = await navigator.serviceWorker.ready
  const worker = registration.active
  if (!worker) throw new Error('Service worker is not active')
  const cacheNames = await caches.keys()
  const cacheName = cacheNames.find((name) => name.startsWith('workbox-precache'))
  if (!cacheName) return 'pending'
  const cache = await caches.open(cacheName)
  const cachedRequests = await cache.keys()
  const hasDocument = cachedRequests.some(
    (request) => new URL(request.url).pathname.endsWith('/index.html')
  )
  const hasApplicationCode = cachedRequests.some((request) =>
    /\/assets\/index-.+\.js$/.test(new URL(request.url).pathname)
  )
  return hasDocument && hasApplicationCode ? 'ready' : 'pending'
}
