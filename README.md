# DSH界面美化 · DSH UI Beautify

给 DSH 桌面端页面加**壁纸 + 毛玻璃**的轻量美化插件：不碰布局、不改宿主代码，自带开屏动画、方块光标、重启键与深浅色主题适配。

- **版本：v0.8.20** · 包名 `dsh-ui-beautify` · 路由 `/dsh-ui-beautify/*` · 全局 `__DSHUI__` · 存储键 `__dshui.*`
- 支持 Windows 10/11 + DSH 桌面端；所有改动都发生在本插件自己的节点/样式里。
- 详细开发记录、实测数据与决策记录见 [HANDOFF.md](HANDOFF.md)；重启键独立说明见 [restart/README.md](restart/README.md)。

<img alt="模式" src="assets/deepseek-4k.webp" width="720">

## 功能

| 功能 | 说明 |
|---|---|
| 壁纸模式 | **纹理**：整页乘法混合，白底正文仍清晰；**背景**：图片铺在最底层，面板天然在图上 |
| 浓度 | 每个模式独立浓度，面板滑块即时生效；淡入淡出换图 |
| 毛玻璃 | 主表面 / 二级面板 / 问答窗口 / 输入框 / 气泡；模糊 + 白层 + 透明度可调 |
| 气泡视觉 | 气泡自动取原色、可调透明/模糊/自定义颜色；代码块与 chat 高亮同样适配 |
| 深浅色主题 | 自动检测 `body[data-ds-dark-theme]`；深色用桌面 `DeepSeek 暗夜模式.png`（包内 `assets/deepseek-dark.webp` 兜底），浅色保持原两张 |
| 深色独立参数 | 深色纹理浓度默认 0.85、背景 0.7；浅色仍为 0.49/0.5，滑块按主题分别保存 |
| 开屏动画 | 六幕授权序列 + 欢迎卡片 + 音效；可重播/跳过/关闭；跳过不阻塞启动 |
| 方块光标 | 命令提示符风格方块光标，`Ctrl+Shift+Alt+M` 开关动效 |
| AI 思考视效 | 纹理/背景模式下，思维链与回复的左侧细线 + 淡渐变；逐行重播可读 |
| 重启键 | 标题栏原生「重启」按钮；可选壳补丁；与 `dsh-restart-key` 自动让位/接管 |
| 主题过渡 | 切换深浅色时旧壁纸先隐藏、新壁纸淡入 + 浓度/毛玻璃补间 + 自家 GUI 颜色过渡；启动预加载另一主题壁纸；减少动态时关闭补间 |
| 诊断 | 屏幕内诊断面板 + `diag.json`，无需控制台 |

## 安装

**要求**：Windows 10/11、DSH 桌面端（Chromium/Electron）。

1. 下载 `dsh-ui-beautify-0.8.20.zip` 并解压；
2. 在 DSH 插件管理里安装本地目录（target 用绝对路径，例如 `file:C:/path/to/dsh-ui-beautify`）；
3. 重启 DSH 一次。

> 若 pnpm 报 `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION` 锁文件校验，安装时指定官方 registry：
> `https://registry.npmjs.org/`。

安装会写入 profile 的 `node_modules/dsh-ui-beautify` 一项，并启用该 bundle；不安装服务、不写计划任务。

## 使用

- **左上角胶囊**：点一下开/关面板；按住可拖到任意位置。面板里：
  - `关闭 / 纹理 / 背景` 切换模式；
  - 图片栏：浅色显示原两张，深色只显示「暗夜」一张，深浅选择分开保存；
  - 浓度、白层、毛玻璃、气泡、面板白层等滑块即时生效并自动保存；
  - 快捷诊断、重启键状态、开屏开关等。
- **快捷键**：`Ctrl+Shift+Alt+1` 关闭 · `+2` 纹理 · `+D` 面板 · `+I` 诊断 · `+M` 动效开关。
- **诊断**：屏幕内面板直接看状态；也可以访问 `/dsh-ui-beautify/status.json`、`/dsh-ui-beautify/diag.json`，或页面 hash `#dshui-diag`（旧 `#dsniang-diag` 兼容）。
- **控制台 API**（`window.__DSHUI__`）：

| API | 作用 |
|---|---|
| `status()` / `diagnose()` | 状态快照 / 诊断文本 |
| `setMode('off'\|'multiply'\|'backdrop')` | 切换模式 |
| `setOpacity(v)` / `setScrim(v)` | 浓度（当前主题）/ 薄纱 |
| `setFrostEnabled(v)` / `setFrostBlur(px)` / `setFrostAlpha(v)` | 毛玻璃开关 / 模糊 / 白层 |
| `setBubbleFx(v)` / `setAiReplyFx(v)` | 气泡视觉 / AI 思考视效 |
| `switcher()` / `diag()` | 打开面板 / 诊断 |
| `splash.replay()` / `skip()` / `setEnabled(v)` / `setSound(v)` | 开屏控制 |
| `restart.state()` / `click()` / `enable()` | 重启键状态 / 点一次 / 启用 |

## 深浅色主题

- 判定以 DSH 的真实标记 `body[data-ds-dark-theme]` 为准，CSS token / `color-scheme` / 系统偏好仅兜底；
- **深色壁纸**：优先读桌面 `DeepSeek 暗夜模式.png`（兼容大小写变体）；桌面没有时使用包内 `assets/deepseek-dark.webp`（已去 EXIF/XMP，125 KB）；
- **浅色壁纸**：完全保持原来的两张（`deepseek 4k` / `deepseek 黑白无水面`）；
- **深色参数**：纹理浓度默认 0.85（浅色 0.49）、背景 0.7（浅色 0.5）；深色纹理用 `lighten` 混合让暗夜图可见，浅色仍用 `multiply`；
- 主题切换时全量重算：图层、毛玻璃、气泡/代码块原色、二级面板遮罩、薄纱、胶囊与面板配色。

## 重启键

- 首用点标题栏「重启」时自动准备：若壳补丁缺失，会随包安装器补 `app.asar` 补丁（**需要完全退出 DSH 一次**）；
- 补丁带 BEGIN/END 标记与双 SHA 备份，可逐字节还原；卸载时可自动清理；
- 与独立插件 `dsh-restart-key` 共存：对方已启用并由它提供按钮时，本插件让位；对方未提供时本插件接管，反之亦然（1.8s 重试）；
- 手动安装/还原/自检脚本在 `restart/`，说明见 [restart/USAGE.txt](restart/USAGE.txt)。

## 文件结构

```
dsh-ui-beautify/
├── lib/index.js        # Host 半区：路由、图片解析、重启桥接
├── lib/client.js       # Client 半区：样式、图层、面板、开屏、诊断
├── assets/             # 壁纸（webp）与开屏页面
├── restart/            # 重启键：壳补丁 spec/snippet、PowerShell 安装/还原脚本
├── scripts/            # 安装/卸载/自检辅助
├── test/               # host / client 测试
├── tools/build-dist.ps1# 整包构建（ASCII 路径）
├── README.md           # 本文件
└── HANDOFF.md          # 开发记录（详细）
```

## 外部副作用

| 项 | 说明 |
|---|---|
| `app.asar` | 仅「启用重启键」时改两个已存在条目的重试壳（标记 + 双 SHA 备份 + 可还原）；插件本体不碰 |
| `child_process` | 仅重启键链路：面板启用或自动准备时启动随包 PowerShell 安装器，安装器用 WMI 逃逸长驻编排进程 |
| 用户数据 | 设置只存 `localStorage`（`__dshui.*`），默认保留；清除需显式操作 |
| 网络 | 无请求、无遥测 |
| 其他进程/服务 | 无 |

## 开发与测试

```bash
node test/host.test.mjs      # host 侧
node test/client.test.mjs    # client 侧（fake DOM）
powershell -ExecutionPolicy Bypass -File tools/build-dist.ps1  # 出 zip
```

当前测试：host **30/30** · client **102/102** · reload-ui 6/6（离线）。

## 版本

### v0.8.20（2026-10-22）
- **修复主题切换“黑罩/闪”互相冲突的根因**：旧壁纸层的混合模式由 `body[data-ds-dark-theme]` 的 CSS 规则控制，切主题瞬间被翻转；
  - 深→浅：旧深色图瞬间变 `multiply` 压在新浅色 UI 上 = 黑色遮挡；
  - 浅→深：旧浅色图瞬间变 `lighten` 压在新深色 UI 上 = 白闪；
  - 之前“隐藏旧图”能消黑罩但会空白闪，“旧图淡出”能消空白但会黑罩 —— 所以两个 bug 反复出现；
- 现在主题交叉淡化期间给两层**分别钉住各自主题的混合模式**（旧层保留旧主题的 lighten/multiply，新层用新主题的），淡化结束后再把内联值交还 CSS；
- 深→浅不再黑罩、浅→深不再白闪，且始终有壁纸覆盖（不隐藏、不空白）；启动预解码两种壁纸保留；
- 测试：host 30/30 · client 102/102。

### v0.8.19（2026-10-22）
- **撤销 0.8.18 的“隐藏旧壁纸”方案**：隐藏再淡入会让壁纸瞬间消失（看起来像被删/空白闪）；
- 主题切换恢复**正常交叉淡化**：旧图淡出的同时新图淡入，任何时刻都有图覆盖；
- 启动时预加载并 `decode()` 两种主题的壁纸（保留 Image 引用），首次切换不等下载/解码；
- 无全屏遮罩；浓度/毛玻璃补间与自家 GUI 颜色过渡保留；
- 测试：host 30/30 · client 102/102。

### v0.8.18（2026-10-22）
- **修复首次深色→浅色切换的黑色遮挡**：首次切换时浅色壁纸还没下载完，旧深色壁纸仍以深色浓度留在新浅色 UI 上 → 看起来像黑色遮罩；之后图片进缓存所以正常；
- 去掉 0.8.17 的全屏旧底色遮罩；
- 主题切换时旧壁纸**先隐藏**（不再做“深色旧图淡出”），新壁纸就绪后淡入；
- 启动时预加载「当前主题 + 另一主题」的壁纸，首次切换也不用等下载；
- 测试：host 30/30 · client 102/102。

### v0.8.17（2026-10-22）
- **主题切换防闪修正**：0.8.16 的遮罩晚了约 60ms 才插入（观察器里 setTimeout 去抖），新主题先画出来再盖旧底色 → 仍会闪一下；现在观察器回调里**同步**执行，遮罩赶在同一帧绘制前插入；
- **遮罩等壁纸就绪后再淡出**：先盖住旧主题底色，等新壁纸加载完成（或 260ms 兜底）再淡出，避免“遮罩淡完了壁纸还没出来”的空白帧；
- 遮罩/补间不再跟随插件的「动效总开关」，只尊重系统「减弱动态效果」；关动效的用户切换主题也平滑；
- 测试：host 30/30 · client 102/102。

### v0.8.16（2026-10-22）
- **主题切换柔化**：深浅色切换时不再"啪"地整页跳变；
- 旧主题底色做一层全屏遮罩淡出（插件自己的节点，覆盖 DSH 原生 UI，不改宿主样式）；
- 壁纸走交叉淡化，浓度/毛玻璃走补间；胶囊/面板/诊断/模式按钮加颜色过渡；
- 减少动态（系统减弱动态或关闭动效）时自动跳过全部过渡，行为与之前一致；
- 测试：host 30/30 · client 102/102。

### v0.8.15（2026-10-22）
- **修真实 Host 里的壳补丁检测**：Cordis Host 以 `ELECTRON_RUN_AS_NODE` 运行，普通 `fs` 会把
  `resources/app.asar` 当成虚拟目录（`stat.size=0`、`open` 读不到字节），导致 `/restart-status.json`
  永远 `patched:false`：面板误报「壳补丁缺失」、每次启动还会白启动一次安装器。
  现在读取原始 asar 全部走 `original-fs`（不可用时临时 `process.noAsar=true` 兜底），
  纯 Node/测试环境自动退化为普通 fs；`restart-status.json` 新增 `asarPath` / `rawAsarFs` 便于诊断。
- **看护增强**：标题栏整体重建时自动补回按钮；休眠恢复若没有 visibility/focus 事件，用计时器跳变（≥30s）
  兜底检查并强制重绘；冲突让路时停看护；诊断新增 `watchdog` / `repairs` / `lastRepairAt`。
- 测试：host 29 → **30**（新增 Electron 虚拟目录 + 注入原始 fs 的回归）、client 101 → **102**
  （新增「标题栏整体重建后看护重注入」回归与看护诊断字段）。

### v0.8.14（2026-10-22）
- **修复休眠恢复后「重启」键短暂消失**：标题栏「重启」是注入的 DOM；窗口长时间隐藏 / 系统休眠恢复、
  或宿主重排菜单栏时，按钮可能被摘掉而「应用」「编辑」仍在。新增看护：`visibilitychange`（变为可见）、
  `window.focus`、`pageshow` 后立即检查，并用 1.5s 低频轮询 + 菜单栏 `childList` 观察兜底；
  发现按钮不在菜单栏 → 自动重新注入（仍遵守与 `dsh-restart-key` 的双向冲突让路）。
- **关闭壁纸/背景模式不再摘重启键**：`uninstall()` 增加 `keepRestart`，关模式只拆视觉层；
  只有 `__DSHUI__.uninstall()` / 卸载插件才摘按钮。
- 测试：host 29/29 · client **101/101**（新增休眠看护、关闭模式保留重启键回归）。

### v0.8.13（2026-10-22）
- **修复浅色主题被误判成深色**：DSH 浅色底是 paper-white（`#f7f8fa` 类），旧兜底"非纯白即深色"导致浅色也套暗夜壁纸/深色参数，纹理与背景模式都出现一层灰罩；
- 判定顺序改为：`body[data-ds-dark-theme]` → `color-scheme` → token 亮度（亮度 < 0.5 才算深色）→ 系统偏好；浅色不再误判；
- 测试：host 29/29 · client **99/99**（新增 paper-white 浅色回归）。

### v0.8.12（2026-10-22）
- 深/浅色主题壁纸：深色用桌面 `DeepSeek 暗夜模式.png`（包内 webp 兜底），浅色不变；胶囊图片栏按主题切换，深浅偏好分开保存；
- 深色独立参数：纹理浓度 0.85 / 背景 0.7，滑块分主题存储；深色纹理 `lighten` 混合，暗夜图可见；
- 主题切换全量重算面板/气泡等主题相关视觉；
- 深色 GUI 可读性：胶囊/面板/诊断深底浅字，激活胶囊按钮白底黑字（修复白底白字）；
- 随包深色壁纸已去元数据；仓库历史中的本机路径已脱敏。

### 更早版本
0.8.0–0.8.11 的逐版本记录见 [HANDOFF.md](HANDOFF.md) 与 GitHub Releases；0.7.x 及以前为旧包名 `dsh-dsniang-beautify` 时代。

## 隐私

- 不收集、不上传任何数据；设置仅保存在本机 `localStorage`；
- 壁纸图片仅从本机桌面/包内读取，不写入用户目录；
- 仓库与发布包不包含本机用户名、绝对用户路径等个人信息。

## License

MIT。开屏动画的结构参考了 MIT 项目 [`dsh-startup-screen`](https://github.com/6shenhonghong9/dsh-startup-screen)，视觉与代码为本项目原创实现；DSH 为其各自权利人的产品，本项目与官方无隶属关系。

---

<details>
<summary><b>English summary</b></summary>

**DSH UI Beautify** — a lightweight UI beautifier for the DSH desktop app: wallpaper + glass (texture/backdrop modes, adjustable opacity, frosted surfaces, bubble visuals), theme-aware wallpapers (dark mode uses the desktop `DeepSeek 暗夜模式.png` with a bundled `assets/deepseek-dark.webp` fallback; light mode unchanged), dark-mode-specific opacity defaults, startup splash, block caret, AI-thinking visual effects and a title-bar restart key (optional shell patch; cooperates with `dsh-restart-key`).

Install: unzip, install the folder as a local DSH plugin (`file:C:/path/to/dsh-ui-beautify`), restart DSH. Shortcuts: `Ctrl+Shift+Alt+1/2/D/I/M`. Diagnostics: on-screen panel, `/dsh-ui-beautify/status.json`, `/dsh-ui-beautify/diag.json`.

No network, no telemetry, no user-data collection; settings live in `localStorage` only. Tests: host 30/30, client 102/102. MIT license; see [HANDOFF.md](HANDOFF.md) for detailed development notes.

</details>
