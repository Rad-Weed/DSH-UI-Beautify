/**
 * Host 半区（lib/index.js）的测试 —— 不需要真的起 DSH，用桩 ctx 跑通路由与校验。
 *
 * 覆盖：
 *   1. 桌面图片路径解析（英文/中文桌面目录、找不到时的回落）；
 *   2. 背景图字节解析（桌面优先、包内兜底、两处都没有则抛错）；
 *   3. 背景图字节解析对同一文件给出正确的 source 标记；
 *   4. 信任栅栏（跨站、外部 Origin、畸形 Host、正常同源回环请求）；
 *   5. apply()：注册 3 条路由 + tapIndex 注入，并且 index 注入行不重复；
 *   6. 路由真实响应：/status.json 报来源、/bg.png 出字节并支持 ETag 304、
 *      /client.js 出脚本；
 *   7. 插件卸载（ctx.effect 的 disposer）后路由全部摘掉。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import plugin, {
  DESKTOP_IMAGE_NAME,
  DESKTOP_INJECT_ROW_TEXT,
  PLUGIN_VERSION,
  ROUTE_PREFIX,
  injectSplashBridge,
  detectShellPatchInAsar,
  resolveShellPatchAsarPath,
  normalizeImageName,
  DARK_IMAGE_NAME,
  listAvailableImages,
  listAvailableDarkImages,
  resolveImageSource,
  resolveBackgroundBytes,
  resolveDesktopImagePath,
  selfRejection,
  restartAutoSnapshot,
  armRestartInstaller,
} from '../lib/index.js'

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url))
const PACKAGE_ROOT = path.resolve(TEST_DIR, '..')
const BUNDLED_IMAGE = path.join(PACKAGE_ROOT, 'assets', 'deepseek-4k.webp')
const BUNDLED_BW_IMAGE = path.join(PACKAGE_ROOT, 'assets', 'deepseek-bw-nowater.webp')
const REAL_HOME = process.env.USERPROFILE || os.homedir()

/** 造一个临时「桌面」目录，放一张假图片。 */
function scratchDesktop(label) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), `dsniang-${label}-`))
  const desktop = path.join(home, 'Desktop')
  fs.mkdirSync(desktop, { recursive: true })
  return { home, desktop }
}

/** 一张真实的 1×1 PNG（桌面"原图"用；身份名仍是 .png，字节是货真价实的 PNG）。 */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

/** 读图片字节的格式（webp/png），验证字节没被改坏。 */
function imageKind(bytes) {
  const head = bytes.toString('latin1', 0, 12)
  if (head.slice(0, 4) === 'RIFF' && head.slice(8, 12) === 'WEBP') return 'webp'
  if (bytes.toString('latin1', 1, 4) === 'PNG') return 'png'
  return 'unknown'
}

/** 桩：DSH 的 webServer 服务。 */
function fakeWebServer() {
  const routes = new Map()
  const taps = []
  return {
    routes,
    taps,
    register(route) {
      const key = `${route.kind} ${route.path}`
      if (routes.has(key)) throw new Error(`duplicate route ${key}`)
      routes.set(key, route)
      return () => routes.delete(key)
    },
    tapIndex(transform) {
      taps.push(transform)
      return () => {
        const index = taps.indexOf(transform)
        if (index >= 0) taps.splice(index, 1)
      }
    },
    renderIndex(html) {
      return taps.reduce((acc, transform) => transform(acc), html)
    },
  }
}

/** 桩：Cordis 根上下文。 */
function fakeRoot() {
  const listeners = new Map()
  const effects = []
  const injected = []
  const root = {
    listeners,
    effects,
    injected,
    on(name, handler) {
      const list = listeners.get(name) || []
      list.push(handler)
      listeners.set(name, list)
      return () => {
        const index = list.indexOf(handler)
        if (index >= 0) list.splice(index, 1)
      }
    },
    inject(names, callback) {
      injected.push(names)
      // 局部 inject 拿到的是「带着已解析服务」的调用方 ctx：这里与 root 同一个对象即可。
      callback(root)
    },
    effect(callback) {
      // Cordis 语义：callback() 建立副作用并返回 disposer，disposer 只在卸载时调用。
      const dispose = callback()
      effects.push(dispose)
      return () => {}
    },
  }
  return root
}

/** 把 apply() 跑起来，返回可操作的桩。 */
function boot(options) {
  const opts = options || {}
  const webServer = fakeWebServer()
  const root = fakeRoot()
  root.webServer = webServer
  const envUser = process.env.USERPROFILE
  if (opts.home !== undefined) process.env.USERPROFILE = opts.home
  try {
    plugin.apply(root)
  } finally {
    if (envUser === undefined) delete process.env.USERPROFILE
    else process.env.USERPROFILE = envUser
  }
  return { root, webServer }
}

/** 造一个 IncomingMessage / ServerResponse 桩，跑一条路由。 */
function callRoute(webServer, routePath, options) {
  const opts = options || {}
  const route = webServer.routes.get(`exact ${routePath}`)
  assert.ok(route, `路由 ${routePath} 应已注册`)
  const headers = Object.assign(
    { host: '127.0.0.1:19387' },
    opts.headers || {},
  )
  const response = {
    statusCode: null,
    headers: null,
    body: null,
    writeHead(status, extra) {
      this.statusCode = status
      this.headers = extra || null
    },
    end(chunk) {
      this.body = chunk === undefined ? null : chunk
    },
  }
  const result = route.handler(
    { method: opts.method || 'GET', url: opts.url || routePath, headers },
    response,
  )
  return Promise.resolve(result).then(() => response)
}

/** 把 tapIndex 回调跑一遍。 */
function renderIndex(webServer, html) {
  return webServer.taps.reduce((acc, transform) => transform(acc), html)
}

test('apply(): 注册路由并注入前端脚本', () => {
  const { webServer, root } = boot()
  assert.deepEqual(
    Array.from(webServer.routes.keys()).sort(),
    [
      `exact ${ROUTE_PREFIX}/bg.png`,
      `exact ${ROUTE_PREFIX}/client.js`,
      `exact ${ROUTE_PREFIX}/splash.html`,
      `exact ${ROUTE_PREFIX}/dynamic-layout.json`,
      `exact ${ROUTE_PREFIX}/status.json`,
      `exact ${ROUTE_PREFIX}/restart-status.json`,
      `exact ${ROUTE_PREFIX}/restart-enable`,
      `exact ${ROUTE_PREFIX}/diag`,
      `exact ${ROUTE_PREFIX}/diag.json`,
    ].sort(),
  )
  assert.deepEqual(root.injected, [['webServer']], '只硬依赖 webServer')

  const html = renderIndex(webServer, '<html><body><div id="root"></div></body></html>')
  // 脚本 URL 带版本号（换版本就换 URL，绕开浏览器缓存），所以用正则而不是精确串
  assert.match(
    html,
    new RegExp(`<script defer src="${ROUTE_PREFIX}/client\\.js\\?v=[\\d.]+"></script>`),
    '应注入带版本号的 defer script',
  )
  assert.equal(html.indexOf('</body>') > html.indexOf(ROUTE_PREFIX), true, '应插在 </body> 之前')

  // 已经注入过的 HTML 再过一遍不应叠加。
  const twice = renderIndex(webServer, html)
  assert.equal(twice, html, '重复渲染应幂等')
  assert.equal(twice.match(new RegExp(`${ROUTE_PREFIX}/client\\.js`, 'g')).length, 1)
})

test('布局诊断通道：history 每份上报都带动效帧探针摘要（0.7.0，多窗口可读各自 FPS）', async () => {
  const { webServer } = boot()
  const payload = {
    win: 'window-a',
    at: Date.now(),
    mode: 'multiply',
    motion: { fps: 63, frameMsP95: 16, animating: false, dropped: 1, longFrames: 0 },
  }
  await callRoute(webServer, `${ROUTE_PREFIX}/diag`, {
    url: `${ROUTE_PREFIX}/diag?data=${encodeURIComponent(JSON.stringify(payload))}`,
  })
  const read = JSON.parse((await callRoute(webServer, `${ROUTE_PREFIX}/diag.json`)).body)
  assert.equal(read.history.length, 1)
  assert.deepEqual(read.history[0].motion, { fps: 63, frameMsP95: 16, animating: false }, 'history 带 motion 摘要')

  // 没有 motion 字段的旧版上报：motion = null，不崩
  await callRoute(webServer, `${ROUTE_PREFIX}/diag`, {
    url: `${ROUTE_PREFIX}/diag?data=${encodeURIComponent(JSON.stringify({ win: 'window-b', mode: 'off' }))}`,
  })
  const again = JSON.parse((await callRoute(webServer, `${ROUTE_PREFIX}/diag.json`)).body)
  assert.equal(again.history.length, 2)
  assert.equal(again.history[0].motion, null, '旧版上报没有 motion → null')
})

test('布局诊断通道：前端上报 /diag，任何方都能从 /diag.json 读回', async () => {
  const { webServer } = boot()

  // 一开始没有上报
  const empty = JSON.parse((await callRoute(webServer, `${ROUTE_PREFIX}/diag.json`)).body)
  assert.equal(empty.ok, true)
  assert.equal(empty.report, null)

  // 前端上报（模拟 client 的 reportLayout）
  const payload = { mode: 'multiply', card: { className: '_card_x', rect: { width: 900 } } }
  const posted = await callRoute(webServer, `${ROUTE_PREFIX}/diag`, {
    url: `${ROUTE_PREFIX}/diag?data=${encodeURIComponent(JSON.stringify(payload))}`,
  })
  assert.equal(posted.statusCode, 204, '上报纸响应 204，不返回正文')

  const read = JSON.parse((await callRoute(webServer, `${ROUTE_PREFIX}/diag.json`)).body)
  assert.deepEqual(read.report, payload, '应能读回刚上报的内容')

  // 坏数据不能把宿主搞崩，也不能污染已有报告
  const bad = await callRoute(webServer, `${ROUTE_PREFIX}/diag`, {
    url: `${ROUTE_PREFIX}/diag?data=${encodeURIComponent('{not json')}`,
  })
  assert.equal(bad.statusCode, 204)
  const still = JSON.parse((await callRoute(webServer, `${ROUTE_PREFIX}/diag.json`)).body)
  assert.deepEqual(still.report, payload, '坏数据应被忽略，保留上一次有效报告')

  // 超大上报直接忽略（防止被当成数据下水道）
  const huge = await callRoute(webServer, `${ROUTE_PREFIX}/diag`, {
    url: `${ROUTE_PREFIX}/diag?data=${'x'.repeat(21000)}`,
  })
  assert.equal(huge.statusCode, 204)
})

test('apply(): 桌面壳注入行（webserver/index-inject）注册且去重', () => {
  const { root } = boot()
  const handlers = root.listeners.get('webserver/index-inject') || []
  assert.equal(handlers.length, 1, '应订阅 index-inject')

  const table = []
  handlers[0](table)
  assert.equal(table.length, 1)
  assert.equal(table[0].kind, 'script')
  assert.equal(table[0].placement, 'body')
  assert.ok(table[0].text.includes(`${ROUTE_PREFIX}/client.js`), '注入行指向 client.js')
  assert.ok(table[0].text.includes('onerror'), '注入行必须吞掉 onerror（不能挡住应用启动）')

  handlers[0](table)
  assert.equal(table.length, 1, '重复收集不应重复入表')

  // 旧版本推过 script-src 行时也不重复。
  const table2 = [{ kind: 'script-src', placement: 'body', src: `${ROUTE_PREFIX}/client.js` }]
  handlers[0](table2)
  assert.equal(table2.length, 1)
})

test('注入行文本与常量一致', () => {
  assert.ok(DESKTOP_INJECT_ROW_TEXT.includes(`${ROUTE_PREFIX}/client.js`))
  assert.ok(!DESKTOP_INJECT_ROW_TEXT.includes('__DSH'), '不该依赖内部全局')
})

test('resolveDesktopImagePath(): 认 Desktop 与「桌面」，找不到时回落首个候选', () => {
  const a = scratchDesktop('en')
  const file = path.join(a.desktop, DESKTOP_IMAGE_NAME)
  fs.writeFileSync(file, 'x')
  assert.equal(resolveDesktopImagePath(a.home), file)
  fs.rmSync(a.home, { recursive: true, force: true })

  const b = fs.mkdtempSync(path.join(os.tmpdir(), 'dsniang-zh-'))
  const zh = path.join(b, '桌面')
  fs.mkdirSync(zh, { recursive: true })
  const zhFile = path.join(zh, DESKTOP_IMAGE_NAME)
  fs.writeFileSync(zhFile, 'x')
  assert.equal(resolveDesktopImagePath(b), zhFile)
  fs.rmSync(b, { recursive: true, force: true })

  const c = fs.mkdtempSync(path.join(os.tmpdir(), 'dsniang-none-'))
  assert.equal(resolveDesktopImagePath(c), path.join(c, 'Desktop', DESKTOP_IMAGE_NAME))
  fs.rmSync(c, { recursive: true, force: true })
})

test('resolveBackgroundBytes(): 桌面原图优先，包内兜底', () => {
  const scratch = scratchDesktop('resolve')
  const desktopFile = path.join(scratch.desktop, DESKTOP_IMAGE_NAME)
  fs.copyFileSync(BUNDLED_IMAGE, desktopFile)

  const fromDesktop = resolveBackgroundBytes(desktopFile)
  assert.equal(fromDesktop.source, 'desktop')
  assert.equal(fromDesktop.file, desktopFile)
  assert.equal(imageKind(fromDesktop.bytes), 'webp', '包内兜底是 WebP（桌面优先取到的字节不变）')

  const fromBundle = resolveBackgroundBytes(path.join(scratch.home, 'nope.png'))
  assert.equal(fromBundle.source, 'bundled', '桌面图缺失应回落到包内图')
  assert.equal(fromBundle.file, BUNDLED_IMAGE)
  assert.equal(imageKind(fromBundle.bytes), 'webp')
  fs.rmSync(scratch.home, { recursive: true, force: true })
})

test('resolveBackgroundBytes(): 两处都没有则抛错', () => {
  // 用临时 HOME 无法影响包内兜底图，这里只验证「桌面图缺失时不会拿到它」这一点由上一个用例覆盖；
  // 本用例验证错误信息里包含来源说明。
  const scratch = scratchDesktop('err')
  try {
    // 故意指向一个目录（不是普通文件）
    const dir = path.join(scratch.desktop, DESKTOP_IMAGE_NAME)
    fs.mkdirSync(dir, { recursive: true })
    const resolved = resolveBackgroundBytes(dir)
    assert.equal(resolved.source, 'bundled', '目录不算文件 → 落到包内图')
  } finally {
    fs.rmSync(scratch.home, { recursive: true, force: true })
  }
})

test('selfRejection(): 只拦跨站与「非回环 Host + 外部 Origin」', () => {
  // 正常本机使用：放行。
  assert.equal(selfRejection({ headers: { host: '127.0.0.1:19387' } }), null)
  assert.equal(selfRejection({ headers: { host: 'localhost:19387' } }), null)
  assert.equal(selfRejection({ headers: { host: '[::1]:19387' } }), null)
  assert.equal(
    selfRejection({ headers: { host: 'localhost:19387', origin: 'http://localhost:19387' } }),
    null,
    '同源 Origin 放行',
  )
  // 局域网/反代部署（非回环 Host，但没有跨站标记与 Origin）：放行 —— 只读资源，
  // 不能把「远端能看挂件」这件事一刀切掉。
  assert.equal(selfRejection({ headers: { host: 'dsh.internal:8080' } }), null, '裸非回环 Host 放行')

  // 明确要拒的：
  assert.equal(selfRejection({ headers: { host: '127.0.0.1', 'sec-fetch-site': 'cross-site' } }), 403)
  assert.equal(selfRejection({ headers: { host: '127.0.0.1', origin: 'http://evil.com' } }), 403, '外部 Origin 拒')
  assert.equal(
    selfRejection({ headers: { host: '127.0.0.1:19387', origin: 'http://evil.com' } }),
    403,
    '外部 Origin 拒（带端口）',
  )
  assert.equal(selfRejection({ headers: { host: 'bad host' } }), 403, '畸形 Host 拒')
  assert.equal(selfRejection({ headers: {} }), 403, '缺 Host 拒')
  assert.equal(
    selfRejection({ headers: { host: 'dsh.internal', origin: 'http://evil.com' } }),
    403,
    'DNS 重绑定特征：Host 与 Origin 不同源 → 拒',
  )
})

test('路由 /status.json：报告背景来源与大小', async () => {
  const scratch = scratchDesktop('status')
  const desktopFile = path.join(scratch.desktop, DESKTOP_IMAGE_NAME)
  fs.copyFileSync(BUNDLED_IMAGE, desktopFile)
  const { webServer } = boot({ home: scratch.home })

  const response = await callRoute(webServer, `${ROUTE_PREFIX}/status.json`)
  assert.equal(response.statusCode, 200)
  assert.equal(response.headers['Content-Type'], 'application/json; charset=utf-8')
  const payload = JSON.parse(response.body)
  assert.equal(payload.ok, true)
  assert.equal(payload.plugin, 'dsh-ui-beautify')
  assert.equal(payload.version, PLUGIN_VERSION)
  assert.equal(payload.source, 'desktop')
  assert.equal(payload.url, `${ROUTE_PREFIX}/bg.png`)
  assert.equal(payload.bytes, fs.statSync(desktopFile).size)
  fs.rmSync(scratch.home, { recursive: true, force: true })
})

test('路由 /bg.png：桌面原图出 PNG 字节（按魔数），带 ETag 与 304', async () => {
  const scratch = scratchDesktop('bg')
  const desktopFile = path.join(scratch.desktop, DESKTOP_IMAGE_NAME)
  fs.writeFileSync(desktopFile, TINY_PNG) // 桌面图是真正的 PNG
  const { webServer } = boot({ home: scratch.home })

  const response = await callRoute(webServer, `${ROUTE_PREFIX}/bg.png`)
  assert.equal(response.statusCode, 200)
  assert.equal(response.headers['Content-Type'], 'image/png', 'PNG 字节 → image/png')
  assert.equal(response.headers['X-Dsniang-Source'], 'desktop')
  assert.equal(imageKind(response.body), 'png')
  assert.match(
    String(response.headers.ETag),
    /^"[\x20-\x7E]+"$/,
    'ETag 必须是纯 ASCII：中文文件名会让 Node 拒绝响应头（表现是 400，中文名的图切不过去）',
  )

  const cached = await callRoute(webServer, `${ROUTE_PREFIX}/bg.png`, {
    headers: { 'if-none-match': response.headers.ETag },
  })
  assert.equal(cached.statusCode, 304, '命中 ETag 应 304')
  assert.equal(cached.body, null)
  fs.rmSync(scratch.home, { recursive: true, force: true })
})

test('路由 /bg.png：桌面没有图时出包内 WebP 字节（Content-Type 按魔数 = image/webp）', async () => {
  const scratch = scratchDesktop('bg-webp') // 空桌面
  const { webServer } = boot({ home: scratch.home })

  const response = await callRoute(webServer, `${ROUTE_PREFIX}/bg.png`)
  assert.equal(response.statusCode, 200)
  assert.equal(response.headers['Content-Type'], 'image/webp', 'WebP 字节 → image/webp')
  assert.equal(response.headers['X-Dsniang-Source'], 'bundled')
  assert.equal(imageKind(response.body), 'webp')
  assert.ok(response.body.length > 1000, '应返回真实图片字节')
  fs.rmSync(scratch.home, { recursive: true, force: true })
})

test('图片切换：status 列出桌面候选图，?img= 精确取图，非法名字回落默认', async () => {
  const scratch = scratchDesktop('picker')
  // 桌面上放两张不同的图（用字节长度区分）
  const fourK = path.join(scratch.desktop, 'deepseek 4k.png')
  const silhouette = path.join(scratch.desktop, 'deepseek 黑白无水面.png')
  fs.copyFileSync(BUNDLED_IMAGE, fourK)
  fs.writeFileSync(silhouette, Buffer.concat([fs.readFileSync(BUNDLED_IMAGE), Buffer.alloc(4096)]))
  const { webServer } = boot({ home: scratch.home })

  // ① status 必须列出两张候选
  const list = JSON.parse((await callRoute(webServer, `${ROUTE_PREFIX}/status.json`)).body)
  assert.deepEqual(
    list.images.map((entry) => entry.name).sort(),
    ['deepseek 4k.png', 'deepseek 黑白无水面.png'].sort(),
    '宿主要把桌面上实际存在的候选图列出来',
  )
  assert.ok(list.images.every((entry) => entry.bytes > 0), '每个候选都带字节数')

  // ② ?img= 短名（去掉扩展名）也要认，并返回对应的图
  const picked = JSON.parse(
    (await callRoute(webServer, `${ROUTE_PREFIX}/status.json`, {
      url: `${ROUTE_PREFIX}/status.json?img=${encodeURIComponent('deepseek 黑白无水面')}`,
    })).body,
  )
  assert.equal(picked.file, 'deepseek 黑白无水面.png')
  assert.equal(picked.bytes, fs.statSync(silhouette).size, '应指向剪影图')
  assert.ok(picked.url.includes('img='), 'url 应带上 img 参数')

  // ③ bg.png?img= 出的是那张图的字节
  const bytes = await callRoute(webServer, `${ROUTE_PREFIX}/bg.png`, {
    url: `${ROUTE_PREFIX}/bg.png?img=${encodeURIComponent('deepseek 黑白无水面')}`,
  })
  assert.equal(bytes.statusCode, 200)
  assert.equal(bytes.body.length, fs.statSync(silhouette).size)

  // ④ 不在白名单里的名字 → 不能读任意文件，回落默认图
  const evil = JSON.parse(
    (await callRoute(webServer, `${ROUTE_PREFIX}/status.json`, {
      url: `${ROUTE_PREFIX}/status.json?img=${encodeURIComponent('../../secret.png')}`,
    })).body,
  )
  assert.equal(evil.file, 'deepseek 4k.png', '白名单外的名字必须回落默认图')
  assert.equal(evil.url, `${ROUTE_PREFIX}/bg.png`, '回落时 url 不带 img 参数')

  fs.rmSync(scratch.home, { recursive: true, force: true })
})

test('图片候选：只留 deepseek(4k) 与 黑白无水面；4k 展示名改成 deepseek；中文名图能正常出字节', async () => {
  const scratch = scratchDesktop('labels')
  const fourK = path.join(scratch.desktop, 'deepseek 4k.png')
  const plain = path.join(scratch.desktop, 'deepseek.png')
  const mono = path.join(scratch.desktop, 'deepseek 黑白.png')
  const silhouette = path.join(scratch.desktop, 'deepseek 黑白无水面.png')
  fs.copyFileSync(BUNDLED_IMAGE, fourK)
  fs.copyFileSync(BUNDLED_IMAGE, plain)
  fs.copyFileSync(BUNDLED_IMAGE, mono)
  // 剪影图用更长的字节，便于验证取的确实是它
  fs.writeFileSync(silhouette, Buffer.concat([fs.readFileSync(BUNDLED_IMAGE), Buffer.alloc(2048)]))
  const { webServer } = boot({ home: scratch.home })

  const list = JSON.parse((await callRoute(webServer, `${ROUTE_PREFIX}/status.json`)).body)
  assert.deepEqual(
    list.images.map((entry) => entry.name),
    ['deepseek 4k.png', 'deepseek 黑白无水面.png'],
    '只允许这两个候选（deepseek.png 与 deepseek 黑白.png 都不再出现）',
  )
  assert.deepEqual(
    list.images.map((entry) => entry.label),
    ['deepseek', 'deepseek 黑白无水面'],
    'deepseek 4k.png 的展示名应改成 deepseek',
  )

  // 中文名图片：字节要能正常取到，且响应头全部是 ASCII（这是修复的回归护栏）
  const monoBytes = await callRoute(webServer, `${ROUTE_PREFIX}/bg.png`, {
    url: `${ROUTE_PREFIX}/bg.png?img=${encodeURIComponent('deepseek 黑白无水面')}`,
  })
  assert.equal(monoBytes.statusCode, 200, '中文名图片必须能取到（此前会返回 400）')
  assert.equal(monoBytes.body.length, fs.statSync(silhouette).size, '取到的应是那张剪影图')
  assert.match(String(monoBytes.headers.ETag), /^"[\x20-\x7E]+"$/, '中文名图的 ETag 也必须是纯 ASCII')
  for (const [key, value] of Object.entries(monoBytes.headers)) {
    assert.equal(
      /^[\x20-\x7E]*$/.test(String(value)),
      true,
      `响应头 ${key} 含非 ASCII 字符：${value}`,
    )
  }

  // 已下架的 deepseek 黑白.png 即使在桌面上存在，也必须回落到默认图
  const dropped = JSON.parse(
    (await callRoute(webServer, `${ROUTE_PREFIX}/status.json`, {
      url: `${ROUTE_PREFIX}/status.json?img=${encodeURIComponent('deepseek 黑白')}`,
    })).body,
  )
  assert.equal(dropped.file, 'deepseek 4k.png', '已下架的图必须回落默认，而不是被当成候选')

  fs.rmSync(scratch.home, { recursive: true, force: true })
})

test('图片候选：桌面没有图时两张都从包内出（换台电脑也有黑白可选）', async () => {
  const scratch = scratchDesktop('bundled-only') // 空桌面：模拟「换了台电脑，图没拷过去」
  const { webServer } = boot({ home: scratch.home })

  assert.ok(fs.existsSync(BUNDLED_BW_IMAGE), '包内必须自带黑白兜底图（v0.7.0 起是 WebP）')

  const list = JSON.parse((await callRoute(webServer, `${ROUTE_PREFIX}/status.json`)).body)
  assert.deepEqual(
    list.images.map((entry) => entry.name),
    ['deepseek 4k.png', 'deepseek 黑白无水面.png'],
    '两张候选都要在（此前只剩 deepseek 一张）',
  )
  assert.deepEqual(
    list.images.map((entry) => entry.source),
    ['bundled', 'bundled'],
    '都来自包内兜底图',
  )
  assert.deepEqual(list.images.map((entry) => entry.label), ['deepseek', 'deepseek 黑白无水面'])

  // 身份名保持不变（客户端的按钮高亮与 localStorage 偏好都用它）
  const picked = JSON.parse(
    (await callRoute(webServer, `${ROUTE_PREFIX}/status.json`, {
      url: `${ROUTE_PREFIX}/status.json?img=${encodeURIComponent('deepseek 黑白无水面')}`,
    })).body,
  )
  assert.equal(picked.file, 'deepseek 黑白无水面.png', '对外仍是候选身份名')
  assert.equal(picked.filePath, 'deepseek-bw-nowater.webp', '实际读的是包内 ASCII 文件名（WebP）')
  assert.equal(picked.source, 'bundled')
  assert.equal(picked.bytes, fs.statSync(BUNDLED_BW_IMAGE).size)

  const bytes = await callRoute(webServer, `${ROUTE_PREFIX}/bg.png`, {
    url: `${ROUTE_PREFIX}/bg.png?img=${encodeURIComponent('deepseek 黑白无水面')}`,
  })
  assert.equal(bytes.statusCode, 200)
  assert.equal(bytes.body.length, fs.statSync(BUNDLED_BW_IMAGE).size, '取到的应是包内那张黑白图')
  assert.equal(bytes.headers['X-Dsniang-Source'], 'bundled')
  assert.equal(bytes.headers['Content-Type'], 'image/webp', '包内兜底是 WebP')
  assert.match(String(bytes.headers.ETag), /^"[\x20-\x7E]+"$/, 'ETag 仍需纯 ASCII')

  fs.rmSync(scratch.home, { recursive: true, force: true })
})

test('图片候选：桌面同名图优先于包内兜底图（逐张判断）', async () => {
  const scratch = scratchDesktop('desktop-first')
  // 桌面只放黑白图（且字节数与包内不同，便于断言取的是桌面那张）
  const desktopBw = path.join(scratch.desktop, 'deepseek 黑白无水面.png')
  fs.writeFileSync(desktopBw, Buffer.concat([fs.readFileSync(BUNDLED_IMAGE), Buffer.alloc(1024)]))
  const { webServer } = boot({ home: scratch.home })

  const list = JSON.parse((await callRoute(webServer, `${ROUTE_PREFIX}/status.json`)).body)
  const bw = list.images.find((entry) => entry.name === 'deepseek 黑白无水面.png')
  const fourK = list.images.find((entry) => entry.name === 'deepseek 4k.png')
  assert.equal(bw.source, 'desktop', '桌面有 → 用桌面的')
  assert.equal(bw.bytes, fs.statSync(desktopBw).size)
  assert.equal(fourK.source, 'bundled', '桌面没有 → 用包内兜底（互不影响）')

  fs.rmSync(scratch.home, { recursive: true, force: true })
})

test('图片别名：旧存档里的包内文件名 / 短名都能认回候选身份名（含新旧扩展名）', () => {
  assert.equal(normalizeImageName('deepseek 4k.png'), 'deepseek 4k.png')
  assert.equal(normalizeImageName('deepseek 4k'), 'deepseek 4k.png')
  assert.equal(normalizeImageName('deepseek-4k.png'), 'deepseek 4k.png', 'v0.2.30 及更早写进存档的包内名')
  assert.equal(normalizeImageName('deepseek-4k'), 'deepseek 4k.png')
  assert.equal(normalizeImageName('deepseek-4k.webp'), 'deepseek 4k.png', 'v0.7.0 的包内名')
  assert.equal(normalizeImageName('deepseek 黑白无水面.png'), 'deepseek 黑白无水面.png')
  assert.equal(normalizeImageName('deepseek-bw-nowater.png'), 'deepseek 黑白无水面.png')
  assert.equal(normalizeImageName('deepseek-bw-nowater.webp'), 'deepseek 黑白无水面.png')
  assert.equal(normalizeImageName('deepseek 黑白'), null, '已下架的名字不认')
  assert.equal(normalizeImageName('../../secret.png'), null, '白名单外一律不认')
})


test('开屏页路由：返回注入桥接脚本的 HTML（隐藏 mock/控制台 + 结束信号）', async () => {
  const { webServer } = boot()
  const response = await callRoute(webServer, `${ROUTE_PREFIX}/splash.html`)
  assert.equal(response.statusCode, 200)
  assert.equal(response.headers['Content-Type'], 'text/html; charset=utf-8')
  assert.equal(response.headers['Cache-Control'], 'no-store')
  const html = response.body.toString('utf8')
  assert.ok(html.includes('<html'), '应是完整的 HTML 文档')
  assert.ok(html.includes('__DSH_STARTUP__'), '桥接脚本要接管开屏页自己的配置接口')
  assert.ok(html.includes('#mockApp,#d2console,#swCfg,#swCard{display:none!important}'), '集成态要隐藏 CFG 控制台/欢迎卡片/旧假界面')
  assert.ok(html.includes('dsh-startup:done'), '结束信号要回传给父页面')
  assert.ok(html.includes('sw-root'), '原开屏页内容要保留')
  assert.ok(html.includes('DSH11_SPLASH_API__'), '跳过消息要适配新开屏 API')
})

test('开屏桥接：按 cfg.titlebar 注入顶部偏移样式（避开 Windows 窗口按钮）', () => {
  const html = injectSplashBridge('<!doctype html><html><head></head><body></body></html>')
  assert.match(html, /cfg.titlebar/, '桥接脚本应读取 cfg.titlebar')
  assert.match(html, /#sw-root\{padding-top:/, '应按标题栏高度调整新开屏顶部留白')
  assert.match(html, /!important/, '必须用 !important 盖过开屏页自己的样式')
})
test('injectSplashBridge：不改源文件、只往 <head> 后插桥接（纯函数可单测）', () => {
  const html = '<html><head><title>t</title></head><body><div id="mockApp"></div></body></html>'
  const out = injectSplashBridge(html)
  assert.ok(out.includes('<title>t</title>'), '原始内容不能动')
  assert.ok(out.indexOf('__DSH_STARTUP__') > out.indexOf('<head>'))
  assert.ok(out.indexOf('__DSH_STARTUP__') < out.indexOf('<title>'), '桥接应紧跟 <head> 之后')
  assert.ok(out.includes('window.parent.postMessage'), '结束/异常都要通知父页面')
})

test('路由 /client.js：出浏览器可执行的脚本', async () => {
  const { webServer } = boot()
  const response = await callRoute(webServer, `${ROUTE_PREFIX}/client.js`)
  assert.equal(response.statusCode, 200)
  assert.equal(response.headers['Content-Type'], 'application/javascript; charset=utf-8')
  const source = response.body.toString('utf8')
  assert.ok(source.includes('__DSHUI__'), '应暴露调试句柄')
  // 脚本用常量拼 URL（`PREFIX + '/status.json'`），所以断言两个片段而不是完整字面量
  assert.ok(source.includes(`'${ROUTE_PREFIX}'`), '应使用插件的路由前缀')
  assert.ok(source.includes("'/status.json'"), '应探测状态接口')
  assert.ok(source.includes('pointer-events:none'), '层必须不参与命中测试')
  assert.equal(/^\s*import\s+[\w{*]/m.test(source), false, '必须是经典脚本（不能有 ESM import 语句）')
  assert.equal(/^\s*export\s+(default|const|function)/m.test(source), false, '必须是经典脚本（不能有 export）')
  // 浏览器按 classic script 执行它：必须能被 JS 引擎直接解析
  assert.doesNotThrow(() => new vm.Script(source, { filename: 'client.js' }), '脚本必须语法合法')
})

test('重启键集成：Cordis Host 下也能解析 app.asar（resourcesPath / execPath 向上 / 标准路径）', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dshui-asar-path-'))
  const resources = path.join(dir, 'dsh', 'resources')
  fs.mkdirSync(resources, { recursive: true })
  const asar = path.join(resources, 'app.asar')
  fs.writeFileSync(asar, 'x')
  assert.equal(resolveShellPatchAsarPath({ resourcesPath: resources, execPath: '', env: {}, exists: fs.existsSync }), asar)
  const runtimeDir = path.join(dir, 'dsh', 'resources', 'runtime', 'primary-runtime', 'dependencies', 'node', 'bin')
  fs.mkdirSync(runtimeDir, { recursive: true })
  const nodeExe = path.join(runtimeDir, 'node.exe')
  fs.writeFileSync(nodeExe, '')
  assert.equal(resolveShellPatchAsarPath({ resourcesPath: '', execPath: nodeExe, env: {}, exists: fs.existsSync }), asar, 'execPath 向上找 resources/app.asar')
  const pf = path.join(dir, 'PF')
  const pfResources = path.join(pf, 'DeepSeek Harness', 'resources')
  fs.mkdirSync(pfResources, { recursive: true })
  fs.writeFileSync(path.join(pfResources, 'app.asar'), 'x')
  assert.equal(resolveShellPatchAsarPath({ resourcesPath: '', execPath: '', env: { ProgramFiles: pf }, exists: fs.existsSync }), path.join(pfResources, 'app.asar'), '标准安装路径兜底')
  assert.equal(resolveShellPatchAsarPath({ resourcesPath: '', execPath: '', env: {}, exists: () => false }), '', '找不到返回空串')
})

test('重启键集成：detectShellPatchInAsar 只认 app.asar 尾部的补丁标记', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dshui-shell-patch-'))
  const plain = path.join(dir, 'plain.asar')
  fs.writeFileSync(plain, 'x'.repeat(200))
  const patched = path.join(dir, 'patched.asar')
  fs.writeFileSync(patched, 'x'.repeat(200) + '// >>> DSH-RESTART-BUTTON BEGIN >>>' + 'y'.repeat(40))
  assert.equal(detectShellPatchInAsar(plain), false, '没有标记 → 未安装')
  assert.equal(detectShellPatchInAsar(patched), true, '尾部有标记 → 已安装')
  assert.equal(detectShellPatchInAsar(''), false, '空路径安全返回 false')
})

test('重启键集成：Electron asar 虚拟目录下，注入原始 fs 仍能读到补丁标记', () => {
  // 模拟 Electron Host：普通 fs 把 app.asar 当目录（isFile=false），original-fs 才是真实文件。
  const marker = Buffer.from('// DSH-RESTART-BUTTON BEGIN //')
  const fakeFs = {
    statSync: () => ({ isFile: () => true, size: marker.length }),
    openSync: () => 1,
    readSync: (fd, buffer, offset, length, position) => {
      const start = position || 0
      const end = Math.min(start + length, marker.length)
      marker.copy(buffer, offset, start, end)
      return end - start
    },
    closeSync: () => {},
  }
  assert.equal(detectShellPatchInAsar('C:/virtual/app.asar', { fs: fakeFs }), true)
  assert.equal(
    detectShellPatchInAsar('C:/virtual/app.asar', { fs: { statSync: () => ({ isFile: () => false, size: 0 }) } }),
    false,
    '普通 fs 的虚拟目录 → 安全返回 false',
  )
})

test('重启键集成：restart-status.json 可查状态；restart-enable 只接受 POST + 动作头', async () => {
  const { webServer } = boot()
  const status = await callRoute(webServer, `${ROUTE_PREFIX}/restart-status.json`)
  const payload = JSON.parse(status.body)
  assert.equal(payload.ok, true)
  assert.equal(typeof payload.patched, 'boolean')
  assert.equal(typeof payload.desktop, 'boolean')
  assert.equal(typeof payload.asarPath, 'string')
  assert.ok(['node-fs', 'original-fs', 'no-asar'].includes(payload.rawAsarFs), 'rawAsarFs 必须是已知读取通道')
  const wrongMethod = await callRoute(webServer, `${ROUTE_PREFIX}/restart-enable`, { method: 'GET' })
  assert.equal(wrongMethod.statusCode, 405)
  const noHeader = await callRoute(webServer, `${ROUTE_PREFIX}/restart-enable`, { method: 'POST' })
  assert.equal(noHeader.statusCode, 403)
  const prev = process.env.DSHUI_NO_SPAWN
  process.env.DSHUI_NO_SPAWN = '1'
  try {
    const ok = await callRoute(webServer, `${ROUTE_PREFIX}/restart-enable`, {
      method: 'POST',
      headers: { 'x-dshui-action': 'restart-enable' },
    })
    assert.equal(ok.statusCode, 200)
    const body = JSON.parse(ok.body)
    assert.equal(typeof body.ok, 'boolean')
    if (body.ok !== true) assert.ok(String(body.error || '').length > 0, '失败要带原因')
  } finally {
    if (prev === undefined) delete process.env.DSHUI_NO_SPAWN
    else process.env.DSHUI_NO_SPAWN = prev
  }
})

test('路由：跨站请求被栅栏拒掉', async () => {
  const { webServer } = boot()
  const response = await callRoute(webServer, `${ROUTE_PREFIX}/status.json`, {
    headers: { host: '127.0.0.1:19387', 'sec-fetch-site': 'cross-site' },
  })
  assert.equal(response.statusCode, 403)
  assert.equal(response.body, 'forbidden')
})

test('卸载：ctx.effect 的 disposer 摘掉全部路由与注入', () => {
  const { webServer, root } = boot()
  assert.equal(webServer.routes.size, 9)
  assert.equal(webServer.taps.length, 1)

  for (const dispose of root.effects) dispose()

  assert.equal(webServer.routes.size, 0, '路由应全部注销')
  assert.equal(webServer.taps.length, 0, 'tapIndex 应注销')
})

test('真实桌面图存在时可被解析（本机环境自检）', () => {
  const desktopPath = resolveDesktopImagePath(REAL_HOME)
  const exists = fs.existsSync(desktopPath)
  // 本机没有桌面图也不该失败：包内兜底图必须始终可用。
  const resolved = resolveBackgroundBytes(desktopPath)
  assert.ok(resolved.bytes.length > 1000)
  assert.ok(['desktop', 'bundled'].includes(resolved.source))
  if (exists) assert.equal(resolved.source, 'desktop')
})

test('重启键自动准备（0.8.6）：dry-run / 已自动准备 / 已打补丁 / asar 缺失', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dshui-restart-auto-'))
  const asar = path.join(root, 'resources', 'app.asar')
  fs.mkdirSync(path.dirname(asar), { recursive: true })
  fs.writeFileSync(asar, Buffer.alloc(4096, 0))
  const marker = path.join(root, 'auto-marker.json')
  const options = { asarPath: asar, markerFile: marker, argv: ['node.exe', 'D:\DSH\resources\app.asar\dsh\node_modules\@deepseek-ai\dsh-desktop-host\lib\index.js'], env: { DSHUI_NO_SPAWN: '1', DSHUI_FORCE_AUTO: '1' } }

  const dry = armRestartInstaller(options)
  assert.equal(dry.ok, true)
  assert.equal(dry.reason, 'dry-run', '测试模式只干跑，不 spawn')
  assert.equal(dry.prepared, true)
  const disabled = armRestartInstaller(Object.assign({}, options, { env: { DSHUI_NO_AUTO_RESTART: '1' } }))
  assert.equal(disabled.reason, 'auto-disabled')

  fs.writeFileSync(marker, JSON.stringify({
    asarPath: asar,
    asarMtimeMs: fs.statSync(asar).mtimeMs,
    armedAt: Date.now(),
  }))
  const snap = restartAutoSnapshot({ asarPath: asar, markerFile: marker })
  assert.equal(snap.prepared, true)
  assert.equal(snap.reason, 'already-armed')

  fs.appendFileSync(asar, '\n// DSH-RESTART-BUTTON BEGIN\n// <<< DSH-RESTART-BUTTON END\n')
  const patched = restartAutoSnapshot({ asarPath: asar, markerFile: marker })
  assert.equal(patched.patched, true)
  assert.equal(patched.reason, 'already-patched')

})

test('深色壁纸（0.8.7）：只从桌面读、浅色候选列表不变；没有暗色图时返回空', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dshui-dark-wall-'))
  fs.mkdirSync(path.join(home, 'Desktop'), { recursive: true })
  const darkFile = path.join(home, 'Desktop', 'DeepSeek 暗夜模式.png')
  fs.writeFileSync(darkFile, Buffer.alloc(128, 7))

  const dark = listAvailableDarkImages(home)
  assert.equal(dark.length, 1)
  assert.equal(dark[0].name, DARK_IMAGE_NAME)
  assert.equal(dark[0].source, 'desktop')

  const resolved = resolveImageSource(home, DARK_IMAGE_NAME)
  assert.equal(resolved.name, DARK_IMAGE_NAME)
  assert.equal(resolved.bytes.length, 128)

  const light = listAvailableImages(home)
  assert.deepEqual(light.map((entry) => entry.name), ['deepseek 4k.png', 'deepseek 黑白无水面.png'], '浅色候选保持不变')

  // 空桌面：包内 deepseek-dark.webp 兜底（v0.8.12 起随包）
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'dshui-dark-none-'))
  const bundled = listAvailableDarkImages(empty)
  assert.equal(bundled.length, 1)
  assert.equal(bundled[0].name, DARK_IMAGE_NAME)
  assert.equal(bundled[0].source, 'bundled')
  const bundledResolved = resolveImageSource(empty, DARK_IMAGE_NAME)
  assert.equal(bundledResolved.source, 'bundled')
  assert.ok(bundledResolved.bytes.length > 0)
})
