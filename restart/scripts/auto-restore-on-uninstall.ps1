<#
.SYNOPSIS
  卸载后自动清理：插件被移除后，等 DSH 完全退出并还原本插件安装的桌面壳补丁。

.DESCRIPTION
  由插件的 Host 半区在确认「profile 里已经没有 dsh-restart-button」之后随包启动
  （普通隐藏子进程，1~2 秒内退出）。本脚本只做守卫，然后把「等退出 + 还原 + 校验」
  交给 restore-on-exit.ps1 的 **WMI 独立进程**（DSH 退出不会杀掉它）：

    1. 去重：5 分钟内不重复执行（标记文件在系统临时目录）；
    2. 确认本插件确实已不在 profile（dependencies 里没有 dsh-restart-button）；
    3. 确认没有其它「重启」提供方（例如 DSH UI Beautify 还在用这条桥）—— 有就不动；
    4. 确认 app.asar 上的补丁 **属于本插件**：备份 meta.patchedSha256 == 当前 SHA256；
    5. WMI 起独立进程：等 DSH 完全退出 → 双 SHA 还原 app.asar → 删除备份（不自动重启 DSH）。

  任何守卫不通过都静默退出（退出码 0）：宁可保留无害的桥，也绝不误删别人的补丁。
  这是「全自动」的一部分 —— 不需要用户双击任何卸载脚本。

.PARAMETER InstallDir
  DSH 安装目录（含 resources\app.asar）。默认自动探测。

.PARAMETER ProfileDir
  DSH profile 目录（默认 %USERPROFILE%\.dsh\profiles\desktop）。

.PARAMETER NodePath
  还原工具用的 node.exe（默认 DSH 自带的运行时）。

.PARAMETER ProjectDir
  随包 payload 根目录（restart\）。默认取本脚本上一级。

.PARAMETER TimeoutSeconds
  等 DSH 退出的最长时间（默认 3600 秒）。

.PARAMETER DebounceSeconds
  去重窗口（默认 300 秒）。

.PARAMETER NoPopup
  兼容参数（自动清理不弹窗）。

  退出码：0 = 已处理或按守卫跳过（静默）；非 0 仅用于脚本自身异常（也会被 Host 忽略）。
#>
[CmdletBinding()]
param(
  [string]$InstallDir = '',
  [string]$ProfileDir = '',
  [string]$NodePath = '',
  [string]$ProjectDir = '',
  [int]$TimeoutSeconds = 3600,
  [int]$DebounceSeconds = 300,
  [switch]$NoPopup
)

$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$tempLog = Join-Path $env:TEMP 'dsh-restart-key-auto-restore.log'
$markerPath = Join-Path $env:TEMP 'dsh-restart-key-auto-restore.marker'
$packageName = 'dsh-restart-button'
$otherProviders = @('dsh-ui-beautify')

function Write-AutoLog {
  param([string]$Text)
  try {
    Add-Content -LiteralPath $tempLog -Value ('[' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + '] ' + $Text) -Encoding UTF8
  } catch { }
}

try {
  . (Join-Path $here 'common.ps1')
} catch {
  Write-AutoLog ('加载 common.ps1 失败：' + $_.Exception.Message)
  exit 0
}

try {
  if (-not $ProjectDir) { $ProjectDir = Split-Path -Parent $here }
  if (-not (Test-Path -LiteralPath $ProjectDir)) { Write-AutoLog 'ProjectDir 不存在，跳过'; exit 0 }

  # ── 1) 去重（避免 HMR / 多次卸载信号重复触发）─────────────────────────────
  if (Test-Path -LiteralPath $markerPath) {
    try {
      $age = (Get-Date) - (Get-Item -LiteralPath $markerPath).LastWriteTime
      if ($age.TotalSeconds -lt $DebounceSeconds) {
        Write-AutoLog ('去重窗口内已执行过（' + [int]$age.TotalSeconds + 's 前），跳过')
        exit 0
      }
    } catch { }
  }

  # ── 2) 解析路径 ────────────────────────────────────────────────────────────
  if (-not $InstallDir) {
    try { $InstallDir = Resolve-DshInstallDir } catch { Write-AutoLog ('找不到 DSH 安装目录：' + $_.Exception.Message); exit 0 }
  }
  if (-not $ProfileDir) { $ProfileDir = Get-ProfileDir }
  $manifestPath = Join-Path $ProfileDir 'package.json'
  if (-not (Test-Path -LiteralPath $manifestPath)) { Write-AutoLog 'profile package.json 不存在，跳过'; exit 0 }

  # ── 3) 守卫：本插件必须已从 profile 移除 ──────────────────────────────────
  $manifest = $null
  try { $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json } catch { }
  if ($manifest -and $manifest.dependencies) {
    foreach ($property in $manifest.dependencies.PSObject.Properties) {
      if ($property.Name -eq $packageName) {
        Write-AutoLog '插件仍在 profile.dependencies 里（可能只是禁用/HMR），保留补丁，跳过'
        exit 0
      }
    }
  }

  # ── 4) 守卫：不能拆掉其它提供方还在用的桥 ────────────────────────────────
  if ($manifest -and $manifest.dependencies) {
    foreach ($property in $manifest.dependencies.PSObject.Properties) {
      if ($otherProviders -contains $property.Name) {
        Write-AutoLog ('检测到其它重启提供方 ' + $property.Name + ' 仍在安装，保留桌面壳补丁，跳过')
        exit 0
      }
    }
  }

  # ── 5) 守卫：补丁必须属于本插件（备份 meta.patchedSha256 == 当前 SHA256）──
  $asar = Join-Path $InstallDir 'resources\app.asar'
  if (-not (Test-Path -LiteralPath $asar)) { Write-AutoLog '找不到 app.asar，跳过'; exit 0 }
  $backupDir = Join-Path $InstallDir 'resources\.dsh-restart-button-backup'
  $metaPath = Join-Path $backupDir 'meta.json'
  if (-not (Test-Path -LiteralPath $metaPath)) { Write-AutoLog '没有备份 meta.json（可能不是本插件装的补丁），跳过'; exit 0 }
  $meta = $null
  try { $meta = Get-Content -LiteralPath $metaPath -Raw -Encoding UTF8 | ConvertFrom-Json } catch { }
  if (-not $meta -or -not $meta.patchedSha256 -or -not $meta.originalSha256) {
    Write-AutoLog '备份 meta.json 不完整，跳过（不自作主张动 app.asar）'
    exit 0
  }
  $currentSha = Get-Sha256OfFile -FilePath $asar
  if (-not $currentSha) { Write-AutoLog '读取 app.asar SHA256 失败，跳过'; exit 0 }
  if ($currentSha.ToLowerInvariant() -ne ([string]$meta.patchedSha256).ToLowerInvariant()) {
    Write-AutoLog '当前 app.asar 与备份记录的 patchedSha256 不一致（DSH 升级过或补丁来自别处），跳过'
    exit 0
  }

  # ── 6) 守卫：node / 还原编排脚本存在 ──────────────────────────────────────
  if (-not $NodePath) {
    try { $NodePath = Resolve-NodePath -InstallDir $InstallDir } catch { Write-AutoLog ('找不到 node：' + $_.Exception.Message); exit 0 }
  }
  $restoreScript = Join-Path $here 'restore-on-exit.ps1'
  if (-not (Test-Path -LiteralPath $restoreScript)) { Write-AutoLog 'restore-on-exit.ps1 缺失，跳过'; exit 0 }

  # ── 7) 交给 WMI 独立进程：等 DSH 退出 → 双 SHA 还原 → 删备份（不自动重启）──
  try {
    Set-Content -LiteralPath $markerPath -Value (Get-Date -Format 'o') -Encoding ASCII
  } catch { }
  $restoreArgs = @(
    '-Action', 'restore',
    '-InstallDir', $InstallDir,
    '-BackupDir', $backupDir,
    '-NodePath', $NodePath,
    '-ProjectDir', $ProjectDir,
    '-TimeoutSeconds', [string]$TimeoutSeconds,
    '-SkipProfileCheck',
    '-NoRestart',
    '-NoPopup',
    '-LogPath', $tempLog
  )
  try {
    $worker = Start-DetachedWorker -WorkerPath $restoreScript -Arguments $restoreArgs -WorkingDirectory $ProjectDir -ForceWmi
    Write-AutoLog ('已启动独立还原进程（' + $worker.Mode + '，PID ' + $worker.ProcessId + '）：DSH 退出后自动还原壳补丁')
  } catch {
    Write-AutoLog ('启动独立还原进程失败：' + $_.Exception.Message)
  }
  exit 0
} catch {
  Write-AutoLog ('自动清理异常（不会影响 DSH）：' + $_.Exception.Message)
  exit 0
}
