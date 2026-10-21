<#
.SYNOPSIS
  卸载「DSH 重启键」：移除插件包、清理 profile 残留、还原 app.asar、重启 DSH。

.DESCRIPTION
  按《DSH 插件作者安装卸载与外部副作用规范建议 v0.1》实现（M1/M3/M4/M5/M6）：

    1. 从 desktop profile 移除插件包（官方通道）；已移除则跳过（幂等，避免重复跑 pnpm）。
    2. 卸载后自检并清理「四件套 + 联接」：package.json(dependencies/bundles)、
       pnpm-lock.yaml、node_modules\.modules.yaml、cordis.yml、node_modules\<包> 联接。
    3. **绝不在 DSH 运行时写 app.asar**：需要还原时启动独立编排进程
       （restore-on-exit.ps1，在 DSH 进程树里用 WMI 逃逸），由它等待 DSH 完全退出
       （进程为 0 且 app.asar 可独占打开、连续 3 次确认）→ 双 SHA 校验 → 还原 →
       校验 SHA256 == 原始值 → 删除备份 → 自动重启 DSH。
    4. 用户数据：本插件**无用户数据**（-PurgeData 只会打印说明）。

  卸载脚本可重入：任意中间状态（插件已删/未删、补丁已还原/未还原、备份已删/未删）
  都能安全收敛；连跑第二次只输出「已是目标状态」并 exit 0。
  先看会做什么：加 -DryRun（不改任何文件、不写日志）。

.PARAMETER InstallDir
  DSH 安装目录。默认自动探测。

.PARAMETER NodePath
  执行补丁脚本用的 node.exe。默认用 DSH 自带的 node 运行时。

.PARAMETER SkipPlugin
  只还原桌面壳补丁，不清理插件包/四件套。

.PARAMETER SkipShellPatch
  只移除插件包，不还原 app.asar。

.PARAMETER Force
  跳过「等 DSH 退出」的编排，直接尝试还原（仅用于已确认 DSH 没在跑的情况；
  运行中写 app.asar 会被补丁工具拒绝）。

.PARAMETER KeepBackup
  还原成功后保留备份目录（默认删除；§3.3 要求"直到还原成功并校验"）。

.PARAMETER NoRestart
  操作完成后不自动重启 DSH。

.PARAMETER PurgeData
  清除用户数据（本插件无用户数据，只会打印说明）。

.PARAMETER TimeoutSeconds
  等待 DSH 退出的最长时间（默认 3600 秒 = 60 分钟）。

.PARAMETER PnpmTimeoutSeconds
  pnpm 移除命令的超时（默认 1800 秒）。pnpm 走 registry 时可能静默数分钟。

  退出码：0 = 成功（含"已是目标状态"）；1 = 失败；2 = 参数错误；
          3 = 等待超时；4 = 校验失败。

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\uninstall-restart-key.ps1
  powershell -ExecutionPolicy Bypass -File .\scripts\uninstall-restart-key.ps1 -DryRun
#>
[CmdletBinding()]
param(
  [string]$InstallDir = '',
  [string]$NodePath = '',
  [switch]$SkipPlugin,
  [switch]$SkipShellPatch,
  [switch]$Force,
  [switch]$KeepBackup,
  [switch]$NoRestart,
  [switch]$PurgeData,
  [switch]$DryRun,
  [int]$TimeoutSeconds = 3600,
  [int]$PnpmTimeoutSeconds = 1800
)

. (Join-Path $PSScriptRoot 'common.ps1')
Initialize-Common -LogName 'uninstall' -DryRun:$DryRun
$ErrorActionPreference = 'Stop'

$projectRoot = Get-ProjectRoot
$packageName = 'dsh-restart-button'
$tool = Join-Path $projectRoot 'shell\tools\apply-shell-patch.mjs'
$orchestrator = Join-Path $PSScriptRoot 'restore-on-exit.ps1'
$profileDir = Get-ProfileDir
$exitCode = 0
$pluginChanged = $false

Write-Log ''
Write-Log '=====================================================' 'DarkCyan'
Write-Log '  DSH 重启键 —— 卸载' 'DarkCyan'
Write-Log '=====================================================' 'DarkCyan'
Write-Info ('日志：' + $(if ($script:IsDryRun) { '（DryRun 不写日志）' } elseif ($script:LogPath) { $script:LogPath } else { '无' }))
if ($DryRun) { Write-DryInfo '本次为 DryRun：只打印，不改任何文件、不改 profile。' }
Write-Log (Get-ExitCodeHelp) 'DarkGray'

# ── 1) 参数与路径 ───────────────────────────────────────────────────────────
Write-Step '1/5  参数与路径'
if ($TimeoutSeconds -lt 10) { Fail-WithCode '参数错误：-TimeoutSeconds 必须 ≥ 10。' 2 -NoPopup }
if ($PnpmTimeoutSeconds -lt 10) { Fail-WithCode '参数错误：-PnpmTimeoutSeconds 必须 ≥ 10。' 2 -NoPopup }
foreach ($required in @($tool, $orchestrator)) {
  if (-not (Test-Path -LiteralPath $required)) { Fail-WithCode ('项目文件不完整，找不到：' + $required) 2 }
}
try {
  $InstallDir = Resolve-DshInstallDir -InstallDir $InstallDir
  $NodePath = Resolve-NodePath -InstallDir $InstallDir -NodePath $NodePath
} catch {
  Fail-WithCode ('参数错误：' + $_.Exception.Message) 2
}
$asar = Join-Path $InstallDir 'resources\app.asar'
$backupDir = Join-Path $InstallDir 'resources\.dsh-restart-button-backup'
$dshCli = Join-Path $InstallDir 'resources\runtime\cli\bin\dsh.cmd'
Write-Ok ('DSH 安装目录：' + $InstallDir)
Write-Ok ('node：' + $NodePath)
Write-Ok ('desktop profile：' + $profileDir)
Write-Log ''
Write-Log '  本插件的外部副作用：只改 resources\app.asar 里 lib/main.js、lib/preload-app.cjs 两个条目；' 'DarkGray'
Write-Log '  备份在 resources\.dsh-restart-button-backup\；无用户数据。' 'DarkGray'

# ── 2) 移除插件包（幂等）────────────────────────────────────────────────────
if ($SkipPlugin) {
  Write-Step '2/5  移除 DSH 插件包（已按 -SkipPlugin 跳过）'
} else {
  Write-Step '2/5  移除 DSH 插件包'
  $state = Get-ProfileReferenceState -ProfileDir $profileDir -PackageName $packageName
  $hasAnyReference = ((Get-ProfileReferenceCount -State $state) -gt 0)
  if (-not $hasAnyReference) {
    Write-Ok '插件包已不在 profile（依赖/组合包/锁文件/联接均无引用），跳过 pnpm（幂等）。'
  } else {
    if ($DryRun) {
      Write-DryInfo '将执行：dsh plugin --profile desktop remove dsh-restart-button（清理四件套 + 联接）'
    } else {
      if (-not (Test-Path -LiteralPath $dshCli)) {
        Fail-WithCode ('找不到 dsh 命令（安装不完整？）：' + $dshCli) 2
      }
      Write-Warn '正在移除插件包：pnpm 走 registry 时可能静默数分钟（registry 重试属正常），请勿关闭窗口、不要连续重复点击。'
      $result = Invoke-CaptureWithTimeout -FilePath $dshCli -Arguments @('plugin', '--profile', 'desktop', 'remove', $packageName) -TimeoutSeconds $PnpmTimeoutSeconds -Activity 'dsh plugin remove（pnpm）'
      Write-Captured $result
      if ($result.TimedOut) {
        Fail-WithCode ('移除命令超时（' + $PnpmTimeoutSeconds + ' 秒）。请等 pnpm 收尾后重跑本脚本；诊断日志：' + (Join-Path $profileDir '.plugin-manager\logs')) 3
      }
      if ($result.Code -ne 0) {
        Write-Warn ('官方移除命令返回非零退出码（' + $result.Code + '）；可能是"已经被移除"的误报，继续做四件套自检。')
      }
      $pluginChanged = $true
      # 卸载后自检 + 清理（§3.4 M4）
      $profileOk = Invoke-ProfileCleanup -ProfileDir $profileDir -PackageName $packageName -Fix
      if (-not $profileOk) { $exitCode = 4 }
    }
  }
}

# ── 3) 桌面壳补丁状态检查 ───────────────────────────────────────────────────
$needRestore = $false
$backupExists = Test-Path -LiteralPath $backupDir
$meta = $null
if ($backupExists) {
  $metaPath = Join-Path $backupDir 'meta.json'
  if (Test-Path -LiteralPath $metaPath) {
    try { $meta = Get-Content -LiteralPath $metaPath -Raw -Encoding UTF8 | ConvertFrom-Json } catch { $meta = $null }
  }
}
if ($SkipShellPatch) {
  Write-Step '3/5  桌面壳补丁（已按 -SkipShellPatch 跳过）'
} else {
  Write-Step '3/5  桌面壳补丁状态检查'
  $statusResult = Invoke-Capture -FilePath $NodePath -Arguments @($tool, 'status', '--asar', $asar)
  Write-Captured $statusResult
  $patched = ($statusResult.Code -eq 0)
  $currentSha = Get-Sha256OfFile -FilePath $asar
  if ($patched) {
    Write-Info 'app.asar 上仍有桌面壳补丁：需要还原（必须 DSH 完全退出）。'
    $needRestore = $true
  } elseif ($backupExists) {
    if ($meta -and $meta.originalSha256 -and ($currentSha -eq $meta.originalSha256)) {
      Write-Ok 'app.asar 已是原始状态，只剩备份记录需要清理。'
      if ($DryRun) {
        Write-DryInfo ('将删除备份目录：' + $backupDir)
      } elseif (-not $KeepBackup) {
        try {
          Remove-Item -LiteralPath $backupDir -Recurse -Force -ErrorAction Stop
          Write-Ok '已删除备份目录（app.asar 校验为原始值）。'
        } catch {
          Write-Warn ('备份目录删除失败（可手动删）：' + $backupDir)
        }
      } else {
        Write-Warn ('已按 -KeepBackup 保留备份：' + $backupDir)
      }
    } else {
      Write-Warn '存在备份目录，但 app.asar 当前 SHA256 与备份记录的原始值不符：为安全起见保留备份，请人工核对。'
      Write-Warn '若确认是 DSH 客户端升级过（补丁已被官方新文件覆盖），可手动删除该备份目录。'
      if ($exitCode -eq 0) { $exitCode = 4 }
    }
  } else {
    Write-Ok 'app.asar 未打补丁，且没有备份目录：无需还原（幂等）。'
  }
}

# ── 4) 决策 ─────────────────────────────────────────────────────────────────
Write-Step '4/5  决策'
$anythingChanged = $pluginChanged -or $needRestore
if (-not $anythingChanged -and -not $exitCode) {
  if ($DryRun) { Write-DryInfo '已是目标状态：无需做任何改动。' }
  Write-Ok '已是目标状态（插件包已移除、壳补丁未安装、无备份），无需改动。'
  if ($PurgeData) { Write-Info '用户数据：本插件无用户数据，无需清除。' }
  Write-ScriptFooter '卸载完成（无改动）。'
  exit 0
}
if ($DryRun) {
  if ($needRestore) {
    Write-DryInfo '将启动独立编排进程：等待 DSH 完全退出 → 还原 app.asar → 双 SHA 校验 → 删除备份 → 自动重启 DSH。'
  }
  if ($pluginChanged) { Write-DryInfo '插件包与四件套已在上面处理。' }
  if ($PurgeData) { Write-DryInfo '用户数据：本插件无用户数据，无需清除。' }
  Write-ScriptFooter 'DryRun 完成：未写任何文件。'
  exit 0
}
if (-not $needRestore) {
  # 只需要重启 DSH 让插件卸载生效（若它正在运行）；或在后台等待退出再重启。
  if ($pluginChanged -and (Test-DshRunning) -and -not $NoRestart) {
    Write-Info '插件包已移除，需要重启 DSH 才会完全卸载；将启动独立编排进程等待 DSH 退出后自动重启。'
    $orchestratorArgs = @(
      '-Action', 'restart',
      '-InstallDir', $InstallDir,
      '-NodePath', $NodePath,
      '-ProjectDir', $projectRoot,
      '-TimeoutSeconds', [string]$TimeoutSeconds
    )
    if ($script:LogPath) { $orchestratorArgs += @('-LogPath', $script:LogPath) }
    try {
      $worker = Start-DetachedWorker -WorkerPath $orchestrator -Arguments $orchestratorArgs
      Write-Ok ('独立编排进程已启动（' + $worker.Mode + '，PID ' + $worker.ProcessId + '）。')
      Write-Log '  请右键系统托盘里的 DSH 图标 → 退出，后台进程会在退出后自动重启 DSH。' 'Yellow'
    } catch {
      Write-Warn ('无法启动独立进程（' + $_.Exception.Message + '）；请手动重启 DSH。')
    }
  } else {
    Write-Info '无需还原 app.asar。'
  }
  if ($PurgeData) { Write-Info '用户数据：本插件无用户数据，无需清除。' }
  Write-ScriptFooter '卸载完成（app.asar 未改动）。'
  exit $exitCode
}

# ── 5) 需要还原 app.asar：同步（DSH 已退出）或交给独立编排进程 ──────────────
if ($Force) {
  Write-Step '5/5  还原 app.asar（-Force：跳过等待，直接尝试）'
} elseif (-not (Test-DshRunning) -and (Test-AsarExclusive -AsarPath $asar)) {
  Write-Step '5/5  还原 app.asar（DSH 已退出，直接执行）'
} else {
  Write-Step '5/5  需要 DSH 完全退出：启动独立编排进程'
  Write-Warn '按规范，绝不在 DSH 运行时写 app.asar。'
  Write-Info '独立进程会等待 DSH 完全退出（托盘右键 → 退出）→ 双 SHA 校验 → 还原 → 删除备份 → 自动重启 DSH。'
  Write-Info '它不在 DSH 的进程树里，DSH 退出不会把它一起杀掉；完成后会弹窗提示。'
  $orchestratorArgs = @(
    '-Action', 'restore',
    '-InstallDir', $InstallDir,
    '-NodePath', $NodePath,
    '-ProjectDir', $projectRoot,
    '-TimeoutSeconds', [string]$TimeoutSeconds
  )
  if ($script:LogPath) { $orchestratorArgs += @('-LogPath', $script:LogPath) }
  if ($SkipPlugin) { $orchestratorArgs += '-SkipProfileCheck' }
  if ($KeepBackup) { $orchestratorArgs += '-KeepBackup' }
  if ($NoRestart) { $orchestratorArgs += '-NoRestart' }
  try {
    $worker = Start-DetachedWorker -WorkerPath $orchestrator -Arguments $orchestratorArgs
  } catch {
    Fail-WithCode ('无法启动独立编排进程：' + $_.Exception.Message) 1
  }
  Write-Ok ('独立编排进程已启动（' + $worker.Mode + '，PID ' + $worker.ProcessId + '）。')
  Write-Log ''
  Write-Log '  接下来请：' 'Yellow'
  Write-Log '    1) 右键系统托盘里的 DSH 图标 → 退出（只关窗口只是隐藏到托盘；不要点「重启」按钮）；' 'Yellow'
  Write-Log '    2) 等后台进程完成还原并自动重启 DSH（会弹窗提示）；可以关闭本窗口。' 'Yellow'
  Write-Log ''
  Write-ScriptFooter '卸载编排已启动（DSH 退出后自动还原 + 重启）。'
  exit $exitCode
}

# 同步执行：DSH 已退出（或 -Force）
$orchestratorArgs = @(
  '-Action', 'restore',
  '-InstallDir', $InstallDir,
  '-NodePath', $NodePath,
  '-ProjectDir', $projectRoot,
  '-TimeoutSeconds', [string]$TimeoutSeconds,
  '-NoPopup'
)
if ($script:LogPath) { $orchestratorArgs += @('-LogPath', $script:LogPath) }
if ($SkipPlugin) { $orchestratorArgs += '-SkipProfileCheck' }
if ($KeepBackup) { $orchestratorArgs += '-KeepBackup' }
if ($NoRestart) { $orchestratorArgs += '-NoRestart' }
if ($Force) { $orchestratorArgs += '-SkipWait' }
$previous = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
try {
  & (Get-PowerShellExe) -NoProfile -ExecutionPolicy Bypass -File $orchestrator @orchestratorArgs
  $orchestratorCode = $LASTEXITCODE
} finally {
  $ErrorActionPreference = $previous
}
if ($exitCode -eq 0) { $exitCode = $orchestratorCode }
if ($exitCode -eq 0) {
  Write-ScriptFooter '卸载完成：插件包已移除、app.asar 已还原、DSH 已重新启动。'
} else {
  Write-ScriptFooter ('卸载未完全成功（退出码 ' + $exitCode + '），详见日志。')
}
if ($PurgeData) { Write-Info '用户数据：本插件无用户数据，无需清除。' }
exit $exitCode
