# 项目约定

## 交付流程（用户明确要求）

- 任何修改完成后必须接着跑 `code-review`（standards + spec 两轴并行）。
- 审查有问题就修，修完再跑，**循环到两轴都没有遗留问题才允许关闭 issue**。
- 关闭 issue 前：`tsc -b`、`eslint .`、`npm run build`、完整 `npx playwright test` 全部通过。

## 代码与测试约定

- 领域规则放 `src/domain/*`，纯函数、不碰 DOM；派生指标不入库，按当前规则重算。
- 用户可见文案一律走 `src/i18n/index.ts`；日期/时长/百分比也走 i18n。
- 端到端测试用 `page.clock.setFixedTime` 固定本地日期，避免依赖真实系统时钟。
- 时区/夏令时测试放 `tests/diary-timezone.spec.ts`，通过 `process.env.TZ` 并在 afterAll 还原。
- IndexedDB 库版本每次新增 store 递增，upgrade 中按 `contains` 逐个创建，不删旧数据。
