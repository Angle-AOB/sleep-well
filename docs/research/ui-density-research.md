# 移动端界面事实（按钮宽度、返回图标、浅色表面、删文案边界）：基于一手权威来源的证据评估

**一句话结论（TL;DR）：** 这四组问题里真正能当硬约束的只有"触控命中区尺寸""正文对比度"和"可访问名/可见标签"三条；其余大多是**具体平台、具体组件里的惯例，而不是跨平台通则**——**全宽主按钮**只在 watchOS 的主操作按钮与全屏对话框底部动作条这类语境被明确推荐，M3 与 iOS/iPadOS 对对话框动作区的惯例是"尾对齐（LTR 右对齐）+ fit-content + 标签不换行不截断"；**返回**在平台规范里的不变量是"标准线性返回符号 + 放在 leading edge + 不写 Back/Close 文字"，但既有可见文字时 `aria-label` 必须包含该文字、同页多个返回必须在名称上可区分；**近白表面 + 边框**可以替代深色填充，但边界要么达到 ≥3:1、要么内容本身已能识别控件，且必须能在 `prefers-contrast: more` 与 `forced-colors` 下退化成"真实边框 + 结构语义"，因为此时色调差和阴影都会被系统抹掉；**删可见说明文字**通常不直接违反某一条 SC，但只要这段文字是字段标签、操作说明或错误解释，就不应删除，而应以"始终可见的标签 + 标题/分组结构 + 持久支持文本"替代——`aria-label` 只服务辅助技术，不能替代面向所有人的可见说明（3.3.2 会因此失败）。

---

## 证据分级说明

本报告不使用自造的"星级"，而是按**规范效力**与**来源类型**给出统一标签。读者应先看"证据强度"再看结论——同一个词（"必须"）在 WCAG 推荐标准 [1] 与平台设计规范里的约束力完全不同。

| 标签 | 含义 | 本报告中的对应来源 |
|---|---|---|
| **强** | W3C 规范性标准条文（WCAG 2.2 SC 及其 Understanding 的规范性解释），或平台设计规范中明确的"必须/应该"规则，且文字可直接引用 | WCAG SC 条文、W3C Understanding 页面、HIG/M3 的显式规则 |
| **中** | 平台设计规范中的建议/解释性文字（非强制），或 W3C 非规范文档（COGA、Mobile Mapping、WAI 教程、APG 实践） | HIG/M3 指南段、W3C Note、WAI 教程、APG |
| **弱** | 从规范示例、组件 anatomy、测量表或适用范围间接推导，无直接条文 | 例如从 M3 对话框测量表推导按钮间距 |
| **无/反面** | 规范明确不适用，或与流行说法相反 | 2.5.3 在"无可见文字标签"时不适用；1.4.11 不要求控件必须有可见边框 |
| **未证实** | 在限定的一手来源中找不到支持，只能回答"没有依据" | "箭头 + 竖线"作为返回图标的规范性、移动 Web"全宽主按钮"的普遍性、按钮视觉最小宽度 |

三条阅读约定：

1. **平台规范 ≠ 无障碍合规标准。** HIG / Material Design 3 是平台的设计规范，WCAG 是 W3C 推荐标准；平台的"必须"不产生法律或合规义务，WCAG 2.2 AA 才是本项目需要对标的层级。本报告把两者并列，只是为了回答"惯例是什么"。
2. **单位不可互换。** WCAG 用 CSS px，M3 用 dp，HIG 用 pt。HIG 的 44×44 pt 与 WCAG 的 44×44 CSS px 数值相同但语境不同；Android dp 与 CSS px 的换算依赖 viewport 与 DPR。W3C 移动映射用 9 mm（≈34 CSS px @96 dpi）这一物理单位，是第三套参照。本报告只在"量级"层面并列 44/48，不主张精确等价。
3. **只回答事实与惯例。** 本报告不评价 sleep-well 的具体界面，也不给"应该改成什么样"的设计方案；如需做界面审计，应以本报告的检查点为输入另开任务。

---

## 1. 主操作按钮的宽度与对齐

**结论。** 一手来源中没有"移动端主操作按钮应全宽"的通用规范。全宽只出现在三类具体语境：(a) watchOS 的主操作按钮布局；(b) 全屏对话框的底部动作条；(c) 导航栏这类容器本身满宽。iOS/iPadOS 与 M3 对对话框/提示动作区的惯例是**尾对齐 + fit-content**；对非全宽按钮，规范真正硬性约束的是"标签不换行不截断、命中区够大、同一行按钮数量受限"，而不是视觉宽度数值。

### 1.1 "全宽"在规范里出现的具体位置

- **watchOS 的按钮**："Prefer buttons that span the width of the screen for primary actions in your app. Full-width buttons look better and are easier for people to tap." [22]
- **watchOS 的布局**："Although it's usually better to let text buttons span the full width of the screen, two side-by-side buttons with short text labels can also work well, as long as the screen doesn't scroll." [29]
  - 注意：这两条都在 HIG 的 watchOS 段落（同段上下文是手腕翻转、autorotation 等手表行为），**不能直接外推到 iOS 或移动 Web**。这是本主题最常见的误引。
- **M3 全屏对话框**：底部动作条高度 56dp、宽度等于容器宽度；顶部/左/右 padding 24dp，元素之间 padding 8dp [32]。满宽的是动作条，动作条里的按钮仍是 text button。
- **M3 导航栏**："The navigation bar container spans 100% of the window width." [39] 这是容器满宽，不是主按钮满宽。
- **M3 按钮页**只在外观示例的替代文本里出现过 "Filled button as wide as layout grid" [31]，正文并未把"全宽"写成规则。→ **弱**。

### 1.2 非全宽主按钮的宽度与对齐惯例

- **对话框动作区（M3）**："Buttons are aligned to the trailing edge of the dialog for easier interaction. The confirmation button is always closest to the edge." [32]；text button 的规则是 "Align text buttons to the trailing edge of dialogs, on the right for left-to-right languages and on the left for right-to-left languages." [31]；RTL 下自动镜像 [32]。
- **对话框间距（M3）**：padding between buttons 8dp，body 与 actions 之间 24dp；标准对话框容器宽度 280–560dp、圆角 28dp [32]。
- **提示/告警（HIG）**："Always place the default button on the trailing side of a row or at the top of a stack. Cancel buttons are typically on the leading side of a row or at the bottom of a stack." [24]；最多 3 个按钮；破坏性操作必须包含 Cancel [24]。
- **Sheet（HIG）**：Cancel 在顶部工具栏 leading edge，Done 在 trailing edge；不要同时出现 Cancel / Done / Back [26]。
- **Action sheet（HIG）**：Cancel 在底部（watchOS 为左上），按钮数量有上限 [25]。
- **按钮自身（M3）**："To avoid creating very long buttons in large windows, constrain button width or place buttons beside other elements." [31]；"The icon and label text in a button stay centered and grouped as the button's width changes." [31]；"Don't truncate or wrap label text. It should always be fully visible on a single line." [31]；200% 文本时标签最多两行，超出则要"provide an alternative way to access the full content in a single tap" [31]。
- **一行几个按钮（HIG，watchOS）**：一行最多两个文字按钮或三个图标按钮 [29]。
- **按钮组（M3）**：button group 是"不可见容器"，只负责调整按钮之间的 padding 与形状，本身没有颜色属性 [41]。

**小结：** "右对齐 fit-content"在 LTR 下确实是被平台规范描述的惯例，但**只针对对话框/提示的动作区**。页面主体里的主按钮，规范只给"避免过长、不要截断、保持顺序一致"等约束，没有统一的右对齐或全宽规则 [31][32]。

### 1.3 真正硬性的是命中区，不是视觉宽度

- **WCAG 2.5.8 Target Size (Minimum)，AA**：pointer 输入目标至少 24×24 CSS px，例外为 Spacing / Equivalent / Inline / User Agent Control / Essential [2]。Spacing 例外：未达标目标周围若能让"以每个目标为圆心的 24 CSS px 圆"彼此不相交，即视为满足；24×24 必须是目标内的实心正方形，与缩放无关 [2]。WG 明确 24 是为统一所有 pointer 输入而选的阈值，并**鼓励重要控件做到 2.5.5 的 44×44** [2]。
- **WCAG 2.5.5 Target Size (Enhanced)，AAA**：至少 44×44 CSS px，例外为 Equivalent / Inline / User Agent Control / Essential [3]。
- **M3**：每个 icon button 的目标尺寸至少 48dp，"even when nested" [33]；extra-small / small icon button 必须做到 48×48dp 或更大 [33]；不要默认对 icon button 施加 density，否则会低于要求的 48×48 CSS px 最小值 [33]；24dp 图标默认配 48dp 目标，20dp 图标可配 40dp 目标 [37]。
- **HIG**："a button needs a hit region of at least 44x44 pt — in visionOS, 60x60 pt" [22]；HIG 无障碍表给出 iOS/iPadOS 控件默认 44×44 pt、最小 28×28 pt（macOS 默认 28×28、最小 20×20）[28]。
- **移动端最佳实践（W3C 移动映射）**："Ensuring that touch targets are at least 9 mm high by 9 mm wide"，接近下限的目标周围要留少量非活动空间，且该尺寸与屏幕/设备/分辨率无关 [12]。

**注意：没有一手来源规定"按钮视觉最小宽度"。** 能引用的只有命中区/触控目标尺寸（24 / 44 / 48 / 9 mm），不是按钮自身的可见宽度。→ **未证实**。

### 1.4 证据强度与容易踩的边界

- **强**：24/44/48 的命中区要求；"标签单行不截断"；"对话框动作尾对齐、确认按钮最靠边"；"全宽只出现在 watchOS 与全屏动作条这类具体位置"。这些都是规范文本可直接引用的。
- **未证实 / 弱**："移动 Web 主流做法是全宽主按钮"；"页面主按钮右对齐 fit-content 是通行规范"。限定的一手来源里找不到。
- **边界**：(a) watchOS 的全宽建议被大量二手文章误当成 iOS/通用移动建议，本报告核对为 watchOS 段落 [22][29]；(b) M3 的 280–560dp 是**对话框容器**宽度，不是按钮宽度 [32]；(c) 8dp 是**按钮之间**的 padding，不是按钮内部 padding [32]。

---

## 2. 返回导航的图标惯例

**结论。** 平台规范里的不变量是"用标准线性返回符号、放在 leading edge、不要写'返回/Back'文字"，但**箭头具体形状（直箭头 vs chevron）各平台各规定一套，没有跨平台统一答案**；图标按钮必须提供可访问名，同页多个返回必须在名称上可区分（2.4.6 + APG 的可区分性要求）；命中区按 24（AA 下限）/44/48 处理，作为主导航的返回建议至少 44×44。至于 Web 上的"箭头 + 竖线"，在限定的一手来源中没有找到作为"返回"的规范性依据。

### 2.1 图标形态与位置

- **HIG**："Use the standard Back and Close buttons. People know that the standard Back button lets them retrace their steps through a hierarchy of information, and the standard Close button closes a modal view. Prefer the standard symbols for each, and don't use a text label that says Back or Close. If you create a custom version of either, make sure it still looks the same, behaves as people expect…" [23]
- **位置（HIG toolbar）**：leading edge 放"返回上一文档/上一级"的元素，随后才是视图标题；trailing edge 放 Done 这类主操作 [23]。
- **Back vs Close 语义（HIG sheets）**："The Back button lets people navigate to a previous step in a multi-step flow or to a parent view in a hierarchy. It isn't intended to dismiss a sheet." [26]
- **M3 app bar**：leading navigation icon 可以是菜单图标，也可以是 "A back arrow, which returns to the previous screen" [38]；"Make sure icon buttons have a container fill. Consider using narrow-width icon buttons for actions, like Back, to reduce the amount of space they take up." [38]
- **形态**：HIG 的"standard Back symbol"是 chevron 风格，M3 用的是直箭头 `arrow_back` 一类 [38]。**Web 上该用哪种，一手来源没有规定** → **未证实**。
- **"箭头 + 竖线"**（⇤ / arrow-to-bar 一类）：限定来源中没有把它规定为返回导航的规范形态 → **未证实**。它更接近"回到顶部/回到列表"的自定义图例，若采用必须自带可访问名与可见提示。

### 2.2 是否配可见文字

- HIG 明确：不要用写着 "Back" / "Close" 的文字标签替代标准符号 [23]。这条针对的是"用文字冒名顶替标准符号"，不是"图标按钮不许有名称"。
- 但**不写文字不等于没有名称**：图标按钮必须有 accessible label [14][21]；图标无文字时名称由 `aria-label` 提供 [20][14]。
- **2.5.3 Label in Name 的边界（AA）**："For user interface components with labels that include text or images of text, the name contains the text that is presented visually." 若组件**没有**可见文字标签，这条 SC 不适用（但仍需 4.1.2 名称）[4]。若选择"图标 + '返回'两字"，则 `aria-label` 必须包含"返回"这段可见文字 [4]；标点/大小写差异在朗读时可忽略 [4]。
- **APG 命名实践**：优先使用可见文本；若组件没有"visually persistent"的文字标签，"consider adjusting the design to include one"（建议而非强制）[15]。
- **结论**：可见文字不是必须；但"只有图标 + 没有可访问名"是明确错误 [14][21]。→ **强**（可访问名）；"是否显示文字标签"→ 平台惯例 [23]。

### 2.3 图标按钮的最小命中区

按 1.3 的数值处理：[2] 24×24 CSS px（AA 下限，含例外）、[3] 44×44（AAA）、[33] M3 的 48dp、[22][28] HIG 的 44×44 pt 默认（最小 28×28）、[12] 移动端 9 mm 最佳实践。

补充：M3 的 state layer 尺寸是 40dp，而交互目标尺寸是 48dp [36]——即**视觉圆形/背景可以小于命中区，但命中区不能小于规范值**。这在移动 Web 上很有用：图标看起来 24px 没问题，但按钮的点击盒必须撑到 44–48 CSS px。

### 2.4 `aria-label` 写法与常见错误

**推荐写法：**

- 动作 + 目标/上下文，简短（APG 说典型 1–3 个词）[15]；如 "返回"、"返回列表"、"关闭"。
- 若同时有可见文字，名称必须包含该文字（2.5.3）[4]；最佳实践是把可见文字放在名称开头 [4]。
- 不要用 `title` / `placeholder` 兜底——APG 明确浏览器兜底名称质量低 [15]，MDN 说明 placeholder 不能替代 label [18]。
- 图标按钮用原生 `<button>`，名称用 `aria-label` 或 `aria-labelledby` [14][21]；APG 按钮模式要求"按钮有 accessible label"，默认名称来自按钮内文字，图标按钮则由 `aria-label` / `aria-labelledby` 提供 [14]。

**常见错误（每条都能指回来源）：**

1. 只有图标、既无可见文字也无 `aria-label` → 违反 4.1.2 / APG 的"按钮必须有 accessible label" [14][21]。
2. 可见文字是"返回"，`aria-label` 写成 "Back" 或 "上一页" → 2.5.3 要求名称包含可见文字，语音输入用户会失败 [4]。
3. 用 `title` / `placeholder` 当名称 → APG 视为低质量兜底 [15]；MDN 明确 placeholder 不是 label [18]。
4. 同页三个按钮都叫"返回" → 没有一条 SC 直接禁止重名，但 2.4.6 要求标签/名称"describe topic or purpose" [9]，APG 要求名称能"distinguishes the element" [15]，COGA 要求标签让用户知道控件用途 [11]。→ 应写成 "返回上一步" / "返回列表" / "返回设置"。**证据强度：中**（由多条原则合成，而非单条 SC 明令）。
5. 图标按钮命中区 < 24×24 且不满足 spacing 例外 → 2.5.8 失败 [2]。
6. 用 `<div onclick>` 做返回 → 不是原生 button，键盘/AT 行为要自己补齐，且必须显式给 role 与名称 [14][21]。

### 2.5 平台惯例在 Web 上不适用之处

- iOS 的返回按钮常显示"上一级标题"（chevron + 文字），这是导航栏行为；HIG 的"不要写 Back 文字"只反对用文字标签替代标准符号，不能被读成"Web 上返回按钮必须无文字" [23]。
- M3 的 back arrow 语境是 top app bar 的 leading icon [38]；Web 页面没有 top app bar 语义时，返回更常见的是普通链接/按钮，2.5.3 与 4.1.2 的规则照旧 [4][14]。
- watchOS 的 full-width 与 M3 dialog 的 trailing alignment 不能互相搬运（见 1.4）。

---

## 3. 浅色表面作为分区

**结论。** 平台规范没有"近白表面 + 边框优于深色填充"这类通则：M3 用 surface / surface container 的层级表达层次，HIG 用 system / grouped 背景的 primary—secondary—tertiary 表达层次，二者都要求"边界或内容本身能让人分清"，而不是规定材质。可操作的硬约束是：浅底正文 4.5:1（大文本 3:1）、承载信息的边界与状态 3:1、不能只靠颜色表达信息；同时 `forced-colors` 会把作者色、边框色、阴影全部替换/抹掉，所以"近白卡 + 1px 浅灰边"这种设计必须准备好"真实边框 + 结构语义"的降级路径。

### 3.1 近白表面 + 边框 vs 深色填充

- **M3 的层次体系**：surface 角色用于背景与"大面积低强调区域"，另有五级 surface container（lowest / low / default / high / highest）"especially helpful for creating hierarchy and nested containers"；最常见的组合是"surface 作页面背景 + surface container 作导航区"；文本与图标统一使用 on surface / on surface variant [34]。
- **边框的语义**：M3 "Outline: Important boundaries, such as a text field outline"；"Outline variant: Decorative elements, such as dividers, and when other elements provide 4.5:1 contrast"；M3 还把"outline 色用于 divider / card"列为误用示例 [34]。→ 换言之，**浅灰 1px 分隔线在 M3 的语义里是装饰性的 outline variant，只有在"其他元素已提供 4.5:1 对比"时才成立**。
- **深色填充的语义**：M3 用 primary / secondary / tertiary container 作为"更高强调"的填充，属于语义强调而非纯分区手段 [34]。HIG 强调不要仅靠颜色区分对象或表达交互 [27][28]。
- **阴影与色调差（M3）**：M3 的 elevation 默认用"色调差"表达表面分离，阴影只在"需要额外保护背景"或"鼓励交互"时使用；对可交互组件，"edges must create sufficient contrast between surfaces" 才能被看成独立表面 [35]。→ 近白卡上 1px 浅边若只求"看起来有边"，恰恰属于 M3 说的"不够对比的边缘"。
- **结论**：两者不是规范层面的二选一。规范只要求 (a) 承载信息的边界有足够对比；(b) 分区不能只靠颜色；(c) 层次与语义一致。→ **强**（对约束）；"哪种更好"→ **未证实**（平台规范没有直接比较）。

### 3.2 浅色底上的正文对比度预算

- **正文 4.5:1**；大文本（≥18 pt，或 ≥14 pt 粗体；约 24 px / 18.66 px）3:1；**不四舍五入**，4.499:1 判失败；X、> 这类符号字符按非文本处理走 3:1 [5]。
- **UI 组件与其状态、图形对象 3:1**（1.4.11，AA）[6]。
- **HIG 的等效表**：≤17 pt 4.5:1、18 pt 3:1、所有粗体 3:1 [28]；若默认达不到，至少在系统"Increase Contrast"开启时提供更高对比配色 [28]。
- **M3**：颜色对本身保证可访问的最低 3:1 [34]；outlined text field 的 label 文本也按 3:1 检验（其示例 alt 明确"passes the minimum contrast of 3:1" / "fails"）[40]。
- **预算含义**：浅底（如 #FAFAFA）上放 14–16 px 灰色说明文字，很容易低于 4.5:1；"浅灰辅助文字"是这类界面的典型失败点。→ **强**（可直接测量）。
- **不能只靠颜色**：1.4.1 要求颜色不是传达信息/区分/状态/交互的唯一手段 [7]；HIG 同样要求用形状、图标、文字等附加线索 [27][28]；M3 必填项用星号并在支持文本中说明其含义 [40]。

### 3.3 hover / active 分层

- **M3 state layer**：半透明覆盖层，固定 opacity，用内容色（通常是 on 色）叠加；"The size of state layers is 40dp while the interactive target size is 48dp" [36]；hover 是 "lower-emphasis surface overlay" [36]。
- **text button** 默认没有可见容器，只在 hover / focus / pressed 时显示容器 [31]。
- **选中（activated）** 状态不是叠层：组件容器与内容颜色直接切换为 secondary container / on secondary container [36]。
- **WCAG 边界**：1.4.11 明确 hover 的附加视觉处理是 "supplemental"，不必达到 3:1 [6]；但 focus indicator 必须可见，并作为非文本内容受 1.4.11 约束（与相邻颜色 3:1）[10][6]。
- **含义**：hover/active 可以作为浅层反馈，但"是否可点/是否选中"不能只靠 hover 色差——hover 在触屏上不存在，且 1.4.11 不要求它达标 [6]。

### 3.4 `prefers-contrast: more` / `forced-colors` 下的表面与边框降级

- **`prefers-contrast: more`**：用户请求更高对比；MDN 示例把虚线边框改为 `outline: 2px solid black` [17]。含义：把"近白卡 + 浅灰边"强化为更深的实线边/更明显的表面反差，而不是新增布局。
- **`forced-colors: active`**（如 Windows 高对比度）：作者设置的 `color`、`background-color`、`border-color`、`outline-color`、`text-decoration-color`、SVG `fill`/`stroke` 等会在绘制时被系统色替换；`box-shadow`、`text-shadow` 变为 `none`；非 url 值的 `background-image` 变为 `none`；`color-scheme` 变为 `light dark`；系统色按原生元素语义选择，**用户代理不根据额外加的 ARIA role 选系统色** [16]。官方建议：不要为此模式另做一套设计，只做"small tweaks to improve usability or legibility" [16]。
- **由此得到四条降级规则**：
  1. 近白表面之间的"色调差"在高对比模式下会消失（背景被强制为 Canvas 类系统色），不能作为唯一分区线索 [16]。
  2. 阴影不再存在（`box-shadow → none`），"靠阴影分层"的设计会失效 [16]。
  3. 写成真实 `border` 的边界会由系统色接替显示；用伪元素或 box-shadow 模拟的边则没有这个保障 [16]。
  4. 结构兜底：标题层级、列表语义、分组标签、足够空白 [11][9]；COGA 明确"高对比边框"或"空白"都是清楚的分隔物，"背景色变化在对比足够强时"也可以 [11]。
- **证据强度：强**（W3C/MDN 条文层面）。

### 3.5 本节分级

- **强**：4.5/3 对比、1.4.1 非颜色线索、focus visible、forced-colors 的覆盖行为。
- **中**：M3 outline / outline variant 的语义分工、HIG 的层次背景建议、COGA 的分隔物清单。
- **未证实**："近白 + 边框一定优于深色填充"、"浅色表面让界面更轻"这类审美/可用性断言，在一手来源中没有量化证据。

---

## 4. 删除可见说明性文案的无障碍与认知负荷影响

**结论。** 删除"重复的、可由上下文推出的"说明文字通常不违反 WCAG；但删除**字段标签、操作说明、错误解释**会同时碰到 3.3.2（面向所有人的标签/说明）、2.4.6（标签描述目的）和 COGA 的认知负荷要求。判断标准不是"有没有 aria-label"，而是"**对不使用辅助技术的用户，这段信息是否仍然可见/可得**"。替代方式应是：始终可见的字段标签、标题/分组结构、持久的支持文本——而不是把说明塞进 `aria-label`。

### 4.1 什么情况下可以删

- **3.3.2 Labels or Instructions（AA）**：要求"labels or instructions are provided when content requires user input"；其 Intent 明确"Too much information or instruction can be just as harmful as too little"，目标是"enough information to accomplish the task without undue confusion or navigation"；标签/说明必须"persistently available"，可以是**始终可见**，也可以是**按需出现**（hover/focus、或一个按钮触发）[8]。
- **HIG alerts**："Avoid explaining alert buttons. If your alert text and button titles are clear, you don't need to explain what the buttons do." [24]
- **HIG action sheets**："Provide a message only if necessary… the title — combined with the context of the current action — provides enough information." [25]
- **M3 text fields**：支持文本"can be either persistently visible or visible only on focus" [40]。
- **可删的条件**：信息已由**始终可见的标签/标题/上下文**承载，或删除后仍能**按需**获得，且按需机制对所有输入方式可用（不只是 hover）[8][40]。

**不能删 / 不能只放 aria 的情形（反面证据）：**

- 3.3.2 明确："It is possible for controls and inputs to have an appropriate accessible name or description (for example, using aria-label="…") and therefore pass 4.1.2 Name, Role, Value, but to still fail this success criterion (because the labels or instructions are not presented to all users, but only to those using assistive technologies)." [8]
- COGA 要求标签"be visible and next to the relevant control"；并指出许多认知障碍用户使用的浏览器扩展与简单 TTS "often do not read WAI-ARIA or titles" [11]。
- MDN：placeholder "must not be used instead of a `<label>`"；它随输入消失、屏幕阅读器默认不朗读、且低对比度，对认知障碍用户更容易造成遗忘 [18]。

### 4.2 何时应以字段标签/结构替代

- **表单字段（M3）**："Label text tells people what information is requested. Every text field should have a label." "always visible"；可以放容器内，也可以放"a separate, adjacent label"（与容器 leading edge 对齐）；必填用星号并在支持文本中说明 [40]。
- **标签的可用性优势（WAI/MDN）**：`<label>` 显式/隐式关联后，点按标签即可聚焦控件——这扩大了命中区，对触屏用户同样有利 [13][19]。
- **placeholder 的定位**：不能替代 label [18]；MDN 明确其 "never as a replacement"；HIG 也提醒 placeholder 消失后应另给 label [30]；WAI 教程说 `aria-label` 只在"周围内容已清楚说明"时使用 [13]。
- **结构替代**：用标题、分组、区域标签表达分区与顺序 [11][9]；APG 把 "Prefer Visible Text" 列为命名实践第一条 [15]；2.4.6 要求标签描述目的 [9]。
- **错误/帮助**：错误信息应作为支持文本保留、并能被程序化关联（如 `aria-describedby`）[8][40]；只把红色边框当错误提示 = 1.4.1 + 3.3.2 风险 [7][8]。

**删/留判断表：**

| 内容类型 | 可否删除 | 替代方式（来源） |
|---|---|---|
| 与标题重复的说明 | 可删 | 保留视觉分组与标题 [11][9] |
| 字段用途标签 | 不可删 | 始终可见 label 或相邻 label [40][11] |
| 格式/范围提示 | 可缩短，不可全删 | 持久 supporting text 或按需说明 [8][40] |
| 错误原因/修复方法 | 不可删 | 错误文本 + 程序化关联 [8][40] |
| 后果/风险说明（如"删除后不可恢复"） | 不可删 | 保留可见文本；破坏性操作给 Cancel [24] |
| 桌面快捷键/操作提示 | 可折叠 | 按需帮助 [8] |

### 4.3 WCAG 2.2 中"可见标签 vs 可访问名"的边界

- **2.5.3 Label in Name（AA）**：有可见文字/文字图像标签时，可访问名必须包含可见文字；**无可见文字标签时 SC 不适用** [4]。最佳实践：可见文字放在名称开头；标点/大小写差异可忽略；符号字符（"B"、">"）不应被当作可见标签，名称应是功能；placeholder 不是合适标签，但"是唯一邻近文字"时可作为 Label in Name 的候选 [4]。
- **4.1.2 / APG**：任何控件都要有可访问名；图标按钮用 `aria-label` / `aria-labelledby` [14][20]；名称要简短、能区分元素 [15]。
- **3.3.2**：标签/说明是**面向所有用户**的要求，不能只靠 aria [8]。
- **2.4.6**：标签/名称要描述目的；名称"inaccurate or insufficiently clear or descriptive"会失败 [9]。
- **1.4.3**：删除文字后剩下的文字仍需 4.5:1 / 3:1 [5]。
- **1.4.1**：用颜色替代文字（红=错误、灰=禁用）时必须给非颜色线索 [7]。
- **2.4.7**：删除说明不应删掉焦点指示；键盘用户仍要看得见焦点 [10]，焦点指示受 1.4.11 约束 [6]。
- **1.4.11**：删掉控件边框后，如果没有任何可见内容能识别控件，边框就从"可选"变成"必需" [6]。

**一句话边界：** 可见文字管"所有人"（2.5.3 / 3.3.2 / 1.4.x），可访问名管"辅助技术"（4.1.2）；前者不能由后者替代，反之亦然。

### 4.4 认知负荷证据

- COGA 4.5.6 "Use Clear Visible Labels"：用户需求原话是 "I need clear labels, step-by-step instructions, and clear error messages"；标签缺失或不清时，用户"often do not know that the feature is available or what the control is"，也更难记住设计模式 [11]。
- COGA 6.8.2 Sam 场景："Every time he has to fill in an edit box, the instructions disappear the minute he begins to type and he cannot remember what is required." [11]
- COGA 4.5.6.4：许多认知障碍用户依赖浏览器扩展与简单 TTS，这些工具"often do not read WAI-ARIA or titles" [11]。
- 与平台"少解释"并不矛盾：HIG 的例外都建立在"标题 + 按钮文字已足够清楚"的前提上 [24][25]，而 3.3.2 的要求正是"足够且不过度" [8]。→ **中**（W3C 非规范 Note + 平台指南）。

---

## 5. 与常见说法的对照（哪些说法被高估）

1. **"移动端主按钮必须全宽。"** 全宽只在 watchOS 主操作、全屏对话框动作条、导航栏容器等具体语境出现；iOS/M3 的对话框动作区是尾对齐 fit-content [22][29][32][31]。→ **被高估**。
2. **"返回图标要用箭头 + 竖线，这是通用惯例。"** 限定的一手来源中没有这一规范性形态；平台只规定"标准返回符号 + leading edge + 不写 Back/Close 文字" [23][38]。→ **未证实**。
3. **"删掉说明文字没关系，加个 aria-label 就行。"** 3.3.2 明确可因此失败；COGA 明确部分用户不读 ARIA/title [8][11]。→ **错误**。
4. **"浅灰卡片 + 1px 浅灰边就足够分区。"** 高对比模式下背景/边框被系统色接管、阴影消失；必须准备真实边框与结构语义 [16]。→ **有风险**。
5. **"命中区 24×24 就够。"** 24 是 AA 最低值且有五类例外；重要控件应做到 44/48 [2][3][33][22]。→ **只满足最低线**。
6. **"HIG 说 44 pt，所以 Web 上 44 px 就等价。"** 单位不可互换；Web 端按 2.5.8 的 24 CSS px（AA）/ 2.5.5 的 44 CSS px（AAA）判断 [28][2][3]。→ **单位误用**。
7. **"对话框按钮要等宽/全宽才好看。"** M3 只规定尾对齐、不截断、最多两个动作与间距；HIG 只规定默认按钮在 trailing / Cancel 在 leading，未要求等宽或全宽 [32][24]。→ **无依据**。

---

## 6. 证据冲突与未解问题

1. **HIG 的 28×28 pt"最小控件"与 WCAG 的 24×24 CSS px 不是同一维度。** 前者是平台控件的默认/最小视觉尺寸，后者是合规阈值且另有例外；28 pt 最小不等于"28 px 就能满足 2.5.8" [28][2]。
2. **3.3.2 允许"按需"说明，COGA 强调"可见且紧邻控件"。** 调和点是"关键说明始终可见、补充说明可按需"，但这条边界没有量化标准，只能按具体界面判断 [8][11]。
3. **HIG "不要解释告警按钮" vs COGA "清晰的可见标签"。** 两者都要求标题/按钮文字本身清楚；分歧只在"解释放在哪里"。没有一手研究量化"解释 vs 不解释"的可用性差异 [24][11]。
4. **forced-colors 下边框的最终呈现依赖浏览器/系统。** MDN 说明作者色被替换、系统色由原生语义决定（ARIA role 不决定系统色）[16]；跨浏览器一致性需要实测，本报告不给保证。
5. **"移动 Web 全宽主按钮更易点"没有一手 A/B 证据。** 只有 watchOS 的"look better and easier to tap"陈述 [22]，不能外推到 Web。
6. **返回图标用 chevron 还是直箭头，Web 上没有规范。** iOS/M3 各用各的 [23][38]；若产品要跨平台一致，需要自行写设计规则并做测试。

---

## 参考来源

1. W3C. *Web Content Accessibility Guidelines (WCAG) 2.2*. https://www.w3.org/TR/WCAG22/ （访问日期 2026-11-22）
2. W3C WAI. *Understanding Success Criterion 2.5.8: Target Size (Minimum)*. https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html （访问日期 2026-11-22）
3. W3C WAI. *Understanding Success Criterion 2.5.5: Target Size (Enhanced)*. https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html （访问日期 2026-11-22）
4. W3C WAI. *Understanding Success Criterion 2.5.3: Label in Name*. https://www.w3.org/WAI/WCAG22/Understanding/label-in-name.html （访问日期 2026-11-22）
5. W3C WAI. *Understanding Success Criterion 1.4.3: Contrast (Minimum)*. https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html （访问日期 2026-11-22）
6. W3C WAI. *Understanding Success Criterion 1.4.11: Non-text Contrast*. https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html （访问日期 2026-11-22）
7. W3C WAI. *Understanding Success Criterion 1.4.1: Use of Color*. https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html （访问日期 2026-11-22）
8. W3C WAI. *Understanding Success Criterion 3.3.2: Labels or Instructions*. https://www.w3.org/WAI/WCAG22/Understanding/labels-or-instructions.html （访问日期 2026-11-22）
9. W3C WAI. *Understanding Success Criterion 2.4.6: Headings and Labels*. https://www.w3.org/WAI/WCAG22/Understanding/headings-and-labels.html （访问日期 2026-11-22）
10. W3C WAI. *Understanding Success Criterion 2.4.7: Focus Visible*. https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html （访问日期 2026-11-22）
11. W3C. *Making Content Usable for People with Cognitive and Learning Disabilities* (W3C Note). https://www.w3.org/TR/coga-usable/ （访问日期 2026-11-22）
12. W3C. *Mobile Accessibility: How WCAG 2.0 and Other W3C/WAI Guidelines Apply to Mobile*. https://www.w3.org/TR/mobile-accessibility-mapping/ （访问日期 2026-11-22）
13. W3C WAI. *Forms Tutorial: Labeling Controls*. https://www.w3.org/WAI/tutorials/forms/labels/ （访问日期 2026-11-22）
14. W3C WAI-ARIA Authoring Practices Guide. *Button Pattern*. https://www.w3.org/WAI/ARIA/apg/patterns/button/ （访问日期 2026-11-22）
15. W3C WAI-ARIA Authoring Practices Guide. *Providing Accessible Names and Descriptions*. https://www.w3.org/WAI/ARIA/apg/practices/names-and-descriptions/ （访问日期 2026-11-22）
16. MDN Web Docs. *@media forced-colors*. https://developer.mozilla.org/en-US/docs/Web/CSS/@media/forced-colors （访问日期 2026-11-22）
17. MDN Web Docs. *@media prefers-contrast*. https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-contrast （访问日期 2026-11-22）
18. MDN Web Docs. *HTML attribute: placeholder*. https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/placeholder （访问日期 2026-11-22）
19. MDN Web Docs. *<label>: The Label element*. https://developer.mozilla.org/en-US/docs/Web/HTML/Element/label （访问日期 2026-11-22）
20. MDN Web Docs. *aria-label*. https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Attributes/aria-label （访问日期 2026-11-22）
21. MDN Web Docs. *ARIA: button role*. https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Roles/button_role （访问日期 2026-11-22）
22. Apple. *Human Interface Guidelines: Buttons*. https://developer.apple.com/design/human-interface-guidelines/buttons （访问日期 2026-11-22）
23. Apple. *Human Interface Guidelines: Toolbars*. https://developer.apple.com/design/human-interface-guidelines/toolbars （访问日期 2026-11-22）
24. Apple. *Human Interface Guidelines: Alerts*. https://developer.apple.com/design/human-interface-guidelines/alerts （访问日期 2026-11-22）
25. Apple. *Human Interface Guidelines: Action sheets*. https://developer.apple.com/design/human-interface-guidelines/action-sheets （访问日期 2026-11-22）
26. Apple. *Human Interface Guidelines: Sheets*. https://developer.apple.com/design/human-interface-guidelines/sheets （访问日期 2026-11-22）
27. Apple. *Human Interface Guidelines: Color*. https://developer.apple.com/design/human-interface-guidelines/color （访问日期 2026-11-22）
28. Apple. *Human Interface Guidelines: Accessibility*. https://developer.apple.com/design/human-interface-guidelines/accessibility （访问日期 2026-11-22）
29. Apple. *Human Interface Guidelines: Layout*. https://developer.apple.com/design/human-interface-guidelines/layout （访问日期 2026-11-22）
30. Apple. *Human Interface Guidelines: Text fields*. https://developer.apple.com/design/human-interface-guidelines/text-fields （访问日期 2026-11-22）
31. Material Design 3. *Buttons*. https://m3.material.io/components/buttons/overview （访问日期 2026-11-22）
32. Material Design 3. *Dialogs*. https://m3.material.io/components/dialogs/overview （访问日期 2026-11-22）
33. Material Design 3. *Icon buttons*. https://m3.material.io/components/icon-buttons/overview （访问日期 2026-11-22）
34. Material Design 3. *Color roles*. https://m3.material.io/styles/color/roles （访问日期 2026-11-22）
35. Material Design 3. *Elevation*. https://m3.material.io/styles/elevation/overview （访问日期 2026-11-22）
36. Material Design 3. *States*. https://m3.material.io/foundations/interaction/states/overview （访问日期 2026-11-22）
37. Material Design 3. *Icons*. https://m3.material.io/styles/icons/overview （访问日期 2026-11-22）
38. Material Design 3. *App bars*. https://m3.material.io/components/app-bars/overview （访问日期 2026-11-22）
39. Material Design 3. *Navigation bar*. https://m3.material.io/components/navigation-bar/overview （访问日期 2026-11-22）
40. Material Design 3. *Text fields*. https://m3.material.io/components/text-fields/overview （访问日期 2026-11-22）
41. Material Design 3. *Button groups*. https://m3.material.io/components/button-groups/overview （访问日期 2026-11-22）

---

### 使用说明与局限

- 本报告是**规范与官方文档的事实核查**，不是可用性实验：不含用户测试、A/B、眼动或点击热图数据。凡涉及"更方便/更好看"的断言，若一手来源没有数据，本报告只标注"平台规范如此陈述"或"未证实"。
- 一手来源限定为：WCAG 2.2 与 W3C/WAI 文档、MDN、Apple HIG、Material Design 3。不引用二手博客、设计系统社区文章或 UI 库文档。
- HIG / M3 是**平台设计规范**，不是法律意义上的无障碍标准；WCAG 2.2 AA 才是本项目需要满足的层级。HIG 的 pt 与 CSS px、M3 的 dp 与 CSS px 不能精确互换。
- Material Design 3 官网是 Angular SPA，本报告通过其官方内容接口读取页面正文（引用时仍按公开页面 URL 标注）；页面结构变化可能导致个别条目位置移动，但引文内容与 2026-11-22 的版本一致。
- 本报告不针对 sleep-well 现有界面做具体审计；如需审计，应以本报告的检查点逐条对照，并补充真实设备/浏览器测试（尤其是 `forced-colors` 与文本放大 200% 场景）。
- 引用编号与正文一一对应；同一结论有多个来源时，优先引用规范效力最高者，平台惯例作为补充。
