/**
 * client.js (v0.2.4) 的行为测试。
 *
 * 设计（v0.2.4）：
 *   - 默认模式 = 关闭（一切恢复默认，什么都不挂）；
 *   - 「纹理」= multiply 混合 + 浓度滑块；
 *   - 「待更新」= 占位按钮，点了只提示；
 *   - 回归护栏：任何模式下页面已有元素的布局样式一个字节都不许变。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import { attachWindowsMenu, buildChatDom, createDom } from './fake-dom.js'

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url))
const CLIENT_SOURCE = fs.readFileSync(path.join(TEST_DIR, '..', 'lib', 'client.js'), 'utf8')

/** 在桩环境里跑一遍 client.js。 */
function runClient(dom, options) {
  const opts = options || {}
  // 0.8.0：开屏默认播放会遮住胶囊（新增的隐藏逻辑），不研究开屏的用例默认先关掉；
  // 研究开屏的用例显式传 { splash: true }。
  if (opts.splash !== true) {
    try {
      dom.window.localStorage.setItem('__dshui.splash.v1', JSON.stringify({ enabled: false }))
    } catch (err) {
      /* 桩里 localStorage 不可用时忽略 */
    }
  }
  const logs = []
  const requested = opts.requested || []
  const images = opts.statusImages || []
  const darkImages = opts.statusDarkImages || []
  const context = {
    window: dom.window,
    document: dom.document,
    // 0.6.5 起带上观察器桩：DOM 变化攒进队列，测试用 dom.flushMutations() 派发
    // （= 真实世界那一次"绘制之前的微任务"，client 的抢修就发生在那一刻）
    MutationObserver: dom.MutationObserver,
    // 0.7.0 帧探针的单调时钟（桩里跟着 advance() 走，帧率可以精确断言）
    performance: dom.window.performance,
    setTimeout: dom.setTimeout,
    clearTimeout: dom.clearTimeout,
    console: {
      log: (...args) => logs.push(args.join(' ')),
      warn: (...args) => logs.push(args.join(' ')),
      error: (...args) => logs.push(args.join(' ')),
    },
    fetch: (url) => {
      requested.push(String(url))
      return Promise.resolve({
        ok: opts.statusOk !== false,
        json: () => {
          if (opts.statusPayload !== undefined) return Promise.resolve(opts.statusPayload)
          const wanted = /[?&]img=([^&]+)/.exec(String(url))
          const name = wanted ? decodeURIComponent(wanted[1]) : null
          const file = name || (images[0] && images[0].name) || null
          return Promise.resolve({
            ok: true,
            source: 'desktop',
            file,
            url: '/dsh-ui-beautify/bg.png' + (name ? '?img=' + encodeURIComponent(name) : ''),
            bytes: 123,
            images,
            darkImages,
            user: opts.statusUser || '',
          })
        },
      })
    },
  }
  context.globalThis = context
  context.self = context
  vm.createContext(context)
  new vm.Script(CLIENT_SOURCE, { filename: 'client.js' }).runInContext(context)
  return { context, api: dom.window.__DSHUI__, logs, requested }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))
/** 与 lib/client.js 的 SPLASH_FADE_MS 保持一致（360ms）。 */
const SPLASH_FADE_MS_FOR_TEST = 360

const layerOf = (dom) => dom.document.querySelectorAll('#__dshui-layer')[0] || null
const styleTagOf = (dom) => dom.document.getElementById('__dshui-style')
const pillOf = (dom) => dom.document.getElementById('__dshui-pill')
const pillText = (dom) => {
  const pill = pillOf(dom)
  const span = pill && pill.querySelector('.__dshui-pill-text')
  return span ? span.textContent : null
}

function clickOn(dom, node) {
  const event = { type: 'click', target: node, button: 0, defaultPrevented: false }
  dom.document.dispatchEvent(event)
  return event
}

/** 页面里所有元素（不含插件自己的节点）的"布局相关内联样式"快照。 */
function layoutSnapshot(dom) {
  const out = []
  const OURS = new Set([
    '__dshui-layer',
    '__dshui-layer2',
    '__dshui-diag',
    '__dshui-switcher',
    '__dshui-pill',
    '__dshui-style',
    '__dshui-splash',
    '__dshui-welcome',
  ])
  const walk = (node) => {
    const ours = node.nodeType === 1 && OURS.has(node.id)
    if (ours) return // 插件自己的节点连同子树一起跳过
    if (node.nodeType === 1 && node.tagName !== 'STYLE' && node.tagName !== 'SCRIPT') {
      out.push(
        [
          node.tagName + '.' + node.className,
          node.style.getPropertyValue('position'),
          node.style.getPropertyValue('overflow'),
          node.style.getPropertyValue('z-index'),
          node.style.getPropertyValue('display'),
          node.style.getPropertyValue('width'),
          node.style.getPropertyValue('height'),
          node.style.getPropertyValue('pointer-events'),
        ].join('|'),
      )
    }
    for (const child of node.childNodes) walk(child)
  }
  walk(dom.document)
  return out.join('\n')
}

test('默认模式 = 关闭：不挂层、不插样式、不碰页面', async () => {
  const dom = buildChatDom()
  const before = layoutSnapshot(dom)
  const { api } = runClient(dom)
  await flush()

  assert.equal(api.status().mode, 'off', '默认应为关闭')
  assert.equal(layerOf(dom), null, '关闭模式不该挂层')
  assert.equal(styleTagOf(dom), null, '关闭模式不该插样式')
  assert.equal(layoutSnapshot(dom), before)
})

test('常驻入口：默认回到 v0.2.11 的位置（窗口左上角 10,10），点一下开面板、再点关面板', async () => {
  const dom = buildChatDom()
  const { api } = runClient(dom)
  await flush()

  const pill = pillOf(dom)
  assert.ok(pill, '应有常驻入口')
  assert.equal(pill.parentNode, dom.body)
  assert.equal(pill.style.getPropertyValue('position'), 'fixed', '入口必须固定定位，不参与页面布局')
  assert.equal(pill.style.getPropertyValue('left'), '10px', '默认位置 = 上一版（窗口左上角）')
  assert.equal(pill.style.getPropertyValue('top'), '10px', '默认位置 = 上一版（窗口左上角）')
  assert.equal(pill.style.getPropertyValue('cursor'), 'grab', '应提示可以拖动')
  assert.equal(pill.getAttribute('data-dshui-ignore'), '', '入口必须标记为插件自己的节点，不算"点背景"')
  assert.equal(pillText(dom), 'DSH UI · 关闭', '关闭模式下入口显示当前模式')

  // 点入口 → 开面板，面板贴在入口正下方
  pill._listeners.click[0]({ type: 'click', target: pill, stopPropagation() {} })
  const box = dom.document.querySelectorAll('#__dshui-switcher')[0]
  assert.ok(box, '点入口应开面板')
  assert.equal(box.style.getPropertyValue('left'), '10px', '面板应与入口左对齐')
  assert.equal(box.style.getPropertyValue('top'), '52px', '面板应贴在入口下方（10 + 42）')
  assert.equal(api.status().override, false, '点入口不该触发背景恢复')

  // 再点 → 收面板
  pill._listeners.click[0]({ type: 'click', target: pill, stopPropagation() {} })
  assert.equal(dom.document.querySelectorAll('#__dshui-switcher').length, 0, '再点入口应收起面板')
})

/** 模拟一次拖动手势（pointerdown → pointermove → pointerup）。 */
function dragPill(dom, from, to) {
  const pill = pillOf(dom)
  pill._listeners.pointerdown[0]({
    type: 'pointerdown',
    button: 0,
    clientX: from.x,
    clientY: from.y,
    pointerId: 1,
    stopPropagation() {},
  })
  dom.document.dispatchEvent({ type: 'pointermove', clientX: to.x, clientY: to.y })
  dom.document.dispatchEvent({ type: 'pointerup' })
  return pill
}

test('常驻入口：可拖动，位置写入 localStorage 并在重启后恢复', async () => {
  const dom = buildChatDom()
  const { api } = runClient(dom)
  await flush()

  dragPill(dom, { x: 100, y: 100 }, { x: 460, y: 380 })
  const pill = pillOf(dom)
  assert.equal(pill.style.getPropertyValue('left'), '370px', '横向应跟随鼠标位移（100→460 即 +360）')
  assert.equal(pill.style.getPropertyValue('top'), '290px', '纵向应跟随鼠标位移（100→380 即 +280）')
  assert.equal(
    dom.window.localStorage.getItem('__dshui.pill'),
    JSON.stringify({ left: 370, top: 290 }),
    '拖动结束后应记住位置',
  )

  // 拖动结束后浏览器会补发一个 click —— 不应被当成点击（面板不打开）
  pill._listeners.click[0]({ type: 'click', target: pill, stopPropagation() {} })
  assert.equal(dom.document.querySelectorAll('#__dshui-switcher').length, 0, '拖动补发的 click 不应开面板')

  // 真正的点击 → 开面板，且面板跟随入口位置
  pill._listeners.click[0]({ type: 'click', target: pill, stopPropagation() {} })
  const box = dom.document.querySelectorAll('#__dshui-switcher')[0]
  assert.ok(box, '点击应开面板')
  assert.equal(box.style.getPropertyValue('left'), '370px', '面板应跟随入口横向位置')
  assert.equal(box.style.getPropertyValue('top'), '332px', '面板应贴在入口下方（290 + 42）')
  void api

  // 模拟重启：新页面 + 同一份 localStorage
  const dom2 = buildChatDom()
  dom2.window.localStorage.setItem('__dshui.pill', dom.window.localStorage.getItem('__dshui.pill'))
  runClient(dom2)
  await flush()
  assert.equal(pillOf(dom2).style.getPropertyValue('left'), '370px', '重启后应记得位置（left）')
  assert.equal(pillOf(dom2).style.getPropertyValue('top'), '290px', '重启后应记得位置（top）')
})

test('常驻入口：拖动时不会误触发点击，轻微抖动仍算点击', async () => {
  const dom = buildChatDom()
  runClient(dom)
  await flush()

  // 抖动 2px（小于阈值）→ 仍算点击，面板打开
  dragPill(dom, { x: 100, y: 100 }, { x: 102, y: 101 })
  const pill = pillOf(dom)
  assert.equal(pill.style.getPropertyValue('left'), '10px', '小于阈值的抖动不移动位置')
  pill._listeners.click[0]({ type: 'click', target: pill, stopPropagation() {} })
  assert.equal(dom.document.querySelectorAll('#__dshui-switcher').length, 1, '抖动后点一下应正常开面板')
})

test('常驻入口：位置会被夹在视口内（记录坏值也能恢复）', async () => {
  const dom = buildChatDom()
  dom.window.localStorage.setItem('__dshui.pill', JSON.stringify({ left: -500, top: 99999 }))
  runClient(dom)
  await flush()

  const pill = pillOf(dom)
  assert.equal(pill.style.getPropertyValue('left'), '0px', '越界的 left 应夹回 0')
  const top = parseFloat(pill.style.getPropertyValue('top'))
  assert.ok(top > 0 && top < 900, `越界的 top 应夹进视口，实际 ${top}`)
})

test('左上角 GUI：入口标签跟随模式变化', async () => {
  const dom = buildChatDom()
  const { api } = runClient(dom)
  await flush()

  assert.equal(pillText(dom), 'DSH UI · 关闭')
  api.setMode('multiply')
  assert.equal(pillText(dom), 'DSH UI · 静态 · 纹理', '切到纹理后入口应更新')
  api.setMode('off')
  assert.equal(pillText(dom), 'DSH UI · 关闭', '切回关闭后入口应更新')
  assert.ok(pillOf(dom), '关闭模式也保留入口（否则没有入口再打开面板）')

  // 只有显式 uninstall() 才会移除入口
  api.uninstall()
  assert.equal(pillOf(dom), null, 'uninstall() 应把入口也移除')
})

test('左上角 GUI：点入口不会被当成"点背景"，也不会拦页面事件', async () => {
  const dom = buildChatDom()
  const { api } = runClient(dom)
  await flush()
  api.setMode('multiply')
  dom.advance(40) // 等淡入的"透明钉"放开
  const layer = layerOf(dom)

  const pill = pillOf(dom)
  clickOn(dom, pill)
  assert.equal(api.status().override, false, '点入口不触发淡出恢复')
  assert.equal(layer.classList.contains('is-faded'), false)
})

test('纹理模式：挂 multiply 层 + 浓度默认 0.49', async () => {
  const dom = buildChatDom()
  const { api } = runClient(dom)
  await flush()

  assert.match(api.setMode('multiply'), /已切换到 静态 · 纹理/)

  const layer = layerOf(dom)
  assert.ok(layer, '纹理模式应挂层')
  assert.equal(layer.getAttribute('data-mode'), 'multiply')

  const style = styleTagOf(dom).textContent
  assert.match(style, /mix-blend-mode:multiply/)

  // 毛玻璃 = 半透明白 + backdrop-filter（不再用伪元素贴图）
  assert.match(style, /body\.__dshui-frost \.__dshui-frost-surface\{/)
  assert.match(style, /background:radial-gradient\(ellipse at 50% 50%,/)
  assert.match(style, /backdrop-filter:blur\(var\(--dsniang-frost-blur,2px\)\)/, '必须是真正的背景模糊')
  assert.match(style, /-webkit-backdrop-filter:blur/, 'Safari/旧内核也要有')
  assert.equal(/::after/.test(style), false, '不再用 ::after 贴假图（改用 backdrop-filter 白层）')

  // 浓度默认 0.49（作者实机取值，出厂默认）：写在**层的内联样式**上（样式表是不含数值的静态表）
  assert.equal(api.status().opacity, 0.49)
  dom.advance(600) // 等淡入补间走完
  assert.equal(layer.style.getPropertyValue('opacity'), '0.49', '浓度应由层的内联样式承载')
  assert.equal(
    /url\(/.test(style),
    false,
    '样式表里不该有图片 URL（图片走内联；否则每次换图都要改写样式表 → 合成层重建 → 闪白光）',
  )
  assert.equal(
    /data-mode="multiply"\][^{]*\{[^}]*opacity/.test(style),
    false,
    '混合规则里不该再有浓度数值（浓度走内联，样式表保持静态）',
  )
})

test('背景模式：挂 z-index:-1 的垫底层 + 浓度默认 0.5 + 图不写 none（0.3.0 起；0.3.2 调浓）', async () => {
  const dom = buildChatDom()
  const { api } = runClient(dom)
  await flush()

  assert.match(api.setMode('backdrop'), /已切换到 静态 · 背景/)

  const layer = layerOf(dom)
  assert.ok(layer, '背景模式应挂层')
  assert.equal(layer.getAttribute('data-mode'), 'backdrop')

  const style = styleTagOf(dom).textContent
  assert.match(
    style,
    /#__dshui-layer\[data-mode="backdrop"\],#__dshui-layer2\[data-mode="backdrop"\]\{z-index:-1;mix-blend-mode:normal;\}/,
    '背景模式 = 负 z 垫底 + 不参与混合',
  )
  assert.match(style, /z-index:2147483000;mix-blend-mode:multiply/, '纹理规则仍在（两种模式并存）')

  assert.equal(api.status().opacity, 0.5, '背景模式默认浓度 0.5（0.3.2 起，图一眼可见）')
  dom.advance(600)
  assert.equal(layer.style.getPropertyValue('opacity'), '0.5')

  // 关键护栏：旧版 applyLayerBackground 只认 multiply → 背景模式会把图写成 none（什么都没有）
  assert.match(layer.style.getPropertyValue('background-image'), /bg\.png/, '背景模式下图必须写在层上')
  assert.equal(dom.window.localStorage.getItem('__dshui.mode'), 'backdrop', '模式要持久化')

  // 0.4.0 起：背景模式也开毛玻璃 —— frost 类照挂、面板照有毛玻璃控件
  assert.equal(dom.body.classList.contains('__dshui-frost'), true, '背景模式要挂 frost 类（0.4.0）')
  api.switcher()
  assert.equal(dom.document.querySelectorAll('[data-frost-toggle]').length, 1, '背景模式有毛玻璃开关（0.4.0）')
  assert.equal(dom.document.querySelectorAll('[data-dsh-blur-slider]').length, 1, '背景模式也有 DSH 面板模糊滑块')
})

test('背景模式：页链上所有不透明底色全清（0.3.2 内联透明），关闭逐字还原', async () => {
  const dom = buildChatDom()
  // 桩的页链（transcript → panel → shell → root）本来都带着不透明白底 —— 模拟 DSH 的 frame 那几层
  const before = {
    panel: dom.panel.style.cssText,
    shell: dom.shell.style.cssText,
    root: dom.root.style.cssText,
  }
  const { api } = runClient(dom)
  await flush()
  api.setMode('backdrop')
  dom.advance(600)

  assert.equal(dom.panel.style.getPropertyValue('background-color'), 'transparent', '页链上的底色要清成透明')
  assert.equal(dom.panel.style.getPropertyValue('background-image'), 'none')
  assert.equal(dom.root.style.getPropertyValue('background-color'), 'transparent')
  assert.match(api.diagnose(), /背景透明: 已清 3 层（页链 3 层）/, '诊断要能看到清了几层')
  assert.equal(api.status().mode, 'backdrop')

  // 切到纹理 → 页链清掉的底色还原（背景模式专属；纹理自己的分层改动与它无关）
  api.setMode('multiply')
  assert.equal(dom.panel.style.getPropertyValue('background-color'), '', '离开背景模式后清掉的底色要还原（内联移除）')
  assert.equal(dom.panel.style.getPropertyValue('background-image'), '')
  assert.equal(dom.root.style.getPropertyValue('background-color'), '')
  assert.equal(dom.root.style.getPropertyValue('background-image'), '')

  // 再进背景模式 → 重新清；关闭 → 全量还原
  api.setMode('backdrop')
  assert.equal(dom.panel.style.getPropertyValue('background-color'), 'transparent')
  api.setMode('off')
  dom.advance(600)
  assert.equal(dom.panel.style.cssText, before.panel, '关闭后页链 cssText 逐字还原')
  assert.equal(dom.shell.style.cssText, before.shell)
  assert.equal(dom.root.style.cssText, before.root)
})

test('背景模式：输入区座位的渐变擦除带也要清（不开毛玻璃也清），关闭后逐字还原', async () => {
  const dom = buildChatDom()
  dom.transcript.appendChild(dom.seat)
  dom.setComputedStyle(dom.seat, {
    backgroundColor: 'rgb(255, 255, 255)',
    backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0) 0px, rgb(255,255,255) 36px)',
    position: 'sticky',
    overflow: 'visible',
  })
  dom.seat.style.setProperty('border-radius', '12px')
  const seatInline = dom.seat.style.cssText

  const { api } = runClient(dom)
  await flush()
  api.setMode('backdrop')

  assert.equal(api.status().frost.cleared.join('|'), 'div._composerSeat_test_6', '背景模式下座位遮罩也要清')
  assert.equal(dom.seat.style.getPropertyValue('background-color'), 'transparent')
  assert.equal(dom.seat.style.getPropertyValue('background-image'), 'none')
  assert.equal(dom.seat.style.getPropertyValue('border-radius'), '12px', '别的内联样式一律不碰')
  // 0.4.0 起背景模式也有毛玻璃；这里只验证"座位擦除带"照旧清、且不依赖毛玻璃开关
  assert.equal(dom.body.classList.contains('__dshui-frost'), true, '背景模式现在挂 frost 类（0.4.0）')

  // 关闭背景模式 → 座位遮罩逐字还原
  api.setMode('off')
  dom.advance(600)
  assert.equal(dom.seat.style.cssText, seatInline, '关闭背景模式后必须逐字还原')
  assert.equal(api.status().frost.cleared.length, 0)
})

test('背景模式：切换对话（React 换掉页链/座位节点）后要自动重清，不是让壁纸被盖住', async () => {
  const dom = buildChatDom()
  // 座位自带那条 36px 渐变擦除带（真实 DSH 的 composerSeat 就是这样）
  dom.setComputedStyle(dom.seat, {
    backgroundColor: 'rgb(255, 255, 255)',
    backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0) 0px, rgb(255,255,255) 36px)',
    position: 'sticky',
    overflow: 'visible',
  })
  const { api } = runClient(dom)
  await flush()
  const panelInlineOriginal = dom.panel.style.cssText // 挂载前的原样（= 空）
  api.setMode('backdrop')
  dom.advance(600)

  // 第一轮：页链（面板/外壳/#root）与座位链都清好了
  assert.equal(dom.panel.style.getPropertyValue('background-color'), 'transparent', '页链第一层先清')
  assert.equal(dom.seat.style.getPropertyValue('background-color'), 'transparent', '座位擦除带先清')
  assert.equal(api.layoutReport().backdrop.cleared.length >= 1, true, '账本里有清过的层')
  assert.equal(api.layoutReport().backdrop.repairs, 0, '第一轮不算自愈')

  // ── 模拟"切换对话"：React 把中间那几层整棵换新（新节点带着应用底色回来）──────
  // 桩里没有 MutationObserver，所以这里手动造场景 + 手动触发插件那一遍重贴
  // （真实环境里由 watchFrostTargets 的 250ms 观察器回调触发，同一套代码路径）。
  const newPanel = dom.document.createElement('div')
  newPanel.className = '_panel_test_2_switched'
  newPanel._rect = { top: 0, left: 0, right: 1600, bottom: 900, width: 1600, height: 900 }
  dom.shell.replaceChild(newPanel, dom.panel)
  const newTranscript = dom.document.createElement('div')
  newTranscript.className = '_transcript_test_3_switched'
  newTranscript.setAttribute('data-conversation-scroll', 'true')
  newTranscript._rect = { top: 0, left: 400, right: 1600, bottom: 780, width: 1200, height: 780 }
  newPanel.appendChild(newTranscript)
  const newSeat = dom.document.createElement('div')
  newSeat.className = '_composerSeat_test_6_switched'
  newSeat._rect = { top: 780, left: 400, right: 1600, bottom: 900, width: 1200, height: 120 }
  newPanel.appendChild(newSeat)
  const newCardRoot = dom.document.createElement('div')
  newSeat.appendChild(newCardRoot)
  const newCard = dom.document.createElement('div')
  newCard.setAttribute('data-composer-card', 'true')
  newCard._rect = { top: 780, left: 400, right: 1600, bottom: 900, width: 1200, height: 120 }
  newCardRoot.appendChild(newCard)
  const newBase = { backgroundColor: 'rgb(255, 255, 255)', position: 'static', overflow: 'visible' }
  dom.setComputedStyle(newPanel, newBase)
  dom.setComputedStyle(newTranscript, { backgroundColor: 'rgba(0, 0, 0, 0)', position: 'static', overflow: 'auto', overflowY: 'auto' })
  dom.setComputedStyle(newSeat, {
    backgroundColor: 'rgb(255, 255, 255)',
    backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0) 0px, rgb(255,255,255) 36px)',
    position: 'sticky',
    overflow: 'visible',
  })
  dom.setComputedStyle(newCardRoot, { backgroundColor: 'rgba(0, 0, 0, 0)', position: 'static', overflow: 'visible' })
  dom.setComputedStyle(newCard, { backgroundColor: 'rgba(255, 255, 255, 0.85)', position: 'static', overflow: 'visible' })
  newSeat.style.setProperty('border-radius', '12px')

  // 换新之后：新面板是实心底 → 壁纸被它盖住（这就是用户看到的"背景失效"）
  assert.equal(newPanel.style.getPropertyValue('background-color'), '', '新节点一开始当然没有我们的内联清底')
  assert.equal(newSeat.style.getPropertyValue('background-color'), '', '新座位也带着擦除带')

  // 插件重贴一遍（= 观察器回调里做的事）
  const result = api.reapply()
  assert.match(result, /已重贴/, 'reapply 要有可读结果')

  // ① 新节点必须被清（壁纸重新露出来）
  assert.equal(newPanel.style.getPropertyValue('background-color'), 'transparent', '新面板要补清（否则壁纸被盖住）')
  assert.equal(newSeat.style.getPropertyValue('background-color'), 'transparent', '新座位擦除带要补清')
  assert.equal(newSeat.style.getPropertyValue('background-image'), 'none', '渐变擦除带也要清')
  assert.equal(newSeat.style.getPropertyValue('border-radius'), '12px', '别的内联样式一律不碰')
  assert.equal(newCardRoot.style.getPropertyValue('background-color'), '', '没画底的层不该被无谓地写内联')

  // ② 自愈计数要涨（用户没有 DevTools，这个数字就是"它自己修过"的证据）
  assert.equal(api.layoutReport().backdrop.repairs, 1, '整页透明化自愈 1 次')
  assert.equal(api.layoutReport().frost.repairs, 1, '通透化自愈 1 次')
  assert.match(api.diagnose(), /自愈 1 次/, '诊断里要看得见自愈次数')

  // ③ 旧节点（已脱离文档）逐字还原，不留我们的痕迹
  assert.equal(dom.panel.style.cssText, panelInlineOriginal, '旧面板的账要还清（还原成挂载前的空内联）')
  assert.equal(dom.panel.style.getPropertyValue('background-color'), '', '旧面板不再带着我们的 transparent')

  // ④ 再关掉 → 新链也要逐字还原
  const newSeatInline = newSeat.style.cssText // 现在带着我们的清底，留作"改过之后"的参照
  assert.match(newSeatInline, /transparent/)
  api.setMode('off')
  dom.advance(600)
  assert.equal(newSeat.style.getPropertyValue('background-color'), '', '关闭后新座位要还回原样')
  assert.equal(newSeat.style.getPropertyValue('background-image'), '', '关闭后渐变也要还回去')
  assert.equal(newSeat.style.getPropertyValue('border-radius'), '12px', '无关内联样式还在')
})

test('壁纸体检（0.6.4）：图层被 React 摘掉/抹成透明时自己补回来，并记进诊断', async () => {
  const dom = buildChatDom()
  const { api } = runClient(dom)
  await flush()
  api.setMode('backdrop')
  dom.advance(600)

  const layer = layerOf(dom)
  assert.ok(layer, '图层应该在')
  assert.match(layer.style.getPropertyValue('background-image'), /url\(/, '图层带着图')

  // ① 节点被摘掉（整个 div 从 body 里消失）
  dom.body.removeChild(layer)
  assert.equal(dom.document.querySelectorAll('#__dshui-layer').length, 0, '先确认真的摘掉了')
  assert.match(api.reapply(), /已重贴/)
  const layer2 = layerOf(dom)
  assert.ok(layer2, '体检发现缺层 → 补回来')
  assert.match(layer2.style.getPropertyValue('background-image'), /url\(/, '补回来的层要重新画上图')
  assert.equal(layer2.getAttribute('data-mode'), 'backdrop', 'data-mode 也要补')
  assert.match(api.layoutReport().wallpaper.text, /在/, '诊断要报"在"')
  assert.equal(api.layoutReport().wallpaper.repairs >= 1, true, '自愈计数要涨')

  // ② 图被抹掉（有人把内联 background-image 删了）
  layer2.style.removeProperty('background-image')
  assert.equal(layerOf(dom).style.getPropertyValue('background-image'), '', '先确认图被抹了')
  api.reapply()
  assert.match(layerOf(dom).style.getPropertyValue('background-image'), /url\(/, '体检要把图补回来')

  // ③ 卡死的淡出（is-faded 留着、但并没有淡出流程在跑）→ 摘掉
  layerOf(dom).classList.add('is-faded')
  assert.equal(layerOf(dom).classList.contains('is-faded'), true)
  api.reapply()
  assert.equal(layerOf(dom).classList.contains('is-faded'), false, '卡死的 is-faded 要被摘掉')
  assert.match(api.diagnose(), /^壁纸: /m, '诊断面板要有「壁纸」这一行')
})

test('壁纸体检（0.6.4）：链外的全屏不透明盖子会被点名叫出来并清掉（关模式/还原）', async () => {
  const dom = buildChatDom()
  const { api } = runClient(dom)
  await flush()
  api.setMode('backdrop')
  dom.advance(600)

  // 造一个"不在祖先链上"的新会话加载壳：body 的直接子节点、全屏、不透明
  const veil = dom.document.createElement('div')
  veil.className = '_loading_veil_test'
  veil._rect = { top: 0, left: 0, right: 1920, bottom: 1080, width: 1920, height: 1080 }
  dom.body.appendChild(veil)
  dom.setComputedStyle(veil, { backgroundColor: 'rgb(255, 255, 255)', position: 'fixed', overflow: 'visible' })

  const report = api.wallpaper()
  assert.match(report, /链外盖子/, '体检要点名"链外盖子"')
  assert.match(report, /_loading_veil_test/, '要点出是哪个元素')
  assert.equal(veil.style.getPropertyValue('background-color'), 'transparent', '盖子要被清掉（壁纸露出来）')
  assert.equal(veil.style.getPropertyPriority('background-color'), 'important', '要带 !important 压过应用的类规则')
  assert.equal(api.layoutReport().wallpaper.coverCount, 1, '账本里记着 1 个盖子')

  // 盖子消失（加载完）→ 逐字还回去
  dom.body.removeChild(veil)
  api.reapply()
  assert.equal(veil.style.getPropertyValue('background-color'), '', '扫不到就还原（不留痕迹）')
  assert.equal(api.layoutReport().wallpaper.coverCount, 0, '账本要清空')

  // 再放一个，然后切回纹理模式 → 也必须还原
  const veil2 = dom.document.createElement('div')
  veil2.className = '_loading_veil_test_2'
  veil2._rect = { top: 0, left: 0, right: 1920, bottom: 1080, width: 1920, height: 1080 }
  dom.body.appendChild(veil2)
  dom.setComputedStyle(veil2, { backgroundColor: 'rgb(250, 250, 250)', position: 'fixed', overflow: 'visible' })
  api.reapply()
  assert.equal(veil2.style.getPropertyValue('background-color'), 'transparent', '新盖子也要清')
  api.setMode('multiply')
  dom.advance(600)
  assert.equal(veil2.style.getPropertyValue('background-color'), '', '离开背景模式要逐字还原')
})

test('壁纸体检（0.6.4）：弹窗/菜单打开时那层变暗遮罩不算"盖子"，绝不误清', async () => {
  const dom = buildChatDom()
  const { api } = runClient(dom)
  await flush()
  api.setMode('backdrop')
  dom.advance(600)

  // 弹窗 + 它自己那层全屏遮罩（有意为之的变暗，不是"盖住壁纸的意外"）
  const dlg = dom.document.createElement('div')
  dlg.setAttribute('role', 'dialog')
  dlg._rect = { top: 200, left: 700, right: 1200, bottom: 700, width: 500, height: 500 }
  dom.body.appendChild(dlg)
  dom.setComputedStyle(dlg, { backgroundColor: 'rgb(255, 255, 255)', position: 'fixed', overflow: 'visible' })
  const mask = dom.document.createElement('div')
  mask.className = '_dialog_mask_test'
  mask._rect = { top: 0, left: 0, right: 1920, bottom: 1080, width: 1920, height: 1080 }
  dom.body.appendChild(mask)
  dom.setComputedStyle(mask, { backgroundColor: 'rgba(15, 23, 42, 0.55)', position: 'fixed', overflow: 'visible' })

  api.reapply()
  assert.equal(mask.style.getPropertyValue('background-color'), '', '弹窗打开时不碰那层遮罩')
  assert.equal(api.layoutReport().wallpaper.coverCount, 0, '也不该记进盖子账本')
})

test('壁纸体检：悬浮 tooltip/临时浮层不当“盖子”清掉（0.8.27）', async () => {
  const dom = buildChatDom()
  const { api } = runClient(dom)
  await flush()
  api.setMode('backdrop')
  dom.advance(600)
  const tip = dom.document.createElement('div')
  tip.setAttribute('role', 'tooltip')
  tip.className = '_tooltip_hover_test'
  tip._rect = { top: 0, left: 0, right: 1920, bottom: 1080, width: 1920, height: 1080 }
  dom.body.appendChild(tip)
  dom.setComputedStyle(tip, { backgroundColor: 'rgb(255, 255, 255)', position: 'fixed', overflow: 'visible' })
  api.reapply()
  assert.equal(tip.style.getPropertyValue('background-color'), '', 'tooltip 不能被当成壁纸盖子清掉')
  assert.equal(api.layoutReport().wallpaper.coverCount, 0, '也不该记进盖子账本')
})

test('壁纸体检（0.6.4）：pointer-events:none 的加载壳命中测试看不见，靠顶层补扫兜住', async () => {
  const dom = buildChatDom()
  const { api } = runClient(dom)
  await flush()
  api.setMode('backdrop')
  dom.advance(600)

  const shell = dom.document.createElement('div')
  shell.className = '_loading_shell_test'
  shell._rect = { top: 0, left: 0, right: 1920, bottom: 1080, width: 1920, height: 1080 }
  shell.style.setProperty('pointer-events', 'none') // 命中测试会跳过它（真实 elementsFromPoint 就是这行为）
  dom.body.appendChild(shell)
  dom.setComputedStyle(shell, { backgroundColor: 'rgb(255, 255, 255)', position: 'fixed', overflow: 'visible' })

  assert.equal(dom.document.elementsFromPoint(800, 300).indexOf(shell), -1, '先确认命中测试真的看不到它')
  const report = api.wallpaper()
  assert.match(report, /_loading_shell_test/, '补扫要把它揪出来')
  assert.equal(shell.style.getPropertyValue('background-color'), 'transparent', '也要清掉（壁纸露出来）')
})

test('抢修（0.6.5）：切对话的 DOM 变化在「绘制之前」就修好，不推进计时器也不该白闪', async () => {
  const dom = buildChatDom()
  const { api } = runClient(dom)
  await flush()
  api.setMode('backdrop')
  dom.advance(600)
  dom.flushMutations() // 把挂载期间攒的变化先派发掉（只跑抢修，不推进时间）

  // ── ① 换掉页链（= 切对话）：新面板带着应用底色 ──────────────────────────
  const newPanel = dom.document.createElement('div')
  newPanel.className = '_panel_switch_test'
  newPanel._rect = { top: 0, left: 0, right: 1600, bottom: 900, width: 1600, height: 900 }
  dom.shell.replaceChild(newPanel, dom.panel)
  const newTranscript = dom.document.createElement('div')
  newTranscript.className = '_transcript_switch_test'
  newTranscript.setAttribute('data-conversation-scroll', 'true')
  newTranscript._rect = { top: 0, left: 400, right: 1600, bottom: 780, width: 1200, height: 780 }
  newPanel.appendChild(newTranscript)
  dom.setComputedStyle(newPanel, { backgroundColor: 'rgb(255, 255, 255)', position: 'static', overflow: 'visible' })
  dom.setComputedStyle(newTranscript, { backgroundColor: 'rgba(0, 0, 0, 0)', position: 'static', overflow: 'auto', overflowY: 'auto' })
  // 注意：这里**没有** advance()，也就是"渲染之前"
  assert.equal(newPanel.style.getPropertyValue('background-color'), '', '换新后当然还没有我们的清底')
  dom.flushMutations()
  assert.equal(newPanel.style.getPropertyValue('background-color'), 'transparent', '派发那一刻就要修好（否则就是白闪）')
  assert.equal(newPanel.style.getPropertyPriority('background-color'), 'important')
  assert.match(api.layoutReport().wallpaper.text, /最近抢修延迟 [0-9]ms/, '延迟要是几毫秒级（同步，不是等 250ms 去抖）')
  assert.equal(
    Number(/最近抢修延迟 (\d+)ms/.exec(api.layoutReport().wallpaper.text)[1]) < 50,
    true,
    '抢修必须发生在"派发那一刻"，不是去抖那一遍',
  )

  // ── ② 顶层冒出一个不透明加载壳：也要在派发那一刻清掉 ────────────────────
  const veil = dom.document.createElement('div')
  veil.className = '_switch_veil_test'
  veil._rect = { top: 0, left: 0, right: 1920, bottom: 1080, width: 1920, height: 1080 }
  dom.body.appendChild(veil)
  dom.setComputedStyle(veil, { backgroundColor: 'rgb(255, 255, 255)', position: 'fixed', overflow: 'visible' })
  assert.equal(veil.style.getPropertyValue('background-color'), '', '刚挂上还没人管')
  dom.flushMutations()
  assert.equal(veil.style.getPropertyValue('background-color'), 'transparent', '顶层新盖子要同步清掉')
  assert.match(api.diagnose(), /链外盖子 1 个/, '诊断里要看得见这个盖子')
})

test('背景模式：认不出消息区时退回 #root（新会话首屏/加载态也不能让壁纸被盖住）', async () => {
  const dom = buildChatDom()
  // 模拟"首屏/hero"：没有 [data-conversation-scroll] 这种明牌标记
  dom.transcript.removeAttribute('data-conversation-scroll')
  const { api } = runClient(dom)
  await flush()
  api.setMode('backdrop')
  dom.advance(600)

  assert.equal(dom.root.style.getPropertyValue('background-color'), 'transparent', '退路：直接清 #root 的底色')
  const report = api.layoutReport()
  assert.equal(report.backdrop.cleared.length >= 1, true, '账本要记下清了哪层')
  assert.equal(report.backdrop.chain[0].cls.indexOf('') === 0, true, '页链实况要能读')
  // 关掉之后 #root 逐字还原
  api.setMode('off')
  dom.advance(600)
  assert.equal(dom.root.style.getPropertyValue('background-color'), '', '关闭后 #root 还原')
})


test('背景模式：薄纱颜色随主题走（亮=白纱、暗=深纱）', async () => {
  // 亮色主题（桩默认 baseToken = #ffffff）
  const light = buildChatDom()
  const a = runClient(light)
  await flush()
  a.api.setMode('backdrop')
  light.advance(600)
  a.api.setScrim(0.3)
  assert.match(
    layerOf(light).style.getPropertyValue('background-image'),
    /rgba\(255,255,255,0\.3\)/,
    '亮色主题 = 白纱',
  )
  assert.equal(a.api.status().theme, 'light')

  // 暗色主题：浅字压白图不可读，必须换深纱（12,14,18）
  const dark = buildChatDom({ baseToken: 'rgb(22, 24, 29)' })
  const b = runClient(dark)
  await flush()
  b.api.setMode('backdrop')
  dark.advance(600)
  b.api.setScrim(0.3)
  assert.match(
    layerOf(dark).style.getPropertyValue('background-image'),
    /rgba\(12,14,18,0\.3\)/,
    '暗色主题 = 深纱',
  )
  assert.equal(b.api.status().theme, 'dark')

  // 纹理模式同样主题感知
  b.api.setMode('multiply')
  dark.advance(600)
  assert.match(layerOf(dark).style.getPropertyValue('background-image'), /rgba\(12,14,18,0\.3\)/)
})

test('背景模式：外壳 frame 的不透明底色被类开关覆盖成透明，关闭即还原（0.3.1 补）', async () => {
  const dom = buildChatDom()
  const { api } = runClient(dom)
  await flush()

  api.setMode('backdrop')
  assert.equal(dom.body.classList.contains('__dshui-backdrop'), true, '背景模式要挂开关类')

  // 0.3.0 的教训：DSH 外壳 .BynINW_frame 有全屏不透明底色，把 -1 的图整块盖住
  const style = styleTagOf(dom).textContent
  assert.match(
    style,
    /body\.__dshui-backdrop \.BynINW_frame,html\[data-windows-titlebar\] body\.__dshui-backdrop \.BynINW_centerCol,html\[data-platform=darwin\] body\.__dshui-backdrop \.BynINW_centerCol\{background-color:transparent!important;background-image:none!important;\}/,
    '样式表要有 frame 透明覆盖规则',
  )

  // 淡出到关闭 → 卸载后开关类摘掉（页面逐字还原）
  api.setMode('off')
  assert.equal(dom.body.classList.contains('__dshui-backdrop'), true, '淡出期间先留着（避免底色闪回）')
  dom.advance(600)
  assert.equal(dom.body.classList.contains('__dshui-backdrop'), false, '卸载后开关类摘除')

  // 切到纹理也不许带这个类
  api.setMode('multiply')
  assert.equal(dom.body.classList.contains('__dshui-backdrop'), false)
})

test('背景模式：面板上有「薄纱」滑块（亮白纱/暗深纱），可存档、刷新读回', async () => {
  const dom = buildChatDom()
  const { api } = runClient(dom)
  await flush()
  api.setMode('backdrop')
  dom.advance(600)
  api.switcher()

  const scrim = dom.document.querySelectorAll('[data-scrim-slider]')[0]
  assert.ok(scrim, '背景模式应有「薄纱」滑块')
  assert.equal(scrim.value, '0', '默认 0（无薄纱）')
  // v0.6.2：下限本来就是 0，但步长 0.05 时"最细只能到 5%"；改成 0.01 后 1% 也够得着
  assert.equal(scrim.min, '0', '下限 0（= 完全不加纱）')
  assert.equal(scrim.step, '0.01', '步长 1%（v0.6.2 从 5% 降下来）')
  assert.equal(scrim.max, '0.9')

  scrim.value = '0.5'
  scrim._listeners.input[0]({ type: 'input', target: scrim, stopPropagation() {} })
  assert.equal(api.status().scrim, 0.5)
  assert.match(layerOf(dom).style.getPropertyValue('background-image'), /rgba\(255,255,255,0\.5\)/, '白纱写进层内联')
  assert.equal(dom.window.localStorage.getItem('__dshui.scrim'), '0.5', '薄纱要存档')

  // 1% 也要真的生效（用户要的"最低数值再调低一点"）
  scrim.value = '0.01'
  scrim._listeners.input[0]({ type: 'input', target: scrim, stopPropagation() {} })
  assert.equal(api.status().scrim, 0.01, '1% 薄纱要生效')
  assert.match(
    layerOf(dom).style.getPropertyValue('background-image'),
    /rgba\(255,255,255,0\.01\)/,
    '1% 也要写进层内联（不能被取整成 0 或被下限挡掉）',
  )
  assert.equal(
    dom.document.querySelectorAll('.__dshui-scrim-value')[0].textContent,
    '1%',
    '数值文案要跟着滑块走',
  )
  scrim.value = '0.5'
  scrim._listeners.input[0]({ type: 'input', target: scrim, stopPropagation() {} })

  // 刷新读回
  const next = buildChatDom()
  next.window.localStorage.setItem('__dshui.scrim', '0.5')
  next.window.localStorage.setItem('__dshui.mode', 'backdrop')
  const two = runClient(next)
  await flush()
  assert.equal(two.api.status().scrim, 0.5, '刷新后读回薄纱')

  // 纹理模式没有这个滑块（薄纱是背景模式专属 UI）
  two.api.setMode('multiply')
  two.api.switcher()
  assert.equal(next.document.querySelectorAll('[data-scrim-slider]').length, 0, '纹理模式不放薄纱滑块')
})

test('背景模式：毛玻璃整套生效（0.4.0 起，与纹理共用参数），可开关、可还原', async () => {
  const dom = buildChatDom()
  // 造一个"我发的"气泡（中心落在父容器右半区 → 判为用户消息）
  const mine = dom.document.createElement('div')
  mine.className = '_bubble_mine'
  mine.setAttribute('role', 'listitem')
  mine._rect = { top: 220, left: 900, right: 1560, bottom: 320, width: 660, height: 100 }
  dom.transcript.appendChild(mine)
  dom.setComputedStyle(mine, { backgroundColor: 'rgb(240,240,240)', position: 'static', overflow: 'visible' })
  const { api } = runClient(dom)
  await flush()
  api.setMode('backdrop')
  dom.advance(600)

  // 卡片与用户气泡都打上玻璃；页链底色照旧清
  assert.ok(dom.composerWrap.classList.contains('__dshui-frost-surface'), '背景模式下输入卡片要糊')
  assert.ok(mine.classList.contains('__dshui-frost-surface'), '背景模式下用户气泡要糊')
  assert.equal(dom.bubble.classList.contains('__dshui-frost-surface'), false, '助手气泡不糊')
  assert.equal(api.status().frost.enabled, true)
  assert.equal(dom.panel.style.getPropertyValue('background-color'), 'transparent', '页链透明化仍生效')

  // 面板里的毛玻璃开关在背景模式下也要能关（0.4.0 修：refreshFrost 不再只在纹理模式生效）
  api.switcher()
  const toggle = dom.document.querySelectorAll('[data-frost-toggle]')[0]
  assert.ok(toggle, '背景模式面板有毛玻璃开关')
  toggle._listeners.click[0]({ type: 'click', target: toggle, stopPropagation() {} })
  dom.advance(600)
  assert.equal(api.status().frost.enabled, false, '背景模式下关毛玻璃要生效')
  assert.equal(dom.composerWrap.classList.contains('__dshui-frost-surface'), false)
  assert.equal(mine.classList.contains('__dshui-frost-surface'), false)

  // 切走再切回：参数记忆不丢
  api.setMode('multiply')
  api.setMode('backdrop')
  dom.advance(600)
  assert.equal(dom.body.classList.contains('__dshui-frost'), false, '关过毛玻璃后背景模式也不该再挂类')
})

test('DSH 面板独立模糊滑块（0.4.0）：独立变量 + 独立规则 + 可存档 + 旧档回落 20', async () => {
  const dom = buildChatDom()
  // 一个 DSH 重命名窗（role=dialog）与一个下拉菜单（role=menu）
  const dlg = dom.document.createElement('div')
  dlg.setAttribute('role', 'dialog')
  dlg._rect = { top: 200, left: 900, right: 1660, bottom: 700, width: 760, height: 500 }
  dom.body.appendChild(dlg)
  const { api } = runClient(dom)
  await flush()
  api.setMode('multiply')
  api.switcher()

  // 样式表：DSH 面板的模糊走独立变量 --dsniang-frost-dsh-blur，默认 20px
  const css = styleTagOf(dom).textContent
  assert.match(
    css,
    /body\.__dshui-frost \[role="dialog"\]\.__dshui-frost-panel,body\.__dshui-frost \[role="menu"\]\.__dshui-frost-panel\{backdrop-filter:blur\(var\(--dsniang-frost-dsh-blur,20px\)\) saturate\(1\.15\)!important;/,
    'DSH 面板要有独立模糊规则（0.4.0）',
  )
  assert.equal(dom.body.style.getPropertyValue('--dsniang-frost-dsh-blur'), '20px', '默认 20px')
  assert.equal(api.status().frost.dshBlur, 20)

  // 滑块：拖到 8px → 状态 + 变量 + 存档三处同步
  const slider = dom.document.querySelectorAll('[data-dsh-blur-slider]')[0]
  assert.ok(slider, '面板要有「DSH 面板模糊」滑块')
  assert.equal(slider.value, '20')
  slider.value = '8'
  slider._listeners.input[0]({ type: 'input', target: slider, stopPropagation() {} })
  assert.equal(api.status().frost.dshBlur, 8)
  assert.equal(dom.body.style.getPropertyValue('--dsniang-frost-dsh-blur'), '8px')
  assert.equal(JSON.parse(dom.window.localStorage.getItem('__dshui.frost.v3')).dshBlur, 8)

  // 旧档（没有 dshBlur 字段）→ 回落默认 20，不炸
  const old = buildChatDom()
  old.window.localStorage.setItem(
    '__dshui.frost.v3',
    JSON.stringify({ enabled: true, blur: 2, alpha: 0.5, panelTop: 0.94, panelBottom: 0.8, bubbleFx: true, aiReplyFx: true, bubbleTransparency: 45, bubbleBlur: 12 }),
  )
  old.window.localStorage.setItem('__dshui.mode', 'multiply')
  const two = runClient(old)
  await flush()
  assert.equal(two.api.status().frost.dshBlur, 20, '旧档没有 dshBlur → 回落 20')
})

/** 造一个"我发的"气泡（中心落在父容器右半区 → isUserMessage 判为用户）。 */
function addUserBubble(dom, tag, rect) {
  const el = dom.document.createElement('div')
  el.className = tag
  el.setAttribute('role', 'listitem')
  el._rect = rect
  dom.transcript.appendChild(el)
  dom.setComputedStyle(el, { backgroundColor: 'rgb(240,240,240)', position: 'static', overflow: 'visible' })
  return el
}

const floatShellsOf = (dom) => dom.document.querySelectorAll('.__dshui-bubble-float') // 0.7.1：仅供"已删除"用例断言零残留

test('「气泡浮层」已在 0.7.1 删除（纹理模式下它必然糊住文字，气泡玻璃改走背景模式）', async () => {
  const dom = buildChatDom()
  const { api } = runClient(dom)
  await flush()
  api.setMode('multiply')
  dom.advance(600)

  // ① 面板里不再有这个开关
  api.switcher()
  assert.equal(
    dom.document.querySelectorAll('[data-bubble-float-toggle]').length,
    0,
    '纹理模式面板不该再有「气泡浮层」开关',
  )
  // ② 样式表里不再有壳的规则；print 规则只藏我们自己那两个图层
  const css = styleTagOf(dom).textContent
  assert.equal(/__dshui-bubble-float/.test(css), false, '样式表里不该再有浮层壳规则')
  assert.match(
    css,
    /@media print\{#__dshui-layer,#__dshui-layer2\{display:none !important;\}\}/,
    'print 规则只隐藏我们自己的图层',
  )
  // ③ 状态/诊断里不再有相关字段
  assert.equal(api.status().frost.bubbleFloat, undefined, '状态里不该再有 bubbleFloat')
  assert.equal(api.status().frost.floatShells, undefined, '状态里不该再有 floatShells')

  // ④ 旧存档里就算写着 bubbleFloat=true 也一律忽略（不建壳、不回读）
  const next = buildChatDom()
  next.window.localStorage.setItem(
    '__dshui.frost.v3',
    JSON.stringify({ enabled: true, bubbleFloat: true }),
  )
  const two = runClient(next)
  await flush()
  two.api.setMode('multiply')
  next.advance(600)
  assert.equal(
    next.document.querySelectorAll('.__dshui-bubble-float').length,
    0,
    '旧档的 bubbleFloat 必须被忽略（不再生成任何壳）',
  )
  assert.equal(two.api.status().frost.bubbleFloat, undefined)
})

test('背景模式：代码块与文件卡片也要气泡效果（0.6.0 贴玻璃，0.6.1 修内层遮盖），纹理模式不碰', async () => {
  const dom = buildChatDom()
  // 助手消息里的代码块（高亮部分）与附件文件卡片 —— 钩子是 DSH 自己的稳定标记
  const code = dom.document.createElement('div')
  code.setAttribute('data-code-wrap', '')
  code.className = '_block_test'
  code._rect = { top: 100, left: 300, right: 1100, bottom: 300, width: 800, height: 200 }
  dom.transcript.appendChild(code)
  dom.setComputedStyle(code, { backgroundColor: 'rgb(30, 30, 40)', position: 'static', overflow: 'visible' })
  const file = dom.document.createElement('div')
  file.setAttribute('data-presented-file', '')
  file.className = '_file_test'
  file._rect = { top: 320, left: 300, right: 900, bottom: 420, width: 600, height: 100 }
  dom.transcript.appendChild(file)
  dom.setComputedStyle(file, { backgroundColor: 'rgb(245, 245, 245)', position: 'static', overflow: 'visible' })
  const { api } = runClient(dom)
  await flush()

  // 纹理模式：不碰它们（壁纸压顶，多糊一层只会一起被染色）
  api.setMode('multiply')
  assert.equal(code.classList.contains('__dshui-frost-chat'), false, '纹理模式不糊代码块')
  assert.equal(file.classList.contains('__dshui-frost-chat'), false, '纹理模式不糊文件卡片')

  // 背景模式：糊上 + 原色落内联变量（深浅主题自动跟）
  api.setMode('backdrop')
  dom.advance(600)
  assert.ok(code.classList.contains('__dshui-frost-chat'), '背景模式要糊代码块')
  assert.ok(file.classList.contains('__dshui-frost-chat'), '背景模式要糊文件卡片')
  assert.equal(code.style.getPropertyValue('--dsniang-chat-color'), 'rgb(30,30,40)', '代码块原色落内联变量')
  assert.equal(file.style.getPropertyValue('--dsniang-chat-color'), 'rgb(245,245,245)', '文件卡片原色落内联变量')
  assert.equal(api.status().frost.chatExtras, 2, '状态要能数出来')
  // 0.6.1：诊断把两类分开报（用户"看不到玻璃"时要知道钩子到底命中没）
  assert.equal(api.status().frost.chatBlocks, 1, '代码块单独计数')
  assert.equal(api.status().frost.chatFiles, 1, '文件卡片单独计数')
  assert.match(api.diagnose(), /代码块 1 个 · 文件 1 个/, '诊断文案要分开报代码块/文件')

  // 样式表规则：color-mix 用 --dsniang-chat-color + 气泡透明度/模糊（"这个效果" = 气泡效果）
  const css = styleTagOf(dom).textContent
  assert.match(
    css,
    /body\.__dshui-frost \.__dshui-frost-chat\{background-image:none!important;background-color:color-mix\(in srgb,var\(--dsniang-chat-color,var\(--dsw-specific-code-bg,#f0f0f0\)\) var\(--dsniang-frost-bubble-mix,55%\),transparent\)!important;/,
    '代码块/文件卡片的玻璃规则要和气泡同款（原色 + 气泡透明度）',
  )
  // 0.6.1 根因修复：外层卡片贴了玻璃，可内层各自又刷了一层不透明底 —— 玻璃被整块盖住，
  // 用户看到的就是"完全没效果"。这三条规则负责把内层底清干净。
  assert.match(
    css,
    /body\.__dshui-frost \.__dshui-frost-chat :where\(pre,\[data-code-block-content\]\),body\.__dshui-frost \.__dshui-frost-chat :has\(> \[data-code-block-banner\]\)\{background:transparent!important;\}/,
    '代码块内层（pre / 内容节点 / banner 外壳）的不透明底要清掉，外层玻璃才看得见',
  )
  assert.match(
    css,
    /body\.__dshui-frost \.__dshui-frost-chat \[data-code-block-banner\]\{background:color-mix\(in srgb,var\(--dsniang-chat-color,var\(--dsw-alias-markdown-code-block,#f9fafb\)\) var\(--dsniang-frost-bubble-mix,55%\),transparent\)!important;backdrop-filter:blur\(var\(--dsniang-frost-bubble-blur,12px\)\) saturate\(1\.15\)!important;/,
    '顶部标题条要和卡片用同一套配方（用户要的"标签也一起生成气泡"）—— 两层透明叠加后约 80% 实，滚动时代码从下面过也不叠字',
  )
  assert.equal(/url\(/.test(css), false, '静态表永远不许出现 url(（回归哨兵）')

  // 关闭 → 逐字还原
  api.setMode('off')
  dom.advance(600)
  assert.equal(code.classList.contains('__dshui-frost-chat'), false)
  assert.equal(code.style.getPropertyValue('--dsniang-chat-color'), '', '卸载后颜色变量还原')
  assert.equal(file.style.getPropertyValue('--dsniang-chat-color'), '', '卸载后文件卡片颜色变量还原')
})

test('背景模式：弹窗里的代码块不重复贴玻璃（0.6.1 先糊面板再收代码块）', async () => {
  const dom = buildChatDom()
  // DSH 自己的对话框里也会渲染 markdown 代码块；它本来就坐在"已被糊过的面板"上，
  // 再叠一层 backdrop-filter 会互相啃（两层都读不到底图 → 死白发灰），必须跳过。
  const dlg = dom.document.createElement('div')
  dlg.setAttribute('role', 'dialog')
  dlg.className = '_dialog_test'
  dlg._rect = { top: 200, left: 900, right: 1660, bottom: 700, width: 760, height: 500 }
  dom.body.appendChild(dlg)
  dom.setComputedStyle(dlg, { backgroundColor: 'rgb(255, 255, 255)', position: 'fixed', overflow: 'visible' })
  const inner = dom.document.createElement('div')
  inner.setAttribute('data-code-wrap', '')
  inner.className = '_inner_code_test'
  inner._rect = { top: 260, left: 940, right: 1600, bottom: 420, width: 660, height: 160 }
  dlg.appendChild(inner)
  dom.setComputedStyle(inner, { backgroundColor: 'rgb(20, 20, 20)', position: 'static', overflow: 'hidden' })

  const { api } = runClient(dom)
  await flush()
  api.setMode('backdrop')
  dom.advance(600)

  assert.ok(dlg.classList.contains('__dshui-frost-panel'), '对话框自己要被糊（0.3.3 的 :has() 规则）')
  assert.equal(inner.classList.contains('__dshui-frost-chat'), false, '面板里的代码块不再重复贴一层玻璃')
  assert.equal(api.status().frost.chatBlocks, 0, '计数里也不该算它')
})

test('毛玻璃：DSH 自己的二级面板（role=dialog / role=menu）也要糊（0.3.1）', async () => {
  const dom = buildChatDom()
  // DSH 的重命名窗（role=dialog，body 级）与下拉菜单（role=menu）
  const dlg = dom.document.createElement('div')
  dlg.setAttribute('role', 'dialog')
  dlg._rect = { top: 200, left: 900, right: 1660, bottom: 700, width: 760, height: 500 }
  dom.body.appendChild(dlg)
  const menu = dom.document.createElement('div')
  menu.setAttribute('role', 'menu')
  menu._rect = { top: 120, left: 500, right: 700, bottom: 240, width: 200, height: 120 }
  dom.body.appendChild(menu)
  // 菜单里的小项不打标（只糊容器）
  const item = dom.document.createElement('button')
  item.setAttribute('role', 'menuitem')
  menu.appendChild(item)

  const { api } = runClient(dom)
  await flush()
  api.setMode('multiply')

  assert.ok(dlg.classList.contains('__dshui-frost-panel'), 'DSH 对话框要糊（面板参数）')
  assert.ok(menu.classList.contains('__dshui-frost-panel'), 'DSH 菜单要糊')
  assert.equal(item.classList.contains('__dshui-frost-panel'), false, 'menuitem 本身不打标')
  assert.equal(api.status().frost.dshPanels, 2, '诊断要能数出 DSH 面板')
  assert.match(api.diagnose(), /DSH 面板 2 个/, '诊断文案要有 DSH 面板')

  // 关掉毛玻璃 → 摘干净
  api.setFrostEnabled(false)
  dom.advance(600)
  assert.equal(dlg.classList.contains('__dshui-frost-panel'), false)
  assert.equal(menu.classList.contains('__dshui-frost-panel'), false)
})

test('毛玻璃：糊输入卡片 + 用户气泡，不碰输入框本身；参数可调可存', async () => {
  const dom = buildChatDom()
  const { api } = runClient(dom)
  await flush()
  api.setMode('multiply')

  const card = dom.composerWrap
  assert.equal(card.getAttribute('data-composer-card'), 'true', '桩环境应与真实 DSH 一致')
  assert.ok(card.classList.contains('__dshui-frost-surface'), '输入卡片应被标记')
  assert.equal(
    dom.textarea.classList.contains('__dshui-frost-surface'),
    false,
    '输入框本身不打标（它自己就是卡片的一部分，不需要单独糊）',
  )
  assert.equal(dom.bubble.classList.contains('__dshui-frost-surface'), false, '靠左的元素不是"我的气泡"，不糊')
  assert.ok(dom.body.classList.contains('__dshui-frost'), 'body 应带上毛玻璃开关类')

  // 参数：默认 2px / 25%（作者实机取值，出厂默认），可通过 API 调整并持久化
  assert.equal(api.status().frost.blur, 2)
  assert.equal(api.status().frost.alpha, 0.2)
  assert.equal(api.status().frost.targets, 1, '这个桩里只有输入卡片一个表面')
  assert.match(api.setFrostBlur(22), /模糊 = 22px/)
  assert.equal(dom.body.style.getPropertyValue('--dsniang-frost-blur'), '22px')
  assert.match(api.setFrostAlpha(0.7), /白层 = 0\.7/)
  assert.equal(dom.body.style.getPropertyValue('--dsniang-frost-alpha'), '0.7')
  assert.deepEqual(
    JSON.parse(dom.window.localStorage.getItem('__dshui.frost.v3')),
    { enabled: true, layered: true, blur: 22, alpha: 0.7, panelTop: 0.94, panelBottom: 0.8, bubbleFx: true, aiReplyFx: true, bubbleTransparency: 45, bubbleBlur: 12, bubbleColor: '', dshBlur: 20 },
    '毛玻璃参数应写入 localStorage（v3 键，v0.2.17 及更早的旧参数不再沿用）',
  )

  // 关掉 → 先淡出（类还在、参数补间到 0），动画结束再摘类清变量
  assert.match(api.setFrostEnabled(false), /毛玻璃：关/)
  assert.equal(dom.body.classList.contains('__dshui-frost'), true, '淡出期间类应还在')
  assert.equal(api.status().transition.frostAnimating, true, '参数应在补间淡出')
  dom.advance(600)
  assert.equal(dom.body.classList.contains('__dshui-frost'), false)
  assert.equal(card.classList.contains('__dshui-frost-surface'), false)
  assert.equal(dom.body.style.getPropertyValue('--dsniang-frost-blur'), '')
  assert.equal(api.status().transition.frostAnimating, false)
})

test('毛玻璃：右侧（我发的）气泡也会被糊上', async () => {
  const dom = buildChatDom()
  // 造一个靠右的气泡：中心落在父容器右半区 → 判为用户消息
  const mine = dom.document.createElement('div')
  mine.className = '_bubble_mine'
  mine.setAttribute('role', 'listitem')
  mine._rect = { top: 220, left: 900, right: 1560, bottom: 320, width: 660, height: 100 }
  dom.transcript.appendChild(mine)
  dom.setComputedStyle(mine, { backgroundColor: 'rgb(240,240,240)', position: 'static', overflow: 'visible' })

  const { api } = runClient(dom)
  await flush()
  api.setMode('multiply')

  assert.ok(mine.classList.contains('__dshui-frost-surface'), '我发的消息气泡应该有毛玻璃')
  assert.equal(dom.bubble.classList.contains('__dshui-frost-surface'), false, '靠左的（助手）不糊')
  assert.equal(api.status().frost.targets, 2, '表面数 = 输入卡片 + 1 个我的气泡')

  // 方案 B：气泡**自己的背景色**要写进元素的内联变量（玻璃层靠它做 color-mix）
  assert.equal(
    mine.style.getPropertyValue('--dsniang-bubble-color'),
    'rgb(240,240,240)',
    '气泡原色要落到内联变量上（深浅主题自动跟）',
  )
  assert.equal(
    dom.composerWrap.style.getPropertyValue('--dsniang-bubble-color'),
    '',
    '输入卡片不吃这个变量（它走白层）',
  )

  // 关掉毛玻璃 → 这个内联变量必须逐字还原（不许在页面元素上留痕）
  assert.match(api.setFrostEnabled(false), /毛玻璃：关/)
  dom.advance(600)
  assert.equal(mine.style.getPropertyValue('--dsniang-bubble-color'), '', '卸载后气泡上不留内联变量')
  assert.match(api.setFrostEnabled(true), /毛玻璃：开/)
  dom.advance(600)
  assert.equal(mine.style.getPropertyValue('--dsniang-bubble-color'), 'rgb(240,240,240)', '再开要重新写上')

  // 带显式 user 标记的元素也认
  const tagged = dom.document.createElement('div')
  tagged.className = '_tagged'
  tagged.setAttribute('data-role', 'user')
  tagged._rect = { top: 340, left: 430, right: 1000, bottom: 420, width: 570, height: 80 }
  dom.transcript.appendChild(tagged)
  dom.setComputedStyle(tagged, { backgroundColor: 'rgb(240,240,240)', position: 'static', overflow: 'visible' })
  api.setMode('off')
  api.setMode('multiply')
  assert.ok(tagged.classList.contains('__dshui-frost-surface'), 'data-role=user 的元素应被糊')

  // 明确标了 assistant 的一律排除
  const ai = dom.document.createElement('div')
  ai.className = '_ai_marked'
  ai.setAttribute('data-role', 'assistant')
  ai._rect = { top: 440, left: 900, right: 1560, bottom: 520, width: 660, height: 80 }
  dom.transcript.appendChild(ai)
  dom.setComputedStyle(ai, { backgroundColor: 'rgb(240,240,240)', position: 'static', overflow: 'visible' })
  api.setMode('off')
  api.setMode('multiply')
  assert.equal(ai.classList.contains('__dshui-frost-surface'), false, 'data-role=assistant 的必须排除')
})

test('毛玻璃：长消息气泡也要糊（v0.2.37 修 —— 旧版 400px 绝对高度上限把长气泡静默丢了）', async () => {
  const dom = buildChatDom()
  const { api } = runClient(dom)
  await flush()

  // 用户 2026-10-13 模拟的那种"一整条超长消息"：气泡会到几千 px 高
  const longOne = dom.document.createElement('div')
  longOne.className = '_bubble_long'
  longOne.setAttribute('data-role', 'user')
  longOne._rect = { top: 100, left: 900, right: 1560, bottom: 3100, width: 660, height: 3000 }
  dom.transcript.appendChild(longOne)
  dom.setComputedStyle(longOne, { backgroundColor: 'rgb(237,243,254)', position: 'static', overflow: 'visible' })

  const shortOne = dom.document.createElement('div')
  shortOne.className = '_bubble_short'
  shortOne.setAttribute('data-role', 'user')
  shortOne._rect = { top: 3200, left: 1200, right: 1560, bottom: 3260, width: 360, height: 60 }
  dom.transcript.appendChild(shortOne)
  dom.setComputedStyle(shortOne, { backgroundColor: 'rgb(237,243,254)', position: 'static', overflow: 'visible' })

  api.setMode('multiply')

  assert.ok(longOne.classList.contains('__dshui-frost-surface'), '长消息气泡也必须糊（旧版会静默丢掉）')
  assert.ok(shortOne.classList.contains('__dshui-frost-surface'), '短消息气泡照旧')
  assert.equal(api.status().frost.targets, 3, '主表面 = 输入卡片 + 长气泡 + 短气泡')
  assert.equal(api.status().frost.bubbleScan.tall, 0, '不该再有"因太高被丢"的气泡（诊断要能看见）')

  // 容器（装得下另一个气泡）不许被当成气泡糊
  const wrap = dom.document.createElement('div')
  wrap.className = '_bubble_wrap'
  wrap.setAttribute('data-role', 'user')
  wrap._rect = { top: 3400, left: 900, right: 1560, bottom: 3600, width: 660, height: 200 }
  const inner = dom.document.createElement('div')
  inner.className = '_bubble_inner'
  inner.setAttribute('data-role', 'user')
  inner._rect = { top: 3410, left: 1200, right: 1560, bottom: 3480, width: 360, height: 70 }
  wrap.appendChild(inner)
  dom.transcript.appendChild(wrap)
  dom.setComputedStyle(wrap, { backgroundColor: 'rgb(237,243,254)', position: 'static', overflow: 'visible' })
  dom.setComputedStyle(inner, { backgroundColor: 'rgb(237,243,254)', position: 'static', overflow: 'visible' })

  api.setMode('off')
  api.setMode('multiply')
  assert.equal(wrap.classList.contains('__dshui-frost-surface'), false, '装得下另一个气泡的是容器，不糊')
  assert.ok(inner.classList.contains('__dshui-frost-surface'), '糊的是里面那个气泡')
  assert.ok(api.status().frost.bubbleScan.container >= 1, '诊断要能看见"因装得下气泡被跳过"的条数')
})

test('毛玻璃：认 DSH 的 data-chat-flow-kind 标记（气泡父层不右对齐也能识别）', async () => {
  const dom = buildChatDom()
  const { api } = runClient(dom)
  await flush()

  // 真实 DSH：行[data-chat-flow-kind] > 堆叠层 > 气泡；气泡自己的父层不右对齐，
  // 且故意放在靠左的位置 —— 只有读到行上的 user 标记才能认出来
  const userRow = dom.document.createElement('div')
  userRow.className = '_flowRow_user'
  userRow.setAttribute('data-chat-flow-kind', 'user')
  const userStack = dom.document.createElement('div')
  userStack.className = '_flowStack_user'
  const userBubble = dom.document.createElement('div')
  userBubble.className = '_bubble_flow'
  userBubble._rect = { top: 560, left: 420, right: 920, bottom: 640, width: 500, height: 80 }
  userStack.appendChild(userBubble)
  userRow.appendChild(userStack)
  dom.transcript.appendChild(userRow)
  dom.setComputedStyle(userStack, { backgroundColor: 'rgba(0,0,0,0)', position: 'static', overflow: 'visible' })
  dom.setComputedStyle(userBubble, { backgroundColor: 'rgb(240,240,240)', position: 'static', overflow: 'visible' })

  // 助手行：气泡故意靠右 —— 几何上像"我发的"，但行标记是 assistant，必须排除
  const aiRow = dom.document.createElement('div')
  aiRow.className = '_flowRow_ai'
  aiRow.setAttribute('data-chat-flow-kind', 'assistant')
  const aiStack = dom.document.createElement('div')
  aiStack.className = '_flowStack_ai'
  const aiBubble = dom.document.createElement('div')
  aiBubble.className = '_bubble_flow'
  aiBubble._rect = { top: 680, left: 900, right: 1560, bottom: 760, width: 660, height: 80 }
  aiStack.appendChild(aiBubble)
  aiRow.appendChild(aiStack)
  dom.transcript.appendChild(aiRow)
  dom.setComputedStyle(aiStack, { backgroundColor: 'rgba(0,0,0,0)', position: 'static', overflow: 'visible' })
  dom.setComputedStyle(aiBubble, { backgroundColor: 'rgb(240,240,240)', position: 'static', overflow: 'visible' })

  api.setMode('multiply')

  assert.ok(userBubble.classList.contains('__dshui-frost-surface'), 'flow-kind=user 的行的气泡要糊（即使靠左）')
  assert.equal(aiBubble.classList.contains('__dshui-frost-surface'), false, 'flow-kind=assistant 的必须排除（即使靠右）')
  assert.equal(userRow.classList.contains('__dshui-frost-surface'), false, '糊的是气泡，不是整行')
})

test('追加信息（flow-kind=steering）气泡也要有气泡视觉（0.8.25）', async () => {
  const dom = buildChatDom()
  const { api } = runClient(dom)
  await flush()
  const steerRow = dom.document.createElement('div')
  steerRow.setAttribute('data-chat-flow-kind', 'steering')
  const steerStack = dom.document.createElement('div')
  const steerBubble = dom.document.createElement('div')
  steerBubble.className = '_bubble_steer'
  steerBubble._rect = { top: 560, left: 420, right: 920, bottom: 640, width: 500, height: 80 }
  steerStack.appendChild(steerBubble)
  steerRow.appendChild(steerStack)
  dom.transcript.appendChild(steerRow)
  dom.setComputedStyle(steerStack, { backgroundColor: 'rgba(0,0,0,0)', position: 'static', overflow: 'visible' })
  dom.setComputedStyle(steerBubble, { backgroundColor: 'rgb(240,240,240)', position: 'static', overflow: 'visible' })
  api.setMode('multiply')
  dom.advance(600)
  assert.ok(steerBubble.classList.contains('__dshui-frost-surface'), '追加信息气泡也要被识别为我的气泡')
  assert.ok(dom.body.classList.contains('__dshui-bubblefx'), '纹理模式气泡视觉类应生效')
})

test('光标模糊（0.8.25）：默认 5px、面板滑块可调并持久化', async () => {
  const dom = buildChatDom()
  const { api } = runClient(dom)
  await flush()
  api.setMode('multiply')
  dom.advance(600)
  assert.equal(dom.body.style.getPropertyValue('--dshui-caret-blur'), '5px', '默认光标光晕 5px')
  api.switcher()
  const slider = dom.document.querySelector('[data-caret-blur-slider]')
  assert.ok(slider, '面板里应有光标模糊滑块')
  assert.equal(slider.value, '5')
  slider.value = '2'
  slider._listeners.input[0]({ type: 'input', target: slider, stopPropagation() {} })
  assert.equal(dom.body.style.getPropertyValue('--dshui-caret-blur'), '2px')
  assert.equal(dom.document.querySelector('.__dshui-caret-blur-value').textContent, '2px')
  const saved = JSON.parse(dom.window.localStorage.getItem('__dshui.caret.v1'))
  assert.equal(saved.blur, 2, '要存档')
  assert.match(api.setCaretBlur(7), /光标模糊 = 7px/)
  assert.equal(dom.body.style.getPropertyValue('--dshui-caret-blur'), '7px')
})

test('分层：把输入区座位抬成覆盖层 + 给消息区补底部留白，关闭时完整还原', async () => {
  const dom = buildChatDom()
  const { api } = runClient(dom)
  await flush()

  const seatInline = dom.seat.style.cssText
  const panelInline = dom.panel.style.cssText
  const transcriptInline = dom.transcript.style.cssText

  api.setMode('multiply')

  // 真实 DSH 里卡片挂在"座位"里，座位与消息区平级 → 抬的是座位整层，不是卡片自己
  assert.equal(dom.seat.style.getPropertyValue('position'), 'absolute', '输入区座位应被抬成覆盖层')
  assert.equal(dom.seat.style.getPropertyValue('bottom'), '0')
  assert.equal(dom.seat.style.getPropertyValue('left'), '0')
  assert.equal(dom.seat.style.getPropertyValue('right'), '0')
  assert.equal(dom.composerWrap.style.getPropertyValue('position'), '', '卡片自身不该被改样式')
  // 共同父容器成为定位基准
  assert.equal(dom.panel.style.getPropertyValue('position'), 'relative', '父容器应成为定位基准')
  // 消息区补底部留白 = 座位高度(120) + 24
  assert.equal(dom.transcript.style.getPropertyValue('padding-bottom'), '144px', '消息区要留出座位的高度')
  assert.equal(api.status().frost.layeredApplied, true)

  // 切回关闭 → 淡出完成后，三个元素的原始内联样式逐字还原
  api.setMode('off')
  assert.equal(api.status().transition.fadingOut, true, '淡出期间应处于"待卸载"状态')
  assert.equal(api.status().frost.layeredApplied, true, '淡出还没结束，分层应仍在')
  dom.advance(600)
  assert.equal(dom.seat.style.cssText, seatInline)
  assert.equal(dom.panel.style.cssText, panelInline)
  assert.equal(dom.transcript.style.cssText, transcriptInline)
  assert.equal(api.status().frost.layeredApplied, false)
  assert.equal(api.status().transition.fadingOut, false)
})

test('分层（内部钩子）：关掉就不动布局；结构认不出来时也不硬改', async () => {
  const dom = buildChatDom()
  const { api } = runClient(dom)
  await flush()

  const panelInline = dom.panel.style.cssText
  const seatInline = dom.seat.style.cssText

  // ① 关掉分层 → 只加毛玻璃，不碰布局
  api.setLayering(false)
  api.setMode('multiply')
  assert.equal(dom.panel.style.cssText, panelInline, '关掉分层就不该改父容器')
  assert.equal(dom.seat.style.cssText, seatInline, '关掉分层就不该改输入区座位')
  assert.ok(dom.composerWrap.classList.contains('__dshui-frost-surface'), '毛玻璃本身仍然生效')
  assert.equal(api.status().frost.layeredApplied, false)

  // ② 没有滚动标记、也没有 overflow 滚动容器 → 认不出消息区，必须原样不动
  const dom2 = buildChatDom()
  dom2.transcript.removeAttribute('data-conversation-scroll')
  dom2.setComputedStyle(dom2.transcript, { backgroundColor: 'rgba(0,0,0,0)', position: 'static', overflow: 'visible' })
  const r2 = runClient(dom2)
  await flush()
  const panel2 = dom2.panel.style.cssText
  const seat2 = dom2.seat.style.cssText
  r2.api.setMode('multiply')
  assert.equal(dom2.panel.style.cssText, panel2, '认不出消息区时一行都不许改')
  assert.equal(dom2.seat.style.cssText, seat2, '认不出消息区时座位也不许改')
  assert.equal(r2.api.status().frost.layeredApplied, false)
  assert.ok(dom2.composerWrap.classList.contains('__dshui-frost-surface'), '毛玻璃照旧生效')
})

test('分层：CSS 上不是滚动容器、但"实际可滚动"的消息区也能认出来', async () => {
  const dom = buildChatDom()
  // 去掉明牌标记，并把 overflow 写成 visible（有些 DSH 版本滚动不写在 overflow 上），
  // 只留下"内容比可视区高"这一条线索 —— 这正是真实页面里我们需要的判据
  dom.transcript.removeAttribute('data-conversation-scroll')
  dom.setComputedStyle(dom.transcript, {
    backgroundColor: 'rgba(0,0,0,0)',
    position: 'static',
    overflow: 'visible',
    overflowY: 'visible',
  })
  dom.transcript.scrollHeight = 2000
  dom.transcript.clientHeight = 780

  const { api } = runClient(dom)
  await flush()
  api.setMode('multiply')

  assert.equal(api.status().frost.layeredApplied, true, '应认出可滚动的消息区并分层')
  assert.equal(dom.seat.style.getPropertyValue('position'), 'absolute', '输入区座位应被抬成覆盖层')
  assert.equal(dom.transcript.style.getPropertyValue('padding-bottom'), '144px', '消息区应补底部留白')

  api.setMode('off')
  dom.advance(600)
  assert.equal(dom.seat.style.getPropertyValue('position'), '', '关闭后应逐字还原')
  assert.equal(dom.transcript.style.getPropertyValue('padding-bottom'), '')
})

test('分层：应用自带分层（座位已定位 + 留白已够）时，我们一行布局都不动', async () => {
  const dom = buildChatDom()
  // 真实 DSH 的形状：座位（装着卡片的容器）本身已是绝对/粘性定位，消息区也铺到
  // 卡片下面并预留了足够底部空间 —— 这时只该"认出来"，不该再改任何东西。
  dom.setComputedStyle(dom.seat, {
    backgroundColor: 'rgba(0,0,0,0)',
    position: 'absolute',
    overflow: 'visible',
  })
  dom.setComputedStyle(dom.transcript, {
    backgroundColor: 'rgba(0,0,0,0)',
    position: 'static',
    overflow: 'auto',
    overflowY: 'auto',
    paddingBottom: '160px', // 应用自己已经留够了
  })

  const seatInline = dom.seat.style.cssText
  const transcriptInline = dom.transcript.style.cssText
  const panelInline = dom.panel.style.cssText

  const { api } = runClient(dom)
  await flush()
  api.setMode('multiply')

  const frost = api.status().frost
  assert.equal(frost.layeredReady, true, '应认出消息区（分层已到位）')
  assert.equal(frost.layeredApplied, false, '应用自带分层时不该记"我们改过"')
  assert.equal(frost.layering.existingPad, 160)
  assert.equal(frost.layering.addPad, 0, '留白已足够，不该再补')
  assert.equal(frost.layering.needsPosition, false, '座位已定位，不该再抬')
  assert.equal(dom.seat.style.cssText, seatInline, '座位内联样式一个字节都不许动')
  assert.equal(dom.transcript.style.cssText, transcriptInline, '消息区内联样式一个字节都不许动')
  assert.equal(dom.panel.style.cssText, panelInline, '共同父容器也不许动')

  api.setMode('off')
  dom.advance(600)
  assert.equal(dom.seat.style.cssText, seatInline)
  assert.equal(dom.transcript.style.cssText, transcriptInline)
})

test('分层：应用自带定位但留白不够时，只补差额（不重复留白）', async () => {
  const dom = buildChatDom()
  dom.setComputedStyle(dom.seat, {
    backgroundColor: 'rgba(0,0,0,0)',
    position: 'sticky',
    overflow: 'visible',
  })
  dom.setComputedStyle(dom.transcript, {
    backgroundColor: 'rgba(0,0,0,0)',
    position: 'static',
    overflow: 'auto',
    overflowY: 'auto',
    paddingBottom: '40px', // 只有 40px，需要 120+24=144
  })

  const { api } = runClient(dom)
  await flush()
  api.setMode('multiply')

  const frost = api.status().frost
  assert.equal(frost.layering.addPad, 104, '只补差额 144-40')
  assert.equal(frost.layering.needsPosition, false, '座位已定位，不该再抬')
  assert.equal(dom.seat.style.getPropertyValue('position'), '', '座位不该被改')
  assert.equal(
    dom.transcript.style.getPropertyValue('padding-bottom'),
    '144px',
    '留白应补到 144px（40 已由应用提供）',
  )
  assert.equal(frost.layeredApplied, true, '我们补过留白，要记下来以便还原')

  api.setMode('off')
  dom.advance(600)
  assert.equal(dom.transcript.style.getPropertyValue('padding-bottom'), '', '关闭后应还原成应用原值')
})

test('分层：输入区嵌在滚动容器内部（真实 DSH 形状）→ 认出来，但我们一行布局都不动', async () => {
  const dom = buildChatDom()
  // 真实 DSH：Dc7zOa_scrollBody[data-conversation-scroll] 里装着全部消息**和**输入区座位
  // （座位 sticky 在底部）—— 消息本来就贴着输入区下面滚过去，应用自带分层。
  dom.transcript.appendChild(dom.seat)
  dom.setComputedStyle(dom.seat, {
    backgroundColor: 'rgba(0,0,0,0)',
    position: 'sticky',
    overflow: 'visible',
  })
  // 诱饵：消息里某个 markdown 表格的滚动容器（真实页面上它曾经把明牌目标挤掉）
  const decoy = dom.document.createElement('div')
  decoy.className = '_tableScroll_test'
  decoy._rect = { top: -416836, left: 957, right: 1877, bottom: -416485, width: 920, height: 351 }
  dom.transcript.appendChild(decoy)
  dom.setComputedStyle(decoy, {
    backgroundColor: 'rgba(0,0,0,0)',
    position: 'static',
    overflow: 'auto',
    overflowY: 'auto',
  })
  decoy.scrollHeight = 2000
  decoy.clientHeight = 351

  const transcriptInline = dom.transcript.style.cssText
  const seatInline = dom.seat.style.cssText
  const decoyInline = decoy.style.cssText

  const { api } = runClient(dom)
  await flush()
  api.setMode('multiply')

  const frost = api.status().frost
  assert.equal(frost.layeredReady, true, '应认出消息区（明牌目标优先，不被诱饵挤掉）')
  assert.equal(frost.layeredApplied, false, '应用自带分层 → 不该记成"我们改过"')
  assert.equal(frost.layering.native, true)
  assert.equal(frost.layering.reason, 'composer-inside-scroller')
  assert.equal(frost.layering.addPad, 0)
  assert.equal(frost.layering.needsPosition, false)
  assert.equal(dom.transcript.style.cssText, transcriptInline, '滚动容器一行不动')
  assert.equal(dom.seat.style.cssText, seatInline, '嵌在滚动区里的座位一行不动')
  assert.equal(decoy.style.cssText, decoyInline, '诱饵也不许动')
  assert.ok(dom.composerWrap.classList.contains('__dshui-frost-surface'), '毛玻璃照旧生效')
})

test('毛玻璃通透化：清掉输入区座位的不透明遮罩，关掉后逐字还原', async () => {
  const dom = buildChatDom()
  // 真实 DSH 的座位自带一条遮罩（app.asar 里的原文）：
  //   background:linear-gradient(180deg, color-mix(in srgb, var(--dsw-alias-bg-base) 0%, transparent) 0px, var(--dsw-alias-bg-base) 36px)
  // 它把从输入区下面滚过的消息整段擦掉 —— 玻璃背后永远是纯色，糊什么都白搭。
  dom.transcript.appendChild(dom.seat)
  dom.setComputedStyle(dom.seat, {
    backgroundColor: 'rgb(255, 255, 255)',
    backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0) 0px, rgb(255,255,255) 36px)',
    position: 'sticky',
    overflow: 'visible',
  })
  dom.seat.style.setProperty('border-radius', '12px')

  const seatInline = dom.seat.style.cssText
  const { api } = runClient(dom)
  await flush()
  api.setMode('multiply')

  // 注意：状态是跨 vm realm 拿回来的，数组要用值比较（deepStrictEqual 会卡原型）
  assert.equal(api.status().frost.cleared.join('|'), 'div._composerSeat_test_6', '座位那层遮罩应被清掉')
  assert.equal(api.status().frost.clearedReady, true)
  assert.equal(dom.seat.style.getPropertyValue('background-color'), 'transparent')
  assert.equal(dom.seat.style.getPropertyPriority('background-color'), 'important', '要压过应用的类规则')
  assert.equal(dom.seat.style.getPropertyValue('background-image'), 'none')
  assert.equal(dom.seat.style.getPropertyValue('border-radius'), '12px', '别的内联样式一律不碰')
  assert.match(api.diagnose(), /通透 已开（清了 1 层遮挡）/, '诊断里要能直接看到通透化结果')

  // 关掉毛玻璃 → 遮罩逐字还回去（含原值与 !important 标记）
  api.setFrostEnabled(false)
  dom.advance(600)
  assert.equal(dom.seat.style.cssText, seatInline, '关闭后必须逐字还原')
  assert.equal(api.status().frost.cleared.length, 0)
  assert.equal(api.status().frost.clearedReady, false)
})

test('毛玻璃通透化：只动卡片与消息区之间那几层，窗口底色 / 消息区一律不碰', async () => {
  const dom = buildChatDom()
  // 默认桩就是"兄弟式"布局：panel 同时装着消息区和座位（座位覆盖在消息区之上）
  dom.setComputedStyle(dom.seat, {
    backgroundColor: 'rgb(255, 255, 255)',
    position: 'static',
    overflow: 'visible',
  })

  const { api } = runClient(dom)
  await flush()
  api.setMode('multiply')

  assert.equal(api.status().frost.cleared.join('|'), 'div._composerSeat_test_6', '盖在消息区之上的座位要清')
  assert.equal(dom.transcript.style.getPropertyValue('background-color'), '', '消息区的背景不碰')
  assert.equal(dom.transcript.style.getPropertyValue('background-image'), '', '消息区的背景不碰')
  // 共同祖先（应用窗口/面板底色）绝不能被清成透明，否则整个界面会漏底
  assert.equal(dom.panel.style.getPropertyValue('background-color'), '')
  assert.equal(dom.panel.style.getPropertyValue('background-image'), '')
  assert.equal(dom.shell.style.getPropertyValue('background-color'), '')
  assert.equal(dom.root.style.getPropertyValue('background-image'), '')
})

test('毛玻璃通透化：本来就没有遮挡时一层不改（cleared 为空）', async () => {
  const dom = buildChatDom()
  dom.transcript.appendChild(dom.seat) // 真实形状，但座位本身透明
  const { api } = runClient(dom)
  await flush()
  api.setMode('multiply')

  assert.equal(api.status().frost.clearedReady, true, '认出来了（只是没东西要清）')
  assert.equal(api.status().frost.cleared.length, 0)
  assert.equal(dom.seat.style.cssText, '', '没遮挡就一个字节都不写')
  assert.equal(dom.transcript.style.cssText, '')
})

test('毛玻璃通透化：首帧扑空不许锁死 —— 座位后来才上底色，照样清掉（0.2.31 回归）', async () => {
  const dom = buildChatDom()
  // 真实 DSH：座位的背景只写在 `[data-phase=active]` 上。插件在页面启动时就跑了一次，
  // 那会儿应用可能还在 hero/settling 阶段 → 座位是透明的 → 这一轮"清了 0 层"。
  dom.transcript.appendChild(dom.seat)
  const { api } = runClient(dom)
  await flush()
  api.setMode('multiply')

  assert.equal(api.status().frost.clearedReady, true, '认出来了')
  assert.equal(api.status().frost.cleared.length, 0, '这一轮确实没东西可清')
  assert.equal(dom.seat.style.cssText, '')

  // 应用切到 active 阶段：座位长出那条把消息擦掉的渐变遮罩
  dom.setComputedStyle(dom.seat, {
    backgroundColor: 'rgb(255, 255, 255)',
    backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0) 0px, rgb(255,255,255) 36px)',
    position: 'sticky',
    overflow: 'visible',
  })
  // 任何一次"重新应用"（观察者 / 滑块 / 开关）都必须把它补上
  api.setFrostEnabled(true)

  assert.equal(
    api.status().frost.cleared.join('|'),
    'div._composerSeat_test_6',
    '空链不能把座位永久锁在外面（0.2.31 的空 backup 会）',
  )
  assert.equal(dom.seat.style.getPropertyValue('background-image'), 'none')
  assert.equal(dom.seat.style.getPropertyPriority('background-color'), 'important')
  assert.equal(api.status().frost.clearedReady, true)
})

test('扩展毛玻璃表面：问答窗口跟主表面同参数，二级面板单独一套（20px/90% + 遮罩渐变），有 fixed 后代的跳过', async () => {
  const dom = buildChatDom()
  const { document, body } = dom

  // DSH 自带的问答窗口：稳定钩子是应用自己的语义属性（不是构建哈希）
  const questionFrame = document.createElement('div')
  questionFrame.setAttribute('data-question-key', 'q1')
  const questionCard = document.createElement('section')
  questionCard.setAttribute('aria-labelledby', 'question-q1-0')
  questionFrame.appendChild(questionCard)
  body.appendChild(questionFrame)

  // 鲸鱼挂件的主菜单：dshwv-* 是作者手写的类名
  const whaleMenu = document.createElement('div')
  whaleMenu.className = 'dshwv-menu'
  body.appendChild(whaleMenu)

  // 鲸鱼音频编辑器：里面挂着 position:fixed 的小浮层 → **不能糊**
  // （backdrop-filter 会让它成为 fixed 后代的包含块 → 那个下拉会整体跑位）
  const audioWin = document.createElement('div')
  audioWin.className = 'dshwv-audiowin'
  const slotList = document.createElement('div')
  slotList.className = 'dshwv-slotlist'
  slotList.style.setProperty('position', 'fixed')
  // 桩里 fixed 元素默认按整个视口算几何，这里给它一个真实的小下拉尺寸（否则会被
  // "盖满视口就别糊"的安全闸挡掉 —— 真实 DSH 里它就是个 200×150 的小面板）
  slotList._rect = { top: 300, left: 300, right: 500, bottom: 450, width: 200, height: 150 }
  audioWin.appendChild(slotList)
  body.appendChild(audioWin)

  const { api } = runClient(dom)
  await flush()
  api.setMode('multiply')

  assert.ok(questionCard.classList.contains('__dshui-frost-surface'), '问答窗口要糊')
  assert.equal(
    questionCard.classList.contains('__dshui-frost-panel'),
    false,
    '问答窗口走主表面那套参数（跟滑块走）',
  )
  assert.ok(whaleMenu.classList.contains('__dshui-frost-panel'), '鲸鱼主菜单要糊（二级面板独自一套参数）')
  assert.equal(whaleMenu.classList.contains('__dshui-frost-surface'), false, '二级面板不许混进主表面类')
  assert.equal(
    audioWin.classList.contains('__dshui-frost-panel'),
    false,
    '有 fixed 后代的面板一律不糊（否则里面的浮层会跑位）',
  )
  assert.ok(slotList.classList.contains('__dshui-frost-panel'), '它自己是 fixed 叶子浮层，糊它没事')
  assert.equal(api.status().frost.targets, 1, '"主表面"语义不变：这个桩里只有输入卡片')
  assert.equal(api.status().frost.panels, 2, '二级面板 = 菜单 + 那个小下拉')
  assert.ok(api.status().frost.extra >= 3, '扩展表面要计数（诊断可见）')
  assert.match(
    api.diagnose(),
    /二级面板 2 个（20px · 白层 边94→80% 径向渐变 · 遮罩 16→34% 渐变）/,
    '诊断里要写清二级面板与遮罩的参数',
  )

  // 样式表必须静态锁住作者定的值（模糊 20px + 白层竖向渐变 97→83% + 遮罩径向渐变 16→34%）
  const css = styleTagOf(dom).textContent
  assert.match(css, /body\.__dshui-frost \.__dshui-frost-panel\{/)
  assert.match(css, /blur\(var\(--dsniang-frost-panel-blur,20px\)\)/)
  // 底色必须被简写一起重置成透明：否则渐变叠在实心底色上，两端差不到 1.5%（等于白做）
  assert.match(css, /__dshui-frost-panel\{background:radial-gradient\(ellipse at 50% 50%,/)
  assert.match(css, /var\(--dsniang-frost-panel-center,var\(--dsniang-frost-panel-bottom,0\.8\)\)\) 0%/)
  assert.match(css, /var\(--dsniang-frost-panel-edge,var\(--dsniang-frost-panel-top,0\.94\)\)\) 100%\)!important/)
  // 全屏变暗遮罩：每个 mask 类都必须带 body 开关前缀（不带前缀的会变成全局规则）
  assert.match(css, /body\.__dshui-frost \.dshwv-usage-mask,body\.__dshui-frost \.dshwv-resmask/)
  // 0.3.1 起：DSH 自己的全屏遮罩（DropOverlay）也进同一个名单（渐变 + 抬层级）
  assert.match(css, /body\.__dshui-frost \.XPF3fq_mask\{/)
  // DSH 自带模态框（0.3.3）：装有 dialog 的容器整体抬升 + 垫径向渐变变暗
  // （dialog 是 relative + z:1，出不了容器的叠层上下文，抬 dialog 本身没用）
  assert.match(
    css,
    /body\.__dshui-frost :has\(> \[role="dialog"\]\)\{z-index:2147483005!important;background:radial-gradient\(ellipse at center, rgba\(15,23,42,var\(--dsniang-panel-mask-center,0\.16\)\)/,
  )
  assert.match(css, /radial-gradient\(ellipse at center, rgba\(15,23,42,var\(--dsniang-panel-mask-center,0\.16\)\) 0%/)
  assert.match(css, /var\(--dsniang-panel-mask-edge,0\.34\)\) 100%\)!important;/)
  // 用户气泡**单独一套白层**（v0.2.38）：默认 62% —— 太低时"气泡形状会消失"（用户实测）
  // 气泡（v0.2.39，用户选的方案 B；v0.2.40 加透明度/颜色/模糊三旋钮）：**保留气泡自己的颜色**，
  // 只调透明度；兜底 55% = 100 - 默认透明度 45
  assert.match(
    css,
    /background-color:color-mix\(in srgb,var\(--dsniang-bubble-color,var\(--dsw-specific-bubble,#e8f0fe\)\) var\(--dsniang-frost-bubble-mix,55%\),transparent\)!important;/,
  )
  // 气泡模糊：独立一档，兜底 12px
  assert.match(css, /backdrop-filter:blur\(var\(--dsniang-frost-bubble-blur,12px\)\) saturate\(1\.15\)!important;/)
  // 层级（v0.2.37）：二级窗口与遮罩必须抬到**壁纸层（z-index 2147483000）之上**，
  // 于是绘制顺序 = 背景图/UI → 变暗 → 二级窗口，面板的玻璃才糊得到壁纸。
  assert.match(css, /__dshui-frost-panel\{[^}]*z-index:2147483010!important;/)
  assert.match(css, /\.dshwv-usage-mask[^{]*\{background:radial-gradient[^}]*z-index:2147483005!important;/)
  // 主表面（输入卡片 / 我的气泡）**不许**动 z-index：它们要留在壁纸下面（multiply 作用在它们身上）
  assert.equal(
    /__dshui-frost-surface\{[^}]*z-index/.test(css),
    false,
    '主表面不许被抬高（panel/mask 才抬）',
  )
  assert.equal(api.status().frost.panelBlur, 20)
  assert.equal(api.status().frost.panelAlpha, 0.87, '名义白层 = 渐变两端中值')
  assert.equal(api.status().frost.panelAlphaTop, 0.94)
  assert.equal(api.status().frost.panelAlphaBottom, 0.8)
  assert.equal(api.status().frost.panelMaskCenter, 0.16)
  assert.equal(api.status().frost.panelMaskEdge, 0.34)

  // 关掉毛玻璃：两类标记都必须摘干净（不许留一堆半透明面板）
  api.setFrostEnabled(false)
  dom.advance(600)
  assert.equal(questionCard.classList.contains('__dshui-frost-surface'), false)
  assert.equal(whaleMenu.classList.contains('__dshui-frost-panel'), false)
  assert.equal(slotList.classList.contains('__dshui-frost-panel'), false)
})

test('视觉更新（0.9）：玻璃径向渐变内透外亮 + 外阴影；思维链橙/红；方块光标样式', async () => {
  const dom = buildChatDom()
  const { api } = runClient(dom)
  await flush()
  api.setMode('multiply')
  const css = styleTagOf(dom).textContent
  // 主表面：径向渐变（内部 alpha 更小）+ 边缘高光 + 内阴影
  assert.match(css, /__dshui-frost-surface\{background:radial-gradient\(ellipse at 50% 50%,/)
  assert.match(css, /box-shadow:inset 0 0 0 1px rgba\(255,255,255,\.45\),0 10px 30px rgba\(17,18,20,\.10\)!important/)
  assert.match(css, /--dsniang-frost-alpha-center,0\.11/)
  // 二级面板：径向渐变 + 外阴影
  assert.match(css, /__dshui-frost-panel\{background:radial-gradient\(ellipse at 50% 50%,/)
  assert.match(css, /box-shadow:inset 0 0 0 1px rgba\(255,255,255,\.35\),0 14px 36px rgba\(17,18,20,\.14\)!important/)
  // 思维链颜色已按用户反馈移除：样式表里不应再有 data-variant 颜色覆盖
  assert.doesNotMatch(css, /\[data-variant=/, '思考区域保持 DSH 原样（不再覆盖颜色）')
  assert.ok(css.includes('body.__dshui-texture [data-composer-card].__dshui-frost-surface{backdrop-filter:none!important'), '纹理模式输入卡片应关掉 backdrop-filter')
  // 悬浮防闪（0.8.28）：发送键 hover 过渡要关掉
  assert.match(css, /aria-label="发送消息"[^{]*{transition:none!important/, '发送键 hover 过渡要关掉')
  // 方块光标：原生 caret 透明 + 闪烁小方格（莱茵生命 warning 同款）
  assert.match(css, /body\.__dshui-caret-on \[data-composer-input\]\{caret-color:transparent!important;\}/)
  assert.ok(css.includes('#__dshui-caret{position:fixed;display:none;width:8px;min-width:2px;height:18px;box-sizing:border-box;background:color-mix(in srgb,var(--dshui-caret-color,#3964fe) var(--dshui-caret-alpha,55%),transparent)'), '光标是半透明主题色方块')
  assert.ok(css.includes('border:1px solid color-mix(in srgb,var(--dshui-caret-color,#3964fe) 70%,transparent)'), '光标有细边框')
  assert.ok(css.includes('border-radius:2px;z-index:2147483004'), '光标 2px 圆角')
  assert.ok(css.includes('backdrop-filter:blur(calc(var(--dshui-caret-blur,5px) * .2)) saturate(1.2)'), '光标带背景模糊（随模糊滑块）')
  assert.match(css, /@keyframes __dshui-caret-blink\{50%\{opacity:0;\}\}/)
  // 白层变量：名义 0.2；径向仍「内透 0.11 → 外亮 0.2」
  dom.advance(600)
  const full = parseFloat(dom.body.style.getPropertyValue('--dsniang-frost-alpha'))
  const center = parseFloat(dom.body.style.getPropertyValue('--dsniang-frost-alpha-center'))
  const edge = parseFloat(dom.body.style.getPropertyValue('--dsniang-frost-alpha-edge'))
  assert.ok(Math.abs(full - 0.2) < 0.01, '名义白层 0.2')
  assert.ok(Math.abs(center - 0.11) < 0.01, '内部透 = 0.11')
  assert.ok(Math.abs(edge - 0.2) < 0.01, '边缘亮 = 0.2')
  // faux DOM 没有 getSelection：方块光标安全降级（不创建节点、原生 caret 保持）
  assert.equal(dom.document.getElementById('__dshui-caret'), null)
  assert.equal(dom.body.classList.contains('__dshui-caret-on'), false)
})
test('纹理模式气泡视觉（0.8.5）：默认开、只作用于纹理模式、可面板/API 开关且零布局', async () => {
  const dom = buildChatDom()
  const { api } = runClient(dom)
  await flush()
  api.setMode('multiply')
  dom.advance(600)
  const before = layoutSnapshot(dom)
  assert.equal(api.status().frost.bubbleFx, true, '默认开')
  assert.ok(dom.body.classList.contains('__dshui-bubblefx'), '纹理模式应加气泡视觉类')
  const css = styleTagOf(dom).textContent
  assert.match(css, /body\.__dshui-bubblefx \[class\*="bubble"\]\.__dshui-frost-surface/)
  assert.match(css, /body\.__dshui-bubblefx \[data-composer-card\]\.__dshui-frost-surface\{background-image:radial-gradient/)
  assert.match(css, /box-shadow:inset 0 0 0 1px rgba\(255,255,255,\.55\)/)
  // 面板开关（只在纹理模式出现）
  api.switcher()
  const toggle = dom.document.querySelectorAll('[data-bubblefx-toggle]')[0]
  assert.ok(toggle, '面板里应有「气泡视觉」开关')
  assert.match(toggle.textContent, /气泡视觉：开/)
  toggle._listeners.click[0]({ type: 'click', target: toggle, stopPropagation() {} })
  assert.equal(api.status().frost.bubbleFx, false, '点一下应关')
  assert.equal(dom.body.classList.contains('__dshui-bubblefx'), false)
  const saved = JSON.parse(dom.window.localStorage.getItem('__dshui.frost.v3'))
  assert.equal(saved.bubbleFx, false, '要存档')
  assert.equal(layoutSnapshot(dom), before, '气泡视觉不得改布局')
  // API 开回来；背景模式不启用该视觉（纹理模式专属）
  assert.match(api.setBubbleFx(true), /气泡视觉：开/)
  assert.equal(dom.body.classList.contains('__dshui-bubblefx'), true)
  api.setMode('backdrop')
  dom.advance(600)
  assert.equal(dom.body.classList.contains('__dshui-bubblefx'), false, '背景模式不启用纹理气泡视觉')
})
test('纹理模式 AI 思考过程视效（0.8.5）：默认开、语义选择器、面板/API 开关、存档、零布局', async () => {
  const dom = buildChatDom()
  const { api } = runClient(dom)
  await flush()
  api.setMode('multiply')
  dom.advance(600)
  const before = layoutSnapshot(dom)
  assert.equal(api.status().frost.aiReplyFx, true, '默认开')
  assert.ok(dom.body.classList.contains('__dshui-aireplyfx'), '纹理模式应加 AI 回复视觉类')
  const css = styleTagOf(dom).textContent
  assert.match(css, /body\.__dshui-aireplyfx \[data-chat-flow\] \[data-chat-flow-key\]:not\(\[data-chat-flow-kind\]\)\{/)
  assert.match(css, /box-shadow:inset 2px 0 0 rgba\(57,100,254,\.5\)!important/)
  // 每行思维链：同一套细线/渐变 + 动效闸门下的淡入动画
  assert.ok(css.includes('[data-chat-flow-kind="turn-process"] [data-variant]'), '应命中 turn-process 的步骤行')
  assert.ok(css.includes('@keyframes __dshui-ai-line-in'), '应从左侧淡入的 keyframes')
  assert.ok(css.includes('prefers-reduced-motion: no-preference'), '系统减弱动态时关闭动画')
  assert.ok(css.includes('[data-step-process-body] [data-variant]'), '思维链步骤行多属性兜底（只认 data-variant 行）')
  assert.ok(css.includes('animation-play-state:paused'), '失焦/减弱动态时暂停')
  // 输入框玻璃加强：更强高光/投影 + 更实的模糊
  assert.ok(css.includes('rgba(255,255,255,.50) 0%,rgba(255,255,255,0) 72%'), '输入框顶部高光更强')
  assert.ok(css.includes('calc(var(--dsniang-frost-blur,2px) + 2px)'), '输入框模糊额外 +2px')
  // 动效总开关默认关：不应有 motion-on 类；API 打开后才有
  assert.equal(dom.body.classList.contains('__dshui-motion-on'), false, '默认动效关')
  api.setMotion(true)
  assert.equal(dom.body.classList.contains('__dshui-motion-on'), true, '开启动效后应加类')
  api.setMotion(false)
  assert.equal(dom.body.classList.contains('__dshui-motion-on'), false, '关闭后应摘类')
  assert.equal(api.status().frost.aiReplyTargets, 0, '桩里没有 AI 回复节点 → 命中 0')
  api.switcher()
  const toggle = dom.document.querySelectorAll('[data-aireplyfx-toggle]')[0]
  assert.ok(toggle, '面板里应有「AI 思考过程视效」开关')
  assert.match(toggle.textContent, /AI 思考过程视效：开/)
  toggle._listeners.click[0]({ type: 'click', target: toggle, stopPropagation() {} })
  assert.equal(api.status().frost.aiReplyFx, false, '点一下应关')
  assert.equal(dom.body.classList.contains('__dshui-aireplyfx'), false)
  const saved = JSON.parse(dom.window.localStorage.getItem('__dshui.frost.v3'))
  assert.equal(saved.aiReplyFx, false, '要存档')
  assert.equal(layoutSnapshot(dom), before, 'AI 回复视觉不得改布局')
  assert.match(api.setAiReplyFx(true), /AI 思考过程视效：开/)
  assert.equal(dom.body.classList.contains('__dshui-aireplyfx'), true)
  api.setMode('backdrop')
  dom.advance(600)
  assert.equal(dom.body.classList.contains('__dshui-aireplyfx'), true, '背景模式也启用 AI 思考过程视效')
  const bdToggle = dom.document.querySelectorAll('[data-aireplyfx-toggle]')[0]
  assert.ok(bdToggle, '背景模式面板也应有 AI 视觉开关')
})

test('AI 思维链只读读取（0.8.5）：thinkingRows() 能取到行数/文字摘要，且不报错', async () => {
  const dom = buildChatDom()
  const { api } = runClient(dom)
  await flush()
  const before = api.thinkingRows()
  assert.equal(typeof before.count, 'number', '初始计数应为数字')
  assert.ok(Array.isArray(before.rows))
  assert.equal(typeof before.replayCount, 'number', '应带重播计数')
  // 伪造一行思维链：包在 [data-step-process] 里让选择器命中
  const box = dom.document.createElement('div')
  box.setAttribute('data-step-process', '')
  const row = dom.document.createElement('div')
  row.setAttribute('data-variant', 'think')
  row.textContent = '先检查输入法焦点，再继续推理'
  box.appendChild(row)
  dom.body.appendChild(box)
  const after = api.thinkingRows()
  assert.ok(after.count >= 1, '应读到伪造的思维链行')
  assert.ok(after.rows.some(function (row) { return row.text.includes('输入法焦点') }), '应能读到思维链文字摘要')
})
test('浅色纸白底不误判（0.8.13）：paper-white token 下仍是浅色、用浅色图和浅色浓度', async () => {
  const lightImages = [
    { name: 'deepseek 4k.png', label: 'deepseek', bytes: 11, source: 'desktop' },
    { name: 'deepseek 黑白无水面.png', label: 'deepseek 黑白无水面', bytes: 22, source: 'desktop' },
  ]
  const darkImages = [{ name: 'DeepSeek 暗夜模式.png', label: '暗夜', bytes: 33, source: 'desktop' }]
  const dom = buildChatDom({ baseToken: '#f6f8fc' })
  const { api } = runClient(dom, { statusImages: lightImages, statusDarkImages: darkImages })
  await flush()
  api.setMode('multiply')
  await flush()
  dom.advance(600)
  await flush()
  assert.equal(api.status().theme, 'light', 'paper-white 浅色不能被判成深色')
  assert.equal(api.status().image, 'deepseek 4k.png', '浅色应使用浅色壁纸')
  assert.equal(api.status().opacity, 0.49, '浅色纹理浓度仍是 0.49')
})

test('深色属性检测（0.8.8）：body[data-ds-dark-theme] 存在时启动即用暗夜壁纸，图片栏只有 1 张', async () => {
  const lightImages = [
    { name: 'deepseek 4k.png', label: 'deepseek', bytes: 11, source: 'desktop' },
    { name: 'deepseek 黑白无水面.png', label: 'deepseek 黑白无水面', bytes: 22, source: 'desktop' },
  ]
  const darkImages = [{ name: 'DeepSeek 暗夜模式.png', label: '暗夜', bytes: 33, source: 'desktop' }]

  const dom = buildChatDom()
  dom.body.setAttribute('data-ds-dark-theme', '')
  const { api } = runClient(dom, { statusImages: lightImages, statusDarkImages: darkImages })
  await flush()
  api.setMode('multiply')
  await flush()
  dom.advance(600)
  await flush()
  assert.equal(api.status().theme, 'dark', 'body 深色属性应被识别')
  assert.equal(api.status().image, 'DeepSeek 暗夜模式.png', '启动即应使用暗夜壁纸')
  const pill = dom.document.getElementById('__dshui-pill')
  assert.ok(pill, '胶囊应存在')
  assert.equal(pill.style.getPropertyValue('color'), '#f5f7fa', '深色胶囊应为浅色字')
  assert.ok(String(pill.style.getPropertyValue('background')).includes('255,255,255') || String(pill.style.getPropertyValue('background')).includes('rgba(17,18,20'), '深色胶囊应为深底')
  assert.equal(api.status().opacity, 0.85, '深色纹理模式默认浓度 0.85（暗夜图才看得清）')
  const darkCss = styleTagOf(dom).textContent
  assert.ok(darkCss.includes('body[data-ds-dark-theme] #__dshui-layer[data-mode="multiply"]'), '深色纹理应覆盖混合模式')
  assert.ok(darkCss.includes('mix-blend-mode:lighten'), '深色纹理应用 lighten（multiply 会让暗色壁纸几乎不可见）')
  api.setOpacity(0.6)
  assert.equal(api.status().opacity, 0.6)
  const savedDark = JSON.parse(dom.window.localStorage.getItem('__dshui.opacities.dark'))
  assert.equal(savedDark.multiply, 0.6, '深色浓度存到独立键')
  assert.equal(dom.window.localStorage.getItem('__dshui.opacities'), null, '不应写浅色浓度键')
  api.switcher()
  const modeBtn = dom.document.querySelector('[data-mode-button="multiply"]')
  assert.ok(modeBtn, '应有纹理模式按钮')
  assert.equal(modeBtn.style.getPropertyValue('color'), '#111111', '深色激活按钮应为黑字（白底）')
  assert.equal(modeBtn.style.getPropertyValue('background'), '#f5f7fa', '深色激活按钮应为白底')
  assert.ok(String(modeBtn.style.getPropertyValue('transition')).includes('background-color'), '按钮颜色应带过渡')
  const switcherBox = dom.document.getElementById('__dshui-switcher')
  assert.ok(switcherBox && String(switcherBox.style.getPropertyValue('transition')).includes('background-color'), '面板颜色应带过渡')
  const darkButtons = dom.document.querySelectorAll('[data-image-button]')
  assert.equal(darkButtons.length, 1, '深色图片栏只显示暗夜图')
  assert.equal(darkButtons[0].getAttribute('data-image-button'), 'DeepSeek 暗夜模式.png')
})

test('深浅色主题壁纸（0.8.7）：深色自动用暗夜图，浅色仍用原两张', async () => {
  const lightImages = [
    { name: 'deepseek 4k.png', label: 'deepseek', bytes: 11, source: 'desktop' },
    { name: 'deepseek 黑白无水面.png', label: 'deepseek 黑白无水面', bytes: 22, source: 'desktop' },
  ]
  const darkImages = [{ name: 'DeepSeek 暗夜模式.png', label: '暗夜', bytes: 33, source: 'desktop' }]

  // 深色主题：自动用暗夜图，图片栏只有一张
  const dark = buildChatDom({ baseToken: 'rgb(22, 24, 29)' })
  const a = runClient(dark, { statusImages: lightImages, statusDarkImages: darkImages })
  await flush()
  a.api.setMode('multiply')
  await flush()
  dark.advance(600)
  await flush()
  assert.equal(a.api.status().theme, 'dark')
  assert.equal(a.api.status().image, 'DeepSeek 暗夜模式.png', '深色应用暗夜壁纸')
  a.api.switcher()
  const darkButtons = dark.document.querySelectorAll('[data-image-button]')
  assert.equal(darkButtons.length, 1, '深色图片栏只显示暗夜图')
  assert.equal(darkButtons[0].getAttribute('data-image-button'), 'DeepSeek 暗夜模式.png')

  // 浅色主题：保持原来的两张
  const light = buildChatDom()
  const b = runClient(light, { statusImages: lightImages, statusDarkImages: darkImages })
  await flush()
  b.api.setMode('multiply')
  await flush()
  light.advance(600)
  assert.equal(b.api.status().theme, 'light')
  assert.ok(lightImages.some((entry) => entry.name === b.api.status().image), '浅色用原候选图')
  b.api.switcher()
  const lightButtons = light.document.querySelectorAll('[data-image-button]')
  assert.equal(lightButtons.length, 2, '浅色图片栏仍是两张')
})

test('面板白层滑块：拖动即时生效、写进存档、刷新后读回（只管二级面板）', async () => {
  const dom = buildChatDom()
  // 放一个鲸鱼面板进去，好让诊断里出现「二级面板」那一段
  const whaleMenu = dom.document.createElement('div')
  whaleMenu.className = 'dshwv-menu'
  dom.body.appendChild(whaleMenu)

  const { api } = runClient(dom)
  await flush()
  api.setMode('multiply')
  api.switcher()

  const top = dom.document.querySelectorAll('[data-panel-top-slider]')[0]
  const bottom = dom.document.querySelectorAll('[data-panel-bottom-slider]')[0]
  assert.ok(top && bottom, '纹理模式下应有两个面板白层滑块')
  assert.equal(top.value, '0.94', '默认边缘 0.94')
  assert.equal(bottom.value, '0.8', '默认内部 0.8')
  assert.equal(top.min, '0.1', '下限 0.1（v0.6.2 从 0.3 降下来：范围不该替用户做决定，默认值没动）')
  assert.equal(top.max, '1')

  // 气泡透明度（v0.2.40）：0 = 不透明（DSH 原样），100 = 全透明；默认 45%
  const bubbleT = dom.document.querySelectorAll('[data-bubble-transparency-slider]')[0]
  assert.ok(bubbleT, '应有「气泡透明度」滑块')
  assert.equal(bubbleT.value, '45', '气泡透明度默认 45%')
  assert.equal(bubbleT.min, '0', '下限 0%（= 不透明 / DSH 原样）')
  assert.equal(bubbleT.max, '100', '上限 100%（= 全透明）')
  // 透明度 45 → 落到 CSS 的是"颜色保留百分比" 55
  assert.equal(dom.body.style.getPropertyValue('--dsniang-frost-bubble-mix'), '55%')
  bubbleT.value = '80'
  bubbleT._listeners.input[0]({ type: 'input', target: bubbleT, stopPropagation() {} })
  assert.equal(dom.body.style.getPropertyValue('--dsniang-frost-bubble-mix'), '20%', '透明度 80 → 保留 20')
  assert.equal(api.status().frost.bubbleTransparency, 80)
  assert.equal(
    dom.document.querySelectorAll('.__dshui-bubble-transparency-value')[0].textContent,
    '80%',
    '数值文案要跟着滑块走',
  )
  assert.match(api.diagnose(), /气泡 80%透/, '诊断里要看得见气泡透明度')
  assert.equal(
    JSON.parse(dom.window.localStorage.getItem('__dshui.frost.v3')).bubbleTransparency,
    80,
    '气泡透明度要存档',
  )
  // 越界（>100）一律忽略，保持原值
  bubbleT.value = '150'
  bubbleT._listeners.input[0]({ type: 'input', target: bubbleT, stopPropagation() {} })
  assert.equal(api.status().frost.bubbleTransparency, 80, '超过上限一律忽略')
  bubbleT.value = '45'
  bubbleT._listeners.input[0]({ type: 'input', target: bubbleT, stopPropagation() {} })

  // 气泡模糊（v0.2.40）：独立于主表面模糊，默认 12px
  const bubbleBlur = dom.document.querySelectorAll('[data-bubble-blur-slider]')[0]
  assert.ok(bubbleBlur, '应有「气泡模糊」滑块')
  assert.equal(bubbleBlur.value, '12', '气泡模糊默认 12px')
  assert.equal(dom.body.style.getPropertyValue('--dsniang-frost-bubble-blur'), '12px')
  bubbleBlur.value = '20'
  bubbleBlur._listeners.input[0]({ type: 'input', target: bubbleBlur, stopPropagation() {} })
  assert.equal(dom.body.style.getPropertyValue('--dsniang-frost-bubble-blur'), '20px')
  assert.equal(api.status().frost.bubbleBlur, 20)
  assert.equal(
    dom.document.querySelectorAll('.__dshui-bubble-blur-value')[0].textContent,
    '20px',
    '数值文案要跟着滑块走',
  )
  assert.match(api.diagnose(), /气泡 45%透·20px/, '诊断里要看得见气泡模糊')
  assert.equal(
    JSON.parse(dom.window.localStorage.getItem('__dshui.frost.v3')).bubbleBlur,
    20,
    '气泡模糊要存档',
  )
  bubbleBlur.value = '12'
  bubbleBlur._listeners.input[0]({ type: 'input', target: bubbleBlur, stopPropagation() {} })

  // 气泡颜色（v0.2.40）：取色器 → <body> 变量 + 存档；「原色」按钮 → 清掉、恢复自动跟随
  const colorInput = dom.document.querySelectorAll('[data-bubble-color-input]')[0]
  const colorReset = dom.document.querySelectorAll('[data-bubble-color-reset]')[0]
  assert.ok(colorInput && colorReset, '应有取色器与「原色」按钮')
  colorInput.value = '#123abc'
  colorInput._listeners.input[0]({ type: 'input', target: colorInput, stopPropagation() {} })
  assert.equal(api.status().frost.bubbleColor, '#123abc')
  assert.equal(dom.body.style.getPropertyValue('--dsniang-bubble-color'), '#123abc', '自选色写到 body 变量')
  assert.equal(
    JSON.parse(dom.window.localStorage.getItem('__dshui.frost.v3')).bubbleColor,
    '#123abc',
    '自选色要存档',
  )
  assert.match(api.diagnose(), /色#123abc/, '诊断里要看得见自选色')
  // 坏值一律忽略（保持原值）
  colorInput.value = 'not-a-color'
  colorInput._listeners.input[0]({ type: 'input', target: colorInput, stopPropagation() {} })
  assert.equal(api.status().frost.bubbleColor, '#123abc', '非法颜色一律忽略')
  // 「原色」→ 清掉自选色
  colorReset._listeners.click[0]({ type: 'click', target: colorReset, stopPropagation() {} })
  assert.equal(api.status().frost.bubbleColor, '', '点原色要清掉自选色')
  assert.equal(dom.body.style.getPropertyValue('--dsniang-bubble-color'), '', 'body 变量要摘掉')
  assert.equal(
    JSON.parse(dom.window.localStorage.getItem('__dshui.frost.v3')).bubbleColor,
    '',
    '原色也要存档',
  )

  // 默认值已经落到 <body> 的 CSS 变量上（样式表一个字都不动）
  assert.equal(dom.body.style.getPropertyValue('--dsniang-frost-panel-top'), '0.94')
  assert.equal(dom.body.style.getPropertyValue('--dsniang-frost-panel-bottom'), '0.8')
  const cssBefore = styleTagOf(dom).textContent

  // 拖到 0.62 / 0.40（= 背后的内容会真的透出来）
  top.value = '0.62'
  bottom.value = '0.4'
  top._listeners.input[0]({ type: 'input', target: top, stopPropagation() {} })
  bottom._listeners.input[0]({ type: 'input', target: bottom, stopPropagation() {} })

  assert.equal(dom.body.style.getPropertyValue('--dsniang-frost-panel-top'), '0.62')
  assert.equal(dom.body.style.getPropertyValue('--dsniang-frost-panel-bottom'), '0.4')
  assert.equal(api.status().frost.panelAlphaTop, 0.62)
  assert.equal(api.status().frost.panelAlphaBottom, 0.4)
  assert.equal(
    dom.document.querySelectorAll('.__dshui-panel-top-value')[0].textContent,
    '62%',
    '数值文案要跟着滑块走',
  )
  assert.match(api.diagnose(), /白层 边62→40% 径向渐变/, '诊断里要看得见这两个值')
  assert.equal(dom.document.querySelectorAll('#__dshui-switcher').length, 1, '拖滑块不许关面板')
  assert.equal(styleTagOf(dom).textContent, cssBefore, '拖滑块不许改写样式表（静态表）')

  const saved = JSON.parse(dom.window.localStorage.getItem('__dshui.frost.v3'))
  assert.equal(saved.panelTop, 0.62, '要存档')
  assert.equal(saved.panelBottom, 0.4)

  // 越界 / 坏值一律忽略（保持原值），不会把面板糊成半透
  top.value = '0.05'
  top._listeners.input[0]({ type: 'input', target: top, stopPropagation() {} })
  assert.equal(api.status().frost.panelAlphaTop, 0.62, '低于下限一律忽略')

  // 刷新：新会话从存档读回，变量也要重新落上
  const next = buildChatDom()
  next.window.localStorage.setItem('__dshui.frost.v3', JSON.stringify(saved))
  const two = runClient(next)
  await flush()
  two.api.setMode('multiply')
  assert.equal(two.api.status().frost.panelAlphaTop, 0.62, '刷新后要读回上端')
  assert.equal(two.api.status().frost.panelAlphaBottom, 0.4, '刷新后要读回下端')
  assert.equal(next.body.style.getPropertyValue('--dsniang-frost-panel-top'), '0.62')
})

test('v0.6.2 把「薄纱 / 白层 / 面板白层」的最低值都往下放（用户要的"最低数值再调低一点"）', async () => {
  const dom = buildChatDom()
  const { api } = runClient(dom)
  await flush()
  api.setMode('multiply')
  api.switcher()

  // ① 白层（输入卡片玻璃）：下限 0.15 → 0.02
  const alpha = dom.document.querySelectorAll('[data-frost-alpha-slider]')[0]
  assert.equal(alpha.min, '0.02', '白层下限 0.02（以前 0.15）')
  assert.equal(alpha.max, '0.85')
  assert.equal(alpha.value, '0.2', '默认值更新为 0.2（白层更淡）')
  alpha.value = '0.05'
  alpha._listeners.input[0]({ type: 'input', target: alpha, stopPropagation() {} })
  assert.equal(api.status().frost.alpha, 0.05, '5% 白层要接受（以前被下限挡掉）')
  assert.equal(dom.body.style.getPropertyValue('--dsniang-frost-alpha'), '0.05')
  assert.equal(
    JSON.parse(dom.window.localStorage.getItem('__dshui.frost.v3')).alpha,
    0.05,
    '5% 白层要存档',
  )
  assert.equal(
    dom.document.querySelectorAll('.__dshui-frost-alpha-value')[0].textContent,
    '5%',
    '数值文案要跟着滑块走',
  )
  // 下限仍然是"下限"：0.01 会被夹回 0.02（滑块的 `Math.max(FROST_ALPHA_MIN, …)` 在管）
  alpha.value = '0.01'
  alpha._listeners.input[0]({ type: 'input', target: alpha, stopPropagation() {} })
  assert.equal(api.status().frost.alpha, 0.02, '0.01 低于下限 → 夹到 0.02')

  // API 边界同步放开（以前 setFrostAlpha(0.05) 会直接被拒）
  assert.match(api.setFrostAlpha(0.05), /白层 = 0\.05/, 'API 也要接受 0.05')
  assert.match(api.setFrostAlpha(0.01), /需在 0\.02~0\.85 之间/, 'API 仍守住下限')

  // ② 面板白层上/下：下限 0.30 → 0.10
  const top = dom.document.querySelectorAll('[data-panel-top-slider]')[0]
  const bottom = dom.document.querySelectorAll('[data-panel-bottom-slider]')[0]
  assert.equal(top.min, '0.1', '面板白层下限 0.1（以前 0.3）')
  assert.equal(bottom.min, '0.1')
  top.value = '0.15'
  top._listeners.input[0]({ type: 'input', target: top, stopPropagation() {} })
  assert.equal(api.status().frost.panelAlphaTop, 0.15, '15% 面板白层要接受')
  assert.equal(dom.body.style.getPropertyValue('--dsniang-frost-panel-top'), '0.15')

  // 存档里的低值也要能读回来（以前 < 0.3 会被判坏数据 → 回落默认）。
  // 注意要带上"迁移已跑过"的标记：全新 profile 的首次迁移会把"低于出厂默认"的值提上来
  // （只升不降、只跑一次，v0.2.30 的老行为），那是**默认值**纪律，不是范围下限。
  const next = buildChatDom()
  next.window.localStorage.setItem('__dshui.glass.v1', '1')
  next.window.localStorage.setItem(
    '__dshui.frost.v3',
    JSON.stringify({ enabled: true, alpha: 0.04, panelTop: 0.12, panelBottom: 0.11 }),
  )
  const two = runClient(next)
  await flush()
  two.api.setMode('multiply')
  assert.equal(two.api.status().frost.alpha, 0.04, '存档里的 4% 白层要读回（以前回落 25%）')
  assert.equal(two.api.status().frost.panelAlphaTop, 0.12, '存档里的 12% 面板白层要读回（以前回落 97%）')
  assert.equal(two.api.status().frost.panelAlphaBottom, 0.11)
})

test('气泡参数迁移：v0.2.39 的 bubbleMix（颜色保留 %）等价换算成透明度，视觉不变', async () => {
  const dom = buildChatDom()
  dom.window.localStorage.setItem(
    '__dshui.frost.v3',
    JSON.stringify({ enabled: true, layered: true, blur: 7, alpha: 0.3, bubbleMix: 60 }),
  )
  const { api } = runClient(dom)
  await flush()
  api.setMode('multiply')
  assert.equal(api.status().frost.bubbleTransparency, 40, '旧档 mix=60 → 透明度 40（等价换算）')
  assert.equal(api.status().frost.bubbleBlur, 12, '新字段回落默认 12px')
  assert.equal(api.status().frost.bubbleColor, '', '新字段回落默认（跟随原色）')
  assert.equal(dom.body.style.getPropertyValue('--dsniang-frost-bubble-mix'), '60%', 'CSS 侧仍是 60% 保留')
})

test('一次性迁移：低于出厂默认的旧模糊 / 白层只提一次（只升不降），之后以滑块为准', async () => {
  const key = '__dshui.frost.v3'
  const legacy = JSON.stringify({ enabled: true, layered: true, blur: 1, alpha: 0.15 })

  const first = buildChatDom()
  first.window.localStorage.setItem(key, legacy)
  const one = runClient(first)
  await flush()
  assert.equal(one.api.status().frost.blur, 2, '模糊 1px（低于出厂默认）→ 提到出厂默认')
  assert.equal(one.api.status().frost.alpha, 0.2, '白层 15%（低于出厂默认）→ 提到出厂默认（0.2）')
  assert.equal(JSON.parse(first.window.localStorage.getItem(key)).blur, 2, '迁移结果要落盘')
  assert.equal(first.window.localStorage.getItem('__dshui.glass.v1'), '1', '迁移标记只写一次')

  // 比默认更"重"的口味原样保留（迁移只升不降）
  const heavy = buildChatDom()
  heavy.window.localStorage.setItem(key, JSON.stringify({ enabled: true, layered: true, blur: 18, alpha: 0.7 }))
  const kept = runClient(heavy)
  await flush()
  assert.equal(kept.api.status().frost.blur, 18)
  assert.equal(kept.api.status().frost.alpha, 0.7)

  // 第二次：迁移标记已在 → 尊重用户当时的选择（哪怕又调回 1px）
  const second = buildChatDom()
  second.window.localStorage.setItem(key, legacy)
  second.window.localStorage.setItem('__dshui.glass.v1', '1')
  const two = runClient(second)
  await flush()
  assert.equal(two.api.status().frost.blur, 1)
  assert.equal(two.api.status().frost.alpha, 0.15)
})

test('回归护栏：关掉分层后，切纹理 / 拖浓度都不改页面布局样式', async () => {
  const dom = buildChatDom()
  const { api } = runClient(dom)
  await flush()
  api.setLayering(false) // 分层本身是有意为之的布局改动，这里单独关掉再验护栏
  const before = layoutSnapshot(dom)

  api.setMode('multiply')
  assert.equal(layoutSnapshot(dom), before, '切纹理不得改布局')

  api.setOpacity(0.22)
  assert.equal(layoutSnapshot(dom), before, '调浓度不得改布局')
  assert.equal(api.status().opacity, 0.22)
})

test('切回关闭：淡出完成后层、样式与分层改动全部还原', async () => {
  const dom = buildChatDom()
  const { api } = runClient(dom)
  await flush()
  const before = layoutSnapshot(dom)

  api.setMode('multiply')
  assert.ok(layerOf(dom))

  api.setMode('off')
  assert.equal(api.status().mode, 'off')
  assert.ok(layerOf(dom), '淡出期间层应还在')
  assert.equal(layerOf(dom).classList.contains('is-faded'), true, '淡出期间层应处于透明态')

  dom.advance(600)
  assert.equal(layerOf(dom), null, '淡出完成后层应移除')
  assert.equal(styleTagOf(dom), null, '样式应移除')
  assert.equal(api.status().mode, 'off')
  assert.equal(layoutSnapshot(dom), before, '分层改过的内联样式也要一字不差地还原')
})

test('点击背景：淡出，2 秒后自动淡回（纹理模式下）', async () => {
  const dom = buildChatDom()
  const { api } = runClient(dom)
  await flush()
  api.setMode('multiply')
  dom.advance(40) // 等模式切换的淡入结束，避免干扰下面的 2 秒计时
  const layer = layerOf(dom)

  clickOn(dom, dom.panel)
  assert.equal(layer.classList.contains('is-faded'), true, '点击后应开始淡出')
  assert.equal(api.status().override, true)

  dom.advance(1900)
  assert.equal(layer.classList.contains('is-faded'), true, '不到 2 秒不应恢复')

  dom.advance(200)
  assert.equal(layer.classList.contains('is-faded'), false, '2 秒后应自动淡回')
  assert.equal(api.status().override, false)
})

test('点击不会触发恢复：气泡 / 输入框 / 按钮 / 链接 / 图标', async () => {
  const dom = buildChatDom()
  const { api } = runClient(dom)
  await flush()
  api.setMode('multiply')
  dom.advance(40) // 等模式切换的淡入结束
  const layer = layerOf(dom)

  const button = dom.document.createElement('button')
  dom.panel.appendChild(button)
  const link = dom.document.createElement('a')
  dom.panel.appendChild(link)
  const icon = dom.document.createElement('svg')
  dom.panel.appendChild(icon)

  for (const node of [dom.bubble, dom.textarea, button, link, icon]) {
    clickOn(dom, node)
    assert.equal(api.status().override, false, `点 ${node.tagName} 不应恢复`)
    assert.equal(layer.classList.contains('is-faded'), false)
  }
})

test('点击永不拦截页面事件（不 preventDefault、不 stopPropagation）', async () => {
  const dom = buildChatDom()
  runClient(dom)
  await flush()
  dom.window.__DSHUI__.setMode('multiply')
  const event = clickOn(dom, dom.panel)
  assert.equal(event.defaultPrevented, false, '不能 preventDefault')
  assert.equal(event.cancelBubble, undefined, '不能 stopPropagation')
})

test('旧模式 luminosity 已弃用：只提示、不改变当前模式', async () => {
  const dom = buildChatDom()
  const { api } = runClient(dom)
  await flush()

  assert.match(api.setMode('luminosity'), /已弃用/)
  assert.equal(api.status().mode, 'off', '点待更新后仍应是关闭')

  api.setMode('multiply')
  assert.equal(api.status().mode, 'multiply')
  assert.match(api.setMode('luminosity'), /已弃用/)
  assert.equal(api.status().mode, 'multiply', '在纹理模式下点待更新也不该切走')
  assert.ok(layerOf(dom), '层应保留')
})

test('图片切换：候选来自宿主，切图只换 URL 不刷新页面', async () => {
  const dom = buildChatDom()
  const images = [
    { name: 'deepseek 4k.png', label: 'deepseek 4k', bytes: 11 },
    { name: 'deepseek 黑白无水面.png', label: 'deepseek 黑白无水面', bytes: 22 },
  ]
  const { api, requested } = runClient(dom, { statusImages: images })
  await flush()
  api.setMode('multiply')

  const box = api.switcher()
  const buttons = Array.prototype.slice.call(box.querySelectorAll('[data-image-button]'))
  assert.deepEqual(
    buttons.map((b) => b.getAttribute('data-image-button')),
    images.map((entry) => entry.name),
    '切换器应列出宿主给出的候选图',
  )

  const target = buttons[1]
  target._listeners.click[0]({ type: 'click', target, stopPropagation() {} })
  await flush()

  assert.ok(
    requested.some((url) => decodeURIComponent(url).includes('img=deepseek 黑白无水面.png')),
    '应带 img= 去问宿主，实际请求：' + JSON.stringify(requested),
  )
  assert.equal(api.status().image, 'deepseek 黑白无水面.png', '当前图应更新')
  assert.ok(layerOf(dom), '层应仍在')

  // 交叉淡化：旧图冻结在第一层内联，第二层放新图从 0 淡入，不经过空白
  assert.equal(layerOf(dom).classList.contains('is-faded'), false, '换图不应先淡出到空白')
  const layer2 = dom.document.getElementById('__dshui-layer2')
  assert.ok(layer2, '交叉淡化期间应有第二图层')
  assert.match(
    String(layer2.style.getPropertyValue('background-image')),
    /img=deepseek%20/,
    '第二层放的是新图',
  )
  const frozenOld = String(layerOf(dom).style.getPropertyValue('background-image'))
  assert.match(frozenOld, /bg\.png/, '第一层内联应冻结旧图（防止样式表更新瞬间换掉）')
  assert.equal(frozenOld.indexOf('img='), -1, '冻结的是不带 img 参数的旧图')
  assert.equal(
    /url\(/.test(styleTagOf(dom).textContent),
    false,
    '换图不得把图片写进样式表（静态表，防合成层重建闪白光）',
  )
  const layer1MidOpacity = Number(layerOf(dom).style.getPropertyValue('opacity'))
  const layer2MidOpacity = Number(layer2.style.getPropertyValue('opacity'))
  assert.ok(layer1MidOpacity >= 0 && layer1MidOpacity < 0.49, '旧图层应正在淡出，实际 ' + layer1MidOpacity)
  assert.ok(layer2MidOpacity > 0 && layer2MidOpacity < 0.49, '新图层应正在淡入，实际 ' + layer2MidOpacity)

  // 淡化完成：收尾是"把第二层扶正为主层"，全程不改位图（改全屏位图会重新栅格化，
  // 万一那一帧新位图还没就绪就是整屏背景消失一下 = 用户看到的白光）
  const layer2El = layer2
  dom.advance(600)
  assert.equal(dom.document.getElementById('__dshui-layer2'), null, '不再有第二层元素')
  assert.equal(layerOf(dom), layer2El, '应把第二层扶正为主层（而不是改第一层的图）')
  assert.match(
    String(layerOf(dom).style.getPropertyValue('background-image')),
    /img=deepseek%20/,
    '主层从淡化开始就画着新图，位图未被改写',
  )
  assert.equal(layerOf(dom).style.getPropertyValue('opacity'), '0.49', '完成后内联浓度应钉回目标')
})

test('切换模式淡入淡出：关闭→纹理 层淡入，纹理→关闭 先淡出再卸载', async () => {
  const dom = buildChatDom()
  const { api } = runClient(dom)
  await flush()

  // 关闭 → 纹理：层挂上后用 **JS 逐帧补间**淡入（不依赖 CSS transition ——
  // Chromium 对刚挂上的元素抑制过渡，这才是之前"没有渐变"的根因）。
  api.setMode('multiply')
  const layer = layerOf(dom)
  assert.ok(layer, '层应立即挂上')
  const inlineOpacity = Number(layer.style.getPropertyValue('opacity'))
  assert.ok(
    inlineOpacity >= 0 && inlineOpacity < 0.2,
    '淡入应从接近 0 的内联浓度起步（首帧同步钉透明），实际 ' + inlineOpacity,
  )
  assert.equal(layer.style.getPropertyValue('transition'), 'none', '补间期间应关掉 CSS 过渡避免拖尾')
  assert.equal(layer.classList.contains('is-faded'), false, '淡入不依赖透明钉类')
  assert.match(styleTagOf(dom).textContent, /transition:opacity 420ms ease/, '层的 CSS 过渡规则仍在（点背景/淡出用）')
  assert.match(styleTagOf(dom).textContent, /\.is-faded\{opacity:0 !important;\}/, '透明钉规则应在')
  assert.equal(api.status().transition.frostAnimating, true, '毛玻璃参数应正在补间淡入')
  dom.advance(600)
  assert.equal(api.status().transition.frostAnimating, false, '补间应已结束')
  assert.equal(dom.body.style.getPropertyValue('--dsniang-frost-alpha'), '0.2', '白层参数应淡入到目标')
  assert.equal(layer.style.getPropertyValue('opacity'), '0.49', '补间完成后浓度钉在层内联样式上')
  assert.equal(layer.style.getPropertyValue('transition'), '', '补间完成后内联过渡应清除（重新武装 CSS 过渡）')

  // 纹理 → 关闭：先整体淡出（层还在、处于透明态），动画结束才真正卸载
  api.setMode('off')
  assert.equal(api.status().mode, 'off')
  assert.ok(layerOf(dom), '淡出期间层应还在')
  assert.equal(layerOf(dom).classList.contains('is-faded'), true, '淡出期间层应处于透明态')
  assert.equal(api.status().transition.fadingOut, true, '应处于淡出待卸载状态')
  dom.advance(600)
  assert.equal(layerOf(dom), null, '淡出完成后层应移除')
  assert.equal(styleTagOf(dom), null, '淡出完成后样式应移除')
  assert.equal(api.status().transition.fadingOut, false)
  assert.equal(dom.body.style.getPropertyValue('--dsniang-frost-alpha'), '', '毛玻璃变量应清掉')
})

test('毛玻璃接管/归还卡片底色无缝（不闪白光）', async () => {
  const dom = buildChatDom()
  const { api } = runClient(dom)
  await flush()

  // 输入卡片原生底色 = rgba(255,255,255,0.85)；淡入必须从 0.85 起步而不是 0，
  // 否则接管瞬间卡片白底会"闪一下"。
  api.setMode('multiply')
  const startAlpha = Number(dom.body.style.getPropertyValue('--dsniang-frost-alpha'))
  assert.ok(startAlpha > 0.7 && startAlpha <= 0.85, '淡入应从卡片原生白底起步，实际 ' + startAlpha)
  dom.advance(600)
  assert.equal(dom.body.style.getPropertyValue('--dsniang-frost-alpha'), '0.2', '淡入到目标白层')

  // 淡出：补间回升到原生 0.85 才摘类 → 摘类瞬间原生白底无缝归还
  api.setMode('off')
  const fadingAlpha = Number(dom.body.style.getPropertyValue('--dsniang-frost-alpha'))
  assert.ok(fadingAlpha > 0.2 && fadingAlpha <= 0.85, '淡出应朝原生白底回升，实际 ' + fadingAlpha)
  dom.advance(600)
  assert.equal(dom.body.style.getPropertyValue('--dsniang-frost-alpha'), '', '摘类后变量清掉')
  assert.equal(dom.body.classList.contains('__dshui-frost'), false, '摘类完成')
})

test('淡出中途切回纹理：不卸载、直接淡回', async () => {
  const dom = buildChatDom()
  const { api } = runClient(dom)
  await flush()

  api.setMode('multiply')
  dom.advance(600) // 完成首次淡入

  api.setMode('off')
  assert.equal(api.status().transition.fadingOut, true)
  assert.ok(layerOf(dom), '淡出期间层应在')

  api.setMode('multiply') // 立刻切回
  assert.equal(api.status().transition.fadingOut, false, '切回后应取消淡出卸载')
  assert.equal(layerOf(dom).classList.contains('is-faded'), false, '层应立即放开透明钉（淡回）')
  dom.advance(600)
  assert.ok(layerOf(dom), '层应保留（没被卸载）')
  assert.equal(api.status().mode, 'multiply')
  assert.equal(dom.body.style.getPropertyValue('--dsniang-frost-alpha'), '0.2', '毛玻璃参数应补间回目标')
})

test('淡入淡出期间不碰页面布局样式', async () => {
  const dom = buildChatDom()
  const { api } = runClient(dom)
  await flush()
  api.setLayering(false) // 分层本身是有意为之的布局改动，先关掉再验护栏
  const before = layoutSnapshot(dom)

  api.setMode('multiply')
  api.setMode('off')
  assert.equal(layoutSnapshot(dom), before, '淡出淡入过程不得改页面布局样式')
  dom.advance(600)
  assert.equal(layoutSnapshot(dom), before, '淡出结束卸载后也不得留任何痕迹')
})

test('setScrim()：白色薄纱写进背景图叠层，可调可关', async () => {
  const dom = buildChatDom()
  const { api } = runClient(dom)
  await flush()
  api.setMode('multiply')

  const layerBg = () => String(layerOf(dom).style.getPropertyValue('background-image'))
  assert.equal(api.status().scrim, 0)
  assert.match(layerBg(), /url\(/, '薄纱与图都在层的内联背景上')

  assert.match(api.setScrim(0.2), /薄纱强度 = 0\.2/)
  assert.match(layerBg(), /linear-gradient\(rgba\(255,255,255,0\.2\),rgba\(255,255,255,0\.2\)\),url\(/)
  assert.equal(api.status().scrim, 0.2)

  api.setScrim(0)
  assert.match(layerBg(), /^url\(/, '清零后应回到纯图')
  // v0.6.2：上限与滑块/存档校验对齐成 0.9（以前 API 允许 1 → 存不下来，刷新后悄悄没了）
  assert.match(api.setScrim(5), /需在 0~0\.9/)
  assert.equal(api.status().scrim, 0, '越界值不生效')
  assert.match(api.setScrim(0.9), /薄纱强度 = 0\.9/)
})

test('静态样式表：换图 / 拖浓度 / 调薄纱都不会改写 <style>（防合成层重建闪白光）', async () => {
  const dom = buildChatDom()
  const images = [
    { name: 'deepseek 4k.png', label: 'deepseek', bytes: 11 },
    { name: 'deepseek 黑白无水面.png', label: 'deepseek 黑白无水面', bytes: 22 },
  ]
  const { api } = runClient(dom, { statusImages: images })
  await flush()
  api.setMode('multiply')
  dom.advance(600)

  const sheetBefore = styleTagOf(dom).textContent

  // 换图（走交叉淡化）——样式表一个字节都不许变
  const box = api.switcher()
  const target = box.querySelectorAll('[data-image-button]')[1]
  target._listeners.click[0]({ type: 'click', target, stopPropagation() {} })
  await flush()
  dom.advance(600)
  assert.equal(styleTagOf(dom).textContent, sheetBefore, '换图不得改写样式表')

  // 拖浓度、调薄纱同样不得改写
  api.setOpacity(0.22)
  api.setScrim(0.3)
  assert.equal(styleTagOf(dom).textContent, sheetBefore, '改浓度/薄纱不得改写样式表')
  assert.equal(layerOf(dom).style.getPropertyValue('opacity'), '0.22', '浓度应写在内联样式上')

  // 切「背景」模式同样不重写样式表（0.3.0）
  api.setMode('backdrop')
  dom.advance(600)
  assert.equal(styleTagOf(dom).textContent, sheetBefore, '切背景模式不得改写样式表')
  assert.match(
    layerOf(dom).style.getPropertyValue('background-image'),
    /bg\.png/,
    '背景模式下图走内联（含主题薄纱）',
  )
})

test('URL 覆盖：?dshui=multiply / ?dsniang=（旧名兼容）/ 非法值回落关闭', async () => {
  const mul = buildChatDom()
  const nw = buildChatDom()
  nw.window.location.href = 'http://localhost/?dshui=multiply'
  const rn = runClient(nw)
  await flush()
  assert.equal(rn.api.status().mode, 'multiply', '?dshui=multiply 应切到 multiply（新参数名）')
  const nw2 = buildChatDom()
  nw2.window.location.href = 'http://localhost/?dshui=0.15'
  const rn2 = runClient(nw2)
  await flush()
  assert.equal(rn2.api.status().mode, 'off', '新参数里的数字（旧 scrim 写法）非法 → 回落关闭')
  mul.window.location.href = 'http://localhost/?dsniang=multiply'
  const r1 = runClient(mul)
  await flush()
  assert.equal(r1.api.status().mode, 'multiply', '?dsniang=multiply 应切到 multiply')
  assert.equal(mul.window.localStorage.getItem('__dshui.mode'), 'multiply', '并记住偏好')

  const dim = buildChatDom()
  dim.window.location.href = 'http://localhost/?dsniang=0.15'
  const r2 = runClient(dim)
  await flush()
  assert.equal(r2.api.status().mode, 'off', '数字形式只调浓度、模式保持默认（关闭）')

  const bd = buildChatDom()
  bd.window.location.href = 'http://localhost/?dsniang=backdrop'
  const rBackdrop = runClient(bd)
  await flush()
  assert.equal(rBackdrop.api.status().mode, 'backdrop', '?dsniang=backdrop 应切到背景模式（0.3.0）')

  const bogus = buildChatDom()
  bogus.window.location.href = 'http://localhost/?dsniang=nonsense'
  const r3 = runClient(bogus)
  await flush()
  assert.equal(r3.api.status().mode, 'off', '非法值应回落到默认（关闭）')

  const behind = buildChatDom()
  behind.window.location.href = 'http://localhost/?dsniang=behind'
  const r5 = runClient(behind)
  await flush()
  assert.equal(r5.api.status().mode, 'off', '已移除的 behind 应回落到默认（关闭）')

  const img = buildChatDom()
  img.window.location.href = 'http://localhost/?img=' + encodeURIComponent('deepseek 黑白无水面.png')
  const r4 = runClient(img)
  await flush()
  assert.equal(
    img.window.localStorage.getItem('__dshui.image'),
    'deepseek 黑白无水面.png',
    '?img= 应被记住，并在启动时问宿主取这张图',
  )
})

test('非 DSH 页面：什么都不做', async () => {
  const dom = createDom() // 没有 #root
  const before = layoutSnapshot(dom)
  const { api } = runClient(dom)
  await flush()

  assert.equal(api.status().status, 'not-dsh')
  assert.equal(layerOf(dom), null, '不该挂层')
  assert.equal(styleTagOf(dom), null, '不该插样式')
  assert.equal(pillOf(dom), null, '非 DSH 页面不该出现入口')
  assert.equal(layoutSnapshot(dom), before)
})

test('#dsniang-off：即使被注入也直接不动作', async () => {
  const dom = buildChatDom()
  dom.window.location.hash = '#dsniang-off'
  const { api } = runClient(dom)
  await flush()

  assert.equal(api.status().mode, 'off')
  assert.equal(layerOf(dom), null)
  assert.equal(styleTagOf(dom), null)
  assert.equal(pillOf(dom), null, '应急开关下连入口都不出现')
  assert.equal(dom.window.localStorage.getItem('__dshui.mode'), 'off', '应记住关闭状态')
})

test('模式偏好会被记住（刷新后仍生效）', async () => {
  const dom = buildChatDom()
  const { api } = runClient(dom)
  await flush()
  api.setMode('multiply')
  assert.equal(dom.window.localStorage.getItem('__dshui.mode'), 'multiply')

  // 再跑一遍脚本 = 刷新
  const { api: api2 } = runClient(dom)
  await flush()
  assert.equal(api2.status().mode, 'multiply', '刷新后仍是 multiply')
})

test('诊断：文本可读、面板可开可关、点面板不触发恢复', async () => {
  const dom = buildChatDom()
  const { api } = runClient(dom)
  await flush()

  const text = api.diagnose()
  assert.match(text, /DSH UI Beautify v\d+\.\d+\.\d+/)
  assert.match(text, /模式: 关闭（off）/)

  const box = api.diag()
  assert.ok(box, '应开出诊断面板')
  assert.equal(box.parentNode, dom.body)
  clickOn(dom, box)
  assert.equal(api.status().override, false, '点诊断面板不该触发恢复')

  api.diag()
  assert.equal(dom.document.querySelectorAll('#__dshui-diag').length, 0, '再点一次应关闭')
})

test('背景图缺失：层仍在，但记录错误且不崩', async () => {
  const dom = buildChatDom()
  const { api } = runClient(dom, { statusPayload: { ok: false, error: 'bg missing' } })
  await flush()
  api.setMode('multiply')

  assert.ok(layerOf(dom), '图片不可用也不该影响挂载（会退回默认路径）')
  assert.equal(api.status().mode, 'multiply')
  assert.match(String(api.status().error || ''), /bg missing|状态接口/)
})

test('切换器面板：关闭 / 静态（纹理|背景）/ 动态 + 浓度滑块，操作后面板保持打开', async () => {
  const dom = buildChatDom()
  const { api } = runClient(dom)
  await flush()

  const box = api.switcher()
  assert.ok(box, '应开出切换器')
  assert.equal(box.parentNode, dom.body)
  assert.equal(dom.document.querySelectorAll('#__dshui-switcher').length, 1)

  // 顶层只有「关闭 / 静态 / 动态」三个分组按钮（0.8.22）
  const groups = box.querySelectorAll('[data-mode-group]')
  assert.deepEqual(groups.map((b) => b.getAttribute('data-mode-group')), ['off', 'static', 'dynamic'])
  assert.deepEqual(groups.map((b) => b.textContent), ['关闭', '静态', '动态'])
  const current = () => dom.document.getElementById('__dshui-switcher')

  // 点「静态」→ 默认进入纹理；面板重建后出现 纹理/背景 子按钮，面板保持打开
  const staticBtn = current().querySelectorAll('[data-mode-group]').find((b) => b.getAttribute('data-mode-group') === 'static')
  staticBtn._listeners.click[0]({ type: 'click', target: staticBtn, stopPropagation() {} })
  assert.equal(api.status().mode, 'multiply', '静态默认进入纹理')
  assert.equal(api.status().modeGroup, 'static')
  assert.equal(layerOf(dom).getAttribute('data-mode'), 'multiply')
  assert.equal(dom.window.localStorage.getItem('__dshui.mode'), 'multiply')
  assert.equal(dom.document.querySelectorAll('#__dshui-switcher').length, 1, '切模式后面板不应关闭')
  const staticButtons = current().querySelectorAll('[data-mode-button]')
  assert.deepEqual(staticButtons.map((b) => b.getAttribute('data-mode-button')), ['off', 'multiply', 'backdrop'])
  assert.deepEqual(staticButtons.map((b) => b.textContent), ['关闭', '纹理', '背景'])

  // 点「背景」→ 静态分组内切到 backdrop，面板仍开
  const backdropBtn = current().querySelectorAll('[data-mode-button]').find((b) => b.getAttribute('data-mode-button') === 'backdrop')
  backdropBtn._listeners.click[0]({ type: 'click', target: backdropBtn, stopPropagation() {} })
  assert.equal(api.status().mode, 'backdrop')
  assert.equal(layerOf(dom).getAttribute('data-mode'), 'backdrop')
  assert.equal(dom.document.querySelectorAll('#__dshui-switcher').length, 1, '切背景后面板不应关闭')

  // 再回到纹理，继续验证浓度/毛玻璃控件
  api.setMode('multiply')

  // 纹理模式下有浓度滑块；拖到 0.2 应生效且面板不关
  const slider = dom.document.querySelectorAll('[data-opacity-slider]')[0]
  assert.ok(slider, '纹理模式下应有浓度滑块')
  assert.match(api.setOpacity(0.2), /浓度 = 0\.2/)
  assert.equal(api.status().opacity, 0.2, '浓度应更新到纹理模式')
  assert.equal(dom.document.querySelectorAll('#__dshui-switcher').length, 1, '调浓度后面板也不应关闭')

  // 纹理模式下有毛玻璃三件套：开关 + 模糊 + 雾度（分层开关已按用户要求移除）
  const frostToggle = dom.document.querySelectorAll('[data-frost-toggle]')[0]
  const frostSlider = dom.document.querySelectorAll('[data-frost-slider]')[0]
  const frostAlpha = dom.document.querySelectorAll('[data-frost-alpha-slider]')[0]
  assert.ok(frostToggle, '应有毛玻璃开关')
  assert.ok(frostSlider, '应有模糊滑块')
  assert.ok(frostAlpha, '应有雾度滑块')
  assert.equal(frostToggle.textContent, '毛玻璃：开', '默认应为开')
  assert.equal(frostSlider.value, '2', '默认模糊 2px（作者实机取值）')
  assert.equal(frostAlpha.value, '0.2', '默认白层 0.2（更淡）')
  assert.equal(
    dom.document.querySelectorAll('[data-frost-layer-toggle]').length,
    0,
    '面板不应再有「分层」开关（程序内保持开启）',
  )

  // 二级面板专用：白层竖向渐变的两端（用户要自己拖）
  assert.ok(dom.document.querySelectorAll('[data-panel-top-slider]')[0], '应有「面板白层上」滑块')
  assert.ok(dom.document.querySelectorAll('[data-panel-bottom-slider]')[0], '应有「面板白层下」滑块')
  assert.equal(api.status().frost.layered, true, '分层应保持开启')

  // 拖模糊滑块 → body 变量更新，面板不关
  frostSlider.value = '26'
  frostSlider._listeners.input[0]({ type: 'input', target: frostSlider, stopPropagation() {} })
  assert.equal(api.status().frost.blur, 26)
  assert.equal(dom.body.style.getPropertyValue('--dsniang-frost-blur'), '26px')
  assert.equal(dom.document.querySelectorAll('#__dshui-switcher').length, 1, '拖毛玻璃滑块后面板不应关闭')

  // 点开关 → 关掉毛玻璃（先淡出，动画结束后卡片类移除、面板仍在）
  frostToggle._listeners.click[0]({ type: 'click', target: frostToggle, stopPropagation() {} })
  assert.equal(api.status().frost.enabled, false, '毛玻璃应关闭')
  assert.equal(dom.composerWrap.classList.contains('__dshui-frost-surface'), true, '淡出期间标记应还在')
  dom.advance(600)
  assert.equal(dom.composerWrap.classList.contains('__dshui-frost-surface'), false, '淡出完成后卡片标记应清除')
  assert.equal(dom.document.querySelectorAll('#__dshui-switcher').length, 1, '开关后面板不应关闭')

  // 点「背景」→ 切到 backdrop（图垫底），面板不关
  const backdropBtn2 = current()
    .querySelectorAll('[data-mode-button]')
    .find((b) => b.getAttribute('data-mode-button') === 'backdrop')
  backdropBtn2._listeners.click[0]({ type: 'click', target: backdropBtn2, stopPropagation() {} })
  assert.equal(api.status().mode, 'backdrop', '点背景应切到 backdrop')
  assert.equal(layerOf(dom).getAttribute('data-mode'), 'backdrop')
  assert.equal(dom.document.querySelectorAll('#__dshui-switcher').length, 1, '切背景后面板不应关闭')

  // 点「关闭」→ 先淡出，动画结束后恢复默认
  const off = current()
    .querySelectorAll('[data-mode-group]')
    .find((b) => b.getAttribute('data-mode-group') === 'off')
  off._listeners.click[0]({ type: 'click', target: off, stopPropagation() {} })
  assert.equal(api.status().mode, 'off')
  assert.ok(layerOf(dom), '淡出期间层应还在')
  dom.advance(600)
  assert.equal(layerOf(dom), null, '关闭后不该留层')
})

test('顶层分组（0.8.22）：关闭 / 静态 / 动态，静态记忆纹理|背景，动态持久化', async () => {
  const dom = buildChatDom()
  const { api } = runClient(dom)
  await flush()
  assert.equal(api.status().modeGroup, 'off', '默认关闭')
  assert.equal(api.setGroup('static'), '静态 · 纹理')
  assert.equal(api.status().modeGroup, 'static')
  assert.equal(api.status().mode, 'multiply', '静态默认纹理')
  assert.equal(dom.window.localStorage.getItem('__dshui.group.v1'), 'static')
  api.setMode('backdrop')
  assert.equal(api.status().mode, 'backdrop')
  assert.equal(api.status().modeGroup, 'static', '背景属于静态分组')
  assert.equal(api.setGroup('dynamic'), '动态 · 开发中')
  assert.equal(api.status().modeGroup, 'dynamic')
  assert.equal(api.status().mode, 'backdrop', '动态暂复用最后一次静态模式')
  assert.ok(dom.body.classList.contains('__dshui-dynamic'), '动态分组要加 body 类')
  assert.equal(pillText(dom), 'DSH UI · 动态 · 开发中')
  assert.equal(dom.window.localStorage.getItem('__dshui.group.v1'), 'dynamic')
  api.setMode('multiply')
  assert.equal(api.status().modeGroup, 'static')
  assert.equal(dom.body.classList.contains('__dshui-dynamic'), false)

  // 刷新/重启后动态分组要恢复（内部模式沿用最后静态模式）
  const dom2 = buildChatDom()
  dom2.window.localStorage.setItem('__dshui.group.v1', 'dynamic')
  dom2.window.localStorage.setItem('__dshui.mode', 'multiply')
  const b = runClient(dom2)
  await flush()
  assert.equal(b.api.status().modeGroup, 'dynamic')
  assert.equal(b.api.status().mode, 'multiply', '动态组用保存的静态模式做底')
  assert.ok(dom2.body.classList.contains('__dshui-dynamic'))
})

test('动态定位锚点（0.8.22）：四个锚点可保存/重置，面板可开定位工具', async () => {
  const dom = buildChatDom()
  const { api } = runClient(dom)
  await flush()
  const def = api.anchors.get()
  assert.deepEqual(Object.keys(def), ['bg', 'bubble', 'thinkA', 'thinkB'])
  assert.equal(def.bg.x, 0.5)

  api.anchors.set('bg', 0.25, 0.75)
  api.anchors.set('bubble', 0.8, 0.2)
  const saved = api.anchors.save()
  assert.equal(saved.bg.x, 0.25)
  assert.equal(saved.bubble.y, 0.2)
  const raw = JSON.parse(dom.window.localStorage.getItem('__dshui.dynamic.anchors.v1'))
  assert.equal(raw.bg.x, 0.25)
  assert.equal(raw.thinkA.y, 0.34)

  assert.equal(api.setGroup('dynamic'), '动态 · 开发中')
  api.switcher()
  assert.ok(dom.document.querySelector('[data-dynamic-import]'), '动态分组面板应有导入分镜按钮')
  assert.ok(dom.document.querySelector('[data-dynamic-reset]'), '动态分组面板应有恢复默认分镜按钮')
  assert.ok(dom.document.querySelector('[data-dynamic-preview]'), '动态分组面板应有预览思考态按钮')

  const reset = api.anchors.reset()
  assert.equal(reset.bg.x, 0.5, '重置回默认')
  const raw2 = JSON.parse(dom.window.localStorage.getItem('__dshui.dynamic.anchors.v1'))
  assert.equal(raw2.bg.x, 0.5)
})

test('动态参考线（0.8.23）：实时预览四锚点影响，可开关，离开动态自动移除', async () => {
  const dom = buildChatDom()
  const { api } = runClient(dom)
  await flush()
  assert.equal(api.setGroup('dynamic'), '动态 · 开发中')
  assert.equal(api.status().dynamicGuides, false)
  assert.equal(api.anchors.showGuides(true), true)
  assert.ok(dom.document.getElementById('__dshui-anchor-guides'), '参考线浮层应出现')
  assert.ok(dom.document.querySelector('.__dshui-guide-ghost'), '输入气泡幽灵预览应出现')
  assert.ok(dom.document.querySelectorAll('.__dshui-guide-ring').length >= 2, '背景脉冲应出现')
  assert.ok(dom.document.querySelectorAll('.__dshui-guide-line').length >= 1, '思考链/气泡连线应出现')
  assert.equal(api.status().dynamicGuides, true)
  assert.equal(dom.window.localStorage.getItem('__dshui.dynamic.guides.v1'), '1')
  api.switcher()
  assert.ok(dom.document.querySelector('[data-dynamic-import]'), '动态面板应有分镜导入入口')
  api.setGroup('static')
  assert.equal(dom.document.getElementById('__dshui-anchor-guides'), null, '离开动态应移除参考线')
})

test('动态分镜（0.8.24）：思考链出现→真实元素重排，正式输出→恢复普通布局', async () => {
  const dom = buildChatDom()
  const { api } = runClient(dom)
  await flush()
  assert.equal(api.setGroup('dynamic'), '动态 · 开发中')
  const doc = dom.document
  const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height })
  const make = (attrs, box, text) => {
    const el = doc.createElement('div')
    for (const k of Object.keys(attrs)) el.setAttribute(k, attrs[k])
    el._rect = rect(box[0], box[1], box[2], box[3])
    if (text) el.textContent = text
    doc.body.appendChild(el)
    return el
  }
  const transcript = doc.createElement('div')
  transcript.className = 'Dc7zOa_viewArea'
  transcript._rect = rect(300, 120, 1800, 1150)
  doc.body.appendChild(transcript)
  const user = make({ 'data-chat-flow-key': 'u1', 'data-chat-flow-kind': 'user' }, [620, 420, 300, 70], 'hi')
  const stepWrap = make({ 'data-chat-flow-key': 's1', 'data-chat-flow-kind': 'assistant-step' }, [380, 190, 560, 320])
  const step = doc.createElement('div')
  step.setAttribute('data-step-process', '')
  step._rect = rect(380, 190, 560, 260)
  stepWrap.appendChild(step)

  api.dynamic.evaluate()
  const thinking = api.status().dynamic
  assert.equal(thinking.phase, 'thinking', '有思考链应进入思考阶段')
  assert.equal(thinking.cinematic, true, '思考中应进入分镜态')
  assert.ok(thinking.layout && thinking.layout.phases.thinking.backgroundTransform.scale > 1, '应加载三阶段分镜布局')
  const composer = dom.document.querySelector('[data-composer-card]')
  assert.ok(composer, '应有输入卡片')
  // 自动模式先只动壁纸，真实界面位移只在预览里执行（防流式抖动）
  const layer = dom.document.getElementById('__dshui-layer')
  assert.ok(layer, '应挂壁纸层')
  assert.ok(String(layer.style.getPropertyValue('transform')).includes('scale('), '自动思考应放大壁纸')
  assert.equal(composer.style.getPropertyValue('transform'), '', '自动思考不应动真实输入卡片')
  assert.equal(transcript.style.getPropertyValue('transform'), '', '自动思考不应动真实消息区')

  // 正式回复出现 = 开始输出：立刻恢复普通布局
  make({ 'data-chat-flow-key': 'r1' }, [380, 300, 620, 420], 'answer')
  api.dynamic.evaluate()
  const output = api.status().dynamic
  assert.equal(output.phase, 'output', '出现正式回复应进入输出阶段')
  assert.equal(output.cinematic, false, '输出开始应恢复普通布局')
  assert.equal(composer.style.getPropertyValue('transform'), '', '输入卡片 transform 应被还原 (输出)')
  assert.equal(transcript.style.getPropertyValue('transform'), '', '消息区 transform 应被还原 (输出)')

  // 预览开关：不依赖真实对话也能看分镜效果
  api.dynamic.preview(true)
  assert.equal(api.status().dynamic.cinematic, true, '预览思考态应进入分镜')
  assert.ok(dom.document.getElementById('__dshui-dynamic-preview'), '预览应出现消息区/输入卡片示意框')
  assert.ok(String(composer.style.getPropertyValue('transform')).includes('scale('), '预览时输入卡片应被真实 transform')
  assert.ok(String(transcript.style.getPropertyValue('transform')).includes('scale('), '预览时消息区整块应被真实 transform')
  assert.ok(dom.document.getElementById('__dshui-dynamic-cinema'), '预览应出现暗角')
  api.dynamic.preview(false)
  assert.equal(api.status().dynamic.cinematic, false, '结束预览应恢复')
  assert.equal(dom.document.getElementById('__dshui-dynamic-preview'), null, '结束预览应移除示意框')

  // 分镜导入 / 恢复默认
  const tiny = { phases: { thinking: { backgroundTransform: { x: 10, y: 20, scale: 2 }, boxes: [] } } }
  api.dynamic.importLayout(JSON.stringify(tiny))
  assert.equal(api.status().dynamic.layout.phases.thinking.backgroundTransform.scale, 2, '导入后应使用新分镜')
  api.dynamic.resetLayout()
  assert.ok(api.status().dynamic.layout.phases.thinking.backgroundTransform.scale > 1, '恢复默认分镜后应回到内置布局')
})

test('切换器面板：点它不会触发背景恢复', async () => {
  const dom = buildChatDom()
  const { api } = runClient(dom)
  await flush()
  api.setMode('multiply')
  const box = api.switcher()
  clickOn(dom, box)
  assert.equal(api.status().override, false, '点切换器面板不该算"点背景"')
})

test('面板：任何操作后面板都不能乱窜（重建后仍贴在胶囊下方）', async () => {
  const images = [
    { name: 'deepseek 4k.png', label: 'deepseek', bytes: 11 },
    { name: 'deepseek 黑白无水面.png', label: 'deepseek 黑白无水面', bytes: 22 },
  ]
  const dom = buildChatDom()
  // 胶囊被拖到自定义位置：面板必须跟着它，而不是回到默认的 12/52
  dom.window.localStorage.setItem('__dshui.pill', JSON.stringify({ left: 300, top: 120 }))
  const { api } = runClient(dom, { statusImages: images })
  await flush()

  const current = () => dom.document.getElementById('__dshui-switcher')
  const at = () => [
    current().style.getPropertyValue('left'),
    current().style.getPropertyValue('top'),
  ]
  assert.equal(pillOf(dom).style.getPropertyValue('left'), '300px', '胶囊应在记录的位置')

  const box = api.switcher()
  assert.ok(box, '应开出面板')
  assert.deepEqual(at(), ['300px', '162px'], '开面板时应贴在胶囊下方（300, 120+42）')

  // ① 点「静态」分组 → 面板就地重建，位置不许动
  const staticBtn = box
    .querySelectorAll('[data-mode-group]')
    .find((b) => b.getAttribute('data-mode-group') === 'static')
  staticBtn._listeners.click[0]({ type: 'click', target: staticBtn, stopPropagation() {} })
  assert.deepEqual(at(), ['300px', '162px'], '切分组后面板不得跳位置')

  // ② 开关毛玻璃 → 同样会重建面板
  const frostToggle = dom.document.querySelectorAll('[data-frost-toggle]')[0]
  frostToggle._listeners.click[0]({ type: 'click', target: frostToggle, stopPropagation() {} })
  assert.deepEqual(at(), ['300px', '162px'], '开关毛玻璃后面板不得跳位置')

  // ③ 换图（重建面板 + 交叉淡化）也不许跳
  const imageBtn = current().querySelectorAll('[data-image-button]')[1]
  imageBtn._listeners.click[0]({ type: 'click', target: imageBtn, stopPropagation() {} })
  await flush()
  assert.deepEqual(at(), ['300px', '162px'], '换图后面板不得跳位置')

  // ④ 重新开一次面板仍在原处
  api.switcher() // 关
  const reopened = api.switcher() // 再开
  assert.deepEqual([reopened.style.getPropertyValue('left'), reopened.style.getPropertyValue('top')], [
    '300px',
    '162px',
  ], '重新打开也应贴在胶囊下方')
})

test('动效底座（0.7.0）：总开关默认关，面板/快捷键/存档/系统减弱动态/失焦都要能控', async () => {
  const dom = buildChatDom()
  const { api } = runClient(dom)
  await flush()

  // 默认关（灰度）
  assert.equal(api.status().motion.enabled, false, '动效总开关默认关')
  assert.match(api.diagnose(), /动效: 关/, '诊断要看得见「动效: 关」')
  assert.equal(api.setMotion(true), '动效：开')
  assert.equal(api.status().motion.enabled, true)
  assert.equal(JSON.parse(dom.window.localStorage.getItem('__dshui.motion.v1')).enabled, true, '开关要存档')

  // 面板上的开关（在两种模式的面板里都要有）
  api.setMode('multiply')
  api.switcher()
  let toggle = dom.document.querySelectorAll('[data-motion-toggle]')[0]
  assert.ok(toggle, '纹理模式面板要有动效开关')
  assert.equal(toggle.textContent, '动效：开')
  toggle._listeners.click[0]({ type: 'click', target: toggle, stopPropagation() {} })
  assert.equal(api.status().motion.enabled, false, '点一下 = 关')
  assert.equal(JSON.parse(dom.window.localStorage.getItem('__dshui.motion.v1')).enabled, false, '关闭也要存档')

  // 快捷键 Ctrl+Shift+Alt+M
  const press = (key) => {
    const event = {
      type: 'keydown',
      key,
      ctrlKey: true,
      shiftKey: true,
      altKey: true,
      preventDefault() {},
      stopPropagation() {},
    }
    dom.document.dispatchEvent(event)
  }
  press('M')
  assert.equal(api.status().motion.enabled, true, 'Ctrl+Shift+Alt+M = 开')
  press('M')
  assert.equal(api.status().motion.enabled, false, '再按一次 = 关')

  // 存档读回（刷新后仍开）
  const next = buildChatDom()
  next.window.localStorage.setItem('__dshui.motion.v1', JSON.stringify({ enabled: true }))
  const two = runClient(next)
  await flush()
  assert.equal(two.api.status().motion.enabled, true, '刷新后读回开关')
  assert.equal(two.api.setMotion(false), '动效：关', 'API 也要能关')

  // 系统「减弱动态效果」
  const mq = dom.window.matchMedia('(prefers-reduced-motion: reduce)')
  mq.matches = true
  mq.dispatchChange()
  assert.equal(api.status().motion.reduced, true, '系统减弱动态 → reduced')
  assert.match(api.diagnose(), /系统减弱动态/, '诊断要看得见')

  // 失焦 / 回焦
  dom.window._listeners.blur[0]()
  assert.equal(api.status().motion.paused, true, '失焦 → 暂停')
  dom.window._listeners.focus[0]()
  assert.equal(api.status().motion.paused, false, '回焦 → 恢复')

  // visibilitychange（隐藏 = 暂停）
  dom.document.hidden = true
  dom.document._listeners.visibilitychange[0]()
  assert.equal(api.status().motion.paused, true, '隐藏 → 暂停')
  dom.document.hidden = false
  dom.document._listeners.visibilitychange[0]()
  assert.equal(api.status().motion.paused, false, '回到可见 → 恢复')
})

test('帧时间探针（0.7.0）：只在有动画时采样，能报 fps/P95/掉帧/长帧，结束就停', async () => {
  const dom = buildChatDom()
  const { api } = runClient(dom)
  await flush()
  api.setMotion(true) // 验收动画时开关是开着的（关闭时诊断行不展开帧率）

  // 没动画 → 不采样
  assert.equal(api.status().motion.animating, false)
  assert.equal(api.status().motion.fps, 0)

  // 切到纹理：图层淡入 + 毛玻璃补间 = 两个动画在跑 → 探针开始
  api.setMode('multiply')
  assert.equal(api.status().motion.animating, true, '有动画就要开始采样')
  for (let i = 0; i < 40; i++) dom.advance(16) // 40 帧 × 16ms：补间 420ms 走完
  assert.equal(api.status().motion.animating, false, '动画结束 → 停采样（不空转）')
  assert.equal(api.status().motion.fps, 63, '16ms/帧 → 约 63fps（62.5 四舍五入）')
  assert.equal(api.status().motion.frameMsP95, 16, 'P95 = 16ms')
  assert.equal(api.status().motion.dropped, 0, '均匀帧不该有掉帧')
  assert.equal(api.status().motion.longFrames, 0)
  assert.match(api.diagnose(), /动效: 开/, '诊断要看得见开关状态')

  // 关掉模式：淡出补间在跑时来一帧 80ms 的卡顿 → 掉帧 + 长帧
  api.setMode('off')
  dom.advance(16) // 第一帧只用来立基准（探针每轮开始的第一帧没有"上一帧"可比）
  dom.advance(80) // 一帧 80ms（补间里同时走 5 步 16ms 的 setTimeout，但 rAF 只算一帧）
  const janky = api.status().motion
  assert.equal(janky.longFrames >= 1, true, '80ms 帧要记成长帧')
  assert.equal(janky.dropped >= 1, true, '80ms 帧要记成掉帧')
  dom.advance(600)
  assert.equal(api.status().motion.animating, false, '淡出结束 → 探针停')
  assert.match(api.diagnose(), /上次 63fps/, '停采样后保留上次读数（样本不够不覆盖）')
  assert.match(api.diagnose(), /长帧 1/, '诊断里要看得到长帧次数')
})

test('变更风暴熔断（0.7.1）：高频批次不再每次都跑全文档补标（界面卡死的根因）', async () => {
  const dom = buildChatDom()
  const { api } = runClient(dom)
  await flush()
  api.setMode('backdrop') // 背景模式：补标里还包含"聊天内代码块/文件卡片"的全文档扫描
  dom.advance(600)

  const body = dom.document.body
  const jitter = []
  for (let i = 0; i < 60; i++) jitter.push(dom.document.createElement('div'))
  // 一次性插入（一个批次，含元素 → 允许补标一次）
  for (const el of jitter) body.appendChild(el)
  dom.flushMutations()
  // 之后逐个移除 = 60 个"只有移除、没有新元素"的批次（模拟流式输出那种高频批次）
  for (const el of jitter) {
    body.removeChild(el)
    dom.flushMutations()
  }

  const perf = api.status().perf
  assert.ok(perf, '状态里要有 perf 段')
  assert.equal(perf.storm, true, '一秒内 60+ 批 → 应该进低功耗')
  assert.ok(perf.skipped >= 50, `纯移除的批次应被跳过补标（实际 ${perf.skipped}）`)
  assert.match(api.diagnose(), /性能: 变更 \d+ 批\/秒/, '诊断面板要有「性能」这一行')
  assert.match(api.diagnose(), /低功耗/, '低功耗时诊断要说清楚')
})

test('变更风暴熔断（0.7.1）不会挡掉正常路径：新出现的面板仍然立刻贴玻璃', async () => {
  const dom = buildChatDom()
  const { api } = runClient(dom)
  await flush()
  api.setMode('multiply')
  dom.advance(600)

  const whaleMenu = dom.document.createElement('div')
  whaleMenu.className = 'dshwv-menu'
  dom.document.body.appendChild(whaleMenu)
  dom.flushMutations()

  assert.ok(
    whaleMenu.classList.contains('__dshui-frost-panel'),
    '新出现的鲸鱼面板要立刻带上玻璃类（0.7.1 的批次闸门只挡"没有新元素"的批次）',
  )
})

test('存储迁移（更名兼容）：旧前缀 __dsniang.* 自动复制到 __dshui.*，旧键保留', async () => {
  const dom = buildChatDom()
  // 模拟 0.7.x（旧名 dsh-dsniang-beautify）留下的设置
  dom.window.localStorage.setItem('__dsniang.mode', 'multiply')
  dom.window.localStorage.setItem('__dsniang.frost.v3', JSON.stringify({ enabled: true, blur: 9 }))
  dom.window.localStorage.setItem('__dsniang.motion.v1', JSON.stringify({ enabled: true }))

  const { api } = runClient(dom)
  await flush()

  // 新前缀被写入，且内容一致
  assert.equal(dom.window.localStorage.getItem('__dshui.mode'), 'multiply', '模式要迁移到新前缀')
  assert.equal(JSON.parse(dom.window.localStorage.getItem('__dshui.frost.v3')).blur, 9, '毛玻璃参数要迁移')
  assert.equal(JSON.parse(dom.window.localStorage.getItem('__dshui.motion.v1')).enabled, true, '动效开关要迁移')
  // 旧键保留（便于回滚到 0.7.x）
  assert.equal(dom.window.localStorage.getItem('__dsniang.mode'), 'multiply', '旧键要保留')
  // 迁移计数进状态与诊断
  assert.equal(api.status().storageMigrated, 3, '应报告迁移了 3 个键')
  assert.match(api.diagnose(), /存储: 已从旧版迁移 3 项/)

  // 二次启动：新键已存在 → 不覆盖、不再重复迁移
  const dom2 = buildChatDom()
  dom2.window.localStorage.setItem('__dsniang.mode', 'off')
  dom2.window.localStorage.setItem('__dshui.mode', 'multiply')
  const two = runClient(dom2)
  await flush()
  assert.equal(dom2.window.localStorage.getItem('__dshui.mode'), 'multiply', '新键优先，旧键不覆盖')
  assert.equal(two.api.status().storageMigrated, 0, '没有需要迁移的键 → 0')
  assert.match(two.api.diagnose(), /存储: 无需迁移/)
})


const splashOf = (dom) => dom.document.getElementById('__dshui-splash')
/** 给开屏 iframe 派发一条「父窗口」消息（桩里直接调 window 的 message 监听）。 */
function fireSplashMessage(dom, data) {
  const listeners = (dom.window._listeners && dom.window._listeners.message) || []
  for (const handler of listeners.slice()) handler({ data })
}

test('开屏动画（0.8.0）：默认挂载同源 iframe，播完自动淡出移除，零残留', async () => {
  const dom = buildChatDom()
  const before = layoutSnapshot(dom)
  const { api } = runClient(dom, { splash: true })
  await flush()
  const node = splashOf(dom)
  assert.ok(node, '默认应挂载开屏覆盖层')
  const frame = node.querySelector('iframe')
  assert.ok(frame, '覆盖层里应是 iframe（样式隔离，不碰页面 CSS）')
  assert.match(String(frame.src), /\/dsh-ui-beautify\/splash\.html\?v=[\d.]+&cfg=/, '地址带版本号和配置')
  assert.equal(api.status().splash.status, 'playing', '状态应为播放中')
  assert.match(api.diagnose(), /开屏: 播放中/, '诊断里要有开屏行')
  assert.equal(layoutSnapshot(dom), before, '开屏层不能改变页面已有元素的布局样式')
  fireSplashMessage(dom, { __dshuiSplash: 'done' })
  assert.equal(api.status().splash.status, 'done')
  dom.advance(500)
  assert.equal(splashOf(dom), null, '淡出后应把节点摘干净')
  assert.match(api.diagnose(), /开屏: 已播放完/)
  assert.equal(layoutSnapshot(dom), before, '移除后页面仍与之前一致')
})

const splashCfgOf = (dom) => {
  const node = dom.document.getElementById('__dshui-splash')
  const frame = node && node.querySelector('iframe')
  const m = frame && /&cfg=([^&]+)/.exec(String(frame.src))
  return m ? JSON.parse(decodeURIComponent(m[1])) : null
}

test('开屏动画音效（0.8.0）：默认开、配置传给开屏页、面板可关可持久化', async () => {
  const dom = buildChatDom()
  const { api } = runClient(dom, { splash: true })
  await flush()
  assert.equal(api.status().splash.sound, true, '音效默认开')
  assert.equal(splashCfgOf(dom).sound, true, '配置里应带 sound:true')
  assert.ok(
    ['fit', 'scramble'].indexOf(splashCfgOf(dom).titleMode) !== -1,
    '每次播放应随机选 fit / scramble',
  )
  assert.match(api.diagnose(), /音效开/)
  // 关掉 → 持久化 → 重播时新配置生效
  assert.equal(api.splash.setSound(false), false)
  const saved = JSON.parse(dom.window.localStorage.getItem('__dshui.splash.v1'))
  assert.equal(saved.sound, false, '音效开关要持久化')
  fireSplashMessage(dom, { __dshuiSplash: 'done' })
  dom.advance(600)
  api.splash.replay()
  assert.equal(splashCfgOf(dom).sound, false, '重播时按新开关传配置')
  api.splash.setSound(true)
  assert.equal(api.status().splash.sound, true)
})

test('开屏动画：设置里关闭 / ?splash=0 / 减弱动态 都不播放', async () => {
  const off = buildChatDom()
  off.window.localStorage.setItem('__dshui.splash.v1', JSON.stringify({ enabled: false }))
  const a = runClient(off, { splash: true })
  await flush()
  assert.equal(splashOf(off), null, '关闭时不该挂载')
  assert.equal(a.api.status().splash.status, 'disabled')

  const urlOff = buildChatDom()
  urlOff.window.location.href = 'http://localhost/?splash=0'
  runClient(urlOff, { splash: true })
  await flush()
  assert.equal(splashOf(urlOff), null, '?splash=0 不该挂载')

  const reduced = buildChatDom()
  reduced.window.matchMedia('(prefers-reduced-motion: reduce)').matches = true
  const c2 = runClient(reduced, { splash: true })
  await flush()
  assert.equal(splashOf(reduced), null, 'prefers-reduced-motion 时不该挂载')
  assert.equal(c2.api.status().splash.status, 'reduced')
})

test('开屏动画：30s 没等到结束信号→超时兜底；重播/跳过/卸载都清干净', async () => {
  const dom = buildChatDom()
  const { api } = runClient(dom, { splash: true })
  await flush()
  assert.ok(splashOf(dom), '先确认已挂载')
  dom.advance(30000)
  assert.equal(api.status().splash.status, 'timeout', '超时应兜底揭幕')
  dom.advance(600)
  assert.equal(splashOf(dom), null, '超时后也要移除')

  api.splash.replay()
  assert.ok(splashOf(dom), 'replay() 应重新挂载')
  fireSplashMessage(dom, { __dshuiSplash: 'skip' })
  assert.equal(api.status().splash.status, 'skipped')
  dom.advance(600)
  assert.equal(splashOf(dom), null, '跳过也应移除')

  api.splash.replay()
  api.uninstall()
  assert.equal(splashOf(dom), null, 'uninstall() 必须把开屏节点清掉')
})

test('开屏动画：面板里可以关/开，并写进 localStorage', async () => {
  const dom = buildChatDom()
  const { api } = runClient(dom, { splash: true })
  await flush()
  fireSplashMessage(dom, { __dshuiSplash: 'done' })
  dom.advance(600)
  const pill = pillOf(dom)
  pill._listeners.click[0]({ type: 'click', target: pill, stopPropagation() {} })
  const box = dom.document.querySelectorAll('#__dshui-switcher')[0]
  assert.ok(box, '面板应打开')
  const toggle = box.querySelector('[data-splash-toggle]')
  assert.ok(toggle, '面板里应有开屏动画开关')
  toggle._listeners.click[0]({ type: 'click', target: toggle, stopPropagation() {} })
  assert.equal(api.status().splash.enabled, false, '点一下应关闭')
  const saved = JSON.parse(dom.window.localStorage.getItem('__dshui.splash.v1'))
  assert.equal(saved.enabled, false, '开关状态要持久化')
  assert.match(api.diagnose(), /开屏: (已关闭|已跳过)/)
  const box2 = dom.document.querySelectorAll('#__dshui-switcher')[0]
  const toggle2 = box2.querySelector('[data-splash-toggle]')
  toggle2._listeners.click[0]({ type: 'click', target: toggle2, stopPropagation() {} })
  assert.equal(api.status().splash.enabled, true, '再点应打开')
})


const restartButtonOf = (dom) => {
  // 按钮在 shadow DOM 里：document 查询看不到（与真实浏览器一致），要走 shadowRoot
  const host = dom.document.querySelector('[data-windows-menu]')
  const bar = host && host.shadowRoot && host.shadowRoot.querySelector('[role="menubar"]')
  return (bar && bar.querySelectorAll('[data-dshui-restart-button]')[0]) || null
}
function clickRestartButton(dom) {
  const button = restartButtonOf(dom)
  assert.ok(button, '应先注入「重启」按钮')
  const listeners = button._listeners.click || []
  assert.ok(listeners.length > 0, '按钮应有 click 监听')
  for (const handler of listeners.slice()) handler({ preventDefault() {}, stopPropagation() {} })
}

test('重启键（0.8.0）：桌面壳里往菜单栏「应用」「编辑」后面注入「重启」按钮', async () => {
  const dom = buildChatDom()
  const menu = attachWindowsMenu(dom)
  const { api } = runClient(dom)
  await flush()
  const button = restartButtonOf(dom)
  assert.ok(button, '应注入「重启」按钮')
  assert.equal(menu.bar.childNodes[menu.bar.childNodes.length - 1], button, '按钮应排在「应用」「编辑」之后')
  assert.equal(button.getAttribute('role'), 'menuitem')
  assert.equal(button.textContent, 'Restart', '默认语言（非 zh）显示英文')
  const snap = api.status().restart
  assert.equal(snap.desktop, true)
  assert.equal(snap.installed, true)
  assert.equal(snap.bridge, 'missing', '壳补丁未装时桥应为 missing')
  assert.match(api.diagnose(), /重启: 按钮已注入/)
  assert.match(api.diagnose(), /壳补丁缺失/)
})

test('重启键：中文页面显示「重启」；壳补丁可用时点击 → window.dshDesktop.restart()', async () => {
  const dom = buildChatDom()
  attachWindowsMenu(dom, { lang: 'zh-CN' })
  let calls = 0
  dom.window.dshDesktop = {
    restart() {
      calls += 1
      return Promise.resolve({ ok: true })
    },
  }
  const { api } = runClient(dom)
  await flush()
  const button = restartButtonOf(dom)
  assert.equal(button.textContent, '重启')
  assert.equal(api.status().restart.bridge, 'available')
  clickRestartButton(dom)
  assert.equal(calls, 1, '点击应调用桥')
  assert.equal(api.status().restart.busy, true, '点击后进入「重启中…」')
  assert.equal(restartButtonOf(dom).textContent, '重启中…')
  await flush()
  // ok:true = 主进程已安排 relaunch：设计上保持「重启中…」直到窗口关闭；10s 超时兜底才会恢复
  assert.equal(api.status().restart.busy, true, 'ok 后保持重启中（窗口即将关闭）')
  dom.advance(10000)
  assert.equal(api.status().restart.busy, false, '超时兜底恢复')
})

test('重启键：壳补丁缺失时点击给明确提示（不静默失败）', async () => {
  const dom = buildChatDom()
  attachWindowsMenu(dom, { lang: 'zh-CN' })
  const { api } = runClient(dom)
  await flush()
  clickRestartButton(dom)
  const toast = dom.document.querySelectorAll('[data-dshui-restart-toast]')[0]
  assert.ok(toast, '应弹出提示浮层')
  assert.match(toast.textContent, /桌面壳补丁/)
  assert.equal(api.status().restart.lastError, 'missing-shell-patch')
})

test('重启键：面板里有「↻ 重启 DSH」入口；卸载会摘掉按钮与提示', async () => {
  const dom = buildChatDom()
  const menu = attachWindowsMenu(dom, { lang: 'zh-CN' })
  const { api, requested } = runClient(dom)
  await flush()
  const pill = pillOf(dom)
  pill._listeners.click[0]({ type: 'click', target: pill, stopPropagation() {} })
  const box = dom.document.querySelectorAll('#__dshui-switcher')[0]
  assert.ok(box, '面板应打开')
  const panelBtn = box.querySelector('[data-restart-button]')
  assert.ok(panelBtn, '面板里应有重启入口')
  panelBtn._listeners.click[0]({ preventDefault() {}, stopPropagation() {} })
  await flush()
  // 壳补丁缺失时，面板「重启」直接转成一键启用（不再只弹“去找脚本”提示）
  assert.ok(requested.some((url) => String(url).includes('/restart-enable')), '面板按钮应触发一键启用')
  assert.ok(dom.document.querySelectorAll('[data-dshui-restart-toast]')[0], '应给出启用提示')
  api.uninstall()
  assert.equal(restartButtonOf(dom), null, '卸载应摘掉菜单栏按钮')
  assert.equal(dom.document.querySelectorAll('[data-dshui-restart-toast]').length, 0, '卸载应清掉提示')
  assert.equal(menu.bar.querySelectorAll('[data-dshui-restart-button]').length, 0)
})

test('重启键：壳补丁缺失时面板有「启用重启键」按钮，点击会 POST 宿主启动随包安装器', async () => {
  const dom = buildChatDom()
  attachWindowsMenu(dom, { lang: 'zh-CN' })
  const { api, requested } = runClient(dom)
  await flush()
  const pill = pillOf(dom)
  pill._listeners.click[0]({ type: 'click', target: pill, stopPropagation() {} })
  const box = dom.document.querySelectorAll('#__dshui-switcher')[0]
  assert.ok(box, '面板应打开')
  const enable = box.querySelector('[data-restart-enable]')
  assert.ok(enable, '缺壳补丁时面板应有「启用重启键」按钮')
  assert.match(enable.textContent, /启用重启键/)
  enable._listeners.click[0]({ type: 'click', target: enable, stopPropagation() {} })
  await flush()
  assert.ok(requested.some((url) => String(url).includes('/restart-enable')), '应请求宿主 restart-enable')
  const toast = dom.document.querySelectorAll('[data-dshui-restart-toast]')[0]
  assert.ok(toast, '应给出提示')
  assert.match(toast.textContent, /安装器|已启用/)
  assert.equal(api.status().restart.busy, false)
})

test('重启键：非 Windows 桌面壳环境完全跳过（网页版零侵入）', async () => {
  const dom = buildChatDom()
  const before = layoutSnapshot(dom)
  const { api } = runClient(dom)
  await flush()
  assert.equal(restartButtonOf(dom), null, '网页版不该注入按钮')
  assert.equal(api.status().restart.desktop, false)
  assert.match(api.diagnose(), /重启: 仅 Windows 桌面端/)
  assert.equal(layoutSnapshot(dom), before, '跳过时不能改变页面布局')
})

test('重启键：检测到独立插件 dsh-restart-button 提供按钮时，不重复注入（避免双按钮）', async () => {
  const dom = buildChatDom()
  const menu = attachWindowsMenu(dom, { lang: 'zh-CN' })
  // 模拟旧插件已经注入过按钮：菜单栏里有一个 [data-dsh-restart-button]
  const legacy = dom.document.createElement('button')
  legacy.setAttribute('data-dsh-restart-button', '')
  legacy.textContent = '重启'
  menu.bar.appendChild(legacy)
  const { api } = runClient(dom)
  await flush()
  const bar = dom.document.querySelector('[data-windows-menu]').shadowRoot.querySelector('[role="menubar"]')
  assert.equal(bar.querySelectorAll('[data-dshui-restart-button]').length, 0, '我们的插件不该再插一个按钮')
  assert.equal(api.status().restart.suppressed, 'provided-by-dsh-restart-button')
  assert.match(api.diagnose(), /按钮由独立插件 dsh-restart-button 提供/)
})

test('重启键：休眠恢复看护 —— 按钮被摘掉后，看护自动补回', async () => {
  const dom = buildChatDom()
  const menu = attachWindowsMenu(dom, { lang: 'zh-CN' })
  const { api } = runClient(dom)
  await flush()
  const first = restartButtonOf(dom)
  assert.ok(first, '先确认按钮已注入')
  // 模拟休眠恢复后只有第三个按钮被摘掉（应用/编辑还在）
  menu.bar.removeChild(first)
  assert.equal(restartButtonOf(dom), null)
  dom.flushMutations()
  const second = restartButtonOf(dom)
  assert.ok(second, '看护应把按钮补回')
  assert.notEqual(second, first, '补回的是新节点')
  assert.equal(second.textContent, '重启')
  assert.equal(menu.bar.childNodes[menu.bar.childNodes.length - 1], second, '补回后仍排在末尾')
  const snap = api.status().restart
  assert.equal(snap.installed, true)
  assert.equal(snap.watchdog, true, '看护应在运行')
  assert.equal(snap.repairs, 1, '看护应记一次补回')
})

test('重启键：休眠后标题栏整个重建 → 看护会在新菜单栏里重新注入', async () => {
  const dom = buildChatDom()
  const oldMenu = attachWindowsMenu(dom, { lang: 'zh-CN' })
  const { api } = runClient(dom)
  await flush()
  assert.ok(restartButtonOf(dom), '先确认按钮已注入')
  // 模拟宿主重建整个 [data-windows-menu]（旧节点连同按钮一起被移除）
  oldMenu.host.parentNode.removeChild(oldMenu.host)
  assert.equal(restartButtonOf(dom), null)
  const newMenu = attachWindowsMenu(dom, { lang: 'zh-CN' })
  dom.advance(1600) // 看护的低频轮询兜底
  const button = newMenu.bar.querySelectorAll('[data-dshui-restart-button]')[0]
  assert.ok(button, '看护应在新菜单栏里补回按钮')
  assert.equal(button.textContent, '重启')
  const snap = api.status().restart
  assert.equal(snap.installed, true)
  assert.ok(snap.repairs >= 1, '应记录补回次数')
})

test('重启键：关闭壁纸/背景模式不摘重启键（只有真正卸载才摘）', async () => {
  const dom = buildChatDom()
  attachWindowsMenu(dom, { lang: 'zh-CN' })
  const { api } = runClient(dom)
  await flush()
  assert.ok(restartButtonOf(dom), '先确认按钮已注入')
  api.setMode('multiply')
  dom.advance(600)
  assert.ok(restartButtonOf(dom), '切到纹理模式后按钮仍在')
  api.setMode('off')
  dom.advance(600) // 等淡出 + uninstall 跑完
  assert.ok(restartButtonOf(dom), '关闭壁纸模式后按钮应保留')
  assert.equal(api.status().restart.installed, true)
  api.uninstall()
  assert.equal(restartButtonOf(dom), null, '真正卸载才摘按钮')
})
const welcomeOf = (dom) => dom.document.getElementById('__dshui-welcome')

test('开屏后的 WELCOME BACK 卡片（0.8.0）：播完出现在右上角（下移避开顶部按钮），约 2.4s 自动淡出', async () => {
  const dom = buildChatDom()
  const { api } = runClient(dom, { splash: true, statusUser: 'RAD' })
  await flush()
  assert.equal(welcomeOf(dom), null, '开屏还没放完时不该有卡片')
  fireSplashMessage(dom, { __dshuiSplash: 'done' })
  dom.advance(SPLASH_FADE_MS_FOR_TEST + 80)
  const card = welcomeOf(dom)
  assert.ok(card, '播完后应显示欢迎卡片')
  assert.match(card.textContent, /WELCOME BACK/)
  assert.match(card.textContent, /RAD/, '卡片应显示宿主给的本机登录名')
  assert.equal(api.status().splash.welcomeShown, true)
  // 自动淡出（2.4s 后开始淡出，再等 400ms 移除）
  dom.advance(2500)
  dom.advance(500)
  assert.equal(welcomeOf(dom), null, '2.4s 后应自动移除')
})

test('开屏/欢迎卡片：右上角下移 64px，避开顶部侧边栏按钮', async () => {
  const dom = buildChatDom()
  const menu = attachWindowsMenu(dom)
  // 模拟 DSH 标题栏实际 52px（Win11 高标题栏/DPI 放大）
  menu.host._rect = { top: 0, left: 0, right: 1200, bottom: 52, width: 1200, height: 52 }
  const { api } = runClient(dom, { splash: true })
  await flush()
  assert.equal(splashCfgOf(dom).titlebar, 52, '应把量到的标题栏高度传给开屏页')
  fireSplashMessage(dom, { __dshuiSplash: 'done' })
  dom.advance(SPLASH_FADE_MS_FOR_TEST + 80)
  const card = welcomeOf(dom)
  assert.ok(card, '应有欢迎卡片')
  // 标题栏 52 + 86 = 往上原来的 22 再下移 64px
  assert.match(card.style.cssText, /top:138px/, '卡片应从标题栏+22 的位置再下移 64px')
  assert.match(card.style.cssText, /right:18px/, '卡片仍在右上角')
  assert.doesNotMatch(card.style.cssText, /bottom:96px/, '不应再到底部')
  assert.equal(api.status().titlebarHeight, undefined) // 内部状态不进快照
})
test('开屏重播后：方块光标仍然启用（0.8.26）', async () => {
  const dom = buildChatDom()
  const { api } = runClient(dom, { splash: true })
  await flush()
  // 桩环境没有 getSelection：先补一个，模拟真实页面里光标可绑定
  dom.window.getSelection = function () {
    return { rangeCount: 0, isCollapsed: true, getRangeAt: function () { return null } }
  }
  // 桩里 document.activeElement 默认未定义；真实页面里总是有值（null 也算已定义）
  dom.document.activeElement = dom.textarea
  api.splash.replay()
  await flush()
  fireSplashMessage(dom, { __dshuiSplash: 'done' })
  dom.advance(SPLASH_FADE_MS_FOR_TEST + 120)
  assert.ok(dom.body.classList.contains('__dshui-caret-on'), '重播揭幕后应重新启用方块光标')
})

test('开屏欢迎卡片：?splash=0 / 卸载 都不留卡片', async () => {
  const off = buildChatDom()
  off.window.location.href = 'http://localhost/?splash=0'
  runClient(off)
  await flush()
  off.advance(1000)
  assert.equal(welcomeOf(off), null, '不放开屏时不该出现卡片')

  const dom = buildChatDom()
  const { api } = runClient(dom, { splash: true })
  await flush()
  fireSplashMessage(dom, { __dshuiSplash: 'done' })
  dom.advance(SPLASH_FADE_MS_FOR_TEST + 80)
  assert.ok(welcomeOf(dom), '先确认卡片出现')
  api.uninstall()
  assert.equal(welcomeOf(dom), null, '卸载必须清掉卡片')
})
test('开屏期间：胶囊与面板整个藏起来，播完恢复（不再盖在开屏画面上）', async () => {
  const dom = buildChatDom()
  const { api } = runClient(dom, { splash: true })
  await flush()
  assert.ok(splashOf(dom), '开屏应已挂载')
  const pill = pillOf(dom)
  assert.ok(pill, '胶囊应已创建')
  assert.equal(pill.style.getPropertyValue('display'), 'none', '开屏播放中胶囊必须隐藏')
  // 开屏期间点背景：不应触发淡出
  api.setMode('off')
  fireSplashMessage(dom, { __dshuiSplash: 'done' })
  dom.advance(SPLASH_FADE_MS_FOR_TEST + 80)
  assert.notEqual(pillOf(dom).style.getPropertyValue('display'), 'none', '播完应恢复显示')
  assert.equal(api.status().splash.welcomeShown, true)
})

test('点背景淡出后立刻点胶囊：取消淡出并正常打开面板（不卡死、不打架）', async () => {
  const dom = buildChatDom()
  const { api } = runClient(dom)
  await flush()
  api.setMode('multiply')
  dom.advance(40)
  const layer = layerOf(dom)
  clickOn(dom, dom.panel)
  assert.equal(layer.classList.contains('is-faded'), true, '点背景应开始淡出')
  const pill = pillOf(dom)
  pill._listeners.click[0]({ type: 'click', target: pill, stopPropagation() {} })
  assert.equal(layer.classList.contains('is-faded'), false, '打开面板应取消淡出')
  assert.equal(api.status().override, false)
  assert.ok(dom.document.getElementById('__dshui-switcher'), '面板应打开')
  dom.advance(2500)
  assert.equal(api.status().override, false, '定时器不应把状态再改回去')
})
test('键盘快捷键：Alt+1=关闭 / Alt+2=纹理', async () => {
  const dom = buildChatDom()
  const { api } = runClient(dom)
  await flush()

  const press = (key) => {
    const event = {
      type: 'keydown',
      key,
      ctrlKey: true,
      shiftKey: true,
      altKey: true,
      preventDefault() {},
      stopPropagation() {},
    }
    dom.document.dispatchEvent(event)
    return event
  }

  press('2')
  assert.equal(api.status().mode, 'multiply')
  assert.equal(layerOf(dom).getAttribute('data-mode'), 'multiply')
  press('1')
  assert.equal(api.status().mode, 'off')
  assert.ok(layerOf(dom), '淡出期间层应还在')
  assert.equal(api.status().transition.fadingOut, true)
  dom.advance(600)
  assert.equal(layerOf(dom), null)
  assert.equal(api.status().transition.fadingOut, false)
})

test('脚本重复注入：只保留一份样式', async () => {
  const dom = buildChatDom()
  const { context, api } = runClient(dom)
  await flush()
  api.setMode('multiply')
  assert.equal(dom.document.querySelectorAll('#__dshui-style').length, 1)

  new vm.Script(CLIENT_SOURCE, { filename: 'client.js' }).runInContext(context)
  await flush()
  assert.equal(dom.document.querySelectorAll('#__dshui-style').length, 1)
  assert.equal(dom.document.querySelectorAll('#__dshui-layer').length, 1)
})
