// Renders the stylesheet that lib/client.js actually produces (via test/fake-dom.js)
// and prints every `__dshui-frost-chat` rule + a couple of sanity flags.
//
//   Why: "打标正确 ≠ 看得见" —— 用户没有 DevTools，症状（"看不出效果"）既可能是没打标，
//   也可能是规则压根没进样式表。这个脚本把"渲染出来的静态表"原样打出来，一眼定案。
//
// Usage: node tools\dump-rules.mjs [pluginDir]      (default: this repo, i.e. ..\ )
import { pathToFileURL } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const pluginDir = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(here, '..')
const fakeUrl = pathToFileURL(path.join(pluginDir, 'test', 'fake-dom.js')).href
const { buildChatDom } = await import(fakeUrl)
const CLIENT_SOURCE = fs.readFileSync(path.join(pluginDir, 'lib', 'client.js'), 'utf8')

function runClient(dom) {
  const context = {
    window: dom.window,
    document: dom.document,
    setTimeout: dom.setTimeout,
    clearTimeout: dom.clearTimeout,
    console: { log() {}, warn() {}, error() {} },
    fetch: () =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, source: 'desktop', file: 'x', url: '/x', bytes: 1, images: [] }) }),
  }
  context.globalThis = context
  context.self = context
  vm.createContext(context)
  new vm.Script(CLIENT_SOURCE, { filename: 'client.js' }).runInContext(context)
  return { api: dom.window.__DSHUI__ }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))
const styleTagOf = (dom) => dom.document.getElementById('__dshui-style')

const dom = buildChatDom()
const code = dom.document.createElement('div')
code.setAttribute('data-code-wrap', '')
code.className = '_block_7gxqk_4 md-code-block _card_7gxqk_107'
code._rect = { top: 100, left: 300, right: 1100, bottom: 300, width: 800, height: 200 }
dom.transcript.appendChild(code)
dom.setComputedStyle(code, { backgroundColor: 'rgb(30, 30, 40)', position: 'static', overflow: 'visible' })
const file = dom.document.createElement('div')
file.setAttribute('data-presented-file', '')
file._rect = { top: 320, left: 300, right: 900, bottom: 420, width: 600, height: 100 }
dom.transcript.appendChild(file)
dom.setComputedStyle(file, { backgroundColor: 'rgb(245, 245, 245)', position: 'static', overflow: 'visible' })

const { api } = runClient(dom)
await flush()
api.setMode('backdrop')
dom.advance(600)

const css = styleTagOf(dom).textContent
const wanted = [
  '.__dshui-frost-chat{background-color:color-mix',
  ' :where(pre,[data-code-block-content])',
  ' :has(> [data-code-block-banner]){background:transparent!important;}',
  '[data-code-block-banner]{background:color-mix',
  'var(--dsniang-frost-bubble-mix,55%)',
  'var(--dsniang-frost-bubble-blur,12px)',
]
console.log('version          :', api.version)
console.log('chatExtras       :', api.status().frost.chatExtras, '(blocks', api.status().frost.chatBlocks + ', files', api.status().frost.chatFiles + ')')
console.log('code marked      :', code.classList.contains('__dshui-frost-chat'))
console.log('file marked      :', file.classList.contains('__dshui-frost-chat'))
console.log('url( in css      :', /url\(/.test(css))
for (const w of wanted) console.log((css.includes(w) ? 'ok   ' : 'MISS ') + w)

// print the exact 0.6.1 rules
const rules = css.split('}').filter((r) => r.includes('__dshui-frost-chat')).map((r) => r + '}')
console.log('--- rules mentioning __dshui-frost-chat ---')
for (const r of rules) console.log(r)
