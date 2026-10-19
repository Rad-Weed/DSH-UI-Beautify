<#
.SYNOPSIS
  DSH 重启键 · 桌面壳补丁卸载（双 SHA 校验还原 app.asar）

.DESCRIPTION
  按《DSH 插件作者安装卸载与外部副作用规范建议 v0.1》§3.3 / §3.6：
    · 绝不在 DSH 运行时写 app.asar；DSH 在运行就交给独立编排进程等它完全退出；
    · 还原做**双 SHA 校验**：当前 == patchedSha256 → 写回原始头部 → 结果 == originalSha256；
    · 还原成功并校验后才删除备份目录；
    · 任意中间状态都可安全重入（连跑第二次只输出「已是目标状态」并 exit 0）；
    · 只处理壳补丁——按钮 UI 属于美化插件，不在本脚本处理范围。

.PARAMETER KeepBackup
  还原成功后保留备份目录（默认删除）。

  退出码：0 = 成功（含"已是目标状态"）；1 = 失败；2 = 参数错误；
          3 = 等待超时；4 = 校验失败。
#>
[CmdletBinding()]
param(
  [string]$InstallDir = '',
  [string]$NodePath = '',
  [switch]$DryRun,
  [switch]$NoRestart,
  [switch]$KeepBackup,
  [int]$TimeoutSeconds = 3600
)

. (Join-Path $PSScriptRoot 'common.ps1')
Initialize-Common -LogName 'uninstall' -DryRun:$DryRun
$ErrorActionPreference = 'Stop'

$projectRoot = Get-ProjectRoot
$tool = Join-Path $projectRoot 'shell\tools\apply-shell-patch.mjs'
$orchestrator = Join-Path $PSScriptRoot 'restore-on-exit.ps1'

Write-Log ''
Write-Log '=====================================================' 'DarkCyan'
Write-Log '  DSH 重启键 —— 桌面壳补丁卸载（还原 app.asar）' 'DarkCyan'
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
$backupDir = Join-Path $InstallDir 'resources\.dsh-restart-button-backup'
Write-Ok ('DSH 安装目录：' + $InstallDir)
Write-Ok ('app.asar：' + $asar)
Write-Ok ('备份目录：' + $backupDir)

# ── 2) 补丁/备份状态检查（幂等） ───────────────────────────────────────────
Write-Step '2/4  补丁与备份状态检查'
$statusResult = Invoke-Capture -FilePath $NodePath -Arguments @($tool, 'status', '--asar', $asar)
Write-Captured $statusResult
$patched = ($statusResult.Code -eq 0)
$hasBackup = Test-Path -LiteralPath $backupDir
Write-Info ('补丁标记：' + $(if ($patched) { '存在' } else { '不存在' }))
Write-Info ('备份目录：' + $(if ($hasBackup) { '存在' } else { '不存在' }))

if (-not $patched -and -not $hasBackup) {
  Write-Step '3/4  无需还原'
  Write-Ok 'app.asar 未打补丁、也没有备份目录：已是原始状态（幂等）。'
  if (-not $NoRestart -and (Test-DshRunning)) { Write-Info 'DSH 正在运行，无需处理。' }
  Write-ScriptFooter '卸载完成（无改动）。'
  exit 0
}

# 状态细节：备份 meta 与当前 SHA
$meta = $null
if ($hasBackup) {
  $metaPath = Join-Path $backupDir 'meta.json'
  if (Test-Path -LiteralPath $metaPath) {
    try { $meta = Get-Content -LiteralPath $metaPath -Raw -Encoding UTF8 | ConvertFrom-Json } catch { $meta = $null }
  }
}
$currentSha = Get-Sha256OfFile $asar
Write-Info ('当前 app.asar SHA256：' + $currentSha)
if ($meta) {
  Write-Info ('备份原始 SHA256：' + $meta.originalSha256)
  Write-Info ('备份补丁 SHA256：' + $meta.patchedSha256)
}

if ($DryRun) {
  Write-Step '3/4  DryRun'
  Write-DryInfo '将启动独立编排进程：等待 DSH 完全退出 → 双 SHA 校验 → 还原 app.asar → 删除备份 → 自动重启 DSH。'
  Write-ScriptFooter 'DryRun 完成：未写任何文件。'
  exit 0
}

# ── 3) 还原：DSH 已退出就同步做；否则交给独立编排进程 ───────────────────────
$orchestratorArgs = @(
  '-Action', 'restore',
  '-InstallDir', $InstallDir,
  '-NodePath', $NodePath,
  '-ProjectDir', $projectRoot,
  '-TimeoutSeconds', [string]$TimeoutSeconds,
  '-SkipProfileCheck'
)
if ($script:LogPath) { $orchestratorArgs += @('-LogPath', $script:LogPath) }
if ($NoRestart) { $orchestratorArgs += '-NoRestart' }
if ($KeepBackup) { $orchestratorArgs += '-KeepBackup' }

if (-not (Test-DshRunning) -and (Test-AsarExclusive -AsarPath $asar)) {
  Write-Step '3/4  还原 app.asar（DSH 已退出，直接执行）'
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    & (Get-PowerShellExe) -NoProfile -ExecutionPolicy Bypass -File $orchestrator @($orchestratorArgs + @('-NoPopup'))
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previous
  }
  if ($exitCode -ne 0) { exit $exitCode }
  Write-ScriptFooter '卸载完成：app.asar 已逐字节还原，DSH 已重新启动。'
  exit 0
}

Write-Step '3/4  需要 DSH 完全退出：启动独立编排进程'
Write-Warn '按规范，绝不在 DSH 运行时写 app.asar。'
Write-Info '将启动一个独立进程：等待 DSH 完全退出（托盘右键 → 退出）→ 双 SHA 校验 → 还原 → 删除备份 → 自动重启 DSH。'
try {
  $worker = Start-DetachedWorker -WorkerPath $orchestrator -Arguments $orchestratorArgs
} catch {
  Fail-WithCode ('无法启动独立编排进程：' + $_.Exception.Message) 1
}
Write-Ok ('独立编排进程已启动（' + $worker.Mode + '，PID ' + $worker.ProcessId + '）。')
Write-Log ''
Write-Log '  接下来请：' 'Yellow'
Write-Log '    1) 右键系统托盘里的 DSH 图标 → 退出（只关窗口只是隐藏到托盘）；' 'Yellow'
Write-Log '    2) 等自动还原 + 重启完成（会弹窗提示）。' 'Yellow'
Write-Log ''
Write-ScriptFooter '卸载编排已启动（DSH 退出后自动完成还原 + 重启）。'
exit 0
