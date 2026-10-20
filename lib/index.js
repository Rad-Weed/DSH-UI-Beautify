/**
 * DSH UI Beautify —— Host 半区
 * ============================================================================
 * 职责（全部在 DSH 宿主的 Node 进程里跑）：
 *
 *   1. `/dsh-ui-beautify/status.json` —— 报告当前背景图解析到了哪个来源；
 *   2. `/dsh-ui-beautify/bg.png`      —— 把背景图字节喂给浏览器（桌面原图优先，
 *      包内 assets/deepseek-4k.webp 兜底）；
 *   3. `/dsh-ui-beautify/client.js`   —— 前端半区（纯浏览器 JS，无构建、无依赖，
 *      按 mtime 重读：改完刷新页面即生效，不必重启宿主）；
 *   4. `/dsh-ui-beautify/splash.html` —— 开屏动画页（用户提供的单文件 HTML，宿主注入桥接脚本后返回）；
 *   5. 把 <script defer src="/dsh-ui-beautify/client.js"> 注入 index.html。
 *
 * 注入有两条通道，桌面端与网页端各走一条：
 *   - `tapIndex`（函数变换）：网页端 index.html 每次渲染都会过一遍；
 *   - `webserver/index-inject` 结构化行：**官方 Electron 桌面壳**直接从安装包
 *     静态 dist 读 index.html，不经过 renderIndex()，只有这条通道能到。
 *     桌面壳的注入表是「宿主启动时收集一次」的，所以这一行必须在 apply() 的
 *     最开头注册（不依赖任何服务），否则会错过收集时机。
 *     该行刻意用**内联 script 并自行吞掉 onerror**（而不是 script-src 行）：
 *     桌面壳的页面侧解释器一旦 script-src 加载失败会 reject 掉整个 boot（白屏），
 *     内联行最坏只是「美化不生效」，绝不会挡住应用启动。
 *
 * 安全：所有路由都只服务本插件自己的只读资源，不写盘、不返回用户数据。
 * 仍然套一层轻量栅栏（跨站标记 / 非回环 Host + 外部 Origin）以对齐
 * DSH 自带插件的安全基线。
 */

import fs from 'node:fs'
import path from 'node:path'
// 唯一的 child_process 用法：用户在面板点「启用重启键」时启动随包壳补丁安装器（不自动执行）
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

// lib/index.js -> 包根目录；这样插件被 npm link / node_modules 安装时仍然可定位。
const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const LIB_DIR = path.join(PACKAGE_ROOT, 'lib')

export const PLUGIN_VERSION = '0.8.4'

/** 所有本插件路由的公共前缀。 */
export const ROUTE_PREFIX = '/dsh-ui-beautify'

/** 桌面上的默认背景图（用户明确指定的来源，优先使用）。 */
export const DESKTOP_IMAGE_NAME = 'deepseek 4k.png'

/** 可切换的桌面背景图白名单（按这个顺序出现在客户端的候选里）。 */
export const DESKTOP_IMAGE_CANDIDATES = [
  'deepseek 4k.png',
  'deepseek 黑白无水面.png',
]

/**
 * 展示名：键是桌面真实文件名，值是切换器里显示的名字。
 * 文件名必须保持原样（要拿去读盘），只有按钮文字换掉。
 */
export const IMAGE_LABELS = {
  'deepseek 4k.png': 'deepseek',
}

/**
 * 包内兜底图：桌面上的同名图缺失时用它。
 *
 * 键 = 桌面候选文件名（这是**对外身份**：客户端的按钮、localStorage 偏好、
 * `?img=` 参数都用它）；值 = 包内 `assets/` 下的实际文件名（纯 ASCII，
 * 避免 asar / zip / npm 里出现中文路径）。
 *
 * v0.2.31 起**两张图都随包发布** —— 换台电脑没把图拷到桌面时，切换器里依然
 * 是「deepseek / deepseek 黑白无水面」两个选项，而不是只剩一个。
 *
 * v0.7.0 起包内兜底图换 **WebP**（q90 实测：4k 1.60 MB → 0.18 MB、
 * 黑白 1.86 MB → 0.16 MB）：身份名不变，只有落盘扩展名变了。
 */
export const BUNDLED_IMAGE_NAMES = {
  'deepseek 4k.png': 'deepseek-4k.webp',
  'deepseek 黑白无水面.png': 'deepseek-bw-nowater.webp',
}

/** 兼容旧存档：全名 / 去扩展名短名 / 包内文件名（新旧扩展名都认）→ 候选身份名。 */
const IMAGE_ALIASES = (() => {
  const map = {}
  for (const name of DESKTOP_IMAGE_CANDIDATES) {
    map[name] = name
    map[name.replace(/\.(png|webp)$/i, '')] = name
    const bundled = BUNDLED_IMAGE_NAMES[name]
    if (bundled) {
      map[bundled] = name
      map[bundled.replace(/\.(png|webp)$/i, '')] = name
      // 旧版包内文件名（.png）也要认：老存档里躺着它
      const legacy = bundled.replace(/\.webp$/i, '.png')
      map[legacy] = name
      map[legacy.replace(/\.png$/i, '')] = name
    }
  }
  return map
})()

/** 取候选图对应的包内兜底文件路径（没有兜底则 null）。 */
export function bundledImagePath(name) {
  const bundled = BUNDLED_IMAGE_NAMES[name]
  return bundled ? path.join(PACKAGE_ROOT, 'assets', bundled) : null
}

/** 把任意写法（全名 / 短名 / 包内文件名）规范化成候选身份名；不认则 null。 */
export function normalizeImageName(name) {
  return IMAGE_ALIASES[String(name || '')] || null
}

/** 取一张图的展示名（没有特例就用去掉扩展名的文件名）。 */
export function imageLabelFor(name) {
  if (IMAGE_LABELS[name]) return IMAGE_LABELS[name]
  return String(name || '').replace(/\.(png|webp)$/i, '')
}

/** 包内兜底图（4k 那张，向后兼容的常量）。 */
export const BUNDLED_IMAGE_NAME = BUNDLED_IMAGE_NAMES[DESKTOP_IMAGE_NAME]

const CLIENT_JS_NAME = 'client.js'

/**
 * 前端脚本的 URL **带版本号**：换个版本就换个 URL，浏览器就不可能拿旧的缓存版本
 * （桌面壳的页面是常驻的，靠刷新很难保证拿到新脚本 —— 这是踩过的坑）。
 * 路由本身按 pathname 精确匹配，查询串不参与匹配。
 */
const CLIENT_JS_URL = `${ROUTE_PREFIX}/client.js?v=${PLUGIN_VERSION}`

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
}

const JS_HEADERS = {
  'Content-Type': 'application/javascript; charset=utf-8',
  'Cache-Control': 'no-store',
}
const HTML_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
}

/** 开屏动画：用户提供的单文件 HTML（assets/splash.html，磁盘上保持原样）。 */
const SPLASH_HTML_NAME = 'splash.html'
const SPLASH_HTML_PATH = path.join(PACKAGE_ROOT, 'assets', SPLASH_HTML_NAME)

/** 随包桌面壳补丁工具（restart/）：面板「启用重启键」按钮用它启动安装器。 */
const RESTART_DIR = path.join(PACKAGE_ROOT, 'restart')
const RESTART_INSTALLER = path.join(RESTART_DIR, 'scripts', 'install-restart-key.ps1')
/** 补丁工具写进 app.asar 尾部数据区的标记（只用来判断「已安装」）。 */
const SHELL_PATCH_MARKER = 'DSH-RESTART-BUTTON BEGIN'
const SHELL_PATCH_TAIL_BYTES = 8 * 1024 * 1024


/**
 * 按 mtime 缓存文件字节：改图/改脚本后刷新页面即生效，不重启宿主。
 * cache 是调用方持有的空对象（不能是 null —— Object.assign 会抛）。
 * @returns {{ bytes: Buffer, mtimeMs: number }}
 */
function loadCached(cache, filePath) {
  const stat = fs.statSync(filePath)
  if (cache && cache.mtimeMs === stat.mtimeMs) return cache
  const next = { bytes: fs.readFileSync(filePath), mtimeMs: stat.mtimeMs }
  if (cache) Object.assign(cache, next)
  return next
}

/**
 * 解析桌面原图路径：中英文桌面目录名都要认（Windows 中文版是「桌面」，
 * 英文版是 Desktop，OneDrive 重定向后两种都可能）。
 * 命中存在的那一个；都不存在时返回首选候选路径（用于日志/错误提示）。
 *
 * @param {string} home 用户主目录
 * @param {string} [name] 图片文件名（默认用 DESKTOP_IMAGE_NAME）
 * @returns {string} 该图片在桌面上的路径
 */
export function resolveDesktopImagePath(home, name) {
  const fileName = name || DESKTOP_IMAGE_NAME
  const candidates = [
    path.join(home, 'Desktop', fileName),
    path.join(home, '桌面', fileName),
    path.join(home, 'OneDrive', 'Desktop', fileName),
    path.join(home, 'OneDrive', '桌面', fileName),
  ]
  for (const file of candidates) {
    try {
      if (fs.statSync(file).isFile()) return file
    } catch (err) {}
  }
  return candidates[0]
}

/**
 * 列出一张候选图的**可用来源**：桌面原图优先 → 包内兜底图。
 * 只认白名单里的文件名 —— 不对桌面做任意文件读取。
 *
 * @param {string} home 用户主目录
 * @returns {Array<{ name: string, source: 'desktop' | 'bundled', path: string, bytes: number }>}
 */
export function listAvailableImages(home) {
  const found = []
  for (const name of DESKTOP_IMAGE_CANDIDATES) {
    const attempts = [
      { source: 'desktop', file: resolveDesktopImagePath(home, name) },
      { source: 'bundled', file: bundledImagePath(name) },
    ]
    for (const attempt of attempts) {
      if (!attempt.file) continue
      try {
        const stat = fs.statSync(attempt.file)
        if (stat.isFile() && stat.size > 0) {
          found.push({ name, source: attempt.source, path: attempt.file, bytes: stat.size })
          break
        }
      } catch (err) {}
    }
  }
  return found
}

/**
 * 按**候选身份名**取图：桌面原图优先 → 包内兜底图。
 * @param {string} home 用户主目录
 * @param {string} [name] 候选身份名（全名/短名/包内文件名都认；不认则回落默认图）
 * @returns {{ name: string, source: 'desktop' | 'bundled', file: string, bytes: Buffer }}
 * @throws {Error} 两处都没有时抛错（调用方转 404/JSON 错误）
 */
export function resolveImageSource(home, name) {
  const identity = normalizeImageName(name) || DESKTOP_IMAGE_NAME
  const attempts = [
    { source: 'desktop', file: resolveDesktopImagePath(home, identity) },
    { source: 'bundled', file: bundledImagePath(identity) },
  ]
  const misses = []
  for (const attempt of attempts) {
    if (!attempt.file) continue
    try {
      const stat = fs.statSync(attempt.file)
      if (!stat.isFile()) throw new Error('not a regular file')
      return {
        name: identity,
        source: attempt.source,
        file: attempt.file,
        bytes: fs.readFileSync(attempt.file),
      }
    } catch (err) {
      misses.push(`${attempt.source}: ${String((err && err.message) || err)}`)
    }
  }
  throw new Error(`背景图不可用（${misses.join(' | ')}）`)
}

/**
 * 背景图解析顺序：桌面原图 → 包内兜底图（按候选身份名挑兜底文件）。
 * 路由现在走 `resolveImageSource()`（它同时给出身份名）；这个按路径的变体保留给
 * 单测与外部调用，语义一致。
 * @param {string} desktopPath
 * @param {string} [name] 候选身份名（决定用哪个包内兜底文件）
 * @returns {{ source: 'desktop' | 'bundled', file: string, bytes: Buffer }}
 * @throws {Error} 两处都不存在时抛错（调用方转 404/JSON 错误）
 */
export function resolveBackgroundBytes(desktopPath, name) {
  const candidates = [{ source: 'desktop', file: desktopPath }]
  const bundled = bundledImagePath(normalizeImageName(name) || DESKTOP_IMAGE_NAME)
  if (bundled) candidates.push({ source: 'bundled', file: bundled })
  const misses = []
  for (const candidate of candidates) {
    try {
      const stat = fs.statSync(candidate.file)
      if (!stat.isFile()) throw new Error('not a regular file')
      return { source: candidate.source, file: candidate.file, bytes: fs.readFileSync(candidate.file) }
    } catch (err) {
      misses.push(`${candidate.source}: ${String((err && err.message) || err)}`)
    }
  }
  throw new Error(`背景图不可用（${misses.join(' | ')}）`)
}

/**
 * 轻量信任栅栏：与 DSH 自带插件同口径的最小校验。
 * 只读路由，拒绝跨站与「外部 Origin + 非回环 Host」的组合即可。
 * @returns {number | null} 需要拒绝时返回状态码，放行返回 null
 */
/**
 * 开屏动画页的「桥接注入」：磁盘上的 assets/splash.html 保持原样，只在**返回浏览器的那一份**
 * 里往 `<head>` 后插入一小段脚本：
 *
 *   1. `?cfg=<urlencoded JSON>` → `window.__DSH_STARTUP__`（开屏页自己的配置接口）；
 *   2. 隐藏它自带的「假界面 mock」和控制台（集成态不需要）；
 *   3. 结束时 `postMessage({__dshuiSplash:"done"})` 给父页面；父页面也能发 skip；
 *   4. JS 异常 `postMessage({__dshuiSplash:"error"})`，父页面据此兜底揭幕。
 *
 * 这样开屏页以后还能单独迭代（换文件即可），插件这边不用改。
 */
export function injectSplashBridge(html) {
  const bridge = [
    '<style>#mockApp,#d2console{display:none!important}html,body{background:#16171f}</style>',
    '<script>',
    '(function(){',
    'var cfg={};',
    'try{var q=new URLSearchParams(location.search);var raw=q.get("cfg");if(raw)cfg=JSON.parse(raw)||{};}catch(e){}',
    'window.__DSH_STARTUP__=cfg;',
    /* 0.8.0：Windows 原生窗口按钮（最小化/最大化/关闭）在标题栏区域上方，
     * 开屏页顶部文字（品牌/步骤计数/SKIP）会被挡住 —— 按父页面量出的标题栏高度整体下移。 */
    'try{var tb=Number(cfg.titlebar);if(tb>0&&tb<120){var st=document.createElement("style");' +
      'st.textContent="#dsh2-root .d2-brand{top:"+(32+tb)+"px!important}' +
      '#dsh2-root .d2-stepcount{top:"+(36+tb)+"px!important}' +
      '#dsh2-root .d2-skip{top:"+(64+tb)+"px!important}";' +
      'document.head.appendChild(st);}}catch(e){}',
    'function send(msg){try{if(window.parent&&window.parent!==window)window.parent.postMessage(msg,"*")}catch(e){}}',
    'window.addEventListener("dsh-startup:done",function(){send({__dshuiSplash:"done"})},false);',
    'window.addEventListener("error",function(e){send({__dshuiSplash:"error",message:String((e&&e.message)||e).slice(0,300)})},false);',
    'window.addEventListener("message",function(e){var d=e&&e.data;if(!d||d.__dshuiSplash!=="skip")return;try{var api=window.DSH2_SPLASH_API__;if(api&&api.skip)api.skip();}catch(err){send({__dshuiSplash:"error",message:String((err&&err.message)||err).slice(0,300)})}},false);',
    'send({__dshuiSplash:"playing"});',
    '})();',
    '</script>',
  ].join('')
  const head = html.indexOf('<head>')
  if (head < 0) return bridge + html
  return html.slice(0, head + 6) + bridge + html.slice(head + 6)
}

/**
 * 解析 DSH 安装目录里的 app.asar（纯函数，便于测试）：
 *   ① 主进程可用 process.resourcesPath；
 *   ② Cordis Host 跑在独立 node 进程里（resourcesPath 为 undefined）→ 从 execPath 逐级向上找
 *      `resources/app.asar`（node.exe 在 resources/runtime/... 下，向上 6~8 级即到安装根）；
 *   ③ 再退回常见安装位置（环境变量 / 默认路径）。
 * @returns {string} 找到的 app.asar 绝对路径；找不到返回空串。
 */
export function resolveShellPatchAsarPath(options) {
  const opts = options || {}
  const resourcesPath = opts.resourcesPath !== undefined ? opts.resourcesPath : process.resourcesPath
  const execPath = opts.execPath !== undefined ? opts.execPath : process.execPath
  const env = opts.env || process.env
  const exists = opts.exists || ((candidate) => { try { return fs.existsSync(candidate) } catch (err) { return false } })
  if (resourcesPath) {
    const direct = path.join(resourcesPath, 'app.asar')
    if (exists(direct)) return direct
  }
  try {
    let dir = execPath ? path.dirname(execPath) : ''
    for (let i = 0; i < 10 && dir; i++) {
      const candidate = path.join(dir, 'resources', 'app.asar')
      if (exists(candidate)) return candidate
      const parent = path.dirname(dir)
      if (!parent || parent === dir) break
      dir = parent
    }
  } catch (err) {}
  // 环境变量给的安装位置优先，最后才用本机常见的 D:\DSH
  const bases = [
    env.DSH_INSTALL || '',
    env.ProgramFiles ? path.join(env.ProgramFiles, 'DeepSeek Harness') : '',
    env.LOCALAPPDATA ? path.join(env.LOCALAPPDATA, 'Programs', 'DeepSeek Harness') : '',
    'D:\\DSH',
  ]
  for (const base of bases) {
    if (!base) continue
    const candidate = path.join(base, 'resources', 'app.asar')
    if (exists(candidate)) return candidate
  }
  return ''
}

/** 当前进程环境下 app.asar 的路径（找不到返回空串）。 */
function shellPatchAsarPath() {
  return resolveShellPatchAsarPath()
}

/** 读 app.asar 尾部字节，判断桌面壳补丁是否已安装（补丁块追加在文件末尾）。 */
export function detectShellPatchInAsar(asarPath) {
  if (!asarPath) return false
  try {
    const stat = fs.statSync(asarPath)
    const length = Math.min(stat.size, SHELL_PATCH_TAIL_BYTES)
    const start = Math.max(0, stat.size - length)
    const fd = fs.openSync(asarPath, 'r')
    try {
      const buf = Buffer.alloc(length)
      if (fs.readSync(fd, buf, 0, length, start) !== length) return false
      return buf.includes(SHELL_PATCH_MARKER)
    } finally {
      fs.closeSync(fd)
    }
  } catch (err) {
    return false
  }
}

/** 当前壳补丁状态（只读）。 */
function shellPatchStatus() {
  const asar = shellPatchAsarPath()
  return {
    desktop: process.platform === 'win32',
    patched: detectShellPatchInAsar(asar),
    installerAvailable: fs.existsSync(RESTART_INSTALLER),
  }
}

/**
 * 启动随包的桌面壳补丁安装器（用户点击面板按钮才调用）。
 * 安装器自己会检测 DSH 是否在运行：在运行 → 用 WMI 起独立编排进程等 DSH 退出后打补丁并重启；
 * 所以这里只需 detached 启动、马上返回。
 */
function launchRestartInstaller() {
  const state = shellPatchStatus()
  if (!state.desktop) return { ok: false, error: '仅 Windows 桌面端支持' }
  if (state.patched) return { ok: true, already: true, message: '壳补丁已安装' }
  if (!state.installerAvailable) return { ok: false, error: '找不到 restart/scripts/install-restart-key.ps1（包不完整）' }
  if (process.env.DSHUI_NO_SPAWN === '1') return { ok: true, dryRun: true, message: '测试模式：未真的启动安装器' }
  try {
    const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', RESTART_INSTALLER], {
      cwd: RESTART_DIR,
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    })
    child.unref()
    return { ok: true, started: true, message: '已启动安装器：请从托盘完全退出 DSH，后台会自动打补丁并重启' }
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err).slice(0, 200) }
  }
}

export function selfRejection(req) {
  try {
    const headers = (req && req.headers) || {}
    const host = String(headers.host || '')
    const hostname = host.replace(/:\d+$/, '').replace(/^\[/, '').replace(/\]$/, '').toLowerCase()
    if (!hostname || /[\s/\\]/.test(hostname)) return 403 // 缺 Host / 畸形 → 拒
    const loopback =
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname === '::1' ||
      /^127\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(hostname)
    const site = String(headers['sec-fetch-site'] || '').toLowerCase()
    if (site === 'cross-site') return 403
    const origin = headers.origin
    if (typeof origin === 'string' && origin && origin !== 'null') {
      if (!loopback) return 403 // 非回环 Host + 带 Origin → 一律拒
      let originHostname = ''
      try {
        originHostname = new URL(origin).hostname.toLowerCase()
      } catch (err) {
        return 403
      }
      const originLoopback =
        originHostname === 'localhost' ||
        originHostname.endsWith('.localhost') ||
        originHostname === '::1' ||
        /^127\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(originHostname)
      if (!originLoopback) return 403 // 外部 Origin → 拒
    }
    return null
  } catch (err) {
    return 403
  }
}

/**
 * 注入到桌面壳 index.html 的那一行（内联 script，自己建 <script> 并吞掉 onerror）。
 *
 * 为什么不是 `script-src` 行：桌面壳的页面侧解释器对两种行的处理不对称 ——
 * `script-src` 一旦加载失败会 reject 掉整个 boot（白屏），而内联行由我们自己
 * 建标签并吞掉 onerror，最坏情况只是「美化没生效」，绝不会挡住应用启动。
 */
export const DESKTOP_INJECT_ROW_TEXT =
  '(function(){try{var d=document.body||document.head||document.documentElement;if(!d)return;' +
  `var s=document.createElement("script");s.defer=true;s.src="${CLIENT_JS_URL}";` +
  's.onerror=function(){};d.appendChild(s)}catch(e){}})()'

export default {
  name: 'dsh-ui-beautify',

  /**
   * Cordis 插件入口。
   * @param {import('cordis').Context} root
   */
  apply(root) {
    /** 用户主目录只解析一次：桌面图与候选列表必须用同一份基准。 */
    const home = process.env.USERPROFILE || process.env.HOME || ''
    const resolvedDesktopPath = resolveDesktopImagePath(home)

    const disposers = []
    const cache = { client: null, splash: null }

    // ── ① 桌面壳注入行：必须最先注册（注入表在宿主启动时一次性收集）──────────
    try {
      disposers.push(
        root.on('webserver/index-inject', (table) => {
          try {
            if (!Array.isArray(table)) return
            for (const row of table) {
              if (!row) continue
              if (row.kind === 'script-src' && row.src === `${ROUTE_PREFIX}/client.js`) return
              if (row.kind === 'script' && typeof row.text === 'string' && row.text.includes(`${ROUTE_PREFIX}/client.js`)) return
            }
            table.push({ kind: 'script', placement: 'body', text: DESKTOP_INJECT_ROW_TEXT })
          } catch (err) {}
        }),
      )
    } catch (err) {
      try {
        console.warn('[dsniang] webserver/index-inject 订阅失败（桌面端可能不自动注入）：', err && err.message)
      } catch (inner) {}
    }

    // ── ② 路由与网页端注入：等 webServer 就绪 ────────────────────────────────
    root.inject(['webServer'], (ctx) => {
      const webServer = ctx.webServer

      /**
       * 统一注册入口：所有路由都自动套上信任栅栏，
       * 并返回 ctx.webServer.register() 给的 disposer（卸载时用它摘掉路由）。
       */
      const registerRoute = (route) => {
        const inner = route.handler
        return webServer.register(
          Object.assign({}, route, {
            handler: async (req, res) => {
              const rejection = selfRejection(req)
              if (rejection) {
                res.writeHead(rejection, { 'Content-Type': 'text/plain; charset=utf-8' })
                res.end('forbidden')
                return
              }
              return inner(req, res)
            },
          }),
        )
      }

      /**
       * 客户端可以按名字点图：`?img=<文件名或去扩展名的短名>`。
       * 只认白名单里的文件名 —— 不对桌面做任意文件读取。
       * 别名（短名 / 新旧包内文件名）统一走 `normalizeImageName`（v0.7.0）。
       * @returns {string | null} 命中的身份名，未命中返回 null（调用方用默认图）
       */
      const pickImageName = (req) => {
        let wanted = ''
        try {
          wanted = new URL(req.url || '/', 'http://localhost').searchParams.get('img') || ''
        } catch (err) {
          return null
        }
        if (!wanted) return null
        return normalizeImageName(wanted)
      }

      // 布局诊断通道（只读、内存态、不落盘）：
      //   前端 GET  /dsh-ui-beautify/diag?data=<urlencoded json>   → 上报当前布局几何
      //   任意方 GET /dsh-ui-beautify/diag.json                    → 读回最近一次上报
      // 用途：调"分层/毛玻璃"这类要精确到元素几何的效果时，开发侧能直接读到真实 DOM
      // 结构，而不是靠猜。数据只在内存里，进程重启即清空。
      // 0.3.0 起：保留最近 6 份上报（history），多窗口互相覆盖时能按 win/at 区分。
      let lastClientDiag = null
      let diagHistory = []
      disposers.push(
        registerRoute({
          kind: 'exact',
          path: `${ROUTE_PREFIX}/diag.json`,
          handler: (req, res) => {
            res.writeHead(200, JSON_HEADERS)
            res.end(JSON.stringify({ ok: true, report: lastClientDiag, history: diagHistory }))
          },
        }),
      )
      disposers.push(
        registerRoute({
          kind: 'exact',
          path: `${ROUTE_PREFIX}/diag`,
          handler: (req, res) => {
            res.writeHead(204, { 'Cache-Control': 'no-store' })
            res.end()
            let data = ''
            try {
              data = new URL(req.url || '/', 'http://localhost').searchParams.get('data') || ''
            } catch (err) {
              return
            }
            if (!data || data.length > 20000) return
            try {
              const report = JSON.parse(data)
              lastClientDiag = report
              const win = report && report.win ? String(report.win) : ''
              const at = report && report.at ? Number(report.at) : 0
              // v0.7.0：history 也带一份动效帧探针摘要 —— 多窗口时读到的是"最后上报者"，
              // 至少帧率不会因为另一个窗口顶掉而完全读不到。
              const motion = report && report.motion
              diagHistory.unshift({
                win,
                at,
                version: report && report.version,
                mode: report && report.mode,
                motion: motion
                  ? { fps: motion.fps, frameMsP95: motion.frameMsP95, animating: motion.animating }
                  : null,
              })
              if (diagHistory.length > 6) diagHistory = diagHistory.slice(0, 6)
            } catch (err) {}
          },
        }),
      )

      // 重启键集成（0.8.3）：状态查询 + 面板「启用重启键」启动随包安装器。
      disposers.push(
        registerRoute({
          kind: 'exact',
          path: `${ROUTE_PREFIX}/restart-status.json`,
          handler: (req, res) => {
            res.writeHead(200, JSON_HEADERS)
            res.end(JSON.stringify(Object.assign({ ok: true }, shellPatchStatus())))
          },
        }),
      )
      disposers.push(
        registerRoute({
          kind: 'exact',
          path: `${ROUTE_PREFIX}/restart-enable`,
          handler: (req, res) => {
            const send = (code, payload) => {
              res.writeHead(code, JSON_HEADERS)
              res.end(JSON.stringify(payload))
            }
            if (req.method !== 'POST') { send(405, { ok: false, error: '只接受 POST' }); return }
            const action = String((req.headers && (req.headers['x-dshui-action'] || req.headers['X-Dshui-Action'])) || '')
            if (action !== 'restart-enable') { send(403, { ok: false, error: '缺少动作头' }); return }
            send(200, launchRestartInstaller())
          },
        }),
      )

      // 背景图状态：给前端探测用（是否存在、来自哪里、字节数、有哪些图可切）。
      disposers.push(
        registerRoute({
          kind: 'exact',
          path: `${ROUTE_PREFIX}/status.json`,
          handler: (req, res) => {
            res.writeHead(200, JSON_HEADERS)
            const wanted = pickImageName(req)
            const suffix = wanted ? `?img=${encodeURIComponent(wanted)}` : ''
            const images = listAvailableImages(home)
            const listPayload = images.map((entry) => ({
              name: entry.name,
              label: imageLabelFor(entry.name),
              bytes: entry.bytes,
              /** 这张图是从桌面读的，还是包内兜底图。 */
              source: entry.source,
            }))
            try {
              const resolved = resolveImageSource(home, wanted)
              res.end(
                JSON.stringify({
                  ok: true,
                  plugin: 'dsh-ui-beautify',
                  version: PLUGIN_VERSION,
                  source: resolved.source,
                  /** 身份名（客户端的按钮高亮与偏好都用它，不因来源而变）。 */
                  file: resolved.name,
                  /** 实际读到的那个文件的文件名（桌面图 = 原名，兜底图 = assets 里的名字）。 */
                  filePath: path.basename(resolved.file),
                  bytes: resolved.bytes.length,
                  url: `${ROUTE_PREFIX}/bg.png${suffix}`,
                  /** 开屏动画页地址（0.8.0）：前端按它加 ?cfg= 配置后塞进 iframe。 */
                  splashUrl: `${ROUTE_PREFIX}/splash.html?v=${PLUGIN_VERSION}`,
                  /** 桌面壳补丁是否已安装（面板「启用重启键」用）。 */
                  shellPatch: detectShellPatchInAsar(shellPatchAsarPath()),
                  /** 本机登录名（只给开屏后的欢迎卡片用；不落盘、不外发）。 */
                  user: String(process.env.USERNAME || process.env.USER || '').slice(0, 32),
                  /** 可切换的图（桌面图 + 包内兜底图，客户端切换器用）。 */
                  images: listPayload,
                }),
              )
            } catch (err) {
              res.end(
                JSON.stringify({
                  ok: false,
                  plugin: 'dsh-ui-beautify',
                  version: PLUGIN_VERSION,
                  error: String((err && err.message) || err).slice(0, 300),
                  images: listPayload,
                }),
              )
            }
          },
        }),
      )

      // 背景图字节。带 ETag：命中就 304，避免每次刷新都重传 2 MB。
      //
      // ⚠️ ETag 必须是**纯 ASCII**：Node 的 HTTP 头只能是 Latin-1，
      // 之前把文件名（如「deepseek 黑白.png」）直接塞进 ETag，writeHead 会抛
      // ERR_INVALID_CHAR，被外层兜成 400 —— 表现就是「中文名的图切不过去」。
      // 这里改成文件名的 sha1 十六进制摘要。
      // v0.7.0：Content-Type 按**字节魔数**给（桌面原图是 PNG、包内兜底是 WebP；
      // 别信扩展名 —— 万一哪天桌面图被换成别的格式也能正确解码）。
      disposers.push(
        registerRoute({
          kind: 'exact',
          path: `${ROUTE_PREFIX}/bg.png`,
          handler: (req, res) => {
            let resolved
            const wanted = pickImageName(req)
            try {
              resolved = resolveImageSource(home, wanted)
            } catch (err) {
              res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
              res.end(String((err && err.message) || err).slice(0, 300))
              return
            }
            const head = resolved.bytes.length >= 12 ? resolved.bytes.toString('latin1', 0, 12) : ''
            const contentType =
              head.slice(0, 4) === 'RIFF' && head.slice(8, 12) === 'WEBP' ? 'image/webp' : 'image/png'
            const tag = createHash('sha1').update(resolved.file).digest('hex').slice(0, 12)
            const etag = `"${resolved.bytes.length}-${resolved.source}-${tag}"`
            if (String(req.headers['if-none-match'] || '') === etag) {
              res.writeHead(304, { ETag: etag })
              res.end()
              return
            }
            res.writeHead(200, {
              'Content-Type': contentType,
              'Content-Length': String(resolved.bytes.length),
              'Cache-Control': 'no-cache',
              ETag: etag,
              'X-Dsniang-Source': resolved.source,
            })
            res.end(resolved.bytes)
          },
        }),
      )

      // 开屏动画页（0.8.0）：单文件 HTML + 桥接注入；不读盘、不发外部请求。
      disposers.push(
        registerRoute({
          kind: 'exact',
          path: `${ROUTE_PREFIX}/splash.html`,
          handler: (req, res) => {
            let entry
            try {
              entry = loadCached(cache.splash, SPLASH_HTML_PATH)
            } catch (err) {
              res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
              res.end('splash unavailable')
              return
            }
            res.writeHead(200, HTML_HEADERS)
            res.end(injectSplashBridge(entry.bytes.toString('utf8')))
          },
        }),
      )

      // 前端半区脚本：按 mtime 重读，改完刷新页面即生效。
      disposers.push(
        registerRoute({
          kind: 'exact',
          path: `${ROUTE_PREFIX}/client.js`,
          handler: (req, res) => {
            let entry
            try {
              entry = loadCached(cache.client, path.join(LIB_DIR, CLIENT_JS_NAME))
            } catch (err) {
              res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
              res.end('client.js unavailable')
              return
            }
            res.writeHead(200, JS_HEADERS)
            res.end(entry.bytes)
          },
        }),
      )

      // 网页端形态：往 index.html 里塞一行 defer script（桌面端不走这条路）。
      disposers.push(
        webServer.tapIndex((html) => {
          if (typeof html !== 'string') return html
          if (html.includes(`${ROUTE_PREFIX}/client.js`)) return html
          const tag = `<script defer src="${CLIENT_JS_URL}"></script>`
          if (html.includes('</body>')) return html.replace('</body>', `${tag}</body>`)
          return html + tag
        }),
      )

      try {
        console.log(
          `[dsh-ui-beautify] DSH UI Beautify v${PLUGIN_VERSION} 已挂载：` +
            `${ROUTE_PREFIX}/client.js · 背景源 ${resolvedDesktopPath}`,        )
      } catch (err) {}

      // 插件卸载时撤掉所有路由与注入。
      ctx.effect(
        () => () => {
          for (const dispose of disposers) {
            try {
              dispose()
            } catch (err) {}
          }
        },
        'dsh-ui-beautify routes',
      )
    })
  },
}
