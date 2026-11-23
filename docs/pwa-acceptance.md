# Web PWA Acceptance

Issue #40 acceptance record for the Web-only application. No application install button, APK, or native shell is provided.

## Platform differences

| Platform | Install path | Acceptance notes |
| --- | --- | --- |
| Android Chrome | Chrome may offer its install prompt/menu when the site meets browser criteria; install is user-initiated by the browser. | The installed app uses the standalone display mode. Browser prompt timing and eligibility remain controlled by Chrome. |
| Desktop Chromium | Chromium may expose Install in the address bar or browser menu when installability criteria are met. | This work verifies the production manifest and icon responses in Playwright Chromium; it does not automate or guarantee the browser's install UI. |
| iOS Safari | Use Share > Add to Home Screen; iOS Safari does not use Chromium's `beforeinstallprompt` flow. | Not run in a physical iOS Safari device in this worktree. PWA capabilities and caching must not be inferred from Chromium install UI. |

## Results

- Manifest includes stable `id`, `start_url`, and `scope`, plus `display: standalone`.
- Manifest references valid 192x192 and 512x512 PNG bitmap resources.
- Production service worker precaches the application document, application JavaScript/CSS, manifest, and icons; training content is bundled in the application JavaScript. Navigation falls back to `index.html` for offline reload.
- Existing Playwright offline suites verify offline reload, local diary/settings writes, and preservation of local records after failed service-worker update.
- Browser artifact test: passed in Chromium on an isolated port. This checks manifest identity/display and PNG signature/dimensions from the production build.
- Regression matrix: 185 passed, 2 failed out of 187 across Chromium and mobile Chromium. Both failures are the pre-existing diary `button[i]` touch-target assertion (28px width versus the 44px minimum); no offline, navigation, horizontal-overflow, or other accessibility checks failed.
- Device-specific installation UI: Android Chrome and iOS Safari not run; desktop Chromium install UI not automated.

## Verification commands

- `pnpm build`
- `pnpm exec playwright test tests/pwa-installability.spec.ts --project=chromium`
- Issue #40 regression run: offline cache/flow, navigation accessibility, mobile accessibility, and all defined no-horizontal-overflow checks.
