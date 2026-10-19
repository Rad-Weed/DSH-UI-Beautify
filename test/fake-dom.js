/**
 * 测试用极简 DOM 桩 + 可控时钟。
 * 只实现 client.js 真正用到的那部分 API，够跑通「发现面板 → 盖层 → 点击淡出 → 2 秒后淡回」。
 */

class FakeStyle {
  constructor() {
    this._props = new Map()
    this._priorities = new Map()
    // 真实 CSSStyleDeclaration 支持 `style.position = 'relative'` 这种属性写法；
    // 没有这层代理的话，插件的赋值会静默丢失，测试就测不到真实行为了。
    return new Proxy(this, {
      get(target, prop, receiver) {
        if (typeof prop === 'string' && !(prop in target)) return target.getPropertyValue(camelToKebab(prop))
        return Reflect.get(target, prop, receiver)
      },
      set(target, prop, value, receiver) {
        if (typeof prop === 'string' && !(prop in target)) {
          target.setProperty(camelToKebab(prop), String(value))
          return true
        }
        return Reflect.set(target, prop, value, receiver)
      },
    })
  }
  setProperty(key, value, priority) {
    this._props.set(String(key), String(value))
    if (priority) this._priorities.set(String(key), String(priority))
    else this._priorities.delete(String(key))
  }
  getPropertyValue(key) {
    return this._props.get(String(key)) || ''
  }
  getPropertyPriority(key) {
    return this._priorities.get(String(key)) || ''
  }
  removeProperty(key) {
    const old = this._props.get(String(key)) || ''
    this._props.delete(String(key))
    this._priorities.delete(String(key))
    return old
  }
  get cssText() {
    return Array.from(this._props.entries())
      .map(([k, v]) => `${k}:${v}`)
      .join(';')
  }
  set cssText(text) {
    this._props.clear()
    for (const part of String(text).split(';')) {
      const index = part.indexOf(':')
      if (index > 0) this._props.set(part.slice(0, index).trim(), part.slice(index + 1).trim())
    }
  }
}

/** backgroundColor -> background-color（真实 CSSOM 的属性名映射）。 */
function camelToKebab(name) {
  return String(name).replace(/[A-Z]/g, (char) => '-' + char.toLowerCase())
}

class FakeClassList {
  constructor() {
    this._set = new Set()
  }
  add(name) {
    this._set.add(name)
  }
  remove(name) {
    this._set.delete(name)
  }
  contains(name) {
    return this._set.has(name)
  }
  toString() {
    return Array.from(this._set).join(' ')
  }
}

class FakeNode {
  constructor(tagName, ownerDocument) {
    this.tagName = String(tagName).toUpperCase()
    this.ownerDocument = ownerDocument
    this.parentNode = null
    this.childNodes = []
    this.attributes = {}
    this.style = new FakeStyle()
    this.classList = new FakeClassList()
    this._class = ''
    this._id = ''
    this._text = ''
    this._listeners = {}
    this.nodeType = 1
    this.isConnected = false
    this.shadowRoot = null
    this._shadow = null
    this.host = null
  }

  get parentElement() {
    return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null
  }

  get className() {
    return this._class
  }  set className(value) {
    this._class = String(value)
    this.classList = new FakeClassList()
    for (const name of this._class.split(/\s+/).filter(Boolean)) this.classList.add(name)
  }

  get id() {
    return this._id
  }
  set id(value) {
    this._id = String(value)
  }

  set textContent(value) {
    this._text = String(value)
    this.childNodes = []
  }
  get textContent() {
    if (this._text) return this._text
    return this.childNodes.map((child) => child.textContent).join('')
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value)
  }
  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null
  }
  removeAttribute(name) {
    delete this.attributes[name]
  }
  hasAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name)
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null
  }

  querySelectorAll(selector) {
    const parts = String(selector)
      .split(',')
      .map((part) => part.trim())
    const out = []
    walk(this, (node) => {
      for (const part of parts) {
        if (matches(node, part)) {
          out.push(node)
          return
        }
      }
    })
    return out
  }

  appendChild(child) {
    if (child.parentNode) child.parentNode.removeChild(child)
    child.parentNode = this
    this.childNodes.push(child)
    child._markConnected(true)
    notifyMutation(this, [child], [])
    return child
  }

  removeChild(child) {
    const index = this.childNodes.indexOf(child)
    if (index >= 0) {
      this.childNodes.splice(index, 1)
      child.parentNode = null
      child._markConnected(false)
      notifyMutation(this, [], [child])
    }
    return child
  }

  replaceChild(newChild, oldChild) {
    const index = this.childNodes.indexOf(oldChild)
    if (index < 0) throw new Error('replaceChild: oldChild not found')
    if (newChild.parentNode) newChild.parentNode.removeChild(newChild)
    oldChild.parentNode = null
    oldChild._markConnected(false)
    newChild.parentNode = this
    newChild._markConnected(true)
    this.childNodes[index] = newChild
    notifyMutation(this, [newChild], [oldChild])
    return oldChild
  }

  _markConnected(value) {
    this.isConnected = value
    for (const child of this.childNodes) child._markConnected(value)
    if (this._shadow) this._shadow._markConnected(value)
  }

  /** open shadow root（桩）：与真实 API 一样，document 查询不会进入 shadow 树。 */
  attachShadow(init) {
    const mode = (init && init.mode) || 'open'
    const root = new FakeNode('#shadow-root', this.ownerDocument)
    root.nodeType = 11
    root.mode = mode
    root.host = this
    root._markConnected(this.isConnected)
    this._shadow = root
    this.shadowRoot = mode === 'open' ? root : null
    return root
  }

  contains(node) {
    let current = node
    while (current) {
      if (current === this) return true
      current = current.parentNode
    }
    return false
  }

  closest(selector) {
    const parts = String(selector)
      .split(',')
      .map((part) => part.trim())
    let current = this
    while (current) {
      for (const part of parts) {
        if (matches(current, part)) return current
      }
      current = current.parentNode
    }
    return null
  }

  addEventListener(type, handler) {
    ;(this._listeners[type] = this._listeners[type] || []).push(handler)
  }
  removeEventListener(type, handler) {
    const list = this._listeners[type]
    if (!list) return
    const index = list.indexOf(handler)
    if (index >= 0) list.splice(index, 1)
  }
  dispatchEvent(event) {
    event.target = event.target || this
    event.currentTarget = this
    for (const handler of (this._listeners[event.type] || []).slice()) handler(event)
    return !event.defaultPrevented
  }

  getBoundingClientRect() {
    if (this._rect) return this._rect
    const doc = this.ownerDocument
    const view = doc && doc.defaultView
    // 我们自己的两个图层在**静态样式表**里就是 `position:fixed; inset:0` —— 桩里没有样式表，
    // 所以按 id 直接给视口几何（否则 0.6.4 的"壁纸体检"会把图层误判成塌成 0 尺寸）。
    if (this.id === '__dshui-layer' || this.id === '__dshui-layer2') {
      const w = (view && view.innerWidth) || 0
      const h = (view && view.innerHeight) || 0
      return { top: 0, left: 0, right: w, bottom: h, width: w, height: h }
    }
    // 建模「已定位盒子」的真实几何（背景层就是这种）：
    //   - fixed → 视口（初始包含块）
    //   - absolute → 最近的「已定位祖先」，没有则视口
    const position = this.style.getPropertyValue('position')
    if (position === 'fixed' || position === 'absolute') {
      if (position === 'absolute') {
        let ancestor = this.parentNode
        while (ancestor && ancestor.nodeType === 1) {
          const ancestorPosition = ancestor.style.getPropertyValue('position')
          if (ancestorPosition === 'relative' || ancestorPosition === 'absolute' || ancestorPosition === 'fixed') {
            if (ancestor._rect) return ancestor._rect
            break
          }
          ancestor = ancestor.parentNode
        }
      }
      const width = (view && view.innerWidth) || 0
      const height = (view && view.innerHeight) || 0
      return { top: 0, left: 0, right: width, bottom: height, width, height }
    }
    return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }
  }
}

/** 只支持 client.js 用到的那些选择器（含 `>` 子选择器，取最后一个复合选择器判定）。 */
function matches(node, selector) {
  if (!node || node.nodeType !== 1) return false
  const raw = String(selector).trim()
  if (raw === '*') return true
  // `A > B` 这类组合选择器：本桩不建模祖先匹配，只用右侧复合选择器判定。
  const compounds = raw.split(/\s*>\s*/)
  let rest = compounds[compounds.length - 1].trim()
  if (!rest || rest === '*') return true
  if (rest[0] === ':') return false // 不支持伪类
  let specificity = false
  const attrMatch = /\[([\w-]+)(?:(=|~=|\^=|\$=|\*=)"([^"]*)")?\]/.exec(rest)
  if (attrMatch) {
    // class 是独立字段，不走 attributes 表（真实 DOM 里 getAttribute('class') 也是返回类名）
    const attrName = attrMatch[1]
    const value = attrName === 'class' ? String(node.className || '') : node.getAttribute(attrName)
    if (value === null) return false
    const op = attrMatch[2]
    const expect = attrMatch[3]
    if (expect !== undefined) {
      const text = String(value)
      if (op === '=' && text !== expect) return false
      if (op === '*=' && text.indexOf(expect) === -1) return false
      if (op === '^=' && text.indexOf(expect) !== 0) return false
      if (op === '$=' && !text.endsWith(expect)) return false
      if (op === '~=' && (' ' + text + ' ').indexOf(' ' + expect + ' ') === -1) return false
    }
    rest = rest.replace(attrMatch[0], '')
    specificity = true
  }
  const idMatch = /#([\w-]+)/.exec(rest)
  if (idMatch) {
    if (node.id !== idMatch[1]) return false
    rest = rest.replace(idMatch[0], '')
    specificity = true
  }
  const classMatch = /\.([\w-]+)/g
  let found
  while ((found = classMatch.exec(rest))) {
    if (!node.classList.contains(found[1])) return false
    specificity = true
  }
  const tagMatch = /^[a-zA-Z][\w-]*/.exec(rest.trim())
  if (tagMatch) {
    if (node.tagName !== tagMatch[0].toUpperCase()) return false
    specificity = true
  }
  return specificity
}

function walk(root, visit) {
  for (const child of root.childNodes) {
    visit(child)
    walk(child, visit)
  }
}

/**
 * `MutationObserver` 桩（0.6.5 起用）。
 *
 * 真实语义：DOM 变化先攒成记录，**在微任务里**回调给观察者 —— 也就是**赶在浏览器绘制之前**。
 * client 的"抢修"（`instantGuard`）就靠这个时机做到"看不到白闪"，所以桩必须能表达
 * "变化 → 回调" 这个顺序，又不能让既有测试受影响：
 *   - 变化只**入队**（`notifyMutation`）；
 *   - 只有测试显式调用 `dom.flushMutations()` 才把记录派发给回调（= 那一次微任务检查点）。
 * 于是：不调 flush 的测试，行为和以前完全一样；调了的测试能精确验证"同步抢修"。
 */
const mutationObservers = []

function notifyMutation(target, added, removed) {
  for (const observer of mutationObservers) {
    let matched = false
    for (const sub of observer._subs) {
      if (!sub.childList) continue
      let node = target
      while (node) {
        if (node === sub.target) {
          matched = true
          break
        }
        if (!sub.subtree) break
        node = node.parentNode
      }
      if (matched) break
    }
    if (matched) observer._queue.push({ type: 'childList', target, addedNodes: added, removedNodes: removed })
  }
}

class FakeMutationObserver {
  constructor(callback) {
    this._cb = callback
    this._subs = []
    this._queue = []
    mutationObservers.push(this)
  }
  observe(target, options) {
    const opts = options || {}
    this._subs.push({ target, childList: !!opts.childList, subtree: !!opts.subtree })
  }
  disconnect() {
    this._subs = []
    this._queue = []
  }
  takeRecords() {
    return this._queue.splice(0)
  }
}

export function createDom(options) {
  const opts = options || {}
  const width = opts.width || 1600
  const height = opts.height || 900
  const baseColor = opts.baseColor || 'rgb(255, 255, 255)'
  const baseToken = opts.baseToken || '#ffffff'

  const document = {
    nodeType: 9,
    readyState: 'complete',
    childNodes: [],
    _listeners: {},
    createElement(tag) {
      const node = new FakeNode(tag, document)
      if (tag === 'style') node._rect = { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }
      return node
    },
    getElementById(id) {
      let found = null
      walk(document, (node) => {
        if (!found && node.id === id) found = node
      })
      return found
    },
    contains(node) {
      let current = node
      while (current) {
        if (current === document) return true
        current = current.parentNode
      }
      return false
    },
    querySelector(selector) {
      return this.querySelectorAll(selector)[0] || null
    },
    querySelectorAll(selector) {
      const out = []
      const parts = String(selector)
        .split(',')
        .map((part) => part.trim())
      walk(document, (node) => {
        for (const part of parts) {
          if (matches(node, part)) {
            out.push(node)
            return
          }
        }
      })
      return out
    },
    /**
     * 命中测试桩（0.6.4 起 client 用它找"链外的盖子"）。
     *
     * 真实语义是"从上到下"（z-index / 绘制顺序）；桩按**深 → 浅**返回 `_rect` 覆盖该点的元素。
     * 对我们的用法等价：扫描会跳过透明的层，只在"画了不透明背景 + 几乎铺满视口"的元素上停下。
     * 桩不返回 html（真实会），client 那边也会在遇到 documentElement 时停止 —— 两边一致。
     * 也**不返回 `pointer-events:none` 的元素及其子树** —— 真实命中测试就是这么跳过它们的
     * （所以 client 那边还有一路"顶层容器补扫"来兜 pointer-events:none 的浮层）。
     */
    elementsFromPoint(x, y) {
      const hits = []
      const walk = (node, depth) => {
        for (const child of node.childNodes) {
          if (child.nodeType !== 1) continue
          if (child.style.getPropertyValue('pointer-events') === 'none') continue
          const rect = child._rect
          if (rect && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
            hits.push({ el: child, depth })
          }
          walk(child, depth + 1)
        }
      }
      walk(body, 0)
      hits.sort((a, b) => b.depth - a.depth)
      return hits.map((item) => item.el)
    },
    addEventListener(type, handler) {
      ;(document._listeners[type] = document._listeners[type] || []).push(handler)
    },
    removeEventListener(type, handler) {
      const list = document._listeners[type]
      if (!list) return
      const index = list.indexOf(handler)
      if (index >= 0) list.splice(index, 1)
    },
    dispatchEvent(event) {
      event.target = event.target || document
      for (const handler of (document._listeners[event.type] || []).slice()) handler(event)
      return !event.defaultPrevented
    },
    _listenerCount(type) {
      return (document._listeners[type] || []).length
    },
  }

  const html = new FakeNode('html', document)
  const head = new FakeNode('head', document)
  const body = new FakeNode('body', document)
  document.documentElement = html
  document.head = head
  document.body = body
  html.appendChild(head)
  html.appendChild(body)
  document.childNodes.push(html)
  html._markConnected(true)

  const computed = new Map()
  const storage = new Map()
  const mediaLists = {}
  const window = {
    innerWidth: width,
    innerHeight: height,
    _listeners: {},
    location: { href: 'http://localhost/', hash: '', search: '' },
    localStorage: {
      // 与真实 Storage 对齐：length / key(i) 用于枚举（存储迁移要用）
      get length() {
        return storage.size
      },
      key: (index) => {
        const keys = Array.from(storage.keys())
        return index >= 0 && index < keys.length ? keys[index] : null
      },
      getItem: (key) => (storage.has(String(key)) ? storage.get(String(key)) : null),
      setItem: (key, value) => storage.set(String(key), String(value)),
      removeItem: (key) => storage.delete(String(key)),
      clear: () => storage.clear(),
    },
    /** 桩里没有真实选区：默认「没有选中文本」（collapsed）。 */
    getSelection() {
      return { isCollapsed: true, toString: () => '', removeAllRanges() {}, addRange() {} }
    },
    getComputedStyle(node) {
      const override = computed.get(node) || {}
      // 级联优先级：**内联优先**（`setComputedStyle` 代表应用的类规则）。真实浏览器里
      // 内联 `!important` 也压过类规则 —— 桩必须照这个来，否则"我们清完底之后还算不算画了背景"
      // 会判反（0.6.5 的壁纸体检/盖子扫描就会被自己清过的层反复命中）。
      const inline = node.style.getPropertyValue('background-color')
      const declared = inline || (override && override.backgroundColor) || ''
      const out = {
        backgroundColor: declared || 'rgba(0, 0, 0, 0)',
        position: node.style.getPropertyValue('position') || (override && override.position) || 'static',
        overflow: node.style.getPropertyValue('overflow') || (override && override.overflow) || 'visible',
        // opacity（0.6.4 起 client 的"壁纸体检"要看它 —— 图层被抹成透明时得能发现）
        opacity: node.style.getPropertyValue('opacity') || (override && override.opacity) || '1',
        // background-image（同上：体检要区分"画过图"和"图被抹了"）
        backgroundImage:
          node.style.getPropertyValue('background-image') || (override && override.backgroundImage) || 'none',
        getPropertyValue(name) {
          if (name === '--dsw-alias-bg-base') return baseToken
          return node.style.getPropertyValue(name)
        },
      }
      // 真实 getComputedStyle 会暴露所有属性（paddingBottom / overflowY / mixBlendMode …），
      // setComputedStyle 传进来的其它键也一并暴露，桩才不会被"读不到属性"误导。
      for (const key of Object.keys(override)) {
        if (
          key === 'backgroundColor' ||
          key === 'position' ||
          key === 'overflow' ||
          key === 'opacity' ||
          key === 'backgroundImage'
        ) {
          continue
        }
        out[key] = override[key]
      }
      return out
    },
    addEventListener(type, handler) {
      ;(window._listeners[type] = window._listeners[type] || []).push(handler)
    },
    removeEventListener(type, handler) {
      const list = window._listeners[type]
      if (!list) return
      const index = list.indexOf(handler)
      if (index >= 0) list.splice(index, 1)
    },
    /**
     * 单调时钟（0.7.0 帧探针用）：跟着 `advance()` 的桩时钟走 —— 这样测试里
     * advance(16) 一次 = 一帧 16ms，帧率/P95 可以精确断言。
     */
    performance: {
      now: () => now,
    },
    /**
     * `matchMedia` 桩（0.7.0 动效底座读「减弱动态效果」用）：
     * 与真实 API 一致 —— **同一个查询串永远返回同一个 MediaQueryList 对象**
     * （否则 client 启动时拿到的对象和测试后来改的对象不是同一个，change 事件根本送不到）。
     * 默认不匹配；测试可以改 `.matches` 再 `dispatchChange()`。
     */
    matchMedia(query) {
      const key = String(query || '')
      if (!mediaLists[key]) {
        const listeners = {}
        mediaLists[key] = {
          matches: false,
          media: key,
          addEventListener(type, handler) {
            ;(listeners[type] = listeners[type] || []).push(handler)
          },
          removeEventListener(type, handler) {
            const list = listeners[type]
            if (!list) return
            const index = list.indexOf(handler)
            if (index >= 0) list.splice(index, 1)
          },
          dispatchChange() {
            for (const handler of (listeners.change || []).slice()) handler({ matches: this.matches, media: this.media })
          },
        }
      }
      return mediaLists[key]
    },
  }
  document.defaultView = window

  // 时钟：手动推进，专门用来断言「2 秒后恢复」。
  const timers = []
  let now = 0
  const schedule = (fn, delay) => {
    const timer = { fn, at: now + (Number(delay) || 0), id: timers.length + 1, cleared: false }
    timers.push(timer)
    return timer.id
  }
  const unschedule = (id) => {
    const timer = timers.find((item) => item.id === id)
    if (timer) timer.cleared = true
  }
  window.setTimeout = schedule
  window.clearTimeout = unschedule

  // rAF 桩（0.5.0 起 client 有常驻同步循环）：每次 advance 结尾把已排队的回调清一次 ——
  // 回调里再注册的会留到下一次 advance（一帧一次，像真的 rAF）。
  const rafQueue = []
  window.requestAnimationFrame = (fn) => {
    rafQueue.push({ fn, cleared: false, id: rafQueue.length + 1 })
    return rafQueue[rafQueue.length - 1].id
  }
  window.cancelAnimationFrame = (id) => {
    const item = rafQueue.find((entry) => entry.id === id)
    if (item) item.cleared = true
  }

  return {
    document,
    window,
    html,
    head,
    body,
    computed,
    MutationObserver: FakeMutationObserver,
    setTimeout: schedule,
    clearTimeout: unschedule,
    /**
     * 派发攒下来的 DOM 变化记录（= 真实世界里那一次微任务检查点，**发生在绘制之前**）。
     * client 的 `instantGuard` 就是在这里跑完的 —— 测试用它证明"抢修是同步的"。
     */
    flushMutations() {
      for (const observer of mutationObservers) {
        const records = observer._queue.splice(0)
        if (!records.length) continue
        observer._cb(records)
      }
    },
    /** 注册元素的计算样式覆盖（模拟 DSH 的面板底色/定位）。 */
    setComputedStyle(node, styles) {
      computed.set(node, styles)
    },
    advance(ms) {
      // 按时间顺序推到目标时刻：这样"链式"计时器（回调里再 schedule）也会像
      // 真实 setTimeout 一样逐个触发 —— 补间动画就靠这个行为。
      const target = now + ms
      let ran = true
      while (ran) {
        ran = false
        let next = null
        for (const timer of timers) {
          if (!timer.cleared && !timer.fired && timer.at <= target && (!next || timer.at < next.at)) {
            next = timer
          }
        }
        if (next) {
          now = next.at
          next.fired = true
          ran = true
          next.fn()
        }
      }
      now = target
      // 一帧的 rAF 回调（advance 一次 = 一帧；回调里再注册的留下一次 advance）
      const frame = rafQueue.splice(0, rafQueue.length)
      for (const item of frame) {
        if (!item.cleared) item.fn()
      }
    },
    now() {
      return now
    },
    listenerCount(type) {
      return (document._listeners[type] || []).length
    },
  }
}

/** 造一个像 DSH 的聊天页骨架：body > #root > 外壳 → 聊天面板 → 消息区 + 输入框。 */
export function buildChatDom(options) {
  const opts = options || {}
  const dom = createDom(opts)
  const { document, body } = dom

  const root = document.createElement('div')
  root.id = 'root'
  body.appendChild(root)

  const shell = document.createElement('div')
  shell.className = '_shell_test_1'
  root.appendChild(shell)

  const panel = document.createElement('div')
  panel.className = '_panel_test_2'
  shell.appendChild(panel)

  // 消息区：真实 DSH 用 [data-conversation-scroll] 标记滚动容器，与输入区**平级**
  const transcript = document.createElement('div')
  transcript.className = '_transcript_test_3'
  transcript.setAttribute('data-conversation-scroll', 'true')
  panel.appendChild(transcript)

  const bubble = document.createElement('div')
  bubble.className = '_bubble_test_4'
  transcript.appendChild(bubble)

  // 输入区：真实 DSH = 座位(Dc7zOa_composerSeat) > 根容器(RlGAzG_root) > 卡片(RlGAzG_card)，
  // 卡片不是面板的直接子元素，抬"座位"才有效 —— 桩必须把这条链建出来，否则测不出真问题。
  const seat = document.createElement('div')
  seat.className = '_composerSeat_test_6'
  panel.appendChild(seat)

  const cardRoot = document.createElement('div')
  cardRoot.className = '_composerRoot_test_7'
  seat.appendChild(cardRoot)

  const composerWrap = document.createElement('div')
  composerWrap.className = '_composerCard_test_5'
  // 与真实 DSH 一致：输入卡片带 data-composer-card，输入框带 data-composer-input
  composerWrap.setAttribute('data-composer-card', 'true')
  cardRoot.appendChild(composerWrap)

  const textarea = document.createElement('textarea')
  textarea.setAttribute('data-composer-input', 'true')
  composerWrap.appendChild(textarea)

  const rect = (top, height) => ({ top, left: 400, right: 1600, bottom: top + height, width: 1200, height })
  root._rect = rect(0, 900)
  shell._rect = rect(0, 900)
  panel._rect = rect(0, 900)
  transcript._rect = rect(0, 780)
  bubble._rect = { top: 100, left: 460, right: 1200, bottom: 200, width: 740, height: 100 }
  seat._rect = rect(780, 120)
  cardRoot._rect = rect(780, 120)
  composerWrap._rect = rect(780, 120)
  textarea._rect = { top: 800, left: 500, right: 1400, bottom: 880, width: 900, height: 80 }

  // 底色：外壳与聊天面板都是应用基准色；消息区/气泡透明。
  const opaqueBase = { backgroundColor: 'rgb(255, 255, 255)', position: 'static', overflow: 'visible' }
  dom.setComputedStyle(root, opaqueBase)
  dom.setComputedStyle(shell, opaqueBase)
  dom.setComputedStyle(panel, opaqueBase)
  dom.setComputedStyle(transcript, {
    backgroundColor: 'rgba(0, 0, 0, 0)',
    position: 'static',
    overflow: 'auto',
    overflowY: 'auto',
  })
  dom.setComputedStyle(seat, { backgroundColor: 'rgba(0, 0, 0, 0)', position: 'static', overflow: 'visible' })
  dom.setComputedStyle(cardRoot, { backgroundColor: 'rgba(0, 0, 0, 0)', position: 'static', overflow: 'visible' })
  // 与真实 DSH 一致：输入卡片自带近实心白底（rgba(255,255,255,0.85)），
  // 毛玻璃接管/归还它时必须无缝，否则会闪白光 —— 这是专门的回归桩。
  dom.setComputedStyle(composerWrap, { backgroundColor: 'rgba(255, 255, 255, 0.85)', position: 'static', overflow: 'visible' })
  dom.setComputedStyle(bubble, { backgroundColor: 'rgb(240, 240, 240)', position: 'static', overflow: 'visible' })

  return { ...dom, root, shell, panel, transcript, bubble, seat, cardRoot, composerWrap, textarea }
}

/**
 * 给桩挂上「Windows 桌面壳 preload 菜单栏」：
 *   html[data-windows-titlebar] → body > div[data-windows-menu] → #shadow-root(open)
 *     → div[role=menubar] → button(应用) / button(编辑)
 * 重启键插件会往这个 menubar 里再 append 一个「重启」按钮。
 */
export function attachWindowsMenu(dom, options) {
  const opts = options || {}
  const { document, body } = dom
  if (opts.lang) document.documentElement.lang = opts.lang
  document.documentElement.setAttribute('data-windows-titlebar', '')
  const host = document.createElement('div')
  host.setAttribute('data-windows-menu', '')
  // Windows 标题栏：40px 高（客户端量高度时用它兜底）
  host._rect = { top: 0, left: 0, right: 1200, bottom: 40, width: 1200, height: 40 }
  const shadow = host.attachShadow({ mode: 'open' })
  const bar = document.createElement('div')
  bar.setAttribute('role', 'menubar')
  const app = document.createElement('button')
  app.textContent = '应用'
  const edit = document.createElement('button')
  edit.textContent = '编辑'
  bar.appendChild(app)
  bar.appendChild(edit)
  shadow.appendChild(bar)
  body.appendChild(host)
  return { host, shadow, bar, buttons: [app, edit] }
}
