# Sleep Well

中文移动端优先的睡眠行为训练器 PWA。项目定位是帮助改善睡眠习惯的行为工具，不是睡眠监测、诊断或治疗服务。

## Development

```bash
npm install
npm run dev
```

生产构建使用 `npm run build`。Playwright 外部行为测试使用 `npm run test:e2e`，首次运行可执行 `npm run test:e2e:install` 安装 Chromium。

应用默认使用 IndexedDB 保存偏好、安全筛查、六周疗程与睡眠日记，Service Worker 由 Vite PWA 在生产构建中生成。GitHub Pages workflow 位于 `.github/workflows/deploy.yml`。
