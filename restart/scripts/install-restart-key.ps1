<#
.SYNOPSIS
  DSH 重启键 · 桌面壳补丁安装（只装"真重启"能力）

.DESCRIPTION
  标题栏「重启」按钮的**界面半区已经并入 DSH UI Beautify v0.8.0+ 插件**：
  装上美化插件就会出现按钮（壳补丁缺失时点击会提示）。本脚本只负责另一半 ——
  **桌面壳补丁**：给 DSH 安装目录的 resources\app.asar 追加
    · lib/main.js      主进程 IPC  dsh-desktop:restart-app（校验来者/有任务先确认/app.relaunch）
    · lib/preload-app.cjs  preload 桥 window.dshDesktop.restart()
  其余上万个条目一个字节不动；补丁带 BEGIN/END 标记，可逐字节还原。

  按《DSH 插件作者安装卸载与外部副作用规范建议 v0.1》§3.3 实现：
    **绝不在 DSH 运行时写 app.asar** —— 检测到 DSH 在运行就启动一个独立编排进程
    （restore-on-exit.ps1，在 DSH 进程树里用 WMI 逃逸），由它等待 DSH 完全退出
    （进程为 0 且 app.asar 可独占打开，连续 3 次确认）→ 打补丁 → 校验 → 自动重启 DSH。
    打补丁前先备份原始头部（含 SHA256），补丁后记录 patchedSha256。

  装完 DSH 会自动重启；标题栏「应用」「编辑」右边出现「重启」。
  想先看会做什么：加 -DryRun（不改任何文件、不写日志）。

.PARAMETER InstallDir
  DSH 安装目录（含 "DeepSeek Harness.exe" 与 resources\app.asar）。默认自动探测。

.PARAMETER NodePath
  执行补丁脚本用的 node.exe。默认用 DSH 自带的 node 运行时。

.PARAMETER DryRun
  只打印将做什么，不改任何文件、不改 profile、不写日志。

.PARAMETER NoRestart
  操作完成后不自动重启 DSH（仍需你先完全退出 DSH 才能改 app.asar）。

.PARAMETER TimeoutSeconds
  等待 DSH 退出的最长时间（默认 3600 秒 = 60 分钟；壳补丁类建议 ≥ 3600）。

  退出码：0 = 成功（含"已是目标状态"）；1 = 失败；2 = 参数错误；
          3 = 等待超时；4 = 校验失败。
#>
[CmdletBinding()]
param(
  [string]$InstallDir = '',
  [string]$NodePath = '',
  [switch]$DryRun,
  [switch]$NoRestart,
  [int]$TimeoutSeconds = 3600
)

. (Join-Path $PSScriptRoot 'common.ps1')
Initialize-Common -LogName 'install' -DryRun:$DryRun
$ErrorActionPreference = 'Stop'

$projectRoot = Get-ProjectRoot
$tool = Join-Path $projectRoot 'shell\tools\apply-shell-patch.mjs'
$orchestrator = Join-Path $PSScriptRoot 'restore-on-exit.ps1'
$profileDir = Get-ProfileDir

Write-Log ''
Write-Log '=====================================================' 'DarkCyan'
Write-Log '  DSH 重启键 —— 桌面壳补丁安装（按钮 UI 已内置在美化插件）' 'DarkCyan'
Write-Log '=====================================================' 'DarkCyan'
Write-Info ('日志：' + $(if ($script:IsDryRun) { '（DryRun 不写日志）' } elseif ($script:LogPath) { $script:LogPath } else { '无' }))
if ($DryRun) { Write-DryInfo '本次为 DryRun：只打印，不改任何文件。' }
Write-Log (Get-ExitCodeHelp) 'DarkGray'

# ── 1) 参数与路径 ───────────────────────────────────────────────────────────
Write-Step '1/4  参数与路径'
if ($TimeoutSeconds -lt 10) { Fail-WithCode '参数错误：-TimeoutSeconds 必须 ≥ 10。' 2 -NoPopup }
foreach ($required in @($tool, $orchestrator)) {
  if (-not (Test-Path -LiteralPath $required)) { Fail-WithCode ('包文件不完整，找不到：' + $required) 2 }
}
try {
  $InstallDir = Resolve-DshInstallDir -InstallDir $InstallDir
  $NodePath = Resolve-NodePath -InstallDir $InstallDir -NodePath $NodePath
} catch {
  Fail-WithCode ('参数错误：' + $_.Exception.Message) 2
}
$asar = Join-Path $InstallDir 'resources\app.asar'
if (-not (Test-Path -LiteralPath $asar)) { Fail-WithCode ('找不到 app.asar：' + $asar) 2 }
Write-Ok ('DSH 安装目录：' + $InstallDir)
Write-Ok ('node：' + $NodePath)
Write-Ok ('desktop profile：' + $profileDir)

# 外部副作用声明（本包只有壳补丁这一半会写盘）
Write-Step '外部副作用声明'
Write-Log '  修改对象：DSH 安装目录 resources\app.asar 中两个已存在条目：'
Write-Log '            lib/main.js（主进程 IPC）与 lib/preload-app.cjs（preload 桥）'
Write-Log '  修改方式：只追加带 BEGIN/END 标记的补丁块，其余条目一个字节不动'
Write-Log '  在线还原：否 —— 改/还原 app.asar 必须 DSH 完全退出（运行中文件被独占锁定）'
Write-Log '  备份位置：<DSH 安装目录>\resources\.dsh-restart-button-backup\'
Write-Log '            （app.asar.header.bin + meta.json，含 originalSha256 / patchedSha256）'
Write-Log '  反向操作：restart\uninstall-restart-key.cmd（双 SHA 校验还原）'
Write-Log '  用户数据：无（不写任何用户数据目录）'
Write-Log '  插件半区：本包不安装任何插件包；按钮 UI 由已装的 DSH UI Beautify v0.8.0+ 提供'

# ── 2) 按钮 UI（美化插件）状态提示 ─────────────────────────────────────────
Write-Step '2/4  按钮 UI（美化插件）状态'
try {
  $manifest = Get-Content -LiteralPath (Join-Path $profileDir 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
  $beautifyVersion = ''
  if ($manifest.dependencies) {
    foreach ($property in $manifest.dependencies.PSObject.Properties) {
      if ($property.Name -eq 'dsh-ui-beautify') { $beautifyVersion = [string]$property.Value }
    }
  }
  if ($beautifyVersion) {
    $beautifyReal = Get-BeautifyVersion -ProfileDir $profileDir
    Write-Ok ('检测到 DSH UI Beautify：' + $(if ($beautifyReal) { 'v' + $beautifyReal } else { $beautifyVersion }) + '（标题栏按钮由它提供）')
  } else {
    Write-Warn 'profile 里没有 dsh-ui-beautify —— 即使装了壳补丁也不会出现按钮；请先安装 DSH UI Beautify v0.8.0+。'
  }
} catch {
  Write-Warn ('读取 profile 失败（不影响壳补丁安装）：' + $_.Exception.Message)
}

# ── 3) 壳补丁状态检查 ───────────────────────────────────────────────────────
Write-Step '3/4  桌面壳补丁状态检查'
$patchCurrent = $false
$statusResult = Invoke-Capture -FilePath $NodePath -Arguments @($tool, 'status', '--asar', $asar)
Write-Captured $statusResult
if ($statusResult.Code -eq 0) {
  $verifyResult = Invoke-Capture -FilePath $NodePath -Arguments @($tool, 'verify', '--asar', $asar)
  if ($verifyResult.Code -eq 0) {
    $patchCurrent = $true
    Write-Ok '桌面壳补丁已是当前版本（跳过写入，幂等）。'
  } else {
    Write-Captured $verifyResult
    Write-Warn '补丁已存在但版本不一致：将重新应用。'
  }
} else {
  Write-Info 'app.asar 当前未打补丁：需要应用桌面壳补丁。'
}

if ($patchCurrent) {
  Write-Step '4/4  无需改动'
  Write-Ok '已是目标状态（壳补丁为当前版本），无需改动。'
  if (-not (Test-DshRunning)) { Write-Info 'DSH 当前未运行；打开后即可看到标题栏「重启」按钮。' }
  Write-ScriptFooter '安装完成（无改动）。'
  exit 0
}

if ($DryRun) {
  Write-Step '4/4  DryRun'
  Write-DryInfo '将启动独立编排进程：等待 DSH 完全退出 → 应用桌面壳补丁 → 校验 SHA256 → 自动重启 DSH。'
  Write-ScriptFooter 'DryRun 完成：未写任何文件。'
  exit 0
}

# ── 4) 应用补丁：DSH 已退出就同步做；否则交给独立编排进程 ───────────────────
$orchestratorArgs = @(
  '-Action', 'install',
  '-InstallDir', $InstallDir,
  '-NodePath', $NodePath,
  '-ProjectDir', $projectRoot,
  '-TimeoutSeconds', [string]$TimeoutSeconds,
  '-SkipProfileCheck'
)
if ($script:LogPath) { $orchestratorArgs += @('-LogPath', $script:LogPath) }
if ($NoRestart) { $orchestratorArgs += '-NoRestart' }

if (-not (Test-DshRunning) -and (Test-AsarExclusive -AsarPath $asar)) {
  Write-Step '4/4  应用桌面壳补丁（DSH 已退出，直接执行）'
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    & (Get-PowerShellExe) -NoProfile -ExecutionPolicy Bypass -File $orchestrator @($orchestratorArgs + @('-NoPopup'))
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previous
  }
  if ($exitCode -ne 0) { exit $exitCode }
  Write-ScriptFooter '安装完成：桌面壳补丁已应用，DSH 已重新启动。'
  exit 0
}

Write-Step '4/4  需要 DSH 完全退出：启动独立编排进程'
Write-Warn '按规范，绝不在 DSH 运行时写 app.asar。'
Write-Info '将启动一个独立进程：等待 DSH 完全退出（托盘右键 → 退出）→ 打补丁 → 校验 → 自动重启 DSH。'
Write-Info '它不在 DSH 的进程树里，DSH 退出不会把它一起杀掉；完成后会弹窗提示。'
try {
  $worker = Start-DetachedWorker -WorkerPath $orchestrator -Arguments $orchestratorArgs
} catch {
  Fail-WithCode ('无法启动独立编排进程：' + $_.Exception.Message) 1
}
Write-Ok ('独立编排进程已启动（' + $worker.Mode + '，PID ' + $worker.ProcessId + '）。')
Write-Log ''
Write-Log '  接下来请：' 'Yellow'
Write-Log '    1) 右键系统托盘里的 DSH 图标 → 退出（只关窗口只是隐藏到托盘）；' 'Yellow'
Write-Log '    2) 等自动重启完成（会弹窗提示）；也可以关闭本窗口，后台进程不会中断。' 'Yellow'
Write-Log ''
Write-ScriptFooter '安装编排已启动（DSH 退出后自动完成补丁 + 重启）。'
exit 0
