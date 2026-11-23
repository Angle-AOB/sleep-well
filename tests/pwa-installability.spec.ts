import { test, expect } from '@playwright/test'

test('production manifest declares stable standalone identity and real install icons', async ({ page, request }) => {
  await page.goto('/')
  const manifestLink = page.locator('link[rel=manifest]')
  await expect(manifestLink).toHaveCount(1)
  const manifestUrl = new URL(await manifestLink.getAttribute('href') ?? '', page.url())
  const response = await request.get(manifestUrl.href)
  expect(response.ok()).toBeTruthy()
  const manifest = await response.json() as { id: string; name: string; start_url: string; scope: string; display: string; icons: { src: string; sizes: string; type: string }[] }
  expect(manifest.name).toBe('睡眠行为训练器')
  expect(manifest.id).toBe('/')
  expect(manifest.start_url).toBe('/')
  expect(manifest.scope).toBe('/')
  expect(manifest.display).toBe('standalone')
  for (const size of [192, 512]) {
    const icon = manifest.icons.find((item) => item.sizes === `${size}x${size}`)
    expect(icon, `manifest has ${size}px icon`).toBeTruthy()
    expect(icon?.type).toBe('image/png')
    const iconResponse = await request.get(new URL(icon!.src, manifestUrl).href)
    expect(iconResponse.ok()).toBeTruthy()
    const bytes = await iconResponse.body()
    expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
    expect(bytes.readUInt32BE(16)).toBe(size)
    expect(bytes.readUInt32BE(20)).toBe(size)
  }
})
