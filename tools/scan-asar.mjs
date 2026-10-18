// 只读扫描：在 DSH 的 app.asar 里找页面真实 CSS，确认输入区座位的背景。
import { readFileSync } from 'node:fs'

const file = process.argv[2]
const needles = process.argv.slice(3)
const buf = readFileSync(file)
console.log('asar bytes:', buf.length)

for (const needle of needles) {
  const nb = Buffer.from(needle, 'utf8')
  let idx = 0
  let n = 0
  while ((idx = buf.indexOf(nb, idx)) !== -1 && n < 12) {
    n++
    const start = Math.max(0, idx - 420)
    const end = Math.min(buf.length, idx + 420)
    const chunk = buf.subarray(start, end).toString('utf8').replace(/[^\x20-\x7e{}():;,.\-/'"%#*!<>@\[\]&|=+~^$?\\]/g, '·')
    console.log('\n=== ' + needle + ' #' + n + ' @' + idx + ' ===')
    console.log(chunk)
    idx += nb.length
  }
  if (n === 0) console.log('\n=== ' + needle + ': NOT FOUND ===')
}
