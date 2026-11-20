# 移动端睡眠行为训练器：跨平台技术栈选型研究

**结论：MVP 选择 A，TypeScript + React/Vite + 独立 PWA 离线层；推荐排序为 A > B > C > D。** 保留未来接入 Capacitor 的接口边界，目前无需原生壳。该排序是针对本项目约束的工程判断，不是框架通用性能排名。
**条件性答案：** 跨平台框架在“近期确定要发布原生 App，并依赖原生通知、文件系统或其他设备能力”时更有价值；当前以离线 PWA、本地日记和六周行为流程为核心，框架无法消除浏览器存储、安装和后台能力的限制。[^01][^11][^19][^27]
**研究日期：2026-11-20。** 依 research skill 核查已打开的一手文档；浏览器资料限 MDN、WebKit、W3C/WHATWG，框架与库资料来自官方维护者。检索摘要不作为证据；官方事实附来源，排序、架构与验收条件属于本项目建议。
**范围：** 中文移动端优先、开源、PWA、无账号无云同步；IndexedDB 保存用户数据，Cache Storage 保存离线资源；ZIP 内含 JSON 且使用 DEFLATE，另支持 CSV 导出；六周 CBT-I 行为流程；所有文本 i18n；通知可降级；未来考虑 Android/iOS，不研究穿戴接入。

## 1. 推荐排序与适用条件

| 顺位 | 方案 | 与本项目的适配判断 | 主要成本与改变结论的条件 |
|---|---|---|---|
| 1 | A：TypeScript + React/Vite，或等价轻量 Web 栈 | 直接使用 IndexedDB、Cache、File、Streams；DOM 表单适合日记、课程与设置，平台适配层最少。[^09][^10][^33][^38] | manifest、service worker、升级策略必须单独建设；若近期确定原生能力，再增加 Capacitor。[^01][^03] |
| 2 | B：Ionic + Capacitor | Ionic 提供 Web UI，Capacitor 提供原生运行时；可共享 Web 页面并调用原生插件。[^11][^12][^15] | 当前只发 PWA 时，原生桥的收益有限；若团队熟悉 Ionic 或很快发布双端原生，可升为首选。 |
| 3 | C：React Native + Expo，含 React Native Web | 官方支持 Android/iOS/Web，适合原生端与 Web 同期交付；可共享 React 组件、业务逻辑与翻译。[^19][^21][^32] | 浏览器 DOM/API 与原生运行时需分支；PWA 离线仍需自建；近期原生优先且团队熟悉 Expo 时排序上升。[^20][^22] |
| 4 | D：Flutter，含 Flutter Web | 官方支持 Android/iOS 与主流浏览器，国际化工具完整。[^26][^30] | 当前无既有 Dart 资产，需增加 Web API/插件适配及独立离线层；已有 Flutter 团队、原生 UI 优先时可重新评估。[^27][^29] |

- A 与 B 不是互斥终局：Capacitor 可加入现有现代 JavaScript 项目，不强制采用 Ionic；“A → React + Capacitor”是可行升级路径。[^11]
- 不宜仅为“以后也许原生”先承担 C/D 的平台适配；反之，若原生能力成为近期硬需求，继续只做浏览器也不合适。这是需求权重判断。
- 未核实四方案在本项目中的包体、首屏、内存、耗电或代码复用百分比，不给伪精确性能分数；中文输入、无障碍与低端机体验交由 PoC。

## 2. PWA、安装与移动浏览器的现实边界

- **manifest 是安装元数据，不是离线引擎。** 设置稳定的 `id`、`name/short_name`、图标、`start_url`、`scope`、`display`；manifest scope 与 service worker scope 是不同概念。[^02][^03]
- MDN 列出的 Chromium 安装推广条件包括 HTTPS（本地开发例外）、名称、192/512 图标、启动 URL 与显示模式等；符合条件不保证一定展示安装提示。[^01]
- **可安装不等于有 service worker，更不等于离线完整。** MDN 明确 service worker 不是安装的必备条件；本项目仍需它拦截请求、从缓存返回资源。[^01][^03]
- service worker 需要安全上下文；首次成功联网完成注册和资源下载后，才可能有完整离线体验。应在确认资源齐备后展示“已可离线使用”，不能承诺首次从未访问也可离线打开。[^03]
- 缓存应覆盖应用壳、路由回退、六周全部课程、翻译与必要静态资源；不要让后续周次或语言切换依赖 CDN/首次联网。此为根据缓存机制提出的产品验收要求。[^03]
- **Android Chrome：** 支持安装；MDN 区分有 GMS 时的 WebAPK 与其他环境的快捷方式，不应承诺所有 Android 手机都有相同安装体验。`beforeinstallprompt` 应按能力检测使用。[^01]
- **iOS：** 16.3 及以前主要通过 Safari 安装；16.4 起支持的第三方浏览器也能通过分享菜单添加主屏幕。不能把 Chrome 桌面的安装事件流程原样用于 iOS，MDN 明确 iOS 不支持 `beforeinstallprompt`。[^01][^04]
- **iOS Web Push：** WebKit 从 iOS/iPadOS 16.4 为主屏幕 Web App 提供支持，权限申请须由用户直接操作触发；不能据此推断普通 Safari 标签页同样可用。[^04]
- **安装后仍受 Web 平台约束。** 逐项检测 service worker、IndexedDB、存储持久化、文件分享及通知；不能用“已安装”代替各项能力验证。[^01][^08][^40]
- 官方资料描述的是各自版本与政策范围；当前中国大陆设备组合、系统清理行为及所有 OEM 浏览器兼容性未核实，发布前限定支持矩阵并真机验证。

## 3. 本地数据、持久化与备份边界

| 机制 | 已核实行为 | 本项目决策 |
|---|---|---|
| IndexedDB | 保存结构化数据与 Blob，异步、支持事务，遵循同源策略。[^09] | 存日记、筛查回答、六周进度、规则/内容版本及设置；记录保存以事务成功为准。 |
| Cache Storage | 保存 Request/Response；不会自动更新或过期，Cache API 不自动遵守 HTTP 缓存头。[^10] | 只放可重建的程序、课程、翻译资源；显式版本化、回收旧缓存。 |
| 默认 best-effort | IndexedDB、Cache 等受同一 origin 的浏览器配额管理，可能被回收。[^07] | Cache 中再存一份日记不构成独立备份；共享域名下其他应用也可能竞争配额。 |
| `persist()` | 安全上下文中申请持久存储，返回布尔结果；浏览器决定批准与否。[^08] | 在主页面检测并申请、显示实际状态；失败不阻止使用，不能宣称已永久保存。 |
| `estimate()` | 返回估算 usage/quota，并非预留容量；达到限制可出现 `QuotaExceededError`。[^05][^07] | 处理写入/事务失败，提示空间不足；优先清理可重建缓存，保护用户数据。 |

- **持久化保护的边界：** 获批后可免于通常的自动回收，但用户仍可清除站点数据；它不提供跨设备恢复、账号恢复或外部备份。隐私模式数据通常随会话结束删除。[^07][^08]
- WebKit 2023 政策：Safari 17/iOS 17 起浏览器类应用每 origin 上限约为磁盘 60%，嵌入式 WebKit 应用约 15%，主屏幕 Web App 获浏览器级额度；整体上限约 80%/20%。这些是政策上限，不是可用空间承诺。[^05]
- WebKit 文档还列出空间压力、整体配额、长期不交互等回收原因，并以 origin 为单位回收；主屏幕启动可影响持久化审批启发式，但不是自动获批保证。[^05]
- **Safari“七天删除”不能一概而论。** WebKit 的 ITP 说明针对无交互站点按 Safari 使用天数计数；主屏幕 Web App 有独立使用计数，使用会重置。它不等于主屏幕数据七个自然日必删，也不等于永不丢失。[^06]
- 固定 HTTPS origin：换协议、域名或端口会形成不同存储来源；迁站必须安排旧站导出、新站导入。普通同源应用更新不应以删除数据库完成迁移。[^07][^09]
- 产品应明确：刷新/关闭不会按设计清空日记，但清站点数据、设备故障、未迁移换机等无法靠单份浏览器数据恢复；卸载主屏幕图标是否保留数据的全版本行为未核实。
- **完整备份是用户实际保存到浏览器站点存储之外的 ZIP。** 只在内存生成 Blob、存回 IndexedDB，或点击过分享按钮，都不足以证明已留下可恢复副本。[^07][^39][^40]
- 建议在积累记录后提醒备份，后续按用户设置重复提示；显示最近一次导出/导入记录，提供离线恢复说明。六周结束仍允许导出；CSV 主要供查看分析，不能默认承担完整恢复。

## 4. 四条路线的技术事实与限制

### A. 原生 Web PWA
- 推荐 TypeScript + React/Vite；Vite 是构建工具，PWA manifest、service worker 与缓存更新策略需额外配置，不能把普通构建产物当作离线验收结果。[^01][^03]
- 六周流程、计算与安全约束用不依赖 UI/浏览器的 TypeScript 领域逻辑；浏览器存储、备份、通知作为适配器。这里的“原生 Web”指直接使用 Web 标准，不指 Android/iOS 原生 UI。
- 对当前以文字、表单与少量图表为主的需求，其主要优势是少一层运行时映射；具体开发速度、体积与可访问性质量仍取决于实现，未核实定量优势。

### B. Ionic + Capacitor
- Ionic 是基于 Web Components 的 UI 工具，可与 React/Angular/Vue 配合；Capacitor 是 Web-first 的原生运行时，可面向 iOS、Android 和 Web。两者职责不同，也可单独使用 Capacitor。[^11][^12]
- PWA 是部署到 Web 服务器的版本；原生流程则构建 Web 资源、同步进原生工程，再使用 Xcode/Android Studio 等构建发布。不是把浏览器已安装的 PWA 自动“转成”商店包。[^13][^14]
- 插件通过桥接访问原生 SDK，可自写 Swift/Obj-C、Java/Kotlin 或 Web 实现；同名接口不意味着每个插件在 Web 都有等价能力，应检查目标平台支持并设计回退。[^13][^15]
- Capacitor 官方 PWA 指南仍要求提供 manifest 和 service worker；原生桥不能提高同一 Web 版本在 Safari/Chrome 里的权限。[^13]
- **壳不保证 IndexedDB 更耐久。** Capacitor 官方存储指南对 WebView 的 localStorage/IndexedDB 保留提出风险提示；Preferences 适合少量键值，复杂结构化原生存储可评估 SQLite 插件。[^16]
- 原生应用与线上 PWA 不应假设共享数据库；Capacitor 默认本地 hostname/scheme 与部署域名不同，加上同源隔离，应设计明确导入迁移。具体安装迁移行为须真机核实。[^09][^45]

### C. React Native + Expo
- Expo Web 通过 React Native Web 将 View/Text 等映射到浏览器；也能使用 DOM 标签，但这些 DOM 组件不能直接在原生端渲染。官方支持 Web 导出。[^19]
- React Native 文档提供 Platform 分支与 `.ios/.android/.native` 文件；共享 React/TypeScript 不等于 IndexedDB、Cache Storage、DOM 全部在原生存在。[^21][^22]
- Expo PWA 文档示范手工 manifest、图标、注册 service worker，以及导出后用 Workbox 生成缓存；官方更推荐原生端获得移动离线体验，并提醒激进缓存的更新风险。[^20]
- 对本项目，Web 端仍用 IndexedDB/Cache，原生端需另外选择持久化与文件适配器；Expo FileSystem 提供原生文件读写，不能据此推断它内置 ZIP 压缩。[^24]
- 若选 C，先验证表单、中文输入、离线恢复和平台导出差异；当前 RN 原生运行时对 Compression Streams/所选 ZIP 库的完整兼容性未核实，不能直接照搬浏览器实现。[^22][^33]

### D. Flutter
- 官方支持原生 Android/iOS 与 Web；支持浏览器和实际 CI 覆盖的版本有区别，应按官方平台矩阵选最低版本。[^26]
- Flutter 官方 FAQ 将 PWA/SPA 列为适用场景，也说明静态、文本流式网站不是强项；本项目是应用，不能只据此排除 Flutter，但仍需验证课程阅读和 Web 无障碍体验。[^27]
- **当前默认不生成/管理缓存型 service worker。** 官方 FAQ 说明较新版本可能写入清理旧 worker 的桩；需要离线能力时自行使用标准 Web 工具或 Workbox。不能沿用旧版“Flutter 自动离线”的结论。[^27]
- Web 部署文档支持向自定义 service worker 提供 precache manifest；渲染器资源默认可能从 gstatic CDN 加载，纯离线需评估自托管并完整缓存相关资源。[^28]
- Web 不能照搬 `dart:io`；插件可只实现部分平台，Web 实现及平台声明要逐个检查。IndexedDB/Cache 需选择 Web API 互操作或适配库，原生存储另行实现。[^27][^29]

## 5. i18n 与本地化方案

- **A/B：** 使用 i18next + react-i18next；维护者支持 React/React Native，支持资源字典、插值与复数。首版中文资源随包携带，禁用核心流程对远程翻译下载的依赖。[^31][^32]
- **C：** Expo 官方指南使用 expo-localization 获取语言设置，示范 i18n-js，也列出 React i18next 等方案；可与 A/B 统一翻译格式，但 Web/原生的系统语言响应需分别验证。[^23]
- **D：** 官方 flutter_localizations + intl + gen-l10n/ARB，支持复数、日期数字格式与中文脚本/地区区分；路线成熟，但不等于直接复用 React 的资源工具链。[^30]
- 所有用户可见内容走资源键：课程、安全提示、错误、无障碍标签、导出说明、通知文案、安装/离线/备份状态；系统权限用途说明与 manifest 名称也纳入本地化配置。[^02][^23][^30]
- 内部字段、规则标识和备份 schema 使用稳定标识，不随语言改变；CSV 的机器字段名与本地化展示名分离。日期存储区分“日记所属本地日期”和绝对时间，时区/夏令时变化纳入测试。

## 6. ZIP/DEFLATE、CSV 与文件传递

- **Compression Streams 是编解码流，不是 ZIP 打包器。** WHATWG 定义 CompressionStream/DecompressionStream；`deflate` 是带 zlib 包装的 RFC 1950 数据，`deflate-raw` 是 RFC 1951 原始 DEFLATE，`gzip` 又是另一种包装。不能把压缩 JSON 后改扩展名当成 ZIP。[^33][^34]
- 浏览器可以处理字节流；应检测具体编解码格式，不能只检查 CompressionStream 对象存在，或把整个 API 的 Baseline 日期当作每个格式都可用的证明。[^34]
- **本项目需要第三方 ZIP 容器库。** 可用 JSZip 创建 ZIP 并显式选择 DEFLATE，默认 STORE 不压缩；浏览器可生成 Blob。库负责容器细节，不应自行实现 ZIP 格式。[^35]
- JSZip 的异步接口仍可能在内存保留完整结果；压缩、解压与 JSON 解析峰值、取消操作和旧 iPhone 内存必须实测，不能把 async 当成低内存或流式保证。[^36]
- **Capacitor 壳可复用 Web ZIP 逻辑，文件出口分平台。** 官方 Filesystem 支持原生二进制内容的 base64 写入，Blob 写入仅 Web；原生可再接文件分享/选择能力，具体插件支持逐项核实。[^17]
- **Expo 原生：** 用 FileSystem 写入字节，再选经过 RN 运行时验证的 ZIP 库/模块；文件 API 可行不等于压缩 API 已核实。Web 端继续浏览器实现。[^22][^24]
- **Flutter：** 第三方 Dart archive 包提供浏览器/原生可用的内存 ZIP API，ZipEncoder 支持 DEFLATE；依赖 dart:io 的 archive_io 只用于相应原生适配，不能导入 Web。[^42][^43]
- 浏览器导入使用用户选择文件的 File API；导出使用 Blob URL + 下载链接，支持时可增加 Web Share 文件分享；不把桌面式文件系统选择 API 作为移动端硬依赖。[^38][^39][^40]
- iOS 分享/下载是否实际留下文件须回读验证；Web Share 需要安全上下文和用户激活，且文件类型支持应通过 canShare 检查。用户选择第三方分享目标后的处理不由本应用控制。[^39][^40]
- **备份格式建议：** 版本化 ZIP，内部为 UTF-8 JSON 与格式说明元数据，包含 schema/app/内容规则版本、导出时间、全部记录与设置；明确采用 DEFLATE，首版拒绝加密 ZIP 和不支持的格式变体。
- **导入边界建议：** 限制条目数、压缩/解压总量、单条目大小与允许路径；验证 JSON schema、版本、ID、日期和引用；拒绝路径穿越、超限解压、损坏及未知未来版本；失败不覆盖现有数据。
- JSON 全量导入先暂存、预览、确认恢复策略，再在事务中提交；压缩不是加密，ZIP/CSV 是敏感健康数据文件，产品需明确提示妥善保管。必要的安全范围来自当前数据特征，而非框架差异。
- **CSV：** 依据 RFC 4180 处理逗号、双引号、换行及一致列数；该 RFC 为 Informational，并非强制互联网标准。编码约定 UTF-8；Excel/WPS 的 BOM 与中文兼容性未核实，纳入 PoC。[^41]
- CSV 仅用于日记导出，公布字段、单位与日期规则；首版数据恢复和迁移只接受 ZIP，不增加尚未确认的 CSV 导入功能。面向电子表格的文本还需验证公式注入防护，不让自由文本被当公式执行。

## 7. 推荐架构：MVP 与升级路径

1. **领域层：** 独立 TypeScript 模块承载日记、六周状态机、规则与安全边界、统计和备份 schema；规则/课程版本可追溯，核心运算不依赖网络或通知。
2. **内容与展示层：** React 移动优先页面 + 随包语言/课程资源；尽量使用系统字体，避免首次联网字体成为核心阅读依赖；设置明确的无障碍与中文输入验收标准。
3. **数据层：** IndexedDB Repository；业务记录与版本一起事务保存；应用升级做可回退/可恢复的数据迁移。Cache Storage 仅管理版本化资源，不能把清缓存和删日记混为一体。[^09][^10]
4. **离线层：** 独立 service worker（可用 Workbox），预缓存全疗程、路由回退、缓存完成状态与升级提示；新版资源准备好再切换，避免旧页面/新资源/新 schema 混用。[^03][^20]
5. **迁移层：** ZIP JSON 为完整备份，CSV 只供日记查看和分析；首版只支持 ZIP 导入。导入校验与领域对象解耦，文件获取/保存通过平台适配器，不把下载成功当作恢复成功。
6. **提醒层：** 必备的是应用内计划、打开应用后的到期提示与手工查看；系统通知通过可选适配器接入，拒绝授权、离线或后台受限不阻止训练流程。
7. **部署层：** 固定 HTTPS origin 与可静态托管构建产物；不要求后端账号/同步服务；MVP 核心运行时不依赖外部翻译、课程、分析脚本或远程字体。
8. **第一步升级：** 原生需求明确后在 A 上增加 Capacitor；继续复用页面、领域与备份格式，增加原生通知/文件适配。Ionic UI 可按实际需求再采用。[^11][^14]
9. **第二步升级：** 若 WebView 数据风险不可接受，评估原生 SQLite 适配；保持 Web 用 IndexedDB/Cache。PWA → 原生通过显式 ZIP 导入迁移，双端不自动同步。[^16]
10. **重新选 C/D 的触发条件：** 原生界面/系统集成为主产品、团队已有对应资产，或 WebView 方案在实测中不满足需求；届时可复用格式与领域规范，但 UI、存储适配的复用不能预先保证。

## 8. 关键风险、通知降级与验证 PoC

- **通知原则：** Push API 接收服务器推送，依赖 service worker 与订阅；WebKit 的 iOS 支持也是 Web Push。它不能证明存在跨 iOS/Android 的离线定时本地通知能力。[^04][^44]
- 当前无推送后端，不把 Web Push 作为 MVP 依赖；浏览器跨平台可靠的离线定时通知能力未核实，不用页面定时器承诺应用关闭后的提醒。
- Capacitor Local Notifications 与 Expo Notifications 提供原生本地调度，但仍有权限、Android 精确闹钟/省电策略等条件；原生也不能承诺用户关闭通知后照常送达。[^18][^25]

| 必做 PoC | 测试条件 | 验收目标 |
|---|---|---|
| iOS PWA 存储与六周离线 | Safari 标签页与主屏幕分别测试；联网初始化后飞行模式、杀进程、重启、打开深层路由与第六周内容。 | 日记/进度可读写，全疗程和当前语言可用；显示实际离线准备状态，无隐性 CDN 请求。[^03][^05] |
| iOS 保留与存储失败 | 记录 persist/persisted/estimate；低空间、连续使用与长期不活跃、系统更新；至少跨越七个 Safari 使用日观察。 | 明确实测设备/版本和保留范围；写失败不假报成功；不把有限测试当成永久保留保证。[^05][^06][^08] |
| 真实丢失与恢复 | 手动清站点数据/重装测试副本；在另一设备或新 origin 导入外部保存的 ZIP。 | 明确清除会丢失；备份恢复日记、六周状态与设置，未备份部分不能虚构恢复。[^07] |
| ZIP 导入导出 | iPhone Files/Safari/主屏幕、Android Chrome；中文/emoji/多行文本；真实六周数据和放大样本；全程断网。 | ZIP 可被外部工具读取且方法为 DEFLATE；跨设备导回语义一致；记录耗时、峰值/崩溃边界与实际文件落盘。[^35][^36][^39] |
| 恶意或损坏导入 | 截断 ZIP、未知 schema、重复条目、路径穿越、异常尺寸、高压缩比、非法 JSON、冲突 ID。 | 可解释拒绝，无页面崩溃或旧数据覆盖；控制解压规模，事务失败可恢复。 |
| CSV 导出 | 引号/逗号/换行、中文、时区、公式样文本，使用 Excel/WPS/通用解析器读取导出结果。 | 格式符合约定，数字/日期不静默改变；BOM 策略由实测决定。[^41] |
| 通知降级 | 未安装 iOS、已安装但拒绝/撤销权限、离线、关闭应用、系统专注/省电；原生 PoC 另测精确闹钟授权。 | 不阻断日记与训练，应用内仍可查看计划；文案不承诺准时后台送达。[^04][^18][^25] |
| 升级、i18n 与可访问性 | v1 离线升级 v2、未完成编辑、数据迁移；缺失翻译、语言切换、VoiceOver/TalkBack、中文输入与大字。 | 无日记丢失或版本混用，核心文案均可本地化，焦点/输入与恢复路径可用。[^03][^23][^30] |

**决策门槛：** A 的 iOS 离线、外部备份恢复、升级安全通过后进入 MVP；若只在通知降级上受限，继续 A；若近期必须实现原生离线调度或系统文件能力，则升级 Capacitor 并重新验收存储与迁移，不必先重写成 C/D。
**证据限制：** Chrome 官方站点部分页面抓取超时，Android 安装结论使用已打开的 MDN 官方文档，不引用搜索摘要补缺；PKWARE APPNOTE 原文未取得，本报告不声称已核实其逐字节规范，ZIP 可行性依据 WHATWG 编解码规范和 ZIP 库维护者文档。各目标设备实测结果、RN 压缩兼容性及 OEM 行为均仍未核实。

## 参考来源（一手文档；访问日期 2026-11-20）

[^01]: MDN：[Making PWAs installable](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable)。安装条件、Android/iOS 与 beforeinstallprompt 差异。
[^02]: W3C：[Web Application Manifest](https://www.w3.org/TR/appmanifest/)。应用标识、启动、显示和导航范围。
[^03]: MDN：[Using Service Workers](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers)。安全上下文、作用域、离线缓存与更新生命周期。
[^04]: WebKit：[Web Push for Web Apps on iOS and iPadOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)，2023-02-16。主屏幕、权限手势、Web Push。
[^05]: WebKit：[Updates to Storage Policy](https://webkit.org/blog/14403/updates-to-storage-policy/)，2023-08-10。Safari 17 起配额、回收与持久化启发式。
[^06]: WebKit：[Full Third-Party Cookie Blocking and More](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/)，2020-03-24。七日策略与主屏幕 Web App 独立计数。
[^07]: MDN：[Storage quotas and eviction criteria](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)。同源配额、回收、隐私模式与错误。
[^08]: MDN：[StorageManager.persist()](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist)。授权返回值、安全上下文与显式删除边界。
[^09]: MDN：[IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)。结构化数据、事务、异步与同源策略。
[^10]: MDN：[Cache](https://developer.mozilla.org/en-US/docs/Web/API/Cache)。显式维护、HTTP 缓存头与存储生命周期。
[^11]: Capacitor：[Introduction](https://capacitorjs.com/docs)。Web-first 原生运行时、平台与现有 Web 项目集成。
[^12]: Ionic：[Introduction](https://ionicframework.com/docs)。Web Components UI、框架集成与 Capacitor 的职责。
[^13]: Capacitor：[Progressive Web Apps](https://capacitorjs.com/docs/web/progressive-web-apps)。manifest/service worker、Web 与原生实现。
[^14]: Capacitor：[Development Workflow](https://capacitorjs.com/docs/basics/workflow)。构建 Web 资源、同步、原生工程与发布。
[^15]: Capacitor：[Plugins](https://capacitorjs.com/docs/plugins)。插件桥接与自定义原生实现。
[^16]: Capacitor：[Storage](https://capacitorjs.com/docs/guides/storage)。WebView 数据保留风险、Preferences 与 SQLite 选择。
[^17]: Capacitor：[Filesystem](https://capacitorjs.com/docs/apis/filesystem)。原生文件读写、base64/Blob 平台差异。
[^18]: Capacitor：[Local Notifications](https://capacitorjs.com/docs/apis/local-notifications)。本地调度、权限与 Android 精确闹钟约束。
[^19]: Expo：[Develop websites with Expo](https://docs.expo.dev/workflow/web/)。React Native Web、DOM 与 Web 导出。
[^20]: Expo：[Progressive web apps](https://docs.expo.dev/guides/progressive-web-apps/)。PWA 配置、Workbox 和离线更新提醒。
[^21]: React Native：[Platform-Specific Code](https://reactnative.dev/docs/platform-specific-code)。Platform 与按平台拆分文件。
[^22]: React Native：[JavaScript Environment](https://reactnative.dev/docs/javascript-environment)。运行时与所提供的 API/polyfill。
[^23]: Expo：[Localization](https://docs.expo.dev/guides/localization/)。语言检测、翻译库、平台配置与 RTL。
[^24]: Expo：[FileSystem](https://docs.expo.dev/versions/latest/sdk/filesystem/)。原生文件与字节读写。
[^25]: Expo：[Notifications](https://docs.expo.dev/versions/latest/sdk/notifications/)。原生本地通知与平台权限。
[^26]: Flutter：[Supported deployment platforms](https://docs.flutter.dev/reference/supported-platforms)。Android/iOS/Web 的支持与测试矩阵。
[^27]: Flutter：[Web FAQ](https://docs.flutter.dev/platform-integration/web/faq)。当前 service worker 政策、Web 用途、dart:io 与插件限制。
[^28]: Flutter：[Build and release a web app](https://docs.flutter.dev/deployment/web)。自定义预缓存清单与渲染器资源自托管。
[^29]: Flutter：[Developing packages & plugins](https://docs.flutter.dev/packages-and-plugins/developing-packages)。逐平台实现、声明与 federated plugins。
[^30]: Flutter：[Internationalizing Flutter apps](https://docs.flutter.dev/ui/accessibility-and-internationalization/internationalization)。ARB、gen-l10n、intl 与中文 locale。
[^31]: i18next：[Getting started](https://www.i18next.com/overview/getting-started)。本地资源、插值、复数与框架集成。
[^32]: react-i18next：[Introduction](https://react.i18next.com/)。维护者说明 React/React Native 支持。
[^33]: WHATWG：[Compression Living Standard](https://compression.spec.whatwg.org/)。Streams 编解码接口及 RFC 1950/1951/1952 格式区别。
[^34]: MDN：[CompressionStream() constructor](https://developer.mozilla.org/en-US/docs/Web/API/CompressionStream/CompressionStream)。格式枚举与不支持格式的 TypeError。
[^35]: JSZip 维护者：[generateAsync options](https://stuk.github.io/jszip/documentation/api_jszip/generate_async.html)。ZIP、DEFLATE/STORE、Blob 与 UTF-8 文件名。
[^36]: JSZip 维护者：[Limitations](https://stuk.github.io/jszip/documentation/limitations.html)。内存、流式处理、编码与格式限制。
[^38]: MDN：[Using files from web applications](https://developer.mozilla.org/en-US/docs/Web/API/File_API/Using_files_from_web_applications)。用户选文件、File 与 object URL。
[^39]: MDN：[The Anchor element](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/a)。download 属性与实际浏览器行为差异。
[^40]: MDN：[Web Share API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Share_API)。文件分享、用户激活与能力检测。
[^41]: IETF：[RFC 4180](https://www.rfc-editor.org/rfc/rfc4180)。CSV 文本格式与 text/csv，状态为 Informational。
[^42]: Dart archive 维护者：[archive package](https://pub.dev/packages/archive)。ZIP 与 Web/原生库入口分离；第三方依赖。
[^43]: Dart archive 维护者：[ZipEncoder](https://pub.dev/documentation/archive/latest/archive/ZipEncoder-class.html)。内存字节输出与 DEFLATE 支持。
[^44]: MDN：[Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API)。服务器推送、service worker 与订阅。
[^45]: Capacitor：[Configuration](https://capacitorjs.com/docs/config)。server.hostname、iosScheme、androidScheme 的默认值。
