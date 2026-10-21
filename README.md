# DSH界面美化 · DSH UI Beautify

**语言 / Languages:** 中文（本页） ｜ **English**（点击下方「English version」展开）

> 给 DSH 页面加壁纸与毛玻璃。项目名 **DSH UI Beautify**：包名 `dsh-ui-beautify`，路由 `/dsh-ui-beautify/*`，全局 `__DSHUI__`，存储键 `__dshui.*`。
> 原包名 `dsh-dsniang-beautify` 的旧存档会自动迁移；旧 hash（`#dsniang-off` / `#dsniang-diag`）与旧 URL 参数（`?dsniang=`）仍兼容。
> 仓库：`Rad-Weed/DSH-UI-Beautify`（私有）

**版本：v0.8.6** · 给 DSH 页面加壁纸与毛玻璃。

> ⚠️ **v0.1 出过事故**：它会改目标面板的 `position` / `overflow`，导致界面布局坍塌、
> 基本无法操作。v0.2 从设计上取消了所有这类改动，详见下面「为什么 v0.2 不会再弄坏界面」。

---

<details>
<summary><b>English version（点击展开 / Click to expand）</b></summary>

# English version

**DSH UI Beautify** — a wallpaper + frosted-glass beautifier for the DeepSeek Harness (DSH) desktop client.

Package `dsh-ui-beautify` · routes `/dsh-ui-beautify/*` · global API `__DSHUI__` · storage keys `__dshui.*`.
Settings stored under the old package name (`dsh-dsniang-beautify`) are migrated automatically; the legacy hashes
`#dsniang-off` / `#dsniang-diag` and the legacy URL parameter `?dsniang=` still work.
Repository: `Rad-Weed/DSH-UI-Beautify`.

> This is the English manual. The Chinese manual above is the full one (troubleshooting, internals, release tooling).

## What it does

- **Three modes**: **Off** (factory default — touches nothing) / **Texture** (multiply blending; the wallpaper is
  tinted into the UI) / **Backdrop** (the image is truly behind the content, with a scrim slider).
- **Real frosted glass** (`backdrop-filter`): composer card, user bubbles, DSH dialogs and menus, the whale-widget
  panel, and — in Backdrop mode — code blocks and attachment cards in the chat. All share one parameter set.
- **Two wallpapers**: drop `deepseek 4k.png` / `deepseek 黑白无水面.png` on your Desktop and those are used;
  otherwise the bundled WebP fallbacks are used (you always have two options on any machine). Switching is a
  cross-fade (no blank frame).
- **Click the background** → fades to the default background (420 ms), then restores the wallpaper after **2 s**.
- Clicking bubbles, the composer, buttons, links or icons is **never intercepted**.
- **Built-in diagnostics** (`Ctrl+Shift+Alt+I`): mode, wallpaper source and health, glass state, frame rate —
  no DevTools required.
- **Motion**: the shared foundation is in place (master switch **off** by default); decorative animations are
  deliberately left for later.

## Three buttons

| Button | Effect | Does it touch the page layout? |
|---|---|---|
| **Off** (default) | Everything restored; nothing is mounted | No |
| **Texture** | Multiply wallpaper (default concentration 0.49) + frosted glass (with "clearing" of the composer seat's own scrim) | Adds our own layers, a class toggle, and clears background colors (byte-exact restore) |
| **Backdrop** | The image really sits behind everything (`z-index:-1`), with theme-aware scrim; the shell's full-screen opaque background is overridden by a class toggle; frosted glass works here too | Only our own layers + one class-toggle rule |

## Factory defaults

| Item | Default | Stored in |
|---|---|---|
| Startup mode | **Off** | `localStorage['__dshui.mode']` |
| Texture concentration | **0.49** | `localStorage['__dshui.opacities']` |
| Backdrop concentration | **0.5** | same |
| Scrim strength | 0 (slider 0–90%, 1% steps) | `localStorage['__dshui.scrim']` |
| Wallpaper | **`deepseek 4k.png`** (shown as `deepseek`) | `localStorage['__dshui.image']` |
| Frosted glass | **on** | `localStorage['__dshui.frost.v3']` |
| Glass blur / white layer | **2 px / 20%**（径向渐变：内部更透） | same |
| Panel white layer (edge / center) | **94% / 80%**（径向渐变） | same |
| Bubble transparency / color / blur | **45% / original color / 12 px** | same |
| DSH panel blur | **20 px** | same |
| Motion | **off** (master switch; `Ctrl+Shift+Alt+M`) | `localStorage['__dshui.motion.v1']` |
| Startup splash | **on** (Rhine-Lab-style loading animation; panel toggle, `?splash=0` or `prefers-reduced-motion` skips it) | `localStorage['__dshui.splash.v1']` |
| Pill position | `10, 10` (top-left) | `localStorage['__dshui.pill']` |

Defaults apply only when nothing is stored yet; once you move a slider, the stored value wins.

## Install

1. Extract `dsh-ui-beautify-0.8.6.zip` → you get a `dsh-ui-beautify/` directory
   (`package.json` / `cordis.patch.yml` / `lib` / `assets` (both fallback images) / `test` /
   `scripts/uninstall-cleanup.ps1` / `README.md` / `HANDOFF.md` / `LICENSE` — 13 entries);
2. Put it somewhere that won't be deleted (an ASCII-only path is recommended);
3. Install it through the official plugin channel with the extracted directory as `target`:
   `pluginManager.installBundle('file:D:\\dsh-plugins\\dsh-ui-beautify')` (same as `dsh plugin add file:...`);
4. **Restart the DSH client** (the bundle stack is collected once at startup);
5. Self-check: `node test/host.test.mjs && node test/client.test.mjs` inside the extracted directory — all green.

The official channel registers three things (all of them are needed, otherwise the plugin manager treats the
bundle as a stray entry): the `node_modules/dsh-ui-beautify` junction, the profile `package.json`
`dsh.profile.bundles` + `dependencies`, and the `pnpm-lock.yaml` importer record.

## Uninstall

1. **Quickest** (no restart): `__DSHUI__.setMode('off')`, or open `...#dshui-off` and reload;
2. **Proper**: Settings → Plugins → `dsh-ui-beautify` → Uninstall (or `pluginManager.removeBundle('dsh-ui-beautify')`);
3. **Manual fallback**: `.rollback/` holds a copy of the pre-install profile config; restore it, remove the
   junction with `cmd /c rmdir "<profile>\node_modules\dsh-ui-beautify"` (links only), then restart DSH.

After uninstalling, `scripts/uninstall-cleanup.ps1` runs the post-uninstall self-check: it asserts the
"four-piece" state (`package.json`, `pnpm-lock.yaml`, `node_modules/.modules.yaml`, `cordis.yml`) and removes a
leftover `node_modules` junction (link only, never the target). Idempotent, supports `-DryRun`, writes a log,
exit codes `0/1/2/3/4`.

## External side effects

Pure Cordis plugin: it does **not** modify `app.asar`, the registry, scheduled tasks, environment variables or
ports; no daemon, no child processes, no external network requests. Only six read-only loopback routes
(`/dsh-ui-beautify/*`). Runtime changes are limited to our own DOM nodes, class toggles and CSS variables, all
restored byte-exactly on teardown. The startup splash is a **same-origin iframe**; it is removed entirely
when it finishes (or is skipped / times out) and never touches the host page CSS.

### User data

All settings live in `localStorage` under `__dshui.*` (mode, opacities, scrim, frost, motion, splash, pill, image).
Uninstalling **keeps** them by default. To wipe:

```js
Object.keys(localStorage).filter(k => k.startsWith('__dshui.')).forEach(k => localStorage.removeItem(k))
```

## Diagnostics

- Panel: `Ctrl+Shift+Alt+I` (or open `...#dshui-diag` and reload).
- HTTP: `/dsh-ui-beautify/status.json` (wallpaper resolution) and `/dsh-ui-beautify/diag.json` (last report).
- Console API: `__DSHUI__.status()` / `.wallpaper()` / `.reapply()` / `.uninstall()` / `.setMode('off'|'multiply'|'backdrop')`.

## Motion

The motion foundation (master switch, `prefers-reduced-motion`, pause on blur) and the `requestAnimationFrame`
frame-time probe are in place. Motion is **off** by default; `Ctrl+Shift+Alt+M` toggles it. All future
animations must go through `motionAllowed()`.

## Startup splash

On page load a **Rhine-Lab-style** startup sequence plays (black identity act → over-exposed wash → technical HUD →
six authorization steps → white-flash cut into the session), then fades out and removes itself with zero residue.
It is independent of the mode: it plays by default whenever the plugin is installed.

- **When it plays**: on by default; skipped automatically under `prefers-reduced-motion: reduce`, with `#dshui-off`
  (emergency switch), or `?splash=0`; `?splash=1` forces it on for debugging.
- **Panel**: an "开屏动画：开/关" toggle (persisted to `__dshui.splash.v1`) plus "↻ 重播" to preview it anytime.
- **Console API**: `__DSHUI__.splash.replay()` / `.skip()` / `.setEnabled(true|false)` / `.config()`.
- **Isolation**: the splash is a **same-origin iframe** (`/dsh-ui-beautify/splash.html`; the host injects a bridge
  script into `assets/splash.html`), so its CSS/JS never leaks into the DSH page. The node is removed on finish /
  skip / a 30 s timeout.
- **Clears the Windows caption buttons**: the splash's top row (brand / step counter / SKIP) and the WELCOME BACK card are
  shifted down by the measured titlebar height (`navigator.windowControlsOverlay` → `--dsh-windows-titlebar-height` →
  menubar rect, 40 px fallback), so the native minimize/maximize/close buttons never cover them.
- **WELCOME BACK card**: after the splash finishes, a small card fades in at the top-right of the real page
  (shows the local login name, auto-fades after ~3.6 s; hidden when the splash is off / `?splash=0`). The plugin
  draws it on the real page because the splash's own card lives inside its iframe mock UI and cannot be seen.
- **Replacing it**: drop a new self-contained single-file HTML at `assets/splash.html`; the host only injects.
- **Diagnostics**: a `开屏:` line in the panel / `diag.json` (playing / done / skipped / disabled / timeout + duration)
  and a structured `splash` snapshot in `status()`.
- **Sound**: off by default (no user gesture at startup, so browser autoplay policy would mute it anyway).

## Restart key (v0.8.0)

A **Restart** button appears in the title bar next to “应用” / “编辑”: one click cleanly restarts
the **app + Host** (same as the developer-mode “Restart app and Host” menu item).

- **The button UI is built into this plugin**: it is injected into the shadow-DOM menubar that the DSH
  desktop shell preload mounts; bilingual labels, arrow-key navigation, idempotent injection, removed on uninstall;
- **Actual restarting needs a desktop shell patch** (the only part that touches `app.asar`; installed separately
  per the spec): in the bundled `restart/` folder, run `install-restart-key.cmd` — it waits until DSH is **fully
  exited**, backs up the original header, appends a marked patch to two existing entries (`lib/main.js`,
  `lib/preload-app.cjs`), verifies with a double SHA check, and restarts DSH. `uninstall-restart-key.cmd`
  restores the original file byte-for-byte;
- **Without the shell patch** the button is still there and clicking it shows an explicit hint;
- **Panel entry**: the switcher panel also has “↻ 重启 DSH” as a fallback;
- **Diagnostics**: new `重启:` line and `__DSHUI__.restart.state() / click() / bridge()`;
- **Platform**: Windows desktop only (no button on the web version).

> External side effects: the plugin itself is still a **pure Cordis plugin** and never touches `app.asar`;
> only running `restart/install-restart-key.cmd` patches the two existing entries (marker-delimited,
> double-SHA backup, byte-exact restore). See `restart/README.md`.

## Wallpaper

Replace the two Desktop files (same names) or the bundled ones; Desktop wins over bundled. PNG and WebP are both
accepted, and the `/bg.png` route serves the correct Content-Type from magic bytes. The panel switches between
the two identities with a cross-fade.

## Composition & host API

- `lib/index.js` — host half: injects the client script into the page (web and desktop channels), serves the
  read-only routes (`status.json`, `diag.json`, `bg.png`, `client.js`, `splash.html`).
- `lib/client.js` — browser half (plain IIFE, no build step): layers, glass, layering guard, diagnostics.
- `assets/` — the two bundled WebP fallbacks **and `splash.html`** (startup animation); `test/` — offline tests;
  `scripts/` — uninstall self-check.

## Development & tests

```powershell
node test/host.test.mjs      # 23 tests
node test/client.test.mjs    # 91 tests (includes storage-migration, startup-splash, splash-gui-suppression, titlebar-offset, welcome-card, restore-cancel, restart-key and conflict cases)
```

The tests run fully offline against a minimal DOM stub (controllable clock, geometry model, MutationObserver,
localStorage) — no browser and no running DSH needed. A "regression guard" case snapshots every element's
layout-related inline styles before/after mounting, so any future layout-writing change fails the tests.

## Safety baseline

- All routes are **read-only**: they only serve this plugin's own image and script bytes; nothing is written to
  disk and no user data is returned.
- Routes are fenced: cross-site `Sec-Fetch-Site`, malformed/missing `Host`, and non-loopback Host with external
  Origin are rejected (DNS-rebinding defence).
- Any client-side exception is logged only; the page is never affected.

## License

MIT — see [LICENSE](LICENSE).

</details>

---

## 它做什么

- **三种模式**：**关闭**（出厂默认，一个字节都不碰页面）/ **纹理**（乘法混合，壁纸化进界面 + 毛玻璃）/
  **背景**（图真正垫在内容下面 —— 文字、面板、二级窗口都在图上，另带「薄纱」滑块调亮调暗）。
- **毛玻璃**（真 `backdrop-filter`，v0.4.0 起两种模式都开）：输入卡片、用户自己发出的气泡、
  DSH 问答窗口、鲸鱼挂件的二级面板、DSH 自己的弹窗与菜单，以及**背景模式下**聊天里的
  **代码块 / 附件文件卡片**，共用一套参数（面板可调）；「通透化」负责把挡住玻璃的底色清掉。
- **两张壁纸**：桌面上放 `deepseek 4k.png` / `deepseek 黑白无水面.png` 就用桌面上的图；
  桌面上没有就退到**包内自带的兜底图**（换台电脑也永远有两个选项）。
  面板上点一下即换，换图是**交叉淡化**（全程两张图都在场，不经过空白）。
- **点击背景** → 淡出到默认背景（420ms 渐变）→ **2 秒后**自动渐变回壁纸。淡出期间再点一次会顺延计时；
  淡出期间打开面板（点胶囊）会先取消淡出，避免面板/毛玻璃抢修与淡出定时器互相打架。
- 点气泡、输入框、按钮、链接、图标 → **完全不触发**，也绝不拦截点击。
- **自带诊断**（`Ctrl+Shift+Alt+I`）：模式 / 背景源 / 毛玻璃实况 / 壁纸体检 / 动效帧率一览，
  不需要 DevTools（见「诊断」一节）。
- **动效**：公共底座已就位（总开关**默认关**），详见「动效」一节。

## 三个按钮

| 按钮 | 效果 | 碰页面吗 |
|---|---|---|
| **关闭**（默认） | 一切恢复默认：不挂任何东西 | 完全不碰 |
| **纹理** | 乘法混合背景（默认浓度 0.49）+ 毛玻璃（含**通透化**：清掉输入区座位自带的遮罩） | 追加图层 + 加类 + 清背景色（原值逐字还原） |
| **背景**（v0.3.0） | 图**真正垫底**（`z-index:-1`）：文字、面板、鲸鱼浮层全在图之上、不再被染色；带**主题薄纱**（亮=白纱 / 暗=深纱，面板滑块可调）+ 座位擦除带清理。**v0.3.1 补**：DSH 外壳 `.BynINW_frame` 有全屏不透明底色，会把垫底的图整块盖住（0.3.0 "看不到图"的原因）—— 现在用类开关把它覆盖成透明、关闭即还原。**v0.4.0 起**：毛玻璃整套也开（输入卡片/气泡/二级面板，与纹理共用一套滑块） | 只动自己的两个图层 + 一条类开关规则 |

> **「背景」模式的设计依据与坑**：DSH 的 `body` 是唯一的全屏底板（`background:var(--dsw-alias-bg-base)`），
> `#root` 与会话列本身没有背景 —— 按 CSS 绘制顺序，负 z-index 的图层会画在 canvas 底色之上、
> 正文内容之下。**但**外壳还有一层 `.BynINW_frame{background:var(--dsw-alias-bg-base)}`（全屏、不透明，
> 此前另一份实现漏掉了它），v0.3.1 用 `body.__dshui-backdrop` 类开关把它覆盖成透明、
> **v0.3.2 再加强**：不再逐个猜层 —— 进入背景模式时，把「消息区 → body」整条页链上**所有**
> 画了不透明底色的层都清成透明（只动背景两个长属性、逐字备份还原），并在诊断里上报
> 每层实况（`diag.json` 的 `backdrop.chain`），保证"没有一层能盖住壁纸"。
> 旧「待更新」占位按钮已被「背景」替换（内部 `luminosity` 保留兼容旧存档）。
>
> **v0.6.3 修「切换对话后背景失效」**：切对话时 React 会把页链/座位那几层**换成新节点**，
> 新节点自带应用底色 → 壁纸被盖住。旧代码的重跑条件是"**没处理过**才处理"
> （`if (!state.frostBackup)`）—— 可这时账本还在（指针已失效），条件为假 → 永远不重跑。
> 现在改成**每次 DOM 变化（250ms 去抖）都重认一遍链、比对形状**：形状变了就先把旧账
> 逐字还回去、再按新链重清。诊断里多了一个 **`自愈 N 次`** 计数（`backdrop.repairs` /
> `frost.repairs`）——那就是"它自己修过"的证据。认不出消息区时还有一条**退路**：
> 直接清 `#root` 那一层，首屏/加载态也不会让壁纸被盖住。想手动补一下：
> `__DSHUI__.reapply()`（一遍把该贴的重贴回来，不需要刷新页面）。
>
> **v0.6.4 起有「壁纸体检」**（此前反馈的"整张壁纸彻底消失"）：壁纸消失除了"被盖住"，还可能
> 是**图层自己出了问题** —— 节点被摘掉 / 图被抹掉 / 卡死的淡出把它变成全透明 / 塌成 0 尺寸。
> 现在每 250ms 那一遍会顺手体检：有问题就**自己修回来**（补节点、重画图、摘掉卡死的
> `is-faded`、没图地址时重拉一次），并且**还会去找"链外的盖子"** —— 用 `elementsFromPoint()`
> 在四个采样点做命中测试：谁压在壁纸上面、几乎铺满屏、还是不透明的，那就是盖子，清掉它
> （逐字记账：它不再盖着 / 弹窗打开 / 切回纹理模式时**原样还回去**）。`pointer-events:none`
> 的浮层命中测试看不见，所以还有一路"顶层容器补扫"兜着。弹窗和菜单打开时那层变暗遮罩是
> **有意为之**，绝不误清。
>
> 现场怎么查：诊断面板（`Ctrl+Shift+Alt+I`）多了一行 **`壁纸: …`**；也可以随时敲
> **`__DSHUI__.wallpaper()`**，它会直接点名 —— 例如
> `图层在 · 图 /dsh-ui-beautify/bg.png · 链外盖子 1 个：div._loading（已清） · 自愈累计 2 次`，
> 或者 `图层缺（已补） · 本次修了 detached`。
>
> **v0.6.5 修「还是会白闪一下」**：v0.6.4 的抢修是**去抖 250ms 之后**才跑的 —— 于是
> "先白一下、再变回来"。现在抢修改到 **`MutationObserver` 回调里同步做**：那个回调是
> **微任务**，跑在**浏览器绘制之前**，所以在任何一帧被绘制之前，链就已经清好了。
> 抢修只做三件便宜事（图层体检 / 顶层新盖子 / **链形状变了没有**），贵的那一遍（全量打标、
> 分层、昂贵重试）仍然留在 250ms 去抖里。诊断行末尾会显示 **`最近抢修延迟 Xms`**：
> 个位数毫秒 = 同步抢在渲染前（看不到闪），≥100ms = 只能等去抖（会闪一下）。

### 切换时的淡入淡出（v0.2.19 起）

模式切换带 **420ms 的淡入淡出**，不再瞬间硬切：

- **关闭 → 纹理**：背景层用 **JS 逐帧补间**淡入（v0.2.21 起）。不用 CSS transition 的
  原因是 Chromium 对"刚挂上、还没渲染过"的元素会**抑制过渡**（初始渲染不产生
  transition，强制回流也绕不开）—— 逐帧写内联 opacity 与渲染机制无关，必然平滑；
  毛玻璃的模糊/白层参数同样补间，且**淡入从卡片原生白底（0.85）起步、淡出退回
  原生白底**（v0.2.22）—— 接管/归还卡片底色完全无缝，不会闪一下白光；
- **纹理 → 关闭**：先整体淡出（约 420ms），动画结束后才真正卸载、逐字还原页面；
- **淡出中途又切回纹理**：取消卸载、直接淡回，不会闪一下再重新挂载；
- **切换背景图 = 交叉淡化**（v0.2.21）：旧图冻结在第一层、第二层放新图从 0 淡入、
  旧图同步淡出，**全程两张图都在场**，不经过空白也不瞬间硬切；淡完把新图固化到
  第一层、撤掉第二层。v0.2.23 起**先等新图解码完成再开始淡化**（否则淡化期间第二层
  是空的、淡完图才加载出来会整屏突然弹出），且旧图层淡出后**保持钉在 0**、两个
  补间都结束才一次性固化 —— 收尾不再有"换完图之后闪一下白光"。
  v0.2.25 进一步把收尾改成**角色互换**：不做"改第一层位图 + 删第二层"（改全屏 4K
  位图会重新栅格化，若那一帧新位图未就绪、第二层又已删，就会出现"无背景可画"的
  一帧 = 整屏背景消失一下），而是把第二层**扶正为主层**（它自淡化开始就一直画着
  新图，位图全程不变），只摘掉已透明到 0 的旧层；
- 启动时**后台预热背景图**：首次切纹理时图已就绪，淡入不会被"图片刚加载完突然
  弹出"破坏；
- 面板里的「毛玻璃」开关同样淡入淡出；浓度/模糊/白层滑块是实时直写，不重放动画。

> **样式表必须静态（v0.2.24 起的硬规则）**：`<style>` 里不含任何随状态变化的数值
> （图片 URL、浓度都在**层的内联样式**上，毛玻璃参数在 CSS 变量上）。
> 原因：每次改写样式表文本都要重新解析规则、重建合成层，带 `mix-blend-mode` 的图层
> 在重建过程中可能有一帧是"没应用混合"的 —— 那时一张 90% 白的图会以普通方式铺满
> 全屏，就是用户在换图时看到的**整屏白光**。现在换图 / 拖浓度 / 调薄纱都**一个字节
> 都不改样式表**，并有专门的回归测试盯着这条不变量。
>
> 换图流程还带一条时间线（`switchLog`），跟两图层的实况（`layers`：混合模式、浓度、
> 图片、过渡）一起上报到布局诊断通道 —— 万一还有异常，可以直接读真实状态定位。

> 淡入淡出的实现**不碰页面元素自己的 `transition`**：背景层和换图层都是我们自己的
> 层（JS 逐帧补间内联 opacity），毛玻璃参数用逐帧补间写 CSS 变量 —— 回归护栏测试
> 会确认淡入淡出全程页面布局样式一个字节都不变。

### 毛玻璃 + 分层（纹理模式，v0.2.18）

**毛玻璃 = 一层「模糊的白色层」**：

```css
background: radial-gradient(ellipse at 50% 50%,
    rgba(255,255,255,0.11) 0%, rgba(255,255,255,0.20) 100%); /* 内部更透、向外渐亮（出厂 0.20，可拖 2%~85%） */
box-shadow: inset 0 0 0 1px rgba(255,255,255,.45), 0 10px 30px rgba(17,18,20,.10); /* 边缘高光 + 外阴影 */
backdrop-filter: blur(2px) saturate(1.15);    /* 把这层"背后"的内容先糊掉（默认 2px 模糊） */
```

浏览器先糊掉玻璃背后的东西，再垫上半透明白 —— 所以**聊天记录从玻璃下面滚过时
会被糊成柔和的光影**，这才是真分层，而不是贴一张假图（旧的 `::after` 贴图方案已删除）。

> **v0.2.30 的关键修正：玻璃背后原本什么都没有 —— 必须先把遮罩清掉。**
>
> 直接读 DSH 自己的样式（`app.asar` 里的 `ConversationRoot.module.css`）可以看到
> 输入区座位自带一条遮罩：
>
> ``css
> .Dc7zOa_root[data-phase=active] .Dc7zOa_composerSeat{
>   z-index:7; position:sticky; bottom:0;
>   background:linear-gradient(180deg,
>     color-mix(in srgb, var(--dsw-alias-bg-base) 0%, transparent) 0px,
>     var(--dsw-alias-bg-base) 36px);
> }
> ``
>
> 它是**从透明渐变到页面底色**的一条"擦除带"：消息从输入区下面滚过时被它整段盖成
> 纯色 —— 于是 `backdrop-filter` 背后永远是一块纯色，**糊什么都看不出来**；再加上
> 我们半透明白层底下还是白，视觉上就和没开毛玻璃完全一样（此前反馈的
> "感觉与最开始没有任何区别" 就是这个原因）。
>
> v0.2.30 起，开关毛玻璃时会做一次**「通透化」**：把**卡片 → 消息区之间**那条祖先链
> 上画了背景的层（就是座位那几层）的 `background-color` / `background-image`
> 清成 `transparent` / `none`（带 `!important` 压过应用的类规则），消息才真的从玻璃
> 下面穿过并被糊开。边界很严格：
>
> - **消息区自己不动**（它是消息的底，不是遮挡）；
> - 走到**同时包含消息区的祖先**（窗口/面板底色那一层）就停 —— 绝不会把界面清漏底；
> - 只改这两个背景长属性，原值与 `!important` 标记逐字存下，关掉毛玻璃 / 切「关闭」/
>   卸载时**逐字还原**（有专门的回归测试）；
> - 本来就透明（没遮挡）时**一个字节都不写**。
>
> 同时做**一次性参数迁移**：0.2.29 及更早，玻璃背后被遮罩挡着，参数怎么调都看不出来，
> 于是不少存档里躺着"等于没开"的值（模糊 0~1px / 白层 15%）。首次运行 v0.2.30 时，
> **低于出厂默认**的旧值会被提到出厂默认（**只升不降**：比默认更"重"的口味原样保留）
> 并把结果落盘；迁移标记写在 `localStorage['__dshui.glass.v1']`，**只发生一次**，
> 之后一律以滑块为准。
>
> 诊断面板的「毛玻璃」一栏会多出一段：`· 通透 已开（清了 N 层遮挡）`
> （v0.6.3 起，自愈过的话后面还会跟一个 `· 自愈 N 次`）；
> 状态里另有 `frost.cleared`（清了哪些层）与 `frost.clearedReady`。

作用范围：

- **主表面**：**输入卡片** `[data-composer-card="true"]`（含权限/模型操作区）
  + **用户自己发出的消息气泡**（靠右 / `data-role="user"` /
  行标记 `data-chat-flow-kind="user"` 判定；助手输出绝不打标）。

  > **长消息气泡也算（v0.2.37 修）**：旧版有一条 `rect.height > 400` 的绝对高度上限，
  > 结果**把长消息气泡整个静默丢掉了**（表现：长消息没玻璃、短消息正常）。
  > 现在判"是不是气泡"改用**结构判据**（装得下另一个气泡、或装得下多条别的消息行 → 是容器），
  > 尺寸只做"离谱"兜底（高度 > 20 倍视口）。诊断里多了一行
  > `气泡扫描: 候选 N · 收 M（宽 … · 高 … · 容器 … · 非我 …）`——
  > 以后哪类气泡被跳过一眼就能看见。

  > ⚠️ **气泡不再换色，只调透明度（v0.2.39 定的"方案 B"；v0.2.40 起三个旋钮全开放）**：
  > DSH 的气泡（`.cJsG2q_bubble`）**全部外观只有一条** `background: var(--dsw-specific-bubble)` ——
  > 一个**不透明**的浅蓝底。之前 v0.2.37/0.2.38 试过把它换成"半透明白玻璃"，结果白层一低
  > 气泡就"只剩文字、形状没了"（当时的反馈："没有气泡了"）。
  >
  > 现在改成：**保留颜色，只调透明度** —— `color-mix(in srgb, <气泡颜色> 保留%, transparent)`。
  > 面板上三个控件（都在纹理模式的面板里）：
  > - **「气泡透明度」滑块 0%~100%**：**0% = 不透明（= DSH 原样）**，100% = 全透明；默认 45%；
  > - **「气泡颜色」取色器**：自选颜色（覆盖"气泡原色"）；旁边「原色」按钮恢复自动跟随
  >   （插件读气泡自己的计算色，深浅主题自动跟）；
  > - **「气泡模糊」滑块 0~30px**：只改气泡自己的模糊，默认 12px。
  >
  > 输入卡片的深浅仍由上面那个「白层」滑块控制（它是白玻璃，跟气泡是两回事）。
- **扩展表面（v0.2.32 起）**：
  - **DSH 自带的问答窗口**（`[data-question-key] > section[aria-labelledby]`）——
    跟主表面**同一套参数**（面板上的模糊 / 白层滑块）；
  - **鲸鱼挂件的各级面板**（`dshwv-menu` / `dshwv-usage-card` / `dshwv-bubcard` /
    `dshwv-rolelist` / `dshwv-audiolist` / `dshwv-rgbmenu` / … —— 类名是作者手写的，
    不是构建哈希）—— 这些是**二级面板**，走**单独一套参数**：
    **模糊 20px**、白层是**径向渐变：内部 80% → 边缘 94%**（中值 = 名义白层 87%；
    这两个端点面板上有滑块可以自己拖，见下）。

    > ⚠️ **为什么白层是渐变而不是一个平的白**：鲸鱼面板**本来就不透明** ——
    > `.dshwv-menu` 是 `rgba(255,255,255,.92)`，各种 `*-card` / `*-win` 直接是 `#fff`（100%），
    > 角色/音效/取色下拉是 `.98`。所以平铺的白层给到 85% / 90% 时，
    > 看上去**跟原版一模一样**（v0.2.34「除此之外没有任何变化」的根因就是这个：
    > 不是没生效，是参数落在一个"看不出来"的区间）。
    > 做成渐变后：**顶部几乎实心**（按钮/文字最清楚）→ **底部透出背后的内容并被 20px 糊开**，
    > 这样才有玻璃层次。两个端点可用 `--dsniang-frost-panel-top` / `-bottom` 现场覆盖。

  这些表面由别的插件渲染，插件只给它们**加一个类**（改背景 + 上模糊），
  不动 position / 尺寸 / 层级，也不改那些插件的源码。两类各用各的类：
  主表面 / 问答窗口 = `__dshui-frost-surface`，二级面板 = `__dshui-frost-panel`。

  - **DSH 自己的二级界面（v0.3.1 起）**：`role="dialog"`（会话重命名窗、快捷键面板、
    各类弹窗）与 `role="menu"`（下拉菜单）也走 `__dshui-frost-panel` 同一套玻璃参数；
    对话框底下那层全屏变暗遮罩（`.XPF3fq_mask`，DropOverlay）与鲸鱼遮罩同款处理
    （更轻的径向渐变 + 抬到壁纸之上）。DSH 的类名是构建哈希、每版都变，
    所以用这两个**稳定的语义 role** 做钩子；诊断里显示 `DSH 面板 N 个`。
    **v0.4.0 起**：DSH 面板的**模糊度独立一套**（面板上的「DSH 面板模糊」滑块，
    0~30px，默认 20px，存档键 `dshBlur`）——白层渐变仍与鲸鱼面板共用。

  - **聊天内的代码块与文件卡片（v0.6.0 起，背景模式专属；v0.6.1 修"看不见"）**：
    背景模式下壁纸垫底，助手消息里的**代码块**（`data-code-wrap`，无工具栏时退回
    `.md-code-block`）和**附件文件卡片**（`data-presented-file`）直接坐在图上。
    现在它们也上**气泡同款玻璃**（各自保留原色 + 气泡透明度/模糊两个滑块，深浅主题
    自动跟；钩子是 DSH 自己的稳定 data 标记）。纹理模式不碰它们。
    **v0.6.1 修的坑**：v0.6.0 其实已经给代码块打了玻璃类，但代码块**里面**还各自刷着
    不透明底 —— `pre`（`--dsl-code-block-background`）、`.bannerWrap`（sticky 的
    `--dsw-alias-bg-base`，还带 `z-index:6`）把外层玻璃整块盖住了，看起来就是"完全没效果"。
    现在把内层底清成透明、顶部标题条（`data-code-block-banner`）换成**同一套配方**
    （同色 + 同一个「气泡透明度 / 气泡模糊」滑块）—— 它嵌在卡片玻璃里，两层透明叠加后约
    80% 实，所以标签依然清楚；它自己的模糊又把从下面滚过去的代码糊开，不会叠字 ——
    代码块这才真正透到壁纸上。诊断把两类分开报：`代码块 N 个 · 文件 M 个（玻璃已贴内层）`，
    状态里对应 `frost.chatExtras` / `frost.chatBlocks` / `frost.chatFiles`（`status.json` 同名字段）。
    另外弹窗（`role="dialog"`）里的代码块**不再重复贴一层**：先糊面板、再收代码块，
    "祖先已糊就别套娃"的闸门才拦得住（双层 `backdrop-filter` 会互相啃成死白）。

  - ~~**气泡浮层（v0.5.0 起，默认关）**~~ **已在 v0.7.1 删除**（需求：直接关掉并删去这个选项）。
    它曾给每个气泡生成一个 body 级玻璃壳并把壳抬到纹理壁纸之上，好让气泡在**纹理模式**下也有玻璃；
    但结构上必然失败：纹理模式的壁纸压在 UI 之上，壳要糊到壁纸就必须抬到壁纸之上，
    **于是也压在气泡文字之上**；而 `backdrop-filter` 糊的是"它后面画过的一切"——包括文字
    （实测现象：气泡是有了，但把文字遮罩住了）。
    ⇒ **纹理模式下"糊壁纸"与"文字清晰"不可兼得**。想要气泡真玻璃请用**「背景」模式**：
    那里壁纸垫在 `z-index:-1`，气泡的 backdrop 天然包含壁纸，不需要任何壳、文字也一像素不糊。
    整套壳机制（`FLOAT_SHELL_CLASS` / 同步 rAF 循环 / `bubbleFloat` 存档键）已一并删除，
    旧存档里的 `bubbleFloat` 会被忽略。

  > **打开二级面板时那层全屏变暗遮罩也接管了（v0.2.34）**：鲸鱼挂件原版是
  > 实心 `rgba(15,23,42,0.55)`（降亮度变黑、且是平的）。现在换成**更轻的径向渐变**：
  > 中心 16% → 边缘 34%（中心浅、四周略深，像聚光灯），只覆盖 `background`，
  > 不动位置/层级；关掉毛玻璃即还原成原版。数值在 `lib/client.js` 的
  > `PANEL_MASK_CENTER` / `PANEL_MASK_EDGE`，也可覆盖 CSS 变量
  > `--dsniang-panel-mask-center` / `--dsniang-panel-mask-edge`。

  > **这两个值现在可以直接在面板上拖（v0.2.36）**：纹理模式的面板里多了两个滑块
  > **「面板白层上」/「面板白层下」**（范围 **0.10~1.00**，v0.6.2 起下限从 0.30 降下来），
  > 拖动即时生效、自动存档、刷新后还在；
  > 出厂默认 **边缘 94% / 内部 80%**（中值 = 87%）。模糊仍是固定 20px（常量 `FROST_PANEL_BLUR`）。
  > 想绕过滑块也可以直接覆盖 CSS 变量
  > `--dsniang-frost-panel-top` / `--dsniang-frost-panel-bottom` / `--dsniang-frost-panel-blur`
  > （样式表里都带兜底）。

  > ⚠️ 有一条自动安全闸：**带 `position: fixed` 后代的面板一律不糊**。
  > 原因是 `backdrop-filter` 会让元素成为 fixed 后代的**包含块** —— 贴上去会让
  > 里面那些小浮层（鲸鱼的 `.dshwv-slotlist` 取色/角色/音效下拉）整体跑位。
  > 所以鲸鱼的**音频编辑器窗口**（内含 `dshwv-slotlist`）会被自动跳过，它自己那个
  > 小下拉照糊。诊断里的 `frost.extra`（扩展表面总数）与 `frost.panels`（二级面板数）
  > 就是实际糊了几个。

  > **层级（v0.2.37）**：壁纸层是 `z-index:2147483000` + multiply，而鲸鱼的"变暗"遮罩只有
  > 2 万、面板 2.6 万 —— 壁纸压在它们之上，导致 ① 面板的玻璃其实糊在"遮罩+界面"上而不是壁纸、
  > ② 遮罩的渐变被 multiply 压掉。现在把**遮罩与面板**的 `z-index` 抬到壁纸之上
  > （`2147483005` / `2147483010`，**只动 z-index 一个属性**），绘制顺序就变成
  > **背景图/界面 → 变暗 → 二级窗口**。注意：**输入卡片与用户气泡故意没有抬高**
  > —— 它们要留在壁纸下面吃 multiply 的纹理感（有回归测试锁着这条）。

> **v0.2.32 的修正：通透化不再被「首帧扑空」锁死。**
>
> 真实 DSH 的座位背景只写在 `[data-phase=active]` 上，应用刚启动时可能还在
> hero/settling 阶段 —— 插件首帧去清遮罩会**扑空（清了 0 层）**。0.2.31 把这一次
> "0 层"记成了"已经处理完"，于是座位后来长出遮罩也**再也不会被清**：玻璃背后回到
> 纯色，看起来就跟没开一样。现在把「认出来过那条链」和「已经清了哪些层」分开记账：
> 链认得出来就留着，之后任何一次重新应用（DOM 变化 / 滑块 / 开关）都只重查那几层，
> 一发现背景被画上就立刻清掉。
>
> 怎么一眼确认：诊断面板的「通透」一栏
> `已开（清了 N 层遮挡）` = 处理过了（`N=0` 说明这一轮确实没遮挡）；
> `关` = 还没认出消息区。状态里看 `frost.clearedReady` 与 `frost.cleared`。

**分层**（让聊天记录的下界更低）：真实 DSH 里消息区（`[data-conversation-scroll]`）
与输入区座位（装着卡片的容器）**平级**。v0.2.18 起会把**座位整层**从流式布局里
抬成绝对定位的覆盖层（不是只抬卡片），消息区因此填满整个会话列，记录就能从
毛玻璃下面滚过去；同时给消息区补一段底部留白（座位高度 + 24px，封顶 320px），
保证最后一条消息仍能滚到玻璃上方。找不到消息区时**一行布局都不改**，只做毛玻璃。

消息区的认法（按可靠性排序，v0.2.27 放宽）：
1. `[data-conversation-scroll]` 明牌标记；
2. **实际可滚动**：`scrollHeight` 明显大于 `clientHeight`（有些版本滚动不写在
   `overflow` 上，或由外层 `overflow:hidden` + 内层位移实现）；
3. 退路：`overflow-y: auto | scroll`。

> **v0.2.28 的重要修正**：真实 DSH 的消息区就是这个明牌元素
> （`Dc7zOa_scrollBody[data-conversation-scroll]`），它的高度是**表头以下整列**
> （`--dsh-conversation-viewport-height`），底边本来就延伸到输入卡片下面 ——
> 而我们此前有一条"底边不能越到卡片中段"的过滤条件，正好把这个唯一正确的目标
> 误杀了，于是 `transcript` 永远是 `null`、分层从未生效。现在**明牌目标放行底边
> 检查**（只有兜底候选才受那条约束）。
>
> **v0.2.29 的关键修正**：真实 DSH 的输入区是**嵌在滚动容器内部**的
> （`Dc7zOa_scrollBody` 里装着全部消息**和** `Dc7zOa_composerSeat`，座位 sticky 在
> 底部）—— 也就是说 **DSH 自己就实现了分层**：消息本来就贴着输入区下面滚过去。
> 我们此前有一条"滚动容器不能包含卡片"的规则，于是明牌目标被排除、退而选中了消息里
> 某个 markdown 表格的滚动容器（诊断里能看到 `transcript` 是个 `_tableScroll_*`）。
> 现在：明牌目标**允许包含卡片**；认出这种"输入区在滚动区内"的布局后判定为
> **应用自带分层 → 一行布局都不动**（把一个嵌在滚动区里的座位改成绝对定位会真的
> 弄坏布局）。
>
> 其余情况仍走「能不动就不动」：
> - 座位已经是绝对/粘性定位（应用自带分层）→ **定位一概不碰**；
> - 消息区已有底部留白 → **只补差额**（不够才补，够了就一行不改）；
> 一行都没改时连回滚记录都不留，切「关闭」自然也不需要还原。
> 诊断面板的「分层」一栏会写明：**已生效（补了 N px 留白）** /
> **应用自带（输入区就在滚动区内，我们没动布局）** / **未认出消息区**。

- 只在能明确认出「消息区滚动容器 + 输入区 + 共同父容器」时才动手；
  认不出就只做毛玻璃、一行布局都不改；
- 改动前把原值逐条存起来，切「关闭」时**逐字还原**（有测试逐字比对）；
- **分层没有开关，程序内保持开启**（v0.2.20：面板里的「分层：开/关」已删除，
  旧存档里的 false 一律忽略）。

面板控件（纹理模式）：**毛玻璃：开/关**、
**模糊** 0~30px（默认 2）、**白层** **2%~85%**（默认 20%；v0.6.2 起下限从 15% 降下来）、
**面板边缘白层 / 面板内部白层** **10%~100%**（默认 94% / 80%，只管鲸鱼二级面板，v0.2.36 起；
v0.6.2 起下限从 30% 降下来）、
**气泡透明度** 0%~100%（默认 45%，0 = 不透明/DSH 原样；v0.2.40 起）、
**气泡颜色**（取色器自选，默认跟随气泡原色；v0.2.40 起）、
**气泡模糊** 0~30px（默认 12px，v0.2.40 起），
全部持久化在 `localStorage['__dshui.frost.v3']`（v0.2.17 及更早的旧参数
不再沿用 —— 旧"毛玻璃"是贴图假效果，参数调得很重，直接带进新效果会很生硬）。

> 布局诊断通道：前端把「消息区/输入区/共同父容器」的真实几何上报到
> `/dsh-ui-beautify/diag`，从 `/dsh-ui-beautify/diag.json` 可读回（内存态、不落盘）。
> 用途：调这类要精确到元素几何的效果时，开发侧能直接读真实 DOM，不必靠猜。

### 黑白剪影图与文字的分辨（实测结论）

黑白剪影图（大面积白底 + 中央黑色剪影）**不能直接叠加**，但非常适合「纹理」：

- **白色区域**：乘 1 不变 → 文字完全不受影响；
- **黑色剪影 / 水面**：会把深色文字一起乘黑 → 文字消失。

实测（文字基色 `#0f1115`，按 `multiply` 铺满整屏，用真图逐像素计算）：

| 浓度 | 文字平均亮度 | 全屏不可读 | 中央剪影区不可读 |
|---|---|---|---|
| 0.3 | 14.3 | 0.0% | 0.0% |
| **0.4** | **14.1** | **0.0%** | **0.0%** ← 安全上限 |
| 0.5 | 13.8 | 6.8% | **41.4%** ← 悬崖 |
| 1.0 | 12.6 | 7.2% | 43.2% |

原因：黑色区域乘完的文字亮度 ≈ `文字亮度 × (1 − 浓度)`。浓度 0.4 时剩 9（勉强可读），
0.5 时掉到 7.5（不可读）。

**结论：想要"文字零损失"，纹理模式浓度 ≤0.4** —— 剪影以柔和灰影呈现，文字保持可读。
本插件**出厂默认取作者本人的实机口味 0.49**（比 0.4 更"重"一点，白底正文依然清晰，
只有中央剪影区会明显压暗）；觉得字发灰就把浓度滑块往左拖，或直接切「关闭」。

### 图片切换

每张候选图都是**「桌面优先 → 包内兜底」**：桌面上有同名图就用桌面那张（可自行
换图），没有就用包里自带的那张。所以**换台电脑不用先把图拷到桌面**，切换器里永远是
两个选项。

| 切换器里显示 | 桌面文件名（优先） | 包内兜底文件 |
|---|---|---|
| `deepseek` | `deepseek 4k.png` | `assets/deepseek-4k.webp`（v0.7.0 起 WebP） |
| `deepseek 黑白无水面` | `deepseek 黑白无水面.png` | `assets/deepseek-bw-nowater.webp`（v0.7.0 起 WebP） |

> 只保留这两张：`deepseek 4k.png` 的按钮文字显示为 **`deepseek`**（文件不用改名）；
> `deepseek.png` 与 `deepseek 黑白.png` 已从候选里移除（即使桌面上还留着也不会出现）。
>
> **v0.2.31 修复**：此前只有 4k 那张带包内兜底图，黑白图**只**从桌面读 —— 换台电脑
> 没把 `deepseek 黑白无水面.png` 拷过去时，切换器里就只剩一个 `deepseek`。现在两张
> 都随包发布（包内文件名用纯 ASCII：`deepseek-4k.webp` / `deepseek-bw-nowater.webp`，
> v0.7.0 起是 WebP），桌面上有图时仍然优先使用桌面图。
>
> 对外的**身份名**始终是桌面候选名（`deepseek 黑白无水面.png`）：切换器的按钮高亮、
> localStorage 偏好、`?img=` 参数都用它，不因图片来源而变；旧存档里的**包内文件名**
> （`deepseek-4k.png` / `deepseek-4k.webp` 以及对应的黑白那两个）也做了别名兼容，
> 不会被当成"已下架"。

切换器里有「图片」一行按钮，点一下即换（不刷新页面），选择会被记住。
推荐 **`deepseek 黑白无水面.png`** —— 实测它最干净：浅色占 90.2%、中间调只有 2.8%
（黑白两极化、没有灰雾），比带水面的版本对比更利落。

> **v0.2.14 修复**：中文/带空格的图片名（`deepseek 黑白无水面.png` 等）此前切不过去 ——
> `/bg.png` 的响应头 `ETag` 里直接放了文件名，而 Node 的 HTTP 头只能是 Latin-1，
> 中文会让 `writeHead` 抛 `ERR_INVALID_CHAR`，被外层兜成 **400**，于是图加载失败。
> 现在 ETag 改用文件名的 sha1 摘要（纯 ASCII），中文名的图正常返回 200。
> 回归护栏：测试会断言 `/bg.png` 的所有响应头都是 ASCII。

### 怎么切换：拖到顺手的位置的小入口（v0.2.13 起）

页面左上角有一个常驻小胶囊（默认位置 `10, 10`，与 v0.2.11 相同），
显示当前状态；点一下开/关设置面板，**按住可以拖到任意位置，松手即记住**：

```
┌──────────────┐
│ ● DSH UI · 纹理 │  ← 默认在左上角；按住拖动即可换位置，重启后仍保持在放置的位置
└──────────────┘
```

点开后，面板就在它正下方展开：

```
DSH UI Beautify · 切换
[关闭] [纹理] [背景]
图片  [deepseek] [deepseek 黑白无水面]                    ← 纹理/背景模式显示
浓度  ──────●──────  49%                                     ← 纹理/背景模式显示
动效  [关]  帧率见诊断                                        ← v0.7.0，默认关
毛玻璃 [开]  模糊 ───●─── 2px   白层 ───●─── 20%                 ← 纹理/背景模式都显示（v0.4.0 起）
面板边缘/内部 ───●─── 94%  ───●─── 80%                        ← 同上（二级面板用）
气泡透明度 ───●─── 45%  气泡颜色 [■] 原色  气泡模糊 ───●─── 12px    ← 同上
DSH 面板模糊 ───●─── 20px                                      ← 同上
薄纱  ●───────────  0%                                       ← 仅背景模式显示（v0.6.2 起 1% 一档）
提示：浓度建议 ≤0.5；模糊越大越像玻璃。                       ← 背景模式提示薄纱/垫底
[关闭面板]
```

- **位置可自由拖动**：按住胶囊拖动即可；松手写入 `localStorage['__dshui.pill']`，
  **刷新 / 重启后仍在原处**；面板始终贴在胶囊正下方（拖动胶囊时面板跟着走）；
- **面板不会乱窜**（v0.2.26 修复）：面板每次操作都是"就地重建"（同步高亮/滑块），
  新节点出生时带的是默认坐标 `12,52` —— 重建后必须重新贴回胶囊下方，否则一操作
  就会跳回左上角。现在开面板、切模式、换图、开关毛玻璃、重新打开都由同一个
  `placeSwitcher()` 统一贴位，并把面板夹在视口内（不会跑到屏幕外）；
- **不会误触**：拖动位移超过 4px 就只算拖动，松手不会顺手把面板打开；
- **拖不出屏幕**：位置会自动夹在视口内；换窗口大小、侧栏折叠后也不会跑到屏幕外；
- **入口常驻**：即使处于「关闭」也保留（否则就没有入口再打开面板了）；
  只有 `__DSHUI__.uninstall()` 才会把它一起移除；
- **零侵入**：入口是 `position: fixed` 的独立节点，不参与页面布局、不拦页面事件；
- **三个按钮**：关闭（恢复默认）/ 纹理 / 背景（v0.3.0 起，图垫底）；
- **浓度滑块**：0% ~ 100% 连续可调，拖到哪停到哪，实时生效；
- **操作后面板保持打开**，方便反复调，只有点「关闭面板」才收起来；
- 图片、模式、浓度都会记住，下次启动还是原样。

> 应急开关：地址带 `#dshui-off`（旧名 `#dsniang-off` 同样有效）时，连这个入口都不会出现。

快捷键（v0.2.11 起改为**后备手段**，平时不需要记）：

| 快捷键 | 效果 |
|---|---|
| `Ctrl+Shift+Alt+1` | 关闭（恢复默认） |
| `Ctrl+Shift+Alt+2` | 纹理（multiply） |
| `Ctrl+Shift+Alt+D` | 打开/关闭切换面板（后备用） |
| `Ctrl+Shift+Alt+I` | 完整诊断 |
| `Ctrl+Shift+Alt+M` | 动效总开关（v0.7.0，默认关） |

> 另有一个**独立插件** `dsh-reload-ui`（独立目录，不在本仓库）：`Ctrl+Shift+Alt+R` 一键重载界面
> （DSH 桌面版没有刷新快捷键，改完插件想立刻看到效果时用）。

> 桌面端没有浏览器地址栏，所以下面的 URL 形式只适用于**网页端** DSH；
> 桌面端请用左上角入口或控制台 API。

### 控制台 API（等价）

```js
__DSHUI__.modes                        // ['overlay','multiply','luminosity','backdrop','off']（面板只显示 关闭/纹理/背景）
__DSHUI__.switcher()                   // 打开悬浮切换面板
__DSHUI__.setMode('multiply')          // 纹理
__DSHUI__.setMode('off')               // 关闭（恢复默认）
__DSHUI__.setOpacity(0.49)             // 设置纹理模式的浓度
__DSHUI__.setScrim(0.01)               // 白色薄纱强度（0~0.9，v0.6.2 起 1% 一档都够得着）
__DSHUI__.setFrostAlpha(0.05)          // 毛玻璃白层（2%~85%）
__DSHUI__.setMotion(true)              // 动效总开关（v0.7.0，默认关；Ctrl+Shift+Alt+M 同效）
__DSHUI__.motion()                     // 帧探针读数 {fps, frameMsP95, dropped, longFrames, animating, …}
__DSHUI__.reapply()                    // 一键重贴（v0.6.3）：背景/玻璃/遮挡全部重认一遍，不用刷新页面
__DSHUI__.wallpaper()                  // 壁纸体检（v0.6.4）：壁纸还在不在、被谁盖住了、修复了没有
__DSHUI__.uninstall()                  // 立刻撤销全部改动
```

模式偏好存在 `localStorage['__dshui.mode']`，刷新后保持。

<details>
<summary>网页端可用：直接改地址栏</summary>

```
http://127.0.0.1:19387/?dshui=multiply          ← 纹理
http://127.0.0.1:19387/?dshui=off               ← 关闭
http://127.0.0.1:19387/?dshui=multiply&scrim=0.25   ← 纹理 + 白色薄纱
```

</details>

## 为什么 v0.2 不会再弄坏界面

v0.1 的病根是**改了页面元素的布局属性**（`position: relative`、`overflow: hidden`）。
v0.2 立了三条硬规则，并且写成了自动化测试：

1. **默认零侵入。** 纹理模式只往 `document.body` **追加**一个
   `position: fixed; pointer-events: none` 的层，
   页面里已有元素的 `position` / `overflow` / `z-index` / `display` / 尺寸
   **一个都不改** —— 有专门的测试逐元素快照比对来守这条线。
2. **任何模式都只动这一个图层**，不修改页面已有元素的任何属性
   （毛玻璃时代曾改过 `position` / `isolation`，已随该功能一并删除）。
3. **任何异常都只记一笔日志**，不抛出、不中断；`uninstall()` 可撤销一切。

其它安全边界：

- 只有在真正的 DSH 页面（存在 `#root`）才动作；
- URL 带 `#dshui-off` 时，即使脚本被注入也直接不动作（应急开关；旧名 `#dsniang-off` 同样有效）；
- 不 `preventDefault`、不 `stopPropagation`，不抢页面任何交互。

## 出厂默认值（v0.8.0）

| 项目 | 出厂默认 | 存在哪 |
|---|---|---|
| 启动模式 | **关闭**（一点不改页面；点「纹理」才生效） | `localStorage['__dshui.mode']` |
| 纹理浓度 | **0.49** | `localStorage['__dshui.opacities']` |
| 背景模式浓度 | **0.5**（0.3.2 起，图一眼可见；真机再调） | 同上（`backdrop`） |
| 主题薄纱 | 亮色=白纱 / 暗色=深纱（`rgba(12,14,18)`），强度 0；背景模式下面板有「薄纱」滑块（**0%~90%，1% 一档**；v0.3.1 起，v0.6.2 起步长从 5% 降到 1%） | `localStorage['__dshui.scrim']` |
| 背景图 | **`deepseek 4k.png`**（面板上显示 `deepseek`） | `localStorage['__dshui.image']` |
| 毛玻璃 | **开** | `localStorage['__dshui.frost.v3']` |
| 毛玻璃模糊 | **2px** | 同上 |
| 毛玻璃白层 | **20%**（可拖 **2%~85%**；v0.6.2 起下限从 15% 降下来） | 同上 |
| 二级面板白层（边缘/内部） | **94% / 80%**（径向渐变两端；面板上两个滑块可调 **10%~100%**，v0.6.2 起下限从 30% 降下来） | 同上（`panelTop` / `panelBottom`） |
| 气泡透明度 | **45%**（0% = 不透明/DSH 原样，100% = 全透明；面板滑块可调） | 同上（`bubbleTransparency`） |
| 气泡颜色 | **跟随气泡原色**（面板取色器可自选，存 `#rrggbb`） | 同上（`bubbleColor`） |
| 气泡模糊 | **12px**（面板滑块可调，0~30px） | 同上（`bubbleBlur`） |
| 开屏动画 | **开**（页面加载时播放莱因生命风格开屏；面板可关；`?splash=0` 或系统「减弱动态效果」时跳过） | `localStorage['__dshui.splash.v1']` |
| 动效 | **关**（v0.7.0 总开关，默认关；`Ctrl+Shift+Alt+M` 或面板按钮；系统「减弱动态效果」/ 失焦自动暂停） | `localStorage['__dshui.motion.v1']` |
| DSH 面板模糊 | **20px**（「DSH 面板模糊」滑块可调，0~30px；只影响 DSH 自己的重命名窗/菜单） | 同上（`dshBlur`） |
| 入口胶囊位置 | 窗口左上角 `10, 10` | `localStorage['__dshui.pill']` |

> 只有**没有任何存档**（全新 profile / 清过 localStorage）时才用这些值；一旦滑块被调整过，
> 以存档为准。想让「纹理」也成为启动默认，把 `lib/client.js` 里 `readMode()` 的兜底
> 返回值从 `'off'` 改成 `'multiply'` 即可（一行）。

## 安装

### 从 zip 安装（换机器 / 给别人）

1. 解压 `dsh-ui-beautify-0.8.6.zip` → 得到 `dsh-ui-beautify/` 目录
   （里面是 `package.json` / `cordis.patch.yml` / `lib` / `assets`（**两张兜底图都在包里**）/
   `test` / `scripts/uninstall-cleanup.ps1`（卸载后自检）/ `README.md`（本文件）/ `HANDOFF.md` / `LICENSE`，
   共 28 个条目（含开屏动画与 `restart/` 壳补丁工具）；
2. 放到一个**不会被随手删掉**的目录（路径建议纯英文，例如 `D:\dsh-plugins\`）；
3. 用官方插件通道安装，`target` 指向解压出来的目录：
   `pluginManager.installBundle('file:D:\\dsh-plugins\\dsh-ui-beautify')`
   （等价于 `dsh plugin add file:...`）；
4. **重启 DSH 客户端**（bundle 层栈只在启动时收集一次）；
5. 背景图不必拷到桌面：包里自带两张兜底图，桌面上有同名图时优先使用桌面图；
   想自检：解压目录里 `node test/host.test.mjs && node test/client.test.mjs` 应全绿。

### 安装会写到哪几处

官方通道安装后（`pluginManager.installBundle` → 内部就是 `dsh plugin add` 的 pnpm 路径）
会留下三处登记 —— 这三处齐全才不会被插件管理器当成**野条目**清理掉（v0.1 就是栽在这里）：

- `<profile>/node_modules/dsh-ui-beautify` → 指向插件目录的 junction；
- profile `package.json` 的 `dsh.profile.bundles` + `dependencies`；
- `pnpm-lock.yaml` 的 importer 记录。

生效需要**重启 DSH 客户端**（bundle 层栈在启动时收集一次）。
想确认装没装：`pluginManager.listBundles()` 里能找到它，或核对上面三处。

## 卸载（三条路，任选）

**1. 最快：临时关掉（不用重启、不用卸载）**

```js
__DSHUI__.setMode('off')     // 或把地址改成 ...#dshui-off 再刷新
```

**2. 正式卸载（推荐）**

在 DSH 里：设置 → 插件 → 找到 `dsh-ui-beautify` → 卸载 /
或在插件管理器里执行 `pluginManager.removeBundle('dsh-ui-beautify')`。

**3. 手动兜底（前两条都不可用时）**

`.rollback/` 里保存了安装前的 profile 配置副本（`package.json`、`cordis.yml`、
`cordis.patch.yml`、`pnpm-lock.yaml`）。恢复步骤：

```powershell
# 1) 还原配置
Copy-Item .rollback\* "$env:USERPROFILE\.dsh\profiles\desktop\" -Force
# 2) 删除链接（只删链接，不动插件目录）
cmd /c rmdir "$env:USERPROFILE\.dsh\profiles\desktop\node_modules\dsh-ui-beautify"
# 3) 重启 DSH
```

## 外部副作用声明（按《DSH 插件作者安装卸载与外部副作用规范建议 v0.1》§3.2）

本插件是**纯 Cordis 插件**（宿主半边 + 页面半边各一个文件），不碰安装目录：

| 声明项 | 本插件实际情况 |
|---|---|
| 改了哪些文件 | **没有**。不改 `DSH 安装目录/resources/app.asar`、不改注册表 / 计划任务 / 文件关联 / 环境变量 / 端口 |
| 运行时会写什么 | 只在页面里：`<style>`（静态生成）、自己的图层/胶囊/面板节点、`<body>` 与气泡上的 CSS 变量 / 类名。全部逐字可还原 |
| 是否可在线还原 | **是**。`__DSHUI__.uninstall()` 或面板切「关闭」，不需要重启 DSH |
| 是否需要 DSH 完全退出 | **不需要**（这与壳补丁类插件不同） |
| 备份位置 | 无外部备份。包内 `.rollback/` 是**安装前 profile 配置的本机副本**（只在手动兜底卸载时用） |
| 反向操作 | 插件管理器里卸载（推荐）；或 `__DSHUI__.uninstall()` 立即撤销效果；或 README「卸载」的三条路 |
| 用户数据 | `localStorage` 的 `__dshui.*` 键，**卸载默认保留**（见下） |
| 网络 | **无外部网络请求**。只有本机回环的 6 条只读路由（`/dsh-ui-beautify/*`） |
| 常驻进程 / daemon | 无。不用 `child_process`；页面侧的定时器与观察器都在 `uninstall()` 里清干净 |
| 桌面壳补丁（可选） | 仅当你主动运行 `restart/install-restart-key.cmd` 时，会改 `app.asar` 的 `lib/main.js` / `lib/preload-app.cjs` 两个已存在条目（BEGIN/END 标记 + 双 SHA 备份 + 可逐字节还原；必须 DSH 完全退出）；插件本体与开屏动画不碰 app.asar |

### 用户数据（默认保留，清除必须显式）

| 键 | 内容 |
|---|---|
| `__dshui.mode` | 当前模式（关闭 / 纹理 / 背景） |
| `__dshui.opacities` | 各模式浓度 |
| `__dshui.scrim` | 背景模式薄纱强度 |
| `__dshui.frost.v3` | 毛玻璃（开关 / 模糊 / 白层 / 面板白层 / 气泡 / DSH 面板模糊） |
| `__dshui.motion.v1` | 动效总开关（默认关） |
| `__dshui.splash.v1` | 开屏动画开关（默认开） |
| `__dshui.pill` | 胶囊位置 |
| `__dshui.image` | 当前壁纸 |

卸载**不会**删除这些键（下次装回来设置还在）。

> 更名时，旧前缀 `__dsniang.*` 的键会被**自动复制**到 `__dshui.*`（旧键保留，便于回滚到 0.7.x 后再清）。要清干净：打开 DSH 页面 → 控制台执行

```js
Object.keys(localStorage).filter(k => k.indexOf('__dshui.') === 0).forEach(k => localStorage.removeItem(k))
```

### 卸载后自检与清理（§3.4 / §3.6）

官方卸载走 pnpm，有两个已知现象：**可能静默数分钟**（registry 重试，属正常）与 **`node_modules/<包名>` 联接可能残留**
（2026-10-17 实测遇到过）。等官方移除**完全结束**后，跑包内脚本做自检 + 清理：

```powershell
# 先看会做什么（不改任何文件）
powershell -ExecutionPolicy Bypass -File .\scripts\uninstall-cleanup.ps1 -DryRun

# 官方移除完成后：四件套自检 + 清理残留联接 + 打印证据清单
powershell -ExecutionPolicy Bypass -File .\scripts\uninstall-cleanup.ps1

# 用户数据想清掉时，脚本会打印对应的 localStorage 命令
powershell -ExecutionPolicy Bypass -File .\scripts\uninstall-cleanup.ps1 -PurgeData
```

脚本特性（对应规范 §3.1 / §3.4 / §3.6）：**幂等可重入**（连跑两次第二次只输出"已是目标状态"）、
**-DryRun 不改任何文件**、四件套（`package.json` 的 bundles/dependencies、`pnpm-lock.yaml`、
`node_modules/.modules.yaml`、`cordis.yml`）逐项断言、残留联接**只删链接不删目录**、
全程写日志（`~/.dsh/dsh-ui-beautify-uninstall.log`）、退出码约定：

| 退出码 | 含义 |
|---|---|
| 0 | 成功（含"已是目标状态"） |
| 1 | 失败 |
| 2 | 参数错误 |
| 3 | 等待超时（官方移除还没结束） |
| 4 | 校验失败（四件套仍引用本包） |

> 也提供一段可手动抄的自检命令，见脚本内注释；核心是：四件套里搜不到包名 + `node_modules` 里没有它的联接。

## 作者自测清单（规范 §5 适配版）

**安装**
- [ ] 全新 profile 下按 README「从 zip 安装」一次成功，重启后在插件列表能看到
- [ ] 重复安装无副作用（幂等）

**卸载**
- [ ] 插件管理器卸载能移除依赖与层（`node_modules` 联接若残留，用 `scripts/uninstall-cleanup.ps1` 清）
- [ ] `uninstall-cleanup.ps1 -DryRun` 不改任何文件
- [ ] `uninstall-cleanup.ps1` 连跑两次，第二次输出"已是目标状态"（退出码 0）
- [ ] 卸载后四件套 + 联接断言全部通过

**外部副作用 / 兼容 / 安全**
- [ ] 无 app.asar / 注册表 / 计划任务 / 环境变量 / 端口改动（本插件为纯 Cordis 插件，见上表）
- [ ] `engines`（node / dsh）、`repository`、版本号三处一致
- [ ] 无裸 `child_process`、无 daemon、不抢 single 槽
- [ ] 卸载默认不动用户数据，清除方法在 README 写明
## 诊断（不需要控制台、不需要粘贴代码）

三种方式任选：

1. 按 **`Ctrl + Shift + Alt + I`**；
2. 连点聊天背景**三下**；
3. 地址末尾加 `#dsniang-diag` 再刷新。

面板会显示：模式、状态、背景源、层是否挂载、当前浓度、动效状态与帧率、壁纸体检、最近错误。带「关闭」按钮。

## 动效（v0.7.0 底座与帧时间探针）

**底座与帧探针已就位；装饰性动效已确定"先不做"**（2026-10-17 定案，开关保持默认关）。
已经铺好的是：

- **总开关**：默认**关**（面板「动效：开/关」按钮 / `Ctrl+Shift+Alt+M` / `__DSHUI__.setMotion(true)`），
  存档在 `localStorage['__dshui.motion.v1']`。之后所有装饰动效都必须从 `motionAllowed()` 走，
  不许各自 `setInterval` / 裸 rAF。
- **自动暂停**：系统「减弱动态效果」（`prefers-reduced-motion`）或**窗口失焦/隐藏**时动效自动停。
- **帧时间探针**（使用者没有 DevTools，这是验收动画性能的唯一手段）：`requestAnimationFrame` 量**真帧时间**，
  **只在有动画在跑时采样**（不空转耗电）。诊断面板的 **`动效:`** 那一行会显示：
  `开 · 采样中 63fps · P95 17ms · 掉帧 1 · 长帧 2`；`diag.json` / `status()` 里有同款
  `motion { fps, frameMsP95, dropped, longFrames, animating, paused, reduced }` 字段。
- 现有的模式切换淡入淡出、毛玻璃补间都已接入探针（0.7.1 删掉了"气泡浮层"，那个常驻 rAF 循环也随之消失） —— 开面板切一次模式，
  立刻能看到一次真实帧率读数。

> 帧率健康线（供参考）：`fps ≥ 55` 且 `P95 ≤ 22ms` 算顺滑；`长帧 > 0` 表示出现过 > 50ms 的卡顿帧。

## 视觉更新（v0.8.2）

### 毛玻璃：径向渐变（内透外亮）+ 外阴影

用户 2026-10-20 的视觉方向：**边框内由内向外逐渐变亮（内部稍微比边边透明，白层更淡）；边框外淡淡的阴影**。

- 主表面（输入卡片）：`radial-gradient` 内部 = 边缘 alpha × 0.55；白层默认 **20%**（原先 25%）；
  边缘 1px 高光 + 外阴影 `0 10px 30px rgba(17,18,20,.10)`；
- 二级面板：`radial-gradient` 内部 80% → 边缘 94%（原竖向 97→83），外阴影 `0 14px 36px`；
- 注：曾尝试「上下颠倒」（渐变焦点上下翻转），实际观感差异太小，**已移除**。

### 纹理模式气泡视觉（v0.8.5）

纹理模式（multiply）下，「你发的消息气泡」和「输入卡片」新增一层纸感视觉（**不含蓝色竖条**，按反馈已删）：

- **顶部高光**：`linear-gradient(180deg, rgba(255,255,255,.34) 0%, 0% 62%)`；
- **1px 内高光**：`inset 0 0 0 1px rgba(255,255,255,.55)` + 顶部细线 `inset 0 1px 0 rgba(255,255,255,.45)`；
- **柔和投影**：`0 4px 12px rgba(17,18,20,.08), 0 12px 28px rgba(17,18,20,.07)`；
- 只写 `background-image` / `box-shadow` 两条属性：**不改底色、字色、尺寸、边框宽度** → 零布局、文字对比度不变；
- 作用范围：**用户气泡 + 输入卡片**（输入卡片保留原有径向玻璃渐变，再叠同样高光/投影）；助手回复没有气泡底，不加；
- 只在纹理模式启用（背景模式仍是原来的玻璃配方）；面板「气泡视觉：开/关」可实时开关并持久化；API：`__DSHUI__.setBubbleFx(true/false)`。

### AI 思考过程视效（纹理 / 背景模式，v0.8.5）

「AI 思考过程区域」= **左侧 AI 的整段回复 + 其中每一行思维链步骤**（不是输入框，也不是你发的右侧气泡）。纹理（multiply）和背景（backdrop）两种模式都生效，面板开关同样两种模式都显示。

- 整段回复：左侧一条 **2px 主题色细线** + 很淡的横向渐变（左 5.5% → 34% 处淡出）；
- **每一行思维链步骤**（`turn-process` 里的步骤行）同样加左侧细线 + 渐变；
- **每行更新时从左侧淡入**：`@keyframes __dshui-ai-line-in`（`translateX(-8px)` + 透明度，300ms `cubic-bezier(0.33,1,0.68,1)`）；
- 动画**默认就播**（不再要求「动效：开」）：系统「减弱动态效果」时自动关闭，窗口失焦时暂停；关键帧只做 6px 位移、**不改文字透明度**；
- 不包卡片、不加内边距 → **零布局**；只作用于助手回复与思考步骤（用户消息 `kind=user`、思考组容器不受影响）；步骤行选择器对 DSH 的 `turn-process` / `step-process` / `step-process-body` 多属性兜底；
- 面板「**AI 思考过程视效：开/关**」可实时开关并持久化；API：`__DSHUI__.setAiReplyFx(true/false)`；
- 诊断（`Ctrl+Shift+Alt+I`）显示「AI 思考过程视效: 开 · 已生效（回复 N 处 / 思考行 M 处）」，数值为 0 说明当前页面没匹配到对应节点；

### 读取 AI 思维链 + 逐行重播（v0.8.5）

插件只读 DOM 即可拿到 AI 思考链（不碰 React 内部状态、不写回文字）：

- 思维链行 = DSH 的 `[data-variant="think"]` / `[data-variant="others"]` 等步骤行（`[data-step-process]`、`[data-step-process-body]`、`[data-turn-process]` 多路兜底）；
- 读取：`__DSHUI__.thinkingRows()` → `{ count, rows:[{text, variant}], replayCount }`（text 为去空白后的 120 字摘要）；
- 动画：`MutationObserver` 监听思维链新增行 / 行内流式文字更新 → 对该行重播 `__dshui-ai-line-in`（左侧滑入 300ms）；行级节流 500ms，避免流式 token 每帧抖动；
- 关键帧只做 `translateX(-6px) → 0`，**不改变文字透明度**（此前 35% 透明度会让思考文字发虚，已移除）；
- 诊断（`Ctrl+Shift+Alt+I`）与 `/diag.json` 会带上 `stepTargets`、`aiReplayCount` 以及前几行的 `text` 摘要、计算出的 `opacity`/`animation`，可直接验证“能不能读到思维链”。

### 输入框毛玻璃加强（v0.8.5）

- 纹理模式下输入卡片的高光/投影更明显：顶部高光 50% → 0%（到 72% 处淡出）、1px 内高光 + 顶部细线；
- 外投影加强为 `0 6px 18px rgba(17,18,20,.12) + 0 18px 40px rgba(17,18,20,.10)`，并额外 `backdrop-filter` +2px 模糊、`saturate(1.35)`；
- 依旧只写 `background-image` / `box-shadow` / `backdrop-filter`，零布局。

### 思维链（保持 DSH 原样）

- 曾试过把普通操作步骤染成橘黄 `#ff7b00`、报错保持红；**用户反馈不好看，已移除** ——
  思考/步骤区域完全保持 DSH 原色（报错仍是 DSH 自己的红色），本插件不再覆盖任何 `data-variant` 颜色。

### 方块光标（命令提示符风格）

- 输入区（`div[data-composer-input]`，Lexical contenteditable）的原生 caret 隐藏，叠一个 **8×18 半透明玻璃小方块**：主题色 = 开屏首屏 accent `#3964fe`，**55% 不透明度**（`--dshui-caret-alpha` 可调），1px 同色细边框、2px 圆角、柔光 + `backdrop-filter: blur(1.5px)`，**1.2s** `steps(1)` 闪烁；
- 用选区 `Range.getBoundingClientRect()` 实时定位，方向键/输入/点击/滚动都会跟随；量不到时回退输入区左上角；
- 仅在插件激活（纹理/背景模式，样式表在）时启用；`getSelection` 不可用时自动保留原生光标；卸载即移除。

> 说明：以上风格化随插件激活（「关闭」模式仍保持 DSH 原样）；开屏/重启键等其它功能不受影响。

## 开屏动画（v0.8.0）

页面加载时先盖一层**莱因生命风格**的开屏序列（黑幕标识 → 过曝洗白 → 技术档案 HUD → 六步授权 →
白闪硬切进会话），放完自动淡出、移除，零残留。它和模式**无关**：只要插件在，默认就会放。

- **播放条件**：默认开；`prefers-reduced-motion: reduce` 自动跳过；地址带 `#dshui-off`（应急开关）跳过；
  `?splash=0` 强制关、`?splash=1` 强制开（调试用）。
- **面板控制**：入口面板里「开屏动画：开/关」切换（持久化到 `__dshui.splash.v1`），旁边「↻ 重播」可随时预览。
- **控制台 API**：`__DSHUI__.splash.replay()` / `.skip()` / `.setEnabled(true|false)` / `.config()`。
- **隔离方式**：开屏页是**同源 iframe**（`/dsh-ui-beautify/splash.html`，宿主给 `assets/splash.html` 注入桥接脚本），
  样式与脚本完全隔离，不碰 DSH 页面的 CSS；放完 / 跳过 / 30s 超时兜底后节点直接移除。
- **避开 Windows 窗口按钮**：开屏页顶部的品牌 / 步骤计数 / SKIP 与 WELCOME BACK 卡片会按实际标题栏高度
  （`navigator.windowControlsOverlay` → `--dsh-windows-titlebar-height` → 菜单栏矩形，兜底 40px）整体下移，
  不会被「最小化 / 最大化 / 关闭」挡住。
- **开屏期间隐藏自己的 GUI**：开屏播放时胶囊与面板整体隐藏（它们和开屏 iframe 同为最大 z-index，胶囊后插入会"漏"到开屏上），
  播完自动恢复；开屏期间点背景不会触发淡出。
- **WELCOME BACK 卡片**：开屏播完进入会话后，右上角会淡入一张小卡片（显示本机登录名，约 3.6s 自动淡出；
  关开屏 / `?splash=0` 时不出现）。卡片由插件在真实页面上绘制（开屏页自带的卡片在 iframe 的 mock 界面里，\n  集成态看不到，所以移到页面层实现）。
- **换开屏**：替换包内 `assets/splash.html` 即可（文件保持单文件自包含）；宿主只做注入，不改源文件。
- **诊断**：面板 / `diag.json` 里有 `开屏:` 一行（播放中 / 已播放完 / 已跳过 / 已关闭 / 超时兜底 + 耗时），
  `status()` 里有结构化的 `splash` 快照。
- **音效**：默认关（启动时无用户手势，浏览器自动播放策略本来也会静音）；想开可改开屏页配置里的 `sound`。

> 开屏页来源：用户提供的「DSH 开屏 v2.4 · 莱因生命风格」，结构参考 dsh-startup-screen（MIT）并按其自身版本说明迭代；
> 插件侧只负责挂载/配置/回收，源文件可独立迭代。

## 重启键（v0.8.0）

标题栏「应用」「编辑」右边会出现一个 **「重启」** 按钮：点一下 = 干净重启**应用 + Host**
（等价于开发模式的「重启应用与 Host」菜单项）。

- **按钮 UI 已内置在本插件**：往桌面壳 preload 挂的 shadow-DOM 菜单栏注入按钮；
  中英双语、方向键切换、重复注入幂等、卸载即摘除；
- **真重启能力需要桌面壳补丁**（唯一改 `app.asar` 的部分）：**不用再手动找脚本** —— 面板里点
  「**启用重启键**」即可：插件会启动随包安装器，你只需右键托盘**完全退出 DSH 一次**；
  后台会等退出 → 备份原始头部 → 打补丁（只改 `lib/main.js` / `lib/preload-app.cjs` 两个已存在条目）→
  双 SHA 校验 → 自动重启 DSH，之后标题栏「重启」即可用；卸载仍可用 `restart/uninstall-restart-key.cmd` 逐字节还原；
- **没装壳补丁时**：按钮仍在，点击会弹明确提示告诉你装补丁（不静默失败）；
- **面板入口**：入口面板里也有「↻ 重启 DSH」（标题栏不可用时兜底）；
- **诊断**：`开屏:` 与 `重启:` 行；`__DSHUI__.restart.state() / click() / bridge()`；
- **平台**：仅 Windows 桌面端（网页版无按钮，属正常）。

> 外部副作用：插件本体仍是**纯 Cordis 插件**，不碰 `app.asar`；只有你主动双击
> `restart/install-restart-key.cmd` 才会修改那两个已存在条目（带 BEGIN/END 标记、
> 双 SHA 备份、可逐字节还原）。详见 `restart/README.md`。

## 背景图怎么换

直接替换桌面上的 `deepseek 4k.png` 后**刷新页面**（宿主按 mtime 重读，
不用重启、不用重装）。桌面图不存在时自动退回包内 [assets/deepseek-4k.webp](assets/deepseek-4k.webp)（v0.7.0 起包内兜底换成 WebP，体积 1.6 MB → 0.18 MB）。

> 改 `lib/client.js` 后只需刷新页面；改 `lib/index.js` 或安装/卸载才需要重启。

## 构成

```
dsh-ui-beautify/
├── package.json          # 插件清单（dsh.bundle.patch 指向挂载声明）
├── cordis.patch.yml      # 挂载声明：把插件插进 profile 配置树
├── lib/
│   ├── index.js          # Host 半区（Node）：6 条只读路由 + 脚本注入
│   └── client.js         # Client 半区（浏览器）：图片层 + 交互
├── assets/               # 包内兜底图（v0.7.0 起是 WebP，两张都在包里，换台电脑也有两个选项）
│   ├── deepseek-4k.webp
│   └── deepseek-bw-nowater.webp
├── test/                 # 离线测试（不需要浏览器 / 不需要起 DSH）
├── tools/                # 开发辅助脚本（**不进 zip**）
├── LICENSE               # MIT（随包分发）
├── HANDOFF.md            # 给下一个接手者的接力记录（开发向，**在 zip 里**）
└── .rollback/            # 安装前的 profile 配置备份（卸载兜底用；不进 zip、不进 git）
```

### Host 半区提供的接口

| 路由 | 作用 |
|---|---|
| `GET /dsh-ui-beautify/status.json` | 报告背景图解析结果（来源、文件名、字节数、URL） |
| `GET /dsh-ui-beautify/bg.png` | 背景图字节（路径固定叫 `bg.png`，`Content-Type` 按**字节魔数**给：桌面原图 PNG / 包内兜底 WebP 都能正确解码；带 ETag，命中返回 304） |
| `GET /dsh-ui-beautify/client.js` | 前端半区脚本 |
| `GET /dsh-ui-beautify/diag` | 前端布局诊断上报入口（只收数据，返回 204） |
| `GET /dsh-ui-beautify/diag.json` | 读回最近一次布局诊断（内存态、不落盘） |

两条注入通道：桌面端走 `webserver/index-inject` 结构化行（内联 script，
自己吞掉 `onerror`，**最坏只是美化不生效，绝不会挡住应用启动**）；
网页端走 `ctx.webServer.tapIndex`。

## 开发与测试

```powershell
cd <解压出来的目录>\dsh-ui-beautify
node test\host.test.mjs     # 24 项：路由、栅栏、注入、卸载、脚本语法、桌面图优先与包内兜底（WebP）、别名、动效摘要
node test\client.test.mjs   # 93 项：挂载、交互、淡入淡出、回归护栏、模式、毛玻璃与通透化、壁纸体检、动效底座与帧探针、卸载、诊断
```

> 想继续开发这个插件（改代码、加动效、重新打包）的**下一个 AI / 开发者**，请看
> [HANDOFF.md](HANDOFF.md)：里面有踩过的坑、不能碰的底线、真实 DSH 的 DOM 事实、打包配方与待办清单。

测试自带极简 DOM 桩（`test/fake-dom.js`，含可控时钟、`localStorage`、
以及"已定位盒子"的几何模型），所以不需要浏览器也不需要起 DSH。
其中 **「回归护栏」** 用例会在挂载前后对页面每个元素的布局相关内联样式做快照比对 ——
一旦将来有人重新引入"改布局属性"的写法，测试立刻失败。

## 版本

### v0.8.6（2026-10-21）

- **重启键集成重新适配 dsh-restart-key v1.3.1**：随包 `restart/scripts` 与 `restart/shell` 同步到 v1.3.1（含补丁所有权检测、自动还原脚本、冲突检测的脚本侧行为）；
- **修复一键启用实际不生效**：Windows 上 detached + 无控制台的 PowerShell 会静默退出（exit 0 但脚本不执行）→ 改为绝对路径 `powershell.exe` + 非 detached 启动（安装器内部再用 WMI 逃逸长驻编排进程）；
- **自动准备（Plan A）**：插件加载后自动检测壳补丁，缺失时自动准备安装器（`-SkipPlugin -NoRestart`），用户只需完全退出 DSH 一次；可用 `DSHUI_NO_AUTO_RESTART=1` 关闭；
- **重启键优先级（与 dsh-restart-key 协作）**：另一边检测到本插件会自动让路；本插件检测到对方按钮已生效时暂缓注入，并每 1.8s 复查一次（对方撤下后由本插件接手，避免双方都让路）；
- `/restart-status.json` 增加 `auto/autoResult/pluginVersion`；面板显示「壳补丁已自动准备（退出生效）」；诊断增加「独立重启插件已让路」提示；
- 测试：host 27 → **28**，client 96（新增自动准备状态展示）。

### v0.8.5（2026-10-21）

- 纹理模式新增「气泡视觉」：用户气泡 + 输入卡片的顶部高光/内高光/柔和投影（输入框玻璃再加强）；新增「AI 思考过程视效」：整段 AI 回复 + 每行思维链的左侧细线/淡渐变，并在每行更新时从左侧淡入（受动效闸门控制）；
- 测试：host 27/27 · client 94/94。

### v0.8.4（2026-10-21）

- 修复：Cordis Host 里 `process.resourcesPath` 为 undefined → `/restart-status.json` 把已装补丁误报为未安装；
  新增三级路径兜底（resourcesPath → 从 execPath 向上找 `resources/app.asar` → 常见安装路径）；
- 新增「重启键诊断探针」：页面加载后把桥是否存在、按钮是否注入、点击结果上报到 `/diag.json`（只读，不触发重启）；
- 体验：壳补丁缺失时，面板「↻ 重启 DSH」直接触发一键启用，不再只弹"去找脚本"提示；
- 说明：若插件安装时报 `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`（锁文件里的 `dsh-ops` 可选依赖），用官方 registry 安装即可；
- 测试：host 27/27 · client 93/93。

### v0.8.3（2026-10-20）

- **重启键一键启用**：面板新增「启用重启键」按钮 → 宿主 detached 启动随包壳补丁安装器，
  用户只需完全退出 DSH 一次，后台自动打补丁/双 SHA 校验/重启，不再需要手动运行 `restart/*.cmd`；
- 宿主新增 `GET /restart-status.json`（壳补丁是否已装）与 `POST /restart-enable`（带动作头，防跨站）；
- 测试：host 26/26 · client 93/93。

### v0.8.2（2026-10-20）

- 视觉更新：毛玻璃径向渐变（内透外亮）+ 外阴影 + 白层更淡。
- 输入区方块闪烁光标：开屏首屏 accent `#3964fe` 的**半透明玻璃方块**（55% 透明、细边框、柔光、1.5px 背景模糊），1.2s 慢闪。
- 思维链配色尝试已移除（用户反馈不好看，保持 DSH 原样）。
- 测试：host 24/24 · client 93/93。

### v0.8.1（2026-10-20）

- **修复**：开屏播放期间胶囊/面板会盖到开屏画面上 → 开屏期间隐藏自家 GUI，播完恢复；开屏期间点背景/点胶囊不响应。
- **修复**：点背景淡出后立刻点胶囊会卡死 → 打开面板前取消淡出（清定时器 / 摘 `is-faded`），毛玻璃观察器跳过纯自家 GUI 的 DOM 批次。
- 包含 v0.8.0 全部内容：开屏动画（音效默认开 / WELCOME BACK 卡片 / 标题栏避让）、标题栏「重启」键（按钮 UI + `restart/` 壳补丁工具）、双向冲突保护。
- 测试：host 24/24 · client 91/91 · reload-ui 6/6。

### v0.8.0（2026-10-19）

- 整合莱因生命风格开屏动画（同源 iframe + 桥接注入；面板开关/重播/超时兜底）。

## 安全基线

- 三条路由都是**只读**：只服务本插件自己的图与脚本，不写盘、不返回用户数据。
- 路由套轻量栅栏：拒绝 `Sec-Fetch-Site: cross-site`、畸形/缺失 Host、
  以及「非回环 Host + 外部 Origin」（防 DNS 重绑定）。
- 前端任何异常都只记日志，不影响页面。
