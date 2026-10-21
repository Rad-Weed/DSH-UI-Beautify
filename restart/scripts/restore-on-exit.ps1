<#
.SYNOPSIS
  DSH 重启键 · 独立编排进程：等 DSH 完全退出 → 应用/还原 app.asar → 校验 → 清理 → 自动重启。

.DESCRIPTION
  对应《DSH 插件作者安装卸载与外部副作用规范建议 v0.1》：
    §3.3 M3 壳补丁专项契约：绝不在 DSH 运行时写 app.asar；等退出、双 SHA 校验、重启；
            等待方必须是独立进程（WMI Win32_Process.Create 逃逸）
    §3.4 M4 卸载后四件套 + 联接自检清理
    §3.6 M6 等待/超时/日志/弹窗/退出码

  本脚本不直接给用户双击 —— 由 install/uninstall 主脚本按需启动：
    - 在 DSH 进程树里（agent / 内置终端）：WMI 逃逸成独立进程，DSH 退出不会杀掉它；
    - 用户双击（不在 DSH 树里）：普通后台进程。
  父脚本通过 -LogPath 让本进程续写同一个日志。

.PARAMETER Action
  install = 打桌面壳补丁 + 校验；restore = 还原 app.asar + 双 SHA 校验 + 清理备份。

.PARAMETER AsarPath / BackupDir / NodePath / ProjectDir
  覆盖默认路径（自测时指向迷你 asar 用；默认从 -InstallDir 推导）。

.PARAMETER ProcessName
  等待退出的进程名（默认 "DeepSeek Harness"；自测可传一个不存在的名字跳过真实等待）。

.PARAMETER NoRestart
  操作完成后不自动重启 DSH。

.PARAMETER NoPopup
  不弹结果窗（主脚本同步调用时用）。

.PARAMETER SkipProfileCheck
  restore 时跳过「四件套 + 联接」最终断言（用户 -SkipPlugin 时由主脚本传入）。

.PARAMETER KeepBackup
  restore 成功后保留备份目录（默认删除，符合 §3.3「直到还原成功并校验」）。

.PARAMETER DryRun
  只打印将做什么，不改任何文件、不写日志。

.PARAMETER SkipWait
  跳过「等 DSH 完全退出」（仅限 -Force 语义下使用；运行中写 app.asar 会失败，工具会拒绝）。

  退出码：0 = 成功；1 = 失败；2 = 参数错误；3 = 等待超时；4 = 校验失败。
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][ValidateSet('install', 'restore', 'restart')][string]$Action,
  [string]$InstallDir = '',
  [string]$AsarPath = '',
  [string]$BackupDir = '',
  [string]$NodePath = '',
  [string]$ProjectDir = '',
  [string]$ProcessName = 'DeepSeek Harness',
  [int]$TimeoutSeconds = 3600,
  [switch]$NoRestart,
  [switch]$NoPopup,
  [switch]$SkipProfileCheck,
  [switch]$KeepBackup,
  [switch]$SkipWait,
  [switch]$DryRun,
  [string]$LogPath = ''
)

# 注意：不要在 dot-source 之前/之后使用同名 $LogPath 变量 —— common.ps1 顶层的
# $script:LogPath = $null 会写进调用方脚本作用域，把同名参数清空。先存到独立变量里。
$requestedLogPath = [string]$LogPath
. (Join-Path $PSScriptRoot 'common.ps1')
if ($ProjectDir) { $script:ProjectRoot = $ProjectDir }
if ($requestedLogPath) { Set-CommonLogPath -LogPath $requestedLogPath -DryRun:$DryRun }
else { Initialize-Common -LogName ('restore-on-exit-' + $Action) -DryRun:$DryRun }
$script:DshProcessName = $ProcessName

$exitCode = 0
$packageName = 'dsh-restart-button'
$tool = Join-Path $script:ProjectRoot 'shell\tools\apply-shell-patch.mjs'

<#
统一收尾：写日志、成功/失败弹窗、按约定退出码退出。
#>
function Finish-Orchestrator {
  param(
    [int]$Code = 0,
    [string]$Message = '',
    [int]$Icon = 64
  )
  if ($Message) {
    if ($Code -eq 0) { Write-Ok $Message } else { Write-ErrInfo $Message }
  }
  if (-not $NoPopup -and -not $DryRun -and $Message) {
    Show-Popup -Title ('DSH 重启键 · ' + $Action) -Text $Message -Icon $Icon
  }
  Write-Log ('退出码：' + $Code) 'DarkGray'
  exit $Code
}


function Read-BackupMeta {
  param([string]$BackupDirectory)
  $metaPath = Join-Path $BackupDirectory 'meta.json'
  if (-not (Test-Path -LiteralPath $metaPath)) { return $null }
  try { return (Get-Content -LiteralPath $metaPath -Raw -Encoding UTF8 | ConvertFrom-Json) } catch { return $null }
}

# ── 0) 参数与路径 ───────────────────────────────────────────────────────────

Write-Step ('独立编排进程启动（Action=' + $Action + '，PID ' + $PID + '）')
if (-not $InstallDir) {
  try { $InstallDir = Resolve-DshInstallDir } catch { Finish-Orchestrator -Code 2 -Message ('参数错误：' + $_.Exception.Message) -Icon 16 }
}
if (-not (Test-Path -LiteralPath (Join-Path $InstallDir 'resources'))) {
  Finish-Orchestrator -Code 2 -Message ('参数错误：安装目录看起来不对（缺 resources）：' + $InstallDir) -Icon 16
}
if (-not $AsarPath) { $AsarPath = Join-Path $InstallDir 'resources\app.asar' }
if (-not $BackupDir) { $BackupDir = Join-Path $InstallDir 'resources\.dsh-restart-button-backup' }
if (-not $NodePath) {
  try { $NodePath = Resolve-NodePath -InstallDir $InstallDir } catch { Finish-Orchestrator -Code 2 -Message ('参数错误：' + $_.Exception.Message) -Icon 16 }
}
if (-not (Test-Path -LiteralPath $AsarPath)) {
  Finish-Orchestrator -Code 2 -Message ('参数错误：找不到 app.asar：' + $AsarPath) -Icon 16
}
if (-not (Test-Path -LiteralPath $tool)) {
  Finish-Orchestrator -Code 2 -Message ('参数错误：找不到补丁工具：' + $tool) -Icon 16
}
if ($TimeoutSeconds -lt 10) {
  Finish-Orchestrator -Code 2 -Message '参数错误：-TimeoutSeconds 必须 ≥ 10。' -Icon 16
}

Write-Info ('DSH 安装目录：' + $InstallDir)
Write-Info ('app.asar：' + $AsarPath)
Write-Info ('备份目录：' + $BackupDir)
Write-Info ('node：' + $NodePath)
Write-Info ('本进程是否在 DSH 进程树里：' + $(if (Test-InsideDshTree) { '是' } else { '否（独立启动）' }))
if ($script:IsDryRun) {
  Write-DryInfo ('DryRun：将等待 DSH 退出，然后执行 ' + $Action + '；本次不改任何文件。')
  Finish-Orchestrator -Code 0 -Message ''
}

# ── 1) 等 DSH 完全退出（§3.3 M3：绝不在运行中写 app.asar）───────────────────

if ($SkipWait) {
  Write-Warn '已指定 -SkipWait：跳过等待，直接尝试操作（仅 -Force 语义下使用；运行中写 app.asar 会被工具拒绝）。'
} else {
  Write-Step '等待 DSH 完全退出（进程为 0 且 app.asar 可独占打开，连续 3 次确认）'
  if (-not (Wait-DshFullyExited -AsarPath $AsarPath -TimeoutSeconds $TimeoutSeconds)) {
    Finish-Orchestrator -Code 3 -Message ('等待超时：DSH 仍在运行或 app.asar 仍被占用，本次没有修改 app.asar。可稍后重新运行安装/卸载脚本。') -Icon 48
  }
}

# ── 2) 执行动作 ─────────────────────────────────────────────────────────────

if ($Action -eq 'restart') {
  Write-Step '无需改动 app.asar：只重启 DSH'
} elseif ($Action -eq 'install') {
  Write-Step '应用桌面壳补丁（原地追加 lib/main.js + lib/preload-app.cjs 两个条目）'
  $beforeSha = Get-Sha256OfFile $AsarPath
  Write-Info ('当前 app.asar SHA256：' + $beforeSha)
  $applyResult = Invoke-Capture -FilePath $NodePath -Arguments @($tool, 'apply', '--asar', $AsarPath, '--backup-dir', $BackupDir)
  Write-Captured $applyResult
  if ($applyResult.Code -ne 0) {
    Finish-Orchestrator -Code 1 -Message ('桌面壳补丁写入失败（未写坏文件；可重试）。退出码 ' + $applyResult.Code + '，日志见下。') -Icon 16
  }
  $verifyResult = Invoke-Capture -FilePath $NodePath -Arguments @($tool, 'verify', '--asar', $AsarPath)
  Write-Captured $verifyResult
  if ($verifyResult.Code -ne 0) {
    Finish-Orchestrator -Code 4 -Message '补丁校验失败（标记/锚点/语法/结构与预期不符）。备份已保留，可运行 scripts\uninstall-restart-key.ps1 还原（开发者）。' -Icon 16
  }
  $meta = Read-BackupMeta -BackupDirectory $BackupDir
  $afterSha = Get-Sha256OfFile $AsarPath
  Write-Ok ('桌面壳补丁已应用并通过校验。补丁后 SHA256：' + $afterSha)
  if ($meta) { Write-Info ('备份记录：原始 SHA256 ' + $meta.originalSha256) }
} elseif ($Action -eq 'restore') {
  Write-Step '还原 app.asar（恢复到打补丁前的原始文件）'
  $meta = Read-BackupMeta -BackupDirectory $BackupDir
  if (-not $meta) {
    # 没有备份：只有两种情况可以继续 —— 已经是原始状态；或者根本没有补丁。
    $statusResult = Invoke-Capture -FilePath $NodePath -Arguments @($tool, 'status', '--asar', $AsarPath)
    Write-Captured $statusResult
    $patched = ($statusResult.Code -eq 0)
    if ($patched) {
      Finish-Orchestrator -Code 4 -Message ('app.asar 上仍有补丁标记，但备份目录不存在（无法确认原始 SHA256），拒绝盲还原。请人工核对：' + $BackupDir) -Icon 16
    }
    Write-Ok 'app.asar 已经是原始状态（没有补丁标记），无需还原。'
  } else {
    $currentSha = Get-Sha256OfFile $AsarPath
    Write-Info ('当前 app.asar SHA256：' + $currentSha)
    if ($currentSha -eq $meta.originalSha256) {
      Write-Ok 'app.asar 已经等于打补丁前的原始文件，无需还原（仅清理备份记录）。'
    } elseif ($currentSha -eq $meta.patchedSha256) {
      $restoreResult = Invoke-Capture -FilePath $NodePath -Arguments @($tool, 'restore', '--asar', $AsarPath, '--backup-dir', $BackupDir)
      Write-Captured $restoreResult
      if ($restoreResult.Code -ne 0) {
        Finish-Orchestrator -Code 1 -Message '还原失败。备份已保留，可重试或运行 scripts\uninstall-restart-key.ps1（开发者）。' -Icon 16
      }
      $restoredSha = Get-Sha256OfFile $AsarPath
      if ($restoredSha -ne $meta.originalSha256) {
        Finish-Orchestrator -Code 4 -Message ('还原后 SHA256 校验失败！当前 ' + $restoredSha + '，预期 ' + $meta.originalSha256 + '。备份已保留，请勿删除。') -Icon 16
      }
      Write-Ok ('app.asar 已逐字节还原为原始文件（SHA256 ' + $restoredSha + '）。')
    } else {
      Finish-Orchestrator -Code 4 -Message ('拒绝还原：当前 app.asar SHA256 既不是原始值也不是补丁后值（DSH 升级过？）。本次未做任何改动，备份保留：' + $BackupDir) -Icon 48
    }
    # 还原成功或本来就是原始状态：删除备份（§3.3：直到还原成功并校验）
    if (-not $KeepBackup) {
      try {
        Remove-Item -LiteralPath $BackupDir -Recurse -Force -ErrorAction Stop
        Write-Ok '已删除备份目录（还原已成功并校验）。'
      } catch {
        Write-Warn ('备份目录删除失败（不影响使用，可手动删）：' + $BackupDir)
      }
    } else {
      Write-Warn ('已按 -KeepBackup 保留备份：' + $BackupDir)
    }
  }

  # 最终断言：插件管理四件套 + 联接（§3.4 M4）
  if (-not $SkipProfileCheck) {
    $profileOk = Invoke-ProfileCleanup -ProfileDir (Get-ProfileDir) -PackageName $packageName -Fix
    if (-not $profileOk) {
      $exitCode = 4
      Write-ErrInfo '四件套/联接仍有残留 —— 按退出码 4 处理（app.asar 已还原，可重跑卸载脚本做最后一次清理）。'
    }
  }
} else {
  Finish-Orchestrator -Code 2 -Message ('参数错误：未知 Action ' + $Action) -Icon 16
}

# ── 3) 自动重启 DSH ─────────────────────────────────────────────────────────

if ($NoRestart) {
  Write-Warn '已指定 -NoRestart：不自动启动 DSH。'
} else {
  Write-Step '重新启动 DSH 桌面端'
  $started = Start-DshApplication -InstallDir $InstallDir
  if (-not $started) { $exitCode = 1 }
}

if ($exitCode -eq 0) {
  $doneText = 'app.asar 已还原'
  if ($Action -eq 'install') { $doneText = '桌面壳补丁已应用' }
  if ($Action -eq 'restart') { $doneText = '状态已就绪，仅重启了 DSH' }
  Finish-Orchestrator -Code 0 -Message ('完成：' + $doneText + '，DSH 已重新启动。') -Icon 64
} else {
  Finish-Orchestrator -Code $exitCode -Message '操作部分完成：app.asar 已处理，但四件套清理仍有残留（详见日志）。' -Icon 48
}
