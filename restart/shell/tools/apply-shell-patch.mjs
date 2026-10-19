#!/usr/bin/env node
/**
 * apply-shell-patch.mjs —— DSH「重启」按钮的桌面壳补丁工具（原地改 app.asar）
 * ============================================================================
 * 它做什么
 *   给 Electron 桌面壳的 app.asar 追加两条**标题栏重启按钮**所需的小改动：
 *
 *     lib/main.js          主进程新增 IPC：dsh-desktop:restart-app
 *                          （干净重启：app.relaunch() + quitWithoutConfirmation()；
 *                           有任务在跑时先弹原生确认框）
 *     lib/preload-app.cjs  preload 暴露 window.dshDesktop.restart()
 *
 *   两条改动都以「带标记的代码块」形式**插入**原始文件，标记为：
 *       // >>> DSH-RESTART-BUTTON BEGIN >>>
 *       ...
 *       // <<< DSH-RESTART-BUTTON END <<<
 *   重复安装时先按标记把旧块摘掉、再插新块（幂等，支持补丁版本升级）。
 *
 * 为什么原地改
 *   app.asar 是 [8 字节][头部 pickle][数据区] 结构，头部里每个文件记着
 *   offset（相对数据区）+ size。本工具**不重排任何数据**：
 *     1. 把打完补丁的两个文件追加到**文件末尾**；
 *     2. 只把这两个条目的 offset/size/integrity 指向新位置；
 *     3. 把改过的头部 JSON 写回原来那段字节区间（长度不变；短了用空格补齐，
 *        JSON.parse 忽略尾部空白）。
 *   ⇒ 其余上万个条目的偏移量保持不变，120+ MB 数据一个字节都没搬。
 *   先追加、后改头部，所以即使中途断电，文件仍然是「完全有效 + 尾部多一段死数据」。
 *
 * 安全与可回滚
 *   - 首次安装前把**原始头部**逐字节备份到 <asar目录>\.dsh-restart-button-backup\
 *     （app.asar.header.bin + meta.json，含原始长度与 SHA256）；
 *   - restore 只在「当前文件 SHA256 == 上次打完补丁的 SHA256」时才动手，
 *     避免在客户端升级后拿旧备份把新 asar 写坏；
 *   - 任何一步校验失败都在**写盘之前**中止（锚点、标记、头部长度、JS 语法）。
 *
 * 用法
 *   node apply-shell-patch.mjs status  [--asar <app.asar>] [--backup-dir <dir>]
 *   node apply-shell-patch.mjs apply   [--asar <app.asar>] [--backup-dir <dir>] [--dry-run]
 *   node apply-shell-patch.mjs verify  [--asar <app.asar>]
 *   node apply-shell-patch.mjs restore [--asar <app.asar>] [--backup-dir <dir>]
 *   node apply-shell-patch.mjs check   [--asar <app.asar>]
 *
 * 退出码：0 = 成功 / 已就绪；非 0 = 失败（原因打在 stderr，未写盘）。
 *
 * 说明：asar 原地替换的整体思路与 DSH Plugin\dsh-pet-window\tools\asar-patch.mjs
 * 同源（同一作者的工作目录），本工具针对「重启键」重写并内置了补丁片段逻辑。
 */

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(HERE, '..', '..')
const DEFAULT_SPEC = path.join(PROJECT_ROOT, 'shell', 'patch-spec.json')
const BACKUP_DIR_NAME = '.dsh-restart-button-backup'

// ── 基础工具 ─────────────────────────────────────────────────────────────────

function say(line = '') {
  process.stdout.write(line + '\n')
}

function fail(line) {
  process.stderr.write(line + '\n')
  process.exit(1)
}

function sha256File(file) {
  const hash = createHash('sha256')
  const fd = fs.openSync(file, 'r')
  try {
    const buf = Buffer.allocUnsafe(4 * 1024 * 1024)
    let offset = 0
    for (;;) {
      const read = fs.readSync(fd, buf, 0, buf.length, offset)
      if (read <= 0) break
      hash.update(buf.subarray(0, read))
      offset += read
    }
  } finally {
    fs.closeSync(fd)
  }
  return hash.digest('hex')
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function parseArgs(argv) {
  const options = {
    mode: argv[0],
    asar: null,
    backupDir: null,
    spec: DEFAULT_SPEC,
    dryRun: false,
  }
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--asar') options.asar = argv[++i]
    else if (arg === '--backup-dir') options.backupDir = argv[++i]
    else if (arg === '--spec') options.spec = argv[++i]
    else if (arg === '--dry-run') options.dryRun = true
    else fail('未知参数：' + arg)
  }
  if (!['status', 'apply', 'verify', 'restore', 'check'].includes(options.mode || '')) {
    fail('用法：node apply-shell-patch.mjs status|apply|verify|restore|check [--asar <path>] [--backup-dir <dir>] [--dry-run]')
  }
  return options
}

/** 找 DSH 安装目录里的 app.asar（显式参数优先，其次常见安装位置）。 */
function resolveAsar(options) {
  if (options.asar) {
    const file = path.resolve(options.asar)
    if (!fs.existsSync(file)) fail('找不到 app.asar：' + file)
    return file
  }
  if (process.env.DSH_ASAR && fs.existsSync(process.env.DSH_ASAR)) return path.resolve(process.env.DSH_ASAR)
  const installDirs = [
    process.env.DSH_INSTALL_DIR,
    'D:\\DSH',
    'C:\\Program Files\\DeepSeek Harness',
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'DeepSeek Harness'),
  ].filter(Boolean)
  for (const dir of installDirs) {
    const candidate = path.join(dir, 'resources', 'app.asar')
    if (fs.existsSync(candidate)) return candidate
  }
  fail('没有自动找到 app.asar；请用 --asar 指定（例如 --asar "D:\\DSH\\resources\\app.asar"）')
}

function resolveBackupDir(options, asar) {
  if (options.backupDir) return path.resolve(options.backupDir)
  return path.join(path.dirname(asar), BACKUP_DIR_NAME)
}

// ── asar 读写（Header 结构见 asar-patch.mjs 的说明）────────────────────────────

const MAGIC_PICKLE = 8

function readHeader(fd) {
  const head = Buffer.alloc(16)
  if (fs.readSync(fd, head, 0, 16, 0) !== 16) throw new Error('asar: 头部不完整')
  const pickleSize = head.readUInt32LE(4)
  const jsonSize = head.readUInt32LE(12)
  if (!Number.isSafeInteger(pickleSize) || pickleSize <= 8) throw new Error('asar: pickle 尺寸异常 ' + pickleSize)
  if (!Number.isSafeInteger(jsonSize) || jsonSize <= 0) throw new Error('asar: JSON 尺寸异常 ' + jsonSize)
  const jsonBuf = Buffer.alloc(jsonSize)
  if (fs.readSync(fd, jsonBuf, 0, jsonSize, 16) !== jsonSize) throw new Error('asar: 头部 JSON 不完整')
  const text = jsonBuf.toString('utf8')
  let header
  try {
    header = JSON.parse(text)
  } catch (err) {
    throw new Error('asar: 头部不是合法 JSON：' + err.message)
  }
  return {
    header,
    jsonText: text,
    jsonSize,
    pickleSize,
    headerBytes: 8 + pickleSize,
    dataOffset: 8 + pickleSize,
    jsonOffset: 16,
  }
}

function findEntry(header, entryPath) {
  const parts = String(entryPath).split('/').filter(Boolean)
  let node = header
  for (const part of parts) {
    if (!node || !node.files || !node.files[part]) throw new Error('asar: 条目不存在：' + entryPath)
    node = node.files[part]
  }
  return node
}

function readEntryBytes(fd, info, entry) {
  if (entry.files) throw new Error('asar: 目标是目录，不是文件')
  if (entry.unpacked || entry.link) throw new Error('asar: 目标是 unpacked/link 条目，本工具不支持')
  const size = Number(entry.size)
  const offset = Number(entry.offset)
  if (!Number.isSafeInteger(size) || !Number.isSafeInteger(offset)) throw new Error('asar: 条目 offset/size 异常')
  const buf = Buffer.alloc(size)
  if (size > 0 && fs.readSync(fd, buf, 0, size, info.dataOffset + offset) !== size) throw new Error('asar: 条目内容不完整')
  return buf
}

function integrityFor(buf, previous) {
  const blockSize = previous && Number.isSafeInteger(previous.blockSize) && previous.blockSize > 0 ? previous.blockSize : 4194304
  const blocks = []
  for (let off = 0; off < buf.length; off += blockSize) {
    blocks.push(createHash('sha256').update(buf.subarray(off, Math.min(off + blockSize, buf.length))).digest('hex'))
  }
  if (buf.length === 0) blocks.push(createHash('sha256').update(buf).digest('hex'))
  return { algorithm: 'SHA256', hash: createHash('sha256').update(buf).digest('hex'), blockSize, blocks }
}

/** 序列化头部（长度必须不超过原 jsonSize；短了用空格补齐，JSON.parse 忽略）。 */
function serializeHeader(header, jsonSize) {
  const text = JSON.stringify(header)
  if (text.length > jsonSize) {
    throw new Error(
      `新的头部 JSON 有 ${text.length} 字节，但原头部只有 ${jsonSize} 字节的固定空间；` +
        '本工具只能原地改头部、不能扩容（可先升级本工具，或改用整套 asar 重写方案）',
    )
  }
  return text + ' '.repeat(jsonSize - text.length)
}

// ── 补丁片段逻辑（纯函数，方便单测）──────────────────────────────────────────

/**
 * 从一个文件的文本里摘掉旧的补丁块（按 BEGIN/END 标记）。
 * @returns {{ text: string, removed: boolean }}
 */
export function stripPatchBlock(text, startMarker, endMarker) {
  const begin = text.indexOf(startMarker)
  const end = text.indexOf(endMarker)
  if (begin < 0 && end < 0) return { text, removed: false }
  if (begin < 0 || end < 0) throw new Error('补丁标记不完整：只找到 BEGIN/END 中的一个，拒绝继续（避免写坏文件）')
  if (end < begin) throw new Error('补丁标记顺序异常（END 在 BEGIN 之前），拒绝继续')
  if (text.indexOf(startMarker, begin + startMarker.length) >= 0 || text.indexOf(endMarker, end + endMarker.length) >= 0) {
    throw new Error('补丁标记出现多次，拒绝继续（请用原始 app.asar 重新安装）')
  }
  const blockStart = text.lastIndexOf('\n', begin) + 1
  const endMarkerEnd = end + endMarker.length
  let blockEnd = text.indexOf('\n', endMarkerEnd)
  blockEnd = blockEnd < 0 ? text.length : blockEnd + 1
  return { text: text.slice(0, blockStart) + text.slice(blockEnd), removed: true }
}

/**
 * 把补丁块插进一个文件的文本：先摘旧块，再按 insert 方向插新块。
 * @returns {{ text: string, removed: boolean }}
 */
export function insertPatchBlock(text, startMarker, endMarker, snippetLines, anchor, insert) {
  const stripped = stripPatchBlock(text, startMarker, endMarker)
  const base = stripped.text
  const block = snippetLines.join('\n')
  const at = base.indexOf(anchor)
  if (at < 0) throw new Error('找不到插入锚点（客户端版本可能已变化）：' + JSON.stringify(anchor))
  if (base.indexOf(anchor, at + 1) >= 0) throw new Error('插入锚点出现多次，拒绝继续：' + JSON.stringify(anchor))
  let next
  if (insert === 'before') {
    next = base.slice(0, at) + block + '\n' + base.slice(at)
  } else if (insert === 'after') {
    const end = at + anchor.length
    next = base.slice(0, end) + '\n' + block + base.slice(end)
  } else {
    throw new Error('patch-spec 的 insert 只能是 before / after，收到：' + insert)
  }
  // 插完自检：BEGIN/END 各出现一次；原锚点还在。
  const count = (needle) => next.split(needle).length - 1
  if (count(startMarker) !== 1) throw new Error('插入后 BEGIN 标记数量异常：' + count(startMarker))
  if (count(endMarker) !== 1) throw new Error('插入后 END 标记数量异常：' + count(endMarker))
  if (!next.includes(anchor)) throw new Error('插入后原锚点丢失，拒绝继续')
  return { text: next, removed: stripped.removed }
}

/** 对单个文件计算「打完补丁后的文本」。 */
export function patchFileText(originalText, entry, snippetsDir) {
  const snippetPath = path.join(snippetsDir, entry.snippet)
  const snippetText = fs.readFileSync(snippetPath, 'utf8').replace(/\r\n/g, '\n').replace(/\s+$/u, '')
  if (snippetText === '') throw new Error('补丁片段为空：' + snippetPath)
  const snippetLines = snippetText.split('\n')
  if (!snippetLines.some((line) => line.includes(entry.startMarker))) throw new Error('补丁片段里没有 BEGIN 标记：' + snippetPath)
  if (!snippetLines.some((line) => line.includes(entry.endMarker))) throw new Error('补丁片段里没有 END 标记：' + snippetPath)
  const result = insertPatchBlock(originalText, entry.startMarker, entry.endMarker, snippetLines, entry.anchor, entry.insert)
  for (const needle of entry.verifyContains || []) {
    if (!result.text.includes(needle)) throw new Error('打完补丁后找不到预期内容：' + needle)
  }
  return result
}

/** 用 node --check 做语法检查（ESM 用 .mjs，CJS 用 .cjs）。 */
function syntaxCheck(text, kind, label) {
  const ext = kind === 'module' ? '.mjs' : '.cjs'
  const file = path.join(os.tmpdir(), `dsh-restart-check-${process.pid}-${Date.now()}${ext}`)
  fs.writeFileSync(file, text)
  try {
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' })
    if (result.status !== 0) {
      throw new Error('语法检查失败（' + label + '）：' + (result.stderr || result.stdout || '').trim())
    }
  } finally {
    try {
      fs.unlinkSync(file)
    } catch (err) {}
  }
}

// ── 备份 ─────────────────────────────────────────────────────────────────────

function backupMetaPath(backupDir) {
  return path.join(backupDir, 'meta.json')
}

function backupHeaderPath(backupDir, asar) {
  return path.join(backupDir, path.basename(asar) + '.header.bin')
}

function readBackupMeta(backupDir) {
  const file = backupMetaPath(backupDir)
  if (!fs.existsSync(file)) return null
  return readJson(file)
}

function writeBackup(backupDir, asar, info, originalSha, patchedSha) {
  fs.mkdirSync(backupDir, { recursive: true })
  const header = Buffer.alloc(info.headerBytes)
  const fd = fs.openSync(asar, 'r')
  try {
    fs.readSync(fd, header, 0, header.length, 0)
  } finally {
    fs.closeSync(fd)
  }
  fs.writeFileSync(backupHeaderPath(backupDir, asar), header)
  const meta = {
    asar,
    originalSize: fs.statSync(asar).size,
    originalSha256: originalSha,
    patchedSha256: patchedSha || null,
    headerBytes: info.headerBytes,
    jsonSize: info.jsonSize,
    pickleSize: info.pickleSize,
    patchVersion: null,
    at: new Date().toISOString(),
  }
  fs.writeFileSync(backupMetaPath(backupDir), JSON.stringify(meta, null, 2) + '\n')
  return meta
}

function updateBackupMeta(backupDir, patchVersion, patchedSha) {
  const file = backupMetaPath(backupDir)
  const meta = readJson(file)
  meta.patchedSha256 = patchedSha
  meta.patchVersion = patchVersion
  meta.at = new Date().toISOString()
  fs.writeFileSync(file, JSON.stringify(meta, null, 2) + '\n')
}

function rotateBackup(backupDir) {
  if (!fs.existsSync(backupDir)) return null
  const target = backupDir + '-previous-' + new Date().toISOString().replace(/[:.]/g, '-')
  fs.renameSync(backupDir, target)
  return target
}

// ── 结构自检（与 asar-patch.mjs 的 check 同口径）──────────────────────────────

function structureProblems(asar) {
  const fd = fs.openSync(asar, 'r')
  const problems = []
  try {
    const info = readHeader(fd)
    const size = fs.fstatSync(fd).size
    const unpackedRoot = asar + '.unpacked'
    // 只有 .unpacked 目录真的存在时才校验 sidecar（离线演练/备份副本可能没有它）。
    const checkUnpacked = fs.existsSync(unpackedRoot)
    const ranges = []
    const walk = (node, prefix) => {
      for (const [name, entry] of Object.entries(node.files || {})) {
        const p = prefix ? prefix + '/' + name : name
        if (entry.files) {
          walk(entry, p)
          continue
        }
        if (entry.link) continue
        if (entry.unpacked) {
          if (checkUnpacked && !fs.existsSync(path.join(unpackedRoot, p))) problems.push('unpacked 缺 sidecar：' + p)
          continue
        }
        const start = info.dataOffset + Number(entry.offset)
        const end = start + Number(entry.size)
        if (!Number.isFinite(start) || !Number.isFinite(end)) problems.push('offset/size 非数字：' + p)
        else if (start < info.dataOffset) problems.push('offset 落在数据区之前：' + p)
        else if (end > size) problems.push('条目越过文件末尾：' + p)
        else ranges.push({ p, start, end })
      }
    }
    walk(info.header, '')
    ranges.sort((a, b) => a.start - b.start)
    for (let i = 1; i < ranges.length; i++) {
      if (ranges[i].start < ranges[i - 1].end) problems.push('条目区间重叠：' + ranges[i - 1].p + ' / ' + ranges[i].p)
    }
  } finally {
    fs.closeSync(fd)
  }
  return problems
}

// ── 主流程 ───────────────────────────────────────────────────────────────────

function loadPlan(options) {
  const asar = resolveAsar(options)
  const backupDir = resolveBackupDir(options, asar)
  const specPath = path.resolve(options.spec)
  if (!fs.existsSync(specPath)) fail('找不到补丁规格：' + specPath)
  const spec = readJson(specPath)
  const snippetsDir = path.dirname(specPath)
  const fd = fs.openSync(asar, 'r')
  let info
  const originals = new Map()
  try {
    info = readHeader(fd)
    for (const entry of spec.entries) {
      const node = findEntry(info.header, entry.asarPath)
      originals.set(entry.asarPath, readEntryBytes(fd, info, node))
    }
  } finally {
    fs.closeSync(fd)
  }
  const patches = []
  for (const entry of spec.entries) {
    const original = originals.get(entry.asarPath)
    const originalText = original.toString('utf8')
    if (originalText.includes('\uFFFD')) fail('条目不是合法 UTF-8 文本：' + entry.asarPath)
    let result
    try {
      result = patchFileText(originalText, entry, snippetsDir)
    } catch (err) {
      fail('补丁片段与当前客户端不匹配（' + entry.asarPath + '）：' + err.message)
    }
    syntaxCheck(result.text, entry.syntax, entry.asarPath)
    patches.push({
      entry,
      original,
      patched: Buffer.from(result.text, 'utf8'),
      removedOld: result.removed,
      alreadyPatched: originalText.includes(entry.startMarker),
      /** 当前内容已经恰好等于本项目补丁版本（重复安装时可跳过写盘）。 */
      unchanged: result.removed && result.text === originalText,
    })
  }
  return { asar, backupDir, spec, snippetsDir, info, patches }
}

/** 计算新文件尺寸 / 新头部（不写盘），失败在写盘前抛出。 */
function planWrite(asar, info, patches) {
  const originalSize = fs.statSync(asar).size
  let appendAt = originalSize
  const writes = []
  for (const patch of patches) {
    const node = findEntry(info.header, patch.entry.asarPath)
    if (node.files) throw new Error('目标是目录：' + patch.entry.asarPath)
    const nextOffset = String(appendAt - info.dataOffset)
    if (patch.original && String(node.offset).length !== nextOffset.length) {
      // 只是提示：偏移数字位数变化会让头部 JSON 变长，下面的长度检查会兜底。
    }
    node.offset = nextOffset
    node.size = patch.patched.length
    if (node.integrity) node.integrity = integrityFor(patch.patched, node.integrity)
    writes.push({ patch, offset: appendAt })
    appendAt += patch.patched.length
  }
  const headerText = serializeHeader(info.header, info.jsonSize)
  return { originalSize, newSize: appendAt, writes, headerText }
}

function commandApply(options) {
  const plan = loadPlan(options)
  const { asar, backupDir, spec, info, patches } = plan
  let write
  try {
    write = planWrite(asar, info, patches)
  } catch (err) {
    fail('无法生成新头部（未写盘）：' + err.message)
  }
  const currentSha = sha256File(asar)
  const meta = readBackupMeta(backupDir)
  let backupAction = 'create'
  if (meta) {
    if (currentSha === meta.originalSha256) backupAction = 'reuse'
    else if (currentSha === meta.patchedSha256) backupAction = 'reuse'
    else backupAction = 'rotate'
  }

  const unchanged = patches.every((patch) => patch.unchanged)
  const backupMatches = meta !== null && currentSha === meta.patchedSha256
  say(`DSH 安装目录 app.asar：${asar}`)
  if (unchanged && backupMatches) {
    say(`  文件大小：${write.originalSize} 字节（补丁已是当前版本，无需改动）`)
  } else {
    say(`  文件大小：${write.originalSize} → ${write.newSize} 字节`)
  }
  say(`  备份目录：${backupDir}（${backupAction === 'create' ? '新建' : backupAction === 'reuse' ? '沿用' : '轮换旧备份后新建'}）`)
  for (const patch of patches) {
    const action = patch.unchanged ? '（已是当前版本，无需改动）' : patch.removedOld ? '（替换旧补丁块）' : '（首次打补丁）'
    say(`  - ${patch.entry.asarPath}：${patch.original.length} → ${patch.patched.length} 字节` + action)
  }
  if (unchanged && backupMatches) {
    if (options.dryRun) {
      say('dry-run：补丁已是当前版本，无需写盘。')
    } else {
      say('PASS：补丁已经是当前版本（没有重复写入，app.asar 未改动）。')
    }
    return
  }
  if (options.dryRun) {
    say('dry-run：只做检查，不写任何文件。检查全部通过。')
    return
  }

  // 1) 备份（先于任何写入）
  if (backupAction === 'rotate') {
    const moved = rotateBackup(backupDir)
    say(`  ! 当前 app.asar 既不是原始状态也不是上次打完补丁的状态（客户端升级过？），旧备份已移到：${moved}`)
  }
  if (backupAction === 'create') {
    writeBackup(backupDir, asar, info, currentSha, null)
    say('  已备份原始头部与元数据（回滚依据）')
  }

  // 2) 追加新内容 + 改头部：先 append、后写头部（断电也保持文件有效）
  const fd = fs.openSync(asar, 'r+')
  try {
    for (const item of write.writes) {
      fs.writeSync(fd, item.patch.patched, 0, item.patch.patched.length, item.offset)
    }
    const headerBuf = Buffer.from(write.headerText, 'utf8')
    if (headerBuf.length !== info.jsonSize) throw new Error('头部补齐长度不符：' + headerBuf.length + ' != ' + info.jsonSize)
    fs.writeSync(fd, headerBuf, 0, headerBuf.length, info.jsonOffset)
    fs.fsyncSync(fd)
  } finally {
    fs.closeSync(fd)
  }

  // 3) 写后复验
  const problems = structureProblems(asar)
  if (problems.length > 0) fail('写盘后结构自检失败：\n  ' + problems.join('\n  '))
  const verifyFd = fs.openSync(asar, 'r')
  try {
    const verifyInfo = readHeader(verifyFd)
    for (const patch of patches) {
      const node = findEntry(verifyInfo.header, patch.entry.asarPath)
      const actual = readEntryBytes(verifyFd, verifyInfo, node)
      if (!actual.equals(patch.patched)) fail('写盘后复验失败：' + patch.entry.asarPath + ' 内容不一致')
    }
  } finally {
    fs.closeSync(verifyFd)
  }
  const patchedSha = sha256File(asar)
  updateBackupMeta(backupDir, spec.patchVersion, patchedSha)
  say(`PASS：桌面壳补丁已写入（补丁版本 ${spec.patchVersion}）`)
  say(`  新文件 SHA256：${patchedSha}`)
  say('  重启 DSH 桌面端后生效。')
}

function commandStatus(options) {
  const asar = resolveAsar(options)
  const backupDir = resolveBackupDir(options, asar)
  const specPath = path.resolve(options.spec)
  const spec = fs.existsSync(specPath) ? readJson(specPath) : null
  const fd = fs.openSync(asar, 'r')
  const rows = []
  try {
    const info = readHeader(fd)
    for (const entry of spec ? spec.entries : []) {
      const node = findEntry(info.header, entry.asarPath)
      const bytes = readEntryBytes(fd, info, node)
      const text = bytes.toString('utf8')
      rows.push({
        entry: entry.asarPath,
        bytes: bytes.length,
        patched: text.includes(entry.startMarker) && text.includes(entry.endMarker),
        markers: (text.split(entry.startMarker).length - 1) + '/' + (text.split(entry.endMarker).length - 1),
      })
    }
  } catch (err) {
    fail('读取 app.asar 失败：' + err.message)
  } finally {
    fs.closeSync(fd)
  }
  const meta = readBackupMeta(backupDir)
  const currentSha = sha256File(asar)
  say(`app.asar：${asar}`)
  say(`  当前 SHA256：${currentSha}`)
  say(`  文件大小：${fs.statSync(asar).size} 字节`)
  for (const row of rows) say(`  - ${row.entry}：${row.patched ? '已打补丁' : '未打补丁'}（标记 ${row.markers}）`)
  if (meta) {
    say(`  备份：${backupDir}`)
    say(`    原始 SHA256：${meta.originalSha256}`)
    say(`    补丁后 SHA256：${meta.patchedSha256 || '(未知)'}`)
  } else {
    say('  备份：无')
  }
  const patched = rows.length > 0 && rows.every((row) => row.patched)
  say(`状态：${patched ? 'PATCHED（补丁已安装）' : 'CLEAN（未打补丁）'}`)
  return patched ? 0 : 1
}

function commandVerify(options) {
  const asar = resolveAsar(options)
  const specPath = path.resolve(options.spec)
  const spec = readJson(specPath)
  const fd = fs.openSync(asar, 'r')
  const problems = []
  try {
    const info = readHeader(fd)
    for (const entry of spec.entries) {
      const node = findEntry(info.header, entry.asarPath)
      const text = readEntryBytes(fd, info, node).toString('utf8')
      const begin = text.split(entry.startMarker).length - 1
      const end = text.split(entry.endMarker).length - 1
      if (begin !== 1 || end !== 1) {
        problems.push(`${entry.asarPath}：补丁标记数量异常（BEGIN ${begin} / END ${end}）`)
        continue
      }
      if (!text.includes(entry.anchor)) problems.push(`${entry.asarPath}：锚点丢失`)
      for (const needle of entry.verifyContains || []) {
        if (!text.includes(needle)) problems.push(`${entry.asarPath}：缺少预期内容 ${needle}`)
      }
      // 语法检查
      try {
        syntaxCheck(text, entry.syntax, entry.asarPath)
      } catch (err) {
        problems.push(err.message)
      }
      // 与本项目当前补丁版本一致性：摘掉块再插回去，应当逐字节等于现状。
      try {
        const snippetPath = path.join(path.dirname(specPath), entry.snippet)
        const snippetText = fs.readFileSync(snippetPath, 'utf8').replace(/\r\n/g, '\n').replace(/\s+$/u, '')
        const rebuilt = insertPatchBlock(
          text,
          entry.startMarker,
          entry.endMarker,
          snippetText.split('\n'),
          entry.anchor,
          entry.insert,
        )
        if (rebuilt.text !== text) problems.push(`${entry.asarPath}：补丁内容与本项目当前版本不一致（请重新运行安装脚本）`)
      } catch (err) {
        problems.push(entry.asarPath + '：一致性检查失败：' + err.message)
      }
    }
  } finally {
    fs.closeSync(fd)
  }
  const structure = structureProblems(asar)
  problems.push(...structure)
  if (problems.length > 0) {
    for (const problem of problems) say('FAIL：' + problem)
    fail('体检未通过（' + problems.length + ' 项问题）')
  }
  say('PASS：桌面壳补丁完整有效（标记 / 锚点 / 预期内容 / JS 语法 / 与当前项目版本一致 / asar 结构）')
}

function commandRestore(options) {
  const asar = resolveAsar(options)
  const backupDir = resolveBackupDir(options, asar)
  const meta = readBackupMeta(backupDir)
  if (!meta) fail('没有备份，无法还原：' + backupDir)
  if (meta.asar !== asar) fail('备份属于另一个 app.asar：' + meta.asar)
  const headerPath = backupHeaderPath(backupDir, asar)
  if (!fs.existsSync(headerPath)) fail('备份头部缺失：' + headerPath)
  const headerBytes = fs.readFileSync(headerPath)
  if (headerBytes.length !== meta.headerBytes) fail('备份头部长度不符（备份可能损坏）')

  const currentSha = sha256File(asar)
  if (currentSha === meta.originalSha256) {
    say('当前 app.asar 已是原始状态，无需还原。')
    return
  }
  if (currentSha !== meta.patchedSha256) {
    fail(
      '拒绝还原：当前 app.asar 的 SHA256 既不是原始状态，也不是本补丁安装后的状态。\n' +
        `  当前：${currentSha}\n  原始：${meta.originalSha256}\n  补丁后：${meta.patchedSha256 || '(未知)'}\n` +
        '  可能原因：DSH 客户端升级过、或还有别的 asar 补丁。为安全起见未做任何改动。\n' +
        '  确认客户端升级过的话，直接删除该备份目录即可（新版本里补丁已经不存在）。',
    )
  }
  const currentSize = fs.statSync(asar).size
  if (currentSize < meta.originalSize) fail('当前 app.asar 比备份记录的原始文件还小，拒绝还原')
  const fd = fs.openSync(asar, 'r+')
  try {
    fs.writeSync(fd, headerBytes, 0, headerBytes.length, 0)
    fs.ftruncateSync(fd, meta.originalSize)
    fs.fsyncSync(fd)
  } finally {
    fs.closeSync(fd)
  }
  const restoredSha = sha256File(asar)
  if (restoredSha !== meta.originalSha256) fail('还原后 SHA256 与备份记录不一致：' + restoredSha)
  say('PASS：app.asar 已还原为打补丁前的原始文件（逐字节一致）。')
  say(`  SHA256：${restoredSha}`)
}

function commandCheck(options) {
  const asar = resolveAsar(options)
  const problems = structureProblems(asar)
  if (problems.length > 0) {
    for (const problem of problems) say('FAIL：' + problem)
    fail('asar 结构自检未通过')
  }
  say('PASS：asar 结构自检通过（所有条目偏移有效、无重叠、无缺失 sidecar）')
}

// ── 入口（被测试 import 时只导出函数，不执行 CLI）──────────────────────────────

/** 只有直接 `node apply-shell-patch.mjs ...` 时才走 CLI；import 时不执行。 */
function isMain() {
  try {
    return Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  } catch (err) {
    return false
  }
}

if (isMain()) {
  try {
    const options = parseArgs(process.argv.slice(2))
    if (options.mode === 'status') process.exitCode = commandStatus(options) ?? 0
    else if (options.mode === 'apply') commandApply(options)
    else if (options.mode === 'verify') commandVerify(options)
    else if (options.mode === 'restore') commandRestore(options)
    else if (options.mode === 'check') commandCheck(options)
  } catch (err) {
    fail('apply-shell-patch：' + (err && err.message ? err.message : String(err)))
  }
}
void MAGIC_PICKLE
