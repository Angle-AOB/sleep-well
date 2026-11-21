import { test, expect } from '@playwright/test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const distDir = join(process.cwd(), 'dist')

function collectFiles(dir: string): string[] {
  const results: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      results.push(...collectFiles(full))
    } else {
      results.push(full)
    }
  }
  return results
}

test('build output contains no external analytics tracking or ad scripts', async () => {
  const files = collectFiles(distDir)
  const jsAndHtml = files.filter((f) => f.endsWith('.js') || f.endsWith('.html'))
  expect(jsAndHtml.length).toBeGreaterThan(0)

  const trackingPatterns = [
    /<script[^>]+src=["']https?:\/\//i,
    /google-analytics\.com/i,
    /googletagmanager\.com/i,
    /facebook\.net\/.*\/fbevents/i,
    /doubleclick\.net/i,
    /connect\.facebook\.net/i,
    /hotjar\.com/i,
    /mixpanel\.com/i,
    /segment\.io/i,
    /amplitude\.com/i,
    /sentry\.io\/[0-9]+\/api/i
  ]

  for (const file of jsAndHtml) {
    const content = readFileSync(file, 'utf8')
    for (const pattern of trackingPatterns) {
      expect(content, `${file} should not match ${pattern}`).not.toMatch(pattern)
    }
  }
})
