# 部署与发布维护手册

面向维护者的可执行手册：GitHub Pages 发布、版本标签、回滚、隐私检查。
本应用是静态 PWA，没有后端；发布 = 把构建产物放到固定的 HTTPS origin。

## 部署地址

- 站点：`https://angle-aob.github.io/sleep-well/`
- 仓库：`Angle-AOB/sleep-well`（GitHub Pages 项目站点，路径前缀 `/sleep-well/`）
- 构建基址：只有发布构建使用 `GITHUB_PAGES=1`（资产挂到 `/sleep-well/`）；
  本地开发与测试构建始终使用 `/`。切换由 `vite.config.ts` 里的 `GITHUB_PAGES` 环境变量控制，
  不要把测试基址改成 `/sleep-well/`。

## 首次部署（需要维护者执行一次）

1. 把集成分支合并到 `main` 并推送到 GitHub。
2. 打开仓库 Settings → Pages → Build and deployment → Source 选择 **GitHub Actions**。
3. Actions 里的 **Deploy to GitHub Pages** workflow 会在 `main` push 后自动运行，也可手动选择 `main` 分支运行。
4. 构建 job 全绿后 deploy job 才会执行；完成后访问 `https://angle-aob.github.io/sleep-well/` 验证。
5. 首次访问后等待应用提示“当前可离线使用”，再做一次断网刷新确认缓存完整。

> 没有启用 Pages 或没有推送之前，workflow 不会产出任何线上内容；以上步骤必须由真人完成。

## 日常发布步骤

1. 变更合并进 `main`，本地收工检查全绿：
   `npx tsc -b`、`npx eslint .`、`npm run build`、`npx playwright test --reporter=line`。
2. 推送 `main`，确认 Deploy workflow 全绿：
   ```bash
   git push origin main
   ```
3. workflow 全绿后再打并推送版本标签（见下），**同一次发布只推送标签、不再重复推送 `main`**：
   ```bash
   git tag v0.2.0
   git push origin v0.2.0
   ```
   生产发布 workflow 只从 `main` push 或手动选择 `main` 触发；版本标签用于标记已验证的发布提交，不单独触发部署。
4. workflow 顺序：install → eslint → tsc → Playwright 全量 → `GITHUB_PAGES=1 npm run build` →
   upload-pages-artifact → deploy-pages。**构建或测试失败时 deploy job 不会运行**，线上保持上一个可用版本。
5. 发布后在真机上核对：版本号/页面可打开、离线提示出现、日记可保存。
6. 发布后补一条版本记录：版本号、日期、变更摘要（与标签一一对应，便于回滚时定位）。

## 版本标签规则

- 形式：`v<主>.<次>.<修订>`（例如 `v0.1.0`、`v0.2.1`）。
- 每次对外发布打一个标签；标签指向的提交必须是全量测试通过的提交。
- `v*` 标签用于标记已验证的发布提交，不单独触发部署；部署 workflow 只响应 `main` push 或手动选择 `main`。
- 仅修订号变化：可回滚的小修；次版本：行为/规则变化；主版本：不兼容的备份 schema 或产品形态变化。

## 回滚步骤

线上版本坏了时按顺序找最快的路径：

1. **重新部署旧标签**（推荐）：
   ```bash
   git checkout -b hotfix/rollback v0.1.0   # 从要回滚到的标签拉出分支
   git tag v0.1.1                            # 回滚也是一次对外发布，打新标签
   git push origin v0.1.1                    # 标签用于记录回滚版本；部署前需把回滚提交合并到 main
   ```
   - 每次对外发布都要有对应标签，线上才有版本可查；回滚同样打标签。
   - 回滚提交必须合并到 `main` 并推送，才能触发唯一的生产部署 workflow；不要从临时回滚分支手动运行部署。
   - 或直接在 Actions 里对 `main` 上对应的成功 workflow run 使用 “Re-run all jobs” 重新发布当时的产物。
2. **代码回退**：在集成分支上 `git revert` 引入问题的提交并推送，让 workflow 重新发布。
3. 回滚只影响线上静态资源；用户设备上的 IndexedDB 数据不受影响（备份 schema 兼容性见
   `docs/adr/0001-local-first-data.md`，升级不清数据）。
4. 回滚后按“日常发布步骤”第 5 条做真机核对。

## 隐私检查清单（每次公开发布 / 公开 issue 前自查）

- [ ] 构建产物无外部分析/跟踪/广告脚本：`tests/no-external-scripts.spec.ts` 全量测试守护，
      发布 workflow 必须跑过 Playwright 全量；不要向产物引入任何外部 `<script src=http…>`。
- [ ] 无遥测：不新增分析、崩溃上报、广告 SDK；错误只在本地展示（`ErrorLogPanel`）。
- [ ] 公开 issue 前自查诊断信息：诊断文本只含版本、环境与错误类别；确认不含睡眠日记、
      筛查答案、疗程状态、备份内容或个人身份信息（应用内有提示，最终由报告人负责检查）。
- [ ] 备份文件（`.sleep-backup.zip`）不是加密的：文档与界面都不得宣称加密；不要把备份上传到公开位置。
- [ ] 新增用户可见文案全部走 `src/i18n/index.ts`，不在组件里硬编码。
- [ ] 发布前跑过全部四项收工检查，数字记录在发布说明里。

## 仍需真人执行的验收（自动化不能替代）

以下项目**当前代码与测试无法完成**，公开发布前需要真人执行并留存记录：

1. **真实手机验收**：iOS Safari（当前与前一主要版本）与 Android Chrome（当前与前一主要版本）
   上的安装、离线打开、日记、备份导出/导入。自动化只覆盖等效移动视口（Pixel 7 项目），
   不能替代真机（真机系统通知、文件分享、存储清理行为不同）。
2. **屏幕阅读器检查**：VoiceOver（iOS）、TalkBack（Android）走通入门、日记、筛查、备份；
   系统大字与高对比度模式下的可用性检查。自动化只断言 ARIA 语义与焦点可见性。
3. **系统通知**：通知权限授予/拒绝/撤销的真实路径（应用内提醒不依赖系统通知，已自动化覆盖）。
4. **Lighthouse 跑分**：在发布 origin 上实际跑 Lighthouse（PWA/可访问性/性能），留存分数与日期。
5. **真实设备离线与恢复验收记录**：真机断网使用、应用更新失败回退、系统清理站点数据后
   用 ZIP 跨设备恢复、CSV 在 Excel/WPS 打开。
6. **临床审阅**：有资质的 CBT-I 临床人员对安全筛查、睡眠限制规则、刺激控制与就医提示
   文案的审阅记录。产品规则是产品边界（见 `GLOSSARY.md` 与 ADR），不等于临床背书。
7. **中文输入**：用系统中文输入法实测文本输入（IME 选词、组合输入、粘贴）。
   当前应用没有自由文本字段（日记全是选择/时间/数值），此项在新增任何文本输入后必须补测并留存记录。

## 相关文档

- `docs/adr/0003-web-pwa-first.md`：Web PWA 首发、Capacitor 延后。
- `docs/adr/0001-local-first-data.md`：本地优先数据与备份语义。
- `tests/deploy.spec.ts`：发布产物基址（`/sleep-well/`）与本地基址（`/`）的守护测试。
- `.github/workflows/deploy.yml`：唯一的构建与部署流水线。
