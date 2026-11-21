import { test, expect } from '@playwright/test'
import { execSync } from 'node:child_process'
import { readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

// GitHub Pages 发布产物：GITHUB_PAGES=1 时资产必须挂在 /sleep-well/ 基址下；
// 本地开发与测试构建必须继续用 /，否则测试基址被改坏。
// 本文件只跑桌面 chromium 项目（mobile 项目只匹配 a11y-*）。

const pagesOut = join(process.cwd(), 'dist-gh-pages')

test.describe('GitHub Pages build output', () => {
  // 共享同一个构建输出目录，必须串行，避免并行 worker 互相删改。
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(() => {
    rmSync(pagesOut, { recursive: true, force: true })
    execSync('npx vite build --outDir dist-gh-pages --emptyOutDir', {
      env: { ...process.env, GITHUB_PAGES: '1' },
      stdio: 'pipe'
    })
  })

  test('the pages build serves assets under the /sleep-well/ base', () => {
    const html = readFileSync(join(pagesOut, 'index.html'), 'utf8')
    expect(html).toContain('/sleep-well/assets/')

    const manifest = JSON.parse(readFileSync(join(pagesOut, 'manifest.webmanifest'), 'utf8'))
    expect(manifest.start_url).toBe('/sleep-well/')
    expect(manifest.scope).toBe('/sleep-well/')
    expect(manifest.id).toBe('/sleep-well/')

    // Service Worker 与预缓存清单必须随产物一起生成。
    expect(readFileSync(join(pagesOut, 'sw.js'), 'utf8').length).toBeGreaterThan(0)
  })

  test('the local build keeps serving from the root base', () => {
    const html = readFileSync(join(process.cwd(), 'dist', 'index.html'), 'utf8')
    expect(html).not.toContain('/sleep-well/assets/')

    const manifest = JSON.parse(readFileSync(join(process.cwd(), 'dist', 'manifest.webmanifest'), 'utf8'))
    expect(manifest.start_url).toBe('/')
    expect(manifest.scope).toBe('/')
    expect(manifest.id).toBe('/')
  })
})
