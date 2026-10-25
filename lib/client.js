/**
 * DSH UI Beautify —— Client 半区
 * ============================================================================
 * 给 DSH 页面加壁纸 + 毛玻璃的**零侵入**实现（项目名 DSH UI Beautify；原包名 dsh-dsniang-beautify）。
 *
 * 设计原则（v0.1 把界面搞坏的教训）：
 *   **默认零侵入。** 插件往 `document.body` 追加自己的节点（全屏图片层 + 胶囊 + 面板），
 *   页面里已有元素的 position / overflow / 尺寸 / z-index 一个都不改。
 *   唯二的例外是「分层守卫分支」与「通透化」，两者都逐字节记录原值（含 !important），
 *   关闭 / 卸载时原样写回；真实 DSH 走 native 分支，一行布局都不动。
 *
 * 三种模式（面板按钮：关闭 / 纹理 / 背景）：
 *   - `off`        关闭：一切恢复默认（出厂默认）
 *   - `multiply`   纹理：乘法混合（默认浓度 0.49）+ 毛玻璃
 *   - `backdrop`   背景：图真正垫底，文字/面板都在图上 + 主题薄纱 + 毛玻璃
 *   - `overlay` / `luminosity` 仅内部保留（兼容旧存档），面板不展示
 *   关闭用 `__DSHUI__.setMode('off')`；
 *   快捷键 Ctrl+Shift+Alt+1 关闭 / +2 纹理 / +D 面板 / +I 完整诊断 / +M 动效开关。
 *
 * 安全底线：
 *   - 所有对外操作都包在 try/catch 里，异常只记日志，绝不上抛、绝不改布局；
 *   - 只有在 DSH 页面上才会启用（检测 `#root` 存在）；URL 带 `#dshui-off`
 *     （或旧名 `#dsniang-off`）时即使被注入也直接不动作；
 *   - 提供 `__DSHUI__.uninstall()`：撤销全部改动并移除自己的所有节点。
 *
 * 存储：`localStorage['__dshui.*']`。更名时会把旧前缀 `__dsniang.*`
 * 自动复制过来一次（旧键保留，便于回滚到 0.7.x）。
 *
 * 诊断：`Ctrl + Shift + Alt + I`，或地址加 `#dshui-diag` 刷新。
 */

;(function () {
  'use strict'
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  if (window.__DSHUI__ && window.__DSHUI__.version) return

  var VERSION = '0.8.45'
  var PREFIX = '/dsh-ui-beautify'
  var STATUS_URL = PREFIX + '/status.json'
  var BG_URL_FALLBACK = PREFIX + '/bg.png'
  var LAYER_ID = '__dshui-layer'
  /** 换图交叉淡化用的第二图层：叠在 LAYER_ID 上方放"新图"，淡完即撤。 */
  var LAYER2_ID = '__dshui-layer2'
  var STYLE_ID = '__dshui-style'
  var DIAG_ID = '__dshui-diag'
  var SWITCHER_ID = '__dshui-switcher'
  var PILL_ID = '__dshui-pill'
  /** 方块光标（风格化）：叠在 contenteditable 选区位置上的闪烁小方格。 */
  var CARET_ID = '__dshui-caret'
  var CARET_KEY = '__dshui.caret.v1'
  /** 方块光标光晕默认模糊（0.8.21 从 8px 降到 5px，可滑块调）。 */
  var CARET_BLUR_DEFAULT = 5
  var CARET_BLUR_MAX = 16
  var STORAGE_KEY = '__dshui.mode'
  // 0.8.22：顶层分组（关闭 / 静态 / 动态）。静态沿用原有的 纹理 / 背景 两个内部模式。
  var GROUP_KEY = '__dshui.group.v1'
  var GROUPS = ['off', 'static', 'dynamic']
  // 0.8.22：「开发中」动态模式的四个可保存定位锚点（视口百分比 0~1）。
  var ANCHORS_KEY = '__dshui.dynamic.anchors.v1'
  var GUIDES_KEY = '__dshui.dynamic.guides.v1'
  // 0.8.24：动态模式三阶段分镜（设计器导出的 version 2 JSON；可用面板「导入分镜」覆盖）。
  var DYNAMIC_LAYOUT_KEY = '__dshui.dynamic.layout.v1'
  var DYNAMIC_BG_LIGHT_URL = PREFIX + '/dynamic-bg-light.webp'
  var DYNAMIC_BG_DARK_URL = PREFIX + '/dynamic-bg-dark.webp'
  var DYNAMIC_LAYOUT_DEFAULT = {"version":2,"canvas":{"width":16,"height":9},"activePhase":"thinking","phases":{"idle":{"background":"light","backgroundTransform":{"x":0,"y":0,"scale":1},"boxes":[{"id":"titlebar","label":"标题栏","kind":"ui","x":0,"y":0,"w":100,"h":4.2},{"id":"sidebar","label":"侧边栏","kind":"ui","x":0,"y":4.2,"w":16.5,"h":95.8},{"id":"header","label":"会话头部","kind":"ui","x":16.5,"y":4.2,"w":83.5,"h":5.2},{"id":"empty","label":"空会话区（欢迎卡片/提示）","kind":"ui","x":24,"y":18,"w":52,"h":48},{"id":"composer","label":"输入卡片","kind":"composer","x":26,"y":83,"w":44,"h":13},{"id":"send","label":"发送按钮","kind":"composer","x":66.5,"y":86.5,"w":3.2,"h":3.2}],"anchors":{"bg":{"x":50,"y":50},"bubble":{"x":70,"y":80},"thinkA":{"x":26,"y":30},"thinkB":{"x":26,"y":40}}},"thinking":{"background":"light","backgroundTransform":{"x":-17.711271021546747,"y":73.77761520849961,"scale":3.1721691141982715},"boxes":[{"id":"titlebar","label":"标题栏","kind":"ui","x":0,"y":0,"w":100,"h":4.2},{"id":"sidebar","label":"侧边栏","kind":"ui","x":0,"y":4.2,"w":16.5,"h":95.8},{"id":"header","label":"会话头部","kind":"ui","x":16.5,"y":4.2,"w":83.5,"h":5.2},{"id":"transcript","label":"消息区","kind":"ui","x":47.76740644015532,"y":9.677011478647435,"w":52.23259355984468,"h":90.32298852135257},{"id":"bubble","label":"输入者气泡","kind":"bubble","x":78.28328026969177,"y":10.939326653217663,"w":20,"h":5},{"id":"thinking","label":"思考链区（展开）","kind":"think","x":48.567235089611906,"y":17.167028495416684,"w":50.777731305972324,"h":48.99203022040337},{"id":"composer","label":"输入卡片","kind":"composer","x":50.411416218622925,"y":87.70921063553966,"w":47.427987264726,"h":8.106115045362017},{"id":"send","label":"发送按钮","kind":"composer","x":94.07972047592617,"y":91.57854687490992,"w":3.2,"h":3.2}],"anchors":{"bg":{"x":32.91240896936996,"y":91.46312288371408},"bubble":{"x":87.86407980280704,"y":13.253306968468978},"thinkA":{"x":50.104286079039404,"y":22.76406539909745},"thinkB":{"x":50.15622337794975,"y":27.103924296733922}}},"output":{"background":"light","backgroundTransform":{"x":0,"y":0,"scale":1},"boxes":[{"id":"titlebar","label":"标题栏","kind":"ui","x":0,"y":0,"w":100,"h":4.2},{"id":"sidebar","label":"侧边栏","kind":"ui","x":0,"y":4.2,"w":16.5,"h":95.8},{"id":"header","label":"会话头部","kind":"ui","x":16.5,"y":4.2,"w":83.5,"h":5.2},{"id":"transcript","label":"消息区","kind":"ui","x":16.5,"y":9.4,"w":83.5,"h":73.6},{"id":"bubble","label":"输入者气泡","kind":"bubble","x":64,"y":56,"w":20,"h":5},{"id":"thinking","label":"思考链区（已收起）","kind":"think","x":24,"y":18,"w":42,"h":7},{"id":"reply","label":"AI 回复区（输出中）","kind":"ui","x":24,"y":27,"w":52,"h":46},{"id":"composer","label":"输入卡片","kind":"composer","x":26,"y":83,"w":44,"h":13},{"id":"send","label":"发送按钮","kind":"composer","x":66.5,"y":86.5,"w":3.2,"h":3.2}],"anchors":{"bg":{"x":50,"y":50},"bubble":{"x":70,"y":58.5},"thinkA":{"x":26,"y":22},"thinkB":{"x":26,"y":30}}}}}
  var ANCHOR_DEFS = [
    { id: 'bg', label: '背景变化', x: 0.5, y: 0.5 },
    { id: 'bubble', label: '输入气泡', x: 0.72, y: 0.78 },
    { id: 'thinkA', label: '思考链起点A', x: 0.36, y: 0.34 },
    { id: 'thinkB', label: '思考链起点B', x: 0.36, y: 0.48 },
  ]
  var IMAGE_KEY = '__dshui.image'
  var IMAGE_KEY_DARK = '__dshui.image.dark'
  /** 更名前的旧前缀（dsh-dsniang-beautify）；首次加载会复制到 `__dshui.`。 */
  var LEGACY_STORAGE_PREFIX = '__dsniang.'

  /** 开屏动画（0.8.0）：独立于模式的可选启动动画；默认开，可在面板关/重播。 */
  var SPLASH_KEY = '__dshui.splash.v1'
  /** 开屏页地址（带版本号，换版本就换 URL，避免旧缓存）。 */
  var SPLASH_URL = PREFIX + '/splash.html?v=' + VERSION
  /** 兜底超时：开屏页 30s 内没发 done 就强制揭幕（动画正常约 10~12s）。 */
  var SPLASH_TIMEOUT_MS = 30000
  /** 揭幕淡出时长（与开屏页自己的 handoff 淡出叠加但不冲突）。 */
  var SPLASH_FADE_MS = 360
  /** 传给开屏页的配置（键名与它自己的 __DSH_STARTUP__ 接口一致）。
   *  sound 默认关：DSH 启动时没有用户手势，WebAudio 会因为自动播放策略被静音；
   *  保持关掉更可预期（想听音效可在开屏页源文件里改）。 */
  var SPLASH_CFG = {
    theme: 'auto',
    // 新开屏（v17a）用系统 prefers-color-scheme；集成时由 mountSplash 按 DSH 实际主题覆盖。
    // titleMode 只是兜底：每次 mountSplash 会在 fit / scramble 之间随机选。
    titleMode: 'fit',
    console: false,
    speed: 1.15,
    stepHold: 900,
    allowSkip: true,
    /** 0.8.0：默认**开**音效（用户要求）；开屏页内部会在首次点击/按键时解锁声卡，
     *  在 Electron 桌面端通常无需手势即可响；浏览器/网页端则会被自动播放策略静音到首次交互。 */
    sound: true,
    soundVolume: 0.5,
    voice: false,
    requireInteraction: false,
  }

  /** 重启键（0.8.0）：标题栏「应用」「编辑」右侧的重启按钮。
   *  真重启能力由配套桌面壳补丁提供（preload 暴露 window.dshDesktop.restart()）；
   *  壳补丁缺失时按钮仍在，点击给出明确提示。 */
  var RESTART_HOST_SELECTOR = '[data-windows-menu]'
  var RESTART_BUTTON_ATTR = 'data-dshui-restart-button'
  var RESTART_TOAST_ATTR = 'data-dshui-restart-toast'
  var RESTART_BRIDGE_METHOD = 'restart'
  var RESTART_DISCOVERY_MS = 400
  var RESTART_DISCOVERY_MAX = 40 // ~16 秒，页面 boot 慢也够
  /** 面板「启用重启键」：宿主路由（查询状态 / 启动随包壳补丁安装器）。 */
  var RESTART_STATUS_URL = PREFIX + '/restart-status.json'
  var RESTART_ENABLE_URL = PREFIX + '/restart-enable'
  var OPACITY_KEY = '__dshui.opacities'
  /** 薄纱强度（0~0.9）：0.3.1 起面板上有滑块、会存档。 */
  var SCRIM_KEY = '__dshui.scrim'
  // 键带 v3：v0.2.17 及更早的旧参数（当时的"毛玻璃"是贴图假效果，模糊/白层
  // 都调得很重）不再沿用 —— 新版是真正的 backdrop-filter 白层，用出厂默认值
  // （14px / 50%）起步，避免把旧版调过的生硬参数带进来。
  var FROST_KEY = '__dshui.frost.v3'
  var FADE_MS = 420
  var RESTORE_MS = 2000
  /** 毛玻璃参数补间的步长（帧驱动，不用 rAF，极简 DOM 桩里也能推）。 */
  var FADE_STEP_MS = 16
  /**
   * 毛玻璃（仅「纹理」模式）：作用在**输入卡片** `[data-composer-card="true"]` 上。
   * 卡片是 div，伪元素可用（textarea 是替换元素、伪元素无效 —— 这是之前翻车的原因）。
   */
  var FROST_CLASS = '__dshui-frost'
  var FROST_SURFACE_CLASS = '__dshui-frost-surface'
  /**
   * 「背景」模式的 body 开关类（0.3.1）：DSH 的外壳 frame 有一层**不透明底色**
   * （实测 `.BynINW_frame{background:var(--dsw-alias-bg-base)}`，2560×1410 全屏；
   * Windows 标题栏下 `.BynINW_centerCol` 同样有底色），会把 `z-index:-1` 的图整个盖住。
   * 用类开关 + `!important` 覆盖成透明 —— 摘类即还原，不写内联、不动结构。
   */
  var BACKDROP_CLASS = '__dshui-backdrop'
  var COMPOSER_CARD_SELECTOR = '[data-composer-card="true"]'
  /**
   * DSH 自带的**问答窗口**：稳定钩子是应用自己的语义属性（`data-question-key` +
   * `aria-labelledby`）。哈希类名（`LqhxcW_*` 那类）每次构建都会变，绝不使用。
   * 它跟主表面**同一套参数**（面板上的模糊 / 白层滑块）。
   */
  var QUESTION_FROST_SELECTOR = '[data-question-key] > section[aria-labelledby]'
  /**
   * **二级面板**：鲸鱼挂件 `dsh-whale-widget` 的各级弹层（菜单 / 记账窗 / 泡泡·音效·裁剪
   * 编辑器 / 角色·音效·取色下拉）。`dshwv-*` 是作者手写的类名（不是 CSS Modules），
   * 换版本也不变。
   *
   * 这些是**小控件区**，跟主表面共用一套参数会糊得看不清 —— 所以走单独一套参数
   * （`FROST_PANEL_*`，见下）。
   *
   * ⚠️ 命中的元素还要过 `extraSurfaceSafe()`：**有 fixed 后代的一律不糊** ——
   * `backdrop-filter` 会让元素成为 fixed 后代的包含块，贴上去会让那些小浮层整体跑位
   * （鲸鱼的 `.dshwv-slotlist` 就属于这种，它的祖先 `.dshwv-audiowin` 因此被自动跳过）。
   * 这只是"改背景 + 上模糊"，不动 position / 尺寸 / 层级。
   */
  var EXTRA_FROST_SELECTOR = [
    '.dshwv-menu',
    '.dshwv-usage-card',
    '.dshwv-bubcard',
    '.dshwv-rescard',
    '.dshwv-audiowin',
    '.dshwv-snapwin',
    '.dshwv-cropwin',
    '.dshwv-gifwin',
    '.dshwv-confirmwin',
    '.dshwv-rolelist',
    '.dshwv-audiolist',
    '.dshwv-slotlist',
    '.dshwv-rgbmenu',
    '.dshwv-listbox',
    '.dshwv-tplhelp',
    '.dshwv-qedit',
  ].join(',')
  /** 「二级面板」专用类：与主表面分开，各自一套参数。 */
  var FROST_PANEL_CLASS = '__dshui-frost-panel'
  /** 纹理模式专属的「气泡视觉」开关类（只加在 body 上，不改任何布局）。 */
  var BUBBLE_FX_CLASS = '__dshui-bubblefx'
  // 纹理模式 body 类：用于只在该模式下关掉「输入卡片」的 backdrop-filter（防悬浮重合成闪烁）。
  var TEXTURE_CLASS = '__dshui-texture'
  /** 纹理模式「AI 回复区域」视觉开关类（左侧细线 + 很淡的横向渐变，零布局）。 */
  var AI_FX_CLASS = '__dshui-aireplyfx'
  /** AI 思维链观察器（只读 DOM，用于逐行重播动画；0.8.5）。 */
  var aiReplayObserver = null
  var aiReplayQueue = []
  var aiReplayRaf = null
  var aiReplayCount = 0
  var aiReplayLastAt = typeof WeakMap === 'function' ? new WeakMap() : null
  var AI_REPLAY_GAP_MS = 500
  /** AI 回复节点语义选择器：DSH ui-chat 的 flow item，没有 data-chat-flow-kind 的就是助手回复。 */
  var AI_REPLY_SELECTOR = '[data-chat-flow] [data-chat-flow-key]:not([data-chat-flow-kind])'
  /** 思维链步骤行：DSH 的 step-process 容器/行属性多路兜底（不同版本结构可能不同）。 */
  var AI_STEP_SELECTORS = [
    '[data-chat-flow-kind="turn-process"] [data-variant]',
    '[data-step-process] [data-variant]',
    '[data-step-process-body] [data-variant]',
    '[data-turn-process] [data-variant]',
    '[data-step-process-body] [data-turn-process-member]',
  ]
  var AI_STEP_SELECTOR = AI_STEP_SELECTORS.join(',')
  /** 逐条加前缀，避免逗号后面的选择器丢掉作用域（曾经因此全局生效 → 字发虚）。 */
  function aiStepCss(base) {
    return AI_STEP_SELECTORS.map(function (s) {
      return base + ' ' + s
    }).join(',')
  }
  /**
   * **DSH 自己的二级界面**（0.3.1，用户：「小鲸鱼娘的二级菜单达标了，但 DSH 本身的却没有」）：
   * 用语义钩子 `role="dialog"`（重命名窗 / 快捷键面板 / 各类弹窗）与 `role="menu"`（下拉菜单）——
   * DSH 的类名是构建哈希、每版都变，但这两个 role 是稳定的。同样走 `collectSafeSurfaces`
   * 的安全闸；打的是 `FROST_PANEL_CLASS`（和鲸鱼面板同一套玻璃参数与 z 抬升）。
   */
  var DSH_PANEL_SELECTOR = '[role="dialog"],[role="menu"]'
  /** 两类标记的合并选择器（"这里已经有玻璃了"——用来防套娃）。 */
  var FROST_MARK_SELECTOR = '.' + FROST_SURFACE_CLASS + ',.' + FROST_PANEL_CLASS
  /**
   * 二级面板的毛玻璃参数（作者定：**模糊 20px、白层 90%**）。
   *
   * ⚠️ 这里有个**必须记住的事实**：鲸鱼面板本来就不透明 —— `.dshwv-menu` 是
   * `rgba(255,255,255,.92)`，各种 `*-card / *-win` 直接是 `#fff`（100%），
   * 角色/音效/取色下拉是 `.98`。所以「白层 85% / 90%」跟原版**几乎一模一样**，
   * 看上去当然"没有任何变化"（v0.2.34 用户就是这么反馈的）。
   *
   * 于是 v0.2.35 起：白层做成**竖向渐变**（顶部更实 → 底部更透），中值就是作者要的 90%
   *   · 顶部 `FROST_PANEL_TOP` = 0.97（几乎实心，按钮/文字最清楚）
   *   · 底部 `FROST_PANEL_BOTTOM` = 0.83（透出一点背后的内容 + 20px 模糊 = 玻璃感）
   * 渐变两端都用 `--dsniang-frost-panel-top/-bottom` 兜底，可现场覆盖；
   * `FROST_PANEL_ALPHA` 只作为"名义白层"（两端中值）出现在诊断里。
   */
  var FROST_PANEL_BLUR = 20
  /** 名义白层（径向渐变两端中值，只出现在诊断里）。 */
  var FROST_PANEL_ALPHA = 0.87
  /** 径向渐变两端：边缘更亮（FROST_PANEL_TOP，滑块「面板边缘白层」）、内部更透（FROST_PANEL_BOTTOM，「面板内部白层」）。 */
  var FROST_PANEL_TOP = 0.94
  var FROST_PANEL_BOTTOM = 0.8
  /**
   * 主表面（输入卡片）的径向渐变：内部 alpha = 边缘 alpha × 这个比例（内部更透明）。
   * 用户 2026-10-20 的视觉方向：「边框内，由内向外逐渐变亮，内部稍微比边边透明」。
   */
  var FROST_ALPHA_CENTER_RATIO = 0.55
  /**
   * 边缘外淡淡的阴影 + 边缘内 1px 高光：让玻璃「浮起来」又不脏。
   * 两条都只写 box-shadow，不动布局。
   */
  var FROST_SURFACE_SHADOW =
    'inset 0 0 0 1px rgba(255,255,255,.45),0 10px 30px rgba(17,18,20,.10)'
  var FROST_PANEL_SHADOW =
    'inset 0 0 0 1px rgba(255,255,255,.35),0 14px 36px rgba(17,18,20,.14)'
  /**
   * DSH 自己的二级面板（`role="dialog"` / `role="menu"`）的**独立模糊度**（0.4.0，
   * 用户 2026-10-16：「dsh本体的二级菜单已经正常了，但是我希望它的模糊度调整滑块独立出来」）。
   * 白层渐变仍与鲸鱼面板共用一套，只有模糊这一项独立。
   */
  var FROST_DSH_BLUR_DEFAULT = 20
  var FROST_DSH_BLUR_MAX = 30
  /**
   * 面板白层滑块的取值范围。
   * v0.6.2：下限 0.30 → **0.10**（用户 2026-10-16：「薄纱最低数值再调低一点」）。
   * 原来卡在 0.3 是因为"再低按钮就看不见了"，但那是**出厂默认**该守的事 —— 取值范围不该
   * 替用户做决定：戴眼镜/大屏的人就想要更透的面板。默认值仍是 97% / 83%，一点没动。
   */
  var PANEL_ALPHA_MIN = 0.1
  /**
   * 「白层」滑块（输入卡片玻璃）的取值范围。
   * v0.6.2：下限 0.15 → **0.02**（同上，用户要更低的下限）。默认仍是 25%。
   */
  var FROST_ALPHA_MIN = 0.02
  var FROST_ALPHA_MAX = 0.85
  /**
   * 「薄纱」滑块的步长（v0.6.2：0.05 → **0.01**）。
   * 下限本来就是 0（= 完全不加纱），但 5% 一档时"最细只能到 5%"；改成 1% 一档后
   * 1%~4% 也够得着 —— 用户要的"最低数值再调低一点"在这个滑块上就是这个意思。
   */
  var SCRIM_STEP = 0.01
  var SCRIM_MAX = 0.9
  /** 动效偏好键（0.7.0：动效总开关；默认关，灰度）。 */
  var MOTION_KEY = '__dshui.motion.v1'
  /** 动效闸门的 body 类：CSS 动画只在 __dshui-motion-on 下跑；失焦/减弱动态时加 paused。 */
  var MOTION_ON_CLASS = '__dshui-motion-on'
  var MOTION_PAUSED_CLASS = '__dshui-motion-paused'
  /** 帧探针的采样窗口（帧间隔样本数上限）与汇总节流。 */
  var MOTION_WINDOW = 120
  var MOTION_SUMMARY_MS = 500
  /**
   * **变更风暴熔断（0.7.1，用户实测「切模式之后整个界面点不动」）**。
   *
   * 观察器回调**每个 DOM 批次**都会来一次；流式输出时批次能到每秒几十个。原来这里每批
   * 都跑一遍「扩展表面补标」——那是**全文档查询 + 逐个元素读计算样式 + 写类/写内联变量**，
   * 于是：渲染进程 47% + GPU 进程 59%（每批写样式 → 所有玻璃表面重新模糊），界面直接卡死。
   *
   * 现在两道闸：
   *   ① **纯文本批次直接跳过**（流式输出绝大多数批次只是加/换文本节点，不可能带来新表面）；
   *   ② 每秒批次数超过 `MUTATION_STORM_RATE` 就进**低功耗**：只保留"抢在渲染前的链抢修"
   *      （那是 0.6.5 不白闪的关键，很便宜），把补标交给去抖那一遍、并把去抖放宽到 1s。
   * 速率降回 `MUTATION_CALM_RATE` 以下并持续 `MUTATION_STORM_CALM_MS` 才退出低功耗。
   */
  var MUTATION_STORM_RATE = 25
  var MUTATION_CALM_RATE = 8
  var MUTATION_STORM_CALM_MS = 2000
  var MUTATION_SCAN_MS = 250
  var MUTATION_SCAN_STORM_MS = 1000
  /**
   * **用户气泡的玻璃做法（v0.2.39 用户定的"方案 B"，v0.2.40 起给足三个旋钮）**：
   * **不换色，只调透明度** —— `color-mix(in srgb, <气泡颜色> <mix>%, transparent)`。
   *
   * 事实（从 DSH 自己的 CSS 里挖出来的，见 HANDOFF §6.x）：聊天气泡 `.cJsG2q_bubble`
   * 的**全部外观只有一条** `background: var(--dsw-specific-bubble)` + 圆角 + 内边距，
   * 而这个颜色是**不透明**的。v0.2.37/0.2.38 试过"换成半透明白玻璃"→ 白层 30% 时
   * 气泡"只剩文字、形状没了"（用户原话"没有气泡了"），所以改成在**气泡自己的颜色**上做透明。
   *
   * v0.2.40 用户反馈"效果不错"，再要三样东西（面板上都有）：
   *   1. **「气泡透明度」滑块 0%~100%**：0 = 不透明（= DSH 原样），100 = 全透明。
   *      存储/显示的都是"透明度"，落到 CSS 的 `--dsniang-frost-bubble-mix` 时换算成
   *      颜色保留百分比（100 - 透明度）；默认 45%。
   *   2. **「气泡颜色」取色器**（原生 `<input type="color">`）：用户自选颜色，覆盖"气泡原色"；
   *      写进 `<body>` 的 `--dsniang-bubble-color`；「原色」按钮清掉它，恢复自动跟随。
   *      自动跟随 = JS 读 `getComputedStyle(el).backgroundColor` 写进**元素内联**变量
   *      （深浅主题都对）；CSS 侧兜底 `var(--dsw-specific-bubble, #e8f0fe)`。
   *   3. **「气泡模糊」滑块 0~30px**（默认 12px）：只改气泡自己的 `backdrop-filter`。
   */
  var BUBBLE_TRANSPARENCY_DEFAULT = 45
  var BUBBLE_BLUR_DEFAULT = 12
  var BUBBLE_BLUR_MAX = 30
  var BUBBLE_COLOR_VAR = '--dsniang-bubble-color'
  var BUBBLE_MIX_VAR = '--dsniang-frost-bubble-mix'
  var BUBBLE_BLUR_VAR = '--dsniang-frost-bubble-blur'
  /**
   * ⚰️ **「气泡浮层」已在 0.7.1 删除**（用户：「直接关掉并删去这个选项」）。
   *
   * 它曾经是 v0.5.0 的 P0★3 方案：为每个气泡生成一个 body 级玻璃壳（`position:fixed`
   * + `pointer-events:none`），把壳抬到纹理壁纸之上，好让气泡在**纹理模式**下也有玻璃。
   * 结构上它必然失败：纹理模式的壁纸（z 2147483000）压在 UI 之上，壳要糊到壁纸就必须
   * 抬到壁纸之上，于是**也压在气泡文字之上**；而 `backdrop-filter` 糊的是"它后面画过的
   * 一切"——包括那些文字。用户实测：「气泡是有了，但把文字遮罩住了」。
   *
   * ⇒ 纹理模式下"糊壁纸"与"文字清晰"不可兼得。要气泡真玻璃请用**背景模式**：那里壁纸
   * 垫在 `z-index:-1`，气泡的 backdrop 天然包含壁纸，不需要任何壳。所以这个开关与整套
   * 壳机制（FLOAT_SHELL_CLASS / syncFloatShells / ensureFloatLoop / bubbleFloat 存档键）
   * 在 0.7.1 一并删除，旧存档里的 `bubbleFloat` 会被忽略。
   */
  /**
   * **聊天内的代码块与文件卡片**（0.6.0，用户：「给背景模式中你发出信息的高亮部分和
   * 这些文件也添加这个效果」）：背景模式下壁纸垫底，助手消息里的代码块（高亮部分）与
   * 附件文件卡片直接坐在图上、没有玻璃。用 DSH 自己的稳定标记做钩子（从用户保存的
   * ds.html 实测）：代码块根 = `[data-code-wrap]`（没工具条时退化成全局类
   * `.md-code-block`）、文件卡片根 = `[data-presented-file]`。玻璃配方与气泡同款
   * （保留各自原色 + 气泡透明度/模糊参数）。
   *
   * **0.6.1 补课**：代码块是"套娃"结构 —— 外层卡片之下，`pre` 又刷了一遍代码块底色、
   * 顶部 banner 刷了标题条底色、banner 的 sticky 外壳刷了页面底色。只把玻璃贴在外层
   * 卡片上 = 被内层整块盖住（这就是「看不到代码块有毛玻璃」的原因）。现在内层清底，
   * 只给顶部条留一条"同色半透明 + 轻模糊"（滚动时被它压住的代码仍会被糊掉，不脏）。
   */
  var EXTRA_CHAT_SELECTOR = '[data-code-wrap],.md-code-block,[data-presented-file]'
  var FROST_CHAT_CLASS = '__dshui-frost-chat'
  var CHAT_COLOR_VAR = '--dsniang-chat-color'
  /**
   * 打开二级面板时，鲸鱼挂件会铺一层**全屏变暗遮罩**（`position:fixed; inset:0`，
   * 原版是实心 `rgba(15,23,42,0.55)`）。作者嫌它"降亮度变黑"太重、太平 →
   * 换成**更轻的径向渐变**（中心浅、四周略深，像聚光灯打在面板上）。
   * 只覆盖 background，不动位置/层级；数值同样是样式表兜底，可用
   * `--dsniang-panel-mask-center` / `--dsniang-panel-mask-edge` 现场覆盖。
   */
  var PANEL_MASK_SELECTOR = [
    '.dshwv-usage-mask',
    '.dshwv-resmask',
    '.dshwv-cropmask',
    '.dshwv-gifmask',
    '.dshwv-confirmmask',
    '.dshwv-snapmask',
    '.dshwv-audiomask',
    '.dshwv-bubmask',
    // DSH 自己的全屏变暗遮罩（DropOverlay，居中模态的 mask；z 1000，0.3.1 起一起抬升 + 渐变）
    '.XPF3fq_mask',
  ].join(',')
  var PANEL_MASK_CENTER = 0.16
  var PANEL_MASK_EDGE = 0.34
  /**
   * 二级窗口与"变暗"遮罩要抬到**纹理壁纸之上**（用户 2026-10-13 的层级要求：
   * 「背景图 → 文字UI → 变暗 → 二级窗口」）—— 具体数值见上面的 **LAYER_Z 层序表**
   * （唯一真源；「背景」模式下壁纸垫底，这两个抬升变成冗余但无害，先留着）。
   */
  var FROST_BLUR_DEFAULT = 2
  /** 主表面白层默认：0.25 → 0.20（用户要「白层更淡」；内部再 × FROST_ALPHA_CENTER_RATIO）。 */
  var FROST_ALPHA_DEFAULT = 0.2
  /** 一次性迁移标记（通透化上线前存下的"等于没开"的参数只提一次）。 */
  var FROST_GLASS_KEY = '__dshui.glass.v1'
  /** 通透化只动这两个背景长属性（别的内联样式一律不碰）。 */
  var FROST_SCRIM_PROPS = ['background-color', 'background-image']
  var FROST_BG_LIGHT = [255, 255, 255]
  var FROST_BG_DARK = [22, 24, 29]
  /**
   * 每种模式各自的默认"图片浓度"（滑块起步值）。
   *
   * `multiply` 的 0.49 是**作者本人的实机取值**（出厂默认）：黑白剪影图的纯黑区域会把
   * 深色文字乘成 `文字亮度 × (1 - 浓度)` —— 0.4 以下基本无风险，0.5 附近中央剪影区
   * 会有约四成文字明显变暗、但白底正文仍然清晰，属于"看个人口味"的区间。
   * 觉得字发灰就把浓度滑块往左拖（或切「关闭」）。
   */
  var MODE_OPACITY_DEFAULTS = { overlay: 0.3, multiply: 0.49, luminosity: 0.55, backdrop: 0.5 }
  /** 深色主题单独一套浓度（浅色继续用上面那套；滑块改的是"当前主题"的那一套）。 */
  var MODE_OPACITY_DARK_DEFAULTS = { overlay: 0.3, multiply: 0.85, luminosity: 0.55, backdrop: 0.7 }
  var OPACITY_DARK_KEY = '__dshui.opacities.dark'
  var DEFAULT_OPACITY = MODE_OPACITY_DEFAULTS.overlay
  var HASH_OFF = '#dshui-off'
  var HASH_DIAG = '#dshui-diag'
  /** 更名前的同义 hash（兼容旧书签）。 */
  var LEGACY_HASH_OFF = '#dsniang-off'
  var LEGACY_HASH_DIAG = '#dsniang-diag'

  /**
   * 合法的呈现模式。对外只有「关闭 / 纹理 / 背景」三个按钮：
   *   - off        → 「关闭」：一切恢复默认
   *   - multiply   → 「纹理」：乘法混合，白底处文字不受影响
   *   - backdrop   → 「背景」（0.3.0 起）：图真正垫底（z-index:-1），文字/面板全在图之上
   *   - luminosity → 内部保留（旧存档兼容；旧「待更新」占位按钮已被「背景」替换）
   * `overlay` 保留在内部模式表里，方便以后回滚，但面板不再展示。
   */
  var MODES = ['overlay', 'multiply', 'luminosity', 'backdrop', 'off']

  /**
   * **层序表（唯一真源，2026-10-14 收拢）**：所有 z-index 都从这里取，
   * 样式字符串里不许再出现裸的层序数字（之前是散落的魔法数字 + v0.2.37 的抬层级补丁）。
   *
   *   wallpaperOverlay = 2147483000 → 「纹理」模式：壁纸压顶 + multiply（白底处不受影响）
   *   wallpaperBase    = -1        → 「背景」模式：壁纸垫底。负 z 的定位子元素画在
   *                                  canvas 底色（body 背景被提升）之上、正文流内内容之下，
   *                                  于是 DSH 面板(100~1100)/鲸鱼浮层(9999~40000) 自动全在图上
   *   whaleMask        = 2147483005 → 鲸鱼全屏变暗遮罩（压在纹理壁纸之上；背景模式下只是冗余，无害）
   *   whalePanel       = 2147483010 → 鲸鱼二级面板（压在遮罩之上）
   *   ownGui           = 2147483647 → 自家胶囊/切换面板/诊断（永远最上）
   */
  var LAYER_Z = {
    wallpaperOverlay: 2147483000,
    wallpaperBase: -1,
    whaleMask: 2147483005,
    whalePanel: 2147483010,
    ownGui: 2147483647,
  }

  var state = {
    installed: false,
    mode: 'overlay',
    /** 顶层分组：off / static / dynamic（0.8.22）。 */
    modeGroup: 'off',
    /** 静态分组里最后一次使用的内部模式（纹理/背景），供分组切换记忆。 */
    lastStaticMode: null,
    /** 动态「开发中」模式的可保存定位锚点（视口百分比）。 */
    dynamicAnchors: null,
    /** 定位工具浮层节点（null = 未打开）。 */
    anchorTool: null,
    /** 动态「参考线」是否常显（锚点工具打开时强制显示）。 */
    dynamicGuides: false,
    /** 参考线浮层节点与刷新计时器。 */
    guideNode: null,
    guideTimer: null,
    /** 动态分镜布局（三阶段 boxes/backgroundTransform）。 */
    dynamicLayout: null,
    /** 动态阶段：idle / thinking / output。 */
    dynamicPhase: 'idle',
    /** 是否正在「思考中」分镜态（真实界面元素被移动/缩放）。 */
    dynamicCinematic: false,
    /** 用户滚轮临时退出思考分镜后置 true；回到底部再上滑恢复。 */
    dynamicSuspended: false,
    /** 退出后是否已离开底部（避免一退出上滑就立刻恢复）。 */
    dynamicReenterArmed: false,
    /** 面板「预览思考态」按钮。 */
    dynamicPreview: false,
    /** 动态引擎的 observer/timer/wheel/元素记录。 */
    dynamicObserver: null,
    dynamicTimer: null,
    dynamicManaged: [],
    dynamicBgOrig: null,
    dynamicEngineStarted: false,
    dynamicTurnKey: null,
    dynamicHiddenFlows: [],
    dynamicOverflowSaved: [],
    dynamicThinkingSeenAt: 0,
    caretWatchTimer: null,
    /** 关闭前最后一个有效模式（淡出期间图层浓度沿用它的值）。 */
    lastActiveMode: null,
    /** 本窗口的随机标识（diag 上报用）。 */
    windowTag: '',
    status: 'init',
    /** @type {HTMLElement|null} 图片层 */
    layer: null,
    source: null,
    bgUrl: BG_URL_FALLBACK,
    /** 当前背景图文件名（桌面上的原图名）。 */
    imageName: null,
    /** 深色主题可切换的壁纸（宿主 /status.json 的 darkImages；为空 = 不启用）。 */
    darkImages: [],
    /** 上次识别到的主题（dark/light/null），主题变化时才重新同步壁纸。 */
    themeKey: null,
    /** 桌面上可选的全部背景图（宿主扫描白名单得到）。 */
    images: [],
    /** 每种模式各自记忆的浓度（overlay / multiply / luminosity）。 */
    opacities: null,
    /** 深色主题的浓度（独立存 `__dshui.opacities.dark`）。 */
    opacitiesDark: null,
    /** 毛玻璃：开关 + 模糊半径 + 白层浓度 + 是否做"分层"（纹理模式）。 */
    frost: {
      enabled: true,
      layered: true,
      blur: FROST_BLUR_DEFAULT,
      alpha: FROST_ALPHA_DEFAULT,
      /** 二级面板白层：竖向渐变的两端（0~1），面板上两个滑块可实时调、可持久化。 */
      panelTop: FROST_PANEL_TOP,
      panelBottom: FROST_PANEL_BOTTOM,
      /** 纹理模式气泡视觉（0.8.5）：顶部高光 + 柔和投影（用户气泡 + 输入框）。 */
      bubbleFx: true,
      /** 纹理模式 AI 回复区域视觉（0.8.5）：左侧细线 + 淡渐变。 */
      aiReplyFx: true,
      /** 用户气泡的**透明度**（0 = 不透明/DSH 原样，100 = 全透明），面板有滑块。 */
      bubbleTransparency: BUBBLE_TRANSPARENCY_DEFAULT,
      /** 用户气泡自己的模糊（px，0~30）：比主表面那档独立，默认 12。 */
      bubbleBlur: BUBBLE_BLUR_DEFAULT,
      /** 用户自选的气泡颜色（'#rrggbb' 或 '' = 跟随气泡原色）。 */
      bubbleColor: '',
      /** DSH 自己的二级面板独立模糊度（px，0~30；0.4.0 起与鲸鱼面板分开）。 */
      dshBlur: FROST_DSH_BLUR_DEFAULT,
    },
    /** 聊天内代码块/文件卡片的内联颜色备份（`--dsniang-chat-color`，卸载时逐字还原）。 */
    chatColorBackup: [],
    /** 聊天内代码块/文件卡片数量（诊断用；0.6.0 起，背景模式专属）。 */
    frostChatCount: 0,
    /** 上面那批里**代码块**的数量（0.6.1 起分开数：玻璃"看不看得见"要能自查）。 */
    frostChatBlocks: 0,
    /** 上面那批里**文件卡片**的数量（0.6.1 起分开数）。 */
    frostChatFiles: 0,
    /** 分层改动前的原始样式（用于还原）。 */
    layerBackup: null,
    /** 气泡内联变量 `--dsniang-bubble-color` 的原值（方案 B 用，卸载时逐字还原）。 */
    bubbleColorBackup: [],
    /** 最近一次扫到的用户气泡（`markFrostSurfaces` 里写原色用）。 */
    frostBubbles: null,
    /** 方块光标光晕模糊（px）；0.8.21 起可在面板调并持久化。 */
    caretBlur: CARET_BLUR_DEFAULT,
    /** 毛玻璃「通透化」改动前的原始背景（卡片与消息区之间那几层，用于逐字还原）。 */
    frostBackup: null,
    /** 通透化清掉的遮罩层摘要（诊断用，空数组 = 没有遮挡或没认出消息区）。 */
    frostCleared: [],
    /** 上一次「通透化没认出消息区」的时间戳：找不到时降频重试。 */
    frostBackdropMissAt: 0,
    /**
     * 认出来过的那条「卡片 → 消息区」祖先链（哪怕当时没有可清的遮挡）。
     * 留着是为了**廉价重试**：真实 DSH 的座位背景只在 `[data-phase=active]` 才有，
     * 首帧跑早了一步就会扑空 —— 有了这条链，重试只查那几层的背景，不用全文档重扫。
     *
     * 0.6.3 起它同时是**自愈的判据**：每次重认一遍链，用 `sameChain()` 和它比形状，
     * 形状变了（切对话时 React 换掉中间某几层）就还原旧账 + 按新链重清。
     */
    frostChain: null,
    /**
     * true = 通透化已经处理过（**可能清了 0 层**）。
     * 别用 `!!frostBackup` 兼任这个语义：空 backup 会被当成"还活着"，从此永远提前 return
     * → 座位后来上了底色也再不会被清（0.2.31 的真 bug）。
     */
    frostClearedReady: false,
    /** 分层是否已经认过并处理过（含"应用自带、我们一行没动"的情况）。 */
    layeringApplied: false,
    /** 分层探测结果（诊断用）：应用自带定位？已有多少底部留白？我们补了多少？ */
    layeringInfo: null,
    /** 当前毛玻璃表面数量（诊断用）：只数"主表面"= 输入卡片 + 用户气泡。 */
    frostTargetCount: 0,
    /** 最近一次气泡扫描统计（诊断用）：能一眼看出"长气泡被静默丢掉"这类 bug。 */
    bubbleScan: null,
    /** 扩展表面数量（诊断用）：问答窗口 / 鲸鱼挂件的各级面板。 */
    frostExtraCount: 0,
    /** 二级面板数量（诊断用）：走单独一套参数（20px / 85%）的那些弹层。 */
    frostPanelCount: 0,
    /** DSH 自己的二级面板数量（`role="dialog"` / `role="menu"`，0.3.1 起）。 */
    frostDshCount: 0,
    /** 「背景」模式清掉的整页底色（备份账本，用于逐字还原）。 */
    backdropBackup: null,
    /** 「背景」模式清掉的层摘要（诊断用）。 */
    backdropCleared: [],
    /** 「背景」模式页链各层的实况（诊断用：哪层还画着不透明底色，一眼定位）。 */
    backdropChainDesc: [],
    /**
     * 「背景」模式上一次清过的**页链元素本身**（不只是描述）。
     * 0.6.3 起用它做自愈：切对话时 React 会把中间那几层换掉，元素指针一失效就得重来。
     */
    backdropChain: null,
    /** 自愈次数（诊断用）：通透化因"链变了/节点被换掉"重新清过的次数。 */
    frostRepairs: 0,
    /** 自愈次数（诊断用）：整页透明化重新清过的次数。 */
    backdropRepairs: 0,
    /** 最近一次认出来的消息区滚动容器（`currentTranscript()` 的缓存，自愈每遍要用）。 */
    frostTranscript: null,
    /** 我们确实往图层上画过图（壁纸体检用它区分"还没画"和"画过又被抹了"）。 */
    layerPainted: false,
    /**
     * **链外**的"盖子"账本（0.6.4）：`elementsFromPoint` 命中测试找出来的、几乎铺满视口
     * 且不透明的元素（不在祖先链上，0.3.2 那套清不到）。逐字记账，扫不到就还原。
     */
    coverBackup: [],
    coverCleared: [],
    coverCount: 0,
    /** 上一次"盖子扫描"的时间（节流：命中测试不必每 250ms 做一次）。 */
    coverScanAt: 0,
    /** 壁纸自愈次数（补层/重画/摘掉卡死的淡出/清盖子，都算一次）。 */
    wallpaperRepairs: 0,
    /** 最近一次壁纸自愈修了哪几项（诊断用）。 */
    wallpaperHealed: [],
    /** 上一次"缺图"重新拉状态的时间（3s 节流，避免打爆自己的路由）。 */
    bgRetryAt: 0,
    /** 这一批 DOM 变化的时间戳（用来量"从变化到修好"隔了多久）。 */
    lastMutationAt: 0,
    /** 悬浮探针：鼠标在输入区期间记录插件抢修/补标，离开时上报（排查悬浮闪烁用）。 */
    hoverProbe: { active: false, since: 0, events: [], lastReportAt: 0, entry: '' },
    /** 最近一次抢修延迟（ms）：≈0 说明是同步抢在渲染前修的，看不到白闪。 */
    wallpaperLastLagMs: null,
    /**
     * 动效公共底座 + 帧时间探针（P0，0.7.0）：
     *   · `enabled` = 总开关（**默认关**，灰度；装饰性动效都从 `motionAllowed()` 走）；
     *   · `paused` = 窗口失焦 / `visibilitychange` 隐藏时自动暂停；
     *   · `reduced` = 系统「减弱动态效果」（`prefers-reduced-motion`）；
     *   · 其余是探针读数 —— **只在有动画在跑时采样**，不空转。
     */
    motion: {
      enabled: false,
      paused: false,
      reduced: false,
      animating: false,
      fps: 0,
      frameMsP95: 0,
      dropped: 0,
      longFrames: 0,
    },
    /** 帧间隔样本滚动窗口（探针用，最多 `MOTION_WINDOW` 个）。 */
    motionFrames: [],
    /** 探针的 rAF 句柄（null = 没在采样）。 */
    motionFrame: null,
    /** 进行中的动画计数（`motionBegin` / `motionEnd` 维护；>0 才采样）。 */
    motionActiveCount: 0,
    /** 上一次探针汇总的时刻（节流用）。 */
    motionSummaryAt: 0,
    /** 动效偏好监听是否已装（matchMedia / blur / visibilitychange）。 */
    motionPrefsWatched: false,
    /** 本次从旧存储前缀复制了多少个键（诊断用）。 */
    storageMigrated: 0,
    /** 开屏动画（0.8.0）：开关、状态机、计时器与节点引用。 */
    splash: { enabled: true, sound: true, status: 'idle', startedAt: 0, endedAt: 0, reason: '', error: '', welcomeShown: false },
    userName: '',
    titlebarHeight: 40,
    splashWelcomeNode: null,
    /** 欢迎卡片「用户一操作就消失」的监听清理句柄。 */
    splashWelcomeCleanup: null,
    splashWelcomeTimer: null,
    splashNode: null,
    splashTimer: null,
    splashPlayed: false,
    splashListeners: [],
    /** 重启键（0.8.0）：按钮/菜单栏引用、发现循环、语言监听、忙碌态。 */
    restart: { attempted: false, desktop: false, hostFound: false, installed: false, busy: false, enabling: false, lastError: '', suppressed: '', status: null, autoToastShown: false, suppressTimer: null, suppressTries: 0, repairs: 0, lastRepairAt: 0 },
    restartButton: null,
    restartMenubar: null,
    restartHost: null,
    restartDiscovery: null,
    restartWatchdog: null,
    restartToastTimer: null,
    restartLangObserver: null,
    /** 变更风暴熔断（0.7.1）：最近 1 秒的批次时间戳、速率、是否低功耗、跳过次数。 */
    mutationStamps: [],
    mutationRate: 0,
    mutationStorm: false,
    mutationStormCalmSince: 0,
    mutationSkipped: 0,
    mutationStormSince: 0,
    /** 上一次上报的布局快照（诊断用）。 */
    lastReport: null,
    /** 上一次「没找到消息区」的时间戳：找不到时降频重试，别每 250ms 全文档扫一遍。 */
    transcriptMissAt: 0,
    /** 0~1：在图上叠一层基色"薄纱"，压一压图的对比度（0 = 不叠）。 */
    scrim: 0,
    override: false,
    restoreTimer: null,
    /** 正在「关闭」的淡出流程里（淡出未结束、尚未卸载）。 */
    fadingOut: false,
    /** multiply→off 淡出后延迟卸载的计时器（淡出期间又切回纹理就取消它）。 */
    modeFadeTimer: null,
    /** 毛玻璃参数的补间（模糊 + 白层平滑过渡，帧驱动）。 */
    frostAnim: null,
    /** 图层透明度的补间（淡入 / 交叉淡化，帧驱动，不依赖 CSS transition）。 */
    layerAnims: [],
    /** 换图流程时间线（诊断用，最多 10 条）。 */
    switchLog: [],
    /** 预热过的壁纸 Image（保留引用，防止首次切主题时重新解码）。 */
    preloadedWallpapers: [],
    /** 换图期间逐帧记录（诊断用）：能区分"我们的样式有问题"还是"合成器空帧"。 */
    switchTrace: null,
    /** 毛玻璃当前"可见"参数（补间每帧更新 / 直写时同步），下次补间从这起步。 */
    frostNow: null,
    /** 输入卡片**原生**底色的透明度（激活毛玻璃前抓取）：淡入从它起步、淡出回到它，
     *  这样接管/归还卡片底色都是无缝的，不会闪一下白光。 */
    frostNativeAlpha: null,
    diagEl: null,
    switcherEl: null,
    /** 左上角入口当前贴的位置（聊天页左上角，随窗口变化重算）。 */
    pillLeft: null,
    pillTop: null,
    lastError: null,
  }

  /** 当前模式的图片浓度。 */
  function opacityFor(mode) {
    var dark = isDarkTheme()
    var map = dark ? state.opacitiesDark || MODE_OPACITY_DARK_DEFAULTS : state.opacities || MODE_OPACITY_DEFAULTS
    var fallback = dark ? MODE_OPACITY_DARK_DEFAULTS : MODE_OPACITY_DEFAULTS
    var value = map[mode]
    return typeof value === 'number' ? value : fallback[mode] || DEFAULT_OPACITY
  }

  /** 设置某个模式的浓度并持久化。 */
  function setModeOpacity(mode, value) {
    var next = Math.min(1, Math.max(0, Number(value)))
    var dark = isDarkTheme()
    if (dark) {
      if (!state.opacitiesDark) state.opacitiesDark = {}
      state.opacitiesDark[mode] = next
      safe(function () {
        window.localStorage.setItem(OPACITY_DARK_KEY, JSON.stringify(state.opacitiesDark))
      })
    } else {
      if (!state.opacities) state.opacities = {}
      state.opacities[mode] = next
      safe(function () {
        window.localStorage.setItem(OPACITY_KEY, JSON.stringify(state.opacities))
      })
    }
    return next
  }

  /** 薄纱持久化（0.3.1：面板滑块写档；URL 覆盖与 setScrim API 仍只当次生效）。 */
  function loadScrim() {
    var raw = safe(function () {
      return window.localStorage.getItem(SCRIM_KEY)
    }, null)
    var value = Number(raw)
    return isFinite(value) && value >= 0 && value <= SCRIM_MAX ? value : null
  }

  function saveScrim() {
    safe(function () {
      window.localStorage.setItem(SCRIM_KEY, String(state.scrim))
    })
  }

  /** 从 localStorage 读回各模式浓度（坏数据一律忽略）。 */
  function loadOpacitiesDark() {
    var raw = safe(function () {
      return window.localStorage.getItem(OPACITY_DARK_KEY)
    }, null)
    if (!raw) return null
    var parsed = null
    try {
      parsed = JSON.parse(raw)
    } catch (err) {
      return null
    }
    if (!parsed || typeof parsed !== 'object') return null
    var out = {}
    var keys = ['overlay', 'multiply', 'luminosity', 'backdrop']
    for (var i = 0; i < keys.length; i++) {
      var value = parsed[keys[i]]
      if (typeof value === 'number' && value >= 0 && value <= 1) out[keys[i]] = value
    }
    return out
  }

  function loadOpacities() {    var raw = safe(function () {
      return window.localStorage.getItem(OPACITY_KEY)
    }, null)
    if (!raw) return null
    var parsed = null
    try {
      parsed = JSON.parse(raw)
    } catch (err) {
      return null
    }
    if (!parsed || typeof parsed !== 'object') return null
    var out = {}
    var keys = ['overlay', 'multiply', 'luminosity', 'backdrop']
    for (var i = 0; i < keys.length; i++) {
      var value = parsed[keys[i]]
      if (typeof value === 'number' && value >= 0 && value <= 1) out[keys[i]] = value
    }
    return out
  }

  function log() {
    try {
      var args = Array.prototype.slice.call(arguments)
      args.unshift('[DSH UI Beautify]')
      console.log.apply(console, args)
    } catch (err) {}
  }

  // ── 小工具 ────────────────────────────────────────────────────────────────
  /** 所有对外操作都经这里：出错只记一笔，绝不抛出、绝不中断。 */
  function safe(fn, fallback) {
    try {
      return fn()
    } catch (err) {
      state.lastError = String((err && err.message) || err)
      return fallback
    }
  }

  /**
   * 存储迁移：把旧前缀 `__dsniang.*` 的键**原样复制**到新前缀 `__dshui.*`。
   * - 新键已存在则不覆盖（以新键为准）；
   * - 旧键**保留**（便于回滚到 0.7.x，用户可在控制台自行清理）；
   * - 只在浏览器 localStorage 上做数组级操作，异常一律吞掉。
   */
  function migrateLegacyStorage() {
    var migrated = 0
    safe(function () {
      var storage = window.localStorage
      if (!storage) return
      var keys = []
      var total = Number(storage.length) || 0
      for (var i = 0; i < total; i++) {
        var key = safe(function () {
          return storage.key(i)
        }, null)
        if (key && key.indexOf(LEGACY_STORAGE_PREFIX) === 0) keys.push(key)
      }
      for (var j = 0; j < keys.length; j++) {
        var oldKey = keys[j]
        var newKey = '__dshui.' + oldKey.slice(LEGACY_STORAGE_PREFIX.length)
        var existing = safe(function () {
          return storage.getItem(newKey)
        }, null)
        if (existing !== null && existing !== undefined) continue
        var value = safe(function () {
          return storage.getItem(oldKey)
        }, null)
        if (value === null || value === undefined) continue
        var wrote = safe(function () {
          storage.setItem(newKey, value)
          return true
        }, false)
        if (wrote) migrated++
      }
    })
    state.storageMigrated = migrated
    if (migrated > 0) {
      safe(function () {
        console.log('[DSH UI Beautify] 已从旧版存储前缀迁移 ' + migrated + ' 项设置')
      })
    }
    return migrated
  }

  /* ── 开屏后的「WELCOME BACK」卡片（0.8.0）───────────────────────────────
   * 开屏页自己那张卡片是挂在它 mock 界面里的（集成态 mock 被隐藏），所以这里由插件
   * 在真实页面右上角补一张：莱因档案风、约 3.4s 自动淡出；卸载/重播时清掉。
   * 名字来自宿主 status.json 的 user（本机登录名），没有就显示 DEEPSEEK USER。
   */
  function showSplashWelcome() {
    if (state.splash.status !== 'done' || !state.splash.enabled) return false
    if (state.splashWelcomeNode) return false
    if (!document.body) return false
    var name = String(state.userName || '').trim()
    if (!name) name = 'DEEPSEEK USER'
    var card = document.createElement('div')
    card.id = '__dshui-welcome'
    card.setAttribute('data-dshui-ignore', '')
    card.setAttribute('role', 'status')
    // 右上角但比原来下移 64px：避开顶部「打开侧边栏」等按钮；轻量、半透明。
    var darkCard = isDarkTheme()
    card.style.cssText =
      'position:fixed;top:' + (state.titlebarHeight + 86) + 'px;right:18px;' +
      'z-index:2147483005;pointer-events:none;max-width:min(240px,calc(100vw - 40px));' +
      'padding:9px 14px 8px;border-radius:10px;' +
      'background:' + (darkCard ? 'rgba(17,18,20,.82)' : 'rgba(246,248,252,.92)') + ';' +
      'color:' + (darkCard ? '#f5f7fa' : '#46589a') + ';' +
      'border:1px solid ' + (darkCard ? 'rgba(255,255,255,.18)' : 'rgba(70,88,154,.18)') + ';' +
      'box-shadow:0 8px 22px rgba(28,30,40,.18);' +
      'font:12px/1.45 "Segoe UI","Microsoft YaHei",system-ui,sans-serif;' +
      'opacity:0;transform:translateY(-6px);' +
      'transition:opacity 280ms ease,transform 280ms ease;'
    var en = document.createElement('div')
    en.textContent = 'WELCOME BACK'
    en.style.cssText = 'font:600 11px/1.2 "Bahnschrift","Segoe UI",sans-serif;letter-spacing:.28em;color:#3964fe'
    var who = document.createElement('div')
    who.textContent = name
    who.style.cssText = 'margin-top:5px;font-weight:600;letter-spacing:.06em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'
    var line = document.createElement('div')
    line.style.cssText = 'margin-top:8px;width:26px;height:2px;background:#3964fe;border-radius:1px'
    card.appendChild(en)
    card.appendChild(who)
    card.appendChild(line)
    safe(function () {
      document.body.appendChild(card)
    })
    state.splashWelcomeNode = card
    state.splash.welcomeShown = true
    setTimeout(function () {
      safe(function () {
        if (state.splashWelcomeNode === card) {
          card.style.opacity = '1'
          card.style.transform = 'none'
        }
      })
    }, 20)
    state.splashWelcomeTimer = setTimeout(function () {
      hideSplashWelcome()
    }, 2400)
    // 用户一操作（点/按/滚）就撤掉卡片：即使短暂压住内容也不影响操作。
    var dismiss = function () {
      hideSplashWelcome()
    }
    safe(function () {
      document.addEventListener('pointerdown', dismiss, true)
      document.addEventListener('keydown', dismiss, true)
      document.addEventListener('wheel', dismiss, { capture: true, passive: true })
    })
    state.splashWelcomeCleanup = function () {
      safe(function () {
        document.removeEventListener('pointerdown', dismiss, true)
        document.removeEventListener('keydown', dismiss, true)
        document.removeEventListener('wheel', dismiss, true)
      })
      state.splashWelcomeCleanup = null
    }
    refreshDiag()
    return true
  }

  function hideSplashWelcome() {
    if (state.splashWelcomeCleanup) state.splashWelcomeCleanup()
    if (state.splashWelcomeTimer) {
      clearTimeout(state.splashWelcomeTimer)
      state.splashWelcomeTimer = null
    }
    var card = state.splashWelcomeNode
    state.splashWelcomeNode = null
    if (!card) return false
    safe(function () {
      card.style.opacity = '0'
      card.style.transform = 'translateY(-6px)'
    })
    setTimeout(function () {
      safe(function () {
        if (card.parentNode) card.parentNode.removeChild(card)
      })
    }, 360)
    refreshDiag()
    return true
  }

  function removeSplashWelcome() {
    if (state.splashWelcomeCleanup) state.splashWelcomeCleanup()
    if (state.splashWelcomeTimer) {
      clearTimeout(state.splashWelcomeTimer)
      state.splashWelcomeTimer = null
    }
    var card = state.splashWelcomeNode
    state.splashWelcomeNode = null
    if (card && card.parentNode) {
      safe(function () {
        card.parentNode.removeChild(card)
      })
    }
  }

  /** `存储:` 那一行的诊断文案。 */
  function storageDiagText() {
    if (state.storageMigrated) return '已从旧版迁移 ' + state.storageMigrated + ' 项（旧键保留）'
    return '无需迁移'
  }

  /* ── 开屏动画（0.8.0）──────────────────────────────────────────────────
   * 独立于模式：读 localStorage 的开关；页面加载时用同源 iframe 盖一层开屏页
   * （assets/splash.html，宿主注入桥接脚本），放完/跳过/超时后淡出移除。
   * 铁律不变：只动我们自己的节点，移除即零残留；不动任何页面布局。
   */
  function loadSplashSettings() {
    var raw = safe(function () {
      return window.localStorage.getItem(SPLASH_KEY)
    }, null)
    if (!raw) return
    var parsed = null
    try {
      parsed = JSON.parse(raw)
    } catch (err) {
      return
    }
    if (parsed && typeof parsed.enabled === 'boolean') state.splash.enabled = parsed.enabled
    if (parsed && typeof parsed.sound === 'boolean') state.splash.sound = parsed.sound
  }

  function saveSplashSettings() {
    safe(function () {
      window.localStorage.setItem(
        SPLASH_KEY,
        JSON.stringify({ enabled: state.splash.enabled === true, sound: state.splash.sound === true }),
      )
    })
  }

  /** 诊断里的「开屏:」那一行。 */
  function splashDiagText() {
    var sp = state.splash
    var labels = {
      idle: '未开始',
      playing: '播放中',
      done: '已播放完',
      skipped: '已跳过',
      disabled: '已关闭',
      timeout: '超时兜底',
      error: '异常兜底',
      reduced: '系统减弱动态·跳过',
    }
    var text = labels[sp.status] || sp.status
    if (sp.startedAt) {
      var end = sp.endedAt || Date.now()
      text += ' · ' + Math.round(end - sp.startedAt) + 'ms'
    }
    if (sp.reason && sp.status !== 'done') text += ' · ' + sp.reason
    if (sp.error) text += ' · ' + String(sp.error).slice(0, 80)
    if (!sp.enabled) text += '（设置里已关）'
    else if (sp.sound) text += ' · 音效开'
    if (sp.welcomeShown) text += ' · 欢迎卡片已显示'
    return text
  }

  /** 开屏动画的结构化快照（status() / diag 上报用）。 */
  function splashSnapshot() {
    var sp = state.splash
    return {
      enabled: sp.enabled,
      sound: sp.sound,
      welcomeShown: sp.welcomeShown,
      status: sp.status,
      startedAt: sp.startedAt,
      endedAt: sp.endedAt,
      reason: sp.reason,
      error: sp.error,
      played: state.splashPlayed,
      url: SPLASH_URL,
    }
  }

  /** 量 Windows 原生标题栏高度（窗口按钮所在区域）：WCO API → CSS 变量 → 菜单栏矩形 → 40 兜底。 */
  function measureTitlebarHeight() {
    var value = 0
    try {
      var wco = window.navigator && window.navigator.windowControlsOverlay
      if (wco && wco.visible && typeof wco.getTitlebarAreaRect === 'function') {
        var rect = wco.getTitlebarAreaRect()
        if (rect && rect.height > 0) value = rect.height
      }
    } catch (err) {}
    if (!value) {
      try {
        var raw = window.getComputedStyle(document.documentElement).getPropertyValue('--dsh-windows-titlebar-height')
        value = parseFloat(raw) || 0
      } catch (err) {}
    }
    if (!value) {
      try {
        var menu = document.querySelector(RESTART_HOST_SELECTOR)
        if (menu && typeof menu.getBoundingClientRect === 'function') {
          var box = menu.getBoundingClientRect()
          if (box && box.height > 0) value = box.height
        }
      } catch (err) {}
    }
    if (!value || !isFinite(value)) value = 40
    return Math.max(24, Math.min(96, Math.round(value)))
  }
  function splashUrlParam() {
    var raw = ''
    safe(function () {
      // 解析 location.href 的查询串：真实页面与测试桩都一致
      // （测试桩里 location.search 不一定跟着 href 变，href 才是权威）
      var href = String(window.location.href || '')
      var q = href.indexOf('?')
      if (q < 0) {
        var searchOnly = String(window.location.search || '')
        if (searchOnly) href = 'http://localhost/' + (searchOnly.charAt(0) === '?' ? searchOnly : '?' + searchOnly)
        q = href.indexOf('?')
      }
      if (q < 0) return
      var search = href.slice(q + 1)
      var hashAt = search.indexOf('#')
      if (hashAt >= 0) search = search.slice(0, hashAt)
      if (!search) return
      var parts = search.split('&')
      for (var i = 0; i < parts.length; i++) {
        var pair = parts[i].split('=')
        var key = ''
        try {
          key = decodeURIComponent(pair[0] || '')
        } catch (err) {
          key = pair[0] || ''
        }
        if (key !== 'splash') continue
        try {
          raw = decodeURIComponent(pair[1] || '')
        } catch (err) {
          raw = pair[1] || ''
        }
      }
    })
    return raw
  }

  function splashReduced() {
    return safe(function () {
      return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    }, false)
  }

  /** 决定这次页面加载放不放：设置开关 / URL ?splash= / 应急 hash / 系统减弱动态。 */
  function splashShouldPlay() {
    if (state.splashPlayed) return false
    var param = splashUrlParam()
    if (param === '0' || param === 'off') {
      state.splash.status = 'disabled'
      state.splash.reason = 'URL ?splash=0'
      return false
    }
    if (param === '1' || param === 'on') return true
    if (!state.splash.enabled) {
      state.splash.status = 'disabled'
      state.splash.reason = '设置里已关闭'
      return false
    }
    var hash = String(window.location.hash || '')
    if (hash === HASH_OFF || hash === LEGACY_HASH_OFF) {
      state.splash.status = 'disabled'
      state.splash.reason = '应急开关 #dshui-off'
      return false
    }
    if (splashReduced()) {
      state.splash.status = 'reduced'
      state.splash.reason = 'prefers-reduced-motion'
      return false
    }
    return true
  }

  /** 开屏期间把自家 GUI（胶囊/面板）藏掉：iframe 与胶囊同为最大 z-index，
   *  胶囊在 DOM 里更晚插入 → 会盖在开屏画面上（用户实测「整个漏出来」）。 */
  function syncGuiUnderSplash() {
    var active = !!state.splashNode
    safe(function () {
      var pill = document.getElementById(PILL_ID)
      if (pill) pill.style.display = active ? 'none' : ''
      var box = state.switcherEl
      if (box) box.style.display = active ? 'none' : ''
    })
  }
  function onSplashMessage(event) {
    var data = event && event.data
    if (!data || typeof data !== 'object') return
    var kind = data.__dshuiSplash
    if (kind === 'done') finishSplash('done')
    else if (kind === 'skip') finishSplash('skipped')
    else if (kind === 'error') finishSplash('error', String(data.message || '').slice(0, 200))
  }

  /** 挂载开屏覆盖层（同源 iframe；force=true 用于面板「重播」）。
   *  @returns {boolean} 是否真的挂上了 */
  function mountSplash(force) {
    if (!force && !splashShouldPlay()) return false
    state.titlebarHeight = measureTitlebarHeight()
    if (force) {
      state.splashPlayed = false
      state.splash.status = 'idle'
      state.splash.reason = ''
    }
    if (state.splashNode) return false
    if (!document.body) return false
    var cfg = {}
    for (var key in SPLASH_CFG) cfg[key] = SPLASH_CFG[key]
    cfg.sound = state.splash.sound === true
    cfg.titlebar = state.titlebarHeight
    // 开屏页跟随 DSH 的实际主题（新开屏默认 auto 读系统配色，可能与 DSH 不一致）。
    cfg.theme = isDarkTheme() ? 'dark' : 'light'
    // 新开屏的两种开场随机使用：拟合（逐字修正）/ 乱码生成。
    cfg.titleMode = Math.random() < 0.5 ? 'scramble' : 'fit'
    var cfgText = safe(function () {
      return encodeURIComponent(JSON.stringify(cfg))
    }, '')
    var url = SPLASH_URL + (cfgText ? '&cfg=' + cfgText : '')
    var node = document.createElement('div')
    node.id = '__dshui-splash'
    node.setAttribute('aria-hidden', 'true')
    var splashBg = isDarkTheme() ? '#0a1224' : '#e3ecfb'
    node.style.cssText =
      'position:fixed;inset:0;z-index:2147483647;background:' + splashBg + ';opacity:1;transition:opacity ' +
      SPLASH_FADE_MS +
      'ms ease;'
    var frame = document.createElement('iframe')
    frame.setAttribute('title', 'DSH UI Beautify 开屏动画')
    frame.setAttribute('allow', 'autoplay')
    frame.setAttribute('frameborder', '0')
    frame.style.cssText = 'display:block;width:100%;height:100%;border:0;background:' + splashBg + ';'
    frame.src = url
    node.appendChild(frame)
    state.splashNode = node
    safe(syncGuiUnderSplash)
    var onMessage = function (event) {
      onSplashMessage(event)
    }
    state.splashListeners.push(function () {
      safe(function () {
        window.removeEventListener('message', onMessage, false)
      })
    })
    safe(function () {
      window.addEventListener('message', onMessage, false)
    })
    safe(function () {
      document.body.appendChild(node)
    })
    state.splashPlayed = true
    state.splash.status = 'playing'
    state.splash.startedAt = Date.now()
    state.splash.endedAt = 0
    state.splash.reason = ''
    state.splash.error = ''
    if (state.splashTimer) {
      clearTimeout(state.splashTimer)
      state.splashTimer = null
    }
    state.splashTimer = setTimeout(function () {
      finishSplash('timeout')
    }, SPLASH_TIMEOUT_MS)
    refreshDiag()
    return true
  }

  /** 摘掉覆盖层与事件（幂等；卸载/重播/揭幕都用它）。 */
  function removeSplashNode() {
    if (state.splashTimer) {
      clearTimeout(state.splashTimer)
      state.splashTimer = null
    }
    for (var i = 0; i < state.splashListeners.length; i++) {
      try {
        state.splashListeners[i]()
      } catch (err) {}
    }
    state.splashListeners.length = 0
    var node = state.splashNode
    state.splashNode = null
    safe(syncGuiUnderSplash)
    if (node && node.parentNode) {
      safe(function () {
        node.parentNode.removeChild(node)
      })
    }
  }

  /** 揭幕：done / skipped / timeout / error 都走这里（先淡出再摘节点）。 */
  function finishSplash(reason, error) {
    if (!state.splashNode) {
      if (state.splashTimer) {
        clearTimeout(state.splashTimer)
        state.splashTimer = null
      }
      return false
    }
    state.splash.status =
      reason === 'done'
        ? 'done'
        : reason === 'skipped'
          ? 'skipped'
          : reason === 'timeout'
            ? 'timeout'
            : 'error'
    state.splash.reason = reason
    state.splash.endedAt = Date.now()
    if (error) state.splash.error = String(error).slice(0, 200)
    var node = state.splashNode
    safe(function () {
      node.style.opacity = '0'
    })
    if (state.splashTimer) {
      clearTimeout(state.splashTimer)
      state.splashTimer = null
    }
    state.splashTimer = setTimeout(function () {
      removeSplashNode()
      // 兜底：任何路径揭幕后都确保方块光标还在（bindCaretOverlay 幂等）。
      // 不按模式判断：start() 里也是无条件绑定；显示与否由 caretStyleActive() 决定。
      safe(function () {
        applyCaretVars()
        bindCaretOverlay()
      })
      refreshDiag()
    }, SPLASH_FADE_MS + 40)
    if (reason !== 'done' && reason !== 'skipped') {
      safe(function () {
        console.warn('[DSH UI Beautify] 开屏动画 ' + reason + (error ? '：' + error : ''))
      })
    }
    if (reason === 'done') {
      setTimeout(function () {
        safe(showSplashWelcome)
      }, SPLASH_FADE_MS + 60)
    }
    refreshDiag()
    return true
  }

  /** 面板「重播」/ API：立刻重放一次（不影响开关设置）。 */
  function replaySplash() {
    removeSplashNode()
    removeSplashWelcome()
    // 不要在这里 unbindCaretOverlay：开屏 iframe 盖在光标层上面，重播完若忘了重绑，
    // 光标会退回普通竖线（用户实测）。重播只重置开屏状态，光标保持原样。
    state.splashPlayed = false
    state.splash.status = 'idle'
    state.splash.reason = ''
    return mountSplash(true)
  }

  /** 面板开关 / API：开屏音效（下次播放生效；正在播放时下一声起生效不了，需重播）。 */
  function setSplashSound(sound) {
    state.splash.sound = !!sound
    saveSplashSettings()
    safe(function () {
      var frame = state.splashNode ? state.splashNode.querySelector('iframe') : null
      var win = frame && frame.contentWindow
      // 同源 iframe：直接改运行中的配置（开屏页 cfg() 只在启动时读，重播才完全生效）
      if (win && win.__DSH_STARTUP_CFG__) win.__DSH_STARTUP_CFG__.sound = state.splash.sound
    })
    refreshDiag()
    return state.splash.sound
  }

  /** 面板开关 / API：持久化并生效（关掉时如果正在播就跳过）。 */
  function setSplashEnabled(enabled) {
    state.splash.enabled = !!enabled
    saveSplashSettings()
    if (!state.splash.enabled) {
      if (state.splashNode) finishSplash('skipped')
      else if (state.splash.status !== 'idle') state.splash.status = 'disabled'
    } else if (state.splash.status === 'disabled') {
      state.splash.status = 'idle'
    }
    refreshDiag()
    return state.splash.enabled
  }

  /* ── 重启键（0.8.0）──────────────────────────────────────────────────────
   * 把「重启」按钮注入 DSH 桌面壳 preload 挂的 shadow-DOM 菜单栏（[data-windows-menu]
   * 里的 [role=menubar]），位置在「应用」「编辑」之后；样式由 shadow 里的 button
   * 规则统一给。点击 → window.dshDesktop.restart()（壳补丁提供）→ 主进程 relaunch。
   * 零侵入：只往菜单栏 append 一个按钮；非桌面端跳过；重复注入幂等；卸载即摘除。
   */
  function restartInDesktopShell() {
    try {
      var html = document.documentElement
      if (!html || !html.getAttribute) return false
      if (html.hasAttribute('data-windows-titlebar')) return true
      return html.getAttribute('data-platform') === 'win32'
    } catch (err) {
      return false
    }
  }

  function restartIsZh() {
    var lang = ''
    try {
      lang = (document.documentElement && document.documentElement.lang) || ''
    } catch (err) {}
    return /^zh/i.test(lang)
  }

  var RESTART_ZH = {
    label: '重启',
    busy: '重启中…',
    tooltip: '重启 DeepSeek Harness（应用与 Host）',
    missingShell:
      '「重启」按钮需要桌面壳补丁：请先完全退出 DSH，双击包里 restart 目录的「安装重启键.cmd」，再重新打开 DSH。',
    failed: '重启失败',
    noResponse: '没有收到重启响应。可右键系统托盘里的 DSH 图标退出，然后重新打开应用。',
    unknown: '未知错误',
  }
  var RESTART_EN = {
    label: 'Restart',
    busy: 'Restarting…',
    tooltip: 'Restart DeepSeek Harness (app and Host)',
    missingShell:
      'The Restart button needs the desktop shell patch: fully quit DSH, run "安装重启键.cmd" from the bundled restart folder, then reopen DSH.',
    failed: 'Restart failed',
    noResponse: 'No restart response. Quit DSH from the system tray and open it again.',
    unknown: 'Unknown error',
  }

  function restartTexts() {
    return restartIsZh() ? RESTART_ZH : RESTART_EN
  }

  function restartLog(message) {
    safe(function () {
      console.info('[DSH UI Beautify · restart] ' + message)
    })
  }

  /**
   * 重启键诊断探针（0.8.3 排查用）：把「桥是否存在 / 按钮是否注入 / 点击结果」
   * 上报到宿主 `/diag`（只读诊断，不会触发重启）。
   */
  function restartProbeInfo() {
    var desktop = null
    try { desktop = window.dshDesktop || null } catch (err) { desktop = null }
    var keys = []
    try {
      if (desktop) keys = Object.keys(desktop).slice(0, 30)
    } catch (err) { keys = [] }
    var topSame = 'unknown'
    try { topSame = window.top === window } catch (err) { topSame = 'cross-origin' }
    return {
      hasDesktop: !!desktop,
      keys: keys,
      restartType: desktop ? typeof desktop.restart : 'none',
      protocol: String((window.location && window.location.protocol) || ''),
      host: String((window.location && window.location.host) || ''),
      topSame: topSame,
      button: !!state.restartButton,
      menubar: !!state.restartMenubar,
      desktopMarker: !!safe(function () {
        return document.documentElement && document.documentElement.hasAttribute('data-windows-titlebar')
      }, false),
      fx: safe(function () {
        var styleEl = document.getElementById(STYLE_ID)
        return {
          mode: state.mode,
          motionOn: !!document.body.classList.contains(MOTION_ON_CLASS),
          theme: isDarkTheme() ? 'dark' : 'light',
          themeKey: state.themeKey,
          themeAttrs: {
            bodyDark: !!(document.body && document.body.hasAttribute && document.body.hasAttribute('data-ds-dark-theme')),
            htmlDark: !!(document.documentElement && document.documentElement.hasAttribute && document.documentElement.hasAttribute('data-ds-dark-theme')),
            htmlColorScheme: (function () {
              try { return String(window.getComputedStyle(document.documentElement).colorScheme || '') } catch (err) { return '' }
            })(),
          },
          paused: !!document.body.classList.contains(MOTION_PAUSED_CLASS),
          aiFx: !!document.body.classList.contains(AI_FX_CLASS),
          replyTargets: document.querySelectorAll(AI_REPLY_SELECTOR).length,
          stepTargets: document.querySelectorAll(AI_STEP_SELECTOR).length,
          aiReplayCount: aiReplayCount,
          stepSamples: (function () {
            var out = []
            var nodes = document.querySelectorAll(AI_STEP_SELECTOR)
            for (var i = 0; i < nodes.length && i < 4; i++) {
              var el = nodes[i]
              var cs = window.getComputedStyle(el)
              out.push({
                tag: el.tagName ? el.tagName.toLowerCase() : '',
                cls: String(el.className || '').slice(0, 60),
                opacity: cs ? cs.opacity : '',
                animation: cs ? cs.animationName : '',
                color: cs ? cs.color : '',
                text: thinkingRowText(el),
              })
            }
            return out
          })(),
          hasKeyframes: !!(styleEl && styleEl.textContent && styleEl.textContent.indexOf('__dshui-ai-line-in') !== -1),
        }
      }, null),
    }
  }

  function reportRestartProbe(tag, extra) {
    safe(function () {
      var payload = {
        probe: 'restart',
        tag: tag,
        win: state.windowTag,
        at: Date.now(),
        version: VERSION,
        info: restartProbeInfo(),
      }
      if (extra) payload.extra = extra
      var data = encodeURIComponent(JSON.stringify(payload))
      fetch(PREFIX + '/diag?data=' + data, { cache: 'no-store' }).catch(function () {})
    })
  }

  function restartErrorText(error) {
    var texts = restartTexts()
    if (error === undefined || error === null) return texts.unknown
    if (typeof error === 'string') return error
    if (typeof error.message === 'string' && error.message) return error.message
    return String(error)
  }

  /** 找 preload 挂的 shadow DOM 菜单栏；没挂载好时返回 null。 */
  function restartFindMenubar() {
    var host = null
    try {
      host = document.querySelector(RESTART_HOST_SELECTOR)
    } catch (err) {
      return null
    }
    if (!host) return null
    var shadow = null
    try {
      shadow = host.shadowRoot
    } catch (err) {
      shadow = null
    }
    if (!shadow) return null
    var bar = null
    try {
      bar = shadow.querySelector('[role="menubar"]')
    } catch (err) {
      return null
    }
    if (!bar) return null
    state.restartHost = host
    state.restartMenubar = bar
    state.restart.hostFound = true
    return bar
  }

  function restartApplyLabel() {
    var button = state.restartButton
    if (!button) return
    var texts = restartTexts()
    var busy = !!state.restart.busy
    button.textContent = busy ? texts.busy : texts.label
    button.setAttribute('aria-label', texts.tooltip)
    if (button.title !== texts.tooltip) button.title = texts.tooltip
    if (busy) button.setAttribute('aria-busy', 'true')
    else button.removeAttribute('aria-busy')
  }

  function restartCreateButton(bar) {
    var button = document.createElement('button')
    button.type = 'button'
    button.setAttribute('role', 'menuitem')
    button.setAttribute(RESTART_BUTTON_ATTR, '')
    button.tabIndex = -1
    button.style.cssText =
      'margin-left:4px;padding-left:12px;border-left:1px solid var(--dsw-alias-border-l2);' +
      'border-radius:0 6px 6px 0;-webkit-app-region:no-drag;'
    button.addEventListener('pointerdown', function (event) {
      safe(function () {
        event.preventDefault()
      })
    })
    button.addEventListener('mousedown', function (event) {
      safe(function () {
        event.preventDefault()
      })
    })
    button.addEventListener('click', restartOnActivate)
    button.addEventListener('keydown', restartOnKeyDown)
    bar.appendChild(button)
    return button
  }

  /** 确保菜单栏里恰有一个「重启」按钮；成功返回 true。 */
  function restartEnsureButton() {
    var button = state.restartButton
    if (button && button.isConnected && state.restartMenubar && state.restartMenubar.contains(button)) {
      restartApplyLabel()
      state.restart.installed = true
      return true
    }
    if (!restartFindMenubar()) return false
    try {
      if (!button || !button.isConnected) {
        state.restartButton = restartCreateButton(state.restartMenubar)
      } else if (button.parentNode !== state.restartMenubar) {
        state.restartMenubar.appendChild(button)
      }
      restartApplyLabel()
      state.restart.installed = true
      return true
    } catch (err) {
      state.restart.lastError = '注入失败：' + restartErrorText(err)
      restartLog(state.restart.lastError)
      return false
    }
  }

  /** preload 暴露的桥（壳补丁装好才有）；返回 null 表示缺壳补丁。 */
  /** 宿主是否已自动准备壳补丁（Plan A：退出 DSH 后生效）。 */
  function restartAutoPrepared() {
    var status = state.restart.status
    return !!(status && status.auto && status.auto.prepared && !restartGetBridge())
  }

  /** 读宿主 /restart-status.json（补丁 / 自动准备 / 安装器状态）。 */
  function restartRefreshStatus() {
    if (restartRefreshStatus.running) return null
    restartRefreshStatus.running = true
    return fetch(RESTART_STATUS_URL, { cache: 'no-store', credentials: 'same-origin' })
      .then(function (response) {
        return response && response.ok ? response.json() : null
      })
      .then(
        function (payload) {
          restartRefreshStatus.running = false
          if (!payload || !payload.ok) return null
          state.restart.status = payload
          if (restartAutoPrepared() && !state.restart.autoToastShown) {
            state.restart.autoToastShown = true
            restartShowToast('已自动准备重启键补丁：完全退出 DSH 后生效（无需其它操作）。')
          }
          if (state.switcherEl) reRenderSwitcher()
          refreshDiag()
          return payload
        },
        function () {
          restartRefreshStatus.running = false
          return null
        },
      )
  }

  function restartGetBridge() {
    try {
      var desktop = window.dshDesktop
      if (!desktop || typeof desktop[RESTART_BRIDGE_METHOD] !== 'function') return null
      return desktop
    } catch (err) {
      return null
    }
  }

  function restartShowToast(message) {
    try {
      var existing = document.querySelector('[' + RESTART_TOAST_ATTR + ']')
      if (existing && existing.parentNode) existing.parentNode.removeChild(existing)
      var node = document.createElement('div')
      node.setAttribute(RESTART_TOAST_ATTR, '')
      node.textContent = message
      node.style.cssText =
        'position:fixed;top:calc(var(--dsh-windows-titlebar-height, 40px) + 10px);left:50%;' +
        'transform:translateX(-50%);z-index:1200;max-width:min(560px, 80vw);padding:10px 14px;' +
        'border-radius:10px;background:var(--dsw-alias-bg-overlay, #2b2b2b);' +
        'color:var(--dsw-alias-label-primary, #ffffff);' +
        'border:1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.35));' +
        'box-shadow:0 8px 24px rgba(0,0,0,0.18);font:13px/20px var(--dsw-font-family, system-ui);' +
        'white-space:pre-wrap;-webkit-app-region:no-drag;pointer-events:none;'
      ;(document.body || document.documentElement).appendChild(node)
      if (state.restartToastTimer) clearTimeout(state.restartToastTimer)
      state.restartToastTimer = setTimeout(function () {
        state.restartToastTimer = null
        safe(function () {
          if (node.parentNode) node.parentNode.removeChild(node)
        })
      }, 7000)
    } catch (err) {
      restartLog('提示浮层失败：' + restartErrorText(err))
    }
  }

  /** 点击「重启」：有桥就真重启；没桥就明确提示去装壳补丁。 */
  function restartOnActivate(event) {
    if (event) {
      safe(function () {
        if (typeof event.preventDefault === 'function') event.preventDefault()
        if (typeof event.stopPropagation === 'function') event.stopPropagation()
      })
    }
    if (state.restart.busy) return
    var bridge = restartGetBridge()
    if (!bridge) {
      restartLog('未检测到桌面壳补丁（window.dshDesktop.restart 不存在）')
      reportRestartProbe('missing-bridge')
      state.restart.lastError = 'missing-shell-patch'
      restartShowToast(restartTexts().missingShell)
      refreshDiag()
      return
    }
    var texts = restartTexts()
    state.restart.busy = true
    restartApplyLabel()
    var settled = false
    var timer = setTimeout(function () {
      if (settled) return
      settled = true
      state.restart.busy = false
      restartApplyLabel()
      reportRestartProbe('timeout')
      restartShowToast(texts.noResponse)
    }, 10000)
    function settle() {
      if (settled) return false
      settled = true
      if (timer) clearTimeout(timer)
      state.restart.busy = false
      restartApplyLabel()
      return true
    }
    var invocation
    try {
      invocation = bridge[RESTART_BRIDGE_METHOD]()
    } catch (error) {
      settle()
      reportRestartProbe('invoke-throw', { error: restartErrorText(error) })
      restartShowToast(texts.failed + '：' + restartErrorText(error))
      return
    }
    Promise.resolve(invocation).then(
      function (result) {
        reportRestartProbe('result', { ok: !(result && result.ok === false), result: result ? String(JSON.stringify(result)).slice(0, 300) : null })
        if (result && result.ok === false) {
          if (result.cancelled) {
            settle()
            return
          }
          settle()
          restartShowToast(texts.failed + '：' + restartErrorText(result.error || texts.unknown))
          return
        }
        restartLog('已请求重启（主进程会 relaunch）')
      },
      function (error) {
        settle()
        reportRestartProbe('reject', { error: restartErrorText(error) })
        restartShowToast(texts.failed + '：' + restartErrorText(error))
      },
    )
  }

  /**
   * 面板「启用重启键」：POST 宿主 → 宿主 detached 启动随包壳补丁安装器；
   * 安装器会等 DSH 完全退出后打补丁并自动重启，随后 preload 桥生效、按钮变「可用」。
   */
  function enableRestartKey() {
    if (state.restart.enabling) return false
    state.restart.enabling = true
    if (state.switcherEl) reRenderSwitcher()
    fetch(RESTART_ENABLE_URL, {
      method: 'POST',
      headers: { 'x-dshui-action': 'restart-enable' },
      credentials: 'same-origin',
      cache: 'no-store',
    })
      .then(function (response) {
        return response && response.ok ? response.json() : null
      })
      .then(function (payload) {
        state.restart.enabling = false
        if (payload && payload.ok) {
          restartShowToast(
            payload.already
              ? '重启键已启用（壳补丁已安装），标题栏「重启」可用。'
              : '已启动安装器：请右键系统托盘 → 退出 DSH；后台会自动打补丁并重启，之后「重启」即可用。',
          )
          state.restart.lastError = ''
          restartRefreshStatus()
        } else {
          restartShowToast('启用失败：' + restartErrorText(payload && payload.error ? payload.error : '未知错误') + '。也可手动双击 restart/install-restart-key.cmd。')
        }
        if (state.switcherEl) reRenderSwitcher()
        refreshDiag()
      })
      .catch(function (err) {
        state.restart.enabling = false
        restartShowToast('启用失败：' + restartErrorText(err) + '。也可手动双击 restart/install-restart-key.cmd。')
        if (state.switcherEl) reRenderSwitcher()
        refreshDiag()
      })
    return true
  }

  function restartOnKeyDown(event) {
    if (!event || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return
    safe(function () {
      event.preventDefault()
    })
    var buttons = []
    try {
      if (state.restartMenubar) {
        var all = state.restartMenubar.querySelectorAll('button')
        for (var i = 0; i < all.length; i++) buttons.push(all[i])
      }
    } catch (err) {}
    if (buttons.length === 0) return
    var index = buttons.indexOf(event.currentTarget)
    if (index < 0) return
    var step = event.key === 'ArrowRight' ? 1 : -1
    var next = buttons[(index + step + buttons.length) % buttons.length]
    if (!next) return
    for (var j = 0; j < buttons.length; j++) buttons[j].tabIndex = -1
    next.tabIndex = 0
    safe(function () {
      next.focus()
    })
  }

  function restartStopDiscovery() {
    var discovery = state.restartDiscovery
    if (!discovery) return
    safe(function () {
      discovery.observer.disconnect()
    })
    if (discovery.timer) clearTimeout(discovery.timer)
    state.restartDiscovery = null
  }

  /** 判断是否已有旧版独立插件（dsh-restart-button）提供「重启」按钮：有则本插件不重复注入。 */
  function restartProvidedByOtherPlugin() {
    try {
      // 旧插件的按钮在 shadow menubar 里（document 查询看不到），要走 shadowRoot；
      // 另外它也会暴露 window.__DSH_RESTART_BUTTON__（installed=true）。
      var bar = restartFindMenubar()
      if (bar && bar.querySelectorAll('[data-dsh-restart-button]').length > 0) return true
      var legacy = window.__DSH_RESTART_BUTTON__
      if (legacy && legacy.installed === true) return true
    } catch (err) {}
    return false
  }
  function restartTryInstall() {
    if (restartProvidedByOtherPlugin()) {
      state.restart.suppressed = 'provided-by-dsh-restart-button'
      state.restart.installed = false
      restartStopDiscovery()
      restartStopWatchdog()
      restartLog('检测到独立插件 dsh-restart-button 已提供「重启」按钮：本插件暂不重复注入')
      // 让路是「暂缓」而不是「永久」：新版 dsh-restart-key 检测到美化插件后会主动撤下自己，
      // 这时必须由本插件接手，否则双方都让路 → 没有按钮。
      if (!state.restart.suppressTimer && state.restart.suppressTries < 4) {
        state.restart.suppressTries += 1
        state.restart.suppressTimer = setTimeout(function () {
          state.restart.suppressTimer = null
          state.restart.suppressed = ''
          safe(restartTryInstall)
        }, 1800)
      }
      refreshDiag()
      return true
    }
    if (restartEnsureButton()) {
      restartStopDiscovery()
      restartStartWatchdog()
      restartLog('已注入「重启」按钮（桥=' + (restartGetBridge() ? '可用' : '缺失') + '）')
      refreshDiag()
      return true
    }
    return false
  }

  function restartStartDiscovery() {
    if (state.restartDiscovery) return
    state.restartDiscovery = { observer: null, timer: null }
    try {
      if (typeof MutationObserver === 'function') {
        var observer = new MutationObserver(function () {
          safe(restartTryInstall)
        })
        observer.observe(document.body || document.documentElement, { childList: true })
        state.restartDiscovery.observer = observer
      }
    } catch (err) {}
    var ticks = 0
    function tick() {
      if (!state.restartDiscovery) return
      state.restartDiscovery.timer = null
      if (restartTryInstall()) return
      ticks += 1
      if (ticks >= RESTART_DISCOVERY_MAX) {
        restartStopDiscovery()
        restartLog('没有找到菜单栏（' + RESTART_HOST_SELECTOR + '），可能不是 Windows 桌面端')
        return
      }
      state.restartDiscovery.timer = setTimeout(tick, RESTART_DISCOVERY_MS)
    }
    state.restartDiscovery.timer = setTimeout(tick, RESTART_DISCOVERY_MS)
  }

  function restartWatchLanguage() {
    if (state.restartLangObserver) return
    safe(function () {
      if (typeof MutationObserver !== 'function') return
      var observer = new MutationObserver(function () {
        safe(restartApplyLabel)
      })
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] })
      state.restartLangObserver = observer
    })
  }

  /**
   * 休眠恢复看护（v0.8.14）。
   *
   * 标题栏「重启」按钮是插件往 shadow menubar 里注入的 DOM 节点；窗口长时间隐藏 /
   * 系统休眠恢复后，Chromium 重建合成层或宿主重排标题栏时，可能出现：
   *   - 按钮节点被摘掉（应用/编辑还在）→ 本看护自动补回；
   *   - 节点还在但尺寸塌成 0 → 重新 append 一次强制重排。
   * 触发点：visibilitychange（变为可见）、window.focus、pageshow，加 1.5s 低频轮询兜底；
   * 仍遵守双向冲突保护（state.restart.suppressed 时不动）。
   */
  function restartStartWatchdog() {
    if (state.restartWatchdog) return
    var wd = { timer: null, handlers: [], observer: null, observedBar: null, check: null, lastTickAt: Date.now() }
    state.restartWatchdog = wd

    function dropBarObserver() {
      if (wd.observer) safe(function () { wd.observer.disconnect() })
      wd.observer = null
      wd.observedBar = null
    }

    function watchBar(bar) {
      if (wd.observer && wd.observedBar === bar) return
      dropBarObserver()
      if (typeof MutationObserver !== 'function') return
      try {
        var observer = new MutationObserver(function () {
          safe(function () { wd.check('menubar-mutation') })
        })
        observer.observe(bar, { childList: true })
        wd.observer = observer
        wd.observedBar = bar
      } catch (err) {}
    }

    wd.check = function (why) {
      if (!state.restartWatchdog) return
      if (!state.restart.desktop || state.restart.suppressed) return
      var bar = restartFindMenubar()
      if (!bar) {
        dropBarObserver()
        restartStartDiscovery()
        return
      }
      var button = state.restartButton
      if (!button || !button.isConnected || !bar.contains(button)) {
        if (restartEnsureButton()) {
          restartStopDiscovery()
          state.restart.repairs = (state.restart.repairs || 0) + 1
          state.restart.lastRepairAt = Date.now()
          restartLog('看护：按钮不在菜单栏，已重新注入（' + (why || 'periodic') + '）')
        } else {
          restartStartDiscovery()
        }
      }
      watchBar(bar)
    }

    function forcePaint(why) {
      // 只在「休眠恢复/页面恢复」时强制重排一次：直接重挂到菜单栏末尾（视觉位置不变，
      // 但会触发合成层重新绘制）；周期性轮询不这么做，避免无谓重排。
      if (why !== 'visibility' && why !== 'pageshow' && why !== 'resume-gap') return
      var button = state.restartButton
      var bar = state.restartMenubar
      if (!button || !bar || !button.isConnected || !bar.contains(button)) return
      safe(function () {
        bar.appendChild(button)
        restartApplyLabel()
      })
    }
    function onWake(why) {
      safe(function () {
        wd.check(why)
        forcePaint(why)
      })
    }
    try {
      var visibility = function () {
        if (!document.hidden) onWake('visibility')
      }
      document.addEventListener('visibilitychange', visibility)
      wd.handlers.push(['document', 'visibilitychange', visibility])
      var focus = function () { onWake('focus') }
      window.addEventListener('focus', focus)
      wd.handlers.push(['window', 'focus', focus])
      var pageshow = function () { onWake('pageshow') }
      window.addEventListener('pageshow', pageshow)
      wd.handlers.push(['window', 'pageshow', pageshow])
    } catch (err) {}
    wd.check('start')
    function tick() {
      if (!state.restartWatchdog) return
      var now = Date.now()
      var gap = now - (wd.lastTickAt || now)
      wd.lastTickAt = now
      if (!document.hidden) {
        // 系统休眠/长时间挂起时浏览器可能不派发 visibility/focus；用计时器间隔跳变兜底，
        // 恢复后第一拍按「唤醒」处理（检查 + 强制重绘一次）。
        if (gap >= 30000) onWake('resume-gap')
        else onWake('periodic')
      }
      state.restartWatchdog.timer = setTimeout(tick, 1500)
    }
    wd.timer = setTimeout(tick, 1500)
  }

  function restartStopWatchdog() {
    var wd = state.restartWatchdog
    if (!wd) return
    state.restartWatchdog = null
    if (wd.timer) clearTimeout(wd.timer)
    if (wd.observer) safe(function () { wd.observer.disconnect() })
    for (var i = 0; i < wd.handlers.length; i++) {
      try {
        var entry = wd.handlers[i]
        if (entry[0] === 'document') document.removeEventListener(entry[1], entry[2])
        else window.removeEventListener(entry[1], entry[2])
      } catch (err) {}
    }
  }

  /** 启动重启键：只在 Windows 桌面壳里动；自检入口 __DSHUI__.restart。 */
  function startRestartButton() {
    state.restart.attempted = true
    state.restart.desktop = restartInDesktopShell()
    if (!state.restart.desktop) {
      restartLog('非 Windows 桌面壳环境，跳过「重启」按钮注入')
      return false
    }
    restartWatchLanguage()
    try {
      setTimeout(restartRefreshStatus, 1500)
      setTimeout(restartRefreshStatus, 8000)
    } catch (err) {}
    if (restartTryInstall()) return true
    restartStartDiscovery()
    return false
  }

  /** 卸载：摘按钮、清浮层、停发现循环与语言监听（只动我们自己的东西）。 */
  function stopRestartButton() {
    restartStopWatchdog()
    restartStopDiscovery()
    if (state.restart.suppressTimer) {
      clearTimeout(state.restart.suppressTimer)
      state.restart.suppressTimer = null
    }
    if (state.restartLangObserver) {
      safe(function () {
        state.restartLangObserver.disconnect()
      })
      state.restartLangObserver = null
    }
    if (state.restartToastTimer) {
      clearTimeout(state.restartToastTimer)
      state.restartToastTimer = null
    }
    var button = state.restartButton
    state.restartButton = null
    if (button && button.parentNode) {
      safe(function () {
        button.parentNode.removeChild(button)
      })
    }
    safe(function () {
      var toast = document.querySelector('[' + RESTART_TOAST_ATTR + ']')
      if (toast && toast.parentNode) toast.parentNode.removeChild(toast)
    })
    state.restartMenubar = null
    state.restartHost = null
    state.restart.installed = false
    state.restart.busy = false
  }

  function restartBridgeState() {
    if (!state.restart.desktop) return 'not-desktop'
    return restartGetBridge() ? 'available' : 'missing'
  }

  /** 诊断里的「重启:」一行。 */
  function restartDiagText() {
    var r = state.restart
    if (!r.desktop) return '仅 Windows 桌面端（当前跳过）'
    var parts = []
    if (r.suppressed === 'provided-by-dsh-restart-button') {
      parts.push('按钮由独立插件 dsh-restart-button 提供（本插件不重复注入）')
    } else {
      parts.push(r.installed ? '按钮已注入' : r.hostFound ? '按钮注入中' : '未找到菜单栏')
    }
    var bridge = restartBridgeState()
    if (bridge === 'available') parts.push('壳补丁可用')
    else if (restartAutoPrepared()) parts.push('壳补丁已自动准备（完全退出 DSH 后生效）')
    else parts.push('壳补丁缺失（面板点「启用重启键」，退出 DSH 一次）')
    safe(function () {
      var legacy = window.__DSH_RESTART_BUTTON__
      if (legacy && legacy.suppressed) parts.push('独立重启插件已让路（本插件提供按钮）')
    })
    if (r.busy) parts.push('重启中…')
    if (state.restartWatchdog) parts.push('看护中' + (r.repairs ? '（已补回 ' + r.repairs + ' 次）' : ''))
    if (r.lastError && r.lastError !== 'missing-shell-patch') parts.push(String(r.lastError).slice(0, 60))
    return parts.join(' · ')
  }

  function restartSnapshot() {
    var r = state.restart
    return {
      attempted: r.attempted,
      desktop: r.desktop,
      hostFound: r.hostFound,
      installed: r.installed,
      bridge: restartBridgeState(),
      busy: r.busy,
      suppressed: r.suppressed,
      lastError: r.lastError,
      /** v0.8.15：休眠/唤醒看护是否在跑，以及累计补回次数（只用于诊断）。 */
      watchdog: !!state.restartWatchdog,
      repairs: r.repairs || 0,
      lastRepairAt: r.lastRepairAt || 0,
      text: restartDiagText(),
    }
  }

  function readGroup() {
    var value = safe(function () {
      return window.localStorage.getItem(GROUP_KEY)
    }, null)
    return GROUPS.indexOf(value) === -1 ? null : value
  }

  function writeGroup(group) {
    safe(function () {
      window.localStorage.setItem(GROUP_KEY, group)
    })
  }

  function defaultAnchors() {
    var out = {}
    for (var i = 0; i < ANCHOR_DEFS.length; i++) {
      out[ANCHOR_DEFS[i].id] = { x: ANCHOR_DEFS[i].x, y: ANCHOR_DEFS[i].y }
    }
    return out
  }

  function clampAnchor(value) {
    var n = Number(value)
    if (!isFinite(n)) return 0.5
    return Math.min(1, Math.max(0, n))
  }

  function normalizeAnchors(parsed) {
    if (!parsed || typeof parsed !== 'object') return null
    var out = {}
    for (var i = 0; i < ANCHOR_DEFS.length; i++) {
      var def = ANCHOR_DEFS[i]
      var item = parsed[def.id]
      if (!item || typeof item !== 'object') return null
      out[def.id] = { x: clampAnchor(item.x), y: clampAnchor(item.y) }
    }
    return out
  }

  function loadAnchors() {
    var raw = safe(function () {
      return window.localStorage.getItem(ANCHORS_KEY)
    }, null)
    if (!raw) return null
    var parsed = null
    try {
      parsed = JSON.parse(raw)
    } catch (err) {
      return null
    }
    return normalizeAnchors(parsed)
  }

  function saveAnchors() {
    safe(function () {
      window.localStorage.setItem(ANCHORS_KEY, JSON.stringify(state.dynamicAnchors))
    })
  }

  function anchorsSnapshot() {
    var copy = {}
    var src = state.dynamicAnchors || defaultAnchors()
    for (var i = 0; i < ANCHOR_DEFS.length; i++) {
      var id = ANCHOR_DEFS[i].id
      var item = src[id] || { x: 0.5, y: 0.5 }
      copy[id] = { x: item.x, y: item.y }
    }
    return copy
  }

  function setAnchor(id, x, y) {
    var found = false
    for (var i = 0; i < ANCHOR_DEFS.length; i++) {
      if (ANCHOR_DEFS[i].id === id) found = true
    }
    if (!found) return false
    if (!state.dynamicAnchors) state.dynamicAnchors = defaultAnchors()
    state.dynamicAnchors[id] = { x: clampAnchor(x), y: clampAnchor(y) }
    return true
  }

  function syncDynamicClass() {
    safe(function () {
      if (!document.body) return
      if (state.modeGroup === 'dynamic') document.body.classList.add('__dshui-dynamic')
      else document.body.classList.remove('__dshui-dynamic')
    })
  }

  function staticGroupMode() {
    var mode = state.lastStaticMode || readMode()
    if (mode !== 'multiply' && mode !== 'backdrop') mode = 'multiply'
    return mode
  }

  /** 顶层分组切换：关闭 / 静态（纹理|背景） / 动态（开发中，暂复用静态渲染）。 */
  function applyGroup(group, mode) {
    if (GROUPS.indexOf(group) === -1) group = 'static'
    var wasDynamic = state.modeGroup === 'dynamic'
    if (wasDynamic && group !== 'dynamic') safe(stopDynamicEngine)
    state.modeGroup = group
    writeGroup(group)
    if (group === 'off') {
      writeMode('off')
      applyMode('off')
    } else if (group === 'dynamic') {
      var base = staticGroupMode()
      state.lastStaticMode = base
      writeMode(base)
      applyMode(base)
    } else {
      var target = mode === 'multiply' || mode === 'backdrop' ? mode : staticGroupMode()
      state.lastStaticMode = target
      writeMode(target)
      applyMode(target)
    }
    syncDynamicClass()
    syncAnchorGuides()
    if (group === 'dynamic') {
      safe(disableDynamicEffectsCleanup)
      safe(stopDynamicEngine)
    } else safe(stopDynamicEngine)
    updatePill()
    refreshDiag()
    if (state.switcherEl) reRenderSwitcher()
    return group
  }


  function disableDynamicEffectsCleanup() {
    safe(function () {
      state.dynamicPreview = false
      state.dynamicSuspended = false
      state.dynamicReenterArmed = false
      dynamicClearPreviewDemo()
      dynamicClearCinema()
      dynamicRestoreBoxes()
      dynamicRestoreOldFlows()
      dynamicRestoreOverflow()
      dynamicUseSharpBackground(false)
      dynamicRestoreBackground()
      state.dynamicHiddenFlows = []
      state.dynamicOverflowSaved = []
      state.dynamicManaged = []
      state.dynamicCinematic = false
      if (document.body) document.body.classList.remove('__dshui-dynamic-thinking')
      var nodes = document.querySelectorAll('[data-chat-flow-key]')
      for (var i = 0; i < nodes.length; i++) {
        if (!nodes[i].__dshuiDynHidden) continue
        nodes[i].style.opacity = ''
        nodes[i].style.visibility = ''
        nodes[i].style.pointerEvents = ''
        delete nodes[i].__dshuiDynHidden
      }
    })
  }

  function groupLabel(group) {
    if (group === 'dynamic') return '动态 · 开发中'
    if (group === 'static') return '静态 · ' + (staticGroupMode() === 'multiply' ? '纹理' : '背景')
    return '关闭'
  }

  function readMode() {
    var value = safe(function () {
      return window.localStorage.getItem(STORAGE_KEY)
    }, null)
    if (MODES.indexOf(value) === -1) return 'off' // 默认 = 关闭（一切恢复默认）
    return value
  }

  function writeMode(mode) {
    safe(function () {
      window.localStorage.setItem(STORAGE_KEY, mode)
    })
  }

  function readImage() {
    return safe(function () {
      return window.localStorage.getItem(IMAGE_KEY)
    }, null)
  }

  function writeImage(name) {
    safe(function () {
      if (name) window.localStorage.setItem(IMAGE_KEY, name)
      else window.localStorage.removeItem(IMAGE_KEY)
    })
  }

  function readDarkImage() {
    return safe(function () {
      return window.localStorage.getItem(IMAGE_KEY_DARK)
    }, null)
  }

  function writeDarkImage(name) {
    safe(function () {
      if (name) window.localStorage.setItem(IMAGE_KEY_DARK, name)
      else window.localStorage.removeItem(IMAGE_KEY_DARK)
    })
  }

  /** 当前主题下可显示的图片候选：深色优先用 darkImages，浅色保持原来的两张。 */
  function imageListForTheme() {
    if (isDarkTheme() && state.darkImages.length > 0) return state.darkImages
    return state.images
  }

  /** 当前主题下应该用哪张图（保存的偏好仍在该主题列表里就用它，否则第一张）。 */
  function themeImageWanted() {
    var list = imageListForTheme()
    var names = []
    for (var i = 0; i < list.length; i++) names.push(list[i].name)
    if (names.length === 0) return null
    var dark = isDarkTheme()
    var saved = dark ? readDarkImage() : readImage()
    return saved && names.indexOf(saved) !== -1 ? saved : names[0]
  }

  /** 主题切换 / 启动 / 切模式时，把壁纸同步成当前主题应该用的那张（暗色壁纸缺失时完全不动）。 */
  function syncThemeImage(force, extraOptions) {
    if (!force && state.mode === 'off') return Promise.resolve(null)
    var wanted = themeImageWanted()
    if (!wanted || !state.darkImages.length && !isDarkTheme() && state.imageName === wanted) return Promise.resolve(null)
    if (state.imageName === wanted) return Promise.resolve(null)
    var dark = isDarkTheme()
    if (dark) writeDarkImage(wanted)
    var setOptions = { noPersist: dark }
    if (extraOptions) {
      for (var k in extraOptions) {
        if (Object.prototype.hasOwnProperty.call(extraOptions, k)) setOptions[k] = extraOptions[k]
      }
    }
    return setImage(wanted, setOptions).then(function (text) {
      if (state.switcherEl) reRenderSwitcher()
      refreshDiag()
      return text
    })
  }

  /** 当前图对应的 CSS 变量：主题薄纱层（可选）+ 图本身。 */
  var VEIL_LIGHT = [255, 255, 255]
  var VEIL_DARK = [12, 14, 18]
  function veilRgb() {
    return isDarkTheme() ? VEIL_DARK : VEIL_LIGHT
  }

  function backgroundImageValue() {
    var rgb = veilRgb()
    var scrim =
      state.scrim > 0
        ? 'linear-gradient(rgba(' +
          rgb.join(',') +
          ',' +
          state.scrim +
          '),rgba(' +
          rgb.join(',') +
          ',' +
          state.scrim +
          ')),'
        : ''
    return scrim + 'url("' + state.bgUrl + '")'
  }

  // ── 样式与层 ──────────────────────────────────────────────────────────────
  /**
   * 样式表**必须完全静态**：里面不含任何随状态变化的数值（图片 URL、浓度、模糊、
   * 白层都在元素内联样式 / CSS 变量里）。
   *
   * 为什么强调这个：每次 `installStyle()` 改写样式表文本，浏览器都要重新解析规则、
   * 重建合成层；带 `mix-blend-mode` 的图层在重建过程中可能有一帧是"没应用混合"的，
   * 那时一张 90% 白的图会以普通方式铺满全屏 —— 就是"换图时整屏闪一下白光"。
   * 静态表 → 首次插入之后永不再写，从根上不产生这种重绘风暴。
   */
  function styleText() {
    var rules = []
    rules.push(
      '#' + LAYER_ID + '{' +
        'position:fixed;top:0;left:0;width:100vw;height:100vh;' +
        'pointer-events:none;' +
        'background-size:cover;background-position:center center;background-repeat:no-repeat;' +
        'transition:opacity ' + FADE_MS + 'ms ease;' +
        // 悬浮/输入导致的局部重绘不要让全屏混合层重新分组（Chromium 上会出现整页闪一下）
        'will-change:opacity;' +
        '}',
    )
    // 换图交叉淡化的第二层：样式与第一层一致（图/浓度都由 JS 内联指定）
    rules.push(
      '#' + LAYER2_ID + '{' +
        'position:fixed;top:0;left:0;width:100vw;height:100vh;' +
        'pointer-events:none;' +
        'background-size:cover;background-position:center center;background-repeat:no-repeat;' +
        'transition:opacity ' + FADE_MS + 'ms ease;' +
        'will-change:opacity;' +
        '}',
    )
    // 纹理：乘法混合，白底处文字完全不受影响（浓度是内联的，见 layerOpacityTarget）
    rules.push(
      '#' + LAYER_ID + '[data-mode="multiply"],#' + LAYER2_ID + '[data-mode="multiply"]{' +
        'z-index:' + LAYER_Z.wallpaperOverlay + ';mix-blend-mode:multiply;}',
    )
    // 深色主题的纹理模式：multiply 会把暗色壁纸压成近黑（暗UI × 暗图），换 lighten 让暗夜图可见。
    rules.push(
      'body[data-ds-dark-theme] #' + LAYER_ID + '[data-mode="multiply"],body[data-ds-dark-theme] #' + LAYER2_ID + '[data-mode="multiply"]{' +
        'mix-blend-mode:lighten;}',
    )
    // 「背景」模式（0.3.0 起）：图放到**最底**。依据 CSS 绘制顺序：负 z-index 的定位子元素
    // 画在 canvas 底色（body 的背景被提升成 canvas 底色）之上、正文流内内容之下 ——
    // 于是 DSH 面板(100~1100) / 鲸鱼浮层(9999~40000) 全部天然落在图之上，一个别人的节点都不用改。
    // （证据：DSH 外壳样式 `body{background:var(--dsw-alias-bg-base)}`、`#root` 与会话列均无背景，
    // 见 HANDOFF §11「外部参考」。）
    rules.push(
      '#' + LAYER_ID + '[data-mode="backdrop"],#' + LAYER2_ID + '[data-mode="backdrop"]{' +
        'z-index:' + LAYER_Z.wallpaperBase + ';mix-blend-mode:normal;}',
    )
    // 「背景」模式（0.3.1 补）：把 DSH 外壳那层不透明 frame 底色覆盖成透明，
    // 否则 -1 的图被它整块盖住（此前另一份实现漏了这一层 —— 实测见上）。
    // 只覆盖 background 两个长属性、类开关摘除即逐字还原（铁律 3）。
    rules.push(
      'body.' + BACKDROP_CLASS + ' .BynINW_frame,' +
        'html[data-windows-titlebar] body.' + BACKDROP_CLASS + ' .BynINW_centerCol,' +
        'html[data-platform=darwin] body.' + BACKDROP_CLASS + ' .BynINW_centerCol{' +
        'background-color:transparent!important;background-image:none!important;}',
    )
    // Windows 标题栏那 40px 高的一条是 frame 的 ::before 画的（不透明），也一并压透明。
    // data-windows-titlebar 具体挂在 html 还是 body 上不猜：两种锚都写。
    rules.push(
      'html[data-windows-titlebar] body.' + BACKDROP_CLASS + ' .BynINW_frame:before,' +
        'body[data-windows-titlebar].' + BACKDROP_CLASS + ' .BynINW_frame:before{' +
        'background:transparent!important;}',
    )
    // ── 毛玻璃 = 一层"模糊的白色层"（真分层）───────────────────────────────
    // 原理：半透明白底 + backdrop-filter。浏览器会把**这层背后的内容**先糊掉，
    // 再垫上半透明白 —— 所以聊天记录从玻璃下面滚过时会被糊成柔和的光影，
    // 这就是"分层感"，而不是贴一张假图。
    //   · 文字/控件在元素自身的内容层，天然清晰；
    //   · 参数走 CSS 变量（滑块实时生效、同样不用重建样式表）；
    //   · 不碰 position / transform / overflow → 不会撑出滚动条、不破坏布局。
    rules.push(
      'body.' + FROST_CLASS + ' .' + FROST_SURFACE_CLASS + '{' +
        'background:radial-gradient(ellipse at 50% 50%,' +
        'rgba(var(--dsniang-frost-rgb,255,255,255),var(--dsniang-frost-alpha-center,0.11)) 0%,' +
        'rgba(var(--dsniang-frost-rgb,255,255,255),var(--dsniang-frost-alpha-edge,0.11)) 100%)!important;' +
        'box-shadow:' + FROST_SURFACE_SHADOW + '!important;' +
        'backdrop-filter:blur(var(--dsniang-frost-blur,' + FROST_BLUR_DEFAULT + 'px)) saturate(1.15)!important;' +
        '-webkit-backdrop-filter:blur(var(--dsniang-frost-blur,' + FROST_BLUR_DEFAULT + 'px)) saturate(1.15)!important;' +
        '}',
    )
    // 用户气泡（v0.2.39 方案 B；v0.2.40 加透明度/颜色/模糊三个旋钮）：**不换色，只调透明度**。
    // 选择器比主表面那条多一个属性选择器 → 必然覆盖；`color-mix` 里
    //   · 颜色 = `--dsniang-bubble-color`：用户选了色就写在 `<body>` 上；否则由
    //     `markBubbleColors()` 把每个气泡自己的计算色写进**元素内联**变量（深浅主题都对），
    //     再退回 DSH 的 `--dsw-specific-bubble`、浅蓝兜底；
    //   · 保留百分比 = `<body>` 上的 `--dsniang-frost-bubble-mix`（JS 用 100 - 透明度 写，
    //     兜底 55 = 100 - 默认透明度 45）；
    //   · 模糊 = `<body>` 上的 `--dsniang-frost-bubble-blur`（气泡专属，默认 12px）。
    rules.push(
      'body.' + FROST_CLASS + ' [class*="bubble"].' + FROST_SURFACE_CLASS + ',' +
        'body.' + FROST_CLASS + ' [class*="Bubble"].' + FROST_SURFACE_CLASS + '{' +
        'background-image:none!important;' +
        'background-color:color-mix(in srgb,var(' +
        BUBBLE_COLOR_VAR +
        ',var(--dsw-specific-bubble,#e8f0fe)) var(' +
        BUBBLE_MIX_VAR +
        ',' +
        (100 - BUBBLE_TRANSPARENCY_DEFAULT) +
        '%),transparent)!important;' +
        'backdrop-filter:blur(var(' +
        BUBBLE_BLUR_VAR +
        ',' +
        BUBBLE_BLUR_DEFAULT +
        'px)) saturate(1.15)!important;' +
        '-webkit-backdrop-filter:blur(var(' +
        BUBBLE_BLUR_VAR +
        ',' +
        BUBBLE_BLUR_DEFAULT +
        'px)) saturate(1.15)!important;' +
        '}',
    )
    // 二级面板（鲸鱼挂件那些小弹层）**单独一套参数**：白层做成**竖向渐变**
    // （顶部 97% 几乎实心、底部 83% 透出背后内容），中值 = 作者要的白层 90%。
    // 用 `background` **简写**有两个理由：① 顺手把底色一并重置成透明 —— 否则渐变会叠在
    // 实心底色上，合成后两端差不到 1.5%（等于白做）；② 静态表里不出现 `background-image`
    // 长属性（回归测试拿它当哨兵：那张全屏位图必须走内联样式，绝不能进样式表）。
    // 值是编译期常量 → 样式表依旧是静态的（铁律 2）。
    rules.push(
      'body.' + FROST_CLASS + ' .' + FROST_PANEL_CLASS + '{' +
        'background:radial-gradient(ellipse at 50% 50%,' +
        'rgba(var(--dsniang-frost-rgb,255,255,255),var(--dsniang-frost-panel-center,var(--dsniang-frost-panel-bottom,' +
        FROST_PANEL_BOTTOM +
        '))) 0%,' +
        'rgba(var(--dsniang-frost-rgb,255,255,255),var(--dsniang-frost-panel-edge,var(--dsniang-frost-panel-top,' +
        FROST_PANEL_TOP +
        '))) 100%)!important;' +
        'box-shadow:' + FROST_PANEL_SHADOW + '!important;' +
        'backdrop-filter:blur(var(--dsniang-frost-panel-blur,' +
        FROST_PANEL_BLUR +
        'px)) saturate(1.15)!important;' +
        '-webkit-backdrop-filter:blur(var(--dsniang-frost-panel-blur,' +
        FROST_PANEL_BLUR +
        'px)) saturate(1.15)!important;' +
        'z-index:' + LAYER_Z.whalePanel + '!important;' +
        '}',
    )
    // DSH 自己的二级面板：**模糊度独立一套**（0.4.0，用户要求独立滑块）。
    // 选择器（[role=dialog]/[role=menu] + 面板类）比上面的面板规则更具体 → 同为
    // !important 时以这里为准；只覆盖模糊两个属性，白层渐变与 z-index 沿用面板规则。
    rules.push(
      'body.' + FROST_CLASS + ' [role="dialog"].' + FROST_PANEL_CLASS + ',' +
        'body.' + FROST_CLASS + ' [role="menu"].' + FROST_PANEL_CLASS + '{' +
        'backdrop-filter:blur(var(--dsniang-frost-dsh-blur,' +
        FROST_DSH_BLUR_DEFAULT +
        'px)) saturate(1.15)!important;' +
        '-webkit-backdrop-filter:blur(var(--dsniang-frost-dsh-blur,' +
        FROST_DSH_BLUR_DEFAULT +
        'px)) saturate(1.15)!important;' +
        '}',
    )
    // 二级面板打开时那层全屏变暗遮罩：实心黑太重、太平 → 改成"中心浅、四周略深"的
    // 径向渐变。同样只写 background（!important 压过鲸鱼自己的类规则），不动布局；
    // 数值是编译期常量 → 样式表依旧静态（铁律 2）。
    rules.push(
      PANEL_MASK_SELECTOR.split(',')
        .map(function (selector) {
          return 'body.' + FROST_CLASS + ' ' + selector.trim()
        })
        .join(',') +
        '{' +
        'background:radial-gradient(ellipse at center, rgba(15,23,42,var(--dsniang-panel-mask-center,' +
        PANEL_MASK_CENTER +
        ')) 0%, rgba(15,23,42,var(--dsniang-panel-mask-edge,' +
        PANEL_MASK_EDGE +
        ')) 100%)!important;' +
        'z-index:' + LAYER_Z.whaleMask + '!important;' +
        '}',
    )
    // DSH 自带的模态框（会话重命名等，0.3.3）：实测结构是
    //   `._root_o6lrb_6{position:fixed;inset:0;z-index:1000}`（body 级容器）
    //     ├ `._mask_o6lrb_18{position:absolute;backdrop-filter:var(--dsw-mask-blur)}`（只有模糊、没有变暗色）
    //     └ `._dialog_o6lrb_33[role=dialog]{position:relative;z-index:1;background:--dsw-alias-bg-layer-2}`
    // 之前只抬 dialog 自己的 z-index → 出不了 root 的叠层上下文 → 整个模态仍被壁纸染色；
    // 且 DSH 的 mask 没有变暗色 → 玻璃背后是亮底 → "和没开一样"。
    // 修法：用 `:has(> [role="dialog"])` 命中**装有 dialog 的容器**（类名是构建哈希，
    // 这个结构关系是稳定的；DSH 自己也在用 :has()，内核支持），把整个容器抬到壁纸之上，
    // 并垫上与鲸鱼遮罩同款的径向渐变（中心浅、四周略深）。
    rules.push(
      'body.' + FROST_CLASS + ' :has(> [role="dialog"]){' +
        'z-index:' + LAYER_Z.whaleMask + '!important;' +
        'background:radial-gradient(ellipse at center, rgba(15,23,42,var(--dsniang-panel-mask-center,' +
        PANEL_MASK_CENTER +
        ')) 0%, rgba(15,23,42,var(--dsniang-panel-mask-edge,' +
        PANEL_MASK_EDGE +
        ')) 100%)!important;}',
    )
    rules.push('#' + LAYER_ID + '.is-faded,#' + LAYER2_ID + '.is-faded{opacity:0 !important;}')
    // 聊天内的代码块/文件卡片（0.6.0，背景模式专属）：玻璃配方与气泡同款 ——
    // 各自原色走 `--dsniang-chat-color`（内联，值从元素计算背景抄来），透明度/模糊
    // 复用气泡的两个滑块（"这个效果" = 气泡效果）。
    rules.push(
      'body.' + FROST_CLASS + ' .' + FROST_CHAT_CLASS + '{' +
        'background-image:none!important;' +
        'background-color:color-mix(in srgb,var(' +
        CHAT_COLOR_VAR +
        ',var(--dsw-specific-code-bg,#f0f0f0)) var(' +
        BUBBLE_MIX_VAR +
        ',55%),transparent)!important;' +
        'backdrop-filter:blur(var(' +
        BUBBLE_BLUR_VAR +
        ',' +
        BUBBLE_BLUR_DEFAULT +
        'px)) saturate(1.15)!important;' +
        '-webkit-backdrop-filter:blur(var(' +
        BUBBLE_BLUR_VAR +
        ',' +
        BUBBLE_BLUR_DEFAULT +
        'px)) saturate(1.15)!important;' +
        '}',
    )
    // 代码块是"套娃"结构（0.6.1）：外层卡片之下 `pre` 又刷了一遍代码块底色、顶部
    // banner 刷了标题条底色、banner 的 sticky 外壳刷了页面底色 —— 三层不透明底把外层
    // 玻璃整块盖住，所以之前"看不到代码块有毛玻璃"。这里把内层底色清掉（只清标记过的
    // 卡片内部，不标记就一点影响都没有），玻璃才透得出来。
    // 外壳用"后代 + `:has(> banner)`"而不是 `>` 直接子代：DSH 现在把 `.bannerWrap` 直接
    // 放在卡片里，但哪天中间插一层包装（滚动容器之类），`>` 就会静默失配、玻璃又被盖住。
    // 放宽到后代不会误伤 —— 只有"直接包着标题条的容器"才匹配得上。
    rules.push(
      'body.' +
        FROST_CLASS +
        ' .' +
        FROST_CHAT_CLASS +
        ' :where(pre,[data-code-block-content]),' +
        'body.' +
        FROST_CLASS +
        ' .' +
        FROST_CHAT_CLASS +
        ' :has(> [data-code-block-banner]){' +
        'background:transparent!important;' +
        '}',
    )
    // 顶部标题条（sticky，`data-code-block-banner`）：**同一套配方**（同色 + 同一个透明度/模糊
    // 滑块）—— 用户要的"标签也一起生成气泡"。它嵌在卡片玻璃里，两层透明叠加后约 80% 实，
    // 所以标签文字依然清楚；同时它的 backdrop-filter 把从下面滚过去的代码糊开，不会叠字。
    rules.push(
      'body.' +
        FROST_CLASS +
        ' .' +
        FROST_CHAT_CLASS +
        ' [data-code-block-banner]{' +
        'background:color-mix(in srgb,var(' +
        CHAT_COLOR_VAR +
        ",var(--dsw-alias-markdown-code-block,#f9fafb)) var(" +
        BUBBLE_MIX_VAR +
        ',55%),transparent)!important;' +
        'backdrop-filter:blur(var(' +
        BUBBLE_BLUR_VAR +
        ',' +
        BUBBLE_BLUR_DEFAULT +
        'px)) saturate(1.15)!important;' +
        '-webkit-backdrop-filter:blur(var(' +
        BUBBLE_BLUR_VAR +
        ',' +
        BUBBLE_BLUR_DEFAULT +
        'px)) saturate(1.15)!important;' +
        '}',
    )
    rules.push('@media print{#' + LAYER_ID + ',#' + LAYER2_ID + '{display:none !important;}}')
    // 深色主题兜底：自家 GUI（胶囊/面板/诊断）强制深底浅字，避免 DSH token 半透明或换主题时机导致看不清。
    rules.push('body[data-ds-dark-theme] #' + PILL_ID + '{background:rgba(17,18,20,.82)!important;color:#f5f7fa!important;border-color:rgba(255,255,255,.18)!important;box-shadow:0 2px 12px rgba(0,0,0,.45)!important;backdrop-filter:blur(10px) saturate(1.15)!important;-webkit-backdrop-filter:blur(10px) saturate(1.15)!important;}')
    rules.push('body[data-ds-dark-theme] #' + PILL_ID + ' .__dshui-pill-text{color:#f5f7fa!important;}')
    rules.push('body[data-ds-dark-theme] #' + SWITCHER_ID + '{background:rgba(17,18,20,.92)!important;color:#f5f7fa!important;border-color:rgba(255,255,255,.18)!important;}')
    rules.push('body[data-ds-dark-theme] #' + SWITCHER_ID + ' button{color:#f5f7fa;}')
    rules.push('body[data-ds-dark-theme] #' + DIAG_ID + '{background:rgba(17,18,20,.94)!important;color:#f5f7fa!important;border-color:rgba(255,255,255,.18)!important;}')
    // 纹理模式「AI 思考过程视效」（0.8.5）：整段助手回复 + 每一行思维链都加左侧细线 + 淡渐变；
    // 不包卡片、不加内边距 → 零布局。
    rules.push(
      'body.' + AI_FX_CLASS + ' ' + AI_REPLY_SELECTOR + '{' +
        'background-image:linear-gradient(90deg,rgba(57,100,254,.055) 0%,rgba(57,100,254,0) 34%)!important;' +
        'box-shadow:inset 2px 0 0 rgba(57,100,254,.5)!important;' +
        '}',
    )
    // 每一行「思维链」步骤行（DSH step-process / turn-process 多属性兜底）同样加左侧细线 + 渐变
    rules.push(
      aiStepCss('body.' + AI_FX_CLASS) + '{' +
        'background-image:linear-gradient(90deg,rgba(57,100,254,.06) 0%,rgba(57,100,254,0) 44%)!important;' +
        'box-shadow:inset 2px 0 0 rgba(57,100,254,.5)!important;' +
        '}',
    )
    // 新行从左侧滑入：默认就播（不再要求动效总开关）；系统「减弱动态」由媒体查询关闭，窗口失焦时暂停。
    // 关键帧只做 8px 位移 + 极轻的 .92 → 1 透明度：即使动画被暂停/重播，文字也不会发虚看不清。
    rules.push(
      '@media (prefers-reduced-motion: no-preference){' + aiStepCss('body.' + AI_FX_CLASS + ':not(.' + MOTION_PAUSED_CLASS + ')') + '{' +
        'animation:__dshui-ai-line-in .3s cubic-bezier(0.33,1,0.68,1)!important;' +
        '}}',
    )
    rules.push('@media (prefers-reduced-motion: no-preference){' + aiStepCss('body.' + MOTION_PAUSED_CLASS) + '{animation-play-state:paused!important;}}')
    rules.push('@keyframes __dshui-ai-line-in{from{transform:translateX(-6px)}to{transform:none}}')
    // 注：思维链配色（橘黄/红）已按用户反馈移除 —— 思考区域保持 DSH 原样，不再覆盖颜色。
    // 下面只保留方块光标的样式。
    // 纹理模式「气泡视觉」（0.8.5）：顶部高光 + 1px 内高光 + 柔和投影；
    // 只写 background-image / box-shadow（不改底色、字色、尺寸与边框宽度 → 零布局）。
    rules.push(
      'body.' + BUBBLE_FX_CLASS + ' [class*="bubble"].' + FROST_SURFACE_CLASS + ',' +
        'body.' + BUBBLE_FX_CLASS + ' [class*="Bubble"].' + FROST_SURFACE_CLASS + '{' +
        'background-image:linear-gradient(180deg,rgba(255,255,255,.34) 0%,rgba(255,255,255,0) 62%)!important;' +
        'box-shadow:inset 0 0 0 1px rgba(255,255,255,.55),inset 0 1px 0 rgba(255,255,255,.45),' +
        '0 4px 12px rgba(17,18,20,.08),0 12px 28px rgba(17,18,20,.07)!important;' +
        '}',
    )
    // 输入卡片（[data-composer-card]）也加同一层质感：保留原本的径向玻璃渐变，叠一层顶部高光 + 同样的投影。
    rules.push(
      'body.' + BUBBLE_FX_CLASS + ' [data-composer-card].' + FROST_SURFACE_CLASS + '{' +
        'background-image:' +
        'radial-gradient(ellipse at 50% 50%,rgba(var(--dsniang-frost-rgb,255,255,255),var(--dsniang-frost-alpha-center,0.11)) 0%,rgba(var(--dsniang-frost-rgb,255,255,255),var(--dsniang-frost-alpha-edge,0.11)) 100%),' +
        'linear-gradient(180deg,rgba(255,255,255,.50) 0%,rgba(255,255,255,0) 72%)!important;' +
        'box-shadow:inset 0 0 0 1px rgba(255,255,255,.7),inset 0 2px 0 rgba(255,255,255,.55),' +
        'inset 0 -14px 30px rgba(255,255,255,.12),0 6px 18px rgba(17,18,20,.12),0 18px 40px rgba(17,18,20,.10)!important;' +
        'backdrop-filter:blur(calc(var(--dsniang-frost-blur,2px) + 2px)) saturate(1.35)!important;' +
        '-webkit-backdrop-filter:blur(calc(var(--dsniang-frost-blur,2px) + 2px)) saturate(1.35)!important;' +
        '}',
    )
    // 0.8.23 动态「开发中」定位参考线：背景脉冲 / 气泡预览 / 思考链起点连线
    rules.push(
      '@keyframes __dshui-guide-pulse{0%{transform:translate(-50%,-50%) scale(.55);opacity:.9}100%{transform:translate(-50%,-50%) scale(1.9);opacity:0}}' +
        '.__dshui-guide-ring{position:fixed;width:72px;height:72px;border-radius:50%;border:1px solid rgba(57,100,254,.75);pointer-events:none;animation:__dshui-guide-pulse 2.2s ease-out infinite}' +
        '.__dshui-guide-ring.r2{animation-delay:1.1s}' +
        '.__dshui-guide-label{position:fixed;transform:translate(-50%,-50%);pointer-events:none;font:11px/1.4 "Segoe UI","Microsoft YaHei",system-ui,sans-serif;' +
          'padding:2px 7px;border-radius:6px;background:rgba(17,18,20,.82);color:#f5f7fa;border:1px solid rgba(255,255,255,.2);white-space:nowrap}' +
        '.__dshui-guide-line{position:fixed;height:0;border-top:1px dashed rgba(57,100,254,.85);transform-origin:0 50%;pointer-events:none;opacity:.85}' +
        '.__dshui-guide-ghost{position:fixed;transform:translate(-50%,-50%);pointer-events:none;max-width:220px;padding:8px 12px;border-radius:12px;' +
          'background:rgba(57,100,254,.18);border:1px solid rgba(57,100,254,.55);color:#3964fe;font:12px/1.4 "Segoe UI","Microsoft YaHei",system-ui,sans-serif;white-space:nowrap}'
    )
    // 悬浮防闪（0.8.21）：纹理模式下输入卡片的 backdrop-filter 在子按钮 hover 重绘时会被
    // 重新羽化（Chromium 上表现为对话闪一下）；纹理模式背后是 body 底色，模糊本身也几乎看不出。
    rules.push(
      'body.' + TEXTURE_CLASS + ' [data-composer-card].' + FROST_SURFACE_CLASS + '{' +
        'backdrop-filter:none!important;-webkit-backdrop-filter:none!important;' +
        '}',
    )
    // 悬浮防闪（0.8.21）：发送键的 background-color 0.1s 过渡会让上面的全屏 multiply 层
    // 在部分 GPU 组合下重新合成整页（对话闪一下）。颜色瞬时变化不影响观感，去掉过渡。
    rules.push(
      '[aria-label="发送消息"],[aria-label="Send message"],' +
        '[data-composer-card] [aria-label*="发送"]{' +
        'transition:none!important;will-change:background-color;' +
        '}',
    )
    // 方块光标：原生 caret 透明，由 #__dshui-caret 叠一个闪烁小方格（颜色 = 开屏首屏 accent；
    // 只在插件激活（style 表在）且获得了支持的选区 API 时启用，失败则保留原生光标）
    rules.push(
      'body.__dshui-caret-on [data-composer-input]{' +
        'caret-color:transparent!important;' +
        '}' +
        '#' + CARET_ID + '{' +
        'position:fixed;display:none;width:8px;min-width:2px;height:18px;box-sizing:border-box;' +
        'background:color-mix(in srgb,var(--dshui-caret-color,#3964fe) var(--dshui-caret-alpha,55%),transparent);' +
        'border:1px solid color-mix(in srgb,var(--dshui-caret-color,#3964fe) 70%,transparent);' +
        'border-radius:2px;z-index:2147483004;pointer-events:none;' +
        'box-shadow:0 0 var(--dshui-caret-blur,5px) color-mix(in srgb,var(--dshui-caret-color,#3964fe) 35%,transparent),' +
        'inset 0 0 calc(var(--dshui-caret-blur,5px) * .5) rgba(255,255,255,.28);' +
        'backdrop-filter:blur(calc(var(--dshui-caret-blur,5px) * .2)) saturate(1.2);' +
        '-webkit-backdrop-filter:blur(calc(var(--dshui-caret-blur,5px) * .2)) saturate(1.2);' +
        'animation:__dshui-caret-blink 1.2s steps(1) infinite;' +
        '}' +
        '@keyframes __dshui-caret-blink{50%{opacity:0;}}'
    )
    return rules.join('')
  }

  function installStyle() {
    var text = styleText()
    var existing = safe(function () {
      return document.getElementById(STYLE_ID)
    }, null)
    if (existing) {
      // 静态表：正常情况下一辈子都不会走到改写分支
      if (existing.textContent !== text) existing.textContent = text
      return
    }
    var style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = text
    ;(document.head || document.documentElement).appendChild(style)
  }

  function removeStyle() {
    safe(function () {
      var style = document.getElementById(STYLE_ID)
      if (style && style.parentNode) style.parentNode.removeChild(style)
    })
  }

  function ensureLayer() {
    if (state.layer && state.layer.parentNode) return state.layer
    var layer = safe(function () {
      return document.getElementById(LAYER_ID)
    }, null)
    if (!layer) {
      layer = document.createElement('div')
      layer.id = LAYER_ID
      layer.setAttribute('aria-hidden', 'true')
      ;(document.body || document.documentElement).appendChild(layer)
    }
    state.layer = layer
    return layer
  }

  /** 图层当前应有的浓度。关闭流程中层还没卸，沿用关闭前那个模式的浓度。 */
  function layerOpacityTarget() {
    var mode = state.mode === 'off' ? state.lastActiveMode || 'multiply' : state.mode
    return opacityFor(mode)
  }

  /** 把图片（含主题薄纱）写到层内联样式上 —— 样式表静态，图片不在里面。 */
  function applyLayerBackground() {
    safe(function () {
      if (!state.layer) return
      var layer2 = document.getElementById(LAYER2_ID)
      if (layer2) {
        // 交叉淡化进行中：第一层必须保持冻结的旧图，只更新"新图"那一层
        layer2.style.setProperty('background-image', backgroundImageValue())
        return
      }
      var showImage = state.mode === 'multiply' || state.mode === 'backdrop'
      state.layer.style.setProperty('background-image', showImage ? backgroundImageValue() : 'none')
      // 记一笔"确实画过图"：壁纸体检要靠它区分"还没画"和"画过又被抹掉"
      if (showImage && state.bgUrl) state.layerPainted = true
    })
  }

  /** 把当前模式的浓度写到层内联样式上（并停掉可能正在跑的补间）。 */
  function applyLayerOpacity() {
    if (!state.layer) return
    cancelLayerTween(state.layer)
    safe(function () {
      state.layer.style.setProperty('opacity', String(layerOpacityTarget()))
    })
  }

  /**
   * 把状态写到层上：`data-mode`（命中混合/层级规则）+ **内联**图片与浓度。
   * 图片与浓度都走内联，样式表因此可以保持静态、永不被改写。
   */
  function applyModeToLayer() {
    if (!state.layer) return
    var mode = MODES.indexOf(state.mode) === -1 || state.mode === 'off' ? 'overlay' : state.mode
    safe(function () {
      state.layer.setAttribute('data-mode', mode)
    })
    applyLayerBackground()
    applyLayerOpacity()
  }

  // ── 通用工具 ──────────────────────────────────────────────────────────────
  function rectOf(element) {
    return safe(function () {
      return element.getBoundingClientRect()
    }, null)
  }

  function isOurNode(element) {
    if (!element || element.nodeType !== 1) return false
    if (element.id === LAYER_ID || element.id === LAYER2_ID) return true
    return !!safe(function () {
      return element.closest && element.closest('#' + DIAG_ID + ',[data-dshui-ignore]')
    }, null)
  }

  // ── 毛玻璃：只作用于输入卡片 [data-composer-card="true"] ────────────────────
  /** 毛玻璃是否实际生效（开关 + 纹理/背景模式 + body 类；0.4.0 起背景模式也开毛玻璃）。 */
  function frostActive() {
    return (
      state.frost.enabled === true &&
      (state.mode === 'multiply' || state.mode === 'backdrop') &&
      safe(function () {
        return document.body.classList.contains(FROST_CLASS)
      }, false)
    )
  }

  /**
   * 现在装着消息的那个滚动容器 —— **自愈每一遍都要用，所以必须便宜**。
   *
   * 三级：① DSH 明牌 `[data-conversation-scroll]`（一次属性查询，真机必中）
   *      → ② 缓存（还在文档里、还装着卡片）
   *      → ③ `findTranscriptScroller()`（贵的全文档打分，只在换布局/首帧才走）。
   *
   * 为什么专门写这一层：0.6.3 起 `applyFrostBackdrop()` 每 250ms 那一遍都会重认链，
   * 若直接调 ③，长聊天里每次都要遍历全文档所有 div + 逐个 `getComputedStyle` ——
   * 那是肉眼可见的卡顿（和"零侵入/不卡"的底线冲突）。
   */
  function currentTranscript(card) {
    if (!card) return null
    var tagged = safe(function () {
      return document.querySelectorAll('[data-conversation-scroll]')[0] || null
    }, null)
    if (tagged && !isOurNode(tagged) && tagged.contains && tagged.contains(card)) {
      state.frostTranscript = tagged
      return tagged
    }
    var cached = state.frostTranscript
    if (cached && cached.isConnected !== false && cached.contains && cached.contains(card)) return cached
    var found = findTranscriptScroller(card)
    state.frostTranscript = found || null
    return found
  }

  /** 找输入卡片：优先 DSH 的 data-composer-card，退路是输入框所在的最近容器。 */
  function findComposerCard() {
    var card = null
    safe(function () {
      card = document.querySelectorAll(COMPOSER_CARD_SELECTOR)[0] || null
    })
    if (card) return card
    // 退路：从输入框往上找（DSH 换 DOM 也不至于完全失效）
    safe(function () {
      var input = document.querySelectorAll(
        '[data-composer-input="true"], textarea, [contenteditable="true"]',
      )[0]
      var node = input
      var depth = 0
      while (node && node !== document.body && node !== document.documentElement && depth < 6) {
        var rect = rectOf(node)
        if (rect && rect.width >= (window.innerWidth || 1) * 0.3 && rect.height <= 260) {
          card = node
          break
        }
        node = node.parentElement
        depth++
      }
    })
    return card
  }

  /**
   * 找聊天记录的滚动容器（把输入区抬起来之后，它就是被"压在玻璃下面"的那层）。
   * 真实 DSH 里消息区与输入区是**平级**的（同在 Dc7zOa_body 下），消息区不是
   * 输入卡的祖先 —— 所以在祖先链里找会扑空。判据按可靠性排序：
   *   ② `[data-conversation-scroll]` 明牌标记（最高分）；
   *   ① **实际可滚动**：`scrollHeight` 明显大于 `clientHeight`（比 CSS 属性更靠谱，
   *      有些版本滚动不是写在 overflow 上、或由外层 `overflow:hidden` + 内层位移实现）；
   *   ⓪ 退路：`overflow-y: auto|scroll`。
   * 再用「在卡片上方、够宽够高」过滤；**只有兜底候选**才要求「底边不越到卡片中段」——
   * 真实 DSH 的消息区（`Dc7zOa_scrollBody[data-conversation-scroll]`）高度是
   * 「表头以下整列」（`--dsh-conversation-viewport-height`），底边本来就延伸到输入
   * 卡片下面（座位覆盖在它之上），拿这条去卡它会把唯一正确的目标误杀。
   * 找不到就返回 null（此时只做毛玻璃，不动布局）。
   */
  function findTranscriptScroller(card) {
    var cardRect = rectOf(card)
    var vw = window.innerWidth || 1
    var scored = []
    safe(function () {
      // ② DSH 明牌的滚动容器：**即使它内部装着输入区也要收** —— 真实 DSH 就是
      //    「输入区 sticky 在滚动容器内部」的布局（消息本来就贴着输入区下面滚过去），
      //    这种在 applyLayering 里判成"应用自带分层"，我们一行都不动。
      var tagged = document.querySelectorAll('[data-conversation-scroll]')
      for (var i = 0; i < tagged.length; i++) {
        var el = tagged[i]
        if (isOurNode(el)) continue
        scored.push({ el: el, rect: rectOf(el), tagged: 3 })
      }
      // ① / ⓪ 全文档兜底
      var generic = document.querySelectorAll('div, main, section, article, ul, ol, aside')
      for (var j = 0; j < generic.length; j++) {
        var node = generic[j]
        if (isOurNode(node) || node.contains(card)) continue
        if (node.getAttribute && node.getAttribute('data-conversation-scroll')) continue // ② 已收录
        var style = null
        try {
          style = window.getComputedStyle(node)
        } catch (err) {
          continue
        }
        var overflowScrollable = style.overflowY === 'auto' || style.overflowY === 'scroll'
        var reallyScrollable = (node.scrollHeight || 0) > (node.clientHeight || 0) + 40
        if (!overflowScrollable && !reallyScrollable) continue
        scored.push({ el: node, rect: rectOf(node), tagged: reallyScrollable ? 1 : 0 })
      }
    })
    var best = null
    for (var k = 0; k < scored.length; k++) {
      var item = scored[k]
      var rect = item.rect
      if (!rect || rect.height < 120) continue
      if (rect.width < vw * 0.25) continue
      if (!cardRect || rect.top >= cardRect.top) continue // 必须在卡片上方
      // 明牌目标放行底边检查（应用自带分层时它会一直铺到卡片下面）
      if (item.tagged < 3 && rect.bottom > cardRect.top + 80) continue
      var score = item.tagged * 1000 + rect.height
      if (!best || score > best.score) best = { el: item.el, score: score }
    }
    return best ? best.el : null
  }

  /**
   * 判断一个元素是不是"用户自己发的消息气泡"（只糊用户气泡，不糊助手输出）。
   * 真实 DSH：气泡挂在 `[data-chat-flow-kind="user"]` 的行里，行是 flex-end 的那层，
   * 气泡自己的父容器（行内堆叠层）并不右对齐 —— 所以判据顺序是：
   *   1. 元素自身的 role/data-role/data-author 明确写了 user（assistant/ai 一律排除）；
   *   2. 祖先链（最多 6 层）上有 data-chat-flow-kind 之类的显式标记，以标记为准；
   *   3. 祖先链上最近的一层是 flex-end / text-align:right；
   *   4. 兜底：气泡水平中心落在直接父容器的右半区。
   */
  function isUserMessage(el) {
    return !!safe(function () {
      var role = String(
        el.getAttribute('data-role') || el.getAttribute('data-author') || el.getAttribute('role') || '',
      )
      if (/assistant|ai|model|bot/i.test(role)) return false
      if (/user/i.test(role)) return true

      var elRect = el.getBoundingClientRect()

      // ② 显式标记优先：整条祖先链上谁的 flow-kind / 作者标记说了算
      var probe = el.parentElement
      var pd = 0
      while (probe && probe !== document.body && probe !== document.documentElement && pd < 6) {
        var kind = String(
          probe.getAttribute('data-chat-flow-kind') ||
            probe.getAttribute('data-message-author') ||
            probe.getAttribute('data-author') ||
            '',
        )
        if (/assistant|ai|model|bot/i.test(kind)) return false
        // DSH 的「追加信息」用 data-chat-flow-kind="steering" 表示，同样是自己发的。
        if (/user|steering/i.test(kind)) return true
        probe = probe.parentElement
        pd++
      }

      // ③ 布局：从最近的祖先开始，右对齐 = 用户，左对齐 = 对方
      var walk = el.parentElement
      var wd = 0
      while (walk && walk !== document.body && walk !== document.documentElement && wd < 5) {
        var style = null
        try {
          style = window.getComputedStyle(walk)
        } catch (err) {}
        if (style) {
          if (style.justifyContent === 'flex-end' || style.textAlign === 'right') return true
          if (style.justifyContent === 'flex-start' || style.textAlign === 'left') return false
        }
        walk = walk.parentElement
        wd++
      }

      // ④ 兜底：几何判断（气泡中心落在父容器右半区）
      var parent = el.parentElement
      if (!parent) return false
      var containerRect = parent.getBoundingClientRect()
      if (!containerRect || containerRect.width <= 0) return false
      if (!elRect) return false
      var center = elRect.left + elRect.width / 2
      var mid = containerRect.left + containerRect.width / 2
      return center > mid
    }, false)
  }

  /**
   * 收集用户消息气泡。
   *
   * ⚠️ v0.2.37 修掉的真 bug：这里原来有一条 `rect.height > 400` 的**绝对高度上限**，
   * 本意是"别把整块消息区当成气泡"，结果**把长消息气泡整个丢掉了** —— 用户实测
   * 「长的信息（没玻璃）、短的信息正常」就是这么来的（他模拟的那条超长消息，
   * 气泡高度会到几千 px）。现在换成两个更准的判据：
   *   · **装得下另一个气泡 / 装得下多条别的消息行的，是容器，不是气泡本身**（结构判据，不看尺寸）；
   *   · 尺寸只做"离谱"兜底：高度 > 20 倍视口、宽度 > 80% 视口（旧版的 400px 绝对上限
   *     连一条正常的长消息都容不下）。
   * 每一条被跳过的候选都记进 `state.bubbleScan`（诊断用）——这类"静默丢气泡"的 bug
   * 就是靠这个一眼看出来的。
   */
  function findUserBubbles() {
    var out = []
    var scan = { candidates: 0, accepted: 0, wide: 0, tall: 0, container: 0, input: 0, notUser: 0 }
    safe(function () {
      var vw = window.innerWidth || 1
      var vh = window.innerHeight || 1
      var candidates = document.querySelectorAll(
        '[data-role],[data-author],[data-message-author],[role="listitem"],' +
          '[class*="bubble"],[class*="Bubble"],[class*="message"],[class*="Message"]',
      )
      scan.candidates = candidates.length
      for (var i = 0; i < candidates.length && out.length < 60; i++) {
        var el = candidates[i]
        if (isOurNode(el)) continue
        var rect = rectOf(el)
        if (!rect || rect.width <= 0 || rect.height <= 0) continue
        if (rect.width > vw * 0.8) {
          scan.wide++
          continue // 整行容器，不是气泡
        }
        if (rect.height > vh * 20) {
          scan.tall++
          continue // 只挡"离谱到不像一条消息"的高度；长消息照收（旧版这里是 > 400，误杀了长气泡）
        }
        // 装得下别的消息行的，是消息列表/整块消息区容器，不是气泡本身
        if (safe(function () {
          return el.querySelectorAll('[data-chat-flow-kind]').length > 2
        }, false)) {
          scan.container++
          continue
        }
        if (safe(function () {
          return el.querySelector('[class*="bubble"],[class*="Bubble"]') !== null
        }, false)) {
          scan.container++
          continue // 装得下另一个气泡 = 容器
        }
        if (safe(function () {
          return !!el.querySelector('textarea, [contenteditable="true"]')
        }, false)) {
          scan.input++
          continue // 别把输入区当成气泡
        }
        if (!isUserMessage(el)) {
          scan.notUser++
          continue
        }
        scan.accepted++
        out.push(el)
      }
    })
    state.bubbleScan = scan
    return out
  }

  /** 所有"主"毛玻璃表面：输入卡片 + 用户气泡。 */
  function collectFrostTargets() {
    var targets = []
    var card = findComposerCard()
    if (card && !isOurNode(card)) targets.push(card)
    var bubbles = findUserBubbles()
    state.frostBubbles = bubbles
    for (var i = 0; i < bubbles.length; i++) {
      if (targets.indexOf(bubbles[i]) === -1) targets.push(bubbles[i])
    }
    return targets
  }

  /**
   * 扩展表面的"安全判定"缓存（元素 → true/false）。
   * 判定要扫子树的计算样式，所以每个元素只算一次：鲸鱼挂件的面板是启动时一次性建好的，
   * 之后只切 display/class，不会中途长出 fixed 后代。
   */
  var frostExtraVerdicts = typeof WeakMap === 'function' ? new WeakMap() : null

  /** 这个元素是不是盖满整个视口（全屏遮罩那类）：是的话别糊它，否则整屏一起糊。 */
  function coversViewport(el) {
    return !!safe(function () {
      var rect = el.getBoundingClientRect()
      if (!rect) return true
      var vw = window.innerWidth || 0
      var vh = window.innerHeight || 0
      if (!vw || !vh) return false
      return rect.width >= vw * 0.9 && rect.height >= vh * 0.6
    }, true)
  }

  /**
   * 有没有 fixed 后代（只看 3 层深，够用且便宜）。
   * `backdrop-filter` 会让元素成为 fixed 后代的**包含块** —— 贴了玻璃，里面那些
   * `position:fixed` 的小浮层会以它为参照定位 → 直接跑位。所以：有 fixed 后代就不糊。
   * 拿不准（异常）时也当"有"，宁可不糊。
   */
  function hasFixedDescendant(el) {
    return !!safe(function () {
      var level = [el]
      for (var depth = 0; depth < 3 && level.length; depth++) {
        var next = []
        for (var i = 0; i < level.length; i++) {
          var kids = level[i].childNodes || []
          for (var j = 0; j < kids.length; j++) {
            var child = kids[j]
            if (!child || child.nodeType !== 1) continue
            var style = window.getComputedStyle(child)
            if (style && style.position === 'fixed') return true
            next.push(child)
          }
        }
        level = next
      }
      return false
    }, true)
  }

  /** 一个扩展表面能不能安全地糊（不盖满屏、没有 fixed 后代、不和已糊的套娃）。 */
  function extraSurfaceSafe(el) {
    if (!el || isOurNode(el)) return false
    // 别套娃：双层 backdrop-filter 会糊成一片死白。只看祖先（closest 会命中自己）
    var parent = el.parentElement
    if (parent && parent.closest && parent.closest(FROST_MARK_SELECTOR)) return false
    var cached = frostExtraVerdicts ? frostExtraVerdicts.get(el) : undefined
    if (cached !== undefined) return cached
    var ok = !coversViewport(el) && !hasFixedDescendant(el)
    if (frostExtraVerdicts) frostExtraVerdicts.set(el, ok)
    return ok
  }

  /** 按选择器收一批表面，逐个过安全闸（最多 limit 个）。 */
  function collectSafeSurfaces(selector, limit) {
    var out = []
    safe(function () {
      var nodes = document.querySelectorAll(selector)
      for (var i = 0; i < nodes.length && out.length < (limit || 24); i++) {
        if (extraSurfaceSafe(nodes[i])) out.push(nodes[i])
      }
    })
    return out
  }

  /** DSH 问答窗口（跟主表面同一套参数）。 */
  function collectQuestionFrostTargets() {
    return collectSafeSurfaces(QUESTION_FROST_SELECTOR, 4)
  }

  /** 二级面板：鲸鱼挂件的各级弹层（走 `FROST_PANEL_*` 那套参数）。 */
  function collectExtraFrostTargets() {
    return collectSafeSurfaces(EXTRA_FROST_SELECTOR, 24)
  }

  /** DSH 自己的二级面板（`role="dialog"` / `role="menu"`），同一套安全闸与面板参数。 */
  function collectDshPanelTargets() {
    return collectSafeSurfaces(DSH_PANEL_SELECTOR, 24)
  }

  /** 聊天内的代码块/文件卡片（0.6.0，背景模式专属），同一套安全闸。 */
  function collectChatExtraTargets() {
    return collectSafeSurfaces(EXTRA_CHAT_SELECTOR, 200)
  }

  /**
   * 这批高亮块里代码块/文件卡片各几个（诊断用）、并把数量记到 state 上。
   * 排序不能反：`extraSurfaceSafe` 的"祖先已糊就别套娃"闸门要靠面板**先**打完标，
   * 否则 DSH 弹窗里的代码块会被重复贴一层玻璃。
   */
  function noteChatExtras(els) {
    var blocks = 0
    var files = 0
    safe(function () {
      for (var i = 0; i < els.length; i++) {
        if (els[i].hasAttribute('data-presented-file')) files++
        else blocks++
      }
    })
    state.frostChatCount = els.length
    state.frostChatBlocks = blocks
    state.frostChatFiles = files
  }

  /**
   * 把代码块/文件卡片**自己算出来的背景色**写进内联变量 `--dsniang-chat-color`
   * （与气泡的方案 B 同一个思路：深浅主题、DSH 换配色都不用改静态表）。只写这一个
   * 自定义属性，卸载时按原样还原（`state.chatColorBackup` 两本账）。
   */
  function markChatColors(els) {
    safe(function () {
      for (var i = 0; i < els.length; i++) {
        var el = els[i]
        var color = rgbTripletOf(
          safe(function () {
            return window.getComputedStyle(el).backgroundColor
          }, ''),
        )
        if (!color) continue
        var current = safe(function () {
          return el.style.getPropertyValue(CHAT_COLOR_VAR)
        }, '')
        if (current === color) continue
        if (current === '') state.chatColorBackup.push({ el: el, prev: '' })
        safe(function () {
          el.style.setProperty(CHAT_COLOR_VAR, color)
        })
      }
    })
  }

  function revertChatColors() {
    safe(function () {
      for (var i = 0; i < state.chatColorBackup.length; i++) {
        var entry = state.chatColorBackup[i]
        if (!entry.el) continue
        if (entry.prev) entry.el.style.setProperty(CHAT_COLOR_VAR, entry.prev)
        else entry.el.style.removeProperty(CHAT_COLOR_VAR)
      }
    })
    state.chatColorBackup = []
  }

  /** 把毛玻璃参数写到 <body> 的 CSS 变量上（滑块实时改，不重建样式表）。 */
  function applyFrostVars(blur, alpha) {
    state.frostNow = { blur: blur, alpha: alpha }
    safe(function () {
      var rgb = isDarkTheme() ? FROST_BG_DARK : FROST_BG_LIGHT
      document.body.style.setProperty('--dsniang-frost-rgb', rgb.join(','))
      document.body.style.setProperty('--dsniang-frost-blur', blur + 'px')
      // 取整到 3 位：补间终点是浮点数时，变量/测试里不要出现 0.20000000000000007
      var fullAlpha = Math.round(alpha * 1000) / 1000
      var scaledAlpha = Math.round(fullAlpha * FROST_ALPHA_CENTER_RATIO * 1000) / 1000
      // 径向渐变：内部透（scaled）→ 边缘亮（full）；名义全白层另写 --dsniang-frost-alpha
      document.body.style.setProperty('--dsniang-frost-alpha', String(fullAlpha))
      document.body.style.setProperty('--dsniang-frost-alpha-center', String(scaledAlpha))
      document.body.style.setProperty('--dsniang-frost-alpha-edge', String(fullAlpha))
    })
  }

  /**
   * "额外"参数 → `<body>` 的 CSS 变量：二级面板渐变两端（`panelTop/panelBottom`）、
   * 气泡透明度（换算成颜色保留百分比 `100 - T`）、气泡模糊、气泡自选颜色。
   * 跟模糊/白层同一个套路：值走变量、样式表不动（铁律 2）；面板上控件实时改这里。
   */
  function applyExtraFrostVars() {
    safe(function () {
      document.body.style.setProperty('--dsniang-frost-panel-top', String(state.frost.panelTop))
      document.body.style.setProperty('--dsniang-frost-panel-bottom', String(state.frost.panelBottom))
      // 径向渐变两端：内部 = panelBottom（更透），边缘 = panelTop（更亮）
      document.body.style.setProperty('--dsniang-frost-panel-center', String(state.frost.panelBottom))
      document.body.style.setProperty('--dsniang-frost-panel-edge', String(state.frost.panelTop))
      document.body.style.setProperty(
        BUBBLE_MIX_VAR,
        100 - state.frost.bubbleTransparency + '%',
      )
      document.body.style.setProperty(BUBBLE_BLUR_VAR, state.frost.bubbleBlur + 'px')
      document.body.style.setProperty('--dsniang-frost-dsh-blur', state.frost.dshBlur + 'px')
      if (state.frost.bubbleColor) {
        document.body.style.setProperty(BUBBLE_COLOR_VAR, state.frost.bubbleColor)
      } else {
        document.body.style.removeProperty(BUBBLE_COLOR_VAR)
      }
    })
  }

  function clearFrostVars() {
    safe(function () {
      document.body.style.removeProperty('--dsniang-frost-rgb')
      document.body.style.removeProperty('--dsniang-frost-blur')
      document.body.style.removeProperty('--dsniang-frost-alpha')
      document.body.style.removeProperty('--dsniang-frost-alpha-center')
      document.body.style.removeProperty('--dsniang-frost-alpha-edge')
      document.body.style.removeProperty('--dsniang-frost-panel-top')
      document.body.style.removeProperty('--dsniang-frost-panel-center')
      document.body.style.removeProperty('--dsniang-frost-panel-edge')
      document.body.style.removeProperty('--dsniang-frost-panel-bottom')
      document.body.style.removeProperty('--dsniang-frost-bubble-mix')
      document.body.style.removeProperty('--dsniang-frost-bubble-blur')
      document.body.style.removeProperty('--dsniang-frost-dsh-blur')
      document.body.style.removeProperty('--dsniang-bubble-color')
    })
  }

  // ── 毛玻璃参数补间（切换时淡入淡出；不动页面元素自己的 transition）────────
  function cancelFrostTween() {
    var anim = state.frostAnim
    state.frostAnim = null
    if (anim && anim.timer !== null && anim.timer !== undefined) {
      safe(function () {
        clearTimeout(anim.timer)
      })
    }
    if (anim && anim.motionTracked) motionEnd()
  }

  /**
   * 把毛玻璃的「模糊 + 白层」从当前可见值平滑补间到目标值。
   * 帧驱动（16ms 一步）而不是墙钟时间：极简 DOM 桩里没有 rAF，且这样测试里
   * advance(500) 能确定性地把补间推到底。
   */
  function tweenFrostVars(toBlur, toAlpha, durationMs, onDone) {
    cancelFrostTween()
    var from = state.frostNow || { blur: toBlur, alpha: toAlpha }
    if (!(durationMs > 0)) {
      applyFrostVars(toBlur, toAlpha)
      if (onDone) safe(onDone)
      return
    }
    state.frostAnim = {
      timer: null,
      elapsed: 0,
      duration: durationMs,
      from: { blur: from.blur, alpha: from.alpha },
      to: { blur: toBlur, alpha: toAlpha },
      onDone: onDone || null,
      motionTracked: true,
    }
    motionBegin()
    stepFrostTween()
  }

  function stepFrostTween() {
    var anim = state.frostAnim
    if (!anim) return
    anim.elapsed += FADE_STEP_MS
    var t = anim.elapsed >= anim.duration ? 1 : anim.elapsed / anim.duration
    var ease = 1 - Math.pow(1 - t, 3) // easeOutCubic：起步快、收尾柔
    var blur = anim.from.blur + (anim.to.blur - anim.from.blur) * ease
    var alpha = anim.from.alpha + (anim.to.alpha - anim.from.alpha) * ease
    applyFrostVars(blur, alpha)
    if (t >= 1) {
      var done = anim.onDone
      state.frostAnim = null
      if (anim.motionTracked) motionEnd()
      if (done) safe(done)
      return
    }
    anim.timer = safe(function () {
      return setTimeout(stepFrostTween, FADE_STEP_MS)
    }, null)
  }

  /** 立刻摘掉毛玻璃的一切痕迹（补间中的参数一并停掉）。 */
  function teardownFrostInstant() {
    cancelFrostTween()
    safe(function () {
      document.body.classList.remove(FROST_CLASS)
      clearFrostVars()
      clearFrostSurface()
    })
    revertFrostBackdrop()
    revertLayering()
  }

  /**
   * 直写目标参数（滑块拖动 / API）：如果淡入补间还在跑就停掉它，避免滑块被动画
   * 往回拽；淡出补间带 onDone（要收尾卸载），不打断。
   */
  function setFrostNow(blur, alpha) {
    if (state.frostAnim && !state.frostAnim.onDone) cancelFrostTween()
    applyFrostVars(blur, alpha)
  }

  /** 把 CSS 颜色解析成 0~1 亮度；解析不出来返回 null。 */
  function luminanceOfColor(value) {
    var text = String(value || '').trim()
    var m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(text)
    var r
    var g
    var b
    if (m) {
      r = Number(m[1])
      g = Number(m[2])
      b = Number(m[3])
    } else {
      var hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text)
      if (!hex) return null
      var h = hex[1]
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
      r = parseInt(h.slice(0, 2), 16)
      g = parseInt(h.slice(2, 4), 16)
      b = parseInt(h.slice(4, 6), 16)
    }
    if (!isFinite(r) || !isFinite(g) || !isFinite(b)) return null
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  }

  /**
   * 当前是不是深色主题。
   * DSH 真实投影 = `body[data-ds-dark-theme]`（见 ui 主题代码：「依据当前配色方案设置
   * body[data-ds-dark-theme]」），所以优先看属性；CSS 别名 token 只当兜底。
   */
  function isDarkTheme() {
    var body = null
    var root = null
    try {
      body = document.body
      root = document.documentElement
    } catch (err) {}
    var has = function (el, attr) {
      try {
        return !!(el && el.hasAttribute && el.hasAttribute(attr))
      } catch (err) {
        return false
      }
    }
    var attrOf = function (el, attr) {
      try {
        return String((el && el.getAttribute && el.getAttribute(attr)) || '')
      } catch (err) {
        return ''
      }
    }
    if (has(body, 'data-ds-dark-theme') || has(root, 'data-ds-dark-theme')) return true
    if (attrOf(body, 'data-theme') === 'dark' || attrOf(root, 'data-theme') === 'dark') return true
    if (attrOf(body, 'data-color-scheme') === 'dark' || attrOf(root, 'data-color-scheme') === 'dark') return true
    try {
      if (root && root.classList && (root.classList.contains('dark') || root.classList.contains('theme-dark'))) return true
      if (body && body.classList && (body.classList.contains('dark') || body.classList.contains('theme-dark'))) return true
    } catch (err) {}
    // 兜底 ①：html { color-scheme }（DSH 主题投影会写）
    try {
      var scheme = String(window.getComputedStyle(root).colorScheme || '')
      if (/^dark/i.test(scheme)) return true
      if (/^light/i.test(scheme)) return false
    } catch (err) {}
    // 兜底 ②：主题别名 token —— 只有明确偏暗的底色才算深色；浅色 paper #f7f8fa 不能误判
    var bg = ''
    try {
      bg = String(window.getComputedStyle(root).getPropertyValue('--dsw-alias-bg-base') || '')
    } catch (err) {}
    if (!bg) {
      try {
        bg = String(window.getComputedStyle(body).getPropertyValue('--dsw-alias-bg-base') || '')
      } catch (err) {}
    }
    var luminance = luminanceOfColor(bg)
    if (luminance !== null) return luminance < 0.5
    // 兜底 ③：系统偏好
    try {
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) return true
    } catch (err) {}
    return false
  }

  /**
   * 读输入卡片**原生**底色的透明度（毛玻璃接管它之前）。
   * DSH 的卡片自带 rgba(255,255,255,0.85) 这样的近实心白底 —— 毛玻璃的白层
   * 如果从 0 起步、退回 0，接管/归还的瞬间会闪一下白光；从原生透明度起步、
   * 再退回原生透明度，两端就是无缝的。读不到就回落 0.85。
   */
  function readNativeFrostAlpha() {
    var alpha = safe(function () {
      var card = findComposerCard()
      if (!card) return null
      var color = String(window.getComputedStyle(card).backgroundColor || '')
      var match = /rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+(?:\s*,\s*([\d.]+))?/.exec(color)
      if (!match) return null
      if (match[1] === undefined) return 1
      return Math.min(1, Math.max(0, Number(match[1])))
    }, null)
    return alpha === null ? 0.85 : alpha
  }

  /** CSS 颜色的 `rgb(r,g,b)` 三元组（认 rgb/rgba/#hex；全透明或认不出来返回 null）。 */
  function rgbTripletOf(text) {
    var value = String(text === null || text === undefined ? '' : text)
      .trim()
      .toLowerCase()
    var rgba = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(value)
    if (rgba) {
      if (rgba[4] !== undefined && Number(rgba[4]) === 0) return null // 全透明＝没有自己的底色
      return 'rgb(' + rgba[1] + ',' + rgba[2] + ',' + rgba[3] + ')'
    }
    var hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(value)
    if (hex) {
      var body = hex[1]
      if (body.length === 3) {
        body = body.charAt(0) + body.charAt(0) + body.charAt(1) + body.charAt(1) + body.charAt(2) + body.charAt(2)
      }
      return (
        'rgb(' +
        parseInt(body.slice(0, 2), 16) +
        ',' +
        parseInt(body.slice(2, 4), 16) +
        ',' +
        parseInt(body.slice(4, 6), 16) +
        ')'
      )
    }
    return null
  }

  /**
   * 把每个气泡**自己算出来的背景色**写进元素的内联变量 `--dsniang-bubble-color`，
   * 玻璃层再用 `color-mix` 基于它调透明度（方案 B）—— 这样深浅主题、DSH 换配色
   * 都不用改我们的静态样式表。**只写这一个自定义属性**，卸载时按原样还原。
   */
  function markBubbleColors(bubbles) {
    // 用户自选了颜色：气泡原色自动跟随关闭（<body> 上的变量压过一切），元素上不再写
    if (state.frost.bubbleColor) return
    safe(function () {
      for (var i = 0; i < bubbles.length; i++) {
        var el = bubbles[i]
        var color = rgbTripletOf(
          safe(function () {
            return window.getComputedStyle(el).backgroundColor
          }, ''),
        )
        if (!color) continue
        var current = safe(function () {
          return el.style.getPropertyValue(BUBBLE_COLOR_VAR)
        }, '')
        if (current === color) continue
        if (current === '') state.bubbleColorBackup.push({ el: el, prev: '' })
        safe(function () {
          el.style.setProperty(BUBBLE_COLOR_VAR, color)
        })
      }
    })
  }

  /** `rgb(r,g,b)` → `#rrggbb`（给取色器初始值用；认不出来返回 null）。 */
  function hexOfRgbTriplet(rgb) {
    var match = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/.exec(String(rgb || ''))
    if (!match) return null
    var hex = function (n) {
      return ('0' + Math.min(255, Number(n)).toString(16)).slice(-2)
    }
    return '#' + hex(match[1]) + hex(match[2]) + hex(match[3])
  }

  /** 取色器当前应显示的颜色：自选色 > 第一条气泡的原色 > 浅蓝兜底 `#e8f0fe`。 */
  function effectiveBubbleHex() {
    if (state.frost.bubbleColor) return state.frost.bubbleColor
    var bubbles = state.frostBubbles || []
    for (var i = 0; i < bubbles.length; i++) {
      var hex = hexOfRgbTriplet(
        rgbTripletOf(
          safe(function () {
            return window.getComputedStyle(bubbles[i]).backgroundColor
          }, ''),
        ),
      )
      if (hex) return hex
    }
    return '#e8f0fe'
  }

  /** 还原气泡上的内联变量（只动我们自己写的那一个属性）。 */
  function revertBubbleColors() {    var backup = state.bubbleColorBackup || []
    state.bubbleColorBackup = []
    safe(function () {
      for (var i = 0; i < backup.length; i++) {
        var item = backup[i]
        if (item.prev) item.el.style.setProperty(BUBBLE_COLOR_VAR, item.prev)
        else item.el.style.removeProperty(BUBBLE_COLOR_VAR)
      }
    })
  }

  /** 给一组元素打标（幂等：已带类的不再写，避免观察者自激）。 */
  function addFrostMarks(targets, className) {
    safe(function () {
      for (var i = 0; i < targets.length; i++) {
        if (!targets[i].classList.contains(className)) targets[i].classList.add(className)
      }
    })
  }

  /** 摘掉某类标记；给了 keep 就只摘"不在名单里"的那些（气泡滚出 / 面板出栈）。 */
  function removeFrostMarks(className, keep) {
    safe(function () {
      var marked = document.querySelectorAll('.' + className)
      for (var i = 0; i < marked.length; i++) {
        if (!keep || keep.indexOf(marked[i]) === -1) marked[i].classList.remove(className)
      }
    })
  }

  /** 扩展表面（问答窗口 + 二级面板）：观察者里立即调，很便宜（查询 + 缓存过的判定）。 */
  function markExtraFrostSurfaces() {
    var questions = collectQuestionFrostTargets()
    var panels = collectExtraFrostTargets()
    var dshPanels = collectDshPanelTargets()
    state.frostPanelCount = panels.length
    state.frostDshCount = dshPanels.length
    addFrostMarks(questions, FROST_SURFACE_CLASS)
    addFrostMarks(panels, FROST_PANEL_CLASS)
    addFrostMarks(dshPanels, FROST_PANEL_CLASS)
    // 面板标完再收聊天内高亮块（0.6.1）：收集时的"祖先已糊"闸门才看得见面板，防套娃
    var chatExtras = state.mode === 'backdrop' ? collectChatExtraTargets() : []
    noteChatExtras(chatExtras)
    markChatColors(chatExtras)
    addFrostMarks(chatExtras, FROST_CHAT_CLASS)
    state.frostExtraCount = questions.length + panels.length + dshPanels.length + chatExtras.length
  }

  /**
   * 全量打标，并记录状态供诊断：
   *   · 主表面 = 输入卡片 + 我的气泡（滑块参数）；
   *   · 问答窗口 = 跟主表面同一套参数；
   *   · 二级面板 = 鲸鱼挂件的弹层，走 `FROST_PANEL_*` 单独一套参数。
   * 两类各有各的类，也各清各自的过期标记；全程只加类，不动布局。
   */
  function markFrostSurfaces() {
    var primary = collectFrostTargets()
    var questions = collectQuestionFrostTargets()
    var panels = collectExtraFrostTargets()
    var dshPanels = collectDshPanelTargets()
    var surfaceTargets = primary.slice()
    for (var i = 0; i < questions.length; i++) {
      if (surfaceTargets.indexOf(questions[i]) === -1) surfaceTargets.push(questions[i])
    }
    var allPanels = panels.concat(dshPanels)
    state.frostTargetCount = primary.length
    state.frostPanelCount = panels.length
    state.frostDshCount = dshPanels.length
    // 气泡的"原色"要写进它们自己的内联变量（方案 B 的基础）；卡片和问答窗口不吃这个
    markBubbleColors(state.frostBubbles || [])
    addFrostMarks(surfaceTargets, FROST_SURFACE_CLASS)
    addFrostMarks(allPanels, FROST_PANEL_CLASS)
    // 聊天内的代码块/文件卡片（0.6.0）：**背景模式专属** —— 壁纸垫底、这些高亮块
    // 直接坐在图上；纹理模式不动它们（壁纸压顶，多糊一层只会一起被染色）。
    // 面板先标完再收（0.6.1）：这样"祖先已糊"的闸门能挡掉 DSH 弹窗里的代码块（防套娃）。
    var chatExtras = state.mode === 'backdrop' ? collectChatExtraTargets() : []
    noteChatExtras(chatExtras)
    markChatColors(chatExtras)
    state.frostExtraCount = questions.length + panels.length + dshPanels.length + chatExtras.length
    addFrostMarks(chatExtras, FROST_CHAT_CLASS)
    removeFrostMarks(FROST_SURFACE_CLASS, surfaceTargets)
    removeFrostMarks(FROST_PANEL_CLASS, allPanels)
    removeFrostMarks(FROST_CHAT_CLASS, chatExtras)
  }

  /** 摘掉两类标记（关毛玻璃 / 卸载时用）。 */
  function clearFrostSurface() {
    removeFrostMarks(FROST_SURFACE_CLASS)
    removeFrostMarks(FROST_PANEL_CLASS)
    removeFrostMarks(FROST_CHAT_CLASS)
    revertBubbleColors()
    revertChatColors()
  }

  // ── 毛玻璃「通透化」：清掉卡片与消息区之间的不透明遮罩 ─────────────────────
  /** 元素的短标签（诊断用）。 */
  function nodeLabel(el) {
    return safe(function () {
      var cls = String(el.className || '').split(/\s+/)[0]
      return String(el.tagName || '').toLowerCase() + (cls ? '.' + cls : '')
    }, '?')
  }

  /** CSS 颜色的透明度（认 rgb/rgba/#hex/transparent；认不出来的写法当不透明）。 */
  function colorAlpha(text) {
    var value = String(text === null || text === undefined ? '' : text)
      .trim()
      .toLowerCase()
    if (!value || value === 'none' || value === 'transparent') return 0
    var rgba = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(value)
    if (rgba) {
      if (rgba[4] === undefined) return 1
      var alpha = Number(rgba[4])
      return isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 1
    }
    var hex = /^#([0-9a-f]{3,8})$/.exec(value)
    if (hex) {
      var body = hex[1]
      if (body.length === 4) return parseInt(body.charAt(3) + body.charAt(3), 16) / 255
      if (body.length === 8) return parseInt(body.slice(6, 8), 16) / 255
      return 1
    }
    // color-mix() / 具名色 / 已展开的 var()：拿不准就当不透明（清掉再逐字还原，不会丢原值）
    return 1
  }

  /** 这个元素是否画了背景（不透明底色，或渐变/图片）—— 画了就会挡住玻璃背后的内容。 */
  function hasPaintedBackground(el) {
    return !!safe(function () {
      var style = window.getComputedStyle(el)
      if (!style) return false
      var image = String(style.backgroundImage || 'none')
      if (image && image !== 'none') return true
      return colorAlpha(style.backgroundColor) > 0.02
    }, false)
  }

  /**
   * 「卡片 → 消息区」之间那条祖先链。两条边界都很关键：
   *   · 消息区自己不动 —— 它是消息的底，不是遮挡；
   *   · 走到**同时包含消息区的祖先**（应用窗口/面板底色那一层）就停 —— 否则会把
   *     整个界面清成透明。
   * 真实 DSH（座位嵌在滚动区里）= [卡片根容器, 座位]；兄弟式布局同理。
   */
  function frostScrimChain(card, transcript) {
    var chain = []
    if (!card || !transcript) return chain
    var node = card.parentElement
    var depth = 0
    while (node && depth < 12) {
      if (node === document.body || node === document.documentElement) break
      if (node === transcript) break
      if (node.contains(transcript)) break
      chain.push(node)
      node = node.parentElement
      depth++
    }
    return chain
  }

  /** 两次走查认出来的链是不是同一批节点（同一个元素、同样的顺序）。 */
  function sameChain(a, b) {
    if (!a || !b || a.length !== b.length) return false
    for (var i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false
    }
    return true
  }

  /** 链上各层的实况（诊断用：哪层还画着不透明底色，一眼定位）。 */
  function describeChain(chain) {
    return chain.map(function (el) {
      return {
        tag: el.tagName ? el.tagName.toLowerCase() : '',
        cls: String(el.className || '').slice(0, 80),
        painted: hasPaintedBackground(el),
        bg: safe(function () {
          return String(window.getComputedStyle(el).backgroundColor || '').slice(0, 40)
        }, ''),
      }
    })
  }

  /** 在旧账里找这个元素记过的原值（同一个元素被重复清时必须沿用**最初**那份）。 */
  function priorEntry(previous, el) {
    if (!previous) return null
    for (var i = 0; i < previous.length; i++) {
      if (previous[i].el === el) return previous[i]
    }
    return null
  }

  /**
   * 把链上"画了背景"的那几层清成透明，返回记账条目（原值 + 原优先级，用于逐字还原）。
   *
   * **幂等**：`previous` 里已经记过账的元素，沿用**最初**记下的原值 —— 绝不能把我们
   * 自己写上去的 `transparent` / `none` 当成"原值"再记一遍（那样关闭/卸载还原时写回的
   * 就是 `transparent`，页面上会留下我们改过的痕迹，"逐字还原"当场作废）。
   * 只对"又被画上底"的层产生新账。
   *
   * 上一版的 `frostBackupAlive()` / `frostChainAlive()` 两个"还活着吗"探针在 0.6.3 删掉了：
   * 它们只看 `isConnected`，看不出"链的形状变了"（React 换掉中间某一层）—— 而那正是
   * "切对话后背景失效"的根因。现在改成**每次都重认链 + 比形状**（`sameChain`）。
   */
  function clearFrostChain(chain, previous) {
    var entries = []
    safe(function () {
      for (var i = 0; i < chain.length; i++) {
        var el = chain[i]
        if (isOurNode(el)) continue
        if (!hasPaintedBackground(el)) continue
        var prior = priorEntry(previous, el)
        var props = {}
        for (var p = 0; p < FROST_SCRIM_PROPS.length; p++) {
          var prop = FROST_SCRIM_PROPS[p]
          props[prop] = prior
            ? prior.props[prop]
            : {
                value: el.style.getPropertyValue(prop),
                priority: stylePriority(el.style, prop),
              }
          el.style.setProperty(prop, prop === 'background-image' ? 'none' : 'transparent', 'important')
        }
        entries.push({ el: el, props: props })
      }
    })
    return entries
  }

  /** 记下这次清掉的层（诊断用 + 关闭/卸载时逐字还原）。 */
  function commitFrostBackdrop(entries) {
    state.frostBackup = { entries: entries }
    state.frostCleared = entries.map(function (entry) {
      return nodeLabel(entry.el)
    })
  }

  // ── 「背景」模式的整页透明化（0.3.2）：清掉会盖住 -1 壁纸的不透明页面底色 ───────
  /** 祖先层（从 `el.parentElement` 一路向上到 body 之前；`includeSelf` 时连自己一起收）。 */
  function ancestorsUpToBody(el, includeSelf) {
    var chain = []
    var node = includeSelf ? el : el && el.parentElement
    var depth = 0
    while (node && node !== document.body && node !== document.documentElement && depth < 12) {
      chain.push(node)
      node = node.parentElement
      depth++
    }
    return chain
  }

  /**
   * 页链：从消息区（`[data-conversation-scroll]`）一路向上到 body 的祖先层
   * （不含 body —— body 背景是 canvas 底色）。
   *
   * 0.6.3 起有**退路**：认不出滚动容器时（新会话首屏、hero/加载态、DSH 改结构），
   * 直接拿 `#root` 当锚点 —— 壁纸被盖住的那个底色通常就画在 `#root` 或它下面那几层上。
   * 没有这条退路时，"切对话那一瞬"会有一段时间没人清 → 用户看到的就是"背景失效"。
   */
  function pageScrimChain() {
    var scroller = safe(function () {
      return document.querySelectorAll('[data-conversation-scroll]')[0] || null
    }, null)
    if (scroller) return ancestorsUpToBody(scroller, false)
    var root = safe(function () {
      return document.getElementById('root')
    }, null)
    if (root) return ancestorsUpToBody(root, true)
    return []
  }

  /** 按账本逐字还原（背景两个长属性 + 原优先级）—— 通透化 / 整页底色 / 链外盖子共用。 */
  function restoreEntries(entries) {
    if (!entries || !entries.length) return
    safe(function () {
      for (var i = 0; i < entries.length; i++) {
        var entry = entries[i]
        if (!entry || !entry.el || !entry.el.style) continue
        for (var p = 0; p < FROST_SCRIM_PROPS.length; p++) {
          var prop = FROST_SCRIM_PROPS[p]
          var saved = entry.props[prop]
          if (saved.value) entry.el.style.setProperty(prop, saved.value, saved.priority || '')
          else entry.el.style.removeProperty(prop)
        }
      }
    })
  }

  function revertBackdropScrim() {
    var backup = state.backdropBackup
    state.backdropBackup = null
    state.backdropCleared = []
    state.backdropChain = null
    state.backdropChainDesc = []
    if (!backup) return
    restoreEntries(backup.entries)
  }

  /**
   * 把页链上**所有**"画了背景"的层清成透明（复用 `clearFrostChain`：只动
   * background-color / background-image 两个长属性、原值与优先级逐字记账）。
   *
   * 0.3.1 用类开关只覆盖了 `.BynINW_frame` / `.BynINW_centerCol`，真机依旧没图 ——
   * 说明还有没找到的层。这里不再猜选择器：**清到链上一个不透明层都不剩为止**，
   * 并把每层的实况写进诊断（`diag.json` 的 `backdrop.chain`），之后我能自己读数据验收。
   */
  function applyBackdropScrim() {
    // 与 `applyFrostBackdrop()` 同一个道理（见那里的注释）：**每次都重新认链**，
    // 不能因为"账本还在"就跳过 —— 切对话时页链上那几层会被 React 换掉。
    var chain = pageScrimChain()
    if (!chain.length) return false
    if (sameChain(chain, state.backdropChain)) {
      // 链没变 → 幂等重清（`previous` 保证同一元素沿用最初记下的原值）
      var again = clearFrostChain(chain, state.backdropBackup && state.backdropBackup.entries)
      if (again.length) {
        state.backdropBackup = { entries: again }
        state.backdropCleared = again.map(function (entry) {
          return nodeLabel(entry.el)
        })
      }
      state.backdropChainDesc = describeChain(chain)
      return true
    }
    if (state.backdropBackup) {
      revertBackdropScrim() // 先把旧账逐字还回去（旧节点多半已脱离文档，还回去也无害）
      state.backdropRepairs++
    }
    state.backdropChain = chain
    var entries = clearFrostChain(chain)
    state.backdropBackup = { entries: entries }
    state.backdropCleared = entries.map(function (entry) {
      return nodeLabel(entry.el)
    })
    state.backdropChainDesc = describeChain(chain)
    return true
  }

  // ── 壁纸体检 + 链外盖子（0.6.4）─────────────────────────────────────────────
  /**
   * 这个元素是不是"弹窗/菜单的一部分"？—— 那时全屏那层变暗遮罩是**有意为之**，
   * 不能当成"盖子"清掉（用户 0.2.34 明确要的就是这层变暗效果）。
   */
  function insideModalLayer(el) {
    return !!safe(function () {
      var node = el
      var depth = 0
      while (node && node !== document.body && depth < 6) {
        var role = String(node.getAttribute ? node.getAttribute('role') || '' : '')
        if (role === 'dialog' || role === 'menu') return true
        node = node.parentElement
        depth++
      }
      return false
    }, false)
  }

  /**
   * **谁盖住了壁纸？**（0.6.4）
   *
   * 用 `document.elementsFromPoint()` 在四个采样点做命中测试：壁纸层在最底
   * （`z-index:-1`、`pointer-events:none` 所以不会出现在命中结果里），因此
   * **任何**命中到的、"画了不透明背景 + 几乎铺满视口"的元素，就是盖住它的那一层。
   *
   * 为什么必须有这个：用户 2026-10-16 报「背景模式下切换对话，背景会失效」，
   * 而且是**整张壁纸彻底消失** —— 除了祖先链上被换节点（0.6.3 已修）之外，
   * 还可能冒出一个**不在祖先链上**的全屏不透明层（新会话的加载壳/hero 容器之类），
   * 0.3.2 那套"从消息区往上清"根本够不着它。这里按"谁真的盖着"来找，不猜选择器。
   */
  /** tooltip / popover 之类的临时浮层：悬浮即出现，不能当成"盖住壁纸的加载壳"清掉。 */
  function isTransientOverlay(el) {
    return !!safe(function () {
      return !!(
        el &&
        el.closest &&
        el.closest('[role="tooltip"],[data-tooltip],[data-slot*="tooltip"],[data-slot*="Tooltip"]')
      )
    }, false)
  }

  function scanWallpaperCovers() {
    var out = []
    safe(function () {
      if (state.mode !== 'backdrop') return
      var vw = window.innerWidth || 0
      var vh = window.innerHeight || 0
      if (!vw || !vh) return

      /** 这个元素算不算"盖住壁纸的盖子"（全部条件都满足才算）。 */
      var consider = function (el) {
        if (!el || el.nodeType !== 1) return false
        if (isOurNode(el)) return false
        if (isTransientOverlay(el)) return false
        if (el === document.documentElement) return false
        if (insideModalLayer(el)) return false
        if (!hasPaintedBackground(el)) return false
        if (!coversViewport(el)) return false
        var alpha = safe(function () {
          return colorAlpha(window.getComputedStyle(el).backgroundColor)
        }, 0)
        if (el !== document.body && alpha < 0.85) return false
        if (out.indexOf(el) === -1) out.push(el)
        return true
      }

      // ① 命中测试：**真的压在壁纸上面**的那一层（最准）
      if (typeof document.elementsFromPoint === 'function') {
        var points = [
          [Math.round(vw * 0.5), Math.round(vh * 0.3)],
          [Math.round(vw * 0.5), Math.round(vh * 0.7)],
          [Math.round(vw * 0.1), Math.round(vh * 0.5)],
          [Math.round(vw * 0.9), Math.round(vh * 0.5)],
        ]
        for (var i = 0; i < points.length; i++) {
          var stack = null
          try {
            stack = document.elementsFromPoint(points[i][0], points[i][1])
          } catch (err) {
            stack = null
          }
          if (!stack || !stack.length) continue
          for (var j = 0; j < stack.length; j++) {
            var el = stack[j]
            if (!el || el.nodeType !== 1) continue
            // 走到 html 就到顶了：那是 canvas 底色（画在壁纸下面），不是盖子
            if (el === document.documentElement) break
            if (insideModalLayer(el)) break
            if (isOurNode(el)) continue
            if (!hasPaintedBackground(el)) continue
            if (consider(el)) break
          }
        }
      }

      // ② 顶层容器的补扫：`pointer-events:none` 的浮层**命中测试看不见**
      //    （真实 `elementsFromPoint` 会跳过它们），而"新会话加载壳"经常就是这么写的。
      //    只看 body / #root 的直接子元素（数量有限，成本可控）。
      var parents = [document.body]
      var root = safe(function () {
        return document.getElementById('root')
      }, null)
      if (root) parents.push(root)
      for (var p = 0; p < parents.length; p++) {
        var kids = (parents[p] && parents[p].childNodes) || []
        for (var k = 0; k < kids.length; k++) {
          if (kids[k] && kids[k].nodeType === 1) consider(kids[k])
        }
      }
    })
    return out
  }

  function ledgerHas(ledger, el) {
    for (var i = 0; i < ledger.length; i++) {
      if (ledger[i].el === el) return true
    }
    return false
  }

  /**
   * 把这次扫出来的"盖子"清掉（逐字记账）；**这次没扫到的旧账一律还回去**
   * （元素消失了 / 不再盖着了 / 弹窗关掉了）—— 保证我们只影响"正在盖住壁纸的那一层"。
   */
  function healWallpaperCovers(covers) {
    var ledger = state.coverBackup || (state.coverBackup = [])
    for (var i = ledger.length - 1; i >= 0; i--) {
      if (covers.indexOf(ledger[i].el) === -1) {
        restoreEntries([ledger[i]])
        ledger.splice(i, 1)
      }
    }
    for (var j = 0; j < covers.length; j++) {
      var el = covers[j]
      if (ledgerHas(ledger, el)) continue
      var entries = clearFrostChain([el], null)
      if (!entries.length) continue
      ledger.push(entries[0])
      state.coverCleared.push(nodeLabel(el))
      state.wallpaperRepairs++
    }
    state.coverCount = ledger.length
  }

  /** 还原所有"链外盖子"（切「关闭」/卸载时用）。 */
  function revertWallpaperCovers() {
    var ledger = state.coverBackup
    state.coverBackup = []
    state.coverCleared = []
    state.coverCount = 0
    if (!ledger || !ledger.length) return
    restoreEntries(ledger)
  }

  /**
   * 壁纸图层体检：缺层 / 被抹掉图 / 全透明 / 塌成 0 尺寸 / 卡死的淡出 / 没图地址。
   * 只在"该显示壁纸"的模式下报（`multiply` / `backdrop`），并且**画过一次之后**才报
   * （否则挂载首帧那一下会被当成异常，白白自愈一次）。
   */
  function layerHealth() {
    var issues = []
    safe(function () {
      if (state.mode !== 'multiply' && state.mode !== 'backdrop') return
      if (!state.layerPainted) return
      var layer = state.layer
      if (!layer || layer.isConnected === false || !layer.parentNode) {
        issues.push('detached')
        return
      }
      var style = window.getComputedStyle(layer)
      var opacity = Number(style && style.opacity)
      if (isFinite(opacity) && opacity < 0.02) issues.push('transparent')
      var image = String((style && style.backgroundImage) || 'none')
      if (!image || image === 'none') issues.push('no-image')
      var rect = layer.getBoundingClientRect ? layer.getBoundingClientRect() : null
      if (!rect || rect.width < 2 || rect.height < 2) issues.push('collapsed')
      if (
        layer.classList &&
        layer.classList.contains('is-faded') &&
        !state.fadingOut &&
        state.restoreTimer === null
      ) {
        issues.push('stuck-fade')
      }
      if (!state.bgUrl) issues.push('no-url')
    })
    return issues
  }

  /** 按体检结论把图层修回来（补节点 / 重画图 / 摘掉卡死的淡出 / 重新拉一次图地址）。 */
  function healWallpaperLayer(issues) {
    if (!issues.length) return
    safe(function () {
      if (issues.indexOf('detached') !== -1) {
        state.layer = null
        installStyle()
        ensureLayer()
      }
      if (state.layer) {
        if (issues.indexOf('stuck-fade') !== -1) state.layer.classList.remove('is-faded')
        applyModeToLayer()
      }
      if (issues.indexOf('no-url') !== -1 && Date.now() - state.bgRetryAt > 3000) {
        state.bgRetryAt = Date.now()
        fetchStatus(readImage())
      }
    })
    state.wallpaperRepairs++
    state.wallpaperHealed = issues.slice()
  }

  /** 壁纸那一行的诊断文案（面板 / diag.json 都用它）。 */
  function wallpaperDiagText() {
    if (state.mode !== 'multiply' && state.mode !== 'backdrop') return '未启用'
    var bits = [state.layerPainted ? '在' : '未绘制']
    if (state.coverCount) {
      bits.push('已清链外盖子 ' + state.coverCount + ' 个（' + state.coverCleared.slice(0, 2).join('、') + '）')
    }
    if (state.wallpaperRepairs) bits.push('自愈 ' + state.wallpaperRepairs + ' 次')
    if (state.wallpaperHealed.length) bits.push('修过 ' + state.wallpaperHealed.join('/'))
    // 抢修延迟：≈0ms = 同步修在渲染之前（看不到白闪）；≥250ms = 只能等去抖那一遍（会闪）
    if (state.wallpaperLastLagMs !== null) bits.push('最近抢修延迟 ' + state.wallpaperLastLagMs + 'ms')
    return bits.join(' · ')
  }

  // ── 动效公共底座 + 帧时间探针（P0，0.7.0）────────────────────────────────
  /**
   * 单调时钟（帧探针用）：优先 `performance.now()`（不受挂钟回拨影响）。
   * 桩环境里 `performance.now` 跟着可控时钟走，测试可以精确断言帧率。
   */
  function motionNow() {
    if (typeof performance !== 'undefined' && performance && typeof performance.now === 'function') {
      return performance.now()
    }
    return Date.now()
  }

  /**
   * 现在允不允许跑**装饰性**动画（总开关 + 系统「减弱动态效果」+ 失焦/隐藏）。
   * **铁律**：之后的装饰动效都必须从这里走，不许各自 `setInterval` / 裸 rAF。
   * 现有核心过渡（模式切换、毛玻璃补间）不是装饰，不受总开关约束 ——
   * 它们只是**记账**给探针（`motionBegin`/`motionEnd`）。
   */
  function motionAllowed() {
    return state.motion.enabled && !state.motion.reduced && !state.motion.paused
  }

  /** 动效闸门 → body 类：总开关关 / 系统减弱动态 / 失焦时，CSS 动画一律不跑。 */
  function syncMotionClass() {
    safe(function () {
      if (!document.body) return
      var on = motionAllowed()
      if (on) document.body.classList.add(MOTION_ON_CLASS)
      else document.body.classList.remove(MOTION_ON_CLASS)
      if (state.motion.paused) document.body.classList.add(MOTION_PAUSED_CLASS)
      else document.body.classList.remove(MOTION_PAUSED_CLASS)
    })
  }

  function saveMotionSettings() {
    safe(function () {
      window.localStorage.setItem(MOTION_KEY, JSON.stringify({ enabled: state.motion.enabled === true }))
    })
  }

  /** 读回动效偏好（坏数据一律回落默认 = 关）。 */
  function loadMotionSettings() {
    var raw = safe(function () {
      return window.localStorage.getItem(MOTION_KEY)
    }, null)
    if (!raw) return
    var parsed = null
    try {
      parsed = JSON.parse(raw)
    } catch (err) {
      return
    }
    if (parsed && parsed.enabled === true) state.motion.enabled = true
  }

  /** 注册一个动画（进 +1）。计数 0→1 时开探针。 */
  function motionBegin() {
    state.motionActiveCount++
    startMotionProbe()
  }

  /** 注销一个动画（进 -1）。计数归零时停探针 —— 只在有动画时采样，不空转耗电。 */
  function motionEnd() {
    state.motionActiveCount = Math.max(0, state.motionActiveCount - 1)
    if (state.motionActiveCount === 0) stopMotionProbe()
  }

  var motionLastFrameAt = 0

  function startMotionProbe() {
    if (state.motionFrame !== null) return
    if (typeof window.requestAnimationFrame !== 'function') return
    motionLastFrameAt = 0
    state.motionFrames = []
    state.motion.dropped = 0
    state.motion.longFrames = 0
    state.motionSummaryAt = 0
    var step = function (ts) {
      motionProbeStep(ts)
      state.motionFrame = safe(function () {
        return window.requestAnimationFrame(step)
      }, null)
    }
    state.motionFrame = safe(function () {
      return window.requestAnimationFrame(step)
    }, null)
    state.motion.animating = true
  }

  function stopMotionProbe() {
    if (state.motionFrame !== null && typeof window.cancelAnimationFrame === 'function') {
      safe(function () {
        window.cancelAnimationFrame(state.motionFrame)
      })
    }
    state.motionFrame = null
    state.motion.animating = false
    // **停采样时做一次收尾汇总**：短动画（< 500ms 的补间）等不到节流汇总就结束了，
    // 不收尾的话 fps/P95 永远是 0（0.7.0 自己踩的坑）。
    motionSummarize(motionNow())
    state.motionSummaryAt = 0
    // 样本与读数保留：诊断里显示"上一次动画的帧率"
  }

  /** 用滚动窗口里的样本算 fps 与 P95；样本不够（<2）时**保留上一轮读数**，别用 0 覆盖。 */
  function motionSummarize(at) {
    var frames = state.motionFrames
    if (frames.length >= 2) {
      var total = 0
      for (var i = 0; i < frames.length; i++) total += frames[i]
      var sorted = frames.slice().sort(function (a, b) {
        return a - b
      })
      var p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]
      state.motion.fps = Math.round(1000 / (total / frames.length))
      state.motion.frameMsP95 = Math.round(p95)
    }
  }

  /**
   * 一帧：记帧间隔 → 掉帧/长帧计数 → 每 ~500ms 汇总 fps 与 P95。
   * rAF 回调带高精度时间戳（真实浏览器）；桩环境不带 → 回落 `motionNow()`。
   */
  function motionProbeStep(ts) {
    var at = typeof ts === 'number' && isFinite(ts) && ts > 0 ? ts : motionNow()
    var last = motionLastFrameAt
    motionLastFrameAt = at
    if (last && at > last) {
      var delta = at - last
      var budget = 1000 / 60
      state.motionFrames.push(delta)
      if (state.motionFrames.length > MOTION_WINDOW) state.motionFrames.shift()
      if (delta > budget * 2) state.motion.dropped++
      if (delta > 50) state.motion.longFrames++
    }
    if (!state.motionSummaryAt || at - state.motionSummaryAt > MOTION_SUMMARY_MS) {
      state.motionSummaryAt = at
      motionSummarize(at)
    }
  }

  /**
   * 系统「减弱动态效果」+ 窗口失焦/隐藏 → 动效自动停（0.7.0）。
   * 只装一次；`paused`/`reduced` 状态直接进诊断（`动效:` 那一行）。
   */
  function watchMotionPrefs() {
    if (state.motionPrefsWatched) return
    state.motionPrefsWatched = true
    safe(function () {
      var mq = null
      try {
        if (typeof window.matchMedia === 'function') {
          mq = window.matchMedia('(prefers-reduced-motion: reduce)')
          if (mq && mq.matches) state.motion.reduced = true
        }
      } catch (err) {}
      var syncReduced = function () {
        try {
          state.motion.reduced = !!(mq && mq.matches)
        } catch (err) {}
        syncMotionClass()
        refreshDiag()
      }
      if (mq && typeof mq.addEventListener === 'function') {
        try {
          mq.addEventListener('change', syncReduced)
        } catch (err) {}
      }
      window.addEventListener('blur', function () {
        state.motion.paused = true
        syncMotionClass()
        refreshDiag()
      })
      window.addEventListener('focus', function () {
        state.motion.paused = false
        syncMotionClass()
        refreshDiag()
      })
      try {
        document.addEventListener('visibilitychange', function () {
          state.motion.paused = !!document.hidden
          syncMotionClass()
          refreshDiag()
        })
      } catch (err) {}
    })
  }

  /** `动效:` 那一行的诊断文案。 */
  function motionDiagText() {
    var m = state.motion
    var extra = []
    if (m.reduced) extra.push('系统减弱动态 → 自动停')
    if (m.paused) extra.push('失焦暂停')
    if (!m.enabled) {
      return '关（总开关默认关 · Ctrl+Shift+Alt+M）' + (extra.length ? ' · ' + extra.join(' · ') : '')
    }
    var bits = ['开'].concat(extra)
    if (m.animating) {
      bits.push('采样中 ' + (m.fps || 0) + 'fps · P95 ' + (m.frameMsP95 || 0) + 'ms')
    } else if (m.fps) {
      bits.push('上次 ' + m.fps + 'fps · P95 ' + m.frameMsP95 + 'ms')
    } else {
      bits.push('未采样')
    }
    if (m.dropped) bits.push('掉帧 ' + m.dropped)
    if (m.longFrames) bits.push('长帧 ' + m.longFrames)
    return bits.join(' · ')
  }

  /** 探针读数（status / diag 上报共用的那份）。 */
  function motionSnapshot() {
    return {
      enabled: state.motion.enabled,
      paused: state.motion.paused,
      reduced: state.motion.reduced,
      animating: state.motion.animating,
      fps: state.motion.fps,
      frameMsP95: state.motion.frameMsP95,
      dropped: state.motion.dropped,
      longFrames: state.motion.longFrames,
    }
  }

  /**
   * 让玻璃背后真的有东西可糊 —— 这是"毛玻璃像不像玻璃"的关键一步。
   *
   * 真实 DSH 的输入区座位（`Dc7zOa_composerSeat`）自带一条遮罩：
   *   background:linear-gradient(180deg, color-mix(in srgb, var(--dsw-alias-bg-base) 0%, transparent) 0, var(--dsw-alias-bg-base) 36px)
   * —— 从透明渐变到页面底色，把**从输入区下面滚过的消息整段擦掉**。玻璃背后于是
   * 永远是一块纯色，`backdrop-filter` 糊什么都看不出来：这就是"和没开一样"的根因。
   * 清掉这条链上的不透明底色/渐变，消息才会真的从玻璃下面穿过 → 才有分层感。
   *
   * 只改 background-color / background-image 两个长属性，原值与 !important 标记
   * 逐字记下，关掉毛玻璃 / 切「关闭」/ 卸载时原样写回。
   */
  function applyFrostBackdrop() {
    // ① 每次都重新认一遍链（成本 = 两次查询 + 一次 ≤12 层祖先走查）。
    //    **不能**拿"账本还在"当"没事"：切对话时 React 会把座位/卡片根节点换掉，
    //    这时 `state.frostBackup` 依旧非空（指针却指向脱离文档的旧节点），
    //    老代码用 `!state.frostBackup` 挡住重跑 → 新节点带着应用底色 → 壁纸被盖住
    //    （用户 2026-10-16：「背景模式下切换对话，背景会失效」的根因）。
    var card = findComposerCard()
    var transcript = currentTranscript(card)
    var chain = card && transcript ? frostScrimChain(card, transcript) : []
    if (!chain.length) {
      // 认不出消息区：**保留旧账**（别把已经清好的层还回去），降频重试
      state.frostBackdropMissAt = Date.now()
      return false
    }
    if (sameChain(chain, state.frostChain)) {
      // ② 链没变 → 幂等重清：只有"又被画上底"的层会产生新账（原来的廉价重试）；
      //    `previous` 保证同一元素沿用最初记下的原值，重复清也不会污染还原账本
      var again = clearFrostChain(chain, state.frostBackup && state.frostBackup.entries)
      if (again.length) commitFrostBackdrop(again)
      state.frostClearedReady = true
      return true
    }
    // ③ 链变了 / 节点被 React 换掉 → 先把旧账逐字还回去（旧节点多半已脱离文档，
    //    还回去也无害），再按新链清一遍并重新记账
    if (state.frostBackup) {
      revertFrostBackdrop()
      state.frostRepairs++
    }
    state.frostChain = chain
    var entries = clearFrostChain(chain)
    if (entries.length) commitFrostBackdrop(entries)
    state.frostClearedReady = true
    return true
  }

  function revertFrostBackdrop() {
    var backup = state.frostBackup
    state.frostBackup = null
    state.frostCleared = []
    state.frostChain = null
    state.frostClearedReady = false
    if (!backup) return
    safe(function () {
      for (var i = 0; i < backup.entries.length; i++) {
        var entry = backup.entries[i]
        for (var prop in entry.props) {
          if (!Object.prototype.hasOwnProperty.call(entry.props, prop)) continue
          var saved = entry.props[prop]
          if (saved.value) entry.el.style.setProperty(prop, saved.value, saved.priority || '')
          else entry.el.style.removeProperty(prop)
        }
      }
    })
  }

  /**
   * 一次性迁移：0.2.29 及更早，玻璃背后被应用自己的遮罩挡着，参数怎么调都看不出来
   * —— 于是不少存档里躺着"等于没开"的值（模糊 0~1px、白层 15%）。通透化之后这种值
   * 反而更糟：消息会**清晰地**从卡片下面穿过。所以把**低于出厂默认**的旧值一次性提到
   * 出厂默认（只升不降：比默认更"重"的口味原样保留）；迁移标记写在 localStorage 里，
   * 只发生一次，之后一律以滑块为准。
   */
  function migrateFrostSettings() {
    var done = safe(function () {
      return window.localStorage.getItem(FROST_GLASS_KEY)
    }, null)
    safe(function () {
      window.localStorage.setItem(FROST_GLASS_KEY, '1')
    })
    if (done) return false
    var changed = false
    if (state.frost.blur < FROST_BLUR_DEFAULT) {
      state.frost.blur = FROST_BLUR_DEFAULT
      changed = true
    }
    if (state.frost.alpha < FROST_ALPHA_DEFAULT) {
      state.frost.alpha = FROST_ALPHA_DEFAULT
      changed = true
    }
    if (changed) saveFrostSettings()
    return changed
  }

  // ── 分层：把输入区抬成覆盖层，让聊天记录延伸到玻璃下面 ────────────────────
  var LAYER_PROPS = ['position', 'left', 'right', 'bottom', 'top', 'width', 'zIndex']

  /** 读 !important 标记（某些最小 DOM 实现没有这个方法，做一次防御）。 */
  function stylePriority(style, prop) {
    return (
      safe(function () {
        return style && style.getPropertyPriority ? style.getPropertyPriority(prop) : ''
      }, '') || ''
    )
  }

  /**
   * 让聊天记录的下界更低：把输入区从流式布局里**抬成绝对定位的覆盖层**，
   * 消息区因此铺满整个会话列，聊天记录就会从毛玻璃下面滚过去；
   * 再给消息区补一段底部留白，保证最后一条消息不会被卡片盖住。
   *
   * 只在能明确认出「消息区 + 输入区 + 共同父容器」时才动手，并把原值存进
   * state.layerBackup，任何一步不对就整体还原（关闭/卸载也会还原）。
   */
  function applyLayering(on) {
    if (!on) {
      revertLayering()
      return false
    }
    if (state.layeringApplied) return true // 已经认过并处理过（含"应用自带、我们没动"）
    var card = findComposerCard()
    if (!card) return false
    var transcript = findTranscriptScroller(card)
    if (!transcript) {
      state.transcriptMissAt = Date.now()
      return false
    }
    var holder = transcript.parentElement
    if (!holder) return false

    // ── 情况 A：输入区**就在滚动容器内部**（sticky 在底部）→ 应用自带分层 ──────
    // 真实 DSH 就是这个形状：`Dc7zOa_scrollBody[data-conversation-scroll]` 里装着
    // 全部消息**和** `Dc7zOa_composerSeat`，消息本来就贴着输入区下面滚过去。
    // 这时一行布局都不能动 —— 把嵌在滚动区里的座位改成绝对定位会真的弄坏布局。
    if (transcript.contains(card)) {
      state.layeringApplied = true
      state.frostLayered = true
      state.layeringInfo = {
        native: true,
        reason: 'composer-inside-scroller',
        overlayPosition: safe(function () {
          return String(window.getComputedStyle(card.parentElement).position || '')
        }, ''),
        existingPad: Math.round(
          safe(function () {
            var value = parseFloat(String(window.getComputedStyle(transcript).paddingBottom || '0'))
            return isFinite(value) && value > 0 ? value : 0
          }, 0),
        ),
        addPad: 0,
        needsPosition: false,
        changed: false,
        applied: true,
      }
      return true
    }

    // 覆盖层 = holder（消息区与输入区的共同父容器）的直接子元素里、包含卡片的那一层。
    // 兄弟式布局（Dc7zOa_body > { scrollBody, composerSeat }）下，只有把"座位"整层抬出
    // 流式布局，scrollBody 才会把座位空出来的高度填满，聊天记录才能真正延伸到玻璃下面
    // （卡片上一层的 RlGAzG_root 抬出去没用）。
    var overlay = null
    var node = card
    var depth = 0
    while (node && depth < 8) {
      if (node.parentElement === holder) {
        overlay = node
        break
      }
      if (node === document.body || node === document.documentElement || !node.parentElement) break
      node = node.parentElement
      depth++
    }
    if (!overlay || overlay === holder) return false
    if (overlay === document.body || overlay === document.documentElement) return false
    if (!overlay.contains(card)) return false

    var overlayRect = rectOf(overlay)
    var cardRect = rectOf(card)
    var pad = Math.round(((overlayRect && overlayRect.height) || (cardRect && cardRect.height) || 120) + 24)
    if (pad > 320) pad = 320

    // ── 「能不动就不动」：先看应用自己做到哪一步了 ────────────────────────────
    // 真实 DSH 的座位（Dc7zOa_composerSeat）本身就已经是绝对/粘性定位、消息区也
    // 已经铺到卡片下面 —— 那种情况下我们只需要补"最后一条消息不会被挡住"的底部
    // 留白（而且只补缺的那部分），定位一概不碰。
    var overlayPosition = safe(function () {
      return String(window.getComputedStyle(overlay).position || '')
    }, '')
    var needsPosition = overlayPosition === 'static' && !overlay.style.getPropertyValue('position')
    var existingPad = safe(function () {
      var value = parseFloat(String(window.getComputedStyle(transcript).paddingBottom || '0'))
      return isFinite(value) && value > 0 ? value : 0
    }, 0)
    var addPad = Math.max(0, pad - existingPad)
    state.layeringInfo = {
      overlayPosition: overlayPosition,
      existingPad: Math.round(existingPad),
      addPad: Math.round(addPad),
      needsPosition: needsPosition,
    }

    var backup = {
      holder: holder,
      holderPosition: holder.style.getPropertyValue('position'),
      holderPositionPriority: stylePriority(holder.style, 'position'),
      changedHolder: false,
      overlay: overlay,
      overlayStyle: {},
      changedOverlay: false,
      transcript: transcript,
      transcriptPaddingBottom: transcript.style.getPropertyValue('padding-bottom'),
      transcriptPaddingPriority: stylePriority(transcript.style, 'padding-bottom'),
      changedPadding: false,
    }
    for (var i = 0; i < LAYER_PROPS.length; i++) {
      var prop = LAYER_PROPS[i]
      backup.overlayStyle[prop] = {
        value: overlay.style.getPropertyValue(prop),
        priority: stylePriority(overlay.style, prop),
      }
    }

    var ok = safe(function () {
      if (needsPosition) {
        if (!holder.style.getPropertyValue('position')) {
          holder.style.setProperty('position', 'relative')
          backup.changedHolder = true
        }
        overlay.style.setProperty('position', 'absolute')
        overlay.style.setProperty('left', '0')
        overlay.style.setProperty('right', '0')
        overlay.style.setProperty('bottom', '0')
        overlay.style.setProperty('top', 'auto')
        overlay.style.setProperty('width', 'auto')
        backup.changedOverlay = true
      }
      if (addPad > 0) {
        transcript.style.setProperty('padding-bottom', Math.round(existingPad + addPad) + 'px')
        backup.changedPadding = true
      }
      return true
    }, false)
    if (!ok) {
      revertLayeringPart(backup)
      return false
    }
    // 一行都没改（应用自带分层且留白已足够）→ 不记 backup，但依然算"分层到位"：
    // 这样切「关闭」时也不需要还原任何东西，界面零风险。
    var changed = backup.changedHolder || backup.changedOverlay || backup.changedPadding
    state.layeringInfo.changed = changed
    state.layeringInfo.applied = true
    state.layeringApplied = true
    if (changed) state.layerBackup = backup
    state.frostLayered = true
    return true
  }

  function revertLayeringPart(backup) {
    if (!backup) return
    safe(function () {
      var holder = backup.holder
      if (holder) {
        if (backup.holderPosition) {
          holder.style.setProperty('position', backup.holderPosition, backup.holderPositionPriority || '')
        } else {
          holder.style.removeProperty('position')
        }
      }
      var overlay = backup.overlay
      if (overlay) {
        for (var prop in backup.overlayStyle) {
          if (!Object.prototype.hasOwnProperty.call(backup.overlayStyle, prop)) continue
          var entry = backup.overlayStyle[prop]
          if (entry.value) overlay.style.setProperty(prop, entry.value, entry.priority || '')
          else overlay.style.removeProperty(prop)
        }
      }
      var transcript = backup.transcript
      if (transcript) {
        if (backup.transcriptPaddingBottom) {
          transcript.style.setProperty(
            'padding-bottom',
            backup.transcriptPaddingBottom,
            backup.transcriptPaddingPriority || '',
          )
        } else {
          transcript.style.removeProperty('padding-bottom')
        }
      }
    })
  }

  function revertLayering() {
    var backup = state.layerBackup
    state.layerBackup = null
    state.frostLayered = false
    state.layeringApplied = false
    state.layeringInfo = null
    if (!backup) return
    revertLayeringPart(backup)
  }

  var frostObserver = null
  var frostScanTimer = null
  var frostViewportWatched = false

  /**
   * **一遍自愈**：观察器（250ms 去抖后）与 `__DSHUI__.reapply()` 共用这一段。
   *
   * 顺序：补标毛玻璃表面 → 分层守卫（降频）→ 通透化（座位遮挡）→ 整页透明化（背景模式）。
   * 后两者**无条件跑**（0.6.3）：以前写成 `if (!state.frostBackup)`（"没处理过才处理"），
   * 可切对话时 React 换掉的是链上某几层 —— 账本还在、指针已失效，条件为假 → 新节点带着
   * 应用底色留下 → 壁纸被盖住 = 用户说的「背景模式下切换对话，背景会失效」。
   * 现在这两个函数**每次重认链、比形状**（`sameChain`），形状变了就还原旧账 + 按新链重清。
   */
  function repairPass(force) {
    // 量一下"去抖那一遍有没有真的动手"：动了就记延迟（会是 250ms 上下 —— 那就意味着
    // 有一次可能被看见的白闪；`instantGuard` 那边是 0~2ms，不会闪）。
    var repairsBefore = state.wallpaperRepairs + state.frostRepairs + state.backdropRepairs
    // 壁纸图层体检（0.6.4）：补层 / 重画图 / 摘掉卡死的淡出 —— 用户报的"整张壁纸彻底消失"
    // 有可能是图层自己被抹了，这里先修这个（很便宜：几个属性读取）。
    healWallpaperLayer(layerHealth())
    if (frostActive()) {
      markFrostSurfaces()
      // 认不出消息区时降频重试（1.5s 一次），别在每次 DOM 变化时全文档扫描
      var retryLayering =
        state.frost.layered &&
        !state.layerBackup &&
        (!state.transcriptMissAt || Date.now() - state.transcriptMissAt > 1500)
      if (retryLayering) applyLayering(true)
      applyFrostBackdrop()
      if (state.mode === 'backdrop') applyBackdropScrim()
    } else if (state.mode === 'backdrop') {
      // 「背景」模式（毛玻璃关着）：座位擦除带 + 整页底色一样要清（同上，自愈）
      applyFrostBackdrop()
      applyBackdropScrim()
    }
    // 链外盖子（0.6.4）：命中测试有成本，节流到 1s 一次；只在背景模式有意义。
    // 账本非空时**不节流** —— 那说明上一轮确实清过东西，得尽快发现"它不再盖着了"并还原。
    if (state.mode === 'backdrop' && (force || state.coverCount > 0 || Date.now() - state.coverScanAt > 1000)) {
      state.coverScanAt = Date.now()
      healWallpaperCovers(scanWallpaperCovers())
    }
    var repairsAfter = state.wallpaperRepairs + state.frostRepairs + state.backdropRepairs
    if (repairsAfter > repairsBefore) {
      noteHoverProbe('pass', { repairs: repairsAfter - repairsBefore, lag: state.wallpaperLastLagMs })
    }
    if (repairsAfter > repairsBefore && state.lastMutationAt) {
      state.wallpaperLastLagMs = Date.now() - state.lastMutationAt
    }
  }

  /**
   * 这一批 DOM 变化里有没有**新加的元素节点**（0.7.1）。
   * 流式输出的绝大多数批次只是加/换文本节点（`nodeType === 3`）——它们不可能带来
   * 新的玻璃表面，所以"扩展表面补标"（全文档查询 + 读计算样式 + 写类）可以整批跳过。
   */
  function batchAddsElement(records) {
    if (!records || !records.length) return false
    for (var i = 0; i < records.length; i++) {
      var record = records[i]
      if (!record) continue
      var added = record.addedNodes
      if (!added || !added.length) continue
      for (var j = 0; j < added.length; j++) {
        var node = added[j]
        if (!node) continue
        // 1 = Element（真实浏览器与 test/fake-dom.js 的桩都这么标）
        if (node.nodeType === 1) return true
        if (!node.nodeValue && node.tagName) return true
      }
    }
    return false
  }

  /**
   * 维护"最近 1 秒的 DOM 批次数"，并在超速时开关**低功耗**（0.7.1）。
   * 只做几次数组操作，可以在每个批次里放心调用。
   */
  function noteHoverProbe(kind, detail) {
    var hp = state.hoverProbe
    if (!hp || !hp.active) return
    hp.events.push({ t: Date.now(), kind: kind, d: detail || null })
    if (hp.events.length > 60) hp.events.shift()
  }

  function reportHoverProbe() {
    var hp = state.hoverProbe
    if (!hp) return
    // 就算插件什么都没做，也上报一次（events 为空）：用来区分“插件动作导致”还是“渲染层闪烁”。
    if (!hp.events.length && Date.now() - hp.since < 200) return
    var payload = {
      probe: 'hover',
      at: Date.now(),
      win: state.windowTag,
      version: VERSION,
      mode: state.mode,
      hoverMs: Date.now() - hp.since,
      entry: hp.entry,
      send: hp.send || null,
      frost: { enabled: state.frost.enabled, active: frostActive(), mode: state.mode, blur: state.frost.blur, bubbleBlur: state.frost.bubbleBlur },
      wallpaper: {
        repairs: state.wallpaperRepairs,
        coverCount: state.coverCount,
        lagMs: state.wallpaperLastLagMs,
      },
      events: hp.events.slice(-40),
    }
    hp.events = []
    hp.lastReportAt = Date.now()
    safe(function () {
      fetch(PREFIX + '/diag?data=' + encodeURIComponent(JSON.stringify(payload)), {
        credentials: 'same-origin',
        cache: 'no-store',
      }).catch(function () {})
    })
  }

  var hoverProbeBound = false
  function bindHoverProbe() {
    if (hoverProbeBound) return
    hoverProbeBound = true
    safe(function () {
      var inComposer = function (el) {
        return !!safe(function () {
          return !!(el && el.closest && el.closest('[data-composer-card]'))
        }, false)
      }
      document.addEventListener('pointerover', function (event) {
        if (!inComposer(event && event.target)) return
        var hp = state.hoverProbe
        safe(function () {
          var t = event && event.target
          hp.entry = String(
            (t && ((t.getAttribute && (t.getAttribute('aria-label') || t.getAttribute('data-slot'))) || '')) ||
              (t && t.className) ||
              '',
          ).slice(0, 120)
          var send = t && t.closest ? t.closest('[aria-label="发送消息"],[aria-label="Send message"],[aria-label*="发送"]') : null
          if (send) {
            var cs = window.getComputedStyle(send)
            var card = send.closest('[data-composer-card]')
            var ccs = card ? window.getComputedStyle(card) : null
            hp.send = {
              label: String(send.getAttribute('aria-label') || ''),
              transition: String((cs && cs.transition) || '').slice(0, 120),
              backdrop: String((ccs && (ccs.backdropFilter || ccs.webkitBackdropFilter)) || '').slice(0, 80),
            }
          }
        })
        if (!hp.active) {
          hp.active = true
          hp.since = Date.now()
        }
      }, true)
      document.addEventListener('pointerout', function (event) {
        var hp = state.hoverProbe
        if (!hp.active) return
        if (inComposer(event && event.relatedTarget)) return
        hp.active = false
        reportHoverProbe()
      }, true)
    })
  }

  function noteMutationRate(now) {
    var stamps = state.mutationStamps
    stamps.push(now)
    while (stamps.length && now - stamps[0] > 1000) stamps.shift()
    state.mutationRate = stamps.length
    if (state.mutationRate > MUTATION_STORM_RATE) {
      if (!state.mutationStorm) state.mutationStormSince = now
      state.mutationStorm = true
      state.mutationStormCalmSince = 0
      return
    }
    if (!state.mutationStorm) return
    if (state.mutationRate > MUTATION_CALM_RATE) {
      state.mutationStormCalmSince = 0
      return
    }
    if (!state.mutationStormCalmSince) {
      state.mutationStormCalmSince = now
      return
    }
    if (now - state.mutationStormCalmSince >= MUTATION_STORM_CALM_MS) {
      state.mutationStorm = false
      state.mutationStormCalmSince = 0
      state.mutationStormSince = 0
      // 风暴结束：立刻补一遍全量，把低功耗期间攒下的活一次清掉
      if (frostScanTimer !== null) {
        safe(function () {
          clearTimeout(frostScanTimer)
        })
        frostScanTimer = null
        repairPass()
      }
    }
  }

  /** 低功耗状态（诊断用）。 */
  function perfSnapshot() {
    return {
      rate: state.mutationRate,
      storm: state.mutationStorm === true,
      skipped: state.mutationSkipped,
      stormSince: state.mutationStormSince || 0,
    }
  }

  /** `性能:` 那一行的诊断文案（0.7.1）。 */
  function perfDiagText() {
    var bits = ['变更 ' + (state.mutationRate || 0) + ' 批/秒']
    if (state.mutationStorm) {
      bits.push('低功耗中（跳过补标 ' + (state.mutationSkipped || 0) + ' 次，去抖放宽到 1s）')
    } else {
      bits.push('正常（跳过补标 ' + (state.mutationSkipped || 0) + ' 次）')
    }
    return bits.join(' · ')
  }

  /** 这批 DOM 变化是否全是插件自己的 GUI（胶囊/面板/诊断/开屏/欢迎卡片）——
   *  是的话直接跳过毛玻璃抢修：打开面板本身不该触发全文档扫描与链外盖子扫描
   *  （用户实测「点背景后立刻点胶囊卡死」的放大因素之一）。 */
  function isOwnGuiElement(node) {
    if (!node || node.nodeType !== 1) return false
    var id = node.id
    if (id === PILL_ID || id === SWITCHER_ID || id === DIAG_ID) return true
    if (id === '__dshui-splash' || id === '__dshui-welcome') return true
    return !!safe(function () {
      return node.hasAttribute && (node.hasAttribute('data-dshui-ignore') || node.hasAttribute('data-dshui-restart-toast'))
    }, false)
  }

  function batchIsOwnGui(records) {
    if (!records || !records.length) return false
    for (var i = 0; i < records.length; i++) {
      var record = records[i]
      var nodes = []
      var j
      for (j = 0; j < record.addedNodes.length; j++) nodes.push(record.addedNodes[j])
      for (j = 0; j < record.removedNodes.length; j++) nodes.push(record.removedNodes[j])
      if (!nodes.length) return false // 文本/属性变化不在此列，照常处理
      for (j = 0; j < nodes.length; j++) {
        if (!isOwnGuiElement(nodes[j])) return false
      }
    }
    return true
  }

  /** React 重渲染卡片/气泡时会丢掉我们的类 → 监听 DOM 变化自动补回来。 */
  function watchFrostTargets() {
    if (frostObserver || typeof MutationObserver === 'undefined') return
    safe(function () {
      frostObserver = new MutationObserver(function (records) {
        // 插件自己 GUI 的增删（开/关面板、点胶囊、开屏、提示）不参与壁纸/毛玻璃抢修
        if (batchIsOwnGui(records)) return
        // 记下"这批变化是什么时候送到的"：用来量抢修延迟（0~2ms = 同步抢在渲染前）。
        var now = Date.now()
        state.lastMutationAt = now
        noteMutationRate(now)
        var storm = state.mutationStorm === true
        var addsElement = batchAddsElement(records)
        noteHoverProbe('mutation', { adds: addsElement ? 1 : 0, storm: storm ? 1 : 0 })
        // 扩展表面（问答窗口 / 鲸鱼面板 / 背景模式下的代码块）补标：
        // 只在「有元素被加进来」且「不在低功耗」时做（0.7.1）——它是全文档查询 + 读计算
        // 样式 + 写类，流式输出时每个批次都跑会把主线程与 GPU 拖满（用户实测的卡死）。
        if (!storm && addsElement && frostActive()) {
          markExtraFrostSurfaces()
        } else {
          state.mutationSkipped++
        }
        // ① **同步抢修**（0.6.5）：MutationObserver 回调是微任务，在**浏览器绘制之前**跑 ——
        //    在这里把"链形状变了 / 图层被抹了 / 顶上多了个盖子"修掉，用户就看不到那一帧白闪。
        //    旧版只靠下面 250ms 去抖那一遍，等于"先白 0~250ms 再回来"（用户：「还是会白闪一下」）。
        //    这一步只做"形状对比"级别的活，低功耗期间也保留。
        instantGuard(records)
        // ② 去抖那一遍：贵的东西（全量打标、分层、昂贵重试）留在这里。
        //    低功耗期间放宽到 1s（流式输出时没必要每 250ms 全量重算一遍）。
        if (frostScanTimer !== null) clearTimeout(frostScanTimer)
        frostScanTimer = setTimeout(function () {
          frostScanTimer = null
          repairPass()
        }, storm ? MUTATION_SCAN_STORM_MS : MUTATION_SCAN_MS)
      })
      frostObserver.observe(document.body, { childList: true, subtree: true })
    })
  }

  /**
   * **抢在渲染之前**的那一遍轻量检查（0.6.5）。
   *
   * 只做三件便宜事（都是"查询 + 走查"，**不碰 `getComputedStyle` 之外的样式计算**）：
   *   ① 图层体检（几个属性读取）—— 被摘/被抹/卡死淡出一律当场修；
   *   ② 顶层容器增删（`body` / `#root` 的直接子节点）→ 当场跑一遍链外盖子扫描；
   *   ③ 链**形状**变了（元素身份/顺序，不比对背景）→ 当场重清通透化与整页底色。
   *
   * 为什么卡这么死：观察器回调每个 DOM 批次都会来一次，而流式输出时批次极多；
   * 这里必须只做"形状对比"级别的活，否则会拖慢页面（零侵入/不卡是底线）。
   */
  function instantGuard(records) {
    if (state.mode !== 'multiply' && state.mode !== 'backdrop') return
    var repaired = false

    // ① 图层体检（很便宜）
    var issues = layerHealth()
    if (issues.length) {
      healWallpaperLayer(issues)
      repaired = true
    }

    // ② 顶层容器增删 → 新盖子可能刚出现（不透明加载壳经常挂在 body / #root 下）
    if (state.mode === 'backdrop' && topLevelTouched(records)) {
      state.coverScanAt = Date.now()
      healWallpaperCovers(scanWallpaperCovers())
      repaired = true
    }

    // ③ 链形状变了 → 立刻重清（不比对背景，只比元素身份：这就是"切对话"的特征）
    if (chainShapeChanged()) {
      applyFrostBackdrop()
      if (state.mode === 'backdrop') applyBackdropScrim()
      repaired = true
    }

    if (repaired) {
      noteHoverProbe('instant', { issues: issues.slice(), mode: state.mode })
      state.wallpaperLastLagMs = Date.now() - state.lastMutationAt
      if (state.switcherEl) reRenderSwitcher()
    }
  }

  /** 这一批 DOM 变化里，有没有"顶层容器"（`body` / `#root`）的直接子节点被加进来。 */
  function topLevelTouched(records) {
    if (!records || !records.length) return false
    var root = safe(function () {
      return document.getElementById('root')
    }, null)
    var top = [document.body, root]
    for (var i = 0; i < records.length; i++) {
      var added = records[i] && records[i].addedNodes
      if (!added) continue
      for (var j = 0; j < added.length; j++) {
        var node = added[j]
        if (!node || node.nodeType !== 1) continue
        if (isOurNode(node)) continue // 我们自己的胶囊/面板/图层也挂在 body 下，别自触发
        if (isTransientOverlay(node)) continue // 悬浮 tooltip 弹出/消失不触发盖子扫描
        if (top.indexOf(node.parentNode) !== -1) return true
      }
    }
    return false
  }

  /**
   * 链的**形状**变了没有（只比元素身份与顺序，不读任何计算样式 —— 这是能每批 DOM 变化
   * 都跑一次的代价上限）。形状变了就等于"React 把这块换新了"，必须立刻重清。
   */
  function chainShapeChanged() {
    return !!safe(function () {
      var card = findComposerCard()
      var transcript = currentTranscript(card)
      var chain = card && transcript ? frostScrimChain(card, transcript) : []
      if (chain.length && !sameChain(chain, state.frostChain)) return true
      if (state.mode === 'backdrop') {
        var page = pageScrimChain()
        if (page.length && !sameChain(page, state.backdropChain)) return true
      }
      return false
    }, false)
  }

  function watchFrostViewport() {
    if (frostViewportWatched) return
    frostViewportWatched = true
    safe(function () {
      var timer = null
      window.addEventListener('resize', function () {
        if (timer !== null) clearTimeout(timer)
        timer = setTimeout(function () {
          timer = null
          if (!frostActive() && state.mode !== 'backdrop') return
          // 卡片高度变了 → 底部留白也要跟着变
          if (state.frost.layered && frostActive()) applyLayering(true)
          applyFrostBackdrop()
          if (state.mode === 'backdrop') applyBackdropScrim()
          if (frostActive()) markFrostSurfaces()
        }, 150)
      })
    })
  }

  var themeObserver = null
  /**
   * 主题切换后重算所有"跟主题色有关"的视觉：图层图/浓度、毛玻璃变量、气泡原色、
   * 二级面板遮罩等（DSH 换主题后如果只换壁纸，面板/气泡会保留旧主题的颜色）。
   */

  /**
   * 主题切换后重算主题相关视觉。`smooth` 模式：壁纸交给 syncThemeImage 交叉淡化，
   * 浓度/毛玻璃走补间；非 smooth 时直接落最终值（启动/内部重绘用）。
   */
  /** 某主题下壁纸层的混合模式（与静态 CSS 规则一致）。 */
  function themeBlendFor(theme, mode) {
    if (mode === 'multiply') return theme === 'dark' ? 'lighten' : 'multiply'
    return 'normal'
  }

  function applyThemeVisuals(options) {
    var smooth = !!(options && options.smooth)
    var mode = state.mode
    if (mode === 'off' || !state.layer) return
    safe(function () {
      var safeMode = MODES.indexOf(state.mode) === -1 || state.mode === 'off' ? 'overlay' : state.mode
      state.layer.setAttribute('data-mode', safeMode)
      if (smooth) {
        var current = parseFloat(state.layer.style.getPropertyValue('opacity'))
        if (!isFinite(current)) current = layerOpacityTarget()
        tweenLayerOpacity(state.layer, current, layerOpacityTarget(), FADE_MS)
      } else {
        applyLayerOpacity()
      }
    })
    safe(function () {
      if (smooth) tweenFrostVars(state.frost.blur, state.frost.alpha, FADE_MS)
      else applyFrostVars(state.frost.blur, state.frost.alpha)
      applyExtraFrostVars()
    })
    safe(function () {
      // 气泡/聊天高亮块的原色是主题相关的内联变量：先还原再按当前主题重新取样
      revertBubbleColors()
      revertChatColors()
      markFrostSurfaces()
      markExtraFrostSurfaces()
    })
    if (mode === 'backdrop') {
      safe(function () {
        applyBackdropScrim()
        applyFrostBackdrop()
      })
    }
    refreshDiag()
  }

  /**
   * 主题切换时：重写图层背景（薄纱颜色随主题走）+ 同步壁纸（深色用暗夜图）。
   * DSH 深浅色 = body 上的 `data-ds-dark-theme`；同时兜底监听 html 的 style/class/data-theme。
   */
  function watchTheme() {
    if (themeObserver || typeof MutationObserver === 'undefined') return
    safe(function () {
      var scheduled = false
      var tick = function () {
        scheduled = false
        var key = isDarkTheme() ? 'dark' : 'light'
        if (state.themeKey === key) return
        var previousKey = state.themeKey
        if (key === 'dark' && !(state.darkImages && state.darkImages.length)) state.pendingDarkTheme = true
        if (key === 'light') state.pendingDarkTheme = false
        state.themeKey = key
        safe(function () {
          applyThemeVisuals({ smooth: !state.motion.reduced })
        })
        safe(applyPillTheme)
        // 旧图层保留旧主题的混合模式、新图层用新主题的；这样淡化期间旧深色图
        // 不会突然变 multiply 压在新浅色界面上（那就是“黑色遮挡”）。
        safe(function () {
          syncThemeImage(false, { themeSwitch: true, fromTheme: previousKey, toTheme: key })
        })
        if (state.switcherEl) reRenderSwitcher()
        refreshDiag()
      }
      themeObserver = new MutationObserver(function () {
        if (scheduled) return
        scheduled = true
        // 立即执行：MutationObserver 回调发生在浏览器绘制之前；
        // 原来 setTimeout(60) 会让新主题先画出来 ~4 帧，再盖上旧底色遮罩 → 看起来就是“闪一下”。
        safe(tick)
      })
      var filter = ['data-ds-dark-theme', 'data-theme', 'data-color-scheme', 'class', 'style']
      themeObserver.observe(document.body, { attributes: true, attributeFilter: filter })
      themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: filter })
      // 初始状态也记一次（启动时若已经是深色，后续 syncThemeImage 会用暗夜图）
      state.themeKey = isDarkTheme() ? 'dark' : 'light'
    })
  }

  /** 开关毛玻璃（只在纹理模式下真正生效；开/关都带淡入淡出）。 */
  function setFrost(on) {
    if (on && state.frost.enabled) {
      var alreadyActive = safe(function () {
        return document.body.classList.contains(FROST_CLASS)
      }, false)
      if (!alreadyActive) {
        // 先抓卡片原生底色（此时我们的规则还没接管，读到的就是原生值），
        // 淡入从「原生透明度 + 零模糊」起步 → 接管瞬间和白底无缝衔接，不闪白光。
        state.frostNativeAlpha = readNativeFrostAlpha()
        safe(function () {
          document.body.classList.add(FROST_CLASS)
        })
        if (state.frost.layered) applyLayering(true)
        watchFrostTargets()
        watchFrostViewport()
        applyFrostVars(0, state.frostNativeAlpha)
        tweenFrostVars(state.frost.blur, state.frost.alpha, FADE_MS)
      } else {
        // 已在生效：停掉残留补间。若当前可见值离目标很远（比如淡出被新切换打断），
        // 就补间回去；否则直接钉到目标（滑块实时拖动时不要每次都重放一遍动画）。
        var farAway =
          state.frostAnim !== null ||
          !state.frostNow ||
          Math.abs(state.frostNow.alpha - state.frost.alpha) > 0.02 ||
          Math.abs(state.frostNow.blur - state.frost.blur) > 1
        if (farAway) tweenFrostVars(state.frost.blur, state.frost.alpha, FADE_MS)
        else applyFrostVars(state.frost.blur, state.frost.alpha)
      }
      // 两分支都重新打标：DOM 可能已经换过卡片 / 新增了气泡
      // 二级面板白层两端 + 气泡白层也在这里落到 CSS 变量上（滑块拖完 / 读档 / 开关都会经过这里）
      applyExtraFrostVars()
      // 通透化：把卡片与消息区之间的不透明遮罩清掉，玻璃背后才有东西可糊
      applyFrostBackdrop()
      markFrostSurfaces()
      reportLayout()
      return
    }
    var visible = safe(function () {
      return document.body.classList.contains(FROST_CLASS)
    }, false)
    if (visible) {
      // 淡出：参数补间回「原生透明度 + 零模糊」，结束后再摘类 —— 摘类瞬间
      // 卡片的原生白底恢复，和补间终点一致，不会闪白光。
      var nativeAlpha = state.frostNativeAlpha !== null ? state.frostNativeAlpha : 0.85
      tweenFrostVars(0, nativeAlpha, FADE_MS, teardownFrostInstant)
    } else {
      teardownFrostInstant()
    }
  }

  /** 额外白层（面板两端）：合法范围 0.10~1（v0.6.2 起下限从 0.30 降到 0.10）；坏数据一律回落默认。 */
  function frostAlphaValue(value, fallback) {
    return typeof value === 'number' && isFinite(value) && value >= PANEL_ALPHA_MIN && value <= 1
      ? value
      : fallback
  }

  /** 气泡透明度：0~100（整数）；坏数据回落默认。 */
  function bubbleTransparencyValue(value, fallback) {
    return typeof value === 'number' && isFinite(value) && value >= 0 && value <= 100
      ? Math.round(value)
      : fallback
  }

  /** 气泡模糊：0~30px（整数）；坏数据回落默认。 */
  function bubbleBlurValue(value, fallback) {
    return typeof value === 'number' && isFinite(value) && value >= 0 && value <= BUBBLE_BLUR_MAX
      ? Math.round(value)
      : fallback
  }

  /** 气泡自选颜色：只收 '#rrggbb'（小写）；其余一律 ''（= 跟随气泡原色）。 */
  function bubbleColorValue(value) {
    return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : ''
  }

  /** 读回毛玻璃参数（localStorage 持久化，坏数据一律忽略）。 */
  function loadCaretSettings() {
    var raw = safe(function () {
      return window.localStorage.getItem(CARET_KEY)
    }, null)
    if (!raw) return null
    var parsed = null
    try {
      parsed = JSON.parse(raw)
    } catch (err) {
      return null
    }
    if (!parsed || typeof parsed !== 'object') return null
    var blur = Number(parsed.blur)
    if (!isFinite(blur) || blur < 0 || blur > CARET_BLUR_MAX) return null
    return { blur: blur }
  }

  function saveCaretSettings() {
    safe(function () {
      window.localStorage.setItem(CARET_KEY, JSON.stringify({ blur: state.caretBlur }))
    })
  }

  function applyCaretVars() {
    safe(function () {
      if (!document.body) return
      document.body.style.setProperty('--dshui-caret-blur', state.caretBlur + 'px')
    })
  }

  /** 面板滑块 / API：设置光标光晕模糊（0~16px）。 */
  function setCaretBlur(value) {
    var next = Math.min(CARET_BLUR_MAX, Math.max(0, Number(value)))
    if (!isFinite(next)) return state.caretBlur
    state.caretBlur = Math.round(next * 2) / 2
    saveCaretSettings()
    applyCaretVars()
    return state.caretBlur
  }

  function loadFrostSettings() {
    var raw = safe(function () {
      return window.localStorage.getItem(FROST_KEY)
    }, null)
    if (!raw) return null
    var parsed = null
    try {
      parsed = JSON.parse(raw)
    } catch (err) {
      return null
    }
    if (!parsed || typeof parsed !== 'object') return null
    return {
      enabled: parsed.enabled !== false,
      // 分层不再可关：面板选项已移除，程序内保持开启（旧存档里的 false 一律忽略）
      layered: true,
      blur:
        typeof parsed.blur === 'number' && parsed.blur >= 0 && parsed.blur <= 30
          ? parsed.blur
          : FROST_BLUR_DEFAULT,
      alpha:
        typeof parsed.alpha === 'number' && parsed.alpha >= FROST_ALPHA_MIN && parsed.alpha <= FROST_ALPHA_MAX
          ? parsed.alpha
          : FROST_ALPHA_DEFAULT,
      panelTop: frostAlphaValue(parsed.panelTop, FROST_PANEL_TOP),
      panelBottom: frostAlphaValue(parsed.panelBottom, FROST_PANEL_BOTTOM),
      bubbleFx: parsed.bubbleFx !== false,
      aiReplyFx: parsed.aiReplyFx !== false,
      // v0.2.39 存档的是"颜色保留百分比 bubbleMix"；v0.2.40 起存"透明度"（0=不透明,100=全透明）。
      // 旧档做一次等价换算：透明度 = 100 - mix，保证升级后视觉完全不变。
      bubbleTransparency:
        parsed.bubbleTransparency !== undefined
          ? bubbleTransparencyValue(parsed.bubbleTransparency, BUBBLE_TRANSPARENCY_DEFAULT)
          : typeof parsed.bubbleMix === 'number'
            ? bubbleTransparencyValue(100 - parsed.bubbleMix, BUBBLE_TRANSPARENCY_DEFAULT)
            : BUBBLE_TRANSPARENCY_DEFAULT,
      bubbleBlur: bubbleBlurValue(parsed.bubbleBlur, BUBBLE_BLUR_DEFAULT),
      bubbleColor: bubbleColorValue(parsed.bubbleColor),
      // 0.4.0 起 DSH 面板模糊独立（旧档没有这一项 → 回落默认 20）
      dshBlur:
        typeof parsed.dshBlur === 'number' && parsed.dshBlur >= 0 && parsed.dshBlur <= FROST_DSH_BLUR_MAX
          ? parsed.dshBlur
          : FROST_DSH_BLUR_DEFAULT,
      // 0.7.1：「气泡浮层」（`bubbleFloat`）已删除 —— 旧档里的这个键**直接忽略**。
    }
  }

  function saveFrostSettings() {
    safe(function () {
      window.localStorage.setItem(FROST_KEY, JSON.stringify(state.frost))
    })
  }

  /** 开关/滑块改动后刷新（纹理/背景模式下；0.4.0 起背景模式也开毛玻璃）。 */
  function refreshFrost() {
    if (state.mode !== 'multiply' && state.mode !== 'backdrop') return
    if (state.frost.enabled) setFrost(true)
    else setFrost(false)
    if (state.switcherEl) reRenderSwitcher()
  }

  /**
   * 把页面上所有"可能是消息区"的容器扫出来上报（诊断用）。
   *
   * 用途：如果 `findTranscriptScroller()` 认不出消息区（分层没生效），这份清单能
   * 直接告诉我们是哪个元素、它的 class / data-* 标记 / 几何 / 是否真的可滚动 ——
   * 于是可以把选择器改对，而不是靠猜。
   */
  function describeScrollCandidates(card) {
    var out = []
    safe(function () {
      var vw = window.innerWidth || 1
      var vh = window.innerHeight || 1
      var all = document.querySelectorAll('div, main, section, article, ul, ol, aside')
      for (var i = 0; i < all.length && out.length < 16; i++) {
        var el = all[i]
        if (isOurNode(el)) continue
        var rect = rectOf(el)
        if (!rect || rect.width < vw * 0.2) continue
        var style = null
        try {
          style = window.getComputedStyle(el)
        } catch (err) {
          continue
        }
        var overflowScrollable = style.overflowY === 'auto' || style.overflowY === 'scroll'
        var reallyScrollable = (el.scrollHeight || 0) > (el.clientHeight || 0) + 40
        var tall = rect.height >= vh * 0.35
        if (!overflowScrollable && !reallyScrollable && !tall) continue
        // data-* 标记（找真实选择器最有用的线索）
        var attrs = {}
        safe(function () {
          var list = (el.attributes && el.attributes.length) || 0
          var n = 0
          for (var a = 0; a < list && n < 5; a++) {
            var attr = el.attributes[a]
            if (!attr || !attr.name || attr.name.indexOf('data-') !== 0) continue
            attrs[attr.name] = String(attr.value || '').slice(0, 40)
            n++
          }
        })
        out.push({
          tag: el.tagName ? el.tagName.toLowerCase() : '',
          cls: String(el.className || '').slice(0, 64),
          /** 这个候选里面装着输入卡片吗？（装着 = 应用自带分层的那种布局） */
          holdsCard: !!(card && el.contains(card)),
          attrs: attrs,
          rect: {
            left: Math.round(rect.left),
            top: Math.round(rect.top),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          },
          overflowY: style.overflowY,
          scrollH: el.scrollHeight || 0,
          clientH: el.clientHeight || 0,
        })
      }
    })
    return out
  }

  /**
   * 把当前布局上报给宿主（诊断用）：我能据此确认「消息区/输入区/共同父容器」的真实
   * 几何，而不是靠猜。数据只发到插件自己的只读路由，存在内存里，不落盘。
   */
  function reportLayout() {
    var payload = safe(function () {
      var card = findComposerCard()
      var transcript = card ? findTranscriptScroller(card) : null
      var describe = function (el, label) {
        if (!el) return null
        var rect = rectOf(el)
        var style = null
        try {
          style = window.getComputedStyle(el)
        } catch (err) {}
        return {
          label: label,
          tag: el.tagName ? el.tagName.toLowerCase() : '',
          className: String(el.className || '').slice(0, 120),
          attrs: (function () {
            var out = {}
            var names = [
              'data-composer-card',
              'data-composer-input',
              'data-input-scroll',
              'data-slot',
              'role',
              'data-conversation-scroll',
              'data-chat-flow-kind',
            ]
            for (var i = 0; i < names.length; i++) {
              var value = el.getAttribute && el.getAttribute(names[i])
              if (value) out[names[i]] = String(value).slice(0, 60)
            }
            return out
          })(),
          rect: rect
            ? {
                left: Math.round(rect.left),
                top: Math.round(rect.top),
                width: Math.round(rect.width),
                height: Math.round(rect.height),
              }
            : null,
          position: style ? style.position : null,
          overflowY: style ? style.overflowY : null,
          background: style ? String(style.backgroundColor || '').slice(0, 40) : null,
          paddingBottom: style ? style.paddingBottom : null,
          mixBlendMode: style ? style.mixBlendMode : null,
          transition: style ? String(style.transition || '').slice(0, 60) : null,
          zIndex: style ? style.zIndex : null,
          inlineStyle: String(el.getAttribute('style') || '').slice(0, 240),
        }
      }
      var bubbles = findUserBubbles()
      return {
        at: Date.now(),
        /** 本窗口的随机标识（多窗口时 diag.json 的 history 靠它区分）。 */
        win: state.windowTag || '',
        version: VERSION,
        mode: state.mode,
        modeGroup: state.modeGroup,
        anchors: anchorsSnapshot(),
        dynamicGuides: !!state.dynamicGuides,
        dynamic: dynamicSnapshot(),
        theme: isDarkTheme() ? 'dark' : 'light',
        /** 「背景」模式的自诊断（0.3.2）：页链每层画没画底色、清了哪几层、标题栏锚在哪。 */
        backdrop: {
          active: state.mode === 'backdrop',
          cleared: state.backdropCleared.slice(),
          chain: state.backdropChainDesc,
          /** 自愈次数（0.6.3）：切对话/换节点后重新清过几次整页底色。 */
          repairs: state.backdropRepairs,
          titlebarOn: safe(function () {
            if (document.documentElement.hasAttribute('data-windows-titlebar')) return 'html'
            if (document.body.hasAttribute('data-windows-titlebar')) return 'body'
            return null
          }, null),
        },
        viewport: { w: window.innerWidth || 0, h: window.innerHeight || 0 },
        frost: {
          enabled: state.frost.enabled,
          layered: state.frost.layered,
          layeredApplied: !!state.layerBackup,
          layeredReady: state.layeringApplied,
          layering: state.layeringInfo,
          blur: state.frost.blur,
          alpha: state.frost.alpha,
          targets: state.frostTargetCount || 0,
          /** 扩展表面数量（问答窗口 + 二级面板）。 */
          extra: state.frostExtraCount || 0,
          /** 二级面板数量：走下面那套**单独**的毛玻璃参数。 */
          panels: state.frostPanelCount || 0,
          /** DSH 自己的二级面板（role=dialog / role=menu）。 */
          dshPanels: state.frostDshCount || 0,
          /** 聊天内的代码块/文件卡片（0.6.0，背景模式专属）。 */
          chatExtras: state.frostChatCount || 0,
          /** 其中代码块的数量（0.6.1：代码块内层底色已清，玻璃才透得出来）。 */
          chatBlocks: state.frostChatBlocks || 0,
          /** 其中文件卡片的数量（0.6.1）。 */
          chatFiles: state.frostChatFiles || 0,
          /** 二级面板的毛玻璃参数（固定值，不跟主滑块走）。 */
          panelBlur: FROST_PANEL_BLUR,
          panelAlpha: FROST_PANEL_ALPHA,
          /** DSH 自己的二级面板的独立模糊度（0.4.0 起有专属滑块）。 */
          dshBlur: state.frost.dshBlur,
          /** 白层是竖向渐变：顶部更实、底部更透（面板上两个滑块可调、会存档）。 */
          panelAlphaTop: state.frost.panelTop,
          panelAlphaBottom: state.frost.panelBottom,
          /** 纹理模式气泡视觉（顶部高光/柔和投影，用户气泡 + 输入框）。 */
          bubbleFx: state.frost.bubbleFx,
          /** 气泡视觉的 body 开关类当前是否真的挂在页面上（诊断用）。 */
          bubbleFxActive: !!safe(function () {
            return document.body && document.body.classList.contains(BUBBLE_FX_CLASS)
          }, false),
          /** 纹理模式 AI 回复区域视觉（左侧细线/淡渐变）。 */
          aiReplyFx: state.frost.aiReplyFx,
          aiReplyFxActive: !!safe(function () {
            return document.body && document.body.classList.contains(AI_FX_CLASS)
          }, false),
          aiReplyTargets: safe(function () {
            return document.querySelectorAll(AI_REPLY_SELECTOR).length
          }, 0),
          aiStepTargets: safe(function () {
            return document.querySelectorAll(AI_STEP_SELECTOR).length
          }, 0),
          /** 用户气泡自己的白层（太低气泡形状会消失）。 */
          bubbleTransparency: state.frost.bubbleTransparency,
          bubbleBlur: state.frost.bubbleBlur,
          bubbleColor: state.frost.bubbleColor,
          /** 二级面板打开时那层变暗遮罩的渐变参数（径向渐变：中心 / 边缘）。 */
          panelMaskCenter: PANEL_MASK_CENTER,
          panelMaskEdge: PANEL_MASK_EDGE,
          /** 最近一次气泡扫描统计：候选/收下/被宽·高·容器·输入·非我 跳过各多少条。 */
          bubbleScan: state.bubbleScan,
          cleared: state.frostCleared.slice(),
          clearedReady: !!state.frostClearedReady,
          /** 自愈次数（0.6.3）：切对话/换节点后重新认链并清过的次数。 */
          repairs: state.frostRepairs,
        },
        /**
         * 壁纸体检（0.6.4）：图层还在不在、有没有被抹、有没有"链外的盖子"。
         * 报"背景失效"时先读这一段 —— `covers` 会直接点名是谁盖着壁纸。
         */
        wallpaper: {
          text: wallpaperDiagText(),
          painted: !!state.layerPainted,
          issues: state.wallpaperHealed.slice(),
          repairs: state.wallpaperRepairs,
          covers: state.coverCleared.slice(),
          coverCount: state.coverCount,
          url: state.bgUrl || '',
          /** 最近一次抢修的延迟（ms）：≈0 = 同步抢在渲染前修的（看不到白闪）。 */
          lagMs: state.wallpaperLastLagMs,
        },
        /** 动效底座 + 帧时间探针（P0，0.7.0）：只在有动画时采样。 */
        motion: motionSnapshot(),
        /** 变更风暴熔断（0.7.1）：DOM 批次速率、是否低功耗、跳过了几次补标。 */
        perf: perfSnapshot(),
        /** 本次从旧前缀迁移的键数量。 */
        storageMigrated: state.storageMigrated,
        /** 开屏动画（0.8.0）：开关 / 状态 / 耗时 / URL。 */
        splash: splashSnapshot(),
        /** 重启键（0.8.0）：按钮 / 壳补丁 / 忙碌态。 */
        restart: restartSnapshot(),
        /** 自己那两张图层的实况：混合模式有没有真的生效、浓度/图片/过渡是什么。 */
        layers: [
          { id: LAYER_ID, el: state.layer },
          { id: LAYER2_ID, el: safe(function () { return document.getElementById(LAYER2_ID) }, null) },
        ].map(function (entry) {
          if (!entry.el) return { id: entry.id, present: false }
          var info = describe(entry.el, entry.id)
          var computed = safe(function () {
            return window.getComputedStyle(entry.el)
          }, null)
          return {
            id: entry.id,
            present: true,
            dataMode: entry.el.getAttribute('data-mode'),
            opacity: computed ? computed.opacity : null,
            mixBlendMode: computed ? computed.mixBlendMode : null,
            zIndex: computed ? computed.zIndex : null,
            backgroundImage: String((computed && computed.backgroundImage) || '').slice(0, 80),
            transition: computed ? String(computed.transition || '').slice(0, 60) : null,
            inlineStyle: info ? info.inlineStyle : '',
          }
        }),
        /** 换图流程的时间线（最近 10 条，诊断用）。 */
        switchLog: state.switchLog.slice(),
        /** 换图期间的逐帧记录（最后一次换图，最多 80 帧）。 */
        switchTrace: state.switchTrace ? state.switchTrace.slice(-40) : null,
        card: describe(card, 'composer-card'),
        cardParent: card ? describe(card.parentElement, 'card-parent') : null,
        transcript: describe(transcript, 'transcript-scroller'),
        transcriptParent: transcript ? describe(transcript.parentElement, 'transcript-parent') : null,
        /** 消息区认不出来时的排查清单：页面上所有像滚动容器的元素。 */
        scrollCandidates: describeScrollCandidates(card),
        userBubbles: bubbles.slice(0, 3).map(function (el, index) {
          return describe(el, 'user-bubble-' + index)
        }),
      }
    }, null)
    if (!payload) return null
    state.lastReport = payload
    safe(function () {
      var url = PREFIX + '/diag?data=' + encodeURIComponent(JSON.stringify(payload))
      fetch(url, { credentials: 'same-origin', cache: 'no-store' }).catch(function () {})
    })
    return payload
  }

  // ── 模式应用 ──────────────────────────────────────────────────────────────

  /** 纹理模式气泡视觉的 body 开关类（只在 multiply 模式加；关/卸载时摘掉）。 */
  function syncBubbleFxClass() {
    safe(function () {
      if (!document.body) return
      var on = state.mode === 'multiply' && state.frost.bubbleFx !== false
      if (on) document.body.classList.add(BUBBLE_FX_CLASS)
      else document.body.classList.remove(BUBBLE_FX_CLASS)
    })
  }


  /** 纹理模式「AI 回复区域」视觉的 body 开关类（同样只在 multiply 模式加）。 */
  function syncAiReplyFxClass() {
    safe(function () {
      if (!document.body) return
      var on = (state.mode === 'multiply' || state.mode === 'backdrop') && state.frost.aiReplyFx !== false
      if (on) document.body.classList.add(AI_FX_CLASS)
      else document.body.classList.remove(AI_FX_CLASS)
    })
  }

  /** 读取某行的思维链文字（只读 DOM；动画/诊断都可以用）。 */
  function thinkingRowText(el) {
    return safe(function () {
      return String(el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120)
    }, '')
  }

  /** 读取当前页面上的 AI 思维链（只读）：行数 + 前几行摘要，供动画/调试使用。 */
  function readThinkingRows() {
    return safe(function () {
      var nodes = document.querySelectorAll(AI_STEP_SELECTOR)
      var rows = []
      for (var i = 0; i < nodes.length && i < 20; i++) {
        rows.push({
          text: thinkingRowText(nodes[i]),
          variant: nodes[i].getAttribute ? nodes[i].getAttribute('data-variant') : null,
        })
      }
      return { count: nodes.length, rows: rows, replayCount: aiReplayCount }
    }, { count: 0, rows: [], replayCount: aiReplayCount })
  }

  /** 重播一行思维链的「从左侧滑入」动画（行级节流，避免流式文字每帧都抖）。 */
  function replayThinkingRow(el) {
    safe(function () {
      if (!el || !el.style || !el.isConnected) return
      var now = Date.now()
      if (aiReplayLastAt) {
        var last = aiReplayLastAt.get(el) || 0
        if (now - last < AI_REPLAY_GAP_MS) return
        aiReplayLastAt.set(el, now)
      }
      el.style.setProperty('animation', 'none', 'important')
      // 强制 reflow 后恢复样式表动画 → 重播 300ms 的左侧滑入
      void el.offsetWidth
      el.style.removeProperty('animation')
      aiReplayCount++
    })
  }

  function flushAiReplay() {
    aiReplayRaf = null
    var queue = aiReplayQueue
    aiReplayQueue = []
    safe(function () {
      if (state.mode !== 'multiply' && state.mode !== 'backdrop') return
      if (state.frost.aiReplyFx === false) return
      for (var i = 0; i < queue.length && i < 8; i++) {
        if (queue[i] && queue[i].isConnected) replayThinkingRow(queue[i])
      }
    })
  }

  function queueThinkingRow(el) {
    if (!el) return
    if (aiReplayQueue.indexOf(el) !== -1) return
    aiReplayQueue.push(el)
    if (aiReplayQueue.length > 32) aiReplayQueue.shift()
    if (aiReplayRaf === null) {
      aiReplayRaf = safe(function () {
        return typeof requestAnimationFrame === 'function'
          ? requestAnimationFrame(flushAiReplay)
          : setTimeout(flushAiReplay, 16)
      }, null)
    }
  }

  /** 监听思维链 DOM：新增行 / 行内流式文字更新 → 重播左侧滑入（只读，不改文字）。 */
  function watchAiThinking() {
    if (aiReplayObserver) return
    safe(function () {
      if (typeof MutationObserver !== 'function') return
      var observer = new MutationObserver(function (records) {
        if (state.mode !== 'multiply' && state.mode !== 'backdrop') return
        if (state.frost.aiReplyFx === false) return
        try {
          for (var i = 0; i < records.length; i++) {
            var rec = records[i]
            if (rec.type === 'characterData') {
              var p = rec.target && rec.target.parentElement
              var row1 = p && p.closest ? p.closest(AI_STEP_SELECTOR) : null
              if (row1) queueThinkingRow(row1)
            } else if (rec.type === 'childList') {
              var targetRow = rec.target && rec.target.closest ? rec.target.closest(AI_STEP_SELECTOR) : null
              if (targetRow) queueThinkingRow(targetRow)
              for (var j = 0; j < rec.addedNodes.length; j++) {
                var node = rec.addedNodes[j]
                if (!node || node.nodeType !== 1) continue
                var row2 = node.matches && node.matches(AI_STEP_SELECTOR)
                  ? node
                  : node.querySelector
                    ? node.querySelector(AI_STEP_SELECTOR)
                    : null
                if (row2) queueThinkingRow(row2)
              }
            }
          }
        } catch (err) {}
      })
      observer.observe(document.body, { childList: true, subtree: true, characterData: true })
      aiReplayObserver = observer
    })
  }

  function stopAiThinkingWatch() {
    safe(function () {
      if (aiReplayObserver && aiReplayObserver.disconnect) aiReplayObserver.disconnect()
    })
    aiReplayObserver = null
    aiReplayQueue = []
    if (aiReplayRaf !== null && typeof cancelAnimationFrame === 'function') {
      try {
        cancelAnimationFrame(aiReplayRaf)
      } catch (err) {}
    }
    aiReplayRaf = null
  }

  function applyMode(mode) {
    if (MODES.indexOf(mode) === -1) mode = 'overlay'
    if (mode === 'off') {
      state.mode = 'off'
      syncDynamicClass()
      updatePill()
      if (!state.installed) {
        state.status = 'off'
        return
      }
      fadeOutThenUninstall()
      return
    }
    state.mode = mode
    state.lastActiveMode = mode
    if (mode === 'multiply' || mode === 'backdrop') state.lastStaticMode = mode
    state.installed = true
    cancelModeFadeOut()
    // 「背景」模式的 body 开关类 + 整页底色：只在这个模式生效；淡出（off）期间先留着，卸载时统一摘/还原
    safe(function () {
      if (mode === 'backdrop') document.body.classList.add(BACKDROP_CLASS)
      else if (mode !== 'off') {
        document.body.classList.remove(BACKDROP_CLASS)
        revertBackdropScrim()
      }
    })
    syncBubbleFxClass()
    syncAiReplyFxClass()
    safe(function () {
      if (mode === 'multiply') document.body.classList.add(TEXTURE_CLASS)
      else document.body.classList.remove(TEXTURE_CLASS)
    })
    var freshLayer = !state.layer
    installStyle()
    ensureLayer()
    applyModeToLayer()
    setFrost(mode === 'multiply' || mode === 'backdrop')
    if (mode === 'backdrop') {
      // 「背景」模式也要清掉座位那 36px 渐变擦除带（否则输入区有一段图被盖住），
      // 与毛玻璃共用同一套备份/还原机制（frostBackup 两本账）；观察器兜底 React 换节点。
      watchFrostTargets()
      watchFrostViewport()
      applyFrostBackdrop()
      // 整页不透明底色（frame/centerCol 等）全清：壁纸才真的露得出来（0.3.2）
      applyBackdropScrim()
      // 链外盖子（0.6.4）：进模式时立刻扫一遍（不等 250ms 去抖），"切进背景模式就有图"
      state.coverScanAt = Date.now()
      healWallpaperCovers(scanWallpaperCovers())
    } else {
      // 离开背景模式：链外盖子必须逐字还回去（那是我们为了看壁纸临时清掉的）
      revertWallpaperCovers()
    }
    if (freshLayer) fadeInLayer()
    state.status = 'active'
    syncDynamicClass()
    updatePill()
    safe(function () {
      setTimeout(function () {
        safe(syncThemeImage)
      }, 0)
    })
    refreshDiag()
  }

  // ── 切换模式的淡入淡出 ────────────────────────────────────────────────────
  /**
   * 「关闭」：先整体淡出（背景层走 CSS 过渡、毛玻璃参数补间到 0），
   * 动画结束后再真正卸载。淡出期间又切回纹理 → cancelModeFadeOut() 取消。
   */
  function fadeOutThenUninstall() {
    state.fadingOut = true
    // 停掉进行中的图层补间（否则内联 transition:none 会让下面的 CSS 淡出失效）
    cancelAllLayerTweens()
    safe(function () {
      if (state.layer) state.layer.classList.add('is-faded')
    })
    var finish = function () {
      state.modeFadeTimer = null
      state.fadingOut = false
      uninstall({ keepStatus: true, keepPill: true, keepRestart: true })
      state.status = 'off'
      updatePill()
    }
    var frostVisible =
      state.frost.enabled === true &&
      safe(function () {
        return document.body.classList.contains(FROST_CLASS)
      }, false)
    if (frostVisible) {
      // 毛玻璃补间自带 onDone：淡回原生底色后 finish 才卸载（摘类时白底无缝归还）
      var nativeAlpha = state.frostNativeAlpha !== null ? state.frostNativeAlpha : 0.85
      tweenFrostVars(0, nativeAlpha, FADE_MS, finish)
    } else {
      state.modeFadeTimer = setTimeout(finish, FADE_MS + 20)
    }
  }

  /** 取消尚未完成的淡出卸载（用户又切回了纹理等有效模式）。 */
  function cancelModeFadeOut() {
    state.fadingOut = false
    if (state.modeFadeTimer !== null) {
      safe(function () {
        clearTimeout(state.modeFadeTimer)
      })
      state.modeFadeTimer = null
    }
    safe(function () {
      if (state.layer) state.layer.classList.remove('is-faded')
    })
  }

  // ── 图层透明度的逐帧补间（淡入 / 交叉淡化，不依赖 CSS transition）────────
  /**
   * 为什么不直接用 CSS transition 淡入：Chromium 对**刚挂上、还没渲染过的元素**
   * 会抑制过渡（初始渲染不产生 transition），强制回流也绕不开 —— 这就是之前
   * "关闭→纹理没有渐变"的根因。改成 JS 逐帧写内联 opacity：先钉 0，再 16ms 一步
   * 补间到目标，跟浏览器渲染机制完全无关，必然平滑。
   * 补间期间把内联 transition 置 none，避免 CSS 过渡再"平滑"每一步造成拖尾。
   */
  function cancelLayerTween(layer) {
    for (var i = state.layerAnims.length - 1; i >= 0; i--) {
      var anim = state.layerAnims[i]
      if (anim.layer !== layer) continue
      state.layerAnims.splice(i, 1)
      if (anim.timer !== null && anim.timer !== undefined) {
        safe(function () {
          clearTimeout(anim.timer)
        })
      }
      if (anim.motionTracked) motionEnd()
      safe(function () {
        // 浓度现在只存在于内联样式里（样式表是静态的），取消时必须钉回当前目标值，
        // 不能直接删内联 —— 删掉会回落成 opacity:1（整层实心乘法，画面会突然变暗）。
        layer.style.setProperty('opacity', String(layerOpacityTarget()))
        layer.style.removeProperty('transition')
      })
      return
    }
  }

  function cancelAllLayerTweens() {
    while (state.layerAnims.length > 0) cancelLayerTween(state.layerAnims[0].layer)
  }

  /**
   * @param {boolean} [pinEnd] 补间结束后把内联 opacity 钉在终点值。
   *   浓度是内联的（样式表静态），所以**所有**图层补间都要钉终点；pinEnd=false
   *   仅用于明确不再需要的临时层。
   */
  function tweenLayerOpacity(layer, from, to, durationMs, onDone, pinEnd) {
    if (!layer) {
      if (onDone) safe(onDone)
      return
    }
    cancelLayerTween(layer)
    if (!(durationMs > 0)) {
      safe(function () {
        layer.style.removeProperty('transition')
        layer.style.setProperty('opacity', String(to))
      })
      if (onDone) safe(onDone)
      return
    }
    var anim = {
      layer: layer,
      timer: null,
      elapsed: 0,
      duration: durationMs,
      from: from,
      to: to,
      onDone: onDone || null,
      pinEnd: pinEnd !== false,
      motionTracked: true,
    }
    state.layerAnims.push(anim)
    motionBegin()
    safe(function () {
      layer.style.setProperty('transition', 'none')
    })
    stepLayerOpacity(anim)
  }

  function stepLayerOpacity(anim) {
    if (state.layerAnims.indexOf(anim) === -1) return
    anim.elapsed += FADE_STEP_MS
    var t = anim.elapsed >= anim.duration ? 1 : anim.elapsed / anim.duration
    var ease = 1 - Math.pow(1 - t, 3) // easeOutCubic
    var value = anim.from + (anim.to - anim.from) * ease
    safe(function () {
      anim.layer.style.setProperty('opacity', String(value))
    })
    if (t >= 1) {
      var index = state.layerAnims.indexOf(anim)
      if (index !== -1) state.layerAnims.splice(index, 1)
      if (anim.motionTracked) motionEnd()
      if (anim.pinEnd) {
        // 钉在终点浓度，并**重新武装** CSS 过渡（点背景淡出/关闭淡出仍靠它）
        safe(function () {
          anim.layer.style.setProperty('opacity', String(anim.to))
          anim.layer.style.removeProperty('transition')
        })
      } else {
        safe(function () {
          anim.layer.style.removeProperty('transition')
          anim.layer.style.removeProperty('opacity')
        })
      }
      var done = anim.onDone
      if (done) safe(done)
      return
    }
    anim.timer = safe(function () {
      return setTimeout(function () {
        stepLayerOpacity(anim)
      }, FADE_STEP_MS)
    }, null)
  }

  /**
   * 层刚挂上时用 JS 补间淡入：先钉 0（首帧同步执行，第一屏就是透明），
   * 再逐帧补间到目标浓度；结束后浓度钉在内联样式上（样式表里没有浓度）。
   */
  function fadeInLayer() {
    var layer = state.layer
    if (!layer) return
    tweenLayerOpacity(layer, 0, layerOpacityTarget(), FADE_MS)
  }

  /** 卸下自己的一切痕迹（层、样式、毛玻璃；默认连左上角入口一起移除），但不改用户选的模式。 */
  function uninstall(options) {
    if (state.restoreTimer !== null) {
      clearTimeout(state.restoreTimer)
      state.restoreTimer = null
    }
    if (state.modeFadeTimer !== null) {
      clearTimeout(state.modeFadeTimer)
      state.modeFadeTimer = null
    }
    state.fadingOut = false
    closeSwitcher()
    closeDiag()
    closeAnchorTool(true)
    removeAnchorGuides()
    stopDynamicEngine()
    removeSplashNode()
    removeSplashWelcome()
    unbindCaretOverlay()
    stopAiThinkingWatch()
    // v0.8.14：只关壁纸/背景模式时保留标题栏「重启」按钮（真正卸载插件才摘）。
    if (!(options && options.keepRestart)) stopRestartButton()
    if (!(options && options.keepPill)) removePill()
    teardownFrostInstant()
    revertBackdropScrim()
    revertWallpaperCovers()
    safe(function () {
      document.body.classList.remove(BACKDROP_CLASS)
      document.body.classList.remove('__dshui-dynamic')
      document.body.classList.remove(TEXTURE_CLASS)
      document.body.classList.remove(BUBBLE_FX_CLASS)
      document.body.classList.remove(AI_FX_CLASS)
    })
    cancelAllLayerTweens()
    var layer2 = safe(function () {
      return document.getElementById(LAYER2_ID)
    }, null)
    if (layer2 && layer2.parentNode) safe(function () {
      layer2.parentNode.removeChild(layer2)
    })
    var layer = safe(function () {
      return document.getElementById(LAYER_ID)
    }, null)
    if (layer && layer.parentNode) safe(function () {
      layer.parentNode.removeChild(layer)
    })
    state.layer = null
    removeStyle()
    state.installed = false
    state.override = false
    if (!(options && options.keepStatus)) state.status = 'off'
    refreshDiag()
  }

  // ── 互动：点背景 → 恢复默认 → 2 秒后淡回 ─────────────────────────────────
  function triggerRestore() {
    if (!state.installed || !state.layer) return
    state.override = true
    // 淡入补间进行中时点背景：先停掉补间，让"淡出/淡回"走标准的 CSS 过渡
    cancelAllLayerTweens()
    safe(function () {
      state.layer.classList.add('is-faded')
    })
    if (state.restoreTimer !== null) clearTimeout(state.restoreTimer)
    state.restoreTimer = setTimeout(function () {
      state.restoreTimer = null
      state.override = false
      safe(function () {
        if (state.layer) state.layer.classList.remove('is-faded')
      })
      refreshDiag()
    }, RESTORE_MS)
    refreshDiag()
  }

  /**
   * 点击判定：只有「点在页面的大块空白处」才触发。
   * 层是 `pointer-events:none`，所以点击目标永远是页面自己的元素 ——
   * 插件不拦任何事件、不 stopPropagation、不 preventDefault。
   */
  function onClick(event) {
    if (!state.installed || state.override || state.mode === 'off') return
    if (state.splashNode) return // 开屏播放中：不响应背景点击（避免和揭幕/淡出打架）
    if (event.defaultPrevented) return
    if (typeof event.button === 'number' && event.button > 0) return
    var node = event.target
    if (node && node.nodeType === 3) node = node.parentNode
    if (!node || node.nodeType !== 1) return
    if (isOurNode(node)) return
    // 可交互元素 / 文本内容一律放行
    var blocked = safe(function () {
      return node.closest(
        'a,button,input,textarea,select,svg,img,video,audio,canvas,' +
          '[role="button"],[role="link"],[role="textbox"],[role="menuitem"],[role="tab"],' +
          '[contenteditable="true"],[contenteditable=""],[data-dshui-ignore]',
      )
    }, null)
    if (blocked) return
    // 只有「命中元素本身就是一大块空白」才算点背景
    var rect = rectOf(node)
    var view = { w: window.innerWidth || 1, h: window.innerHeight || 1 }
    if (!rect || rect.width < view.w * 0.5 || rect.height < view.h * 0.5) return
    triggerRestore()
  }

  // ── 诊断面板（不依赖控制台） ──────────────────────────────────────────────
  function diagLines() {
    return [
      'DSH UI Beautify v' + VERSION,
      '模式: ' +
        (state.modeGroup === 'dynamic' ? '动态 · 开发中（' : state.modeGroup === 'static' ? '静态 · ' : '') +
        (state.mode === 'multiply'
          ? '纹理'
          : state.mode === 'backdrop'
            ? '背景'
            : state.mode === 'off'
              ? '关闭'
              : state.mode) +
        '（' + state.mode + '）',
      '动态分镜: ' +
        (state.modeGroup === 'dynamic'
          ? (state.dynamicPreview ? '预览' : state.dynamicCinematic ? '思考中·已放大' : state.dynamicPhase === 'output' ? '输出中·普通布局' : '待机') +
            (state.dynamicSuspended ? ' · 滚轮退出' : '') +
            ' · 布局: ' + (state.dynamicLayout && state.dynamicLayout.phases ? '已加载' : '未加载')
          : '未启用') +
        ' · ' + '定位锚点: ' + (function () {
        var a = anchorsSnapshot()
        return '背景 ' + anchorPercent(a.bg.x) + '%,' + anchorPercent(a.bg.y) + '% · 气泡 ' + anchorPercent(a.bubble.x) + '%,' + anchorPercent(a.bubble.y) + '% · 思考A ' + anchorPercent(a.thinkA.x) + '%,' + anchorPercent(a.thinkA.y) + '% · 思考B ' + anchorPercent(a.thinkB.x) + '%,' + anchorPercent(a.thinkB.y) + '%'
      })(),
      '主题: ' + (isDarkTheme() ? '深色' : '浅色') + ' · 壁纸: ' + (state.imageName || '默认'),
      '状态: ' + state.status,
      '背景源: ' + String(state.source) + '  (' + state.bgUrl + ')',
      '图片层: ' + (state.layer ? '已挂载' : '未挂载'),
      '当前浓度: ' + opacityFor(state.mode) + '（' + (isDarkTheme() ? '深色参数' : '浅色参数') + '）',
      '动效: ' + motionDiagText(),
      // 0.7.1：变更风暴熔断 —— 界面"卡住"时先看这一行（每秒批次数 / 是否已进低功耗）
      '性能: ' + perfDiagText(),
      '存储: ' + storageDiagText(),
      // 0.8.0：开屏动画状态（播放中/已完/已跳过/已关闭 + 耗时）
      '开屏: ' + splashDiagText(),
      // 0.8.0：重启键（按钮是否注入 / 壳补丁是否可用）
      '重启: ' + restartDiagText(),
      // 0.8.5：纹理模式气泡视觉 —— 开关 / 是否真的生效
      '气泡视觉: ' +
        (state.frost.bubbleFx ? '开' : '关') +
        (safe(function () {
          return document.body && document.body.classList.contains(BUBBLE_FX_CLASS)
        }, false)
          ? ' · 已生效'
          : ' · 未生效（需纹理模式）'),
      'AI 思考过程视效: ' +
        (state.frost.aiReplyFx ? '开' : '关') +
        (safe(function () {
          return document.body && document.body.classList.contains(AI_FX_CLASS)
        }, false)
          ? ' · 已生效'
          : ' · 未生效（需纹理/背景模式）') +
        '（回复 ' + safe(function () {
          return document.querySelectorAll(AI_REPLY_SELECTOR).length
        }, 0) + ' 处 / 思考行 ' + safe(function () {
          return document.querySelectorAll(AI_STEP_SELECTOR).length
        }, 0) + ' 处）',
      // 0.6.4：壁纸体检 —— 报"背景没了"时，这一行直接说清是图层问题还是被谁盖住了
      '壁纸: ' + wallpaperDiagText(),
      '毛玻璃: ' +
        (frostActive()
          ? '开（' +
            (state.frostTargetCount || 0) +
            ' 个表面' +
            (state.frostExtraCount ? ' + ' + state.frostExtraCount + ' 个面板' : '') +
            ' · 模糊 ' +
            state.frost.blur +
            'px · 白层 ' +
            Math.round(state.frost.alpha * 100) +
            '%（气泡 ' +
            state.frost.bubbleTransparency +
            '%透·' +
            state.frost.bubbleBlur +
            'px' +
            (state.frost.bubbleColor ? '·色' + state.frost.bubbleColor : '') +
            '）' +
            (state.frostPanelCount
              ? ' · 二级面板 ' +
                state.frostPanelCount +
                ' 个（' +
                FROST_PANEL_BLUR +
                'px · 白层 边' +
                Math.round(state.frost.panelTop * 100) +
                '→' +
                Math.round(state.frost.panelBottom * 100) +
                '% 径向渐变 · 遮罩 ' +
                Math.round(PANEL_MASK_CENTER * 100) +
                '→' +
                Math.round(PANEL_MASK_EDGE * 100) +
                '% 渐变）'
              : '') +
            (state.frostDshCount
              ? ' · DSH 面板 ' + state.frostDshCount + ' 个（模糊 ' + state.frost.dshBlur + 'px）'
              : '') +
            (state.frostChatCount
              ? ' · 代码块 ' +
                state.frostChatBlocks +
                ' 个 · 文件 ' +
                state.frostChatFiles +
                ' 个（玻璃已贴内层）'
              : '') +
            ' · 分层 ' +
            (state.layerBackup
              ? '已生效（补了 ' + String(state.layeringInfo && state.layeringInfo.addPad) + 'px 留白）'
              : state.layeringApplied
                ? state.layeringInfo && state.layeringInfo.native
                  ? '应用自带（输入区就在滚动区内，我们没动布局）'
                  : '应用自带（我们没动布局）'
                : '未认出消息区') +
            ' · 通透 ' +
            (state.frostClearedReady ? '已开（清了 ' + state.frostCleared.length + ' 层遮挡）' : '关') +
            (state.frostRepairs ? ' · 自愈 ' + state.frostRepairs + ' 次' : '') +
            '）'
          : '关'),
      (state.mode === 'backdrop'
        ? '背景透明: 已清 ' +
          state.backdropCleared.length +
          ' 层' +
          (state.backdropChainDesc.length ? '（页链 ' + state.backdropChainDesc.length + ' 层）' : '') +
          (state.backdropRepairs ? ' · 自愈 ' + state.backdropRepairs + ' 次' : '')
        : ''),
      '气泡识别: ' +
        (state.bubbleScan
          ? '候选 ' +
            state.bubbleScan.candidates +
            ' · 收 ' +
            state.bubbleScan.accepted +
            '（宽 ' +
            state.bubbleScan.wide +
            ' · 高 ' +
            state.bubbleScan.tall +
            ' · 容器 ' +
            state.bubbleScan.container +
            ' · 非我 ' +
            state.bubbleScan.notUser +
            '）'
          : '未扫描'),
      '最近错误: ' + (state.lastError || '无'),
      '',
      '模式: __DSHUI__.setMode("off" | "multiply" | "backdrop")',
      '视觉: __DSHUI__.setBubbleFx(true|false) · setAiReplyFx(true|false) · thinkingRows()',
      '其它: setMotion(true|false) · setSplash(true|false) · setScrim(0~0.9) · replaySplash()',
    ].join('\n')
  }

  function toggleDiag() {
    // 打开诊断面板时顺手把当前 AI 思维链读数（行数/文字摘要/动画状态）上报宿主，
    // 方便没有 DevTools 时直接从 /diag.json 验证「能不能读到思维链」。
    safe(function () { reportRestartProbe('diag-open') })
    if (state.diagEl) {
      closeDiag()
      return null
    }
    var box = document.createElement('div')
    box.id = DIAG_ID
    box.setAttribute('data-dshui-ignore', '')
    box.style.cssText = [
      'position:fixed', 'right:12px', 'bottom:12px', 'z-index:' + LAYER_Z.ownGui,
      'width:min(560px,calc(100vw - 24px))', 'max-height:60vh', 'overflow:auto',
      'padding:10px 12px', 'border-radius:10px',
      'border:1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.18))',
      'background:var(--dsw-alias-bg-overlay, #fff)',
      'color:var(--dsw-alias-label-primary, #111)',
      'font:12px/1.5 Consolas,Menlo,monospace',
      'box-shadow:0 8px 28px rgba(0,0,0,.28)',
      'transition:background-color 320ms ease,color 320ms ease,border-color 320ms ease,box-shadow 320ms ease',
    ].join(';')
    var head = document.createElement('div')
    head.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:6px'
    var title = document.createElement('strong')
    title.textContent = 'DSH UI Beautify · 诊断'
    title.style.cssText = 'flex:1;font-size:13px'
    head.appendChild(title)
    var close = document.createElement('button')
    close.type = 'button'
    close.textContent = '关闭'
    close.style.cssText = 'cursor:pointer;padding:2px 10px;border-radius:6px;border:1px solid currentColor;background:transparent;color:inherit;font:inherit'
    close.addEventListener('click', function (event) {
      event.stopPropagation()
      closeDiag()
    })
    head.appendChild(close)
    box.appendChild(head)
    var pre = document.createElement('pre')
    pre.style.cssText = 'margin:0;white-space:pre-wrap;word-break:break-all;-webkit-user-select:text;user-select:text'
    pre.textContent = diagLines()
    box.appendChild(pre)
    ;['click', 'mousedown', 'pointerdown', 'keydown'].forEach(function (type) {
      box.addEventListener(type, function (event) {
        event.stopPropagation()
      })
    })
    ;(document.body || document.documentElement).appendChild(box)
    state.diagEl = box
    return box
  }

  function closeDiag() {
    var box = state.diagEl
    state.diagEl = null
    if (box && box.parentNode) safe(function () {
      box.parentNode.removeChild(box)
    })
  }

  function refreshDiag() {
    if (!state.diagEl) return
    safe(function () {
      var pre = state.diagEl.querySelector('pre')
      if (pre) pre.textContent = diagLines()
    })
  }

  // ── 切换器面板（纯鼠标操作，不需要地址栏、不需要控制台） ──────────────────
  /**
   * 切换器只展示三个按钮（用户指定的顺序）：
   *   - 关闭   → off：一切恢复默认
   *   - 纹理   → multiply：乘法混合，白底处文字不受影响
   *   - 背景   → backdrop（0.3.0 起）：图真正垫底，文字/面板都在图上
   */
  var MODE_BUTTONS = [
    { mode: 'off', label: '关闭', hint: '一切恢复默认' },
    { mode: 'multiply', label: '纹理', hint: '乘法混合，白底处文字不受影响' },
    { mode: 'backdrop', label: '背景', hint: '图真正垫底，文字/面板都在图上' },
  ]

  /** 动态「开发中」定位参考线：实时显示四个锚点将影响的位置（工具打开或开关打开时显示）。 */
  function loadDynamicGuides() {
    var raw = safe(function () {
      return window.localStorage.getItem(GUIDES_KEY)
    }, null)
    return raw === '1'
  }

  function saveDynamicGuides() {
    safe(function () {
      window.localStorage.setItem(GUIDES_KEY, state.dynamicGuides ? '1' : '0')
    })
  }

  function guideRectOf(el) {
    return safe(function () {
      if (!el || !el.getBoundingClientRect) return null
      var r = el.getBoundingClientRect()
      if (!r || (!r.width && !r.height)) return null
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left, top: r.top, w: r.width, h: r.height }
    }, null)
  }

  function guideLine(el, from, to, color) {
    var dx = to.x - from.x
    var dy = to.y - from.y
    var len = Math.sqrt(dx * dx + dy * dy)
    var angle = (Math.atan2(dy, dx) * 180) / Math.PI
    el.style.left = Math.round(from.x) + 'px'
    el.style.top = Math.round(from.y) + 'px'
    el.style.width = Math.round(len) + 'px'
    el.style.borderTopColor = color || 'rgba(57,100,254,.85)'
    el.style.transform = 'rotate(' + angle + 'deg)'
  }

  function dynamicGuideTargets() {
    var out = { bubble: null, think: [] }
    safe(function () {
      var composer = findComposerCard()
      var cardRect = guideRectOf(composer)
      var bubbles = state.frostBubbles || []
      for (var i = bubbles.length - 1; i >= 0; i--) {
        var br = guideRectOf(bubbles[i])
        if (br) {
          out.bubble = { x: br.x, y: br.y, label: '输入气泡目标' }
          break
        }
      }
      if (!out.bubble && cardRect) out.bubble = { x: cardRect.x, y: cardRect.y - cardRect.h / 2, label: '输入气泡目标' }
      var steps = document.querySelectorAll(AI_STEP_SELECTOR)
      for (var s = 0; s < steps.length && out.think.length < 2; s++) {
        var r = guideRectOf(steps[s])
        if (r) out.think.push({ x: r.left + 10, y: r.top + 8, label: '思考链起点' + (out.think.length + 1) })
      }
      if (!out.think.length && cardRect) out.think = [{ x: cardRect.left + 20, y: cardRect.top - 140, label: '思考链起点1' }, { x: cardRect.left + 20, y: cardRect.top - 80, label: '思考链起点2' }]
    })
    return out
  }

  function removeAnchorGuides() {
    if (state.guideTimer !== null) {
      clearInterval(state.guideTimer)
      state.guideTimer = null
    }
    var node = state.guideNode
    state.guideNode = null
    safe(function () {
      if (node && node.parentNode) node.parentNode.removeChild(node)
    })
  }

  function updateAnchorGuides() {
    if (state.modeGroup !== 'dynamic') { removeAnchorGuides(); return }
    var show = state.dynamicGuides || !!state.anchorTool
    if (!show) { removeAnchorGuides(); return }
    var node = state.guideNode
    if (!node) {
      node = document.createElement('div')
      node.id = '__dshui-anchor-guides'
      node.setAttribute('data-dshui-ignore', '')
      node.style.cssText = 'position:fixed;inset:0;z-index:' + (LAYER_Z.ownGui - 1) + ';pointer-events:none'
      ;(document.body || document.documentElement).appendChild(node)
      state.guideNode = node
    }
    var vp = anchorViewport()
    var a = anchorsSnapshot()
    var targets = dynamicGuideTargets()
    safe(function () {
      node.textContent = ''
      var make = function (cls, css) {
        var el = document.createElement('div')
        if (cls) el.className = cls
        if (css) el.style.cssText = css
        node.appendChild(el)
        return el
      }
      // 背景变化：锚点处两圈脉冲 + 标签
      make('__dshui-guide-ring', 'left:' + Math.round(a.bg.x * vp.w) + 'px;top:' + Math.round(a.bg.y * vp.h) + 'px')
      make('__dshui-guide-ring r2', 'left:' + Math.round(a.bg.x * vp.w) + 'px;top:' + Math.round(a.bg.y * vp.h) + 'px')
      make('__dshui-guide-label', 'left:' + Math.round(a.bg.x * vp.w) + 'px;top:' + Math.round(a.bg.y * vp.h - 44) + 'px').textContent = '背景变化'
      // 输入气泡：锚点处幽灵气泡 + 指向真实输入区域的虚线
      var ghost = make('__dshui-guide-ghost', '')
      ghost.style.left = Math.round(a.bubble.x * vp.w) + 'px'
      ghost.style.top = Math.round(a.bubble.y * vp.h) + 'px'
      ghost.textContent = '输入气泡（起点）'
      if (targets.bubble) {
        var bl = make('__dshui-guide-line', '')
        guideLine(bl, { x: a.bubble.x * vp.w, y: a.bubble.y * vp.h }, targets.bubble)
        make('__dshui-guide-label', 'left:' + Math.round(targets.bubble.x) + 'px;top:' + Math.round(targets.bubble.y - 18) + 'px').textContent = targets.bubble.label
      }
      // 思考链两个起点：各自锚点连线到当前思维链前两行
      var thinkDefs = [{ key: 'thinkA', label: '思考链起点A' }, { key: 'thinkB', label: '思考链起点B' }]
      for (var i = 0; i < thinkDefs.length; i++) {
        var def = thinkDefs[i]
        var from = { x: a[def.key].x * vp.w, y: a[def.key].y * vp.h }
        make('__dshui-guide-label', 'left:' + Math.round(from.x) + 'px;top:' + Math.round(from.y - 16) + 'px').textContent = def.label
        if (targets.think[i]) {
          var tl = make('__dshui-guide-line', '')
          guideLine(tl, from, targets.think[i])
          make('__dshui-guide-label', 'left:' + Math.round(targets.think[i].x) + 'px;top:' + Math.round(targets.think[i].y - 12) + 'px').textContent = targets.think[i].label
        }
      }
    })
    if (state.guideTimer === null) {
      state.guideTimer = setInterval(function () {
        safe(updateAnchorGuides)
      }, 700)
    }
  }

  function syncAnchorGuides() {
    safe(function () {
      if (state.modeGroup === 'dynamic' && (state.dynamicGuides || state.anchorTool)) updateAnchorGuides()
      else removeAnchorGuides()
    })
  }

  function setDynamicGuides(on) {
    state.dynamicGuides = on !== false
    saveDynamicGuides()
    syncAnchorGuides()
    if (state.switcherEl) reRenderSwitcher()
    refreshDiag()
    return state.dynamicGuides
  }


  /* ── 动态模式三阶段分镜（0.8.24）───────────────────────────────────────
   * 设计器坐标：16:9 画布百分比，宽度基准等比映射到真实视口。
   * 思考中：壁纸按 thinking.backgroundTransform 放大/平移；当前轮的用户气泡、
   * 思考链容器、输入卡片 + 发送键按 thinking.boxes 做真实 DOM transform。
   * 开始输出 / 新会话：全部恢复 idle 布局。
   * 滚轮：思考分镜态任意滚轮先退出分镜；退出后滚离底部再回到底部并上滑恢复分镜。
   */
  var DYNAMIC_TRANSITION_MS = 860
  // 0.8.33：放大壁纸会导致整屏发灰/发糊，先关闭背景缩放，保留清晰背景。
  var DYNAMIC_BG_ZOOM_ENABLED = false
  var DYNAMIC_EASE = 'cubic-bezier(.22,.9,.24,1)'

  function dynamicIsPhase(id) {
    return id === 'idle' || id === 'thinking' || id === 'output'
  }
  function dynamicFinite(value, fallback, min, max) {
    var n = Number(value)
    if (!isFinite(n)) n = Number(fallback)
    if (!isFinite(n)) n = 0
    return Math.min(max, Math.max(min, n))
  }
  function dynamicClone(value) {
    return JSON.parse(JSON.stringify(value))
  }
  function dynamicLayoutDefaults() {
    return dynamicClone(DYNAMIC_LAYOUT_DEFAULT)
  }
  function dynamicBoxOf(phase, id) {
    var ph = state.dynamicLayout && state.dynamicLayout.phases ? state.dynamicLayout.phases[phase] : null
    if (!ph || !ph.boxes) return null
    var list = ph.boxes
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === id) return list[i]
    }
    return null
  }
  function normalizeDynamicLayout(data) {
    var def = dynamicLayoutDefaults()
    var out = { version: 2, activePhase: 'idle', phases: {} }
    var ids = ['idle', 'thinking', 'output']
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i]
      var src = (data && data.phases && data.phases[id]) || {}
      var fb = def.phases[id] || def.phases.idle
      var tr = src.backgroundTransform || {}
      var ftr = fb.backgroundTransform || { x: 0, y: 0, scale: 1 }
      var boxes = []
      var srcBoxes = Array.isArray(src.boxes) && src.boxes.length ? src.boxes : fb.boxes
      for (var b = 0; b < srcBoxes.length; b++) {
        var box = srcBoxes[b]
        if (!box || !box.id) continue
        boxes.push({
          id: String(box.id),
          label: String(box.label || box.id),
          kind: String(box.kind || 'ui'),
          x: dynamicFinite(box.x, 0, 0, 100),
          y: dynamicFinite(box.y, 0, 0, 100),
          w: dynamicFinite(box.w, 10, 1, 100),
          h: dynamicFinite(box.h, 10, 1, 100),
        })
      }
      // 缺哪块就补默认，保证三块目标元素总能找到坐标。
      var need = ['composer', 'bubble', 'thinking']
      for (var n = 0; n < need.length; n++) {
        var found = false
        for (var k = 0; k < boxes.length; k++) if (boxes[k].id === need[n]) found = true
        if (!found) {
          for (var d = 0; d < fb.boxes.length; d++) if (fb.boxes[d].id === need[n]) boxes.push(fb.boxes[d])
        }
      }
      out.phases[id] = {
        background: src.background === 'dark' ? 'dark' : 'light',
        backgroundTransform: {
          x: dynamicFinite(tr.x, ftr.x, -400, 400),
          y: dynamicFinite(tr.y, ftr.y, -400, 400),
          scale: dynamicFinite(tr.scale, ftr.scale, 0.2, 6),
        },
        boxes: boxes,
      }
    }
    return out
  }
  function loadDynamicLayout() {
    var raw = safe(function () { return window.localStorage.getItem(DYNAMIC_LAYOUT_KEY) }, null)
    if (raw) {
      try {
        return normalizeDynamicLayout(JSON.parse(raw))
      } catch (err) {}
    }
    return normalizeDynamicLayout(dynamicLayoutDefaults())
  }
  function saveDynamicLayout() {
    safe(function () {
      window.localStorage.setItem(DYNAMIC_LAYOUT_KEY, JSON.stringify(state.dynamicLayout))
    })
  }
  function dynamicSnapshot() {
    return {
      phase: state.dynamicPhase,
      cinematic: !!state.dynamicCinematic,
      suspended: !!state.dynamicSuspended,
      preview: !!state.dynamicPreview,
      layout: state.dynamicLayout ? dynamicClone(state.dynamicLayout) : null,
    }
  }

  function dynamicDesignRect(box) {
    if (!box) return null
    var W = window.innerWidth || 1
    var H = W * 9 / 16
    return {
      x: (box.x / 100) * W,
      y: (box.y / 100) * H,
      w: (box.w / 100) * W,
      h: (box.h / 100) * H,
    }
  }
  function dynamicLayerEls() {
    var out = []
    var layer = document.getElementById(LAYER_ID)
    var layer2 = document.getElementById(LAYER2_ID)
    if (layer) out.push(layer)
    if (layer2) out.push(layer2)
    return out
  }
  function dynamicUseSharpBackground(on) {
    safe(function () {
      var els = dynamicLayerEls()
      for (var i = 0; i < els.length; i++) {
        var el = els[i]
        if (on) {
          if (el.__dshuiDynBgSaved === undefined) el.__dshuiDynBgSaved = el.style.backgroundImage || ''
          var name = String(state.imageName || '').toLowerCase()
          var dark = safe(function () { return isDarkTheme() }, false)
          var ok = dark ? (!name || /暗夜|dark/.test(name)) : (!name || /4k|deepseek/.test(name))
          if (!ok) continue
          el.style.backgroundImage = 'url("' + (dark ? DYNAMIC_BG_DARK_URL : DYNAMIC_BG_LIGHT_URL) + '")'
        } else if (el.__dshuiDynBgSaved !== undefined) {
          el.style.backgroundImage = el.__dshuiDynBgSaved
          delete el.__dshuiDynBgSaved
        }
      }
    })
  }
  function dynamicApplyBackground(phase) {
    if (!DYNAMIC_BG_ZOOM_ENABLED) return
    var ph = state.dynamicLayout && state.dynamicLayout.phases ? state.dynamicLayout.phases[phase] : null
    if (!ph) return
    var tr = ph.backgroundTransform || { x: 0, y: 0, scale: 1 }
    var els = dynamicLayerEls()
    for (var i = 0; i < els.length; i++) {
      var el = els[i]
      if (!state.dynamicBgOrig && !el.__dshuiOrigTransform) {
        el.__dshuiOrigTransform = el.style.transform || ''
        el.__dshuiOrigTransition = el.style.transition || ''
        el.__dshuiOrigOrigin = el.style.transformOrigin || ''
      }
      el.style.transition = 'transform ' + DYNAMIC_TRANSITION_MS + 'ms ' + DYNAMIC_EASE
      el.style.transformOrigin = '50% 50%'
      el.style.transform = 'translate(' + tr.x + '%, ' + tr.y + '%) scale(' + tr.scale + ')'
    }
  }
  function dynamicRestoreBackground() {
    var els = dynamicLayerEls()
    for (var i = 0; i < els.length; i++) {
      var el = els[i]
      if (el.__dshuiOrigTransform === undefined) continue
      var orig = el.__dshuiOrigTransform
      var trans = el.__dshuiOrigTransition || ''
      var origin = el.__dshuiOrigOrigin || ''
      el.style.transition = 'transform 620ms ' + DYNAMIC_EASE
      el.style.transform = orig || ''
      ;(function (target, t, o) {
        setTimeout(function () {
          if (!state.dynamicCinematic) {
            target.style.transition = t
            target.style.transformOrigin = o
          }
        }, 700)
      })(el, trans, origin)
      delete el.__dshuiOrigTransform
      delete el.__dshuiOrigTransition
      delete el.__dshuiOrigOrigin
    }
  }

  function dynamicMeasure(el) {
    if (!el) return null
    var st = el.style
    var prevT = st.transform
    var prevTr = st.transition
    var prevW = st.willChange
    var prevO = st.transformOrigin
    st.transition = 'none'
    st.transform = 'none'
    var rect = null
    try { rect = el.getBoundingClientRect() } catch (err) { rect = null }
    st.transform = prevT
    st.transition = prevTr
    st.willChange = prevW
    st.transformOrigin = prevO
    if (!rect || (!rect.width && !rect.height)) return null
    return rect
  }
  function dynamicApplyBox(entry, box) {
    var el = entry.el
    var target = dynamicDesignRect(box)
    if (!el || !target) return
    var rect = dynamicMeasure(el)
    if (!rect) return
    if (!entry.orig) {
      entry.orig = {
        transform: el.style.transform || '',
        transition: el.style.transition || '',
        transformOrigin: el.style.transformOrigin || '',
        willChange: el.style.willChange || '',
        width: el.style.width || '',
        height: el.style.height || '',
        maxWidth: el.style.maxWidth || '',
        whiteSpace: el.style.whiteSpace || '',
        overflowWrap: el.style.overflowWrap || '',
      }
    }
    var cx = rect.left + rect.width / 2
    var cy = rect.top + rect.height / 2
    var tx = target.x + target.w / 2
    var ty = target.y + target.h / 2
    var dx = tx - cx
    var dy = ty - cy
    if (box && box.id === 'bubble') {
      el.style.maxWidth = Math.round(target.w) + 'px'
      el.style.whiteSpace = 'normal'
      el.style.overflowWrap = 'anywhere'
    }
    el.style.transformOrigin = '50% 50%'
    el.style.willChange = 'transform,width,height'
    el.style.transform = 'translate(' + dx.toFixed(2) + 'px,' + dy.toFixed(2) + 'px)'
    el.style.transition = 'transform ' + DYNAMIC_TRANSITION_MS + 'ms ' + DYNAMIC_EASE
  }
  function dynamicRestoreBoxes() {
    var managed = state.dynamicManaged || []
    for (var i = 0; i < managed.length; i++) {
      ;(function (entry) {
        var el = entry.el
        if (!el || !entry.orig) return
        var orig = entry.orig
        el.style.transition = 'transform 620ms ' + DYNAMIC_EASE
        el.style.transform = orig.transform || ''
        setTimeout(function () {
          if (!state.dynamicCinematic) {
            el.style.transition = orig.transition
            el.style.transformOrigin = orig.transformOrigin
            el.style.willChange = orig.willChange
            el.style.transform = orig.transform
            el.style.width = orig.width || ''
            el.style.height = orig.height || ''
            el.style.maxWidth = orig.maxWidth || ''
            el.style.whiteSpace = orig.whiteSpace || ''
            el.style.overflowWrap = orig.overflowWrap || ''
          }
        }, 700)
      })(managed[i])
    }
    state.dynamicManaged = []
  }

  function dynamicTurnContext() {
    var allUsers = safe(function () {
      return Array.prototype.slice.call(document.querySelectorAll('[data-chat-flow-kind="user"]'))
    }, [])
    var lastUser = allUsers.length ? allUsers[allUsers.length - 1] : null
    var ctx = { lastUser: lastUser, thinking: null, reply: null, key: '' }
    if (!lastUser) return ctx
    ctx.key = String(lastUser.getAttribute('data-chat-turn') || '') + ':' +
      String(lastUser.getAttribute('data-chat-flow-key') || '')
    var items = safe(function () {
      return Array.prototype.slice.call(document.querySelectorAll('[data-chat-flow-key]'))
    }, [])
    var start = -1
    for (var i = 0; i < items.length; i++) if (items[i] === lastUser) start = i
    if (start === -1) return ctx
    for (var j = start + 1; j < items.length; j++) {
      var item = items[j]
      if (!item || !item.getAttribute) continue
      var kind = item.getAttribute('data-chat-flow-kind') || ''
      if (!kind) {
        if (item.textContent && item.textContent.replace(/\s+/g, '').length > 0) {
          ctx.reply = item
          break
        }
        continue
      }
      if (kind === 'user') break
      if (!ctx.thinking) {
        var candidate = null
        if (kind === 'turn-process') candidate = item
        else if (item.querySelector) {
          candidate = item.querySelector('[data-step-process]') || item.querySelector('[data-chat-group-part="reasoning"]')
        }
        if (!candidate && item.querySelector) candidate = item.querySelector('[data-step-process]')
        if (!candidate && item.matches && item.matches('[data-step-process]')) candidate = item
        if (candidate) {
          var r = null
          try { r = candidate.getBoundingClientRect() } catch (err) {}
          if (r && (r.width || r.height)) ctx.thinking = candidate
          else if (!ctx.thinkingFallback) ctx.thinkingFallback = candidate
        }
      }
      if (ctx.reply) break
    }
    if (!ctx.thinking) ctx.thinking = ctx.thinkingFallback || null
    return ctx
  }
  function dynamicDetectPhase() {
    var ctx = dynamicTurnContext()
    if (!ctx.lastUser) return 'idle'
    if (ctx.reply) return 'output'
    if (ctx.thinking) return 'thinking'
    return 'idle'
  }
  function dynamicFindScrollable() {
    var list = ['.xz4KEq_scroll', '[data-conversation-scroll]', '.Dc7zOa_scrollBody', '.Dc7zOa_body']
    for (var i = 0; i < list.length; i++) {
      var el = document.querySelector(list[i])
      if (!el) continue
      if (el.scrollHeight > el.clientHeight + 4) return el
    }
    return null
  }
  function dynamicAtScrollBottom() {
    var el = dynamicFindScrollable()
    if (!el) return true
    return el.scrollTop + el.clientHeight >= el.scrollHeight - 28
  }
  function dynamicVisible(el) {
    if (!el || !el.getBoundingClientRect) return null
    var rect = null
    try { rect = el.getBoundingClientRect() } catch (err) { return null }
    if (!rect || rect.width < 8 || rect.height < 8) return null
    var style = null
    try { style = window.getComputedStyle(el) } catch (err) {}
    if (style && (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0)) return null
    return rect
  }
  function dynamicPickComposer() {
    var list = safe(function () { return document.querySelectorAll('[data-composer-card]') }, [])
    var best = null
    var bestScore = -1
    for (var i = 0; i < list.length; i++) {
      var el = list[i]
      var rect = dynamicVisible(el)
      if (!rect) continue
      // 优先选靠下的那个（真正输入区），其次面积大的。
      var score = rect.top * 100000 + rect.width * rect.height
      if (score > bestScore) { bestScore = score; best = el }
    }
    if (best) return best
    return safe(function () { return document.querySelector('[data-composer-card]') }, null)
  }
  function dynamicPickBubble(lastUser) {
    if (!lastUser) return null
    var list = safe(function () { return lastUser.querySelectorAll('[class*="bubble"]') }, [])
    var best = null
    var bestArea = 0
    for (var i = 0; i < list.length; i++) {
      var rect = dynamicVisible(list[i])
      if (!rect) continue
      var area = rect.width * rect.height
      if (area > bestArea) { bestArea = area; best = list[i] }
    }
    return best || lastUser
  }
  function dynamicPickTranscript() {
    return (
      safe(function () { return document.querySelector('.Dc7zOa_viewArea') }, null) ||
      safe(function () { return document.querySelector('.xz4KEq_scroll') }, null) ||
      safe(function () { return document.querySelector('[data-conversation-scroll]') }, null)
    )
  }
  function dynamicTargetsFor(phase) {
    var ctx = dynamicTurnContext()
    var out = []
    var composer = dynamicPickComposer()
    if (composer) out.push({ el: composer, box: dynamicBoxOf(phase, 'composer'), mode: 'translate' })
    if (ctx.lastUser) {
      var bubble = dynamicPickBubble(ctx.lastUser)
      if (bubble) out.push({ el: bubble, box: dynamicBoxOf(phase, 'bubble'), mode: 'translate' })
    }
    if (ctx.thinking) out.push({ el: ctx.thinking, box: dynamicBoxOf(phase, 'thinking'), mode: 'translate' })
    return out.filter(function (entry) { return entry.el && entry.box })
  }
  var DYNAMIC_PREVIEW_ID = '__dshui-dynamic-preview'
  var DYNAMIC_CINEMA_ID = '__dshui-dynamic-cinema'
  function dynamicClearPreviewDemo() {
    safe(function () {
      var node = document.getElementById(DYNAMIC_PREVIEW_ID)
      if (node && node.parentNode) node.parentNode.removeChild(node)
    })
  }
  function dynamicClearCinema() {
    safe(function () {
      var node = document.getElementById(DYNAMIC_CINEMA_ID)
      if (node && node.parentNode) node.parentNode.removeChild(node)
    })
  }
  function dynamicDesignRectFor(el) {
    return el ? el.getBoundingClientRect() : null
  }
  function dynamicShowCinema() {
    if (state.modeGroup !== 'dynamic') return
    safe(function () {
      if (document.getElementById(DYNAMIC_CINEMA_ID)) return
      var node = document.createElement('div')
      node.id = DYNAMIC_CINEMA_ID
      node.setAttribute('data-dshui-ignore', '')
      node.style.cssText = 'position:fixed;inset:0;z-index:' + (LAYER_Z.ownGui - 2) +
        ';pointer-events:none;background:radial-gradient(ellipse at 50% 48%,rgba(0,0,0,0) 38%,rgba(4,7,13,.16) 78%,rgba(4,7,13,.34) 100%)'
      ;(document.body || document.documentElement).appendChild(node)
    })
  }
  function dynamicRenderPreviewDemo() {
    dynamicClearPreviewDemo()
    if (!state.dynamicPreview || state.modeGroup !== 'dynamic') return
    var layout = state.dynamicLayout && state.dynamicLayout.phases && state.dynamicLayout.phases.thinking
    if (!layout) return
    var node = document.createElement('div')
    node.id = DYNAMIC_PREVIEW_ID
    node.setAttribute('data-dshui-ignore', '')
    node.style.cssText = 'position:fixed;inset:0;z-index:' + (LAYER_Z.ownGui - 2) + ';pointer-events:none'
    var addBox = function (box, style, text) {
      if (!box) return
      var r = dynamicDesignRect(box)
      var el = document.createElement('div')
      el.textContent = text
      el.style.cssText = 'position:fixed;left:' + r.x + 'px;top:' + r.y + 'px;width:' + r.w + 'px;height:' + r.h +
        'px;pointer-events:none;box-sizing:border-box;display:flex;align-items:center;justify-content:center;' + style
      node.appendChild(el)
      var tag = document.createElement('div')
      tag.textContent = text
      tag.style.cssText = 'position:absolute;left:8px;top:6px;font:11px/1.3 system-ui,sans-serif;color:#e8eefc;' +
        'background:rgba(10,14,22,.72);border:1px solid rgba(255,255,255,.18);border-radius:5px;padding:1px 6px'
      el.textContent = ''
      el.appendChild(tag)
    }
    addBox(dynamicBoxOf('thinking', 'bubble'),
      'border:1px dashed rgba(134,239,172,.9);border-radius:12px;background:rgba(134,239,172,.14);',
      '输入者气泡 · 预览')
    addBox(dynamicBoxOf('thinking', 'thinking'),
      'border:1px dashed rgba(196,181,253,.9);border-radius:12px;background:rgba(196,181,253,.10);',
      '思考链区 · 预览')
    addBox(dynamicBoxOf('thinking', 'composer'),
      'border:1px dashed rgba(251,191,36,.9);border-radius:12px;background:rgba(251,191,36,.10);',
      '输入卡片 · 预览')
    ;(document.body || document.documentElement).appendChild(node)
  }
  function dynamicProbePayload() {
    var rectText = function (el) {
      if (!el) return null
      var r = dynamicVisible(el)
      return {
        tag: el.tagName,
        cls: String(el.className || '').slice(0, 120),
        rect: r ? [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] : null,
        transform: String(el.style && el.style.transform || '').slice(0, 160),
      }
    }
    var composers = safe(function () { return Array.prototype.slice.call(document.querySelectorAll('[data-composer-card]')) }, [])
    var ctx = dynamicTurnContext()
    return {
      probe: 'dynamic',
      at: Date.now(),
      win: state.windowTag || '',
      version: VERSION,
      modeGroup: state.modeGroup,
      phase: state.dynamicPhase,
      cinematic: !!state.dynamicCinematic,
      preview: !!state.dynamicPreview,
      suspended: !!state.dynamicSuspended,
      viewport: [window.innerWidth || 0, window.innerHeight || 0],
      layoutThinking: state.dynamicLayout && state.dynamicLayout.phases ? state.dynamicLayout.phases.thinking : null,
      composers: composers.map(rectText),
      pickedComposer: rectText(dynamicPickComposer()),
      lastUser: rectText(ctx.lastUser),
      transcript: rectText(dynamicPickTranscript()),
      bubble: rectText(dynamicPickBubble(ctx.lastUser)),
      thinking: rectText(ctx.thinking),
      layers: dynamicLayerEls().map(rectText),
    }
  }
  function reportDynamicProbe() {
    safe(function () {
      var payload = dynamicProbePayload()
      fetch(PREFIX + '/diag?data=' + encodeURIComponent(JSON.stringify(payload)), {
        cache: 'no-store',
        credentials: 'same-origin',
      }).catch(function () {})
    })
  }
  function dynamicScrollToBottom() {
    safe(function () {
      var el = dynamicFindScrollable()
      if (!el) return
      if (state.dynamicScrollSaved == null) state.dynamicScrollSaved = el.scrollTop
      el.scrollTop = el.scrollHeight
    })
  }
  function dynamicRestoreScroll() {
    safe(function () {
      var el = dynamicFindScrollable()
      if (el && state.dynamicScrollSaved != null) el.scrollTop = state.dynamicScrollSaved
      state.dynamicScrollSaved = null
    })
  }
  function dynamicAllowOverflow() {
    safe(function () {
      if (state.dynamicOverflowSaved && state.dynamicOverflowSaved.length) return
      var ctx = dynamicTurnContext()
      var seeds = []
      if (ctx.lastUser) seeds.push(dynamicPickBubble(ctx.lastUser))
      if (ctx.thinking) seeds.push(ctx.thinking)
      seeds.push(dynamicPickComposer())
      seeds.push(dynamicPickTranscript())
      var saved = []
      var seen = []
      for (var i = 0; i < seeds.length; i++) {
        var node = seeds[i]
        while (node && node !== document.body && node !== document.documentElement) {
          if (seen.indexOf(node) === -1) {
            seen.push(node)
            var style = null
            try { style = window.getComputedStyle(node) } catch (err) {}
            if (style && (style.overflow !== 'visible' || style.overflowX !== 'visible' || style.overflowY !== 'visible')) {
              saved.push({
                el: node,
                overflow: node.style.overflow || '',
                overflowX: node.style.overflowX || '',
                overflowY: node.style.overflowY || '',
              })
              node.style.overflow = 'visible'
              node.style.overflowX = 'visible'
              node.style.overflowY = 'visible'
            }
          }
          node = node.parentElement
        }
      }
      state.dynamicOverflowSaved = saved
    })
  }
  function dynamicRestoreOverflow() {
    safe(function () {
      var saved = state.dynamicOverflowSaved || []
      for (var i = 0; i < saved.length; i++) {
        var item = saved[i]
        if (!item || !item.el) continue
        item.el.style.overflow = item.overflow
        item.el.style.overflowX = item.overflowX
        item.el.style.overflowY = item.overflowY
      }
      state.dynamicOverflowSaved = []
    })
  }
  function dynamicHideOldFlows() {
    safe(function () {
      var ctx = dynamicTurnContext()
      var keep = []
      if (ctx.lastUser) keep.push(ctx.lastUser)
      if (ctx.thinking) keep.push(ctx.thinking)
      if (!keep.length) return
      var items = Array.prototype.slice.call(document.querySelectorAll('[data-chat-flow-key], [data-chat-flow-kind="turn-tail"], [class*="turnTail"]'))
      var hidden = []
      for (var i = 0; i < items.length; i++) {
        var el = items[i]
        var isKeep = false
        for (var k = 0; k < keep.length; k++) {
          var node = keep[k]
          if (!node) continue
          if (node === el || (node.contains && node.contains(el)) || (el.contains && el.contains(node))) {
            isKeep = true
            break
          }
        }
        if (isKeep) continue
        if (el.closest && el.closest('[data-composer-card]')) continue
        if (!el.style) continue
        if (el.__dshuiDynHidden) continue
        el.__dshuiDynHidden = true
        hidden.push({
          el: el,
          opacity: el.style.opacity || '',
          visibility: el.style.visibility || '',
          pointerEvents: el.style.pointerEvents || '',
          transition: el.style.transition || '',
        })
        el.style.transition = 'opacity 260ms ease, visibility 260ms ease'
        el.style.opacity = '0'
        el.style.visibility = 'hidden'
        el.style.pointerEvents = 'none'
      }
      state.dynamicHiddenFlows = hidden
    })
  }
  function dynamicRestoreOldFlows() {
    safe(function () {
      var hidden = state.dynamicHiddenFlows || []
      for (var i = 0; i < hidden.length; i++) {
        var item = hidden[i]
        if (!item || !item.el) continue
        item.el.style.transition = item.transition
        item.el.style.opacity = item.opacity
        item.el.style.visibility = item.visibility
        item.el.style.pointerEvents = item.pointerEvents
        delete item.el.__dshuiDynHidden
      }
      state.dynamicHiddenFlows = []
    })
  }
  function dynamicApplyThinking() {
    var targets = dynamicTargetsFor('thinking')
    if (!targets.length) return
    var old = state.dynamicManaged || []
    // 元素集合变化时先把旧元素还原，再记录新元素。
    var same = old.length === targets.length
    if (same) {
      for (var i = 0; i < old.length; i++) if (old[i].el !== targets[i].el) same = false
    }
    if (!same) dynamicRestoreBoxes()
    state.dynamicManaged = targets
    for (var j = 0; j < targets.length; j++) dynamicApplyBox(targets[j], targets[j].box)
    dynamicApplyBackground('thinking')
    safe(caretSchedule)
  }
  function reportThinkingDebug() {
    safe(function () {
      setTimeout(function () {
        safe(function () {
          var layer = document.getElementById(LAYER_ID)
          var layer2 = document.getElementById(LAYER2_ID)
          var info = function (el) {
            if (!el) return null
            var cs = null
            try { cs = window.getComputedStyle(el) } catch (err) {}
            return {
              inlineTransform: String(el.style.transform || ''),
              computedTransform: cs ? String(cs.transform || '') : '',
              inlineBg: String(el.style.backgroundImage || '').slice(0, 80),
              opacity: cs ? String(cs.opacity || '') : '',
              filter: cs ? String(cs.filter || '') : '',
              backdropFilter: cs ? String(cs.backdropFilter || cs.webkitBackdropFilter || '') : '',
              willChange: cs ? String(cs.willChange || '') : '',
            }
          }
          var frost = []
          var nodes = document.querySelectorAll('*')
          for (var i = 0; i < nodes.length && frost.length < 8; i++) {
            var cs = null
            try { cs = window.getComputedStyle(nodes[i]) } catch (err) { cs = null }
            var bf = cs ? String(cs.backdropFilter || cs.webkitBackdropFilter || '') : ''
            if (bf && bf !== 'none') frost.push({ tag: nodes[i].tagName, cls: String(nodes[i].className || '').slice(0, 60), bf: bf.slice(0, 100) })
          }
          var payload = {
            probe: 'thinking-debug', at: Date.now(), version: VERSION,
            preview: !!state.dynamicPreview, phase: state.dynamicPhase,
            viewport: [window.innerWidth || 0, window.innerHeight || 0],
            layer: info(layer), layer2: info(layer2),
            hiddenFlows: (state.dynamicHiddenFlows || []).length,
            overflowSaved: (state.dynamicOverflowSaved || []).length,
            frostSurfaces: frost,
            demo: !!document.getElementById('__dshui-dynamic-preview'),
            cinema: !!document.getElementById('__dshui-dynamic-cinema'),
          }
          fetch(PREFIX + '/diag?data=' + encodeURIComponent(JSON.stringify(payload)), { cache: 'no-store', credentials: 'same-origin' }).catch(function () {})
        })
      }, 500)
    })
  }

  function dynamicEnterThinking(force) {
    if (!state.dynamicLayout) state.dynamicLayout = loadDynamicLayout()
    if (state.dynamicCinematic) return
    state.dynamicThinkingSeenAt = Date.now()
    state.dynamicPhase = 'thinking'
    state.dynamicCinematic = true
    safe(function () {
      if (document.body) document.body.classList.add('__dshui-dynamic-thinking')
    })
    // 0.8.30：思考态先把旧消息移出界面，只留「上方气泡 / 中间思考链 / 下方输入卡片」。
    dynamicUseSharpBackground(true)
    dynamicAllowOverflow()
    dynamicHideOldFlows()
    dynamicScrollToBottom()
    // 分区排版：气泡/思考链/输入卡片都只平移，不缩放、不改尺寸；进入时只计算一次。
    dynamicApplyThinking()
    dynamicClearCinema()
    safe(reportThinkingDebug)
    if (state.dynamicPreview) dynamicRenderPreviewDemo()
    safe(caretSchedule)
    refreshDiag()
    safe(function () { setTimeout(function () { safe(reportDynamicProbe) }, 1100) })
  }
  function dynamicExitThinking(restorePhase) {
    var was = state.dynamicCinematic
    state.dynamicCinematic = false
    state.dynamicPhase = dynamicIsPhase(restorePhase) ? restorePhase : state.dynamicPhase
    safe(function () {
      if (document.body) document.body.classList.remove('__dshui-dynamic-thinking')
    })
    dynamicRestoreBoxes()
    dynamicRestoreOldFlows()
    dynamicRestoreOverflow()
    dynamicRestoreScroll()
    dynamicUseSharpBackground(false)
    dynamicRestoreBackground()
    // 0.8.34 兜底：无论哪条路径退出，都把残留的分区/隐藏标记清掉。
    safe(function () {
      state.dynamicPreview = false
      dynamicClearPreviewDemo()
      dynamicClearCinema()
      state.dynamicHiddenFlows = []
      state.dynamicOverflowSaved = []
      state.dynamicManaged = []
      state.dynamicCinematic = false
      if (document.body) document.body.classList.remove('__dshui-dynamic-thinking')
    })
    if (!state.dynamicPreview) dynamicClearPreviewDemo()
    dynamicClearCinema()
    safe(caretSchedule)
    if (was) refreshDiag()
  }
  function evaluateDynamicEngine() {
    if (!state.installed) return
    if (state.modeGroup !== 'dynamic') return
    if (state.dynamicPreview) {
      if (!state.dynamicCinematic) dynamicEnterThinking(true)
      else safe(dynamicHideOldFlows)
      return
    }
    var ctx = dynamicTurnContext()
    var key = ctx.key || ''
    if (key !== state.dynamicTurnKey) {
      if (state.dynamicCinematic) dynamicExitThinking('idle')
      state.dynamicTurnKey = key
      state.dynamicSuspended = false
      state.dynamicReenterArmed = false
    }
    var now = Date.now()
    if (!ctx.lastUser) {
      state.dynamicPhase = 'idle'
      if (state.dynamicCinematic) dynamicExitThinking('idle')
      return
    }
    if (ctx.reply) {
      state.dynamicPhase = 'output'
      if (state.dynamicCinematic) dynamicExitThinking('output')
      return
    }
    if (ctx.thinking) {
      state.dynamicPhase = 'thinking'
      state.dynamicThinkingSeenAt = now
      if (state.dynamicSuspended) return
      if (!state.dynamicCinematic) dynamicEnterThinking()
      else { dynamicMaybeRefreshTargets(); safe(dynamicHideOldFlows) }
      return
    }
    // 思考节点在 DSH 里可能瞬间被替换/暂时消失：先驻留 5s，避免反复进出导致乱跳。
    if (state.dynamicCinematic) {
      if (now - state.dynamicThinkingSeenAt < 5000) {
        state.dynamicPhase = 'thinking'
        return
      }
      dynamicExitThinking('idle')
      return
    }
    state.dynamicPhase = 'idle'
  }
  function dynamicMaybeRefreshTargets() {
    // 0.8.29：思考分镜一旦进入就固定，不在流式 DOM 更新时重算（防抖/防乱跳）。
    return
  }
  function scheduleDynamicEvaluate(delay) {
    if (state.dynamicTimer !== null) return
    state.dynamicTimer = setTimeout(function () {
      state.dynamicTimer = null
      safe(evaluateDynamicEngine)
    }, delay == null ? 120 : delay)
  }
  function startDynamicEngine() {
    if (state.dynamicEngineStarted) return
    state.dynamicEngineStarted = true
    if (!state.dynamicLayout) state.dynamicLayout = loadDynamicLayout()
    safe(function () {
      if (typeof MutationObserver !== 'function' || !document.body) return
      var observer = new MutationObserver(function () { scheduleDynamicEvaluate(120) })
      observer.observe(document.body, { childList: true, subtree: true, characterData: true })
      state.dynamicObserver = observer
    })
    safe(function () {
      document.addEventListener('wheel', onDynamicWheel, { capture: true, passive: false })
      window.addEventListener('scroll', onDynamicScroll, true)
      window.addEventListener('resize', dynamicRefreshPreview)
    })
    safe(function () {
      state.dynamicWatchTimer = setInterval(function () {
        safe(function () {
          dynamicRefreshScroll()
          scheduleDynamicEvaluate(0)
        })
      }, 1200)
    })
    safe(function () { setTimeout(function () { safe(evaluateDynamicEngine) }, 0) })
  }
  function stopDynamicEngine() {
    state.dynamicEngineStarted = false
    if (state.dynamicObserver) {
      safe(function () { state.dynamicObserver.disconnect() })
      state.dynamicObserver = null
    }
    if (state.dynamicTimer !== null) {
      clearTimeout(state.dynamicTimer)
      state.dynamicTimer = null
    }
    if (state.dynamicWatchTimer) {
      clearInterval(state.dynamicWatchTimer)
      state.dynamicWatchTimer = null
    }
    safe(function () {
      document.removeEventListener('wheel', onDynamicWheel, { capture: true, passive: false })
      window.removeEventListener('scroll', onDynamicScroll, true)
      window.removeEventListener('resize', dynamicRefreshPreview)
    })
    safe(function () {
      state.dynamicPreview = false
      state.dynamicSuspended = false
      state.dynamicReenterArmed = false
      dynamicClearPreviewDemo()
      dynamicClearCinema()
      dynamicRestoreOldFlows()
      dynamicRestoreOverflow()
      dynamicExitThinking('idle')
    })
  }
  function dynamicRefreshPreview() {
    if (state.dynamicPreview) { dynamicRenderPreviewDemo(); }
  }
  function dynamicRefreshScroll() {
    if (state.modeGroup !== 'dynamic') return
    if (state.dynamicSuspended && !dynamicAtScrollBottom()) state.dynamicReenterArmed = true
  }
  function onDynamicScroll(event) {
    safe(dynamicRefreshScroll)
  }
  function onDynamicWheel(event) {
    if (state.modeGroup !== 'dynamic') return
    var phase = state.dynamicPreview ? 'thinking' : dynamicDetectPhase()
    if (phase !== 'thinking') return
    if (state.dynamicCinematic) {
      if (event) {
        event.preventDefault()
        event.stopPropagation()
      }
      state.dynamicSuspended = true
      state.dynamicReenterArmed = false
      state.dynamicPreview = false
      dynamicExitThinking('thinking')
      return
    }
    if (state.dynamicSuspended && state.dynamicReenterArmed && dynamicAtScrollBottom()) {
      if (event && event.deltaY < 0) {
        event.preventDefault()
        event.stopPropagation()
        state.dynamicSuspended = false
        state.dynamicReenterArmed = false
        dynamicEnterThinking()
      }
    }
  }
  function setDynamicPreview(on) {
    state.dynamicPreview = !!on
    if (!state.dynamicPreview) { dynamicClearPreviewDemo(); dynamicClearCinema() }
    if (state.dynamicPreview) {
      state.dynamicSuspended = false
      state.dynamicReenterArmed = false
      dynamicEnterThinking(true)
    } else {
      dynamicExitThinking('idle')
    }
    if (state.switcherEl) reRenderSwitcher()
    refreshDiag()
    return state.dynamicPreview
  }
  function importDynamicLayout(text) {
    var parsed = JSON.parse(text)
    state.dynamicLayout = normalizeDynamicLayout(parsed)
    saveDynamicLayout()
    state.dynamicSuspended = false
    state.dynamicReenterArmed = false
    if (state.dynamicCinematic) dynamicExitThinking('idle')
    dynamicExitThinking('idle')
    safe(function () { setTimeout(function () { safe(evaluateDynamicEngine) }, 0) })
    if (state.switcherEl) reRenderSwitcher()
    refreshDiag()
    return dynamicSnapshot()
  }
  function resetDynamicLayout() {
    state.dynamicLayout = normalizeDynamicLayout(dynamicLayoutDefaults())
    safe(function () {
      window.localStorage.removeItem(DYNAMIC_LAYOUT_KEY)
    })
    if (state.dynamicCinematic) dynamicExitThinking('idle')
    safe(function () { setTimeout(function () { safe(evaluateDynamicEngine) }, 0) })
    if (state.switcherEl) reRenderSwitcher()
    refreshDiag()
    return dynamicSnapshot()
  }

  /** 动态「开发中」定位工具：四个锚点可拖动、可保存（视口百分比）。 */
  var ANCHORS_ID = '__dshui-anchors'
  function anchorPercent(value) {
    return Math.round(clampAnchor(value) * 1000) / 10
  }

  function anchorViewport() {
    return { w: window.innerWidth || 1, h: window.innerHeight || 1 }
  }

  function positionAnchorMarker(id) {
    var tool = state.anchorTool
    if (!tool || !tool.markers[id]) return
    var item = state.dynamicAnchors[id]
    var vp = anchorViewport()
    var marker = tool.markers[id]
    marker.style.left = Math.round(item.x * vp.w) + 'px'
    marker.style.top = Math.round(item.y * vp.h) + 'px'
    var label = marker.querySelector('span')
    if (label) label.textContent = id + ' · ' + anchorPercent(item.x) + '% , ' + anchorPercent(item.y) + '%'
    safe(updateAnchorGuides)
  }

  function positionAllAnchors() {
    for (var i = 0; i < ANCHOR_DEFS.length; i++) positionAnchorMarker(ANCHOR_DEFS[i].id)
  }

  function closeAnchorTool(discard) {
    var tool = state.anchorTool
    if (!tool) return false
    state.anchorTool = null
    if (discard) {
      var loaded = loadAnchors()
      state.dynamicAnchors = loaded || defaultAnchors()
    }
    safe(function () {
      for (var i = 0; i < tool.listeners.length; i++) tool.listeners[i]()
      if (tool.node && tool.node.parentNode) tool.node.parentNode.removeChild(tool.node)
    })
    refreshDiag()
    return true
  }

  function openAnchorTool() {
    if (state.anchorTool) return false
    if (state.modeGroup !== 'dynamic') applyGroup('dynamic')
    if (!state.dynamicAnchors) state.dynamicAnchors = defaultAnchors()
    var tool = { node: null, markers: {}, listeners: [] }
    var node = document.createElement('div')
    node.id = ANCHORS_ID
    node.setAttribute('data-dshui-ignore', '')
    node.style.cssText = [
      'position:fixed','inset:0','z-index:' + LAYER_Z.ownGui,
      'background:transparent','pointer-events:none',
    ].join(';')
    var bar = document.createElement('div')
    bar.style.cssText = ['position:fixed','left:50%','top:18px','transform:translateX(-50%)',
      'z-index:' + LAYER_Z.ownGui,
      '-webkit-app-region:no-drag','display:flex','gap:8px','align-items:center',
      'padding:8px 12px','border-radius:10px','pointer-events:auto',
      'background:rgba(17,18,20,.86)','color:#f5f7fa','border:1px solid rgba(255,255,255,.18)',
      'box-shadow:0 10px 30px rgba(0,0,0,.35)','font:12px/1.5 system-ui,sans-serif'].join(';')
    var hint = document.createElement('span')
    hint.textContent = '拖动四个锚点：背景变化 / 输入气泡 / 思考链起点 A、B'
    hint.style.cssText = 'opacity:.8;white-space:nowrap'
    bar.appendChild(hint)
    var makeButton = function (text, handler, dim) {
      var b = document.createElement('button')
      b.type = 'button'
      b.textContent = text
      b.style.cssText = 'cursor:pointer;padding:3px 10px;border-radius:6px;border:1px solid ' +
        (dim ? 'rgba(255,255,255,.2)' : 'rgba(255,255,255,.45)') + ';background:' +
        (dim ? 'transparent' : 'rgba(255,255,255,.12)') + ';color:#f5f7fa;font:inherit'
      b.addEventListener('click', function (event) { event.stopPropagation(); handler() })
      bar.appendChild(b)
      return b
    }
    makeButton('保存并关闭', function () { saveAnchors(); closeAnchorTool(false); refreshDiag() }, false)
    makeButton('重置', function () {
      state.dynamicAnchors = defaultAnchors()
      positionAllAnchors()
      refreshDiag()
    }, true)
    makeButton('关闭', function () { closeAnchorTool(true); refreshDiag() }, true)
    node.appendChild(bar)

    for (var i = 0; i < ANCHOR_DEFS.length; i++) {
      ;(function (def) {
        var marker = document.createElement('div')
        marker.setAttribute('data-anchor', def.id)
        marker.style.cssText = ['position:fixed','width:1px','height:1px','pointer-events:none',
          'z-index:' + LAYER_Z.ownGui].join(';')
        var cross = document.createElement('div')
        cross.style.cssText = ['position:absolute','left:-11px','top:-11px','width:22px','height:22px',
          'border:1px solid #fff','border-radius:50%','background:rgba(17,18,20,.35)','pointer-events:auto',
          'cursor:grab','box-shadow:0 0 0 1px rgba(0,0,0,.5)'].join(';')
        var label = document.createElement('span')
        label.style.cssText = ['position:absolute','left:26px','top:-14px','white-space:nowrap',
          'background:rgba(17,18,20,.86)','color:#f5f7fa','border:1px solid rgba(255,255,255,.18)',
          'border-radius:6px','padding:2px 6px','font:11px/1.4 system-ui,sans-serif'].join(';')
        cross.appendChild(label)
        marker.appendChild(cross)
        node.appendChild(marker)
        tool.markers[def.id] = marker
        var onDown = function (event) {
          event.preventDefault()
          event.stopPropagation()
          var vp = anchorViewport()
          var move = function (moveEvent) {
            setAnchor(def.id, (moveEvent.clientX || 0) / vp.w, (moveEvent.clientY || 0) / vp.h)
            positionAnchorMarker(def.id)
          }
          var up = function () {
            document.removeEventListener('pointermove', move, true)
            document.removeEventListener('pointerup', up, true)
            document.removeEventListener('pointercancel', up, true)
          }
          document.addEventListener('pointermove', move, true)
          document.addEventListener('pointerup', up, true)
          document.addEventListener('pointercancel', up, true)
        }
        cross.addEventListener('pointerdown', onDown)
      })(ANCHOR_DEFS[i])
    }

    var onKey = function (event) {
      if (!event || event.key !== 'Escape') return
      event.stopPropagation()
      closeAnchorTool(true)
    }
    var onResize = function () { positionAllAnchors() }
    document.addEventListener('keydown', onKey, true)
    window.addEventListener('resize', onResize)
    tool.listeners.push(function () { document.removeEventListener('keydown', onKey, true) })
    tool.listeners.push(function () { window.removeEventListener('resize', onResize) })
    tool.node = node
    state.anchorTool = tool
    ;(document.body || document.documentElement).appendChild(node)
    safe(updateAnchorGuides)
    positionAllAnchors()
    refreshDiag()
    safe(syncAnchorGuides)
    return true
  }

  function swatchStyle(active, disabled) {
    // 深色主题的 DSH brand token 是白色：激活态按钮会变成"白底白字"（截图实测看不清）。
    // 深色下改成白底黑字；浅色保持原来的品牌蓝底白字。
    var dark = isDarkTheme()
    var border = active
      ? dark
        ? 'rgba(255,255,255,.75)'
        : 'var(--dsw-alias-brand-primary, #4d6bfe)'
      : disabled
        ? 'rgba(128,128,128,.3)'
        : dark
          ? 'rgba(255,255,255,.28)'
          : 'rgba(128,128,128,.45)'
    var background = active ? (dark ? '#f5f7fa' : 'var(--dsw-alias-brand-primary, #4d6bfe)') : 'transparent'
    var color = active ? (dark ? '#111111' : '#fff') : disabled ? 'rgba(128,128,128,.55)' : dark ? '#e8eaed' : 'inherit'
    return [
      'cursor:' + (disabled ? 'default' : 'pointer'),
      'padding:3px 10px',
      'border-radius:6px',
      'border:1px solid ' + border,
      'background:' + background,
      'color:' + color,
      'transition:background-color 240ms ease,color 240ms ease,border-color 240ms ease',
      'font:inherit',
      'line-height:1.4',
    ].join(';')
  }

  /** 切换器：三模式按钮 + 图片选择 + 浓度滑块 + 关闭。操作后保持打开，方便反复调。 */
  function renderSwitcher() {
    var box = document.createElement('div')
    box.id = SWITCHER_ID
    box.setAttribute('data-dshui-ignore', '')
    box.style.cssText = [
      'position:fixed',
      'left:12px',
      'top:52px',
      'z-index:' + LAYER_Z.ownGui,
      'display:flex',
      'flex-direction:column',
      'gap:8px',
      'align-items:flex-start',
      'padding:10px 12px',
      'border-radius:10px',
      'border:1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.18))',
      'background:var(--dsw-alias-bg-overlay, #fff)',
      'color:var(--dsw-alias-label-primary, #111)',
      'font:12px/1.5 system-ui,sans-serif',
      'box-shadow:0 8px 28px rgba(0,0,0,.28)',
      'transition:background-color 320ms ease,color 320ms ease,border-color 320ms ease,box-shadow 320ms ease',
    ].join(';')

    var title = document.createElement('div')
    title.textContent = 'DSH UI Beautify · 控制面板  v' + VERSION
    title.style.cssText = 'font-weight:600;opacity:.85'
    box.appendChild(title)

    var pillReset = document.createElement('button')
    pillReset.type = 'button'
    pillReset.textContent = '重置胶囊位置'
    pillReset.title = '把左上角胶囊恢复到默认位置（清掉 __dshui.pill）'
    pillReset.setAttribute('data-pill-reset', '')
    pillReset.style.cssText = swatchStyle(false)
    pillReset.addEventListener('click', function (event) {
      event.stopPropagation()
      safe(function () {
        window.localStorage.removeItem(PILL_KEY)
        state.pillLeft = PILL_DEFAULT.left
        state.pillTop = Math.max(PILL_DEFAULT.top, (state.titlebarHeight || 0) + 4)
        state.pillMoved = false
        savePillPosition()
        applyPillPosition()
      })
    })
    box.appendChild(pillReset)

    // 0.8.22 顶层分组：关闭 / 静态 / 动态（开发中）
    var GROUP_BUTTONS = [
      { group: 'off', label: '关闭', hint: '一切恢复默认' },
      { group: 'static', label: '静态', hint: '静态壁纸：纹理 / 背景' },
      { group: 'dynamic', label: '动态', hint: '开发中：动态壁纸与布局定位' },
    ]
    var groupRow = document.createElement('div')
    groupRow.style.cssText = 'display:flex;gap:6px'
    for (var gi = 0; gi < GROUP_BUTTONS.length; gi++) {
      ;(function (entry) {
        var button = document.createElement('button')
        button.type = 'button'
        button.textContent = entry.label
        button.title = entry.hint
        button.setAttribute('data-mode-group', entry.group)
        if (entry.group === 'off') button.setAttribute('data-mode-button', 'off')
        var active = state.modeGroup === entry.group
        button.style.cssText = swatchStyle(active)
        button.addEventListener('click', function (event) {
          event.stopPropagation()
          applyGroup(entry.group)
        })
        groupRow.appendChild(button)
      })(GROUP_BUTTONS[gi])
    }
    box.appendChild(groupRow)

    if (state.modeGroup === 'static') {
      var staticRow = document.createElement('div')
      staticRow.style.cssText = 'display:flex;gap:6px;padding-left:2px'
      var STATIC_BUTTONS = [
        { mode: 'multiply', label: '纹理', hint: '乘法混合，白底处文字不受影响' },
        { mode: 'backdrop', label: '背景', hint: '图真正垫底，文字/面板都在图上' },
      ]
      for (var si = 0; si < STATIC_BUTTONS.length; si++) {
        ;(function (entry) {
          var button = document.createElement('button')
          button.type = 'button'
          button.textContent = entry.label
          button.title = entry.hint
          button.setAttribute('data-mode-button', entry.mode)
          var active = state.mode === entry.mode
          button.style.cssText = swatchStyle(active)
          button.addEventListener('click', function (event) {
            event.stopPropagation()
            applyGroup('static', entry.mode)
          })
          staticRow.appendChild(button)
        })(STATIC_BUTTONS[si])
      }
      box.appendChild(staticRow)
    }

    if (state.modeGroup === 'dynamic') {
      var dynRow = document.createElement('div')
      dynRow.style.cssText = 'display:flex;gap:8px;align-items:center;min-width:300px'
      var dynHint = document.createElement('span')
      var phaseText = '自动分镜暂停（修复中）'
      dynHint.textContent = '动态分镜 · ' + phaseText + (state.dynamicSuspended ? ' · 已滚轮退出' : '') + ''
      dynHint.title = '自动：思考时壁纸放大 + 气泡/思考链/输入卡片按分区平移排版；输出第一个字恢复。滚轮可临时退出。'
      dynHint.style.cssText = 'opacity:.72;white-space:nowrap'
      dynRow.appendChild(dynHint)
      var previewBtn = document.createElement('button')
      previewBtn.type = 'button'
      previewBtn.textContent = state.dynamicPreview ? '结束预览' : '预览思考态'
      previewBtn.title = '不发送消息，直接预览思考中的放大/重排效果'
      previewBtn.setAttribute('data-dynamic-preview', '')
      previewBtn.style.cssText = swatchStyle(state.dynamicPreview)
      previewBtn.addEventListener('click', function (event) {
        event.stopPropagation()
        try {
          setDynamicPreview(!state.dynamicPreview)
        } catch (err) {
          safe(function () {
            fetch(PREFIX + '/diag?data=' + encodeURIComponent(JSON.stringify({
              probe: 'dynamic-error', at: Date.now(), version: VERSION,
              message: String((err && err.message) || err).slice(0, 400),
              stack: String((err && err.stack) || '').slice(0, 800),
            })), { cache: 'no-store', credentials: 'same-origin' }).catch(function () {})
          })
          state.dynamicPreview = false
          dynamicExitThinking('idle')
        }
      })
      dynRow.appendChild(previewBtn)
      var importInput = document.createElement('input')
      importInput.type = 'file'
      importInput.accept = 'application/json,.json'
      importInput.style.display = 'none'
      importInput.setAttribute('data-dynamic-import-file', '')
      importInput.addEventListener('change', function () {
        var file = importInput.files && importInput.files[0]
        if (!file) return
        var reader = new FileReader()
        reader.onload = function () {
          safe(function () {
            importDynamicLayout(String(reader.result || ''))
          })
        }
        reader.readAsText(file)
        importInput.value = ''
      })
      dynRow.appendChild(importInput)
      var importBtn = document.createElement('button')
      importBtn.type = 'button'
      importBtn.textContent = '导入分镜'
      importBtn.title = '导入设计器导出的 dshui-dynamic-layout.json（三阶段）'
      importBtn.setAttribute('data-dynamic-import', '')
      importBtn.style.cssText = swatchStyle(false)
      importBtn.addEventListener('click', function (event) {
        event.stopPropagation()
        safe(function () { importInput.click() })
      })
      dynRow.appendChild(importBtn)
      var resetLayoutBtn = document.createElement('button')
      resetLayoutBtn.type = 'button'
      resetLayoutBtn.textContent = '恢复默认分镜'
      resetLayoutBtn.title = '恢复插件内置的三阶段分镜布局'
      resetLayoutBtn.setAttribute('data-dynamic-reset', '')
      resetLayoutBtn.style.cssText = swatchStyle(false)
      resetLayoutBtn.addEventListener('click', function (event) {
        event.stopPropagation()
        safe(resetDynamicLayout)
      })
      dynRow.appendChild(resetLayoutBtn)
      box.appendChild(dynRow)
      var dynNote = document.createElement('div')
      dynNote.textContent = '滚轮：思考分镜态先退出；浏览旧消息后回到底部上滑恢复。'
      dynNote.style.cssText = 'opacity:.5;font-size:11px;white-space:nowrap'
      box.appendChild(dynNote)
    }

    // ── 开屏动画（0.8.0）：独立开关 + 重播（默认开，与模式无关）────────────
    var splashRow = document.createElement('div')
    splashRow.style.cssText = 'display:flex;gap:8px;align-items:center;min-width:300px'
    var splashToggle = document.createElement('button')
    splashToggle.type = 'button'
    splashToggle.textContent = state.splash.enabled ? '开屏动画：开' : '开屏动画：关'
    splashToggle.title = '页面加载时的开屏动画（默认开）；可关，也可点右边「↻ 重播」预览'
    splashToggle.setAttribute('data-splash-toggle', '')
    splashToggle.style.cssText = swatchStyle(state.splash.enabled)
    splashToggle.addEventListener('click', function (event) {
      event.stopPropagation()
      setSplashEnabled(!state.splash.enabled)
      reRenderSwitcher()
    })
    splashRow.appendChild(splashToggle)
    var splashReplay = document.createElement('button')
    splashReplay.type = 'button'
    splashReplay.textContent = '↻ 重播'
    splashReplay.title = '重播开屏动画（预览用，不改设置）'
    splashReplay.setAttribute('data-splash-replay', '')
    splashReplay.style.cssText = swatchStyle(false)
    splashReplay.addEventListener('click', function (event) {
      event.stopPropagation()
      closeSwitcher()
      replaySplash()
    })
    splashRow.appendChild(splashReplay)
    var splashSoundToggle = document.createElement('button')
    splashSoundToggle.type = 'button'
    splashSoundToggle.textContent = state.splash.sound ? '音效：开' : '音效：关'
    splashSoundToggle.title = '开屏动画音效（默认开；网页端受浏览器自动播放策略限制，首次点击后才会出声）'
    splashSoundToggle.setAttribute('data-splash-sound-toggle', '')
    splashSoundToggle.style.cssText = swatchStyle(state.splash.sound)
    splashSoundToggle.addEventListener('click', function (event) {
      event.stopPropagation()
      setSplashSound(!state.splash.sound)
      reRenderSwitcher()
    })
    splashRow.appendChild(splashSoundToggle)
    var splashHint = document.createElement('span')
    splashHint.textContent = state.splash.status === 'idle' ? '下次加载生效' : splashDiagText()
    splashHint.style.cssText = 'opacity:.6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'
    splashRow.appendChild(splashHint)
    box.appendChild(splashRow)

    // ── 重启键（0.8.0）：面板里也给一个入口（标题栏按钮的前提是桌面壳菜单栏在）──
    var restartRow = document.createElement('div')
    restartRow.style.cssText = 'display:flex;gap:8px;align-items:center;min-width:300px'
    var restartBtn = document.createElement('button')
    restartBtn.type = 'button'
    restartBtn.textContent = '↻ 重启 DSH'
    restartBtn.title = '重启 DeepSeek Harness（应用与 Host）；需要配套桌面壳补丁'
    restartBtn.setAttribute('data-restart-button', '')
    restartBtn.style.cssText = swatchStyle(false)
    restartBtn.addEventListener('click', function (event) {
      event.stopPropagation()
      if (!restartGetBridge()) {
        // 壳补丁没装：已自动准备 → 提示退出一次；否则面板按钮直接走「一键启用」
        if (restartAutoPrepared()) {
          restartShowToast('已自动准备重启键补丁：完全退出 DSH 后生效（无需其它操作）。')
          return
        }
        enableRestartKey()
        return
      }
      restartOnActivate(event)
    })
    restartRow.appendChild(restartBtn)
    var restartHint = document.createElement('span')
    restartHint.textContent = restartDiagText()
    restartHint.style.cssText = 'opacity:.6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px'
    restartRow.appendChild(restartHint)
    // 壳补丁没装时：不用去找 restart/*.cmd，面板里一键启动随包安装器（你只需完全退出 DSH 一次）
    if (state.restart.desktop && restartBridgeState() === 'missing' && !restartAutoPrepared()) {
      var enableBtn = document.createElement('button')
      enableBtn.type = 'button'
      enableBtn.textContent = state.restart.enabling ? '安装器已启动…' : '启用重启键'
      enableBtn.title = '启动随包桌面壳补丁安装器（需从托盘完全退出 DSH 一次）；之后标题栏「重启」即可用，无需再手动运行脚本'
      enableBtn.setAttribute('data-restart-enable', '')
      enableBtn.style.cssText = swatchStyle(false)
      enableBtn.addEventListener('click', function (event) {
        event.stopPropagation()
        enableRestartKey()
      })
      restartRow.appendChild(enableBtn)
    }
    box.appendChild(restartRow)

    // ── 图片切换、浓度滑块与毛玻璃整套控件：纹理 / 背景两种模式都要（0.4.0 起）────
    if (state.mode === 'multiply' || state.mode === 'backdrop') {
      var imageList = imageListForTheme()
      if (imageList.length > 0) {
        var imageRow = document.createElement('div')
        imageRow.style.cssText = 'display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:flex-end'
        var imageLabel = document.createElement('span')
        imageLabel.textContent = '图片'
        imageLabel.style.cssText = 'opacity:.7'
        imageRow.appendChild(imageLabel)
        for (var n = 0; n < imageList.length; n++) {
          ;(function (entry) {
            var button = document.createElement('button')
            button.type = 'button'
            button.textContent = entry.label || entry.name
            button.title = '使用桌面上的 ' + entry.name
            button.setAttribute('data-image-button', entry.name)
            button.style.cssText = swatchStyle(state.imageName === entry.name)
            button.addEventListener('click', function (event) {
              event.stopPropagation()
              var dark = isDarkTheme()
              if (dark) writeDarkImage(entry.name)
              setImage(entry.name, { noPersist: dark }).then(function () {
                reRenderSwitcher()
              })
            })
            imageRow.appendChild(button)
          })(imageList[n])
        }
        box.appendChild(imageRow)
      }

      // ── 浓度滑块（实时可调，拖到哪停到哪）─────────────────────────────
      var opacityRow = document.createElement('div')
      opacityRow.style.cssText = 'display:flex;gap:8px;align-items:center;min-width:280px'
      var opacityLabel = document.createElement('span')
      opacityLabel.textContent = isDarkTheme() ? '浓度（深色）' : '浓度'
      opacityLabel.style.cssText = 'opacity:.7;white-space:nowrap'
      opacityRow.appendChild(opacityLabel)

      var slider = document.createElement('input')
      slider.type = 'range'
      slider.min = '0'
      slider.max = '1'
      slider.step = '0.01'
      slider.value = String(opacityFor(state.mode))
      slider.setAttribute('data-opacity-slider', '')
      slider.style.cssText = 'flex:1;accent-color:var(--dsw-alias-brand-primary, #4d6bfe);'
      opacityRow.appendChild(slider)

      var value = document.createElement('span')
      value.className = '__dshui-opacity-value'
      value.textContent = Math.round(opacityFor(state.mode) * 100) + '%'
      value.style.cssText = 'min-width:36px;text-align:right;font-variant-numeric:tabular-nums;opacity:.85'
      opacityRow.appendChild(value)

      // 拖动时实时更新浓度（不关闭面板、不改写样式表）；记忆到纹理模式。
      slider.addEventListener('input', function (event) {
        event.stopPropagation()
        var next = Number(slider.value)
        setModeOpacity(state.mode, next)
        applyLayerOpacity()
        if (value) value.textContent = Math.round(next * 100) + '%'
      })
      box.appendChild(opacityRow)

      // ── 动效总开关（P0，0.7.0）：默认关（灰度）；装饰动效都从这里走 ────────
      var motionRow = document.createElement('div')
      motionRow.style.cssText = 'display:flex;gap:8px;align-items:center;min-width:300px'
      var motionToggle = document.createElement('button')
      motionToggle.type = 'button'
      motionToggle.textContent = state.motion.enabled ? '动效：开' : '动效：关'
      motionToggle.title = '装饰动效总开关（默认关）；系统「减弱动态效果」或窗口失焦时自动暂停'
      motionToggle.setAttribute('data-motion-toggle', '')
      motionToggle.style.cssText = swatchStyle(state.motion.enabled)
      motionToggle.addEventListener('click', function (event) {
        event.stopPropagation()
        state.motion.enabled = !state.motion.enabled
        saveMotionSettings()
        syncMotionClass()
        reRenderSwitcher()
        refreshDiag()
      })
      motionRow.appendChild(motionToggle)
      var motionHint = document.createElement('span')
      motionHint.textContent =
        (state.motion.reduced ? '系统减弱动态' : state.motion.paused ? '失焦暂停' : '帧率见诊断') +
        ' · Ctrl+Shift+Alt+M'
      motionHint.style.cssText = 'opacity:.6;white-space:nowrap'
      motionRow.appendChild(motionHint)
      box.appendChild(motionRow)

      // ── 毛玻璃：开关 + 模糊 + 白层浓度（作用输入卡片 + 你的气泡）─────────
      // 「分层」不再提供开关：面板里已移除，程序内保持开启。
      var frostRow = document.createElement('div')
      frostRow.style.cssText = 'display:flex;gap:8px;align-items:center;min-width:300px'

      var frostToggle = document.createElement('button')
      frostToggle.type = 'button'
      frostToggle.textContent = state.frost.enabled ? '毛玻璃：开' : '毛玻璃：关'
      frostToggle.title = '开关毛玻璃（输入卡片 + 你发的消息气泡）'
      frostToggle.setAttribute('data-frost-toggle', '')
      frostToggle.style.cssText = swatchStyle(state.frost.enabled)
      frostToggle.addEventListener('click', function (event) {
        event.stopPropagation()
        state.frost.enabled = !state.frost.enabled
        saveFrostSettings()
        refreshFrost()
      })
      frostRow.appendChild(frostToggle)

      var frostLabel = document.createElement('span')
      frostLabel.textContent = '模糊'
      frostLabel.style.cssText = 'opacity:.7;white-space:nowrap'
      frostRow.appendChild(frostLabel)

      var frostSlider = document.createElement('input')
      frostSlider.type = 'range'
      frostSlider.min = '0'
      frostSlider.max = '30'
      frostSlider.step = '1'
      frostSlider.value = String(state.frost.blur)
      frostSlider.setAttribute('data-frost-slider', '')
      frostSlider.style.cssText = 'flex:1;accent-color:var(--dsw-alias-brand-primary, #4d6bfe);'
      frostSlider.disabled = !state.frost.enabled
      frostRow.appendChild(frostSlider)

      var frostValue = document.createElement('span')
      frostValue.className = '__dshui-frost-value'
      frostValue.textContent = state.frost.blur + 'px'
      frostValue.style.cssText = 'min-width:36px;text-align:right;font-variant-numeric:tabular-nums;opacity:.85'
      frostRow.appendChild(frostValue)

      frostSlider.addEventListener('input', function (event) {
        event.stopPropagation()
        state.frost.blur = Number(frostSlider.value)
        saveFrostSettings()
        setFrostNow(state.frost.blur, state.frost.alpha)
        if (frostValue) frostValue.textContent = state.frost.blur + 'px'
      })
      box.appendChild(frostRow)

      // 方块光标模糊度（0.8.21）：只控制光标光晕/内高光/背景透过的模糊，不改布局。
      var caretRow = document.createElement('div')
      caretRow.style.cssText = 'display:flex;gap:8px;align-items:center;min-width:300px'
      var caretLabel = document.createElement('span')
      caretLabel.textContent = '光标模糊'
      caretLabel.style.cssText = 'opacity:.7;white-space:nowrap'
      caretRow.appendChild(caretLabel)
      var caretSlider = document.createElement('input')
      caretSlider.type = 'range'
      caretSlider.min = '0'
      caretSlider.max = String(CARET_BLUR_MAX)
      caretSlider.step = '0.5'
      caretSlider.value = String(state.caretBlur)
      caretSlider.setAttribute('data-caret-blur-slider', '')
      caretSlider.style.cssText = 'flex:1;accent-color:var(--dsw-alias-brand-primary, #4d6bfe);'
      caretRow.appendChild(caretSlider)
      var caretValue = document.createElement('span')
      caretValue.className = '__dshui-caret-blur-value'
      caretValue.textContent = state.caretBlur + 'px'
      caretValue.style.cssText = 'min-width:36px;text-align:right;font-variant-numeric:tabular-nums;opacity:.85'
      caretRow.appendChild(caretValue)
      caretSlider.addEventListener('input', function (event) {
        event.stopPropagation()
        setCaretBlur(Number(caretSlider.value))
        if (caretValue) caretValue.textContent = state.caretBlur + 'px'
      })
      box.appendChild(caretRow)

      // 纹理模式气泡视觉（0.8.5）：细描边 + 顶部高光 + 柔和投影（只作用于「你发的」气泡）
      if (state.mode === 'multiply') {
        var bubbleFxRow = document.createElement('div')
        bubbleFxRow.style.cssText = 'display:flex;gap:8px;align-items:center;min-width:300px'
        var bubbleFxToggle = document.createElement('button')
        bubbleFxToggle.type = 'button'
        bubbleFxToggle.textContent = state.frost.bubbleFx ? '气泡视觉：开' : '气泡视觉：关'
        bubbleFxToggle.title = '纹理模式专属：给你发的消息气泡和输入框加顶部高光/柔和投影（不改字色与布局）'
        bubbleFxToggle.setAttribute('data-bubblefx-toggle', '')
        bubbleFxToggle.style.cssText = swatchStyle(state.frost.bubbleFx)
        bubbleFxToggle.addEventListener('click', function (event) {
          event.stopPropagation()
          state.frost.bubbleFx = !state.frost.bubbleFx
          saveFrostSettings()
          syncBubbleFxClass()
          reRenderSwitcher()
        })
        bubbleFxRow.appendChild(bubbleFxToggle)
        var bubbleFxHint = document.createElement('span')
        bubbleFxHint.textContent = '高光 / 投影（气泡 + 输入框）'
        bubbleFxHint.style.cssText = 'opacity:.6;white-space:nowrap'
        bubbleFxRow.appendChild(bubbleFxHint)
        box.appendChild(bubbleFxRow)
      }

      var aiFxRow = document.createElement('div')
      aiFxRow.style.cssText = 'display:flex;gap:8px;align-items:center;min-width:300px'
      var aiFxToggle = document.createElement('button')
      aiFxToggle.type = 'button'
      aiFxToggle.textContent = state.frost.aiReplyFx ? 'AI 思考过程视效：开' : 'AI 思考过程视效：关'
      aiFxToggle.title = '整段 AI 思考过程 + 每一行思维链的左侧细线/淡渐变，并在每行更新时从左侧滑入（纹理/背景模式都生效；不包卡片、零布局）'
      aiFxToggle.setAttribute('data-aireplyfx-toggle', '')
      aiFxToggle.style.cssText = swatchStyle(state.frost.aiReplyFx)
      aiFxToggle.addEventListener('click', function (event) {
        event.stopPropagation()
        state.frost.aiReplyFx = !state.frost.aiReplyFx
        saveFrostSettings()
        syncAiReplyFxClass()
        reRenderSwitcher()
      })
      aiFxRow.appendChild(aiFxToggle)
      var aiFxHint = document.createElement('span')
      aiFxHint.textContent = '每行思维链：细线/滑入（纹理/背景）'
      aiFxHint.style.cssText = 'opacity:.6;white-space:nowrap'
      aiFxRow.appendChild(aiFxHint)
      box.appendChild(aiFxRow)

      var alphaRow = document.createElement('div')
      alphaRow.style.cssText = 'display:flex;gap:8px;align-items:center;min-width:300px'

      var alphaLabel = document.createElement('span')
      alphaLabel.textContent = '白层'
      alphaLabel.style.cssText = 'opacity:.7;white-space:nowrap'
      alphaRow.appendChild(alphaLabel)

      var alphaSlider = document.createElement('input')
      alphaSlider.type = 'range'
      alphaSlider.min = String(FROST_ALPHA_MIN)
      alphaSlider.max = String(FROST_ALPHA_MAX)
      alphaSlider.step = '0.01'
      alphaSlider.value = String(state.frost.alpha)
      alphaSlider.setAttribute('data-frost-alpha-slider', '')
      alphaSlider.style.cssText = 'flex:1;accent-color:var(--dsw-alias-brand-primary, #4d6bfe);'
      alphaSlider.disabled = !state.frost.enabled
      alphaRow.appendChild(alphaSlider)

      var alphaValue = document.createElement('span')
      alphaValue.className = '__dshui-frost-alpha-value'
      alphaValue.textContent = Math.round(state.frost.alpha * 100) + '%'
      alphaValue.style.cssText = 'min-width:36px;text-align:right;font-variant-numeric:tabular-nums;opacity:.85'
      alphaRow.appendChild(alphaValue)

      alphaSlider.addEventListener('input', function (event) {
        event.stopPropagation()
        state.frost.alpha = Math.min(FROST_ALPHA_MAX, Math.max(FROST_ALPHA_MIN, Number(alphaSlider.value)))
        saveFrostSettings()
        setFrostNow(state.frost.blur, state.frost.alpha)
        if (alphaValue) alphaValue.textContent = Math.round(state.frost.alpha * 100) + '%'
      })
      box.appendChild(alphaRow)

      // ── 气泡浓度 + 二级面板白层（竖向渐变的两端）：三类元素各有各的玻璃深浅 ──────
      // 为什么给滑块：鲸鱼面板本来就不透明（92%~100% 白），平铺的白层怎么调都"看不出变化"；
      // 气泡则相反 —— 一律要"看得出是气泡"（见常量区的方案 B 说明）。这类手感太主观，
      // 交给你现场拖最快。
      var sliderRow = function (config) {
        var row = document.createElement('div')
        row.style.cssText = 'display:flex;gap:8px;align-items:center;min-width:300px'

        var label = document.createElement('span')
        label.textContent = config.label
        label.style.cssText = 'opacity:.7;white-space:nowrap'
        row.appendChild(label)

        var input = document.createElement('input')
        input.type = 'range'
        input.min = String(config.min)
        input.max = String(config.max)
        input.step = String(config.step)
        input.value = String(state.frost[config.key])
        input.setAttribute(config.attr, '')
        input.style.cssText = 'flex:1;accent-color:var(--dsw-alias-brand-primary, #4d6bfe);'
        input.disabled = !state.frost.enabled
        row.appendChild(input)

        var out = document.createElement('span')
        out.className = config.valueClass
        out.textContent = config.format(state.frost[config.key])
        out.style.cssText = 'min-width:36px;text-align:right;font-variant-numeric:tabular-nums;opacity:.85'
        row.appendChild(out)

        input.addEventListener('input', function (event) {
          event.stopPropagation()
          state.frost[config.key] = config.normalize(Number(input.value), state.frost[config.key])
          saveFrostSettings()
          applyExtraFrostVars()
          if (out) out.textContent = config.format(state.frost[config.key])
        })
        return row
      }
      var percentOfUnit = function (value) {
        return Math.round(value * 100) + '%'
      }
      // 气泡三件套排在最前：透明度 / 模糊 / 颜色（用户 2026-10-13 v0.2.40 要的）
      box.appendChild(
        sliderRow({
          label: '气泡透明度',
          key: 'bubbleTransparency',
          attr: 'data-bubble-transparency-slider',
          valueClass: '__dshui-bubble-transparency-value',
          min: 0,
          max: 100,
          step: 1,
          normalize: bubbleTransparencyValue,
          format: function (value) {
            return value + '%'
          },
        }),
      )
      box.appendChild(
        sliderRow({
          label: '气泡模糊',
          key: 'bubbleBlur',
          attr: 'data-bubble-blur-slider',
          valueClass: '__dshui-bubble-blur-value',
          min: 0,
          max: BUBBLE_BLUR_MAX,
          step: 1,
          normalize: bubbleBlurValue,
          format: function (value) {
            return value + 'px'
          },
        }),
      )

      // 气泡颜色：原生取色器 + 十六进制回显 + 「原色」重置（跟随 DSH 气泡原色）
      var colorRow = document.createElement('div')
      colorRow.style.cssText = 'display:flex;gap:8px;align-items:center;min-width:300px'
      var colorLabel = document.createElement('span')
      colorLabel.textContent = '气泡颜色'
      colorLabel.style.cssText = 'opacity:.7;white-space:nowrap'
      colorRow.appendChild(colorLabel)
      var colorInput = document.createElement('input')
      colorInput.type = 'color'
      colorInput.setAttribute('data-bubble-color-input', '')
      colorInput.style.cssText = 'width:44px;height:24px;border:none;background:none;padding:0'
      colorInput.value = effectiveBubbleHex()
      colorInput.disabled = !state.frost.enabled
      colorRow.appendChild(colorInput)
      var colorText = document.createElement('span')
      colorText.className = '__dshui-bubble-color-value'
      colorText.textContent = effectiveBubbleHex()
      colorText.style.cssText = 'min-width:64px;text-align:right;font-variant-numeric:tabular-nums;opacity:.85'
      colorRow.appendChild(colorText)
      var colorReset = document.createElement('button')
      colorReset.type = 'button'
      colorReset.textContent = '原色'
      colorReset.style.cssText = swatchStyle(false)
      colorReset.setAttribute('data-bubble-color-reset', '')
      colorRow.appendChild(colorReset)
      colorInput.addEventListener('input', function (event) {
        event.stopPropagation()
        var next = bubbleColorValue(colorInput.value)
        if (!next) return // 取色器取消 / 非法值：不动当前设置（只有「原色」按钮才会重置）
        state.frost.bubbleColor = next
        saveFrostSettings()
        revertBubbleColors() // 自选色接管，元素上的自动色退场
        applyExtraFrostVars()
        if (colorText) colorText.textContent = effectiveBubbleHex()
      })
      colorReset.addEventListener('click', function (event) {
        event.stopPropagation()
        state.frost.bubbleColor = ''
        saveFrostSettings()
        applyExtraFrostVars()
        markBubbleColors(state.frostBubbles || []) // 恢复"跟随气泡原色"
        colorInput.value = effectiveBubbleHex()
        if (colorText) colorText.textContent = effectiveBubbleHex()
      })
      box.appendChild(colorRow)
      // 「气泡浮层」开关已在 0.7.1 删除（见文件头部的 ⚰️ 说明：纹理模式下它必然糊住文字，
      // 气泡真玻璃请用「背景」模式）。
      box.appendChild(
        sliderRow({
          label: '面板边缘白层',
          key: 'panelTop',
          attr: 'data-panel-top-slider',
          valueClass: '__dshui-panel-top-value',
          min: PANEL_ALPHA_MIN,
          max: 1,
          step: 0.01,
          normalize: frostAlphaValue,
          format: percentOfUnit,
        }),
      )
      box.appendChild(
        sliderRow({
          label: '面板内部白层',
          key: 'panelBottom',
          attr: 'data-panel-bottom-slider',
          valueClass: '__dshui-panel-bottom-value',
          min: PANEL_ALPHA_MIN,
          max: 1,
          step: 0.01,
          normalize: frostAlphaValue,
          format: percentOfUnit,
        }),
      )
      // DSH 自己的二级菜单（重命名窗 / 下拉菜单）：模糊度**独立**一套（0.4.0）
      box.appendChild(
        sliderRow({
          label: 'DSH 面板模糊',
          key: 'dshBlur',
          attr: 'data-dsh-blur-slider',
          valueClass: '__dshui-dsh-blur-value',
          min: 0,
          max: FROST_DSH_BLUR_MAX,
          step: 1,
          normalize: function (value) {
            return Math.min(FROST_DSH_BLUR_MAX, Math.max(0, Number(value) || 0))
          },
          format: function (value) {
            return value + 'px'
          },
        }),
      )
    }
    if (state.mode === 'backdrop') {
      // 「背景」模式的薄纱滑块（0.3.1）：亮色=白纱、暗色=深纱（暗色主题下浅字压白图
      // 不可读，必须能现场调）；写进层内联 background-image，样式表不动。
      var scrimRow = document.createElement('div')
      scrimRow.style.cssText = 'display:flex;gap:8px;align-items:center;min-width:300px'
      var scrimLabel = document.createElement('span')
      scrimLabel.textContent = '薄纱'
      scrimLabel.style.cssText = 'opacity:.7;white-space:nowrap'
      scrimRow.appendChild(scrimLabel)
      var scrimSlider = document.createElement('input')
      scrimSlider.type = 'range'
      scrimSlider.min = '0'
      scrimSlider.max = String(SCRIM_MAX)
      scrimSlider.step = String(SCRIM_STEP)
      scrimSlider.value = String(state.scrim)
      scrimSlider.setAttribute('data-scrim-slider', '')
      scrimSlider.style.cssText = 'flex:1;accent-color:var(--dsw-alias-brand-primary, #4d6bfe);'
      scrimRow.appendChild(scrimSlider)
      var scrimValue = document.createElement('span')
      scrimValue.className = '__dshui-scrim-value'
      scrimValue.textContent = Math.round(state.scrim * 100) + '%'
      scrimValue.style.cssText = 'min-width:36px;text-align:right;font-variant-numeric:tabular-nums;opacity:.85'
      scrimRow.appendChild(scrimValue)
      scrimSlider.addEventListener('input', function (event) {
        event.stopPropagation()
        state.scrim = Math.min(SCRIM_MAX, Math.max(0, Number(scrimSlider.value)))
        saveScrim()
        applyLayerBackground()
        if (scrimValue) scrimValue.textContent = Math.round(state.scrim * 100) + '%'
      })
      box.appendChild(scrimRow)
    }

    var tips = document.createElement('div')
    tips.className = '__dshui-tips'
    tips.style.cssText = 'opacity:.6;max-width:340px;text-align:right'
    tips.textContent =
      state.mode === 'multiply'
        ? '提示：浓度建议 ≤0.5；「白层」管输入卡片；「气泡视觉」管你的气泡/输入框高光；「AI 思考过程视效」管每行思维链的细线与滑入（系统减弱动态时自动关闭）。'
        : state.mode === 'backdrop'
          ? '提示：背景模式把图垫到最底；「AI 思考过程视效」同样生效；毛玻璃/薄纱/面板都可调，暗色主题自动换深色薄纱。'
          : '提示：当前是默认状态（关闭）；点「纹理」或「背景」开始。'
    box.appendChild(tips)

    var closeRow = document.createElement('div')
    closeRow.style.cssText = 'display:flex;gap:6px;align-self:stretch;justify-content:flex-end'
    var close = document.createElement('button')
    close.type = 'button'
    close.textContent = '关闭面板'
    close.style.cssText = swatchStyle(false)
    close.addEventListener('click', function (event) {
      event.stopPropagation()
      closeSwitcher()
    })
    closeRow.appendChild(close)
    box.appendChild(closeRow)

    // 面板自身的事件不冒泡给页面的点击判定
    ;['click', 'mousedown', 'pointerdown', 'keydown', 'input'].forEach(function (type) {
      box.addEventListener(type, function (event) {
        event.stopPropagation()
      })
    })

    return box
  }

  /** 若面板开着，就地重建（保持打开、同步高亮与滑块值，并**重新贴回胶囊下方**）。 */
  function reRenderSwitcher() {
    if (!state.switcherEl) return
    var box = state.switcherEl
    var next = renderSwitcher()
    if (box.parentNode) safe(function () {
      box.parentNode.replaceChild(next, box)
    })
    state.switcherEl = next
    // 关键：新建的面板节点自带默认坐标(12,52)，重建后必须重新贴回胶囊下方，
    // 否则每次操作（切模式 / 换图 / 开关毛玻璃）面板都会跳一下。
    placeSwitcher(next)
  }

  function toggleSwitcher() {
    // 开屏播放中：胶囊已隐藏，快捷键也不开面板（避免面板盖在开屏上又被静默移除）
    if (state.splashNode) return null
    // 背景淡出（点击背景后的 2 秒预览）还没结束时打开面板：先取消淡出，
    // 避免面板/毛玻璃抢修与淡出定时器互相打架（用户实测「点背景后立刻点胶囊卡死」）。
    if (state.restoreTimer !== null) {
      clearTimeout(state.restoreTimer)
      state.restoreTimer = null
      state.override = false
      safe(function () {
        if (state.layer) state.layer.classList.remove('is-faded')
      })
      refreshDiag()
    }
    if (state.switcherEl) {
      closeSwitcher()
      return null
    }
    var box = renderSwitcher()
    ;(document.body || document.documentElement).appendChild(box)
    state.switcherEl = box
    applyPillPosition()
    updatePill()
    return box
  }

  function closeSwitcher() {
    var box = state.switcherEl
    state.switcherEl = null
    if (box && box.parentNode) safe(function () {
      box.parentNode.removeChild(box)
    })
    updatePill()
  }

  // ── 常驻入口（位置由用户拖动决定，并记住）─────────────────────────────────
  /**
   * 胶囊配色跟主题走：浅色用 DSH token（保持原样）；深色强制深底浅字，
   * 避免暗色壁纸/半透明 token 导致胶囊里的字看不清。
   */
  function applyPillTheme() {
    safe(function () {
      var pill = document.getElementById(PILL_ID)
      if (!pill || !pill.style) return
      var dark = isDarkTheme()
      if (dark) {
        pill.style.setProperty('color', '#f5f7fa')
        pill.style.setProperty('background', 'rgba(17,18,20,.82)')
        pill.style.setProperty('box-shadow', '0 2px 12px rgba(0,0,0,.45)')
        pill.style.setProperty('border-color', state.switcherEl ? 'var(--dsw-alias-brand-primary, #4d6bfe)' : 'rgba(255,255,255,.18)')
        pill.style.setProperty('backdrop-filter', 'blur(10px) saturate(1.15)')
        pill.style.setProperty('-webkit-backdrop-filter', 'blur(10px) saturate(1.15)')
      } else {
        pill.style.setProperty('color', 'var(--dsw-alias-label-primary, #111)')
        pill.style.setProperty('background', 'var(--dsw-alias-bg-overlay, #fff)')
        pill.style.setProperty('box-shadow', '0 2px 10px rgba(0,0,0,.18)')
        pill.style.setProperty('border-color', state.switcherEl ? 'var(--dsw-alias-brand-primary, #4d6bfe)' : 'var(--dsw-alias-border-l1, rgba(0,0,0,.18))')
        pill.style.setProperty('backdrop-filter', 'none')
        pill.style.setProperty('-webkit-backdrop-filter', 'none')
      }
    })
  }

  /**
   * 常驻小胶囊：点一下开关设置面板，并可**任意拖动**到用户喜欢的位置。
   * - 拖动位置存 localStorage（`__dshui.pill`），刷新/重启后保持；
   * - 默认位置 = v0.2.11 的行为：窗口左上角 (10, 10)；
   * - 拖动位移超过 4px 才算拖动，松手时不会误触发"点击开面板"；
   * - 即使模式是「关闭」也保留 —— 否则没有任何入口能再打开面板；
   * - 带 data-dshui-ignore，永远不会被当成"点背景"，也不拦页面事件；
   * - 只为 DSH 页面创建；URL 带 #dsniang-off 的应急开关下不创建。
   */
  var PILL_KEY = '__dshui.pill'
  var PILL_DEFAULT = { left: 10, top: 10 }
  var PILL_W = 96
  var PILL_H = 26
  var PILL_GAP = 42

  function pillLabel() {
    if (state.modeGroup === 'dynamic') return 'DSH UI · 动态 · 开发中'
    if (state.mode === 'multiply') return 'DSH UI · 静态 · 纹理'
    if (state.mode === 'backdrop') return 'DSH UI · 静态 · 背景'
    if (state.mode === 'overlay') return 'DSH UI · 正常'
    return 'DSH UI · 关闭'
  }

  /** 读回用户拖出来的位置（坏数据一律忽略）。 */
  function loadPillPosition() {
    var raw = safe(function () {
      return window.localStorage.getItem(PILL_KEY)
    }, null)
    if (!raw) return null
    var parsed = null
    try {
      parsed = JSON.parse(raw)
    } catch (err) {
      return null
    }
    if (!parsed || typeof parsed !== 'object') return null
    var left = Number(parsed.left)
    var top = Number(parsed.top)
    if (!isFinite(left) || !isFinite(top)) return null
    // 0.8.45：标题栏是窗口拖动区；旧存档若把胶囊存进标题栏，启动时自动拉出来。
    var safeTop = Math.max(top, (state.titlebarHeight || 40) + 4)
    return { left: left, top: safeTop }
  }

  /** 夹到视口内：拖不出屏幕，换窗口大小后也不会跑到屏幕外。 */
  function clampPill(left, top) {
    var vw = window.innerWidth || 1
    var vh = window.innerHeight || 1
    var w = safe(function () {
      var el = document.getElementById(PILL_ID)
      return el && el.offsetWidth
    }, 0)
    var h = safe(function () {
      var el = document.getElementById(PILL_ID)
      return el && el.offsetHeight
    }, 0)
    if (!w || w <= 0) w = PILL_W
    if (!h || h <= 0) h = PILL_H
    return {
      left: Math.max(0, Math.min(vw - w, Math.round(left))),
      top: Math.max(0, Math.min(vh - h, Math.round(top))),
    }
  }

  /** 把入口（以及打开时的面板）放到当前记录的位置。 */
  function applyPillPosition() {
    if (state.pillLeft === null || state.pillTop === null) {
      state.pillLeft = PILL_DEFAULT.left
      state.pillTop = PILL_DEFAULT.top
    }
    var pos = clampPill(state.pillLeft, state.pillTop)
    state.pillLeft = pos.left
    state.pillTop = pos.top
    safe(function () {
      var pill = document.getElementById(PILL_ID)
      if (pill) {
        pill.style.setProperty('left', pos.left + 'px')
        pill.style.setProperty('top', pos.top + 'px')
      }
    })
    placeSwitcher(state.switcherEl)
  }

  /**
   * 把面板贴到胶囊正下方，并夹进视口。
   *
   * **必须在面板已经插进 DOM 之后调用**（要量它自己的宽高）；另外，
   * `reRenderSwitcher()` 重建面板后一定要再调一次 —— 新节点会带着
   * `renderSwitcher()` 里的默认 left/top(12,52) 出生，不重新贴回去就会出现
   * "一操作面板就乱窜"（跳回左上角，随后又被别的路径贴回胶囊下方）。
   */
  function placeSwitcher(box) {
    if (!box) return
    if (state.pillLeft === null || state.pillTop === null) {
      state.pillLeft = PILL_DEFAULT.left
      state.pillTop = PILL_DEFAULT.top
    }
    var pos = clampPill(state.pillLeft, state.pillTop)
    var rect = safe(function () {
      return box.getBoundingClientRect()
    }, null)
    var vw = window.innerWidth || 0
    var vh = window.innerHeight || 0
    var left = pos.left
    var top = pos.top + PILL_GAP
    // 贴边时把面板夹回视口内，别跑到屏幕外面去。
    // 只在量到的尺寸"确实小于视口"时才夹 —— 这样极简 DOM 桩里 fixed 元素返回的
    // 视口尺寸盒子不会误触发，真实浏览器里面板（几百像素）照常受保护。
    if (rect && rect.width > 0 && vw > 0 && rect.width < vw && left + rect.width > vw - 8) {
      left = Math.max(8, vw - rect.width - 8)
    }
    if (rect && rect.height > 0 && vh > 0 && rect.height < vh && top + rect.height > vh - 8) {
      top = Math.max(8, vh - rect.height - 8)
    }
    safe(function () {
      box.style.setProperty('left', Math.round(left) + 'px')
      box.style.setProperty('top', Math.round(top) + 'px')
    })
  }

  function savePillPosition() {
    safe(function () {
      window.localStorage.setItem(PILL_KEY, JSON.stringify({ left: state.pillLeft, top: state.pillTop }))
    })
  }

  function watchPillPlacement() {
    if (state._pillWatched) return
    state._pillWatched = true
    safe(function () {
      var timer = null
      window.addEventListener('resize', function () {
        if (timer !== null) clearTimeout(timer)
        timer = setTimeout(function () {
          timer = null
          applyPillPosition()
        }, 120)
      })
    })
  }

  function renderPill() {
    var pill = document.createElement('button')
    pill.type = 'button'
    pill.id = PILL_ID
    pill.setAttribute('data-dshui-ignore', '')
    pill.title = 'DSH UI Beautify：点击开关面板，按住可拖动位置'
    pill.style.cssText = [
      'position:fixed',
      'left:' + PILL_DEFAULT.left + 'px',
      'top:' + PILL_DEFAULT.top + 'px',
      'z-index:' + LAYER_Z.ownGui,
      'display:inline-flex',
      'align-items:center',
      'gap:6px',
      'padding:4px 10px',
      'border-radius:999px',
      'border:1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.18))',
      'background:var(--dsw-alias-bg-overlay, #fff)',
      'color:var(--dsw-alias-label-primary, #111)',
      'font:12px/1.6 system-ui,sans-serif',
      'cursor:grab',
      'touch-action:none',
      'user-select:none',
      'box-shadow:0 2px 10px rgba(0,0,0,.18)',
      'transition:background-color 320ms ease,color 320ms ease,border-color 320ms ease,box-shadow 320ms ease',
      'opacity:.94',
    ].join(';')

    var dot = document.createElement('span')
    dot.className = '__dshui-pill-dot'
    dot.style.cssText =
      'width:8px;height:8px;border-radius:50%;flex:none;background:var(--dsw-alias-brand-primary, #4d6bfe)'
    pill.appendChild(dot)

    var text = document.createElement('span')
    text.className = '__dshui-pill-text'
    text.textContent = pillLabel()
    pill.appendChild(text)

    // 拖动：pointerdown 起手，位移超过 4px 才算拖动（避免误触开面板）
    pill.addEventListener('pointerdown', function (event) {
      if (event.button !== undefined && event.button > 0) return
      if (event.stopPropagation) event.stopPropagation()
      var start = {
        x: event.clientX || 0,
        y: event.clientY || 0,
        left: state.pillLeft === null ? PILL_DEFAULT.left : state.pillLeft,
        top: state.pillTop === null ? PILL_DEFAULT.top : state.pillTop,
        moved: false,
      }
      state.pillDrag = start
      safe(function () {
        if (pill.setPointerCapture && event.pointerId !== undefined) pill.setPointerCapture(event.pointerId)
      })
      var onMove = function (moveEvent) {
        if (state.pillDrag !== start) return
        var dx = (moveEvent.clientX || 0) - start.x
        var dy = (moveEvent.clientY || 0) - start.y
        if (!start.moved && Math.abs(dx) + Math.abs(dy) < 4) return
        start.moved = true
        state.pillLeft = start.left + dx
        state.pillTop = start.top + dy
        var minTop = (state.titlebarHeight || 0) + 4
        if (state.pillTop < minTop) state.pillTop = minTop
        applyPillPosition()
      }
      var onUp = function () {
        safe(function () {
          document.removeEventListener('pointermove', onMove, true)
          document.removeEventListener('pointerup', onUp, true)
          document.removeEventListener('pointercancel', onUp, true)
        })
        if (state.pillDrag === start) {
          if (start.moved) {
            state.pillMoved = true // 让紧随其后的 click 不当作"点击"
            savePillPosition()
          }
          state.pillDrag = null
        }
      }
      safe(function () {
        document.addEventListener('pointermove', onMove, true)
        document.addEventListener('pointerup', onUp, true)
        document.addEventListener('pointercancel', onUp, true)
      })
    })

    pill.addEventListener('click', function (event) {
      event.stopPropagation()
      if (state.pillMoved) {
        state.pillMoved = false
        return // 刚拖动过，不算点击
      }
      toggleSwitcher()
    })
    ;['mousedown', 'keydown'].forEach(function (type) {
      pill.addEventListener(type, function (event) {
        event.stopPropagation()
      })
    })
    return pill
  }

  /* ── 方块光标（风格化）：把原生 caret 换成命令提示符式闪烁小方格 ──────────
   * DSH 输入区是 Lexical 的 contenteditable（div[data-composer-input]），
   * 浏览器原生选区可以直接量出光标矩形；量不到就回退到输入区左上角。
   * 只创建一个 fixed 覆盖层（pointer-events:none），不碰输入区任何布局/样式。
   */
  var caretBound = false
  var caretTimer = null
  var caretWatchTimer = null
  function caretStyleActive() {
    return state.installed && state.mode !== 'off' && !!document.getElementById(STYLE_ID)
  }
  function caretHost() {
    var el = document.activeElement
    if (!el || typeof el.closest !== 'function') return null
    return el.closest('[data-composer-input]')
  }
  function caretHide() {
    var node = document.getElementById(CARET_ID)
    if (node) node.style.display = 'none'
  }
  function caretShowAt(left, top, height) {
    var node = document.getElementById(CARET_ID)
    if (!node) {
      node = document.createElement('div')
      node.id = CARET_ID
      node.setAttribute('aria-hidden', 'true')
      ;(document.body || document.documentElement).appendChild(node)
    }
    node.style.left = Math.round(left) + 'px'
    node.style.top = Math.round(top) + 'px'
    node.style.height = Math.max(12, Math.round(height || 18)) + 'px'
    node.style.display = 'block'
  }
  function caretUpdate() {
    caretTimer = null
    if (!caretStyleActive()) { caretHide(); return }
    var host = caretHost()
    if (!host) { caretHide(); return }
    var sel = null
    try { sel = window.getSelection ? window.getSelection() : null } catch (err) { sel = null }
    if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) { caretHide(); return }
    var range = null
    try { range = sel.getRangeAt(0) } catch (err) { range = null }
    if (!range) { caretHide(); return }
    var container = range.startContainer
    var inside = container === host || (host.contains && host.contains(container))
    if (!inside) { caretHide(); return }
    var rect = null
    try { rect = range.getBoundingClientRect() } catch (err) { rect = null }
    var height = rect && rect.height ? rect.height : 18
    if (!rect || (!rect.height && !rect.width)) {
      // 空内容 / 选区塌陷到容器本身：回退到输入区左上角（+ 一点内边距）
      var box = safe(function () { return host.getBoundingClientRect() }, null)
      if (!box) { caretHide(); return }
      rect = { left: box.left + 8, top: box.top + 8, height: height }
    }
    caretShowAt(rect.left, rect.top, height)
  }
  function caretSchedule() {
    if (caretTimer !== null) return
    caretTimer = setTimeout(function () { safe(caretUpdate) }, 0)
  }
  function caretWatchdog() {
    if (!caretBound) return
    if (!caretStyleActive()) return
    safe(function () {
      if (!document.body) return
      if (!document.body.classList.contains('__dshui-caret-on')) document.body.classList.add('__dshui-caret-on')
      var node = document.getElementById(CARET_ID)
      if (!node) {
        node = document.createElement('div')
        node.id = CARET_ID
        node.setAttribute('aria-hidden', 'true')
        node.style.display = 'none'
        ;(document.body || document.documentElement).appendChild(node)
      }
    })
    safe(caretSchedule)
  }
  function startCaretWatchdog() {
    if (caretWatchTimer !== null) return
    caretWatchTimer = setInterval(function () { safe(caretWatchdog) }, 900)
  }
  function stopCaretWatchdog() {
    if (caretWatchTimer !== null) { clearInterval(caretWatchTimer); caretWatchTimer = null }
  }
  function bindCaretOverlay() {
    if (caretBound) return
    var supported = false
    try { supported = !!(window.getSelection && document.activeElement !== undefined) } catch (err) { supported = false }
    if (!supported) return
    caretBound = true
    safe(function () { if (document.body) document.body.classList.add('__dshui-caret-on') })
    var events = ['keyup', 'keydown', 'mouseup', 'input', 'click', 'focusin', 'focusout', 'compositionend']
    safe(function () {
      var types = events
      for (var k = 0; k < types.length; k++) document.addEventListener(types[k], caretSchedule, true)
      document.addEventListener('selectionchange', caretSchedule, true)
      window.addEventListener('scroll', caretSchedule, true)
      window.addEventListener('resize', caretSchedule, true)
    })
    safe(caretSchedule)
    startCaretWatchdog()
  }
  function unbindCaretOverlay() {
    if (!caretBound) return
    caretBound = false
    stopCaretWatchdog()
    safe(function () { if (document.body) document.body.classList.remove('__dshui-caret-on') })
    safe(function () {
      var events = ['keyup', 'keydown', 'mouseup', 'input', 'click', 'focusin', 'focusout', 'compositionend']
      for (var i = 0; i < events.length; i++) document.removeEventListener(events[i], caretSchedule, true)
      document.removeEventListener('selectionchange', caretSchedule, true)
      window.removeEventListener('scroll', caretSchedule, true)
      window.removeEventListener('resize', caretSchedule, true)
    })
    if (caretTimer !== null) { clearTimeout(caretTimer); caretTimer = null }
    safe(function () {
      var node = document.getElementById(CARET_ID)
      if (node && node.parentNode) node.parentNode.removeChild(node)
    })
  }

  function ensurePill() {
    if (!isDshPage()) return null
    var existing = safe(function () {
      return document.getElementById(PILL_ID)
    }, null)
    if (existing) {
      applyPillPosition()
      return existing
    }
    var pill = renderPill()
    ;(document.body || document.documentElement).appendChild(pill)
    safe(applyPillTheme)
    applyPillPosition()
    watchPillPlacement()
    safe(syncGuiUnderSplash)
    return pill
  }

  function updatePill() {
    safe(function () {
      var pill = document.getElementById(PILL_ID)
      if (!pill) return
      var text = pill.querySelector('.__dshui-pill-text')
      if (text) text.textContent = pillLabel()
      var open = !!state.switcherEl
      pill.style.setProperty(
        'border-color',
        open ? 'var(--dsw-alias-brand-primary, #4d6bfe)' : 'var(--dsw-alias-border-l1, rgba(0,0,0,.18))',
      )
      var dot = pill.querySelector('.__dshui-pill-dot')
      if (dot)
        dot.style.setProperty(
          'opacity',
          state.mode === 'multiply' || state.mode === 'backdrop' ? '1' : '.35',
        )
    })
  }

  function removePill() {
    safe(function () {
      var pill = document.getElementById(PILL_ID)
      if (pill && pill.parentNode) pill.parentNode.removeChild(pill)
    })
  }

  /**
   * 键盘快捷键（面板入口已改为左上角 GUI，快捷键保留为后背手段）：
   *   Ctrl+Shift+Alt+D  打开/关闭「切换器」（后备用）
   *   Ctrl+Shift+Alt+1  关闭（off）
   *   Ctrl+Shift+Alt+2  纹理（multiply）
   *   Ctrl+Shift+Alt+I  完整诊断
   */
  // 0.8.22：1=关闭，2=静态·纹理，3=动态（开发中）
  var HOTKEY_MODES = { '1': 'off', '2': 'multiply', '3': 'dynamic' }

  function onKeyDown(event) {
    if (!event || !event.ctrlKey || !event.shiftKey || !event.altKey) return
    var key = String(event.key || '')
    var mode = HOTKEY_MODES[key]
    var isSwitcher = key === 'D' || key === 'd'
    var isDiag = key === 'I' || key === 'i'
    var isMotion = key === 'M' || key === 'm'
    if (!isSwitcher && !isDiag && !isMotion && !mode) return
    safe(function () {
      event.preventDefault()
      event.stopPropagation()
    })
    if (mode) {
      if (mode === 'off') applyGroup('off')
      else if (mode === 'dynamic') applyGroup('dynamic')
      else applyGroup('static', mode)
      return
    }
    if (isDiag) {
      toggleDiag()
      return
    }
    if (isMotion) {
      state.motion.enabled = !state.motion.enabled
      saveMotionSettings()
      syncMotionClass()
      if (state.switcherEl) reRenderSwitcher()
      refreshDiag()
      return
    }
    toggleSwitcher()
  }

  // ── 启动 ──────────────────────────────────────────────────────────────────
  /**
   * 向宿主问当前背景图。
   * @param {string|null} [imgName] 指定要哪张图（白名单文件名或短名）；省略用默认图
   */
  function fetchStatus(imgName, options) {
    var url = STATUS_URL
    if (imgName) url += '?img=' + encodeURIComponent(imgName)
    return safe(
      function () {
        return fetch(url, { credentials: 'same-origin', cache: 'no-store' })
          .then(function (response) {
            return response.ok ? response.json() : null
          })
          .then(function (payload) {
            if (payload && Array.isArray(payload.images)) {
              state.images = payload.images
            }
            if (payload && Array.isArray(payload.darkImages)) {
              state.darkImages = payload.darkImages
              if (state.pendingDarkTheme && isDarkTheme()) {
                state.pendingDarkTheme = false
                setTimeout(function () { safe(function () { syncThemeImage(true) }) }, 80)
              }
            }
            if (payload && typeof payload.user === 'string') state.userName = payload.user
            if (payload && payload.ok && typeof payload.url === 'string') {
              state.source = payload.source || null
              state.bgUrl = payload.url
              state.imageName = payload.file || null
              // 偏好自愈：宿主实际给的是哪张，就记哪张。这样某张图被下架/改名后，
              // 旧的偏好不会一直指向不存在的图（否则每次启动都要回落一次）。
              if (!(options && options.noPersist) && payload.file && payload.file !== readImage()) writeImage(payload.file)
            } else if (payload && payload.ok === false) {
              // 宿主明确说图不可用：把原因记下来（层照挂，退回默认路径）。
              state.lastError = '背景图不可用: ' + String(payload.error || '未知原因')
            }
            return payload
          })
          .catch(function (err) {
            state.lastError = '状态接口失败: ' + ((err && err.message) || err)
            return null
          })
      },
      Promise.resolve(null),
    )
  }

  /**
   * 切换背景图（不刷新页面）：**交叉淡化** —— 旧图冻结在第一层内联、第二层放新图
   * 从 0 淡入、旧图同步淡出，全程两张图都在场，不经过空白；淡完把新图固化到第一层、
   * 撤掉第二层。
   *
   * 这里**不调用 installStyle()**：图片 URL 走内联样式，样式表保持静态 ——
   * 改写样式表会让浏览器重建合成层，带 mix-blend-mode 的图层可能有一帧"没混合"，
   * 90% 白的图就会整屏闪一下白光。
   * @returns {Promise<string>} 结果说明
   */
  function setImage(name, options) {
    var oldBg = state.bgUrl
    return fetchStatus(name || null, options).then(function (payload) {
      if (!payload || payload.ok === false) {
        return '切图失败：' + String((payload && payload.error) || state.lastError || '未知原因')
      }
      if (!(options && options.noPersist)) writeImage(payload.file || null)
      state.imageName = payload.file || null
      if (!state.layer || state.mode === 'off') {
        // 层还没挂：新图会在挂层时（applyModeToLayer）直接生效，不需要动样式表
        refreshDiag()
        return '背景图 = ' + String(state.imageName)
      }
      // ① 旧图冻结到第一层内联：只有在值真的不同的时候才写 —— 相同的位图重新赋值
      //    虽然逻辑上是 no-op，但没必要给浏览器任何"重新栅格化"的机会。
      logSwitch('freeze-old')
      safe(function () {
        var frozen = 'url("' + oldBg + '")'
        if (state.layer.style.getPropertyValue('background-image') !== frozen) {
          state.layer.style.setProperty('background-image', frozen)
        }
      })
      // ② 新图**加载完成**后再开始交叉淡化：否则淡化期间第二层是空的，
      //    淡完图才加载出来 → 整屏突然弹出。缓存命中几乎无感。
      traceSwitchFrames(1500)
      crossFadeWhenReady(state.layer, options)
      refreshDiag()
      return '背景图 = ' + String(state.imageName)
    })
  }

  /**
   * 换图流程的时间线（诊断用）：记录每一步的时刻，万一还闪，可以据此判断
   * 闪光落在"淡入开始前/淡化中/固化后"哪一段。
   */
  function logSwitch(stage) {
    safe(function () {
      state.switchLog.push({ t: Date.now(), stage: stage, mode: state.mode })
      if (state.switchLog.length > 10) state.switchLog.shift()
    })
  }

  /**
   * 换图期间逐帧记录图层状态（诊断用，约 1.2 秒 × 16ms）。
   *
   * 用途：万一闪光还在，这份记录能一刀切开两种可能 ——
   *   · 记录里出现"某帧主层不在 DOM / 浓度为 0" → 是我们样式的问题，按记录修；
   *   · 记录完全平滑、用户却仍看到闪 → 说明是合成器层面的空帧（我们控制不了的那层），
   *     接下来就该往"减少合成负担"的方向改，而不是继续改逻辑。
   */
  function traceSwitchFrames(durationMs) {
    var frames = []
    var startedAt = Date.now()
    var step = function () {
      var layer = state.layer
      frames.push({
        t: Date.now() - startedAt,
        main: !!layer && !!layer.parentNode,
        opacity: layer ? String(layer.style.getPropertyValue('opacity')).slice(0, 8) : null,
        l2: !!safe(function () {
          return document.getElementById(LAYER2_ID)
        }, null),
      })
      if (Date.now() - startedAt < durationMs) {
        safe(function () {
          return setTimeout(step, FADE_STEP_MS)
        }, null)
        return
      }
      state.switchTrace = frames.slice(-80)
    }
    safe(step)
  }

  /** 等新图解码完成再交叉淡化；桩环境没有 Image，直接开始。 */
  function crossFadeWhenReady(layer1, options) {
    var newUrl = state.bgUrl
    var img = null
    try {
      img = new Image()
    } catch (err) {
      img = null
    }
    if (!img) {
      crossFadeImage(layer1, options)
      return
    }
    var started = false
    var go = function () {
      if (started) return
      started = true
      logSwitch('img-ready')
      crossFadeImage(layer1, options)
    }
    try {
      img.onload = go
      img.onerror = go
      img.src = newUrl
    } catch (err) {
      go()
    }
    // 兜底：onload/onerror 都没来（罕见）时，等图真正解码完成再开始；
    // 没加载完就再等一秒 —— 宁可晚一点开始，也不能在图加载一半时闪出来。
    var fallback = function () {
      var loaded = false
      try {
        loaded = !!(img.complete && img.naturalWidth > 0)
      } catch (err) {}
      if (loaded) {
        go()
        return
      }
      setTimeout(fallback, 1000)
    }
    setTimeout(fallback, 1000)
  }

  /** 旧图淡出 + 新图淡入，完成后固化到第一层。 */
  function crossFadeImage(layer1, options) {
    if (!layer1) return
    var themeSwitch = !!(options && options.themeSwitch)
    var fromTheme = (options && options.fromTheme) || state.themeKey
    var toTheme = (options && options.toTheme) || state.themeKey
    logSwitch('fade-start')
    var target = layerOpacityTarget()
    // 上次交叉淡化没走完的残留第二层先撤掉
    var stale = safe(function () {
      return document.getElementById(LAYER2_ID)
    }, null)
    if (stale) {
      cancelLayerTween(stale)
      safe(function () {
        if (stale.parentNode) stale.parentNode.removeChild(stale)
      })
    }
    var layer2 = safe(function () {
      return document.createElement('div')
    }, null)
    if (!layer2) return
    layer2.id = LAYER2_ID
    layer2.setAttribute('aria-hidden', 'true')
    safe(function () {
      layer2.setAttribute('data-mode', state.mode)
      // 用与第一层完全相同的叠层写法（含白色薄纱），避免交叉淡化时两图层观感不一致
      layer2.style.setProperty('background-image', backgroundImageValue())
      layer2.style.setProperty('opacity', '0')
      if (themeSwitch) {
        // 交叉淡化期间钉住新旧图层各自的混合模式：
        // 深色旧图继续 lighten、浅色旧图继续 multiply，避免切主题瞬间被 CSS 规则翻转。
        layer1.style.setProperty('mix-blend-mode', themeBlendFor(fromTheme, state.mode))
        layer2.style.setProperty('mix-blend-mode', themeBlendFor(toTheme, state.mode))
      }
      layer1.parentNode.appendChild(layer2)
    })
    // 旧图层淡出后钉在 0；等两个补间都走完，视觉 = 新图 0.35 在上 + 旧图 0 在下。
    //
    // 收尾**角色互换**（v0.2.25，关键）：不做"改第一层的位图 + 删第二层"——
    // 改全屏 4K 位图会触发重新栅格化，若这一帧新位图还没就绪而第二层已被删，
    // 就会出现"没有任何背景可画"的一帧：整屏背景消失一下（用户看到的就是白光）。
    // 现在改成把第二层直接扶正为主层（它从淡化开始就一直画着新图，位图不变），
    // 只摘掉已经透明到 0 的旧层 —— 收尾这一步不碰任何位图，不产生空帧。
    var pending = themeSwitch ? 1 : 2
    var finishOne = function () {
      pending--
      if (pending > 0) return
      logSwitch('fade-end')
      safe(function () {
        layer2.id = LAYER_ID
        layer2.setAttribute('data-mode', state.mode)
        layer2.style.setProperty('opacity', String(target))
        layer2.style.removeProperty('transition')
        // 收尾把内联混合模式交还 CSS（之后主题切换由 body[data-ds-dark-theme] 规则接管）
        layer2.style.removeProperty('mix-blend-mode')
        state.layer = layer2
        if (layer1.parentNode) layer1.parentNode.removeChild(layer1)
      })
      refreshDiag()
    }
    tweenLayerOpacity(layer1, target, 0, FADE_MS, finishOne)
    tweenLayerOpacity(layer2, 0, target, FADE_MS, finishOne)
  }

  /**
   * 唯一的启用条件：这是 DSH 页面（存在 #root）。
   * 不看有没有输入框、不做探测式修改 —— 所以 v0.2 里不存在
   * 「找不到目标就放弃」这条路径，最坏也只是图被内容挡住/看不见。
   */
  function isDshPage() {
    return !!safe(function () {
      return document.getElementById('root')
    }, null)
  }

  /**
   * URL 上的应急/预览开关（刷新即生效、会写入偏好）：
   *   ?dsniang=overlay | multiply | luminosity | off
   *   ?dsniang=0.15      → 只改当前模式的浓度
   *   ?scrim=0.25        → 在图上叠一层白色薄纱，压低对比度
   */
  function readUrlOverrides() {
    var url = String(safe(function () {
      return window.location.href || ''
    }, '') || '')
    var query = url.indexOf('?') === -1 ? '' : url.slice(url.indexOf('?') + 1)
    if (!query) return null
    var params = {}
    var parts = query.split('&')
    for (var i = 0; i < parts.length; i++) {
      var eq = parts[i].indexOf('=')
      if (eq > 0) params[parts[i].slice(0, eq)] = decodeURIComponent(parts[i].slice(eq + 1))
    }
    var out = {}
    var modeParam = params.dshui !== undefined ? params.dshui : params.dsniang
    if (modeParam !== undefined) out.mode = modeParam
    if (params.scrim !== undefined) out.scrim = Number(params.scrim)
    if (params.img !== undefined) out.image = params.img
    return out.mode !== undefined || out.scrim !== undefined || out.image !== undefined ? out : null
  }

  function start() {
    // 先判页面：非 DSH 页面什么都不做（优先级高于模式开关）
    if (!isDshPage()) {
      state.status = 'not-dsh'
      return
    }
    // 本窗口标识：diag.json 的多窗口历史靠它区分（无 DevTools 也能从诊断数据里区分窗口）
    state.windowTag = String(Math.random()).slice(2, 10)
    // 先把旧前缀（旧包名时代的存档）复制到新前缀，再按新键读回
    safe(migrateLegacyStorage)
    var loaded = loadOpacities()
    if (loaded) state.opacities = loaded
    var loadedDark = loadOpacitiesDark()
    if (loadedDark) state.opacitiesDark = loadedDark
    var savedScrim = loadScrim()
    if (savedScrim !== null) state.scrim = savedScrim
    var loadedFrost = loadFrostSettings()
    if (loadedFrost) state.frost = loadedFrost
    var loadedCaret = loadCaretSettings()
    if (loadedCaret) state.caretBlur = loadedCaret.blur
    // 通透化上线前存下的"看不出来"的参数（模糊 1px / 白层 25%）一次性提到可见值
    safe(migrateFrostSettings)
    // 用户拖出来的入口位置（没有记录就用默认：窗口左上角 10,10）
    var savedPill = loadPillPosition()
    if (savedPill) {
      state.pillLeft = savedPill.left
      state.pillTop = savedPill.top
    }
    var mode = readMode()
    state.dynamicAnchors = loadAnchors() || defaultAnchors()
    state.dynamicGuides = loadDynamicGuides()
    state.dynamicLayout = loadDynamicLayout()
    state.lastStaticMode = mode === 'multiply' || mode === 'backdrop' ? mode : null
    var savedGroup = readGroup()
    state.modeGroup = savedGroup || (mode === 'off' ? 'off' : 'static')
    if (state.modeGroup === 'dynamic') {
      mode = staticGroupMode()
    } else if (state.modeGroup === 'static' && mode !== 'multiply' && mode !== 'backdrop') {
      mode = 'multiply'
    }
    // 应急开关：#dsniang-off 优先级最高，任何情况下都不动作（连左上角入口都不出现）
    var currentHash = String(window.location.hash || '')
    var emergency = currentHash === HASH_OFF || currentHash === LEGACY_HASH_OFF
    if (emergency) {
      mode = 'off'
      state.modeGroup = 'off'
      safe(function () {
        window.localStorage.setItem(STORAGE_KEY, 'off')
      })
    }
    var overrides = readUrlOverrides()
    if (overrides) {
      if (overrides.mode !== undefined) {
        if (overrides.mode !== 'off') state.modeGroup = 'static'
        if (MODES.indexOf(overrides.mode) !== -1 && overrides.mode !== 'overlay' && overrides.mode !== 'luminosity') {
          mode = overrides.mode
          writeMode(mode)
        } else if (!isNaN(Number(overrides.mode))) {
          // 数字 = 调浓度（模式保持默认「关闭」，只有以后启用才有意义）
          setModeOpacity('multiply', Math.min(1, Math.max(0, Number(overrides.mode))))
        }
      }
      if (overrides.scrim !== undefined && !isNaN(overrides.scrim)) {
        state.scrim = Math.min(SCRIM_MAX, Math.max(0, overrides.scrim))
      }
      if (overrides.image !== undefined) writeImage(overrides.image)
    }
    // 开屏动画（0.8.0）：页面加载就盖一层；开关 / 应急 / 减弱动态都在 mountSplash 里判
    safe(loadSplashSettings)
    safe(function () {
      mountSplash()
    })
    // 重启键（0.8.0）：只往标题栏菜单栏注入一个按钮，独立于模式/开屏
    safe(startRestartButton)
    // 左上角常驻入口：面板的唯一"显式"入口（快捷键仅作后备）
    if (!emergency) safe(ensurePill)
    // 监听与状态拉取**无条件**注册（off 模式下点击/快捷键处理器自己会直接放行），
    // 这样从「关闭」切到「纹理」后交互立即可用，图片候选也始终就绪。
    safe(function () {
      document.addEventListener('click', onClick, true)
      document.addEventListener('keydown', onKeyDown, true)
    })
    safe(applyCaretVars)
    safe(bindCaretOverlay)
    safe(bindHoverProbe)
    safe(syncDynamicClass)
    safe(syncAnchorGuides)
    safe(function () { if (state.modeGroup === 'dynamic') { disableDynamicEffectsCleanup(); stopDynamicEngine() } })
    safe(watchAiThinking)
    // 主题可能晚于插件脚本投影到 body：延迟再套一次自家 GUI 配色
    safe(function () {
      setTimeout(applyPillTheme, 800)
    })
    safe(function () {
      setTimeout(function () {
        reportRestartProbe('boot')
      }, 1500)
      setTimeout(function () {
        reportRestartProbe('late')
      }, 10000)
    })
    safe(watchTheme)
    safe(loadMotionSettings)
    safe(watchMotionPrefs)
    safe(syncMotionClass)
    fetchStatus(readImage()).then(function () {
      if (mode === 'off') {
        // 保持关闭：只保留状态数据（图片候选 + 深色候选），不挂任何东西
        preloadImage(state.bgUrl)
        safe(preloadThemeWallpapers)
        state.mode = 'off'
        state.status = 'off'
        updatePill()
        return
      }
      // 先按当前主题定好壁纸（深色用暗夜图），再挂层：避免先亮后暗闪一下。
      return syncThemeImage(true).then(function () {
        preloadImage(state.bgUrl)
        safe(preloadThemeWallpapers)
        safe(function () {
          applyMode(mode)
        })
        if (String(window.location.hash || '') === HASH_DIAG || String(window.location.hash || '') === LEGACY_HASH_DIAG) safe(toggleDiag)
      })
    })
  }

  /**
   * 预热“当前主题 + 另一主题”的壁纸：保留 Image 对象并主动 decode，
   * 首次切换主题时新图已经解码好，交叉淡化无需等待下载/解码。
   */
  function preloadThemeWallpapers() {
    safe(function () {
      var names = []
      var lightName = readImage() || (state.images[0] && state.images[0].name)
      if (lightName) names.push(lightName)
      if (state.darkImages[0] && state.darkImages[0].name) names.push(state.darkImages[0].name)
      state.preloadedWallpapers = state.preloadedWallpapers || []
      for (var i = 0; i < names.length; i++) {
        var name = names[i]
        var already = false
        for (var k = 0; k < state.preloadedWallpapers.length; k++) {
          if (state.preloadedWallpapers[k].name === name) already = true
        }
        if (already) continue
        try {
          var img = new Image()
          img.decoding = 'async'
          img.src = PREFIX + '/bg.png?img=' + encodeURIComponent(name)
          if (img.decode) {
            img.decode().catch(function () {})
          }
          state.preloadedWallpapers.push({ name: name, img: img })
        } catch (err) {}
      }
    })
  }

  /** 后台预热一张图（不插入 DOM）。极简桩里没有 Image 构造器，直接吞掉、不记账。 */
  function preloadImage(url) {
    if (!url) return
    try {
      var img = new Image()
      img.src = url
    } catch (err) {
      /* 无 Image 环境（测试桩）：忽略 */
    }
  }

  window.__DSHUI__ = {
    version: VERSION,
    plugin: 'dsh-ui-beautify',
    /** 开屏动画（0.8.0）：replay() 重播 / skip() 跳过 / setEnabled() 开关 / config() 快照。 */
    /** 重启键（0.8.0）：state() 快照 / click() 手动点一次 / bridge 是壳补丁状态。 */
    restart: {
      state: function () {
        return restartSnapshot()
      },
      click: function () {
        restartOnActivate(null)
        return restartSnapshot()
      },
      bridge: function () {
        return restartBridgeState()
      },
      /** 启动随包安装器启用「真重启」能力（等价于面板「启用重启键」）。 */
      enable: function () {
        return enableRestartKey()
      },
    },
    splash: {      replay: function () {
        return replaySplash()
      },
      skip: function () {
        return finishSplash('skipped')
      },
      setEnabled: function (enabled) {
        return setSplashEnabled(enabled)
      },
      /** 开屏音效开关（默认开；下次播放生效）。 */
      setSound: function (sound) {
        return setSplashSound(sound)
      },
      config: function () {
        return splashSnapshot()
      },
    },
    /** 全部可用模式，按"对阅读影响从小到大"。 */
    modes: MODES.slice(),
    status: function () {
      return {
        version: VERSION,
        mode: state.mode,
        modeGroup: state.modeGroup,
        anchors: anchorsSnapshot(),
        dynamicGuides: !!state.dynamicGuides,
        dynamic: dynamicSnapshot(),
        status: state.status,
        source: state.source,
        bgUrl: state.bgUrl,
        image: state.imageName,
        images: state.images.map(function (entry) {
          return entry.name
        }),
        layer: !!state.layer,
        /** 动效底座 + 帧时间探针（P0，0.7.0）。 */
        motion: motionSnapshot(),
        /** 变更风暴熔断（0.7.1）。 */
        perf: perfSnapshot(),
        /** 本次从旧前缀迁移的键数量。 */
        storageMigrated: state.storageMigrated,
        /** 开屏动画（0.8.0）：开关 / 状态 / 耗时 / URL。 */
        splash: splashSnapshot(),
        /** 重启键（0.8.0）：按钮 / 壳补丁 / 忙碌态。 */
        restart: restartSnapshot(),
        /** 壁纸体检（0.6.4）：`issues` = 最近修过什么，`covers` = 清掉的链外盖子。 */
        wallpaper: {
          text: wallpaperDiagText(),
          painted: !!state.layerPainted,
          issues: state.wallpaperHealed.slice(),
          repairs: state.wallpaperRepairs,
          covers: state.coverCleared.slice(),
          coverCount: state.coverCount,
          lagMs: state.wallpaperLastLagMs,
        },
        opacity: opacityFor(state.mode),
        opacities: {
          overlay: opacityFor('overlay'),
          multiply: opacityFor('multiply'),
          luminosity: opacityFor('luminosity'),
        },
        frost: {
          enabled: state.frost.enabled,
          layered: state.frost.layered,
          layeredApplied: !!state.layerBackup,
          /** true = 分层已到位（可能是应用自带、我们一行没动）。 */
          layeredReady: state.layeringApplied,
          layering: state.layeringInfo,
          blur: state.frost.blur,
          alpha: state.frost.alpha,
          active: frostActive(),
          targets: state.frostTargetCount || 0,
          /** 扩展表面数量（问答窗口 + 二级面板）。 */
          extra: state.frostExtraCount || 0,
          /** 二级面板数量：走下面那套**单独**的毛玻璃参数。 */
          panels: state.frostPanelCount || 0,
          /** DSH 自己的二级面板（role=dialog / role=menu）。 */
          dshPanels: state.frostDshCount || 0,
          /** 聊天内的代码块/文件卡片（0.6.0，背景模式专属）。 */
          chatExtras: state.frostChatCount || 0,
          /** 其中代码块的数量（0.6.1：代码块内层底色已清，玻璃才透得出来）。 */
          chatBlocks: state.frostChatBlocks || 0,
          /** 其中文件卡片的数量（0.6.1）。 */
          chatFiles: state.frostChatFiles || 0,
          /** 二级面板的毛玻璃参数（固定值，不跟主滑块走）。 */
          panelBlur: FROST_PANEL_BLUR,
          panelAlpha: FROST_PANEL_ALPHA,
          /** DSH 自己的二级面板的独立模糊度（0.4.0 起有专属滑块）。 */
          dshBlur: state.frost.dshBlur,
          /** 白层是竖向渐变：顶部更实、底部更透（面板上两个滑块可调、会存档）。 */
          panelAlphaTop: state.frost.panelTop,
          panelAlphaBottom: state.frost.panelBottom,
          /** 纹理模式气泡视觉（顶部高光/柔和投影，用户气泡 + 输入框）。 */
          bubbleFx: state.frost.bubbleFx,
          /** 气泡视觉的 body 开关类当前是否真的挂在页面上（诊断用）。 */
          bubbleFxActive: !!safe(function () {
            return document.body && document.body.classList.contains(BUBBLE_FX_CLASS)
          }, false),
          /** 纹理模式 AI 回复区域视觉（左侧细线/淡渐变）。 */
          aiReplyFx: state.frost.aiReplyFx,
          aiReplyFxActive: !!safe(function () {
            return document.body && document.body.classList.contains(AI_FX_CLASS)
          }, false),
          aiReplyTargets: safe(function () {
            return document.querySelectorAll(AI_REPLY_SELECTOR).length
          }, 0),
          aiStepTargets: safe(function () {
            return document.querySelectorAll(AI_STEP_SELECTOR).length
          }, 0),
          /** 用户气泡自己的白层（太低气泡形状会消失）。 */
          bubbleTransparency: state.frost.bubbleTransparency,
          bubbleBlur: state.frost.bubbleBlur,
          bubbleColor: state.frost.bubbleColor,
          /** 二级面板打开时那层变暗遮罩的渐变参数（径向渐变：中心 / 边缘）。 */
          panelMaskCenter: PANEL_MASK_CENTER,
          panelMaskEdge: PANEL_MASK_EDGE,
          /** 最近一次气泡扫描统计：候选/收下/被宽·高·容器·输入·非我 跳过各多少条。 */
          bubbleScan: state.bubbleScan,
          /** 通透化：清掉了哪些遮挡层（空数组 = 没遮挡或没认出消息区）。 */
          cleared: state.frostCleared.slice(),
          /** true = 通透化已经处理过（可能清了 0 层）。 */
          clearedReady: !!state.frostClearedReady,
          card: safe(function () {
            var card = findComposerCard()
            return card ? card.className : null
          }, null),
        },
        scrim: state.scrim,
        /** 当前主题（薄纱颜色随它走：亮=白纱、暗=深纱）。 */
        theme: isDarkTheme() ? 'dark' : 'light',
        override: state.override,
        /** 淡入淡出进行中：淡出卸载未完成 / 毛玻璃参数补间未结束。 */
        transition: {
          fadingOut: !!state.fadingOut,
          frostAnimating: !!state.frostAnim,
        },
        error: state.lastError,
      }
    },
    /** 纯文本诊断，可直接复制给人看。 */
    diagnose: diagLines,
    /**
     * **一键重贴**（0.6.3）：把当前模式该贴的东西全部重认一遍 —— 壁纸层背景/浓度、
     * 通透化（座位遮挡）、整页透明化（背景模式）、毛玻璃打标、分层守卫。
     *
     * 用途：用户没有 DevTools。万一哪天切对话/换视图又出现"背景失效"，
     * 让他按一下（或自己在控制台敲）就能立刻恢复，同时也是一条**排障入口** ——
     * 返回值会带上自愈计数，能区分"没跑"和"跑了但没用"。
     */
    reapply: function () {
      var mode = state.mode
      if (mode !== 'multiply' && mode !== 'backdrop') {
        return '当前是「关闭」：没有需要重贴的东西（先用面板切到「纹理」或「背景」）'
      }
      var cleared = 0
      var pageCleared = 0
      safe(function () {
        applyLayerBackground()
        applyLayerOpacity()
        repairPass(true) // force：一键重贴不做节流，盖子扫描也当场跑
        cleared = state.frostCleared.length
        pageCleared = state.backdropCleared.length
      })
      return (
        '已重贴：遮挡 ' +
        cleared +
        ' 层 / 整页 ' +
        pageCleared +
        ' 层（自愈计数 ' +
        state.frostRepairs +
        ' / ' +
        state.backdropRepairs +
        '）'
      )
    },
    setMode: function (mode) {
      if (mode === 'off') {
        applyGroup('off')
        return '已关闭：淡出后一切恢复默认'
      }
      if (mode === 'dynamic') {
        applyGroup('dynamic')
        return '已切换到 动态（开发中）'
      }
      if (mode === 'luminosity' || mode === 'overlay') return '该旧模式已弃用（仅兼容旧存档），请用 关闭 / 静态 / 动态'
      if (mode !== 'multiply' && mode !== 'backdrop') return '无效模式：' + String(mode) + '（可用：off / multiply / backdrop / dynamic）'
      applyGroup('static', mode)
      return '已切换到 静态 · ' + (mode === 'multiply' ? '纹理' : '背景')
    },
    /** 顶层分组：off / static / dynamic。 */
    setGroup: function (group) {
      if (GROUPS.indexOf(group) === -1) return '无效分组：' + String(group)
      applyGroup(group)
      return groupLabel(group)
    },
    groups: GROUPS.slice(),
    /** 动态模式定位锚点（视口百分比 0~1）。 */
    dynamic: {
      status: dynamicSnapshot,
      evaluate: function () { safe(evaluateDynamicEngine); return dynamicSnapshot() },
      preview: setDynamicPreview,
      importLayout: importDynamicLayout,
      resetLayout: resetDynamicLayout,
    },
    anchors: {
      get: anchorsSnapshot,
      set: function (id, x, y) {
        return setAnchor(id, x, y) ? anchorsSnapshot() : null
      },
      reset: function () {
        state.dynamicAnchors = defaultAnchors()
        saveAnchors()
        if (state.anchorTool) positionAllAnchors()
        refreshDiag()
        return anchorsSnapshot()
      },
      save: function () {
        saveAnchors()
        refreshDiag()
        return anchorsSnapshot()
      },
      showGuides: setDynamicGuides,
      guides: function () { return !!state.dynamicGuides },
      openTool: openAnchorTool,
      closeTool: function () { return closeAnchorTool(true) },
    },
    /** 设置当前模式的浓度（0~1）。 */
    setOpacity: function (value) {
      var next = Number(value)
      if (!(next >= 0 && next <= 1)) return '浓度需在 0~1 之间'
      setModeOpacity(state.mode, next)
      applyLayerOpacity()
      return '当前模式浓度 = ' + next
    },
    /**
     * 在图上叠一层主题薄纱（0~0.9）：亮色=白纱、暗色=深纱，压住图的对比度让文字更好认。
     * v0.6.2：上限与滑块/存档校验对齐成 `SCRIM_MAX`（以前 API 允许 1，而存档校验只认 ≤0.9
     * → `setScrim(1)` 看着生效、一刷新又悄悄没了）。
     */
    setScrim: function (value) {
      var next = Number(value)
      if (!(next >= 0 && next <= SCRIM_MAX)) return '薄纱强度需在 0~' + SCRIM_MAX + ' 之间'
      state.scrim = next
      applyLayerBackground()
      return '薄纱强度 = ' + next
    },
    /** 开关毛玻璃（纹理模式下作用于输入卡片）。 */
    setFrostEnabled: function (value) {
      state.frost.enabled = value !== false
      saveFrostSettings()
      refreshFrost()
      return '毛玻璃：' + (state.frost.enabled ? '开' : '关')
    },
    /** 纹理模式气泡视觉：细描边 + 顶部高光 + 柔和投影。 */
    /** 方块光标光晕模糊（0~16px）。 */
    setCaretBlur: function (value) {
      var blur = setCaretBlur(value)
      return '光标模糊 = ' + blur + 'px'
    },
    setBubbleFx: function (value) {
      state.frost.bubbleFx = value !== false
      saveFrostSettings()
      syncBubbleFxClass()
      if (state.switcherEl) reRenderSwitcher()
      return '气泡视觉：' + (state.frost.bubbleFx ? '开' : '关')
    },
    /** 读取当前 AI 思维链（只读 DOM）：行数 + 前 20 行文字摘要，供调试/动画扩展。 */
    thinkingRows: function () {
      return readThinkingRows()
    },
    /** 纹理模式 AI 回复区域视觉：左侧细线 + 淡渐变。 */
    setAiReplyFx: function (value) {
      state.frost.aiReplyFx = value !== false
      saveFrostSettings()
      syncAiReplyFxClass()
      if (state.switcherEl) reRenderSwitcher()
      return 'AI 思考过程视效：' + (state.frost.aiReplyFx ? '开' : '关')
    },
    /** 设置毛玻璃模糊强度（0~30px）。 */
    setFrostBlur: function (value) {
      var next = Number(value)
      if (!(next >= 0 && next <= 30)) return '模糊强度需在 0~30 之间'
      state.frost.blur = next
      saveFrostSettings()
      setFrostNow(state.frost.blur, state.frost.alpha)
      if (state.switcherEl) reRenderSwitcher()
      return '毛玻璃模糊 = ' + next + 'px'
    },
    /** 设置毛玻璃白层浓度（v0.6.2 起 0.02~0.85；以前是 0.15~0.85）。 */
    setFrostAlpha: function (value) {
      var next = Number(value)
      if (!(next >= FROST_ALPHA_MIN && next <= FROST_ALPHA_MAX)) {
        return '白层浓度需在 ' + FROST_ALPHA_MIN + '~' + FROST_ALPHA_MAX + ' 之间'
      }
      state.frost.alpha = next
      saveFrostSettings()
      setFrostNow(state.frost.blur, state.frost.alpha)
      if (state.switcherEl) reRenderSwitcher()
      return '毛玻璃白层 = ' + next
    },
    /** 「分层」已不在面板里提供开关（程序内常开）；此 API 仅留作内部/排障钩子。 */
    setLayering: function (value) {
      state.frost.layered = value !== false
      saveFrostSettings()
      refreshFrost()
      if (state.frost.layered && frostActive()) applyLayering(true)
      else revertLayering()
      return '分层：' + (state.frost.layered ? '开' : '关') + (state.layerBackup ? '（已生效）' : state.frost.layered ? '（未找到可调整的结构）' : '')
    },
    /** 布局诊断：返回最近一次上报的几何快照。 */
    layoutReport: function () {
      return reportLayout()
    },
    /** 动效总开关（0.7.0，默认关）：true/false，会存档。 */
    setMotion: function (value) {
      state.motion.enabled = value !== false
      saveMotionSettings()
      syncMotionClass()
      if (state.switcherEl) reRenderSwitcher()
      refreshDiag()
      return '动效：' + (state.motion.enabled ? '开' : '关')
    },
    /** 动效底座 + 帧探针的读数（0.7.0）。 */
    motion: function () {
      return motionSnapshot()
    },
    /**
     * **壁纸体检**（0.6.4）：现在扫一遍，返回一行可读结论 —— 用户没有 DevTools，
     * 这一个调用就能说清"壁纸是不是还在、被谁盖住了、我修了没有"。
     * 例：`壁纸: 图层在 · 链外盖子 1 个：div._loading（已清）· 自愈 2 次`
     */
    wallpaper: function () {
      var issues = layerHealth()
      var covers = scanWallpaperCovers()
      var healed = false
      if (issues.length) {
        healWallpaperLayer(issues)
        healed = true
      }
      if (state.mode === 'backdrop') healWallpaperCovers(covers)
      var bits = []
      bits.push(state.layer && state.layer.parentNode ? '图层在' : '图层缺（已补）')
      bits.push('图 ' + (state.bgUrl ? state.imageName || state.bgUrl : '无（已重拉）'))
      bits.push('浓度 ' + opacityFor(state.mode))
      if (covers.length) {
        bits.push(
          '链外盖子 ' +
            covers.length +
            ' 个：' +
            covers
              .map(function (el) {
                return nodeLabel(el)
              })
              .join('、') +
            '（已清）',
        )
      } else {
        bits.push('没有链外盖子')
      }
      if (state.coverCount) bits.push('旧盖子记录 ' + state.coverCount + ' 个')
      if (healed || issues.length) bits.push('本次修了 ' + issues.join('/'))
      bits.push('自愈累计 ' + state.wallpaperRepairs + ' 次')
      return bits.join(' · ')
    },
    restore: triggerRestore,
    /** 打开/关闭「切换器」面板（纯鼠标点选模式）。 */
    switcher: toggleSwitcher,
    /** 打开/关闭完整诊断面板。 */
    diagnostics: toggleDiag,
    diag: toggleDiag,
    /** 撤销插件的一切改动并移除自己的节点（模式偏好保留）。 */
    uninstall: function () {
      uninstall()
      return '已卸载：层、样式、被改过的背景色都已还原'
    },
  }

  // 启动也包在 safe 里：任何意外都只留一笔日志，绝不影响页面。
  safe(start)
})()
