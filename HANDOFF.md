# DSH界面美化（DSH UI Beautify）· 接力包（自足版）

> 仓库：`Rad-Weed/DSH-UI-Beautify`（私有）｜插件包名与运行时标识仍是 `dsh-ui-beautify` / `__DSHUI__`

> ## 📌 气泡这条线的完整经过（2026-10-13，务必先读；**结论 = v0.2.41 的"纯白层"**）
>
> 1. 用户报"长消息没有毛玻璃" → v0.2.37 修 `findUserBubbles()` 的 `rect.height > 400`
>    （长气泡被静默丢掉）；
> 2. 修完后反馈"**现在长信息也没有气泡了**" → 读取实机 diag 定案：
>    `alpha:0.3 / targets:5 / bubbleScan:{候选5,收4,高0}` —— 过滤修好了，
>    真问题是**糊过的气泡不像气泡**；
> 3. v0.2.38 试"气泡单独白层 62%" → 被**要求回退**（当时的反馈：气泡这个概念被理解错了），
>    工作区一度退回 `0.2.36`（`dist/…0.2.36.zip` = 那个状态）；
> 4. 用户给了真 DOM（`div.cJsG2q_bubble > span`）并确认"气泡"就是它 → 对照 DSH 自己的 CSS
>    从 `app.asar` 里挖出来（见 §6.x）→ **用户拍板"先试 B，不行换 A"** → v0.2.39 = 方案 B
>    （不换色，只把气泡自己的颜色调透明）；
> 5. v0.2.40 用户说"现在视觉效果不错"，要了三样：透明度 0~100%、取色器、气泡模糊滑块；
> 6. **v0.2.41（定案）**，反馈：需要在**气泡层下再加一层纯白层**，该纯白层
>    需要能从完全不透背景到完全透背景，现有的气泡透明滑块功能删除，并改为纯白层的透明度服务。
>    实现：气泡色层**固定保留 55%**（`BUBBLE_COLOR_RETENTION`），下面垫
>    `rgba(255,255,255, W)`（`W` = 「纯白层」滑块 0%~100%，100% = 背景完全不透/默认）。
>    两者合成一条 `color-mix(in srgb, <气泡色> 55%, rgba(255,255,255,W))`；
>    旧的 `bubbleMix` / `bubbleTransparency` 存档字段一律忽略（回落默认）。
>    ⚠️ **物理限制**（写进 §6.x）：壁纸层 `z-index:2147483000 + multiply` 压在气泡之上，
>    而气泡被 `.xz4KEq_scroll{container-type:inline-size}`（查询容器 = 叠层上下文）套住，
>    **z-index 抬不出去** —— 纯白层只能做在气泡自己的背景里，挡的是气泡背后的聊天内容；
>    壁纸的 multiply 纹理仍像其它表面一样均匀罩在气泡上。
>
> **若这版还不行** → 换成方案 A：把 `findUserBubbles()` 从 `collectFrostTargets()`（约 L790）
> 里摘掉即可（气泡完全不碰），一行改动，见 §11。
>
> **⚠️ 二次回退记录（2026-10-13 傍晚）**：用户实测 v0.2.41 说「没任何反应」→ **已回退到 0.2.40**。
> 根因（已想通，写进 §6.x）：气泡背后的聊天区底色是**近白的**，纯白层从 100% 拖到 0%，
> 合成的结果都是"浅蓝叠在白上" —— 两端只差几个百分点的明度，**肉眼不可辨**；
> 而真正"脏"的壁纸纹理是 multiply 压在气泡**之上**的，白层挡不到它。
> 用户同时问「把气泡搬成 body 级浮层的工作量级具体是指？」—— 工作量分解已写入 §11 的 P0★3。
>
> **工作区当前 = 0.6.3**（「背景」模式 0.3.x、「气泡搬 body 级浮层」0.5.0、
> 「聊天内代码块/文件卡片上玻璃」0.6.0 + 0.6.1 修内层遮盖、0.6.2 放宽纱/白层下限、
> 0.6.3 修「切对话后背景失效」、0.6.4 壁纸体检 + 链外盖子、0.6.5 抢修抢在渲染前、0.7.0 动效底座+帧探针+重载插件+WebP —— 各条见 §0 的版本条目）。历史包都在 `dist/`：
> `0.2.36`（回退基线）、`0.2.37`（长气泡过滤 + 遮罩/面板抬层级）、`0.2.38`（气泡白层 62%）、
> `0.2.39`（方案 B 原版）、`0.2.40`（三旋钮版）、`0.2.41`（纯白层版，已回退）；
> 之后的 `0.3.0`~`0.6.5` 逐版都在（每个都是可回滚的整包）。

> **这份文件是自足的。** 读完即可接手：项目的历史、需求记录、真实 DSH 的 DOM 事实、
> 已经做完和还没做的事、所有命令与绝对路径、不能碰的底线、以及重新打包的配方都在这里。
> **接手者不需要向需求方复述或确认任何历史**（需求方明确要求过：不必复述已完成事项）。
>
> 用户看的是 [README.md](README.md)（用户手册）；这一份是**给下一个 AI 的交接**。
> 记录时版本 **v0.8.19** ｜ 工作目录 `<工作目录>`

## 目录

| 节 | 内容 |
|---|---|
| [0](#0-30-秒速览) | 30 秒速览 |
| [1](#1-环境与命令全部已实测) | 环境、绝对路径、命令、改动生效规则 |
| [2](#2-需求与验收编年史) | 需求方画像 + 需求编年史 + 已否决设计 + 未完成项 + 待确认项 |
| [3](#3-能力矩阵现状与验证方法) | 每个功能的现状与验证方法 |
| [4](#4-铁律精确版) | 八条不可违反的规则（每条都有翻车史） |
| [5](#5-架构地图) | 文件、常量、API、路由、注入、存档键 |
| [6](#6-真实-dsh-的-dom-事实与勘察方法) | DSH DOM 事实 + 如何自己重新勘察 |
| [7](#7-分层与通透化的精确语义) | 分层/通透化的分支语义（最容易写错的地方） |
| [8](#8-参数默认值与-url-覆盖) | 参数、默认值、迁移、URL 覆盖 |
| [9](#9-诊断与验收手册) | 验收方式 + 诊断手段 |
| [10](#10-打包与发布实测配方) | 打包配方（已实测）、校验、版本纪律 |
| [11](#11-待办p0-是用户已经在等的东西) | P0/P1/P2/P3 待办（含动效结论与实测数字） |
| [12](#12-数值禁区与失败史速查) | 别重复试的数值与已排除方案 |
| [13](#13-一次成功的会话长什么样) | 工作流模板：该做什么、别做什么 |
| [14](#14-术语表) | 术语表 |
| [15](#15-一致性快照与接手自检) | 接手自检清单 |

---

## 0. 30 秒速览

**它是什么**：给 DSH 桌面端加 DS 娘壁纸的**零侵入**插件 —— 一张全屏背景图 + 一个可拖的小胶囊入口 +
一个悬浮面板。面板上只有三个按钮：`关闭` / `纹理` / `背景`（第三个按钮在 v0.3.0 由「待更新」换成「背景」），外加浓度滑块、图片切换、毛玻璃参数。

**它现在什么状态**：

- 版本 `0.8.12`（`lib/client.js` 的 `VERSION`、`lib/index.js` 的 `PLUGIN_VERSION`、`package.json` 的 `version` 三处一致）；
- 测试 **host 24/24 + client 93/93** 全绿（离线，不需要浏览器）；另：独立插件 `dsh-reload-ui` 6/6；
- **已装在用户机器上**（`lib/client.js` 走 `Cache-Control: no-store`，只要页面**真的重载**就能拿到新脚本；
  但 DSH 桌面版没有刷新快捷键 / 菜单（见 §11 P1），所以实际操作 = **退出 DSH 再启动**）。
- **v0.2.32 这一版做了两件事**（都是用户在 2026-10-13 那条消息里点的）：
  1. **修「通透化被首帧扑空锁死」**（0.2.31 的真 bug）：真实 DSH 的座位背景只在
     `[data-phase=active]` 才有，插件首帧去清遮罩会扑空（清了 0 层），而 0.2.31 把这次
     "0 层"记成了"已完成"（`state.frostBackup = {entries: []}` 被 `frostBackupAlive()`
     判成还活着）→ 座位后来上了底色也**永远不会再被清**，玻璃背后回到纯色，视觉上
     "跟没开一样"。现在把「认出来过那条链」(`frostChain`) 与「已经清了哪些层」
     (`frostBackup`) 分开记账，链认得出来就留着，之后任何一次重新应用都只重查那几层。
  2. **毛玻璃铺到更多表面**：DSH 自带**问答窗口**（`[data-question-key] > section[aria-labelledby]`）
     + **鲸鱼挂件 `dsh-whale-widget` 的各级面板**（`dshwv-*`，手写类名）。
     做法是插件给它们**加一个类**（不动那些插件的源码、不动布局），并带一条**自动安全闸**：
     **有 `position: fixed` 后代的面板一律不糊** —— `backdrop-filter` 会让元素成为 fixed
     后代的包含块，贴上去会让鲸鱼的小浮层（`.dshwv-slotlist` 那类）整体跑位。
- **v0.2.33（用户看完 v0.2.32 后的第一条反馈）**：二级面板跟主表面共用一套参数**不好看**，
  用户指定 **二级面板 = 模糊 20px / 白层 85%**。于是把扩展表面**拆成两类**：
  - **问答窗口**（`QUESTION_FROST_SELECTOR`）→ 继续挂 `__dshui-frost-surface`，
    跟主表面共用滑块参数；
  - **二级面板**（`EXTRA_FROST_SELECTOR` = 那 16 个 `dshwv-*`）→ 挂新类
    `__dshui-frost-panel`，走 `FROST_PANEL_BLUR = 20` / `FROST_PANEL_ALPHA = 0.85`
    （样式表里是静态兜底，`--dsniang-frost-panel-blur/-alpha` 可现场覆盖）。
  两类各清各自的过期标记；`clearFrostSurface()` 两类都摘。
  诊断里能看到 `二级面板 N 个（20px/85%）`，状态里是 `frost.panels` / `frost.panelBlur` / `frost.panelAlpha`。
- **v0.2.34（看完 v0.2.33 后的反馈："效果一般"）**，三件事：
  1. 二级面板白层 `0.85` → **`0.9`**（模糊仍是 20px）；
  2. 打开二级面板时鲸鱼挂件那层**全屏变暗遮罩**（8 个 `dshwv-*-mask`，原版实心
     `rgba(15,23,42,0.55)`）**减轻 + 加渐变** → 换成**径向渐变**
     `radial-gradient(ellipse at center, rgba(15,23,42,中心) 0%, rgba(15,23,42,边缘) 100%)`，
     `PANEL_MASK_CENTER = 0.16` / `PANEL_MASK_EDGE = 0.34`（中心浅、四周略深，像聚光灯）。
     规则带 `body.__dshui-frost` 前缀 + `!important`，只覆盖 `background`；
     变量 `--dsniang-panel-mask-center/-edge` 可现场覆盖。
  3. 新增诊断字段 `frost.panelMaskCenter` / `frost.panelMaskEdge`；
     诊断文案变为 `二级面板 N 个（20px/90% · 遮罩 16→34% 渐变）`。
  测试把白层 90%、遮罩两个渐变值、以及"每个 mask 类都带 body 开关前缀"都锁死了。
- **v0.2.35（2026-10-13 反馈：变暗有点变化，除此之外没有变化）**：
  **诊断结论 = 不是没生效，是参数落在"看不出来"的区间**。鲸鱼面板本来就不透明 ——
  `.dshwv-menu` 是 `rgba(255,255,255,.92)`、各种 `*-card / *-win` 直接是 `#fff`（100%）、
  角色/音效/取色下拉是 `.98` —— 所以平铺 85% / 90% 的白层跟原版**几乎一模一样**；
  而遮罩从实心 55% 改成 16→34% 渐变**是**看得出来的（用户也说"变暗有点变化"），
  这恰好反证新代码确实加载了、`__dshui-frost-panel` 也确实在生效。
  → 改法：白层改成**径向渐变**（内部 `FROST_PANEL_BOTTOM = 0.80` → 边缘 `FROST_PANEL_TOP = 0.94`；v0.8.2 从竖向改为径向）
  （中值 = 用户要的白层 90%）：顶部几乎实心（按钮/文字最清楚）、底部透出背后内容并被
  20px 糊开 → 才有玻璃层次。
  ⚠️ 实现要点：渐变必须用 **`background` 简写**，不能拆成 `background-color:transparent` +
  `background-image` 两个长属性 —— ① 简写才会把底色一并重置成透明，否则渐变会叠在实心底色上、
  合成后两端差不到 1.5%（**等于白做**）；② 静态表里不出现 `background-image` 字样
  （回归测试原本拿它当"图不许进样式表"的哨兵）。
  顺带把那两个哨兵从 `/background-image/` **收紧成 `/url\(/`**：渐变不是图、没有网络与合成层代价，
  哨兵真正要守的是"**全屏位图必须走内联样式**"。
  诊断文案：`二级面板 N 个（20px · 白层 97→83% 渐变 · 遮罩 16→34% 渐变）`；
  状态新增 `frost.panelAlphaTop` / `frost.panelAlphaBottom`。
- **v0.2.36（选择了「方向三：自己拖着调」）**：把二级面板白层的两个端点做成**面板上的滑块**
  —— `「面板白层上」/「面板白层下」`（范围 `PANEL_ALPHA_MIN = 0.3` ~ 1.00，步长 0.01），
  拖动即时改 `<body>` 的 `--dsniang-frost-panel-top/-bottom`（**样式表一个字不动**，铁律 2）、
  自动存档到既有的 `__dshui.frost.v3`（`state.frost.panelTop/panelBottom`）、
  刷新后由 `loadFrostSettings()` 读回（`panelAlphaOf()` 做范围校验，坏值/越界回落默认）。
  设计要点（下一个 AI 别踩）：
  · 滑块属性名 `data-panel-top-slider` / `data-panel-bottom-slider`，数值文案类名
    `__dshui-panel-top-value` / `-bottom-value`（测试与排障都靠这两个钩子）；
  · 新增字段必须同步更新 client 测试里那条 **deepEqual 存档断言**（它会严格比对象）；
  · 诊断/状态都改成读 `state.frost.panelTop/panelBottom`（不再是常量），文案形如
    `二级面板 N 个（20px · 白层 62→40% 渐变 · 遮罩 16→34% 渐变）`。
- **v0.2.37（2026-10-13 上午，用户「开工吧」后一次做完两件）**：
  1. **长消息气泡没玻璃** —— 根因：`findUserBubbles()` 的 `rect.height > 400` 绝对高度上限，
     把几千 px 高的长气泡整个静默丢掉（短气泡没事，所以表现为"长有短没有/长效果没生效"）。
     现在换成：**结构判据**（装得下另一个 `bubble`、或装得下 > 2 条 `[data-chat-flow-kind]`
     消息行 → 是容器不是气泡）+ 尺寸只做离谱兜底（高 > 20×视口、宽 > 80% 视口）；
     并新增 `state.bubbleScan`（候选/收下/因宽·高·容器·输入·非我各跳过多少）——
     诊断面板多一行 `气泡扫描: 候选 N · 收 M（宽 … · 高 … · 容器 … · 非我 …）`，
     这类"静默丢气泡"的 bug 以后一眼可见。
  2. **二级窗口层级**（用户要「背景图 → 文字UI → 变暗 → 二级窗口」）：
     壁纸层是 `z-index:2147483000 + multiply`，却压在鲸鱼遮罩（2 万）与面板（2.6 万）之上，
     导致 ①面板的 backdrop-filter 糊的不是壁纸 ②遮罩渐变被 multiply 压掉。
     现在给遮罩 `z-index:2147483005!important`、面板 `2147483010!important`（**只动 z-index**），
     于是绘制顺序变成壁纸/UI → 变暗 → 二级窗口，面板玻璃糊的就是"壁纸+UI+遮罩"。
     ⚠️ 主表面（输入卡片/用户气泡）**故意没有抬 z-index**（它们要留在壁纸下面吃 multiply），
     有测试锁住这条。
- **v0.2.38（2026-10-13 中午，用户「？现在长信息也没有气泡了」）**：
  **诊断靠读实机 diag 数据定案**（`/dsh-ui-beautify/diag.json` 的 `frost`）：
  `blur:7 / alpha:0.3 / targets:5 / bubbleScan:{候选5,收4,高0}` —— 说明 v0.2.37 的过滤修好了
  （气泡全被糊上、没有因高度丢的），**真问题是"糊上之后气泡不像气泡"**：
  气泡原本那块**不透明的浅蓝底**被换成"半透明白玻璃"，白层只有 30% 时**形状直接消失**，
  有效反馈是"没有气泡了"；此前觉得"长消息还有气泡"，恰恰是因为旧版 400px 规则
  把长气泡漏掉、保留了 DSH 原底色。
  → 修法：**气泡单独一套白层** `BUBBLE_ALPHA_DEFAULT = 0.62`（`state.frost.bubbleAlpha`，
  0.30~1.00），面板上新增 **「气泡白层」滑块**（`data-bubble-alpha-slider` /
  `__dshui-bubble-alpha-value`），值走 CSS 变量 `--dsniang-frost-bubble-alpha`；
  选择器用 `[class*="bubble"].__dshui-frost-surface`（不需要额外打标，靠 DSH 自己的气泡类名），
  权重比主表面那条多一个属性 → 必然覆盖。
  诊断的毛玻璃行现在写成 `白层 30%（气泡 62%）`；`frost.bubbleAlpha` 进状态。
  **留给下一个 AI 的教训**：DSH 的用户气泡是**不透明浅蓝底**，糊它 = 换底 —— 白层参数
  同时决定了"玻璃感"和"还像不像气泡"，这两个目标是冲突的，所以要有独立默认值与滑块。
- **v0.2.39（2026-10-13 下午，用户拍板"先试 B，不行的话换 A"）**：**气泡不再换色，只调透明度**。
  · 静态 CSS 里气泡那条改成 `background-color:color-mix(in srgb,var(--dsniang-bubble-color,var(--dsw-specific-bubble,#e8f0fe)) var(--dsniang-frost-bubble-mix,55%),transparent)!important;`
  · 气泡**原色**由 `markBubbleColors()` 读 `getComputedStyle(el).backgroundColor` 写进**元素内联**
    变量 `--dsniang-bubble-color`（`rgbTripletOf()` 解析；深浅主题自动跟；卸载时
    `revertBubbleColors()` 按 `state.bubbleColorBackup` 逐字还原 —— 这是本项目第一次在
    气泡上写内联属性，测试里有"卸载不留痕"的断言）；
  · 百分比走 `<body>` 的 `--dsniang-frost-bubble-mix`，面板上 **「气泡浓度」滑块 10%~100%**
    （`data-bubble-mix-slider` / `__dshui-bubble-mix-value`，默认 55，`bubbleMixValue()` 校验）；
  · `color-mix` 100% 就是 DSH 原色 → **等于方案 A 的效果**，所以 B 不行时也可以先让用户把滑块拖到 100%
    再决定要不要真的切 A。
- **v0.2.40（2026-10-13 下午，看完 0.2.39 后的反馈："现在视觉效果不错"）**：给气泡把**三个旋钮**全开放：
  1. **「气泡透明度」滑块 0~100%**（0 = 不透明/DSH 原样，100 = 全透明，默认 45）；
     存 `state.frost.bubbleTransparency`，落到 CSS 的保留 % = `100 - T`。
     **旧档迁移**：v0.2.39 存的 `bubbleMix`（保留 %）读档时等价换算成透明度（视觉不变），有测试锁住；
  2. **「气泡颜色」取色器**（原生 `<input type="color">` + 十六进制回显 + 「原色」重置按钮）；
     自选色写进 `<body>` 的 `--dsniang-bubble-color`（元素内联自动色退场，`revertBubbleColors()`），
     「原色」恢复"跟随气泡自己的计算色"。取色器取消/非法值一律忽略（只有「原色」按钮才重置）；
  3. **「气泡模糊」滑块 0~30px**（默认 12px）：气泡规则里追加
     `backdrop-filter:blur(var(--dsniang-frost-bubble-blur,12px))`，与主表面那档独立。
  面板控件顺序：气泡透明度 → 气泡模糊 → 气泡颜色 → 面板白层上/下。
  诊断毛玻璃行现在写 `白层 25%（气泡 45%透·12px[·色#rrggbb]）`。
- **v0.2.41（2026-10-13 下午，用户定案「气泡层下加纯白层」）**：
  气泡色层**固定保留 55%**（`BUBBLE_COLOR_RETENTION`，不再有滑块），下面垫
  `rgba(255,255,255,W)`，合成一条 `color-mix(in srgb, <气泡色> 55%, rgba(255,255,255,var(--dsniang-frost-bubble-veil,1)))`。
  「纯白层」滑块（`data-bubble-veil-slider` / `__dshui-bubble-veil-value`）0%~100%：
  **100% = 背景完全不透（默认）/ 0% = 完全透**；`state.frost.bubbleVeil`（整数 %），
  写到 `<body>` 时除以 100（0~1）。取色器/模糊滑块照旧。
  旧存档字段 `bubbleMix` / `bubbleTransparency` **一律忽略**（用户要删除旧功能，不换算）。
  诊断毛玻璃行：`白层 30%（气泡 白底100%·12px[·色#xxx]）`。
  ⚠️ 气泡抬不到壁纸之上（`.xz4KEq_scroll{container-type:inline-size}` = 叠层上下文，
  z-index 出不去），所以纯白层挡的是"气泡背后的聊天内容"，壁纸 multiply 仍均匀罩着 —— 已写入 §6.x。
- **v0.3.0（2026-10-14，按用户验收后的 A1 范围实现）**：
  - **层序表收拢**：`LAYER_Z = { wallpaperOverlay:2147483000, wallpaperBase:-1, whaleMask:2147483005, whalePanel:2147483010, ownGui:2147483647 }` —— 所有 z-index 唯一真源，散落的魔法数字与 `PANEL_MASK_Z/PANEL_LAYER_Z` 旧常量已删除，行为零变化。
  - **「背景」模式（backdrop）**：`#__dshui-layer[data-mode="backdrop"]{z-index:-1;mix-blend-mode:normal}`（两层都有）；`MODE_OPACITY_DEFAULTS.backdrop = 0.35`（占位，待真机调）；`applyLayerBackground` 的图写入条件扩成 `multiply || backdrop`（**旧版只认 multiply 的坑已修，有护栏测试**）；`layerOpacityTarget` 用 `state.lastActiveMode`（关闭淡出沿用上一个模式的浓度）；`?dsniang=backdrop` URL 覆盖可用。
  - **面板第三按钮**「待更新」→「背景」（`MODE_BUTTONS` 只列 off/multiply/backdrop；`luminosity` 留在 `MODES` 里兼容旧档，API 层仍是"占位提示"）。
  - **通透化扩到 backdrop**：座位 36px 渐变擦除带在背景模式下也清（`applyMode` 直接调 `applyFrostBackdrop()` + 观察器/resize 兜底分支 `state.mode === 'backdrop'`），关模式/卸载逐字还原（复用同一套 `frostBackup` 两本账）。
  - **主题感知薄纱**：`VEIL_LIGHT=[255,255,255]` / `VEIL_DARK=[12,14,18]`，`backgroundImageValue()` 按 `isDarkTheme()` 取色；`watchTheme()` 监听 `body[data-ds-dark-theme]` 属性变化实时重写图层背景。`status().theme` 新增 light/dark。
  - **A5/A6 顺手项**：`tools/build-dist.ps1`（§10 配方脚本化）；宿主 diag 保留最近 6 份上报（`diag.json` 新增 `history[]`，客户端上报带 `win` 随机窗口标识，多窗口可区分）。
  - **待用户真机验收**：① 背景模式图是否真垫底、文字不染色；② 重命名窗/鲸鱼面板不被染色；③ 亮/暗主题可读性（薄纱浓度要现场调）；④ D1 旧结论（"v0.1 的 z=-1 被底色盖住"）真机验证后改写文档。
- **v0.3.1（2026-10-16，用户验收 0.3.0 的两条反馈）**：
  1. **「背景模式看不到图」→ 找到真凶并修掉**。需求：打开背景模式后胶囊变了，但没看到图片。
     从 `app.asar` 挖出：DSH 外壳 **`.BynINW_frame{background:var(--dsw-alias-bg-base)}`**（全屏、不透明，
     此前另一份实现漏了这层）把 `z-index:-1` 的图整块盖住；Windows 标题栏下 `.BynINW_centerCol`
     同样有底色。修法：`body.__dshui-backdrop` 类开关 + `!important` 把这两个底色覆盖成透明
     （`background-color:transparent; background-image:none`，摘类即逐字还原）；类在 `applyMode` 挂、
     `uninstall` 摘（淡出期间先留着，避免底色闪回）。**这同时给 D1 定性：旧结论
     "v0.1 的 z=-1 被应用不透明底色盖住"是对的，另一份实现的"不用掏空任何底色"是漏了证据。**
     背景模式还新增 **「薄纱」滑块**（`data-scrim-slider`，0~0.9，`SCRIM_KEY='__dshui.scrim'` 持久化；
     暗色主题下浅字压白图不可读，必须能现场调）。
  2. **DSH 自己的二级菜单也要毛玻璃**（需求：小鲸鱼娘的二级菜单达标了，但 DSH 本身的却没有）。
     用**稳定语义钩子** `DSH_PANEL_SELECTOR = '[role="dialog"],[role="menu"]'`（DSH 类名是构建哈希，
     每版都变）走 `collectSafeSurfaces` 安全闸 + 打 `__dshui-frost-panel`（与鲸鱼面板同参数同抬升）；
     对话框的全屏变暗遮罩 **`.XPF3fq_mask`**（DropOverlay，z 1000）加入 `PANEL_MASK_SELECTOR`
     （渐变 + 抬到壁纸之上）。诊断新增 `frost.dshPanels` 与文案 `· DSH 面板 N 个`。
     注意：若某个 dialog 内部有 `position:fixed` 后代，安全闸会整个跳过它（和鲸鱼 audiowin 同理）。
  - **仍待用户真机验收**：① 背景模式现在是否真能看到图（浓度 0.35 起步，可拖「浓度」与「薄纱」）；
    ② DSH 重命名窗/菜单是否玻璃 + 不被壁纸染色；③ 暗色主题把薄纱拉高后是否可读。
- **v0.3.2（2026-10-16，需求：还是没有图；验收之后再上交，不要小步快爬）**：
  **不再猜层**——进入背景模式时把「消息区 → body」整条页链上**所有**画了不透明底色的层
  全清成透明（`applyBackdropScrim()`：`pageScrimChain()` 取链、复用 `clearFrostChain()`
  只动 background-color/image 两长属性、`state.backdropBackup` 账本逐字还原；
  挂载在 `applyMode`、卸载在 `uninstall`、兜底在观察器/resize）。0.3.1 只覆盖了
  `.BynINW_frame`/`BynINW_centerCol` 两个选择器，真机仍有别的层（或选择器锚点不对）
  —— 这次是"清到链上一个不透明层都不剩"的构造性修法。
  **自诊断**：`diag.json` 的 `backdrop` 块上报 `active/cleared/chain[]（每层 tag+cls+painted+bg）/
  titlebarOn（data-windows-titlebar 挂在 html 还是 body）`；诊断文案 `背景透明: 已清 N 层（页链 M 层）`。
  **默认浓度 0.35 → 0.5**（图一眼可见）。另补了 `BynINW_frame::before`（Windows 标题栏 40px 条）
  的压透明规则（html/body 两种锚都写）。
  **自验收流程（既定：验收后再提交）**：重启一次 → 直接读 `diag.json` 的
  `backdrop.chain[]`：若每层 `painted=false`、`cleared=N>0`、`mode=backdrop`、图层 `zIndex=-1`，
  则"没有一层能盖住壁纸"成立（构造性可见）；不再让用户来回试。
- **v0.3.3（2026-10-16，需求：依旧不行+ 贴了重命名窗的 HTML）**：
  从 asar 挖出 DSH 模态框真实结构（模块 `o6lrb`）：
  `._root_o6lrb_6{position:fixed;inset:0;z-index:1000}`（body 级容器）
  ├ `._mask_o6lrb_18{position:absolute;backdrop-filter:var(--dsw-mask-blur)}` —— **只有模糊、没有变暗色**
  └ `._dialog_o6lrb_33[role=dialog]{position:relative;z-index:1;background:--dsw-alias-bg-layer-2}`
  之前失败的两个原因：① dialog 是 `relative+z:1`，**z-index 出不了 root 的叠层上下文** →
  整个模态仍被壁纸染色；② DSH 的 mask 只有 blur 没有变暗 → 玻璃背后是亮底，97→83% 白层看不出来。
  修法（一条静态规则）：`body.__dshui-frost :has(> [role="dialog"]){z-index:2147483005!important;
  background:radial-gradient(…16%→34%…)!important}` —— 用 `:has()` 命中"装有 dialog 的容器"
  （类名是构建哈希，这个结构关系稳定；DSH 自己的 CSS 也在用 `:has()`，内核支持），
  把整个容器抬到壁纸之上并垫上同款径向渐变。**教训：DSH 模态的 mask 是无色模糊，
  与鲸鱼的实心变暗遮罩不同 —— 变暗必须由我们补。**
- **v0.4.0（2026-10-16，用户两条验收后反馈 + 「先清文档债、自行测试完再交付」）**：
  1. **背景模式加入毛玻璃**（需求：背景模式可以看到图了，但是还没加入毛玻璃效果比较难看）：
     `setFrost(mode === 'multiply' || mode === 'backdrop')`、`frostActive()` 把 backdrop 算进
     "毛玻璃生效"、切换器的图片/浓度/毛玻璃整套控件在两种模式都显示；
     **顺手修的连带 bug**：`refreshFrost()` 原来 `mode !== 'multiply'` 直接 return →
     背景模式下点毛玻璃开关会没反应；观察器的 `frostActive()` 分支现在也会在 backdrop 下
     补清页链底色（React 换节点时重来）。
  2. **DSH 二级面板独立模糊度**（需求：dsh本体的二级菜单已经正常了，但需要它的模糊度
     调整滑块独立出来）：新变量 `--dsniang-frost-dsh-blur`（默认 20px、上限 30）+ 更具体的
     静态规则 `body.__dshui-frost [role="dialog"].__dshui-frost-panel,…`（只覆盖模糊两个属性，
     白层渐变与 z-index 沿用面板规则）+ `state.frost.dshBlur`（存档键 `__dshui.frost.v3` 增字段，
     旧档回落 20）+ 面板滑块 `data-dsh-blur-slider`（「DSH 面板模糊」）+ 诊断文案
     `DSH 面板 N 个（模糊 Xpx）`。
  3. **文档债清掉**：§2.2 补 17~24 行编年史；§2.5 删过期行；§0「最该做的下一步」重写；
     §11 P0★2/P0★ 标记"已验收/已实机确认"；§11 P0★ 的"z=-1 不要轻易走"改写为已定案历史
     （D1 翻案：v0.1 翻车是因为没清应用底色，不是 -1 本身）；§11 P3 标记 build-dist.ps1 已完成；
     §15 快照对齐 0.4.0。
- **v0.5.0（2026-10-16，需求：开始 body 级浮层气泡的工作吧→ P0★3 落地）**：
  纹理模式下壁纸（z 2147483000 × multiply）压在气泡之上，气泡困在 `.xz4KEq_scroll`
  （query container = 叠层上下文）里抬不出去 → 为每个已打标气泡生成 **body 级玻璃壳**
  （`FLOAT_SHELL_CLASS='__dshui-bubble-float'`，`position:fixed;pointer-events:none`，
  只画玻璃、文字留在原气泡），rAF 循环把壳的几何/圆角/原色与气泡实时同步。
  - 关键设计：① 浮层开时**原气泡不打** `__dshui-frost-surface`（在 markFrostSurfaces 里
    把气泡从 surfaceTargets **摘掉**——collectFrostTargets 本来就混着气泡，第一次实现踩了
    "只不加"的坑）；② 壳的颜色沿用方案 B（气泡内联 `--dsniang-bubble-color` 抄到壳上）；
    ③ 生命周期与打标同生共死（setFrost/markFrostSurfaces/clearFrostSurface/uninstall 全收敛）；
    ④ ~~**默认关（灰度）**：`state.frost.bubbleFloat=false`，纹理模式面板「气泡浮层」开关，
    存档键 `bubbleFloat`（旧档回落 false）~~ ← **这一整套已在 v0.7.1 删除**（见 P0★3 的结论）；⑤ 壳带 `data-dshui-ignore`（isOurNode 拦下，
    不污染气泡扫描）；`@media print` 隐藏；背景模式不建壳（壁纸已垫底）。
  - 测试：fake-dom 补了 rAF 桩（advance 一次 = 一帧）；新增 5 条（建壳/几何跟随/孤儿壳对账/
    模式切换零残留/存档迁移），其中"滚动后壳跟着走"与"React 换节点 → 旧壳删新壳建"是
    第一次引入**常驻同步循环**的回归护栏。
- **v0.6.0（2026-10-16，需求：背景模式下，助手消息里高亮的部分（代码块）与文件卡片也加同款效果）**：
  背景模式下把**助手消息的代码块**与**附件文件卡片**也上"气泡效果"（用户消息的钩子是从
  从保存下来的 ds.html 里实测出来的）：`EXTRA_CHAT_SELECTOR='[data-code-wrap],[data-presented-file]'`
  → 打 `FROST_CHAT_CLASS='__dshui-frost-chat'`，静态规则与气泡同款
  （`color-mix(var(--dsniang-chat-color) var(--dsniang-frost-bubble-mix)) + blur(var(--dsniang-frost-bubble-blur))`），
  原色用 `markChatColors()` 写进各自内联变量（`--dsniang-chat-color`，`chatColorBackup` 两本账逐字还原）。
  **背景模式专属**（纹理模式不碰——壁纸压顶，糊了也只会一起被染色）；`collectSafeSurfaces`
  同一套安全闸（上限 200，长聊天里代码块多）；诊断/状态新增 `chatExtras` 与文案
  `· 代码块/文件 N 个`。
- **v0.6.1（2026-10-16，需求：对 `data-code-wrap` 也添加毛玻璃效果+「`data-code-wrap` 的标签也一起生成气泡」）**：
  反馈 v0.6.0 "看不见效果" —— 排查结论：**打标是对的，是绘制层被盖住了**。DSH 的代码块是
  "套娃"结构（真实 DOM/asar CSS 实据见 [§6](#6y-代码块--md-code-block--data-code-wrap2026-10-16v061看不见玻璃的实据) 末尾那一节）：
  ```html
  <div class="block md-code-block card" data-code-wrap="true">   <!-- 我们贴玻璃的就是它 -->
    <div class="bannerWrap" style="position:sticky;z-index:6;background:var(--dsw-alias-bg-base)">…
      <div class="header" data-code-block-banner style="background:var(--dsl-code-block-background)">
    <div data-code-block-content style="display:contents">
      <pre class="shiki" style="background:var(--dsl-code-block-background)!important">…   <!-- 又是实心底 -->
  ```
  外层玻璃糊的是"这张卡片之后的所有东西"，而内层三层各刷了一层**不透明底** → 玻璃被整块盖住。
  0.6.1 只做三件事：① `:where(pre,[data-code-block-content])` 与 ` :has(> [data-code-block-banner])`
  （**后代**，不是 `>` 直接子代：DSH 现在把 `.bannerWrap` 直接放在卡片里，但中间哪天插一层
  包装就会静默失配） 的 `background:transparent!important`（清内层底）；② 顶部标题条改成**和卡片同一套配方**
  （同色 `color-mix(..., var(--dsniang-frost-bubble-mix,55%), transparent)` +
  `backdrop-filter:blur(var(--dsniang-frost-bubble-blur,12px))`，即用户要的"标签也一起生成气泡"）。
  **为什么这样反而够实**：标题条嵌在卡片玻璃里 → 两层半透明叠加 ≈ 1−(1−0.55)² ≈ **80% 实**，
  标签文字照样清楚；而它自己的模糊会把从下面滚过去的代码糊开（它是 `position:sticky; z-index:6`，
  全透明会叠字）。**不需要**写死 80%/6px 这种魔法数 —— 复用滑块变量，用户拖透明度时卡片和标签同步变。
  ③ **收集顺序修正**：先 `addFrostMarks(panels/dshPanels)` 再收
  聊天内高亮块 —— 否则 `extraSurfaceSafe` 的"祖先已糊就别套娃"闸门在收集时看不到面板，
  DSH 弹窗里的代码块会被重复贴一层（双层 `backdrop-filter` 互相啃 → 死白发灰）。
  选择器补 `.md-code-block` 兜底（`data-code-wrap` 在"无工具栏"的代码块上**不存在**，
  它的值本身是换行开关 `true/false` 而不是标记）。诊断把两类**分开报**：
  `代码块 N 个 · 文件 M 个（玻璃已贴内层）`，状态新增 `chatBlocks` / `chatFiles`
  （`status.json` 顶层同名）。测试 65 → **66**（新增"弹窗里的代码块不重复贴玻璃"回归护栏，
  0.6.0 那条也补了内层透明 + 标题条半透明的静态表断言）。
- **v0.6.2（2026-10-16，需求：薄纱最低数值再调低一点）**：
  把"纱/白层"这一族的**取值范围下限**统一往下放（**默认值一个都没动**）——
  | 滑块 | 旧下限 | 新下限 | 备注 |
  |---|---|---|---|
  | 薄纱（`scrim`） | 0（步长 0.05） | 0（**步长 0.01**） | 下限本来就是 0（= 完全不加纱），但 5% 一档时"最细只能到 5%"；改 1% 一档后 1%~4% 够得着 |
  | 白层（`alpha`，输入卡片玻璃） | 0.15 | **0.02** | 乘 `FROST_ALPHA_MIN`，`setFrostAlpha` API 边界同步 |
  | 面板白层上/下（`panelTop`/`panelBottom`） | 0.30 | **0.10** | 常量 `PANEL_ALPHA_MIN`（原来卡 0.3 的理由是"再低按钮看不清"，但那是**默认值**该守的事，范围不该替用户做决定） |
  顺带把三处**硬编码**（0.15 / 0.85 / 0.9 / 0.3 散在滑块、存档校验、API 里）收成常量
  `FROST_ALPHA_MIN` / `FROST_ALPHA_MAX` / `SCRIM_STEP` / `SCRIM_MAX` + `PANEL_ALPHA_MIN`，
  免得下次改一处漏一处。顺手对齐一个**老不一致**：`setScrim()` API 与 `?scrim=` 原来允许到 1，
  而存档校验只认 ≤0.9 → `setScrim(1)` 看着生效、刷新后悄悄没了；现在两处都按 `SCRIM_MAX`。
  旧存档里的低值现在能读回来了（以前 `< 0.3` 的面板白层会被判坏数据 → 回落 97%）。
  ⚠️ 一个**不是 bug 的坑**：全新 profile 的首次迁移仍会把"低于出厂默认"的值提上来（只升不降、只跑一次，
  v0.2.30 的老纪律）—— 测试里要带上 `__dshui.glass.v1` 标记才测得到"低值原样读回"。
  测试 66 → **67**。
  **歧义备忘**：用户只说"薄纱"，而唯一叫「薄纱」的滑块下限本来就是 0 —— 所以这一版把**整族**
  纱/白层的下限都往下放了一档，并让它们**都**更好调（若指的是"白层/面板白层"也已覆盖）。
  交付说明里写清了对应关系，等待确认；若需求方说明的其实是别的滑块，改一行常量即可。
  ⚠️ 另一个可能被误会的点：**背景模式下"图看着发白"多半是浓度**（图 50% 不透明度叠在页面底色上），
  不是薄纱 —— 那个旋钮是「浓度」（往右拖到 100% = 完全不透）。
- **v0.6.3（2026-10-16，需求：背景模式下切换对话，背景会失效）**：
  **真 bug，根因两处，都在"重跑条件"上**：
  1. 观察器里写的是"**没处理过**才处理" —— `if (!state.frostBackup)` /
     `if (state.mode === 'backdrop' && !state.backdropBackup)`。切对话时 React 把页链/座位
     那几层换成**新节点**，新节点自带应用底色 → 壁纸被盖住；而此时账本**还在**（指针指向
     已脱离文档的旧节点）→ 条件为假 → 永远不重跑。旧版那三个"还活着吗"探针
     （`frostBackupAlive` / `frostChainAlive` / `backdropBackupAlive`）只查 `isConnected`，
     **看不出"链的形状变了"**（中间换了某一层）—— 所以它们也救不了。
  2. 就算跑起来，旧写法还会把**我们自己写上去的 `transparent` / `none` 当成"原值"再记一遍**
     → 关闭时"逐字还原"写回的是我们的值（**这是第一版修复引入的**，被
     "背景模式关闭后逐字还原"那条老测试当场抓住并改对了）。
  修法：① 两个函数**每次都重认链 + `sameChain()` 比形状**，形状变了先 `revert`（逐字还旧账）
  再按新链重清；② `clearFrostChain(chain, previous)` 带旧账查表，同一元素**沿用最初的原值**；
  ③ 观察器那段抽成 `repairPass()`，与 `__DSHUI__.reapply()` **共用同一条路径**（测试打的就是它）；
  ④ 认不出 `[data-conversation-scroll]` 时**退路 = 清 `#root`**（首屏/hero/加载态也盖不住壁纸）；
  ⑤ 重认链必须走**便宜路径** `currentTranscript()`（明牌属性查询 → 缓存 → 才轮到贵的
  全文档打分）—— 否则长聊天里每 250ms 一次全文档 `getComputedStyle` 会肉眼可见地卡。
  诊断新增 **`自愈 N 次`**（`backdrop.repairs` / `frost.repairs`）+ 公开 API `reapply()`。
  测试 67 → **69**。
- **v0.6.4（2026-10-16，需求：的确是整张壁纸彻底消失—— 回应上一版的反问）**：
  上一版（0.6.3）修的是"**被盖住**"，而用户确认症状是"**整张壁纸彻底消失**" —— 那还可能是
  **图层自己不再绘制**（节点被摘 / 图被抹 / 卡死的淡出把它变成全透明 / 塌成 0 尺寸），
  或者是**链外的**全屏不透明层（0.3.2 那套"从消息区往上清"够不着它）。这一版两条都补上：
  1. **壁纸体检 + 自愈** `layerHealth()` / `healWallpaperLayer()`：缺节点 → 补（`ensureLayer`）、
     图被抹 → 重画（`applyModeToLayer`）、`is-faded` 卡死（没有淡出流程在跑却留着）→ 摘掉、
     没图地址 → 3s 节流重拉一次状态；每次都记进 `wallpaperRepairs` / `wallpaperHealed`。
  2. **链外盖子** `scanWallpaperCovers()` / `healWallpaperCovers()`：两路找 ——
     ① `document.elementsFromPoint()` 在**四个采样点**做命中测试（壁纸在最底，谁压在上面又
     几乎铺满屏、还是不透明的，就是盖子）；② **顶层容器补扫**（`body` / `#root` 的直接子元素）——
     因为真实命中测试会**跳过 `pointer-events:none`** 的元素，而"加载壳"经常就是这么写的。
     清掉时逐字记账；**它不再盖着 / 弹窗打开 / 切回纹理模式**都原样还回去。
     保护：弹窗与菜单（`role=dialog|menu`，含 6 层祖先）打开时那层变暗遮罩**有意为之**，不碰。
  3. 诊断：面板多一行 **`壁纸: …`**；`diag.json` / `status()` 多 `wallpaper{text,painted,issues,repairs,covers,coverCount}`；
     公开 API **`__DSHUI__.wallpaper()`**（跑一遍体检 + 补扫，直接返回可读结论，用户没有 DevTools）。
  4. **性能**：体检是几个属性读取（每 250ms 那遍顺手做）；盖子扫描节流 1s，且账本非空时不节流
     （要尽快发现"它不再盖着了"并还原）。`reapply()` 传 `force` 绕过节流。
  5. fake-dom 补齐了这次需要的桩能力：`document.elementsFromPoint()`（含"跳过 pointer-events:none"）、
     `getComputedStyle().opacity` / `.backgroundImage`、以及"我们的两个图层按视口几何返回
     `getBoundingClientRect()`"（静态样式表在桩里不存在，否则体检会误判成塌成 0 尺寸）。
  测试 69 → **73**。
- **v0.6.5（2026-10-16，需求：还是会白闪一下）**：
  0.6.4 的病治好了（不再永久消失），但**修得太晚** —— 抢修排在 250ms 去抖那一遍里，
  于是"先白 0~250ms、再变回来"就是用户看到的白闪。修法是**把抢修提前到绘制之前**：
  - `MutationObserver` 的回调是**微任务**，在浏览器绘制**之前**跑 → 在这里同步做一遍
    **轻量抢修**（`instantGuard`），用户一帧都看不到白。
  - 轻量 = 只做三件便宜事：① `layerHealth()`（几个属性读取）；② **顶层容器增删**
    （`body` / `#root` 的直接子节点，跳过我们自己的节点）→ 当场跑链外盖子扫描；
    ③ **链形状变了没有**（`chainShapeChanged()`：只比元素身份/顺序，**不读计算样式**）
    → 当场重清通透化 + 整页底色。贵的那一遍（全量打标 `markFrostSurfaces`、分层、昂贵重试）
    仍然留在 250ms 去抖里。
  - 新增 **抢修延迟** 诊断：`state.wallpaperLastLagMs`（观察器回调开头记 `lastMutationAt`），
    显示在 `壁纸: …` 行尾 `最近抢修延迟 Xms`，同时进 `diag.json` / `status()` 的
    `wallpaper.lagMs`。**个位数毫秒 = 抢在渲染前（不闪）；≥100ms = 还是等去抖（会闪）** ——
    下次再报"闪"，先读这个数就知道该往哪查。
  - fake-dom 补了 **`MutationObserver` 桩**（变化只入队，测试显式 `dom.flushMutations()`
    才派发 = 真实那次"绘制前的微任务"），于是"同步抢修"这条路径可以被真正测到：
    新增用例**不推进任何计时器**，直接断言"派发那一刻新链已经被清好了"。
  - 顺带修桩的一处**级联优先级错误**：`getComputedStyle().backgroundColor` 原来让
    `setComputedStyle`（类规则）压过内联 —— 真实浏览器里内联 `!important` 是压过类规则的，
    否则"我们清完底之后还算不算画了背景"会判反（盖子扫描会反复命中自己清过的层）。
  测试 73 → **74**。
- **v0.7.1（2026-10-17，需求：切模式之类的时候会导致无法操作+「气泡浮层把文字遮罩住了」）**：
  1. **修界面卡死**：观察器回调**每个 DOM 批次**都在跑「扩展表面补标」（全文档查询 + 逐个读计算样式 +
     写玻璃类 + 写内联颜色变量）。实测渲染进程 47% + GPU 进程 59% —— 每批写一次样式，所有玻璃表面
     就重新模糊一遍；流式输出时每秒几十批，主线程被占满，界面只剩"深度思考中"、点什么都没反应。
     两道闸：① **纯文本批次直接跳过**（流式输出绝大多数批次只是加/换文本节点，不可能带来新表面）；
     ② **变更风暴熔断**：每秒批次数 > 25 进低功耗（只保留"抢在渲染之前的链抢修"，去抖放宽到 1s），
     降到 < 8 批/秒并持续 2s 自动退出、并立刻补一遍全量。新增诊断行
     `性能: 变更 N 批/秒 · 低功耗中/正常（跳过补标 M 次）`，`reportLayout()` / `status()` 增
     `perf{rate,storm,skipped}`；新增 2 条测试（高频批次被跳过 + 新面板仍立刻贴玻璃）。
  2. **删除「气泡浮层」**（需求：直接关掉并删去这个选项）：纹理模式下壁纸压在 UI 之上，壳要糊到
     壁纸就必须抬到壁纸之上 → **也压在气泡文字之上**，而 `backdrop-filter` 糊的是"它后面画过的一切"
     （含文字）→ 实测「气泡是有了，但把文字遮罩住了」。⇒ 该方案在纹理模式下**结构上不可行**。
     面板开关、壳机制（`FLOAT_SHELL_CLASS` / `syncFloatShells` / `ensureFloatLoop` / 同步 rAF 循环）、
     `bubbleFloat` 存档键（旧档一律忽略）、4 条浮层测试一并删除；气泡玻璃改走「背景」模式。
     client 测试 78 → **74**（删 5 加 1）。
- **v0.7.2（2026-10-19，用户丢来《DSH 插件作者安装卸载与外部副作用规范建议 v0.1》，据此整改）**：
  1. **新增 `scripts/uninstall-cleanup.ps1`**（§3.1/§3.4/§3.6 落地）：等官方移除完成（四件套仍引用就
     继续等，超时退出码 3、绝不动文件）→ 四件套逐项断言 → 清理 `node_modules/<包名>` 残留**联接**
     （先判 `LinkType`，只删重解析点，绝不递归进真实目录）→ 打印证据清单。幂等可重入、`-DryRun` 不改文件、
     全程写日志（`~/.dsh/dsh-ui-beautify-uninstall.log`）、退出码 0/1/2/3/4 按 §3.6 约定。
     实测 5 条路径：DryRun 无改动 / 真跑清联接且目标不受影响 / 连跑第二次幂等 / 参数错=2 / 仍在安装=3。
  2. **README 新增「外部副作用声明」「用户数据」「卸载后自检」「作者自测清单」**（§3.2/§3.4/§3.5/§5 适配版）：
     明确本插件是纯 Cordis 插件（不改 app.asar/注册表/计划任务/环境变量/端口、无 daemon、无外部网络、
     用户数据只在 localStorage `__dshui.*` 且默认保留）。
  3. **`package.json` 补 `engines.dsh`（`>=0.2.0-rc.0`）、`repository`、`files` 补 `scripts` 与 `LICENSE`**（§3.8 R2）。
  4. `dsh-reload-ui` 同步：v0.1.1、同样的元数据字段 + README 补「卸载自检」与「外部副作用声明」。
  5. 出包 13 条目（新增脚本）；三套测试 host 21 + client 74 + reload 6 全绿。
- **v0.7.3（2026-10-19，全量更名：dsh-dsniang-beautify → DSH UI Beautify）**：
  把项目名统一到 DSH UI Beautify，包名与运行时标识一起改到位（不只是展示层）：
  1. **包与标识**：`package.json` name → `dsh-ui-beautify`；`cordis.patch.yml` 行 id/name → `dsh-ui-beautify`；
     包目录 / zip 名 → `dsh-ui-beautify`；路由前缀 → `/dsh-ui-beautify/*`；全局 API → `__DSHUI__`；
     localStorage 前缀 → `__dshui.*`；自有节点 id / CSS 类 / data 属性 → `__dshui-*` / `data-dshui-*`。
  2. **存档迁移**：首次加载把旧前缀 `__dsniang.*` 的键**原样复制**到 `__dshui.*`（新键已存在则不覆盖；
     旧键保留便于回滚），迁移数量进诊断（新增 `存储:` 行）与 `status().storageMigrated`；新增 1 条测试（client 74 → 75）。
  3. **旧入口兼容**：旧 hash `#dsniang-off` / `#dsniang-diag` 与旧 URL 参数 `?dsniang=` 仍被接受
     （新写法分别为 `#dshui-off` / `#dshui-diag` / `?dshui=`）。
  4. 胶囊/面板/控制台文案统一为 `DSH UI Beautify`（胶囊短标签 `DSH UI · 纹理/背景/…`）；壁纸角色名「DS 娘」仅在描述画面时保留。
  5. 沿用 v0.7.2 的安装/卸载与外部副作用规范化能力（自检脚本、副作用声明、元数据、13 条目出包）。
  6. **文档双语**：README 增加英文版（顶部语言跳转）＋ Release 说明中英双语；包内 README 随之更新。
- **v0.8.19（2026-10-22，撤销隐藏壁纸方案）**：
  - 0.8.18 的 hideWallpaper 会让壁纸瞬间消失（用户反馈“删了/闪”），撤销；
  - 恢复旧图淡出+新图淡入的交叉淡化，始终有图覆盖；
  - `preloadThemeWallpapers()` 保留 Image 引用并 `decode()`，首次切换不用等下载/解码；测试 host 30 / client 102。

- **v0.8.18（2026-10-22，首次切主题黑罩修复）**：
  - 根因：首次 dark→light 时新浅色图未下载完，旧深色图以 0.85 浓度留新 UI 上 = 黑罩；后续有缓存所以正常；
  - 去掉全屏旧底色遮罩；`applyThemeVisuals({hideWallpaper})` 先隐藏旧壁纸；
  - 交叉淡化 `themeSwitch` 模式：旧图保持 0、只让新图淡入；
  - 启动预加载「当前 + 另一主题」壁纸（`preloadThemeWallpapers`）；测试 host 30 / client 102。

- **v0.8.17（2026-10-22，主题切换防闪修正）**：
  - 观察器回调同步 tick，去掉 60ms 去抖：遮罩在绘制前插入；
  - playThemeVeil 只负责盖住，等 syncThemeImage promise（或 260ms）后 fadeThemeVeil 再淡出；
  - 防闪逻辑不受插件动效总开关影响，只尊重系统减弱动态；测试 host 30 / client 102。

- **v0.8.16（2026-10-22，主题切换柔化）**：
  - `playThemeVeil()`：旧主题底色全屏遮罩淡出（插件自己的节点，覆盖 DSH 原生 UI，不改宿主样式）；
  - 主题切换时壁纸走 `syncThemeImage` 交叉淡化，浓度/毛玻璃走 `tweenLayerOpacity` / `tweenFrostVars` 补间；
  - 胶囊/面板/诊断与模式按钮加 background-color/color/border-color 过渡；`motionAllowed()` 关闭时全部跳过；
  - 测试 host 30 / client 102。

- **v0.8.15（2026-10-22，修 Cordis Host 读 app.asar 的虚拟目录问题）**：
  - 实机发现：客户端 diag `bridge=available`，但 Host `/restart-status.json` 报 `patched:false`；
    用 DSH 的 Electron-as-node 复现：普通 `fs.statSync(app.asar)` 返回 `isDirectory=true,size=0`，
    `openSync` 报 ENOENT——Electron 的 asar 虚拟文件系统把归档当目录。
  - 修复：新增 `withRawAsarFs()`（优先 `original-fs`，否则临时 `process.noAsar=true`），
    `resolveShellPatchAsarPath` 的存在性判断 / `detectShellPatchInAsar` / `safeMtime` 全部走原始 fs；
    `shellPatchStatus` 暴露 `asarPath` 与 `rawAsarFs`。实测 Electron-as-node：`original-fs`、patched=true。
  - `detectShellPatchInAsar(path, { fs })` 支持注入原始 fs，新增回归测试（host 29 → 30）。
  - 看护增强：标题栏整体重建时补回按钮；休眠恢复无 visibility/focus 时用计时器跳变（≥30s）兜底检查
    + 强制重绘；conflict 让路时停掉看护；`restartSnapshot` 暴露 watchdog/repairs/lastRepairAt。client 101 → **102**。
- **v0.8.14（2026-10-22，修休眠恢复后重启键短暂消失）**：
  - 实机反馈：长期休眠/隐藏后重新打开窗口，标题栏「重启」会短暂消失，「应用」「编辑」正常；
    源码层面确认按钮只在页面加载时注入一次，成功后无自愈（`restartTryInstall` 成功后即停发现循环）。
  - 新增 `restartStartWatchdog()`：`visibilitychange`（变为可见）/ `window.focus` / `pageshow` 立即检查，
    1.5s 低频轮询 + 当前菜单栏 `childList` 观察兜底；按钮不在菜单栏就 `restartEnsureButton()` 补回
    （仍遵守 `state.restart.suppressed` / `restartProvidedByOtherPlugin()` 让路，不跟 dsh-restart-key 抢）。
  - `uninstall()` 新增 `keepRestart`：关闭壁纸/背景模式只拆视觉层，不再顺手 `stopRestartButton()`；
    `__DSHUI__.uninstall()` 仍会完整摘除按钮与看护。
  - 测试 client 99 → **101**（新增「按钮被摘后自动补回」「关闭模式保留重启键」）。
- **v0.8.12（2026-10-22，深色按钮白底白字）**：
  - 深色壁纸 `DeepSeek 暗夜模式.png` 转 WebP 后随包（`assets/deepseek-dark.webp`，125,598 B，去元数据），桌面优先、包内兜底；
  - 发布前清理：仓库历史中的本机用户名路径统一替换为 `user`（git 历史重写 + 旧 Release 资产替换）。
  - `swatchStyle()` 深色激活态 = 白底黑字、未激活 = 透明浅字；浅色不变；
  - 覆盖模式按钮/开屏/音效/图片/毛玻璃/气泡视觉/AI 视觉/动效等全部胶囊按钮；测试 client 98。

- **v0.8.11（2026-10-22，深色 GUI 静态兜底）**：
  - 静态 CSS 按 `body[data-ds-dark-theme]` 强制胶囊/设置面板/诊断面板深底浅字；
  - 面板模式按钮与控件文字深色下强制浅色；延迟 800ms 补套胶囊配色；测试 host 29 / client 98。

- **v0.8.10（2026-10-22，深色胶囊对比度）**：
  - `applyPillTheme()`：深色胶囊固定深底浅字（rgba(17,18,20,.82)/#f5f7fa）+ blur(10px)；浅色仍走 DSH token；
  - 主题切换时同步重算胶囊配色；测试 host 29 / client 98。

- **v0.8.9（2026-10-22，深色参数 + 主题切换重算）**：
  - 深色独立浓度：`MODE_OPACITY_DARK_DEFAULTS.multiply = 0.85`；滑块按主题分别存 `__dshui.opacities.dark`；
  - 深色纹理改用 `mix-blend-mode: lighten`（multiply 下暗夜壁纸在暗色 UI 上几乎不可见），浅色不变；
  - `applyThemeVisuals()`：主题切换时重算图层/浓度/毛玻璃变量/气泡与代码块原色/二级面板遮罩/薄纱；
  - 测试 host 29 / client 98。

- **v0.8.8（2026-10-21，修复真实深色主题识别）**：
  - `isDarkTheme()` 改为以 `body[data-ds-dark-theme]`（+html data-theme/class/color-scheme）为准；
  - 主题监听同时观察 body 与 html 的 data-ds-dark-theme/data-theme/class/style，按变化去重；
  - 启动探针带 theme/themeAttrs；测试 host 29 / client **98**。

- **v0.8.7（2026-10-21，深浅色主题壁纸）**：
  - 深色主题自动切到桌面 `DeepSeek 暗夜模式.png`（支持常见大小写/空格变体），浅色保持原两张；
  - 胶囊图片栏按主题显示候选（深色仅「暗夜」一张）；深浅偏好分键保存，切回浅色恢复原选择；
  - 暗夜图缺失时自动退回浅色行为；status.json 增加 darkImages / theme 默认图；诊断加主题行；
  - 测试 host 28 → **29**，client 96 → **97**。

- **v0.8.6（2026-10-21，重启键重新适配 dsh-restart-key v1.3.1）**：
  - 随包 restart/scripts+shell 同步到 v1.3.1；安装器调用改为绝对路径 powershell + 非 detached（修 detached 静默退出），并传 `-SkipPlugin`；
  - 新增自动准备：插件加载 1.5s 后检测补丁，缺失则自动启动安装器（`-NoRestart`），用户只需完全退出 DSH 一次；状态路由带 `auto/autoResult`；
  - 与 dsh-restart-key 的优先级：对方按钮生效时本插件暂缓注入并每 1.8s 复查（对方让路后由本插件接手）；诊断显示让路状态；
  - 测试 host 27 → **28**（自动准备 dry-run/snapshot/失败路径）。

- **v0.8.5（2026-10-21，纹理模式气泡视觉）**：
  - 纹理（multiply）模式下给用户气泡加 1px 内描边 + 顶部高光 + 柔和投影（只写 background-image/box-shadow，零布局）；
  - 只作用于用户气泡、只在 multiply 模式；面板「气泡视觉：开/关」+ `setBubbleFx()` + 存档 `bubbleFx`；
  - 助手气泡/背景模式完全不动；测试 client 93 → **94**。

- **v0.8.4（2026-10-21，重启诊断 + Host 下 app.asar 路径修复）**：
  - 修复 Cordis Host 里 `process.resourcesPath` 为 undefined 导致壳补丁状态误报未安装：
    `resolveShellPatchAsarPath()` 三级兜底（resourcesPath → execPath 逐级向上 → 常见安装路径），并加单测；
  - 新增重启诊断探针：`reportRestartProbe()` 把桥/按钮/点击结果上报 `/diag.json`（只读，不执行动作）；
  - 面板「↻ 重启 DSH」在壳补丁缺失时直接转成一键启用；
  - 测试 host 26 → **27**；README 补插件安装 registry 报错说明。

- **v0.8.3（2026-10-20，重启键一键启用 / 真正整合）**：
  - 面板「启用重启键」按钮 → 宿主 `POST /restart-enable`（动作头 + 同源栅栏）→ detached 启动随包
    `restart/scripts/install-restart-key.ps1`；用户只需完全退出 DSH 一次，后台自动打补丁/校验/重启；
  - 宿主 `GET /restart-status.json` 报告壳补丁是否已安装（读 app.asar 尾部标记）；
  - 这是插件里唯一的 `child_process` 用法（用户主动点击、detached、不自动执行）；
  - 测试 host 24 → **26**、client 92 → **93**。
- **v0.8.2（2026-10-20，视觉更新 + 莱茵生命风格化）**：
  - 毛玻璃改**径向渐变**（内部透 = 名义 × 0.55 → 边缘亮 = 名义；默认 0.11 → 0.2；面板 0.80 → 0.94），
    白层默认 25% → **20%**，加边缘 1px 高光 + 外阴影；
  - 「上下颠倒」（渐变焦点上下翻转）尝试后观感差异太小，**已删除**；
  - 输入区方块光标：隐藏原生 caret，叠一个 8×18 闪烁小方格（颜色 = **开屏首屏 accent #3964fe**，1.2s 慢闪；选区 Range 定位，失败回退原生）；
  - **思维链配色已移除**：曾把普通操作标题/图标染 #ff7b00，用户反馈不好看 → 思考/步骤区域恢复 DSH 原样，样式表不再有 data-variant 覆盖；
  - 测试 client 91 → **92**（删除上下颠倒后回归）；panel 滑块文案改为「面板边缘白层 / 面板内部白层」。
- **v0.8.1（2026-10-20，开屏 GUI 抑制 + 交互卡死修复 + 重出包）**：
  - 开屏播放期间隐藏胶囊/面板（与 iframe 同 z-index、DOM 更晚插入会漏出），播完恢复；开屏期间点背景/点胶囊不响应；
  - 点背景淡出后立刻点胶囊：开面板前取消淡出（清定时器 / 摘 `is-faded`），毛玻璃 MutationObserver 跳过纯自家 GUI 批次；
  - 0.8.0 内容全部包含（开屏动画/音效/WELCOME BACK/标题栏避让/重启键整合/双向冲突保护）。
- **v0.8.0（2026-10-19，整合开屏动画：莱因生命风格）**：
  把用户用其他 AI 生成的单文件开屏页（`桌面/DSH-开屏项目/DSH-开屏-莱因生命风格-v2.html`，v2.4）整合进插件：
  1. **资产与宿主**：`assets/splash.html`（原文件原样拷入，**不改源文件**）；宿主新增只读路由
     `GET /dsh-ui-beautify/splash.html`，返回时在 `<head>` 后**注入桥接脚本**（`?cfg=` → `window.__DSH_STARTUP__`；
     隐藏开屏页自带的 mock 界面与控制台；结束/异常 `postMessage` 回父页面；父页面可发 skip）。
  2. **客户端**：页面加载时挂一层同源 iframe（`#__dshui-splash`，z-index 最高、不透明底），
     `done/skip/error` 消息或 30s 超时后淡出移除；`prefers-reduced-motion` / `#dshui-off` 跳过；
     `?splash=0` 强制关、`?splash=1` 强制开；开关存 `__dshui.splash.v1`（默认**开**）。
  3. **面板与 API**：「开屏动画：开/关」+「↻ 重播」；`__DSHUI__.splash.replay/skip/setEnabled/config()`；
     诊断新增 `开屏:` 行（播放中/已播放完/已跳过/已关闭/超时兜底 + 耗时），`status()` 带 `splash` 快照。
  4. **安全/铁律**：同源 iframe 做样式隔离，不放宽栅栏；iframe 移除即零残留（不碰页面 DOM/CSS）；
     音效默认关（启动无手势，自动播放策略会静音）。
  5. **测试**：host 21 → **23**（开屏路由 + 桥接注入纯函数）；client 75 → **79**（挂载/移除/关闭/降级/超时/面板）。
  6. **出包**：13 → **28 条目**（新增 `assets/splash.html` + `restart/` 壳补丁工具与文档）。
  7. **重启键（同日整合）**：标题栏「应用」「编辑」右侧的「重启」按钮半区并入本插件
     （shadow-DOM 菜单栏注入 + 中英双语 + 忙碌/取消/超时兜底 + 面板「↻ 重启 DSH」+ 诊断 `重启:` 行 +
     `__DSHUI__.restart` API + 卸载摘除）；真重启能力沿用用户「DSH 重启键项目 v1.1.0」的**桌面壳补丁**，
     整包 `restart/` 目录（安装/卸载/体检 cmd + 脚本 + 补丁工具）。壳补丁按规范独立安装（需 DSH 完全退出、
     双 SHA 备份还原）；插件本体仍不碰 app.asar。原项目 25 项插件测试 + 12 项壳补丁测试 + 58 项脚本自测为基座，
     本插件新增/改造后 client 79 → **85**。
  8. **WELCOME BACK 卡片修复**：开屏页自带的卡片挂在它 mock 界面里（集成态被隐藏）→ 改由插件在
     真实页面右上角绘制：读宿主 `status.json` 的 `user`（本机登录名，不落盘/不外发），约 3.6s 自动淡出；
     关开屏 / `?splash=0` / 卸载时都不留；诊断 `开屏:` 行会标「欢迎卡片已显示」。
  9. **标题栏避让**：开屏页顶部文字（品牌/步骤计数/SKIP）与 WELCOME BACK 卡片按实际标题栏高度下移 ——
     父页面依次尝试 `navigator.windowControlsOverlay.getTitlebarAreaRect()` → CSS 变量
     `--dsh-windows-titlebar-height` → `[data-windows-menu]` 矩形，兜底 40px；把高度写进开屏 iframe 的 `cfg.titlebar`，
     桥接脚本按它注入带 `!important` 的偏移样式；卡片 top = 标题栏高度 + 22px。
  10. **开屏 GUI 抑制 + 点背景后点胶囊卡死**：开屏播放期间把胶囊/面板整体隐藏（胶囊与 iframe 同为最大 z-index，
      胶囊 DOM 位置更晚 → 会盖到开屏画面上），播完恢复；开屏期间背景点击不响应。点背景淡出后立刻点胶囊：
      `toggleSwitcher` 先取消淡出定时器/还原 `is-faded`，并且毛玻璃 MutationObserver 跳过「纯自家 GUI」的批次
      （面板增删不再触发全文档抢修/链外盖子扫描）。client 89 → **91**。
- **v0.7.0（2026-10-16，需求：一次完成 B+C 吧，时间成本不限—— B = P0 动效底座+帧探针，
  C = 重载插件 + 图片瘦身 + diag 多窗口读数）**：
  1. **动效公共底座**：总开关 `state.motion.enabled`（**默认关**，灰度；存档 `__dshui.motion.v1`；
     面板「动效：开/关」按钮 + 快捷键 `Ctrl+Shift+Alt+M` + API `setMotion()`），
     `motionAllowed()` = 开 + 非 reduced + 非 paused —— **之后所有装饰动效必须从它走**。
     自动暂停：`prefers-reduced-motion`（`watchMotionPrefs` 里 `matchMedia`，change 监听）+
     窗口 blur/focus + `visibilitychange`。
  2. **rAF 帧时间探针**：`motionBegin`/`motionEnd` 计数（现有三个动画系统全接上了：
     `tweenFrostVars` / `tweenLayerOpacity` / 气泡浮层循环；取消路径也记账，不漏），
     计数 >0 才开采样循环（不空转）。读数 `motion{fps, frameMsP95, dropped, longFrames, animating,
     paused, reduced}` 进 `diagLines()`（`动效:` 一行）、`reportLayout()`、`status()`；
     掉帧 = 帧间隔 > 2×16.67ms，长帧 = >50ms；fps/P95 用 120 样本滚动窗口，
     **停采样时收尾汇总一次**（否则 <500ms 的短动画永远等不到节流汇总 —— 0.7.0 自己踩的坑），
     样本 <2 时**保留上一轮读数**（别用 0 覆盖）。
  3. **「重载界面」独立插件 `dsh-reload-ui` v0.1.0**（新目录 `default-workspace\dsh-reload-ui`，
     用户 10-13 定的"单独立项"）：`Ctrl+Shift+Alt+R` → `location.reload()`；零侵入、只认 `#root`、
     重复注入幂等、自带栅栏与双通道注入；测试 6 项。
  4. **包内兜底图换 WebP**（`BUNDLED_IMAGE_NAMES` 值 → `.webp`；实测 4k 1.60 MB → 0.18 MB、
     黑白 1.86 MB → 0.16 MB）：身份名不变（仍是 `deepseek 4k.png` 等），`?img=` 走
     `normalizeImageName`（新旧扩展名别名都认）；`/bg.png` 的 Content-Type 改按**字节魔数**
     （RIFF+WEBP → image/webp），别信扩展名；桌面原图仍优先（PNG 不变）。
  5. **diag history 带 motion 摘要**：多窗口时 `history[].motion{fps,frameMsP95,animating}`
     可读各自 FPS，不再被"最后上报者"顶掉。
  测试 74 → **76**（client）+ 19 → **21**（host）。
- 发布包在 `dist/`（条目清单见 [§10](#10-打包与发布实测配方)）。
- **用户最新三条明确需求（`data-code-wrap` 的毛玻璃、"薄纱"下限、切对话不掉背景）已完成**，
  但**尚未经过用户实机验收**（v0.6.1~v0.6.5 已自测全绿；"打标正确 ≠ 看得见"这个坑见 §6.y）。
  ⚠️ **交付时明确告诉用户**：万一还闪/还复现，按 `Ctrl+Shift+Alt+I` 读 `壁纸: …` 那一行
  （或敲 `__DSHUI__.wallpaper()`）—— 它会直接说清是"图层问题"、"链外盖子"，
  还是"抢修延迟 ≥100ms（等去抖了）"，别再靠猜。

**最该做的下一步（按优先级）**：

1. **装饰动效：已定案"先不做"**（2026-10-17 决定）。底座与探针留在代码里，将来要做时
   直接从 `motionAllowed()` 起步（建议第一版"纯补间"：壁纸缓慢推近 + 胶囊呼吸；结论表与
   实测数字见 §11 P0）。
2. **P2 启动模式**若改成「纹理」：`readMode()` 兜底 `'off'` → `'multiply'`（一行；用户没要求就别动）。
   （气泡 body 级浮层 ⚰️ v0.5.0 落地、**v0.7.1 按用户要求删除**；气泡本身 ✅
   方案 B / v0.2.39；二级窗口层级 ✅ v0.2.37 + v0.3.3；背景模式 ✅ v0.3.2 页链清底 +
   v0.4.0 毛玻璃；聊天内代码块/文件卡片 ✅ v0.6.0 贴玻璃 + v0.6.1 修内层遮盖；
  纱/白层下限 ✅ v0.6.2；切对话后壁纸被盖住 ✅ v0.6.3 自愈；壁纸彻底消失（图层体检 + 链外盖子）
  ✅ v0.6.4；白闪 ✅ v0.6.5 抢在渲染前；动效底座 + 帧探针 ✅ v0.7.0；
  「重载界面」独立插件 ✅ v0.7.0（`dsh-reload-ui`）；PNG→WebP ✅ v0.7.0；
  diag 多窗口 motion 摘要 ✅ v0.7.0。）

**三条绝对不能破的线**：

1. **不改页面布局**（唯一的例外是"分层"的守卫分支与"通透化"清背景，两者都必须**逐字节可还原**）；
2. **样式表永远静态**（状态值只能走内联样式 / CSS 变量）；
3. **全屏位图不许每帧重写**（动画只能动 `transform` / `opacity`，或交给解码器出帧）。

---

## 1. 环境与命令（全部已实测）

| 项 | 值 |
|---|---|
| 工作目录 | `<工作目录>` |
| 插件目录 | `…\default-workspace\dsh-ui-beautify` |
| 发布包 | `…\default-workspace\dist\` |
| Node（带 `node:test`） | `<DSH 安装目录>\resources\runtime\primary-runtime\dependencies\node\bin\node.exe`（v24.21.0） |
| Python（带 Pillow 12.3.0） | `%USERPROFILE%\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe` |
| DSH 应用（只读勘察用） | `<DSH 安装目录>\resources\app.asar`（解包后是 `<DSH 安装目录>\resources\app.asar\dsh\`） |
| 本机安装位置 | `%USERPROFILE%\.dsh\profiles\desktop\node_modules\dsh-ui-beautify` → **Junction**，指向插件目录 |
| 运行中的 GUI | `http://127.0.0.1:19387` |

```powershell
# 测试（唯一可信的"没有弄坏东西"信号）
cd "<工作目录>\dsh-ui-beautify"
$node = '<DSH 安装目录>\resources\runtime\primary-runtime\dependencies\node\bin\node.exe'
& $node test\host.test.mjs      # 期望 19 pass / 0 fail
& $node test\client.test.mjs    # 期望 76 pass / 0 fail

# 看用户机器此刻的真实状态（只读）
Invoke-RestMethod http://127.0.0.1:19387/dsh-ui-beautify/status.json
Invoke-RestMethod http://127.0.0.1:19387/dsh-ui-beautify/diag.json
```

### 改动生效规则（**最容易搞错的一条**）

| 改了什么 | 怎么生效 |
|---|---|
| `lib/client.js`（273908 B · `VERSION='0.8.1'`） | 刷新页面即可（`no-store`）；改代码**必须**同步 bump 三处版本号，否则页面可能吃旧缓存 |
| `lib/index.js`（28253 B · `PLUGIN_VERSION='0.8.1'`） | 改宿主后要**重启 DSH**（bundle 层栈只在启动时收集一次） |
| 版本号三处 | `?v=` 变化 → 页面拉新 client；**只改 client.js 不改版本号 = 页面可能一直吃旧缓存** |
| 桌面上的背景图 | 刷新页面即可（宿主按 mtime 重读） |
| 只改文档（README / 本文件） | **不要** bump 版本号：页面不该因为纯文档改动被扰动 |

### 本会话的环境约束

- 文件策略：**danger-full-access**，审批提示已禁用 → **不要**设置 `sandbox_permissions`；所有文件用 `write`/`edit` 工具改。
- **用户用不了 DevTools**，也看不到浏览器控制台。→ 任何新功能都必须自带一句能看见的诊断输出。
- 写文件**不要用 PowerShell 的 `Set-Content`**（中文会变乱码）。写完 grep 一次 `\uFFFD` 自查。

---

## 2. 需求与验收编年史

### 2.1 用户是谁、怎么沟通

- 中文交流，句子短，常常**直接粘贴整页 HTML / DOM 快照**当证据 —— 那是**最可信的一手信息**，比猜类名靠谱。
- **极强的视觉验收习惯**：反馈常是"感觉与最开始没有任何区别"。别解释，去找**真正的根因**（2.2 的第 9 条就是被这句话逼出来的）。
- 需求方在意的四件事：**面板操作后不许自动关闭**；**面板不许乱窜**；**出厂默认必须等于他的实机参数**；
  **换台电脑装上去必须开箱可用**。
- 偏好：能自由拖动定位、参数可保存、诊断一键可看、跨机器可移植、图形化效果。
- 被问"推荐用什么"时，要的是**能落地的判断 + 实测数字**，不是格式清单。
- 每次改动都要给出：**改了什么 / 动了哪些文件 / 版本号是否变化 / 怎么验证 / 怎么回退**。

### 2.2 需求编年史（按时间顺序摘要）

| # | 需求 / 反馈（摘要） | 落地 | 状态 |
|---|---|---|---|
| 1 | 需求：做一个 DS 娘美化插件：壁纸背景 + 毛玻璃 + 三个模式 | v0.1 直接改页面元素布局 → **界面塌了**；v0.2 推倒重来，立下「布局零侵入 + 逐元素快照回归测试」 | 铁律 1 |
| 2 | 需求：只要三个按钮，不要自动关闭面板；浓度要能拖 | 面板定稿 `关闭/纹理/待更新` + 浓度滑块 + 图片/毛玻璃控件；**操作后不关闭** | 完成 |
| 3 | 需求：点击背景要淡出、过一会再恢复 | 淡出 `FADE_MS=420` → `RESTORE_MS=2000` 渐变恢复；期间再点顺延 | 完成 |
| 4 | 需求：把左上角的快捷键面板换成能拖的小入口 | 胶囊 `#__dshui-pill`，按住可拖，位置持久化，默认 `{left:10,top:10}` | 完成 |
| 5 | 需求：毛玻璃看不见 | `<textarea>` 是**替换元素**，伪元素不渲染；旧方案是"贴图假装模糊" → 改成真 `backdrop-filter`，目标换成卡片 `div` | 完成 |
| 6 | 需求：切换模式要有淡入淡出 | Chromium **抑制**新挂载元素的 CSS 过渡 → 改成 JS 帧驱动补间（16ms 步，`easeOutCubic`） | 完成 |
| 7 | 需求：换图不要闪白光 | ① 样式表改静态（状态值全走内联/变量）；② 双层交叉淡化 + 结束时**角色互换**（不重写位图） | 完成，有专门测试 |
| 8 | 需求：面板操作后总是乱窜 | `reRenderSwitcher()` 重建节点却没重新定位 → 统一走 `placeSwitcher()` | 完成 |
| 9 | **「感觉与最开始没有任何区别」** | 根因不是我们参数太小，而是 **DSH 自带** `.Dc7zOa_composerSeat` 的 `linear-gradient` 不透明遮罩把玻璃背后糊成纯色 → **通透化** + 一次性参数迁移 | 完成（诊断可见 `cleared:["div.Dc7zOa_composerSeat"]`） |
| 10 | 需求：把聊天记录的下界放低一点 / 删掉「分层」开关 | 实测 DSH **原生**就把 composer 放在滚动容器里 → 走 **native 分支，一行布局都不动**；面板开关删除 | 完成（`layering.native:true`） |
| 11 | 需求：打包当前使用版本；把正在使用的参数设为出厂默认，并生成 zip | 从线上 diag 读回的实机参数写死为出厂默认（浓度 0.49 / 模糊 2px / 白层 25%）；写出 zip | 完成（`dist/…0.2.30.zip` 是那一版） |
| 12 | 需求：在另一台电脑安装后发现图片模式只有 deepseek、没有黑白图 | 根因：宿主只扫桌面，且**包里只有 4k 一张兜底图** → v0.2.31 两张图都进包（ASCII 名），每张独立 desktop→bundled，对外身份名不变 + 别名兼容 | 完成 |
| 13 | 需求：给用户发出的气泡也加同款效果；实现不要分叉，DOM 结构应为 `<div class="cJsG2q_bubble __dshui-frost-surface">` | 把毛玻璃从"卡片专用"重构为"表面集合"：`collectFrostTargets()` = 卡片 + 用户气泡；加 `isUserMessage()` 四级判据（不糊助手输出） | **完成并已线上验证**（3 个气泡带类，`targets:4`） |
| 14 | 需求：为插件添加动画效果；需综合考虑性能与制作成本，选择哪种技术格式 | 给出结论 + 现场实测数字（§11），并提了两件铺垫（帧时间探针 / 动效底座）—— **当时尚未回复，因此都未做** | 待办 P0 |
| 15 | 需求：打包一分记录吧，让下一个AI能继续我们的工作和故事 | 写下本文件 | 完成 |
| 16 | 需求：随包文档要让下一位接手者能直接理解，不必再复述 | 本文件重写为自足版，并**随 zip 发布** | 完成 |
| 17 | 需求：毛玻璃要糊在背景图上；层级顺序应为 背景图 → 文字 UI → 变暗 → 二级窗口 | 遮罩/面板 `z-index` 抬到壁纸之上（v0.2.37），绘制顺序「背景图/UI → 变暗 → 二级窗口」 | 完成 |
| 18 | 需求：在气泡层下再加一层纯白层… | 气泡纯白层方案 → v0.2.41 上机"没任何反应"（聊天区底色近白 + 壁纸压气泡）→ **回退 0.2.40**，结论记入 P0★3 | 回退 |
| 19 | 需求：鲸鱼挂件二级菜单已达标，DSH 本身的二级菜单还没有 | v0.3.1 用 `role="dialog"`/`role="menu"` 打玻璃 → 还是不行 → v0.3.3 用 `:has()` 把"装有 dialog 的容器"整体抬升 + 补径向变暗 | **✅ 用户 2026-10-16 已确认"dsh本体的二级菜单已经正常了"** |
| 20 | **给用户气泡加玻璃之后的验收波折** | 长气泡被 400px 上限静默丢弃（v0.2.37 修）→ 白层 62% 被回退 → 方案 B（保留原色只调透明度） | **✅ 已验收（"现在视觉效果不错"）** |
| 21 | **背景模式看不到图（两次反馈：无视觉变化 / 仍没有图；要求验收后再提交、不要小步交付）** | 根因：DSH 外壳 `.BynINW_frame` 全屏不透明底色盖住 -1 的图（此前另一份实现漏了）→ v0.3.2 构造性修法：**清空页链上所有不透明底色** + `diag.json` 自诊断（`backdrop.chain[]`），验收方式改为"读数据自验" | **✅ 用户 2026-10-16 已确认"背景模式可以看到图了"** |
| 22 | 需求：背景模式可以看到图了，但是还没加入毛玻璃效果比较难看 | → v0.4.0：毛玻璃扩到背景模式（玻璃/白层/滑块与纹理共用一套） | 完成（v0.4.0） |
| 23 | 需求：dsh本体的二级菜单已经正常了，但需要它的模糊度调整滑块独立出来 | → v0.4.0：DSH 面板独立模糊度 `dshBlur`（独立 CSS 变量 + 独立滑块 + 持久化） | 完成（v0.4.0） |
| 24 | 需求：先清文档欠账，再完成前两项；全部自测通过后一次性交付 | 先清本文件过期内容，再实现 22/23，全量自测后才交付（不再小步交付） | 完成（v0.4.0 一次性交付） |
| 25 | 需求：开始 body 级浮层气泡的工作吧 | P0★3 落地：气泡玻璃壳抬成 body 级浮层（v0.5.0，默认关灰度 + rAF 同步循环 + 5 条新测试） | 完成（v0.5.0）→ **已废弃（v0.7.1 删除）** |
| 26 | 需求：背景模式下，助手消息里高亮的部分（代码块）与文件卡片也加同款效果 | 背景模式专属：助手消息的代码块（`data-code-wrap`）与附件文件卡片（`data-presented-file`）上气泡同款玻璃（v0.6.0） | 完成（v0.6.0） |
| 27 | 需求：对 `data-code-wrap` 也添加毛玻璃效果 + 同时给 `data-code-wrap` 的标签生成气泡 | 反馈 v0.6.0 的代码块"看不出效果"：代码块内层（`pre` / `bannerWrap` / `[data-code-block-banner]`）各刷了不透明底，把外层玻璃整块盖住 → 清内层底（`pre`/`bannerWrap`）+ 标题条复用同一套玻璃配方（两层叠加约 80% 实）+ 先糊面板再收代码块（防套娃）+ 选择器补 `.md-code-block` + 诊断分开报代码块/文件（v0.6.1） | 完成（v0.6.1） |
| 28 | 需求：薄纱最低数值再调低一点 | 纱/白层这一族的**下限**统一往下放（默认值不动）：薄纱步长 5%→**1%**、白层下限 0.15→**0.02**、面板白层下限 0.30→**0.10**；三处硬编码收成常量（v0.6.2） | 完成（v0.6.2） |
| 29 | 需求：背景模式下切换对话，背景会失效 | 真 bug：切对话时 React 换掉页链/座位节点，而重跑条件写的是"没处理过才处理"（账本还在、指针已失效 → 永不重跑）→ 改成每次重认链 + `sameChain()` 比形状（变了就还原旧账重清）+ 退路清 `#root` + 自愈计数 + `reapply()`；顺带修好"重复清会污染还原账本"（v0.6.3） | 完成（v0.6.3） |
| 30 | 需求：的确是整张壁纸彻底消失（回答上一版的反问） | 症状澄清：不是"被盖住"而是"图层不画了"→ 0.6.4 两条都补：① 壁纸体检（缺节点/图被抹/卡死淡出/塌成 0 尺寸 → 自愈）；② **链外盖子**扫描（`elementsFromPoint` 四点命中测试 + 顶层容器补扫，专兜 `pointer-events:none` 的加载壳）→ 逐字记账、不再盖着就还原；面板新增 `壁纸:` 一行 + `__DSHUI__.wallpaper()` API（v0.6.4） | 完成（v0.6.4） |
| 31 | 需求：还是会白闪一下 | 病治好了但**修得太晚**：抢修排在 250ms 去抖里 → 先白 0~250ms 再回来。改成 `MutationObserver` 回调里（**微任务 = 绘制之前**）同步做轻量抢修：图层体检 / 顶层新盖子 / 链形状变化 → 一帧都看不到白；并新增 `最近抢修延迟 Xms` 诊断（v0.6.5） | 完成（v0.6.5），用户已确认"不闪了" |
| 32 | 需求：一次完成 B+C 吧，时间成本不限（B = 动效底座+帧探针，C = 重载插件+图片瘦身+diag 多窗口读数） | ① 动效公共底座（总开关默认关 + `prefers-reduced-motion` + 失焦暂停）；② rAF 帧时间探针（只在有动画时采样，`motion{fps,P95,掉帧,长帧}` 进面板/status/diag，host history 带摘要）；③ 独立插件 `dsh-reload-ui` v0.1.0（`Ctrl+Shift+Alt+R` 重载界面）；④ 包内兜底图换 WebP（3.8 MB → ~1.0 MB）；⑤ 现有三个动画系统全部接入探针记账（v0.7.0） | 完成（v0.7.0），自测全绿，等实机验收 |
| 33 | 需求：上传项目到 GitHub（使用当前浏览器登录的账号）→ 改名「DSH界面美化」并给出英文名 → 复盘后：清掉全部 B 类小项，动效暂不做 | ① 上 GitHub：私有仓库 `Rad-Weed/DSH-UI-Beautify`，17 个文件（`dist/` `.rollback/` `*.zip` 由 `.gitignore` 排除）；② 改名**只动展示层**（仓库名/描述/主题 + README·HANDOFF 标题 + `package.json` 描述），包名与运行时标识一律不变；③ 清 4 项小债：`tools/*.py` 去硬编码（并让两个体检脚本认得 WebP）、加 `.gitattributes`（`* -text` 保字节一致）、加 MIT `LICENSE`（署 Rad-Weed）、重出 0.7.0 包让新名字进 zip + 建 Release | 完成（2026-10-17）|

### 2.3 已被明确否决 / 已移除的设计（**不要重新引入**）

| 已移除 | 原因 |
|---|---|
| 改页面元素的 `position` / `overflow` / 尺寸（v0.1 的做法） | 会把界面搞塌 |
| 毛玻璃的 `::after` 贴图假效果 | 不是真分层，已被真 `backdrop-filter` 取代 |
| 面板上的「分层：开/关」开关 | 用户要求删；程序内常开（`__DSHUI__.setLayering` 只留作排障钩子） |
| 「正常」（`overlay`）模式按钮 | 面板只留 关闭/纹理/背景（第三按钮 v0.3.0 由「待更新」换成「背景」）；`overlay` 仅存在于内部模式表 |
| 候选图 `deepseek.png` 与 `deepseek 黑白.png` | 用户明确只要两张：`deepseek 4k.png`（按钮显示 `deepseek`）与 `deepseek 黑白无水面.png` |
| 旧的快捷键面板作为主要入口 | 换成可拖胶囊；快捷键降级为后备手段 |
| 把毛玻璃应用在 `<textarea>` 上 | 替换元素不渲染伪元素 |

### 2.4 已规划但**尚未落地**的项（后续可随时启动）

规划内容：① 把 `requestAnimationFrame` 帧时间探针接进现有诊断
（`Ctrl+Shift+Alt+I` 直接看 FPS/掉帧，没 DevTools 也能验收动画）；② 加一层"动效开关 +
`prefers-reduced-motion` + 失焦暂停"的公共底座，之后所有动画都从它走。

→ **这两件 = 待办 P0，✅ 已在 v0.7.0 完成**（2026-10-16 一次性完成 B+C）。

### 2.5 需要用户确认的未知项（代码里看不出来的）

| 未知 | 影响 |
|---|---|
| 是否把**启动默认模式**从「关闭」改成「纹理」 | 改法是 `readMode()` 兜底值 `'off'` → `'multiply'`（一行）。**未要求就不要改** |
| 当前偏好：本窗口与另一个窗口的参数不同（历史 diag 记录过两套） | 两个窗口各自存档；**不要把任何一边当成标准** |
| 「待更新」按钮将来要做什么 | 已被「背景」按钮替换；内部 `luminosity` 仅作旧存档兼容 |
| ~~气泡要不要搬成 body 级浮层（P0★3）~~ | **已闭环（0.7.1）**：实测反馈"气泡是有了，但把文字遮罩住了" → 决定**直接删掉这个选项**（纹理模式下糊壁纸与文字清晰不可兼得；气泡玻璃改走「背景」模式） |
| 动画格式（2026-10-13 时尚未确定） | **已定案：先不做**（2026-10-17 明确选择"先不做，保持默认关"）。底座与帧探针留在代码里（`motionAllowed()` / `motionBegin·End` / 探针），将来确定效果即可直接开工，结论表在 §11 P0 |

---

## 3. 能力矩阵（现状与验证方法）

| 功能 | 状态 | 代码位置 | 怎么验证 |
|---|---|---|---|
| 三个按钮 + 浓度滑块（不自动关闭） | ✅ | `renderSwitcher` / `applyMode` | 点胶囊；`__DSHUI__.status().mode` |
| 点击背景淡出 420ms → 2s 恢复 | ✅ | `triggerRestore` | 点背景；诊断面板的过渡状态 |
| 胶囊可拖 + 位置持久化 | ✅ | `PILL_ID` / `PILL_KEY` | 拖动后刷新；`localStorage['__dshui.pill']` |
| 图片切换（交叉淡化，不经过空白） | ✅ | `setImage` / `LAYER2_ID` | 面板「图片」按钮；`diag.json` 的 `switchLog`/`switchTrace` |
| 两张图的桌面优先 + 包内兜底 | ✅ | `lib/index.js` `listAvailableImages`/`resolveImageSource` | `status.json` 的 `source`/`filePath` |
| 毛玻璃（真 `backdrop-filter`）在卡片上 | ✅ | `FROST_SURFACE_CLASS` + CSS 变量 | `<body>` 的 `--dsniang-frost-*` |
| 毛玻璃在**用户自己的气泡**上 | ✅ | `isUserMessage`/`findUserBubbles`/`collectFrostTargets` | `diag.json` 的 `userBubbles[*].className` 含 `__dshui-frost-surface` |
| 毛玻璃在**问答窗口**上（v0.2.32） | ✅ | `QUESTION_FROST_SELECTOR` / `collectQuestionFrostTargets` | 打开问答卡片，它带 `__dshui-frost-surface`（跟主表面同参数） |
| 毛玻璃在**二级面板**上（鲸鱼挂件，v0.2.32；v0.2.33 起单独参数） | ✅ | `EXTRA_FROST_SELECTOR` / `collectExtraFrostTargets` | 打开鲸鱼菜单，元素带 `__dshui-frost-panel`；`frost.panels` ≥ 1 |
| 二级面板参数 = **20px / 90%**（v0.2.33 起单列；v0.2.34 白层 85→90） | ✅ | `FROST_PANEL_CLASS` / `FROST_PANEL_BLUR` / `FROST_PANEL_ALPHA` + 静态 CSS | 测试锁死样式表里的 `blur(…,20px)` 与 `alpha,0.9`；诊断 `二级面板 N 个（20px/90% · 遮罩 16→34% 渐变）` |
| 毛玻璃在**用户气泡**上（长消息也算，v0.2.37 修） | ✅ | `findUserBubbles`（结构判据）+ `state.bubbleScan` | 发一条超长消息，气泡也要带 `__dshui-frost-surface`；诊断的「气泡扫描」行 `高 0` |
| 二级窗口/遮罩**抬到壁纸之上**（v0.2.37，用户要的层级） | ✅ | `PANEL_MASK_Z` / `PANEL_LAYER_Z` + 静态 CSS | 打开鲸鱼菜单/对话框：遮罩的径向渐变直接可见、面板玻璃糊的是壁纸+UI；测试锁死两个 z-index 与"主表面不许有 z-index" |
| 二级面板白层 = **竖向渐变**（默认 97%→83%，v0.2.35）**面板上两个滑块可拖**（v0.2.36） | ✅ | `FROST_PANEL_TOP` / `FROST_PANEL_BOTTOM` + `state.frost.panelTop/panelBottom` + 静态 CSS（`background` 简写） | 打开鲸鱼菜单/对话框：顶部实、底部透出背后内容并糊开；拖动面板上的「面板白层上/下」即时变化；测试锁死 `--dsniang-frost-panel-top,-0.97`/`-bottom,0.83`、"必须用 background 简写"、以及"拖滑块 → 变量/存档/刷新读回" |
| 二级面板的**全屏变暗遮罩**：减轻 + 径向渐变（v0.2.34） | ✅ | `PANEL_MASK_SELECTOR` / `PANEL_MASK_CENTER` / `PANEL_MASK_EDGE` + 静态 CSS | 打开鲸鱼对话框看遮罩：中心 16% → 边缘 34% 径向渐变（原版实心 55%）；测试锁死每个 mask 类都带 `body.__dshui-frost` 前缀 |
| 毛玻璃在**聊天内代码块 / 附件文件卡片**上（v0.6.0；v0.6.1 修"看不见"） | ✅ | `EXTRA_CHAT_SELECTOR` / `FROST_CHAT_CLASS` / `markChatColors` / 静态 CSS 内层清底规则 | 背景模式下滚到带代码块的助手消息：卡片带 `__dshui-frost-chat`、能透出壁纸；诊断 `代码块 N 个 · 文件 M 个（玻璃已贴内层）`，`frost.chatBlocks/chatFiles` ≥ 1。⚠️ **打标正确 ≠ 看得见**：内层（`pre`/`bannerWrap`/`[data-code-block-banner]`）不透明底必须清掉，实据见 §6.y |
| 扩展表面的**安全闸**（有 fixed 后代不糊） | ✅ | `hasFixedDescendant` / `coversViewport` / `extraSurfaceSafe` | `frost.panels` 不含 `.dshwv-audiowin`（它内含 fixed 的 `.dshwv-slotlist`），但含 `.dshwv-slotlist` 自己 |
| 通透化（清掉座位遮罩，逐字节可还原） | ✅ | `frostScrimChain`/`applyFrostBackdrop`/`revertFrostBackdrop` | `frost.cleared` 含 `div.Dc7zOa_composerSeat`；关掉毛玻璃后座位背景还原 |
| 通透化：**首帧扑空不再锁死**（v0.2.32 修 0.2.31 的 bug） | ✅ | `frostChain`/`frostChainAlive`/`clearFrostChain`/`commitFrostBackdrop` | 回归测试「首帧扑空不许锁死」；`frost.clearedReady` 与 `frost.cleared` 分开记账 |
| 分层（native 分支不动布局） | ✅ | `applyLayering`/`revertLayering` | `frost.layering.native === true` |
| 一次性参数迁移（只升不降、只跑一次） | ✅ | `migrateFrostSettings` | `localStorage['__dshui.glass.v1']` |
| 诊断五入口（面板/快捷键/diag/胶囊/API） | ✅ | `diagLines`/`reportLayout` | §9 |
| 卸载与逐字还原 | ✅ | `uninstall`/`revertLayeringPart`/`revertFrostBackdrop` | `__DSHUI__.uninstall()`；回归护栏测试 |
| **动效（任何动画）** | ⛔ 未做（等用户定格式） | — | 底座已就位：动效必须从 `motionAllowed()` 走、只动 transform/opacity、默认关 |
| **帧时间 / FPS 探针** | ✅ v0.7.0 | `motionBegin`/`motionEnd`/`motionProbeStep`/`motionSummarize` | 开面板切一次模式：诊断 `动效:` 行出现 `上次 Nfps · P95 Nms`；`status().motion.animating` 只在动画期间为 true |
| **动效公共底座（总开关/reduced/失焦）** | ✅ v0.7.0 | `motionAllowed`/`watchMotionPrefs` + 面板开关 + `Ctrl+Shift+Alt+M` + `setMotion()` | 面板「动效：开/关」；`blur` → `status().motion.paused === true` |
| 静态图 WebP 瘦身 | ✅ v0.7.0（4k 1.60 MB → 0.18 MB；黑白 1.86 MB → 0.16 MB） | `BUNDLED_IMAGE_NAMES` / `assets/*.webp` / `/bg.png` 魔数 Content-Type | `status.json` 的 `filePath` 以 `.webp` 结尾、`/bg.png` 返回 `image/webp`（桌面原图仍 PNG 优先） |

---

## 4. 铁律（精确版）

> 每一条都对应一次真实翻车。**违反它们的改动应当被直接拒绝。**

1. **布局零侵入**：插件只往 `document.body` **追加**自己的节点（`position:fixed; pointer-events:none`）。
   页面已有元素的 `position`/`overflow`/`z-index`/`display`/尺寸**一个都不改**。
   - 唯一的例外是 **分层守卫分支** 与 **通透化**，两者都必须在改动前记录**原值 + `!important` 优先级**，
     并在关闭/卸载时**逐字节还原**（有回归测试逐字比对）。
   - 真实 DSH 走 **native 分支**：一行布局都不改。
2. **样式表永远静态**：`<style id="__dshui-style">` 的内容不随状态变化。图片 URL / 浓度走**内联样式**，
   毛玻璃参数走 `<body>` 上的 CSS 变量。原因：重写样式表 = 重建合成层 = 满屏白光（v0.2.24 的教训）。
3. **全屏位图不许每帧重写**：只动 `transform` / `opacity`（合成器友好），或交给"解码器自己出帧"的格式
   （动图 / 视频）。换图用**角色互换**收尾，绝不"改主层位图 + 删副层"。
4. **刚挂载的元素别指望 CSS transition**：Chromium 会抑制首帧过渡 → 用 JS 帧补间（`FADE_STEP_MS=16`）。
5. **替换元素（`textarea`/`input`/`img`）不能挂伪元素**；`backdrop-filter` 要挑真正承载内容的容器。
6. **一切外部操作包 `safe()`**：异常只记日志、绝不上抛；只有在存在 `#root` 的 DSH 页面上才动作；
   地址带 `#dsniang-off` 时即使被注入也**装死**；`uninstall()` 必须能撤销全部改动。
7. **静态资源的身份名与文件名解耦**：对外身份永远是桌面候选名（中文可以），包内文件用纯 ASCII；
   HTTP 头里的 `ETag` 必须是 ASCII（中文直接进头会让 Node 抛 `ERR_INVALID_CHAR` → 400）。
8. **每个新功能都必须自带一句能看见的诊断**（用户没有 DevTools）。没有诊断 = 没有交付。

---

## 5. 架构地图

```
default-workspace/
├── dsh-ui-beautify/
│   ├── package.json              清单；dsh.bundle.patch → cordis.patch.yml；files: lib/assets/README/cordis
│   ├── cordis.patch.yml          挂载声明（- insert:）
│   ├── lib/index.js              Host 半区（Node ESM，22,446 B）
│   ├── lib/client.js             Client 半区（经典 IIFE，非 ESM，220,654 B）
│   ├── assets/deepseek-4k.png            包内兜底图 A（1,674,455 B，4096×2304）
│   ├── assets/deepseek-bw-nowater.png    包内兜底图 B（1,947,025 B，2048×1152）
│   ├── test/host.test.mjs   19 项      test/client.test.mjs  74 项      test/fake-dom.js  桩
│   ├── tools/                开发辅助（不进 zip）：build-dist.ps1 / dump-rules.mjs / scan-asar.mjs / image-weight-check.py / motion-weight-check.py
│   ├── .rollback/            安装前的 profile 配置备份（手动卸载兜底）
│   ├── README.md             用户手册（进 zip）
│   └── HANDOFF.md            本文件（进 zip）
└── dist/                     发布包
```

### `lib/client.js` 关键常量

| 常量 | 值 | 说明 |
|---|---|---|
| `VERSION` | `0.7.0` | 与 host `PLUGIN_VERSION`、`package.json` 同步（**三处必须同时改**） |
| `LAYER_ID` / `LAYER2_ID` | `__dshui-layer` / `__dshui-layer2` | 主图层 / 交叉淡化副图层（结束时角色互换） |
| `STYLE_ID`/`DIAG_ID`/`SWITCHER_ID`/`PILL_ID` | `__dshui-style`/`-diag`/`-switcher`/`-pill` | 自己的节点都带前缀 |
| `FADE_MS` / `RESTORE_MS` / `FADE_STEP_MS` | `420` / `2000` / `16` | 淡出 / 恢复 / 补间步长 |
| `MODE_OPACITY_DEFAULTS` | `{overlay:0.3, multiply:0.49, luminosity:0.55}` | 各模式浓度起步值 |
| `FROST_BLUR_DEFAULT` / `FROST_ALPHA_DEFAULT` | `2` / `0.20` | 毛玻璃出厂默认（v0.8.2：白层更淡） |
| `FROST_ALPHA_MIN` / `FROST_ALPHA_MAX` | `0.02` / `0.85` | 「白层」滑块的**取值范围**（v0.6.2 下限 0.15→0.02；`setFrostAlpha` API 与存档校验共用） |
| `PANEL_ALPHA_MIN` | `0.1` | 「面板白层上/下」滑块的**取值范围下限**（v0.6.2 从 0.30 降下来；`frostAlphaValue()` 也用它判存档） |
| `SCRIM_STEP` / `SCRIM_MAX` | `0.01` / `0.9` | 「薄纱」滑块的步长与上限（v0.6.2 步长 0.05→0.01；下限是 0） |
| `COMPOSER_CARD_SELECTOR` | `[data-composer-card="true"]` | 输入卡片（**属性选择器，不用 hash 类名**） |
| `FROST_SURFACE_CLASS` / `FROST_CLASS` | `__dshui-frost-surface` / `__dshui-frost` | 表面类挂元素，开关类挂 `<body>` |
| `QUESTION_FROST_SELECTOR` | `[data-question-key] > section[aria-labelledby]` | DSH 问答窗口（跟主表面同参数；**不用构建哈希类名**） |
| `EXTRA_FROST_SELECTOR` | 16 个 `.dshwv-*`：`menu` `usage-card` `bubcard` `rescard` `audiowin` `snapwin` `cropwin` `gifwin` `confirmwin` `rolelist` `audiolist` `slotlist` `rgbmenu` `listbox` `tplhelp` `qedit` | **二级面板**白名单（全是鲸鱼挂件弹层；`audiowin` 会被安全闸跳过，见 §3） |
| `FROST_PANEL_CLASS` | `__dshui-frost-panel` | 二级面板专用类（与主表面分开，各一套参数） |
| `FROST_PANEL_BLUR` / `FROST_PANEL_ALPHA` | `20` / `0.9` | **二级面板的毛玻璃参数**；`ALPHA` 只是名义白层（= 下面两端的中值），实际白层是渐变 |
| `FROST_PANEL_TOP` / `FROST_PANEL_BOTTOM` | `0.94` / `0.80` | **面板白层径向渐变的两端（边缘/内部）**（出厂默认；面板上两个滑块可拖，存档在 `state.frost.panelTop/panelBottom`）；样式表兜底，可用 `--dsniang-frost-panel-top/-bottom` 覆盖。⚠️ 必须用 `background` 简写写进 CSS，否则渐变叠在实心底色上等于白做 |
| `PANEL_MASK_Z` / `PANEL_LAYER_Z` | `2147483005` / `2147483010` | **把"变暗"遮罩与二级面板抬到壁纸层（2147483000）之上**（v0.2.37，只动 z-index）；我们自己的节点在 2147483647 仍最上 |
| `PANEL_ALPHA_MIN` | `0.3` | 额外白层（气泡/面板两端）滑块下限；`frostAlphaValue()` 用它校验存档 |
| `BUBBLE_COLOR_RETENTION` | `55` | **气泡色层的固定保留 %**（v0.2.41；必须 < 100%，否则纯白层被它盖住） |
| `BUBBLE_VEIL_DEFAULT` | `100` | **纯白层不透明度**（0 = 完全透背景，100 = 完全不透背景；v0.2.41）。`<body>` 变量 `--dsniang-frost-bubble-veil`（0~1） |
| `BUBBLE_BLUR_DEFAULT` / `BUBBLE_BLUR_MAX` | `12` / `30` | **气泡专属模糊**（px，v0.2.40）：只改气泡自己的 `backdrop-filter` |
| `BUBBLE_COLOR_VAR` / `BUBBLE_MIX_VAR` / `BUBBLE_BLUR_VAR` | 三个 CSS 变量 | 颜色：自选色写 `<body>`，否则每气泡元素内联（`markBubbleColors()`，卸载逐字还原于 `state.bubbleColorBackup`）；保留 % 与模糊写 `<body>`（滑块实时改） |
| `PANEL_MASK_SELECTOR` | 8 个 `.dshwv-*-mask` | 二级面板打开时的全屏变暗遮罩（鲸鱼挂件，手写类名） |
| `PANEL_MASK_CENTER` / `PANEL_MASK_EDGE` | `0.16` / `0.34` | **遮罩径向渐变的中心/边缘浓度（作者指定）**；样式表兜底，可用 `--dsniang-panel-mask-center/-edge` 覆盖 |
| `FROST_CHAT_CLASS` | `__dshui-frost-chat` | **聊天内代码块/附件文件卡片专用类**（v0.6.0，背景模式专属）；颜色走内联 `--dsniang-chat-color` |
| `EXTRA_CHAT_SELECTOR` | `[data-code-wrap],.md-code-block,[data-presented-file]` | 代码块 + 文件卡片钩子（v0.6.1 补 `.md-code-block` 兜底 —— `data-code-wrap` 在无工具栏代码块上**不存在**，且它的值是换行开关不是标记）。上限 200 个 |
| `FROST_MARK_SELECTOR` | `.`+surface+`,`+`.`+panel | "这里已经有玻璃了"，用来防套娃（**注意：不含 `FROST_CHAT_CLASS`** —— 代码块可以嵌在文件卡片外的普通容器里，且它们自己就是被糊对象） |
| `frostTranscript`（state） | 元素 / null | `currentTranscript()` 的缓存：自愈每遍都要找消息区，**必须走便宜路径** |
| `frostRepairs` / `backdropRepairs`（state） | `0` | 自愈计数（诊断 `自愈 N 次` / `repairs`）——用户没有 DevTools，这个数字就是"它自己修过"的证据 |
| `layerPainted`（state） | `false` | 我们确实往图层画过图；壁纸体检靠它区分"还没画"和"画过又被抹了" |
| `coverBackup` / `coverCleared` / `coverCount`（state） | `[]` / `[]` / `0` | **链外盖子**的逐字账本 + 诊断计数（0.6.4） |
| `wallpaperRepairs` / `wallpaperHealed`（state） | `0` / `[]` | 壁纸自愈次数与最近修了哪几项（`detached` / `no-image` / `transparent` / `collapsed` / `stuck-fade` / `no-url`） |
| `coverScanAt` / `bgRetryAt`（state） | `0` / `0` | 盖子扫描 1s 节流、缺图重拉 3s 节流 |
| `MOTION_KEY` | `__dshui.motion.v1` | 动效总开关存档键（0.7.0；`{enabled:bool}`） |
| `MOTION_WINDOW` / `MOTION_SUMMARY_MS` | `120` / `500` | 帧探针的样本窗口 / 汇总节流（0.7.0） |
| `state.motion` | `{enabled:false, paused:false, reduced:false, animating:false, fps, frameMsP95, dropped, longFrames}` | 动效底座 + 探针读数（0.7.0）：掉帧 = 间隔 > 2×16.67ms，长帧 = > 50ms |
| `state.motionFrames` / `motionFrame` / `motionActiveCount` | `[]` / `null` / `0` | 帧间隔滚动窗口、探针 rAF 句柄、进行中动画计数（`motionBegin`/`motionEnd` 维护） |
| `FROST_SCRIM_PROPS` | `['background-color','background-image']` | 通透化**只许动这两个** |
| `LAYER_PROPS` | `['position','left','right','bottom','top','width','zIndex']` | 分层守卫分支**只许动这七个** |
| `MODES` | `['overlay','multiply','luminosity','off']` | 对外只显示 关闭/纹理/背景（`luminosity` 仅兼容旧档，`overlay` 内部保留） |
| `HOTKEY_MODES` | `{'1':'off','2':'multiply'}` | §9 |
| `PILL_DEFAULT` | `{left:10, top:10}` | 胶囊默认位置 |
| `HASH_OFF` / `HASH_DIAG` | `#dsniang-off` / `#dsniang-diag` | 应急关闭 / 直达诊断 |

### `window.__DSHUI__` API（以代码为准）

```js
__DSHUI__.version                  // '0.7.0'
__DSHUI__.modes                    // ['overlay','multiply','luminosity','off']
__DSHUI__.status()                 // 全量状态（含 frost.* / layers / scrim / override / error）
__DSHUI__.diagnose()               // 纯文本诊断，可直接复制给人看
__DSHUI__.setMode('multiply'|'off')// 纹理 / 关闭（'luminosity' 会提示"待更新"）
__DSHUI__.setOpacity(0.49)         // 当前模式浓度 0~1
__DSHUI__.setScrim(0.25)           // 白色薄纱 0~0.9（压对比度，让字更好认；v0.6.2 起 0.01 一档）
__DSHUI__.setFrostAlpha(0.05)      // 白层 0.02~0.85（v0.6.2 下限从 0.15 降下来）
__DSHUI__.setFrostEnabled(true)    // 毛玻璃开关
__DSHUI__.setFrostBlur(2)          // 0~30 px
__DSHUI__.setLayering(true)        // 排障钩子（面板已无此开关，程序内常开）
__DSHUI__.reapply()                // v0.6.3 一键重贴：背景/玻璃/遮挡重认一遍（观察器同一段代码）
__DSHUI__.reapply() 返回值示例     // '已重贴：遮挡 2 层 / 整页 3 层（自愈计数 1 / 1）'
__DSHUI__.wallpaper()              // v0.6.4 壁纸体检：跑一遍 + 返回可读结论（谁盖着 / 修了啥）
__DSHUI__.wallpaper() 返回值示例   // '图层在 · 图 /dsh-ui-beautify/bg.png · 链外盖子 1 个：div._loading（已清） · 自愈累计 2 次'
__DSHUI__.layoutReport()           // 最近一次布局诊断
__DSHUI__.restore                  // 触发"淡出 → 恢复"（等价于点背景）
__DSHUI__.switcher()               // 开关悬浮面板
__DSHUI__.diagnostics() / .diag()  // 开关完整诊断面板
__DSHUI__.uninstall()              // 撤销全部改动（模式偏好保留）
```

### `lib/index.js`（Host）路由与导出

| 路由 | 作用 |
|---|---|
| `GET /dsh-ui-beautify/status.json` | 图片解析结果：`file`（对外身份名）/ `filePath`（实际文件）/ `source`(`desktop`\|`bundled`) / `bytes` / `url` / `images[]` |
| `GET /dsh-ui-beautify/bg.png` | 图片字节，`ETag` = 解析后完整路径的 sha1（**必须 ASCII**），命中返回 304 |
| `GET /dsh-ui-beautify/client.js?v=<ver>` | 前端脚本 |
| `GET /dsh-ui-beautify/diag?data=…` | 前端上报入口（只收，返回 204，**只留最后一次**） |
| `GET /dsh-ui-beautify/diag.json` | 读回最后一次布局诊断（内存态、不落盘） |

导出（测试用纯函数）：`PLUGIN_VERSION` `ROUTE_PREFIX` `DESKTOP_IMAGE_NAME` `DESKTOP_IMAGE_CANDIDATES`
`IMAGE_LABELS` `BUNDLED_IMAGE_NAMES` `BUNDLED_IMAGE_NAME` `bundledImagePath` `normalizeImageName`
`imageLabelFor` `resolveDesktopImagePath` `listAvailableImages` `resolveImageSource`
`resolveBackgroundBytes` `selfRejection` `DESKTOP_INJECT_ROW_TEXT`。

**两条注入通道**：桌面端 `webserver/index-inject` 的结构化行（内联 script，自己吞 `onerror`，
最坏只是美化不生效，**绝不挡应用启动**）；网页端 `ctx.webServer.tapIndex`。
路由套轻量栅栏 `selfRejection`：拒绝 `Sec-Fetch-Site: cross-site`、畸形/缺失 Host、非回环 Host + 外部 Origin。

---

### 5.x 命名与标识

| 用途 | 现名 | 旧名 | 兼容处理 |
|---|---|---|---|
| npm 包名 / profile 安装 id | `dsh-ui-beautify` | `dsh-dsniang-beautify` | 旧包需卸载后重装新包（路由不同） |
| 路由前缀 | `/dsh-ui-beautify/*` | `/dsh-dsniang/*` | 旧页面需刷新/重启后才会用新路由 |
| 全局 API | `__DSHUI__` | `__DSNIANG__` | 旧名不再提供（文档已全部改为新名） |
| localStorage 前缀 | `__dshui.*` | `__dsniang.*` | 首次加载自动复制迁移，旧键保留 |
| 自有节点 id / 类 / data | `__dshui-*` / `data-dshui-*` | `__dsniang-*` | 旧版节点只存在于旧页面，刷新即无 |
| 应急 hash | `#dshui-off` / `#dshui-diag` | `#dsniang-off` / `#dsniang-diag` | 两个都认（旧书签可用） |
| URL 参数 | `?dshui=` | `?dsniang=` | 两个都认 |
| 壁纸角色名 | 文档中描述画面时保留「DS 娘」 | 同左 | 与插件名无关 |

---
### 5.y 开屏动画（v0.8.0）

| 部件 | 位置 | 说明 |
|---|---|---|
| 源文件 | `assets/splash.html` | 用户提供的单文件开屏（莱因生命风格 v2.4），**原样保留** |
| 宿主路由 | `/dsh-ui-beautify/splash.html` | 读资产 → `injectSplashBridge()` 注入桥接 → 返回 `text/html; no-store` |
| 桥接内容 | 返回页的 `<head>` 后 | `?cfg=` JSON → `__DSH_STARTUP__`；隐藏 `#mockApp`/`#d2console`；`dsh-startup:done` → `postMessage`；异常 → `postMessage`；父页 skip 消息 → `DSH2_SPLASH_API__.skip()` |
| 客户端挂载 | `mountSplash()` | 同源 iframe + 不透明底，z-index `2147483647`；`#__dshui-splash` |
| 完成/兜底 | `finishSplash(reason)` | `done` / `skipped` / `timeout`（30s）/ `error` → 淡出 360ms → 摘节点 |
| 开关 | `__dshui.splash.v1` | 默认开；面板「开屏动画」；`?splash=0/1`；`prefers-reduced-motion` 跳过 |
| 诊断 | `diag.json` / `status()` | `开屏:` 行 + `splash` 快照 |

> 为什么用 iframe：开屏页自带全局样式（`:root`、`html/body`、`*` 重置），直接注入会污染 DSH 页面；
> iframe 天然隔离，移除即零残留。宿主只在**返回浏览器的那一份**里注入桥接，磁盘源文件保持可独立迭代。

### 5.z 重启键（v0.8.0）

| 部件 | 位置 | 说明 |
|---|---|---|
| 按钮 UI（半区 A） | `lib/client.js` `startRestartButton()` | 往 `[data-windows-menu]` 的 open shadow root 里 `[role=menubar]` append「重启」按钮；壳补丁缺失时点击给提示；面板也有入口 |
| 桥 | `window.dshDesktop.restart()` | 由 shell 补丁的 preload 暴露；主进程 IPC `dsh-desktop:restart-app` → `app.relaunch()` |
| 壳补丁工具 | `restart/shell/tools/apply-shell-patch.mjs` | `apply/status/verify/restore`；patch-spec 锚点 + BEGIN/END 标记 + 语法/内容校验 |
| 壳补丁脚本 | `restart/scripts/*.ps1` | install/uninstall/verify/restore-on-exit/common；幂等、`-DryRun`、双 SHA、独立进程等退出、日志、退出码 0/1/2/3/4 |
| 触发方式 | `restart/install-restart-key.cmd` 等 | 只在用户主动运行时才改 app.asar；DSH 运行时交给独立编排进程等退出 |

> 为什么按钮在插件里、重启在壳补丁里：Host 侧没有 `app.relaunch()` 这类 API；页面能做的只是 UI 与调用桥。
> 所以 UI 半区随插件走（零 app.asar 副作用），真重启必须由桌面壳补丁提供（按规范单独安装/还原）。

## 6. 真实 DSH 的 DOM 事实（与勘察方法）

### 6.1 实测事实（2560×1410 窗口）

| 事实 | 细节 |
|---|---|
| 真正的滚动容器 | `.Dc7zOa_scrollBody[data-conversation-scroll]`：`flex column` + `overflow-y:auto`，rect ≈ (280,91) 2278×1319，**消息和 composer 座位都装在它里面** |
| composer 座位 | `.Dc7zOa_composerSeat`：`position:sticky; bottom:0; z-index:7`，原生背景是 `linear-gradient(180deg, color-mix(...) 0px, var(--dsw-alias-bg-base) 36px)` ← **就是它把玻璃背后糊成纯色的，通透化的清理对象** |
| 输入卡片 | `[data-composer-card="true"]` = `.RlGAzG_card`（父层 `.RlGAzG_root` 透明），原生背景 `rgba(255,255,255,0.945)`，位于 1282px 高、952×98 |
| 用户气泡 | `[data-chat-flow-kind="user"]` 行 → `.cJsG2q_userRow` → `.cJsG2q_userStack` → `.cJsG2q_bubble` |
| 关键 CSS 变量 | `--dsh-composer-height: 128px`、`--dsh-conversation-viewport-height: 1319px` |
| 原生分层 | composer 就在滚动容器内 → `layering.native:true, reason:"composer-inside-scroller"`，**我们一行布局都不改** |

> ⚠️ 类名里的 hash（`Dc7zOa_` / `RlGAzG_` / `cJsG2q_`）**每次构建都可能变**：
> 代码里一律按**属性 / 结构 / 几何**判断，别把 hash 类名写进选择器。

### 6.2 怎么自己重新勘察（三种手段，按可靠性排序）

1. **请需求方粘贴页面 HTML**（配合意愿高，而且这是最完整的一手信息）。
2. **直接读 DSH 打包后的 CSS** —— 仓库里已有工具：

   ```powershell
   $node = '<DSH 安装目录>\resources\runtime\primary-runtime\dependencies\node\bin\node.exe'
   cd dsh-ui-beautify
   & $node tools\scan-asar.mjs '<DSH 安装目录>\resources\app.asar' composerSeat Dc7zOa_scrollBody data-composer-card cJsG2q_bubble
   # 在 asar 原始字节里找关键字并打印上下文（只读）→ 用来确认"应用自己的样式到底怎么写的"
   ```

3. **读运行时真值**：`http://127.0.0.1:19387/dsh-ui-beautify/diag.json`
   —— 里面有 `card`/`cardParent`/`transcript`/`transcriptParent`/`scrollCandidates[]`/`userBubbles[]`
   的**真实几何与计算样式**，以及 `layers[]`（我们的图层实况）与 `switchLog`。

> 历史坑（免得重犯）：找滚动容器时曾经加过"底边必须高于卡片"和"滚动容器不能包含卡片"两条假设
> → **两次都误杀了唯一正确的目标**（还选中过顶部一个 `top = -416836` 的 decoy 表格滚动容器）。
> 现在的判据：**明牌 `[data-conversation-scroll]` 允许包含卡片**，只有兜底候选才受底边约束。

### 6.x 用户消息气泡 = `.cJsG2q_bubble`（从 `app.asar` 里的 DSH 源码 CSS 挖出来的，2026-10-13）

DSH 客户端把 CSS 以字符串形式打包在 asar 里（`MessageItem.module.css.mjs`，源码路径
`packages\client\ui-chat\src\client\chat\MessageItem.module.css`）。原文：

```css
.cJsG2q_userRow{flex-direction:column;align-items:flex-end;gap:6px;display:flex}
.cJsG2q_userStack{min-width:0;max-width:min(calc(var(--dsh-chat-content-width,748px) * .702),82%);
  flex-direction:column;align-items:flex-end;gap:8px;display:flex}
.cJsG2q_bubble{background:var(--dsw-specific-bubble);border-radius:var(--dsw-radius-xl);max-width:100%;
  font-size:var(--dsh-content-font-size,14px);line-height:calc(22px + var(--dsh-content-font-delta,0px));
  color:var(--dsw-alias-label-primary);white-space:pre-wrap;word-break:break-word;padding:10px 16px}
```

结论（**这是"气泡"的全部定义**）：

- 气泡**自己**就是那块圆角底：`background` + `border-radius` + `padding` 全在 `.cJsG2q_bubble` 上，
  父层 `userRow` / `userStack` **不画任何背景**（它们只有 flex 布局）；
- `--dsw-specific-bubble: var(--dsw-static-deepseek-50)`（浅色主题 = 很浅的蓝；深色主题跟着换），
  **是个不透明色**；
- 所以"气泡"在视觉上 **= 这一条 background**。我们的毛玻璃用
  `background-color: rgba(白, 白层)!important` 把它换掉 → **气泡形状从此只由我们那层半透明白撑着**：
  白层 25~30% 时形状基本不可见（此前的反馈："没有气泡了"）；白层高（62~90%）时形状清楚但**颜色变成白**
  （不再是 DSH 的浅蓝）。
- 想"既保留气泡的浅蓝色调、又让它透"→ 只能**用气泡自己的颜色做低透明度底**：
  读 `getComputedStyle(el).backgroundColor`（或直接 `color-mix(in srgb, var(--dsw-specific-bubble) X%, transparent)`）
  再叠 `backdrop-filter`。**注意**：`--dsw-specific-bubble` 定义在主题作用域里，
  在气泡上能否取到要实测（取不到就用 JS 读计算值写内联变量）。
- 同名坑：DSH 里 **`-ja1rG_bubble`**（`GoalCommandInputView`，`/goal` 那个输入气泡）样式**一模一样**；
  我们的 `[class*="bubble"]` 选择器会把**两者都命中**。别把它们当成同一个东西。
- **叠层上下文（2026-10-13 挖出，v0.2.41 的"纯白层"设计受它约束）**：气泡的祖先
  `.xz4KEq_scroll{...overflow-y:auto;container-type:inline-size}` —— `container-type` 会施加
  layout/style/size 遏制 → **它就是一个叠层上下文**。因此气泡上的 `z-index` 只在滚动容器内部生效，
  **抬不到壁纸层（`z-index:2147483000`）之上**（壁纸是 body 级图层、乘混在气泡之上）。
  结论：想让"壁纸纹理不罩在气泡上"必须改壁纸的全局设计（比如把气泡也搬成 body 级浮层再抬 z-index，
  或给壁纸层挖洞 —— 都远超插件能做的范围）；v0.2.41 的"纯白层"因此只做在气泡自己的背景里。
  鲸鱼遮罩/面板能抬 z-index，是因为它们是 `position:fixed` 的 **body 级**节点（无中间叠层上下文）。
- 勘察命令（不需要 DevTools，直接扫 asar 字符串）：见 §1 的 `tools/scan-asar.mjs`，
  或按字节扫 `cJsG2q_bubble` / `dsw-specific-bubble` / `xz4KEq_scroll` 这些关键字。

### 6.y 代码块 = `.md-code-block` / `[data-code-wrap]`（2026-10-16，v0.6.1"看不见玻璃"的实据）

用户保存的实时 DOM 快照（`<快照目录>\ds.html`，1,712,608 B，直接 `grep`
就能查）+ asar 里的 `CodeBlock.module.css`（源码路径
`packages\client\ui-primitives\src\client\markdown\CodeBlock.module.css`，
打包产物在 `@deepseek-ai/dsh-client-ui-primitives` 里）。**代码块是"套娃"结构**：

```html
<div class="block md-code-block card" data-code-wrap="true">        <!-- 圆角卡片；玻璃贴这一层 -->
  <div class="bannerWrap"  style="position:sticky;z-index:6">        <!-- 外壳：不透明底 + sticky -->
    <div class="header" data-code-block-banner>                      <!-- 语言名/复制按钮条 -->
  <div data-code-block-content style="display:contents">             <!-- display:contents = 不参与布局 -->
    <pre class="shiki" style="background:var(--dsl-code-block-background)!important">
```

asar 里 `CodeBlock.module.css` 的原文（**逐字**，2026-10-16 从 `app.asar` 按字节挖出；
哈希版在 `@deepseek-ai/dsh-client-ui-primitives`，未哈希源码在
`packages/client/ui-primitives/src/client/markdown/CodeBlock.module.css`）：

```css
.block { --dsl-code-block-background: var(--dsw-alias-markdown-code-block);
         position: relative; margin: 16px 0; color: var(--dsw-alias-label-primary);
         background: var(--dsl-code-block-background);          /* ← ① 卡片底（我们的玻璃层） */
         border-radius: var(--dsl-code-block-border-radius); }
.bannerWrap { position: sticky; top: 0; z-index: 6;
              background-color: var(--dsw-alias-bg-base);       /* ← ② sticky 外壳底 */
              border-top-{left,right}-radius: var(--dsl-code-block-border-radius); }
.banner { background: var(--dsl-code-block-banner-background-color); /* ← ③ 标题条底 */
          padding: 9px 14px; display: flex; justify-content: space-between; align-items: center; }
.content { display: contents; }
.block :where(pre) { padding: 16px; margin: 0 !important; overflow-x: auto;
                     white-space: pre-wrap; word-break: break-all;
                     background: var(--dsl-code-block-background);  /* ← ④ pre 底（"otherwise squares off the wrapper"） */
                     border-bottom-{left,right}-radius: var(--dsl-code-block-border-radius); }
.block :where(pre.shiki) { background: var(--dsl-code-block-background) !important; } /* ← ⑤ shiki 内联主题底 */
.block :where(pre) code { background: none; }
.card :where(pre) { padding: 6px 22px 20px; word-break: normal; overflow-wrap: anywhere; }
.card[data-code-wrap='false'] :where(pre) { white-space: pre; overflow-wrap: normal; }
```

→ **结论：一层玻璃 + 四层不透明底**（①②③④⑤）。我们的规则两两对上：
`.chat{background-color:…!important}` 压 ①；`.chat :where(pre,[data-code-block-content]){background:transparent!important}`
压 ④⑤（`:where()` 特异性 0 → 我们 `.chat` 那层 (0,2,1) 稳赢 shiki 的 `!important`）；
`.chat :has(> [data-code-block-banner]){background:transparent!important}` 压 ②（用**后代**组合子：只匹配"直接包着标题条的容器"，将来 DSH 中间插一层包装也不会失配）；
`.chat [data-code-block-banner]{…同一套玻璃配方…}` 压 ③。
**注意踩坑顺序**：`.block` 用 `background` 简写、`pre` 只给 `background`（无 `!important`），
而 `.bannerWrap` 给的是 `background-color` —— 清底统一用 `background:transparent!important` 最省事。

关键事实（都实测过）：

- **`data-code-wrap` 的值是"自动换行开关"**（`"true"` / `"false"`），**不是"这是个代码块"的标记**；
  而且**没有工具栏时这个属性根本不出现** → 必须补 `.md-code-block` 兜底钩子。
- 最外层 `.block.md-code-block.card`：`background: var(--dsl-code-block-background)`（= `--dsw-alias-markdown-code-block`）、
  `border-radius: var(--dsl-code-block-border-radius)`、`position: relative`、`margin: 16px 0`。
  **不是 `overflow:hidden`** —— 圆角是靠 `pre` 自己的 `border-bottom-*-radius` 做出来的
  （源码注释原文："`overflow:hidden` on `.block` would kill the sticky banner"）。
- **内层三层各自又刷了一层不透明底**：`pre`（`--dsl-code-block-background`）、
  `[data-code-block-banner]`（`--dsl-code-block-background` / `--dsw-alias-markdown-code-block`）、
  `.bannerWrap`（`--dsw-alias-bg-base`）。→ **给外层贴玻璃 = 白贴**，视觉上"完全没效果"，
  这就是 v0.6.0 被用户退回的原因（打标是对的，是绘制层被盖住）。
- `pre.shiki` 的底来自**样式表里的 `!important` 规则**（`.block :where(pre.shiki){background:
  var(--dsl-code-block-background)!important}`；源码注释："Shiki inlines its theme background var;
  route it to the repo token"）→ 我们要压它只能靠 `!important` + **更高特异性**：
  `:where()` 贡献 0，所以 `body.__dshui-frost .__dshui-frost-chat :where(pre,…)` = (0,2,1)
  稳赢 `.block :where(pre.shiki)` = (0,1,0)。**实测能赢**。
- `.bannerWrap` 是 `position: sticky; top: 0; z-index: 6`：它**浮在代码上方**。全透明会让
  滚动的代码和语言名叠字 → 让**标题条复用卡片那套玻璃配方**（同色 + 同一个透明度/模糊变量）：
  两层半透明嵌套叠加 ≈ 80% 实（够清楚），而它自己的 `backdrop-filter` 会把滑过它下面的代码
  糊开（不叠字）。**别写死 80%/6px 这种魔法数**。
- `[data-code-block-content]` 是 `display: contents`：**别给它加背景/滤镜**（它不生成盒子，
  加了也不会按预期方式生效），只用来"清底"。
- 附件文件卡片 `[data-presented-file]`：**没有**这层套娃，直接糊它自己就行。
- DSH 自己的弹窗（`role="dialog"`，如"重命名会话"）里也会渲染代码块 → 收集顺序必须是
  **先给面板打标、再收代码块**，否则 `extraSurfaceSafe()` 的"祖先已糊就别套娃"闸门在收集
  时看不到面板，会贴两层 `backdrop-filter`（两层互相读不到底图 → 死白发灰）。

---

## 7. 分层与通透化的精确语义

> 这是全项目最容易写错的部分。**"我们从不改布局"这句话不完全准确** —— 准确说法是：
> 真实 DSH 走 native 分支不改；其他布局形状有一条**守卫分支**会改，但必须逐字节可还原。看代码前先读这节。

### 7.1 分层 `applyLayering(on)`（`lib/client.js` ≈ L946）

1. 找卡片 → 找消息区 scroller → `holder = transcript.parentElement`；认不出就**返回 false，只做毛玻璃**。
2. **情况 A（真实 DSH）**：`transcript.contains(card)` 为真（输入区在滚动区内）
   → `layeringInfo = {native:true, reason:'composer-inside-scroller', changed:false}`，
   **一行布局都不动**，直接判定"分层到位"。
3. **情况 B（兄弟式布局）**：`overlay` = 「`holder` 的直接子元素中包含卡片的那一层」（向上找 ≤8 层）。
   - `pad = clamp(overlay 高度 + 24, ≤320)`；`existingPad` 读消息区**计算样式**的 `padding-bottom`；
     `addPad = max(0, pad − existingPad)`（**只补差额**）。
   - `needsPosition` = overlay 计算 `position` 是 `static` 且没有内联 `position`（**应用自带定位就一概不碰**）。
   - 改动前备份：`holder.position`(+优先级)、`overlay` 的 `LAYER_PROPS` 七个属性(+优先级)、
     `transcript.padding-bottom`(+优先级)。
   - 只有 `needsPosition` 时才写 `holder {position:relative}`（仅当它没有内联 position）
     + `overlay {position:absolute; left/right/bottom:0; top:auto; width:auto}`；
     只有 `addPad > 0` 才写 `padding-bottom`。
   - **一行都没改**（应用自带分层且留白够）→ **不记 backup**，但依然算"到位"（切关闭时无需还原 = 零风险）。
4. `revertLayeringPart(backup)` 逐条还原（含优先级）；`revertLayering()` 用于关闭/卸载。

### 7.2 通透化（`applyFrostBackdrop` / `revertFrostBackdrop`）
- **目的**：让 `backdrop-filter` 背后真的有内容（否则糊的是纯色，视觉上等于没开）。
- **动作**：沿「卡片 → 消息区」的祖先链（`frostScrimChain`：从 `card.parentElement` 向上，
  直到 `transcript` / `body` / 任何**包含 transcript 的祖先**为止），把**画了背景**的那几层
  的 `background-color` 置 `transparent`、`background-image` 置 `none`（带 `!important` 压过应用的类规则）。
- **边界**：消息区自己不动；走到"同时包含消息区的祖先"就停（绝不会把界面清漏底）；
  本来就透明时**一个字节都不写**；找不到消息区时 1.5s 节流重试（`frostBackdropMissAt`）。
- **还原**：每条记录 `{元素, 属性, 原值, 原优先级}` 存进 `state.frostBackup`，关闭/卸载时逐字写回。
- **两笔账分开记（v0.2.32）**：`state.frostChain`=「认出来过的那条链」，`state.frostBackup`=「真的清了哪些层」。
  **空链不许留 backup**（0.2.31 线上症状：空 `entries: []` 被当成"已经处理完"，座位后来上了底色也清不到）；
  `frostClearedReady` 单独记账，"认出来了但这一轮没遮挡"不再等于"以后也不用管"。
- **自愈（v0.6.3，重要）**：`applyFrostBackdrop()` / `applyBackdropScrim()` 现在**每次都重新认链**，
  用 `sameChain()` 和上次那条比形状：
  - **形状一样** → 幂等重清（只有"又被画上底"的层产生新账；`clearFrostChain(chain, previous)`
    会沿用**最初**记下的原值，绝不把我们自己的 `transparent` 记成原值）；
  - **形状变了**（切对话时 React 换掉中间那几层）→ 先把旧账逐字还回去，再按新链清一遍；
  - 调用方（观察器 `repairPass()` / `reapply()`）**不再用"有没有备份"当重跑条件** ——
    那正是 0.6.3 修的那个 bug（账本还在、指针已失效 → 永不重跑 → 新节点盖住壁纸）。
  - **成本纪律**：这条路径每 250ms 会跑一次，所以找消息区必须走
    `currentTranscript()`（明牌 `[data-conversation-scroll]` → 缓存 → 才轮到贵的
    `findTranscriptScroller()` 全文档打分），**别在这里直接调 `findTranscriptScroller`**。
  - 认不出滚动容器时的**退路**：`pageScrimChain()` 直接拿 `#root` 当锚点（首屏/hero/加载态）。
- **诊断**：`frost.cleared`（清了哪些层，按 `标签.类名` 记）、`frost.clearedReady`、
  `frost.repairs` / `backdrop.repairs`（自愈次数）。

### 7.3 壁纸体检与「链外盖子」（v0.6.4）

**症状分诊（先看这一节再动手）**：用户说"背景没了"时，**先分清是"被盖住"还是"图层不画了"** ——
两种病因、两套治法，混起来会白改一版（0.6.3 就是这么来的）：

| 现场读数 | 结论 | 治法 |
|---|---|---|
| `壁纸: 图层在 · 没有链外盖子`，但屏幕上没图 | 祖先链上被新节点盖住 | `applyFrostBackdrop` / `applyBackdropScrim`（重认链 + 比形状，0.6.3） |
| `壁纸: … 链外盖子 N 个：<元素>（已清）` | **链外**全屏不透明层压着 | `healWallpaperCovers`（0.6.4） |
| `壁纸: 图层缺（已补） · 本次修了 detached` | 图层节点被摘掉 | `healWallpaperLayer`（0.6.4） |
| `本次修了 no-image / transparent / collapsed / stuck-fade` | 图层还在但不画了 | 同上（重画图 / 摘掉卡死的 `is-faded`） |
| `本次修了 no-url` | 图地址丢了 | 3s 节流重拉一次 `/dsh-ui-beautify/status.json` |

- **`layerHealth()`**：只在"该显示壁纸"的模式（`multiply` / `backdrop`）且**画过一次之后**才报
  （`state.layerPainted`）—— 否则挂载首帧那一下会被当成异常，白白自愈一次。
- **`scanWallpaperCovers()`**：两路来源
  1. `document.elementsFromPoint()` 在**四个采样点**（0.5/0.3、0.5/0.7、0.1/0.5、0.9/0.5 视口）命中测试：
     壁纸在最底（`z-index:-1` + `pointer-events:none`，所以不会出现在结果里），
     **任何**命中到的"画了背景 + 几乎铺满视口（`coversViewport`）+ 不透明（alpha ≥ 0.85）"的元素就是盖子；
  2. **顶层容器补扫**（`body` / `#root` 的直接子元素）：真实命中测试会**跳过
     `pointer-events:none`** 的元素及其子树，而"新会话加载壳"经常就是这么写的。
- **绝不误清**：`role="dialog"` / `role="menu"`（含最多 6 层祖先）打开时，那层全屏变暗遮罩是
  **有意为之**（用户 0.2.34 要的就是它），`insideModalLayer()` 直接跳过。
- **还原纪律**：`state.coverBackup` 逐字记账（原值 + 优先级）；**这次没扫到**的旧账立刻还回去
  （元素没了 / 不再盖了 / 弹窗关掉），离开背景模式与卸载时全部还原 —— 与 `frostBackup` 同款纪律。
- **成本**：体检 = 几个属性读取（跟着 250ms 那遍走）；盖子扫描节流 1s，**账本非空时不节流**
  （要尽快发现"不再盖着"并还原）；`reapply()` 传 `force` 绕过节流。
- **诊断出口**：面板一行 `壁纸: …`、`diag.json` / `status()` 的 `wallpaper{text,painted,issues,repairs,covers,coverCount,lagMs}`、
  以及公开 API `__DSHUI__.wallpaper()`（跑一遍并返回可读结论）。
- **延迟纪律（v0.6.5，别退回旧写法）**：修得**对**还不够，还得修得**早** ——
  排在 250ms 去抖里的修复 = 用户看得见的白闪（「还是会白闪一下」）。所以：
  | 层次 | 时机 | 允许做的事 |
  |---|---|---|
  | `instantGuard(records)` | `MutationObserver` 回调内（**微任务，绘制之前**） | 图层体检、顶层盖子扫描、**链形状对比**（都只查"变没变"，不读计算样式） |
  | `repairPass()` | 250ms 去抖后 | 全量打标、分层守卫、幂等重清、"座位后来长了底色"这类**非形状**变化 |
  - 判定"要不要抢修"必须**便宜**：`chainShapeChanged()` 只比元素身份/顺序；
    真正读计算样式的 `clearFrostChain` 留给去抖那一遍。
  - `wallpaper.lagMs`（面板上是 `最近抢修延迟 Xms`）就是这条纪律的**量尺**：
    个位数毫秒 = 抢在渲染前；≥100ms = 又退回"等去抖"了，必须查。

### 7.4 动效公共底座与帧时间探针（P0，v0.7.0）

**语义边界（写动效前必读）**：

- **总开关只约束"装饰性动效"**（将来的推近/光带/粒子……）：一律先过 `motionAllowed()`
  （= enabled && !reduced && !paused），**不许各自 `setInterval` / 裸 rAF**。
  现有的**核心过渡**（模式切换淡入淡出、毛玻璃补间）不是装饰，
  **不受开关约束** —— 它们只通过 `motionBegin()`/`motionEnd()` 给探针记账。
- **记账路径必须成对**：`tweenFrostVars` / `tweenLayerOpacity` / `ensureFloatLoop` 的
  开始处 `motionBegin()`，完成处与**取消处**（`cancelFrostTween` / `cancelLayerTween` /
  `stopFloatLoop`）都要 `motionEnd()` —— 漏一处，计数泄漏 → 探针永远空转。
- **探针生命周期**：计数 0→1 时 `startMotionProbe()`（rAF 循环），归零 `stopMotionProbe()`。
  **停采样时做一次收尾汇总**：短于 500ms 汇总节流的动画（420ms 的淡入淡出就是）等不到
  节流汇总 —— 不收尾的话 fps/P95 永远是 0（0.7.0 当场踩过）。样本 <2 时**保留上一轮读数**。
- **时钟**：`motionNow()` 优先 `performance.now()`（单调）。fake-dom 的 `performance.now`
  跟着 `advance()` 的桩时钟走 → 测试里 `advance(16)` × N 帧 = 精确 16ms/帧，可断言 fps。
- **读数出口**：`diagLines()` 的 `动效:` 行、`reportLayout().motion`、`status().motion`、
  宿主的 `diagHistory[].motion` 摘要。掉帧 = 帧间隔 > 2×16.67ms；长帧 = > 50ms；
  fps/P95 = 最近 120 个样本的均值 / P95（`motionSummarize`）。
- **暂停条件**（`watchMotionPrefs`，只装一次）：`matchMedia('(prefers-reduced-motion: reduce)')`
  + change 监听；`window` blur/focus；`document` `visibilitychange`（`document.hidden`）。

**动效开工时的铁律**（与 §12 联动）：只动 `transform`/`opacity`（铁律 3：全屏位图不许每帧重写，
要动就交解码器出帧）；样式表永远静态；新挂载元素的淡入必须 JS 逐帧补间（Chromium 抑制首帧过渡）；
每个新动效自带诊断 + 默认关 + 失焦暂停；动态 WebP 参数：宽 ≤1920、8–12fps、≤1MB。

---

## 8. 参数、默认值与 URL 覆盖

| 项目 | 出厂默认 | localStorage 键 |
|---|---|---|
| 启动模式 | **关闭**（`readMode()` 兜底 `'off'`） | `__dshui.mode` |
| 各模式浓度 | `overlay 0.3` / **`multiply 0.49`** / `luminosity 0.55` | `__dshui.opacities` |
| 背景图 | `deepseek 4k.png`（面板显示 `deepseek`） | `__dshui.image` |
| 毛玻璃 | 开 / 模糊 **2px** / 白层 **25%**（滑块范围 **0.02~0.85**，v0.6.2 起下限从 0.15 降下来） | `__dshui.frost.v3` |
| 二级面板边缘/内部白层 | `0.94` / `0.80`（面板滑块可调，**0.10~1.00**，v0.6.2 起下限从 0.30 降下来） | `__dshui.frost.v3`（`panelTop` / `panelBottom`） |
| 薄纱（背景模式） | 强度 **0**（滑块范围 **0~0.9，0.01 一档**；v0.6.2 起步长从 0.05 降下来） | `__dshui.scrim` |
| 胶囊位置 | `{left:10, top:10}` | `__dshui.pill` |
| 一次性迁移标记 | — | `__dshui.glass.v1` |

- **迁移规则**：只有**低于**出厂默认的旧值会被提上来，且**只升不降、只跑一次**（v0.2.30 之前
  玻璃背后被遮罩挡着，很多存档里躺着"等于没开"的值）。
  ⚠️ **别把它和"取值范围下限"搞混**（v0.6.2 的坑）：`白层 0.04` 这种低值本身是**合法**的，
  但全新 profile 的首次迁移会把它当"低于出厂默认的旧档"提到 0.25。测试要测"低值原样读回"时，
  必须先把迁移标记 `__dshui.glass.v1` 写上（模拟老用户），否则测到的是迁移而不是校验。
- **URL 覆盖**（网页端）：`?dsniang=multiply|off|<0~1 数字>`、`?scrim=0.25`、`?img=<名>`；
  命中后 `state.override = true`（本轮内覆盖存档，不落盘）。
- **图片白名单**：只有 `deepseek 4k.png`（label `deepseek`）与 `deepseek 黑白无水面.png` 两张候选，
  每张都是「桌面优先 → 包内兜底」，**身份名始终是桌面候选名**。
- **浓度与可读性的实测边界**（真图逐像素算过）：`multiply` 浓度 ≤0.4 时文字零损失；
  0.5 时中央剪影区 **41.4%** 文字不可读（"悬崖"）。出厂 0.49 = 作者口味，白底正文仍清晰。

---

## 9. 诊断与验收手册

### 9.1 验收方式（通常会怎么试）

1. 点胶囊看面板；拖滑块看实时变化；点背景看淡出/恢复；用面板换图。
2. 若反馈"感觉没区别" → 要能立刻给出**可见证据**（面板数字、诊断行、`frost.cleared`）。
3. 关掉再开、刷新、重启，看参数有没有记住。

### 9.2 诊断手段

| 入口 | 用法 |
|---|---|
| 快捷键 | `Ctrl+Shift+Alt+1` 关闭 ｜ `+2` 纹理 ｜ `+D` 面板 ｜ `+I` 完整诊断 |
| 地址 | 末尾加 `#dsniang-diag` 刷新；应急关掉 `#dsniang-off` |
| HTTP | `/dsh-ui-beautify/status.json`（图从哪来）、`/dsh-ui-beautify/diag.json`（布局/毛玻璃/切换轨迹） |
| API | `__DSHUI__.status()` / `.diagnose()` / `.layoutReport()` |
| 离线 | `node test/host.test.mjs && node test/client.test.mjs` |

关键字段：`frost.targets`（**主**表面数量 = 卡片 + 用户气泡）、`frost.bubbleScan`（**气泡扫描统计**：
候选/收下/因宽·高·容器·输入·非我 各跳过多少 —— v0.2.37 起，专治"气泡被静默丢掉"）、
`frost.extra`（**扩展**表面数量 =
问答窗口 + 二级面板 + 聊天内高亮块）、`frost.chatExtras` / `frost.chatBlocks` / `frost.chatFiles`
（**聊天内的代码块 / 附件文件卡片**各几个，仅背景模式；v0.6.0 起，v0.6.1 拆成三个数 ——
诊断文案是 `代码块 N 个 · 文件 M 个（玻璃已贴内层）`。
**排障关键**：如果这里是非 0、屏幕上却"看不见玻璃"，那问题一定在**绘制层**（内层不透明底把玻璃盖住），
不在打标上 —— v0.6.0 → v0.6.1 踩的就是这个）、`frost.panels`（**二级面板**数量，v0.2.33 起）、
`frost.panelBlur` / `frost.panelAlpha`（二级面板那套固定参数 = 20 / 0.9 名义白层）、
`frost.panelAlphaTop` / `frost.panelAlphaBottom`（白层径向渐变两端，默认 0.94 / 0.80；面板滑块可改，v0.2.36 起）、
`frost.panelMaskCenter` / `frost.panelMaskEdge`（遮罩径向渐变的中心/边缘 = 0.16 / 0.34，v0.2.34 起）、
`frost.bubbleVeil`（气泡下那层**纯白层**的不透明度 0~100，默认 100，v0.2.41 起；
v0.2.39/0.2.40 的 `bubbleMix` / `bubbleTransparency` 已废弃、读档忽略）、
`frost.bubbleBlur`（气泡专属模糊 px，默认 12）、
`frost.bubbleColor`（自选色 `#rrggbb` 或 `''` = 跟随原色）—— 三者都是 v0.2.40 起
（v0.2.39 的 `bubbleMix` 已废弃，读档时自动换算成透明度）、
`frost.cleared`（应含 `div.Dc7zOa_composerSeat`）、
`frost.clearedReady`（**true = 处理过那条链**，与"清了几层"解耦：为 true 而 `cleared` 为空
表示"认出来了、这一轮没遮挡"；为 false 表示压根没认出消息区）、`frost.layering.native`、
`backdrop.cleared` / `backdrop.chain[]`（背景模式：清了哪几层、页链每层画没画底色）、
`backdrop.repairs` 与 `frost.repairs`（**v0.6.3 自愈计数**：切对话/换节点后重新清过几次 ——
报"背景失效"时先读这两个数：**涨了**说明自愈在工作、**不涨**说明压根没认出链）、
`wallpaper{text,painted,issues,repairs,covers,coverCount,lagMs}`（**v0.6.4 壁纸体检**：
`issues` = 最近修了哪几项、`covers` = 清掉的链外盖子点名、`repairs` = 自愈累计；
**"整张壁纸消失"先读这一段**，见 §7.3 的分诊表）、
`motion{enabled,paused,reduced,animating,fps,frameMsP95,dropped,longFrames}`（**v0.7.0 帧探针**：
面板上是 `动效:` 行；`history[].motion{fps,frameMsP95,animating}` 是多窗口下读各自帧率的通道）、
`switchLog`（阶段时间线）、
`switchTrace`（16ms 一帧的实况）、`layers[]`（我们的图层是否在场、混合模式、浓度）。

> ⚠️ **多窗口陷阱**：`diag.json` 只保留**最后一次**上报。开着两个 DSH 窗口时读到的是另一个窗口的参数，
> 别拿它当用户当前口味；要真值就看 `<body>` 上的 `--dsniang-frost-*` 与图层内联 `opacity`。

---

## 10. 打包与发布（实测配方）

**包内清单（11 条，顶层目录 `dsh-ui-beautify/`，全部正斜杠）**：
`package.json`、`cordis.patch.yml`、`README.md`、`HANDOFF.md`、
`lib/client.js`、`lib/index.js`、`assets/deepseek-4k.png`、`assets/deepseek-bw-nowater.png`、
`test/host.test.mjs`、`test/client.test.mjs`、`test/fake-dom.js`。
（`tools/`、`.rollback/` **不进包**；`test/` 进包是为了让收包的人能自己跑一遍自检。）

> `package.json` 的 `files` 只有 `lib`/`assets`/`cordis.patch.yml`/`README.md` ——
> 用 `installBundle` 安装时 **pnpm 只拷 `files` 里的东西**，所以 `HANDOFF.md` 与 `test/`
> 只存在于"解压出来的目录"，不会进 `node_modules`。这是有意的（装进 profile 的载荷要小）。

### 配方（已脚本化：`tools/build-dist.ps1`，**任何 cwd 下都能跑**）

```powershell
# 出包（自检 3 处版本号一致 → 手写 12 条目 → 打印条目/字节/SHA256）
powershell -ExecutionPolicy Bypass -File <plugin>\tools\build-dist.ps1
# 解压复测（必做，脚本见下面"出包后必做"）
node <plugin>\tools\dump-rules.mjs <解压出的插件目录>   # 把"渲染出来的静态表"打出来：规则真进去了吗
```

> ⚠️ **2026-10-16 踩过的坑（已修）**：老脚本用 `Set-Location $workspace` + 相对路径。
> **PowerShell 的 `Set-Location` 不会改 .NET 的进程工作目录**，而 `[System.IO.File]::ReadAllText`
> 走的是进程工作目录 → 从插件目录里启动脚本时它会去找
> `…\dsh-ui-beautify\dsh-ui-beautify\package.json` 然后报"找不到路径"。
> 现在脚本内部**全部用绝对路径**（并且顺手设了 `[Environment]::CurrentDirectory`）。

下面的等价手写配方留作参考（老版本，路径基于 `default-workspace`）：

```powershell
$plugin  = 'dsh-ui-beautify'
# 版本号用 .NET 读（默认 UTF-8）。⚠️ 本机 PowerShell 下 `Get-Content -Raw | ConvertFrom-Json`
# 会按 GBK 解码中文 → 读成乱码 → ConvertFrom-Json 直接报错（已实测踩过）
$pkgRaw  = [System.IO.File]::ReadAllText((Resolve-Path "$plugin\package.json"))
$version = [regex]::Match($pkgRaw, '"version"\s*:\s*"([^"]+)"').Groups[1].Value
$out     = "dist\$plugin-$version.zip"
New-Item -ItemType Directory -Force 'dist' | Out-Null
Add-Type -AssemblyName System.IO.Compression.FileSystem

# 1) 版本号三处一致，否则拒绝出包
$vClient = (Select-String -Path "$plugin\lib\client.js" -Pattern "VERSION = '([^']+)'").Matches[0].Groups[1].Value
$vHost   = (Select-String -Path "$plugin\lib\index.js" -Pattern "PLUGIN_VERSION = '([^']+)'").Matches[0].Groups[1].Value
if ($vClient -ne $version -or $vHost -ne $version) { throw "版本号不一致: pkg=$version / client=$vClient / host=$vHost" }

$entries = @(
  'package.json','cordis.patch.yml','README.md','HANDOFF.md',
  'lib/client.js','lib/index.js',
  'assets/deepseek-4k.png','assets/deepseek-bw-nowater.png',
  'test/host.test.mjs','test/client.test.mjs','test/fake-dom.js'
)

# 2) 手写条目 —— 不要用 Compress-Archive / CreateFromDirectory（根目录会多一层、分隔符会变反斜杠）
if (Test-Path $out) { Remove-Item $out -Force }
$zip = [System.IO.Compression.ZipFile]::Open($out, 'Create')
try {
  foreach ($rel in $entries) {
    $src = Join-Path $plugin ($rel -replace '/', '\')
    if (-not (Test-Path $src)) { throw "缺少文件: $rel" }
    [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, (Resolve-Path $src), "$plugin/$rel", 'Optimal')
  }
} finally { $zip.Dispose() }

# 3) 自检：条目名必须是"顶层目录 + 正斜杠"
$z = [System.IO.Compression.ZipFile]::OpenRead((Resolve-Path $out))
try {
  $z.Entries | ForEach-Object { '{0,9}  {1}' -f $_.Length, $_.FullName }
  $bad = $z.Entries | Where-Object { $_.FullName -like '*\*' -or $_.FullName -notlike "$plugin/*" }
  if ($bad) { throw "条目名异常: $($bad.FullName -join ', ')" }
  "entries: $($z.Entries.Count)"
} finally { $z.Dispose() }
Get-FileHash $out -Algorithm SHA256 | ForEach-Object { "SHA256: $($_.Hash)" }
```

### 出包后必做：解压复测

```powershell
$tmp  = Join-Path $env:TEMP ("dsniang-verify-" + [guid]::NewGuid().ToString('N'))
$node = '<DSH 安装目录>\resources\runtime\primary-runtime\dependencies\node\bin\node.exe'
Expand-Archive $out -DestinationPath $tmp
Push-Location (Join-Path $tmp $plugin)
& $node test/host.test.mjs      # 期望 19 pass
& $node test/client.test.mjs    # 期望 76 pass
Pop-Location
Remove-Item $tmp -Recurse -Force
```

### 版本与发布纪律

- **改代码 → 必须 bump 版本号（三处同步）**，否则页面吃旧缓存。
- **只改文档 → 不 bump**（别扰动运行中的页面）；但此时 zip 会与仓库文档不一致，**重打包即可对齐**。
- **不要在包内的任何文件里写这个 zip 自己的 SHA256**（自引用陷阱）。哈希现场用 `Get-FileHash` 读，
  写进会话汇报即可。
- 安装/卸载三条路见 README；`.rollback/` 是手动兜底。

---

## 11. 待办（P0 是用户已经在等的东西）

### P0★2 · 用户信息气泡：长消息没玻璃 —— **✅ 已修复（v0.2.37）并已验收（v0.2.39「现在视觉效果不错」）**

**结论（就是下面那条嫌疑，已确认并修掉）**：`findUserBubbles()` 的 `rect.height > 400`
绝对高度上限把几千 px 高的长气泡静默丢掉。修法见 §0 的 v0.2.37 条目 1；回归测试
「毛玻璃：长消息气泡也要糊」用一条 3000px 高的气泡把它钉住（旧版必红）。

反馈：用户信息气泡长消息有玻璃、短消息没有，
而且这个的毛玻璃效果也没生效。（按上下文最自然的读法：**长的那条出问题 = 毛玻璃没生效，
短的那条没问题**。）

**嫌疑根因（代码级，明天先验证再改）**：`lib/client.js` 的 `findUserBubbles()`（L707）
有两条保守过滤：

```js
if (rect.width > vw * 0.8) continue   // L720 整行容器，不是气泡
if (rect.height > 400) continue       // L721 整块消息区（← 嫌疑最大的那条）
```

- 长消息的气泡**很容易超过 400px 高** → 被 L721 整个丢掉 → 永远拿不到
  `__dshui-frost-surface` → **"长消息没有毛玻璃"**；
- 短消息高度小 → 正常打标 → 所以会出现"短的信息（没问题）"；
- 这**完全对得上**"长有、短没有"的观察，而且解释了"毛玻璃没生效"。

**为什么当初有这条**：怕把"整块消息区/整行容器"误判成气泡（v0.1 的教训）。
所以修法不能是一删了事，要换判据，候选：

1. 高度上限改成**相对值**（如 `> 0.6 × 消息区高度` 才丢），或直接放到 1200；
2. 更稳的判据：气泡**不应该包含别的消息行**（`el.querySelectorAll('[data-chat-flow-kind]').length <= 1`）
   + 祖先里必须能找到 `data-chat-flow-kind="user"`（这条在 `isUserMessage()` 里已经有了）；
3. 顺带复核 L720 的宽度上限（真实 DSH 的 `.cJsG2q_userStack` 是 `max-width: min(列宽*0.702, 82%)`，
   在宽窗口下不会触发，但窄窗口/大字号时要小心）。

**验证手段（别靠猜）**：
- 让用户贴一次**同时含一条长消息 + 一条短消息**的 HTML（通常会配合贴 HTML）；
- 或在诊断里加一条计数：`被高度/宽度过滤掉的气泡数`（现成字段 `frost.targets` 与
  `diag.userBubbles`（只列前 3 条）可以交叉验证）；
- 补一条回归测试：桩里放一个 **500px 高的气泡**，断言它照样被打标（现在必然失败 → 正好锁住修复）。

### 外部参考：另一份实现的「分层改造方案」（2026-10-14 转来；**按 v0.2.31 写的，当时特意提醒过**）

- 文件：`<本地文档>-分层改造方案.md`
- ⚠️ **它是按 v0.2.31 写的**（当时提醒过：它看到的是旧版本的插件）：
  行号 / 测试数（19+45）/ 环境路径（`HEexe` 机器）全过期。**只采信**它的 asar CSS 证据
  与「`z-index:-1` 背景最底 + 新增 backdrop 模式 + 主题感知薄纱」的思路，**落地一律以现行
  0.2.40 为准**（行号重映射、19+50 测试基线、现有功能全部保留）。
- 核心证据已在本机 `<DSH 安装目录>\resources\app.asar` 复核通过：`body{background:var(--dsw-alias-bg-base,#fff)}`
  （全屏底板只有 body）、`#root` 无背景/定位、会话列 `.xz4KEq_scroll/column/root` 无背景 →
  负 z 图层画在 canvas 底色之上、正文之下，DSH 面板(100~1100)/鲸鱼浮层(9999~40000) 自动全在它之上。
- **A1 已于 0.3.0 执行完毕**（2026-10-14，用户验收 A1 范围后开工）：新增「背景」模式（`z-index:-1; mix-blend-mode:normal`，
  两层都要）、保留「纹理」、面板第三按钮「待更新」→「背景」、通透化触发扩到新模式
  （composerSeat 的 36px 渐变擦除带会盖图）、主题感知薄纱（亮白纱/暗深纱，`isDarkTheme()` 现成）、
  从 0.2.40 bump **0.3.0**。backdrop 模式先不开毛玻璃（A2 再议）；气泡的"纯白层"（v0.2.41
  已回退）在该模式下壁纸真在气泡背后，可择机接回。
- 与旧结论冲突：本文档此前写"v0.1 的 z-index:-1 被应用不透明底色盖住" —— 按新证据**该结论存疑**，
  别用它否决方案；落地后真机验证（亮/暗主题各看一次 + 重命名窗/鲸鱼面板不被染色）。

### P0★3 · 「把气泡搬成 body 级浮层」—— **⚰️ v0.5.0 落地，v0.7.1 按用户要求删除**

> 实现要点见 §0 的 v0.5.0 条目。下面保留当初的工作量级分析（已被 v0.5.0 验证：
> 实际新增 ~350 行 + 5 条测试 + fake-dom rAF 桩，规模与预估一致）。开关在纹理模式的
> 面板里（「气泡浮层」，存档键 `bubbleFloat`，默认关）。背景模式不需要它（壁纸已垫底）。
>
> **2026-10-17 结论（实测推翻了这个方案）**：用户开了这个开关后反馈「气泡是有了，但把文字遮罩住了」——
> 纹理模式下壁纸压在 UI 之上，壳要糊到壁纸就必须抬到壁纸之上，于是也压在气泡文字之上，而
> `backdrop-filter` 糊的是"它后面画过的一切"（含文字）。⇒ 该方案在纹理模式下**结构上不可能**同时
> 满足"糊壁纸 + 文字清晰"。用户决定：**直接关掉并删去这个选项**（0.7.1 已删：面板开关、壳机制、
> rAF 同步循环、`bubbleFloat` 存档键、4 个测试一并移除）。气泡玻璃请用「背景」模式。

**为什么要搬**：壁纸层 `z-index:2147483000 + multiply` 压在气泡之上；气泡又困在
`.xz4KEq_scroll{container-type:inline-size}`（叠层上下文）里，z-index 抬不出去（见 §6.x）。
只有让气泡的**玻璃壳**成为 body 级 `position:fixed` 节点，才能画到壁纸之上、
真正"白层挡背景 / 壁纸不罩气泡"。v0.2.41 的教训：气泡背后聊天区底色是近白的，
在气泡自己背景里做白层**两端视觉差不可辨**（此前的反馈："没任何反应"）→ 已回退 0.2.40。

**要做的事（按依赖顺序）**：
1. **玻璃壳**：每个已打标的气泡，生成一个 body 级 `position:fixed; pointer-events:none`
   壳节点（`z-index: 2147483010`，只带"色层 55% + 纯白层 W + backdrop-filter + 圆角"，
   **不搬文字**——文字留在原气泡里）。壳只画玻璃，原气泡照旧在壁纸下面出文字；
2. **几何同步**（核心工作量）：壳的 `left/top/width/height/border-radius` 从原气泡的
   `getBoundingClientRect()` 拷贝，并在**滚动 / 窗口缩放 / 消息增删改（Markdown 重排、
   图片加载、代码块展开、主题切换）**时刷新。需要 `ResizeObserver`（每个气泡一个）+
   `window` 捕获阶段 scroll 监听（或 rAF 节流循环）+ 既有 MutationObserver 的增删钩子；
3. **生命周期**：壳与标记同生共死（`markFrostSurfaces` / `clearFrostSurface`），
   关闭毛玻璃/卸载时全部移除（零残留）；`@media print` 隐藏壳；两窗口各自独立；
4. **测试**：桩里模拟"滚动后 rect 变化 → 壳跟随""气泡被 React 换掉 → 壳重建"
   "关毛玻璃 → 壳清干净"等 —— 这是本项目第一次引入**常驻同步循环**，
   性能上要盯（气泡少则几十个 getBoundingClientRect/帧，可接受但要节流）。
**规模估计**：新代码 300~500 行 + 一整套同步测试（约 10 条）；是插件至今**最大的单功能**，
  而且把插件从"只加类/写变量"变成"持续维护 N 个浮层"（对 DSH 自身的 DOM 仍是零侵入：
  浮层是我们自己的节点）。若用户要做，建议独立一个新开关（默认关）灰度。

### P0★ · 二级窗口的**层级** —— **✅ 已完成并已实机确认**

**做法**：遮罩 `z-index:2147483005!important`、面板 `2147483010!important`（只动 z-index），
抬到壁纸层（`2147483000`）之上。**下面这段是当时的判断依据与分析，保留备查**：

反馈：毛玻璃要糊在背景图上；层级顺序应为
背景图 → 文字UI → 变暗 → 最后到这些二级窗口。另外变暗的渐变也依旧没能生效。

**代码里的事实（先看这条，别急着改）**：

| 层 | z-index | 备注 |
|---|---|---|
| 我们的壁纸层 `#__dshui-layer[data-mode=multiply]` | **2147483000** | `position:fixed` + `mix-blend-mode:multiply` |
| 鲸鱼的遮罩 `.dshwv-*-mask` | 20000~22000（部分 JS 内联写） | 全屏"变暗"层 |
| 鲸鱼的面板 `.dshwv-*` | 100 ~ 26020（部分 JS 内联写） | 二级窗口 |

→ **壁纸层在遮罩与面板之上**（2.1e9 ≫ 3e4），所以：

1. 面板的 `backdrop-filter` 糊的是**它背后**的东西（= 遮罩 + 应用界面），
   而**壁纸是画在面板之上的**（multiply）—— 视觉上就成了"面板在背景图上做毛玻璃"，
   这正是用户说"层级不对"的原因；
2. 遮罩的**渐变**（中心 16% → 边缘 34%）被压掉了：壁纸 multiply 叠在遮罩之上，
   壁纸越暗的地方越看不出遮罩的深浅 —— 所以用户说"整体变暗有点变化（v0.2.34 认可）、
   但渐变依旧没能生效"。

**已定案的历史（2026-10-16 补，D1 结论改写）**：

1. **主力方案**（v0.2.37，已做）：把鲸鱼的遮罩 + 面板的 `z-index` 抬到壁纸层之上
   （> `2147483000`，静态 CSS + `!important`，只动 z-index 一个属性）。绘制顺序变成
   「壁纸/UI → 遮罩 → 面板」。DSH 自己的模态框在 v0.3.3 用 `:has()` 补完（见 §0）。
   ✅ **用户已确认"dsh本体的二级菜单已经正常了"。**
2. **备选方案后来成了"背景"模式**（v0.3.0–v0.3.3，已做且成功）：把壁纸层改到底层
   `z-index:-1` 这件事**本身不是翻车方向** —— v0.1 翻车是因为**没有处理应用自己的不透明底色**。
   代价与解法：把「消息区 → body」页链上所有不透明底色清成透明（v0.3.2 `applyBackdropScrim()`，
   逐字备份还原）+ `.BynINW_frame`/`BynINW_centerCol` 类开关覆盖 + 标题栏 `::before` 压透明。
   ✅ **用户已确认"背景模式可以看到图了"**。两种模式并存：纹理（壁纸压顶，玻璃在壁纸上）
   与背景（壁纸垫底，文字/玻璃在图之上）。
3. 仍待澄清：「文字UI」是整个应用界面（含侧边栏/标题栏）还是只有聊天区？（背景模式
   现在只清聊天列的页链，侧边栏保持自带底色。）

### P0 · 动效底座 + 帧时间探针（既定计划）—— **✅ 已在 v0.7.0 完成**
> **2026-10-17 补充**：用户复盘时明确「**动效先不做，保持默认关**」。所以这条的"做第一个装饰
> 动效"部分**主动搁置**（不是欠账）：底座、总开关、探针都在，将来开工时直接调 `motionAllowed()`。

1. **`requestAnimationFrame` 帧时间探针接进诊断**：`Ctrl+Shift+Alt+I` 的 `动效:` 一行就能看到
   FPS / 掉帧，在没有 DevTools 的前提下验收动画性能（这是唯一可用的验收方式）。
   - 字段：`motion: {fps, frameMsP95, dropped, longFrames, animating, paused, reduced, enabled}`，
     写进 `reportLayout()` 与 `diagLines()`、`status()`；宿主 `diagHistory[]` 带摘要。
   - 只在"有动画在跑"时采样（`motionBegin`/`motionEnd` 计数），避免空转耗电。
2. **动效公共底座**：总开关（默认关，`__dshui.motion.v1`）+ 尊重 `prefers-reduced-motion` +
   **窗口失焦/`visibilitychange` 即暂停**。之后所有动画都必须从 `motionAllowed()` 走，
   不许各自 `setInterval`。实现细节与踩坑见 §7.4。

**动效格式结论（已交付给用户，可直接引用）**：

| 想要的效果 | 推荐 | 制作成本 |
|---|---|---|
| 壁纸推近/平移、光带扫过、胶囊呼吸、面板滑入 | **纯 CSS/JS 补间**（只动 `transform`/`opacity`） | 极低，零体积 |
| 画面本身在动（水面、飘落、粒子） | **动态 WebP** | 低（Pillow/ffmpeg 一条命令） |
| 角色 / 图标 / 状态动效 | **SVG + CSS/WAAPI** | 中 |
| 同上但要交互/状态机 | **Rive (.riv)**（Lottie 作兼容） | 中高 |
| 长循环拟真光影 | **MP4/H.264**（要 alpha 就别用视频） | 中 |
| 程序化连续效果（噪点/折射） | **WebGL** | 高 |
| 只有 GIF 素材 | GIF | — |

**实测数字**（脚本 `tools/image-weight-check.py` / `motion-weight-check.py`，用 §1 的 Python 跑）：

| 静态图 | 现 PNG | WebP q90 | AVIF q60 |
|---|---|---|---|
| `deepseek-4k.png` 4096×2304 | 1.60 MB | **0.18 MB** | 0.09 MB |
| `deepseek-bw-nowater.png` 2048×1152 | 1.86 MB | **0.16 MB** | 0.07 MB |

| 动态 WebP（12 帧 @12fps 缓慢推近） | q70 | q80 |
|---|---|---|
| 1600×900 | **0.28 MB** | 0.41 MB |
| 2560×1440 | **0.69 MB** | 1.06 MB |

### P1 · 体积与动效落地

- **「重载界面」✅ 已在 v0.7.0 作为独立插件落地**：新目录 `default-workspace\dsh-reload-ui`
  （v0.1.0，`Ctrl+Shift+Alt+R` → `location.reload()`；零侵入、只认 `#root`、重复注入幂等、
  自带栅栏与双通道注入；测试 6 项；出包 6 条目）。
  背景：DSH 桌面版**没有绑定刷新快捷键** —— 应用菜单在 Windows 上只有两个隐藏的 DevTools 项，
  「刷新页面 / 重启应用与 Host」菜单项写死在 `development ? [...] : []`（**正式版没有**），
  托盘右键只有「打开应用 / 退出应用」，而**关闭主窗口是隐藏到托盘（窗口不销毁）**，
  所以「关掉再打开」也不算刷新。用户改完插件想立刻看到效果时，只能**退出 DSH 再启动**。
- 两张 PNG 换 WebP：**✅ 已在 v0.7.0 完成**（4k 1.60 MB → 0.18 MB、黑白 1.86 MB → 0.16 MB，
  zip 从 ~3.8 MB 降到 ~1.0 MB）。要点：身份名不变（`deepseek 4k.png` 等仍是桌面文件名/存档键）；
  `BUNDLED_IMAGE_NAMES` 值改 `.webp`；`IMAGE_ALIASES` 新旧扩展名都认；`/bg.png` 的 Content-Type
  按**字节魔数**（RIFF+WEBP），别信扩展名；桌面原图仍 PNG 优先。
- 动态 WebP 动效参数建议：宽 ≤1920、8–12fps、单文件 ≤1 MB、**默认关闭**、失焦暂停。

### P2 · 小而确定的债

- 启动模式若要改成「纹理」：`readMode()` 兜底 `'off'` → `'multiply'`（一行；**用户没要求就别动**）。
- ~~过时文字~~ **已在 v0.2.32 顺手修掉**：`lib/client.js` 头部注释现在写的是现行快捷键
  （`Ctrl+Shift+Alt+1/2/D/I`）与现行默认（浓度 `0.49`、毛玻璃 `2px/25%`）。
- ~~「待更新」按钮目前只提示；实现时对应内部 `luminosity` 模式。~~ **作废（2026-10-17 复核代码）**：
  第三个按钮在 v0.3.0 已换成「背景」（`lib/client.js` 摘要面板表 = 关闭/纹理/背景），
  `luminosity` 只作旧存档兼容 —— 见 §2.5。本条原文与现状不符，故划掉。

### P3 · 工程化

- ~~把 §10 的配方固化成 `tools/build-dist.mjs` / `.ps1`~~ **✅ 已完成**：`tools/build-dist.ps1`
  （0.3.0 起，三处版本校验 + 12 条目（2026-10-17 起含 LICENSE）+ SHA256；用法 `powershell -ExecutionPolicy Bypass -File tools\build-dist.ps1`）。
- ~~`diag.json` 多窗口互相覆盖~~ **✅ v0.7.0 缓解**：顶层 `report` 仍是"最后上报者"，但 `history[]`
  从 v0.7.0 起**每份都带 `motion{fps,frameMsP95,animating}` 摘要** —— 多窗口下各自帧率都能读到。
  （按 session 存多份/带 windowId 的彻底解法仍可做，但优先级低。）
- `tools/` 三个脚本只用于开发，别塞进 zip。

---

## 12. 数值禁区与失败史速查

| 别做 | 为什么 |
|---|---|
| 纹理浓度 > 0.5 | 实测 0.5 时中央剪影区 **41.4%** 文字不可读（≤0.4 才"零损失"；0.49 是作者口味） |
| 用 CSS transition 做"刚挂载元素"的淡入 | Chromium 抑制首帧过渡，会硬切 |
| 重写 `<style>` 文本 / 重写全屏位图 | 合成层重建 → 满屏白光 / 背景消失一帧 |
| 把 `background` 之外的属性写进通透化 | 只许 `background-color` / `background-image` |
| 把 `LAYER_PROPS` 之外的属性写进分层 | 只许那七个，且要备份 + 优先级 |
| 用 `Compress-Archive` / `CreateFromDirectory` 出包 | 根目录多一层 + 反斜杠分隔符 |
| 用 `Set-Content` 写中文文件 | 乱码（用 `write`/`edit`，再 grep `\uFFFD`） |
| 用 `Get-Content -Raw \| ConvertFrom-Json` 读带中文的 `package.json` | 本机 PowerShell 按 GBK 解码 → 乱码 → JSON 解析报错（实测踩过；用 `[System.IO.File]::ReadAllText`） |
| 把中文文件名塞进 HTTP 头（ETag 等） | Node 抛 `ERR_INVALID_CHAR` → 400 |
| 靠 hash 类名（`Dc7zOa_*`）选元素 | 每次构建都会变 |
| 关掉毛玻璃后不管还原 | 座位遮罩 / 卡片底色必须逐字节还回去 |
| 把"这一轮清了 0 层"记成"已经处理完"（空 backup 常驻） | `frostBackupAlive()` 对空 entries 返回 true → 之后永远提前 return；0.2.31 的玻璃"跟没开一样"就是这么来的 |
| 给**含 `position:fixed` 后代**的容器加 `backdrop-filter` | 它会成为那些 fixed 后代的**包含块** → 小浮层整体跑位（鲸鱼 `.dshwv-slotlist` 在 `.dshwv-audiowin` 里就是这个坑） |
| 用构建哈希类名（`LqhxcW_*` 这类）选扩展表面 | 每次构建都会变；只用应用自带的语义属性（`data-question-key` / `aria-labelledby`）或手写类名（`dshwv-*`） |
| 让二级面板跟主表面共用一套毛玻璃参数 / 共用一个类 | 小控件区在 30% 白层下看不清按钮（作者实测"视觉效果不理想"）→ 二级面板单独一套 20px / 90%，类也分开 |
| **以为"把白层调到 85%/90% 就能看见玻璃"** | 鲸鱼面板本来就是 92%~100% 不透明白 → 平铺的白层跟原版几乎一样，用户会说"没有任何变化"。**要看得见层次只有两条路：白层做渐变（v0.2.35 的做法），或把白层降到 ~0.6-0.7 让背后的内容真透出来** |
| 用 `background-color` + `background-image` 两个长属性写面板渐变 | 底色不重置成透明 → 渐变叠在实心底色上，合成后两端差不到 1.5%，**视觉上等于没写**；用 `background` 简写 |
| 用**绝对尺寸上限**（如 `rect.height > 400`）当"这不是气泡"的判据 | 长消息气泡几千 px 高 → 被静默丢掉，表现为"长消息没玻璃、短消息正常"（v0.2.37 前一直如此）。**尺寸只能做"离谱"兜底，判"是不是气泡"要用结构判据**（装得下别的气泡/消息行 = 容器）+ `state.bubbleScan` 让丢掉的条数可见 |
| 给**用户气泡**套"半透明白玻璃"，参数却和输入卡片共用 | DSH 气泡本来是**不透明浅蓝底**，糊它 = 换底：白层 25~30% 时气泡只剩文字、形状消失（此前的反馈："没有气泡了"；长气泡以前看着正常是因为被旧规则漏掉、保留了原底色）。**气泡必须有自己的白层默认值与滑块**（v0.2.38） |
| 把 `z-index` 抬到壁纸层之上时顺手也抬了主表面（输入卡片/用户气泡） | 主表面必须留在壁纸**下面**吃 multiply（抬上去整块会变亮、失去纹理感）；panel/mask 抬，surface 不抬 |
| **给"套娃结构"的最外层贴玻璃，就不管里面还有几层不透明底** | 玻璃糊的是"这一层之后绘制的所有东西"——里层只要有一层刷了不透明 `background`，外层玻璃就被整块盖住，看起来**完全没效果**（v0.6.0 的代码块就是这样：`pre` / `bannerWrap` / `[data-code-block-banner]` 各一层实心底）。**做法：先看清 DOM 有几层底 → 贴玻璃的那层 + 把所有内层底清成透明**（`background:transparent!important`），`sticky` 的那条（会滑过内容的）用**同一套玻璃配方**（嵌套叠加 = 更实 + 自带模糊，不叠字） |
| 收集"可糊表面"时**不先给祖先打标** | `extraSurfaceSafe()` 的"祖先已糊就别套娃"闸门是**查询时**判定的：如果先收子元素、后标祖先，闸门看不见祖先 → 贴两层 `backdrop-filter`（两层互相读不到底图 → 死白发灰）。**顺序 = 先面板、再子元素**（v0.6.1 修） |
| 用 `data-code-wrap` 当"这是代码块"的标记 | 它的值是**自动换行开关**（`"true"`/`"false"`），**且没有工具栏时属性根本不出现**。要么用 `[data-code-wrap]` + `.md-code-block` 双钩子，要么别拿它当标记 |
| **把"取值范围下限"和"出厂默认值"混为一谈** | v0.6.2 之前白层下限写死 0.15、面板白层写死 0.30、薄纱 5% 一档，理由都是"再低就不好看/看不清"——**那是默认值该守的事**：拖到哪是用户自由，范围卡死等于替用户做决定（本次要的就是"最低数值再调低一点"）。而且这些数字当时**散在滑块、存档校验、API 三处**，改一处必漏两处 → 现在统一进 `FROST_ALPHA_MIN` / `PANEL_ALPHA_MIN` / `SCRIM_STEP` |
| 用"存档里有个低值"当作"坏数据要回落默认" | 低值是**合法**的（v0.6.2 起白层可到 0.02）；真正会被提上来的只有"全新 profile 的首次迁移"（`__dshui.glass.v1` 标记不存在、且值低于出厂默认时）。写测试别把这两件事测混 |
| **用"有没有账本"当"要不要重跑"的条件** | `if (!state.frostBackup) applyFrostBackdrop()` 读起来像"没处理过才处理"，但**React 换节点时账本还在（指针已失效）** → 条件为假 → 永远不重跑 → 新节点带着应用底色把壁纸盖住（v0.6.3 用户报的"切对话后背景失效"）。**正确姿势：重跑条件要和"世界有没有变"绑定（重认链 + 比形状），而不是和"有没有做过"绑定** |
| 只查 `isConnected` 就断定"还是那条链" | 中间**换掉某一层**时，链上其它节点都还连着 → `isConnected` 全 true → 判定"没事"。必须比**元素身份 + 顺序**（`sameChain`） |
| 重清时把元素**当前**的内联值记成"原值" | 第一次清完，内联就是我们的 `transparent` / `none`；第二次再记一遍 → 关闭时"逐字还原"写回我们的值，页面上留下痕迹（v0.6.3 引入、被老测试当场抓住）。**幂等记账：已记过账的元素沿用最初那份原值**（`clearFrostChain(chain, previous)`） |
| **把"背景没了"一律当成"被盖住"** | 0.6.4 的有效反馈是"**整张壁纸彻底消失**" —— 那更可能是**图层自己不再绘制**（节点被摘 / 图被抹 / 卡死的淡出 / 塌成 0 尺寸），治法完全不同（体检 + 自愈，不是清链）。**先分诊再改**（§7.3 的表），别猜一种就改一版 |
| 以为 `elementsFromPoint()` 能找到所有浮层 | 它**跳过 `pointer-events:none`** 的元素及其子树 —— 而"加载壳/骨架屏"经常就是这么写的。所以盖子扫描必须再补一路"顶层容器补扫"（`body` / `#root` 的直接子元素） |
| **把修复排在去抖里，却指望用户"看不见"** | 250ms 去抖对"省算力"是对的，对"视觉自愈"是灾难：用户看到的就是**一次白闪**（「还是会白闪一下」）。**能抢在绘制之前的修复就不要放到定时器里** —— `MutationObserver` 回调是微任务，跑在 paint 之前，那里同步修完，用户一帧都看不到。判定要便宜（只比"变没变"），贵的活留在去抖 |
| **探针汇总只在"节流周期"里做，不等动画收尾** | 420ms 的淡入淡出短于 500ms 的汇总节流 → 采样期间一次汇总都不会发生，fps/P95 永远是 0（v0.7.0 当场踩）。**停止采样时必须做一次收尾汇总**；样本 <2 时**保留上一轮读数**，别用 0 覆盖 |
| `matchMedia` 桩每次调用返回新对象 | 真实 API 是**同一查询串永远同一对象**；桩若不缓存，client 启动时拿到的对象和测试后来改的不是同一个 → change 监听永远送不到。桩要按 query 缓存 |
| 动画记账只在"开始处"加、不在"取消处"减 | `motionBegin`/`motionEnd` 必须成对（完成 + 取消都减）；漏一处 → 计数泄漏 → 探针永远空转耗电。取消路径：`cancelFrostTween` / `cancelLayerTween` / `stopFloatLoop` 都要减 |
| 图片 Content-Type 按扩展名写死 | 身份名是 `.png`（桌面文件名）而包内兜底是 `.webp` → 扩展名两边都对不上。**按字节魔数**给（RIFF+WEBP → image/webp），桌面图被换成别的格式也能正确解码 |
| 把"旧存档里的包内文件名"当死串 | 兜底图扩展名一变（png → webp），旧存档里躺着的 `deepseek-4k.png` 别名仍然必须认（v0.7.0 里新旧扩展名都进了 `IMAGE_ALIASES`） |

**已排除的方案（别再提）**：`::after` 贴图假毛玻璃；面板上的分层开关；`overlay` 按钮；
`deepseek.png` / `deepseek 黑白.png` 候选；快捷键面板作为主入口；给 `textarea` 加伪元素。

---

## 13. 一次成功的会话长什么样

**动手前**：读本文件 → 跑两个测试套件（确认基线绿）→ 打一次 `status.json` / `diag.json`
（确认线上版本与手上代码一致）。

**改动时**：

- 只改 `lib/client.js` 就够的，别动 `lib/index.js`；
- 新增**看得见的效果** → 必须同步加诊断字段（铁律 8）；
- 新增**动页面属性**的代码 → 必须备份原值 + 优先级、走 `safe()`、加回归护栏测试；
- 改完：**bump 版本号三处** → 跑测试 → 让用户**重启 DSH 生效**（DSH 没有刷新快捷键，见 §11 P1；
  `?v=` 只在宿主重启后更新）。

**交付时**：说清 ① 改了什么 ② 动了哪些文件 ③ 版本号是否变化 ④ **怎么验证**（一步能做的动作）
⑤ **怎么回退**。要出包就按 §10，并把新哈希写在**会话里**（不要写回包内文件）。

**Do**：结论先行 + 表格；给可见证据；遇到"没变化"先怀疑"被别的层盖住"；保留用户存档优先权。
**Don't**：擅自改需求方的参数；在没有诊断的情况下交付视觉改动；用"应该可以了"这种话收尾。

---

## 14. 术语表

| 词 | 意思 |
|---|---|
| 纹理 | 面板中间按钮，= `multiply` 乘法混合；白底处文字不受影响 |
| 浓度 | 图片层不透明度（0~1），按模式分别记忆 |
| 毛玻璃 | 真 `backdrop-filter` 白层，作用于**输入卡片 + 用户自己的气泡** |
| 模糊 / 白层 | 毛玻璃的两个参数：`blur(px)` / 白色 α |
| 通透化 | 清掉「卡片 → 消息区」祖先链上的背景色/图，让玻璃背后真有可糊的东西；逐字节可还原 |
| 分层 | 让聊天记录延伸到输入区下面。真实 DSH 原生已实现（native 分支，我们不动布局） |
| 交叉淡化 | 换图时两图层叠加淡入淡出，结束时副层扶正为主层，全程不出现空白 |
| 胶囊 | 左上角可拖入口 `#__dshui-pill`（替代旧快捷键面板） |
| 兜底图 | `assets/` 里随包发布的图；桌面上有同名图时**桌面优先** |
| 回归护栏 | client 测试中"挂载前后逐元素布局内联样式快照比对"的用例 |

---

## 15. 一致性快照与接手自检

记录时的仓库状态（用于判断"东西有没有被动过"）：

| 文件 | 字节 | 备注 |
|---|---|---|
| `lib/client.js` | 273908 | `VERSION='0.8.1'` |
| `lib/index.js` | 28253 | `PLUGIN_VERSION='0.8.1'` |
| `test/host.test.mjs` | 30505 | 23 项（含开屏页路由与桥接注入） |
| `test/client.test.mjs` | 150595 | 79 项（含存储迁移 / 开屏动画等 4 项） |
| `test/fake-dom.js` | 28600 | 极简 DOM 桩（可控时钟 + 几何模型 + 命中测试 + `MutationObserver` 桩 + `performance`/`matchMedia`） |
| `assets/deepseek-4k.webp` | 186,342 | v0.7.0 起兜底图是 WebP（原 PNG 1,674,455 B） |
| `assets/deepseek-bw-nowater.webp` | 162,872 | 原 PNG 1,947,025 B（SHA256 `9A87CA354A2DAD0CAB1FEF81A32E23A777FA5003E00ED0C113C0BA8654D9A8DB` 指旧 PNG） |
| `.gitattributes` | 见 `Get-Item` | v2026-10-17 加的：`* -text`（关掉行尾转换，保住"字节一致"前提） |
| `LICENSE` | 见 `Get-Item` | MIT，署 `Rad-Weed`（`package.json` 一直声明的就是 MIT） |
| `README.md` / `HANDOFF.md` | 见 `Get-Item` | 文档会随会话更新，**字节数不必对齐** |

- **历史包**：不含本文件的 v0.2.31 包（10 条目）= 3,697,317 B，SHA256 `75DA2A1C…429F6`；
  当前版本（v0.8.1，28 条目，含本文件、LICENSE 与 scripts/uninstall-cleanup.ps1）用 `tools/build-dist.ps1` 重打即可（**哈希现场用 `Get-FileHash` 读，
  不写进包内文件**，避免自引用）。
- **2026-10-17 重出过一次 0.7.0 包**（把新名字写进包内 README/HANDOFF + 工具脚本可移植性）：
  **哈希与之前那版不同**，以 `dist/SHA256SUMS.txt` 与 GitHub Release `v0.7.0` 上的为准；
  旧的 `DBA1699B…7BFAC`（564,707 B）作废，但两个版本**功能完全一致**（都是 v0.7.0 代码）。
  ⇒ 以后每次重出包都往 `dist/SHA256SUMS.txt` 追加一行，别再靠聊天记录记哈希。
- **上一个可回滚的整包**（上一版）：`dist/dsh-ui-beautify-0.7.3.zip`
  = 581,244 B，SHA256 `4D1E2D511B19B660FDB5CD967466837885798ABCD79636B4AB719F634130BC4F`
  （全量更名 / 双语文档 / 折叠式英文版；装回它即可回退本版的开屏动画）。
- 再往前：`dist/dsh-dsniang-beautify-0.7.2.zip` = 575,055 B，
  SHA256 `28F3F2BD0721041431FC79C5481A07C9CA8D1E96B037B01F7315A04894BE64C1`（旧包名时代的 0.7.2）；
  `dsh-dsniang-beautify-0.7.1.zip` = 568,375 B（修界面卡死 + 删除气泡浮层）、`-0.6.5.zip` / `-0.6.4.zip`。
- **另一个插件**：`dist/dsh-reload-ui-0.1.1.zip`（6 条目）——「重载界面」独立插件，
  与美化插件分开安装（详见其 README）。
- `dist/` 里还留着更旧的旧名包（`dsh-dsniang-beautify-0.2.30.zip`，1,747,948 B，**只有 4k 一张图**，勿再分发）。
- **包名前缀**：现行整包文件名是 `dsh-ui-beautify-<版本>.zip`；历史旧名包为 `dsh-dsniang-beautify-<版本>.zip`。

**接手自检清单**：

- [ ] `node test/host.test.mjs` → 23 pass / 0 fail
- [ ] `node test/client.test.mjs` → 91 pass / 0 fail
- [ ] `node ../dsh-reload-ui/test/reload.test.mjs` → 6 pass / 0 fail
- [ ] `status.json` 的 `version` / `images[]` 与手上代码一致；`filePath` 是 `.webp`（桌面原图仍 `.png` 优先）
- [ ] `diag.json` 的 `frost.cleared` 含 `div.Dc7zOa_composerSeat`、`layering.native === true`
- [ ] 背景模式滚到带代码块的消息：`diag.json` 的 `frost.chatBlocks` ≥ 1（**若为 0 或"数得出来却看不见玻璃"，
      先查内层底有没有清干净，别急着改打标** —— §6.y）
- [ ] 背景模式切几次对话：`diag.json` 的 `backdrop.repairs` / `frost.repairs` 有涨就说明自愈在工作；
      `wallpaper.issues` / `wallpaper.covers` 不为空说明它确实修过东西（**§7.3 的分诊表**）；
      `wallpaper.lagMs` 应是个位数（≥100 说明抢修又退回"等去抖"了 —— 用户会看到白闪）
- [ ] 开面板切一次模式：`diag.json` 的 `motion.animating` 曾为 true，`motion.fps` 有读数（**§7.4**）；
      `history[].motion` 每个窗口各自一份
- [ ] 清楚**装饰动效是"主动搁置"**（2026-10-17 定案：先不做、保持默认关；底座与探针都在）
- [ ] 清楚代码已入库：私有仓库 `Rad-Weed/DSH-UI-Beautify`（`main` + Release `v0.7.0`）；
      以后改完代码**双击 `桌面\DSH美化项目\上传到GitHub（双击）.cmd`** 即可提交并推送
- [ ] 清楚**使用者没有 DevTools**，任何新效果都要自带诊断

---

## 附：一句话交接

> 它已经能用、已装在用户机器上、测试全绿、代码也进了私有仓库；把「零侵入 + 只动 transform/opacity +
> 静态样式表 + 逐字节可还原 + 诊断可见」当成不可谈判的底线。动效底座与帧时间探针已随 v0.7.0 就位，
> 但已明确"先不做装饰动效"—— 将来需要时，直接从 `motionAllowed()` 起步（§7.4）。
> 这个插件的每一个"怪设计"背后都有一位用户的耐心。🙏
