<#
.SYNOPSIS
  「DSH 重启键」体检：一条命令确认插件、桌面壳补丁、备份、四件套与运行态。

.DESCRIPTION
  对应《DSH 插件作者安装卸载与外部副作用规范建议 v0.1》§5「作者自测清单」中的
  「卸载后四件套断言」「补丁状态」「备份与 SHA256」几项，供用户随时自查：

    1. 安装目录 / node / 项目文件是否齐全；
    2. 桌面壳补丁：标记 / 锚点 / 预期内容 / JS 语法 / 与项目版本一致 / asar 结构；
       以及备份 meta 里的 originalSha256 / patchedSha256 与当前文件 SHA256 的对照；
    3. 插件管理四件套 + 联接（与安装状态对照：已安装 / 已卸载都算一种正常状态）；
    4. 运行态提示（补丁是否要重启后才生效）。

  退出码：0 = PASS；1 = 发现问题；2 = 参数错误；4 = 校验失败。

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\verify-restart-key.ps1
#>
[CmdletBinding()]
param(
  [string]$InstallDir = '',
  [string]$NodePath = '',
  [switch]$SkipPlugin,
  [switch]$NoPopup
)

. (Join-Path $PSScriptRoot 'common.ps1')
Initialize-Common -LogName 'verify'
$ErrorActionPreference = 'Stop'

$projectRoot = Get-ProjectRoot
$packageName = 'dsh-restart-button'
$tool = Join-Path $projectRoot 'shell\tools\apply-shell-patch.mjs'
$pluginDir = Join-Path $projectRoot 'plugin\dsh-restart-button'
$profileDir = Get-ProfileDir
$problems = New-Object System.Collections.ArrayList

function Check-Ok { param([string]$Text) Write-Log ('   [PASS] ' + $Text) 'Green' }
function Check-Fail { param([string]$Text) Write-Log ('   [FAIL] ' + $Text) 'Red'; [void]$problems.Add($Text) }
function Check-Info { param([string]$Text) Write-Log ('   ' + $Text) 'Gray' }

Write-Log ''
Write-Log '=====================================================' 'DarkCyan'
Write-Log '  DSH 重启键 —— 体检' 'DarkCyan'
Write-Log '=====================================================' 'DarkCyan'
Write-Info ('日志：' + $script:LogPath)

# ── 1) 安装目录 / node ──────────────────────────────────────────────────────
Write-Step '1/4  安装目录与项目文件'
try {
  $InstallDir = Resolve-DshInstallDir -InstallDir $InstallDir
  $NodePath = Resolve-NodePath -InstallDir $InstallDir -NodePath $NodePath
} catch {
  Check-Fail ('参数错误：' + $_.Exception.Message)
  Write-ScriptFooter ('体检结果：FAIL（' + $problems.Count + ' 项问题）')
  exit 2
}
$asar = Join-Path $InstallDir 'resources\app.asar'
$backupDir = Join-Path $InstallDir 'resources\.dsh-restart-button-backup'
Check-Ok ('安装目录：' + $InstallDir)
Check-Ok ('node：' + $NodePath)
$requiredFiles = @($tool, (Join-Path $projectRoot 'scripts\restore-on-exit.ps1'))
if (-not $SkipPlugin) { $requiredFiles += $pluginDir }
foreach ($required in $requiredFiles) {
  if (Test-Path -LiteralPath $required) { Check-Ok ('项目文件：' + $required) }
  else { Check-Fail ('项目文件缺失：' + $required) }
}
$asarItem = Get-Item -LiteralPath $asar
Check-Info ('app.asar：' + $asar + '（' + $asarItem.Length + ' 字节，修改于 ' + $asarItem.LastWriteTime + '）')
$currentSha = Get-Sha256OfFile -FilePath $asar
Check-Info ('当前 SHA256：' + $currentSha)

# ── 2) 桌面壳补丁 + 备份 ────────────────────────────────────────────────────
Write-Step '2/4  桌面壳补丁 / 备份 / SHA256'
$statusResult = Invoke-Capture -FilePath $NodePath -Arguments @($tool, 'status', '--asar', $asar)
Write-Captured $statusResult
$patched = ($statusResult.Code -eq 0)
$meta = $null
$metaPath = Join-Path $backupDir 'meta.json'
if (Test-Path -LiteralPath $metaPath) {
  try { $meta = Get-Content -LiteralPath $metaPath -Raw -Encoding UTF8 | ConvertFrom-Json } catch { $meta = $null }
}
if ($patched) {
  $verifyResult = Invoke-Capture -FilePath $NodePath -Arguments @($tool, 'verify', '--asar', $asar)
  if ($verifyResult.Code -eq 0) {
    Check-Ok '补丁完整有效（标记 / 锚点 / 预期内容 / JS 语法 / 版本一致 / asar 结构）'
  } else {
    Write-Captured $verifyResult
    Check-Fail '桌面壳补丁不完整或与本项目版本不一致（重装插件或运行 scripts\install-restart-key.ps1 修复）'
  }
  Check-Info "补丁状态：PATCHED（已安装）"
  if ($meta) {
    if ($currentSha -eq $meta.patchedSha256) { Check-Ok ('当前 SHA256 == 备份记录的 patchedSha256') }
    else { Check-Fail '当前 SHA256 与备份记录的 patchedSha256 不符（文件被改过？）' }
    Check-Info ('备份记录的原始 SHA256：' + $meta.originalSha256)
  } else {
    Check-Fail 'app.asar 有补丁但备份 meta 不存在（无法安全还原）'
  }
} else {
  Check-Info '补丁状态：CLEAN（未安装）'
  if ($meta) {
    if ($meta.originalSha256 -and ($currentSha -eq $meta.originalSha256)) {
      Check-Ok '当前 SHA256 == 备份记录的原始值（备份可清理）'
    } else {
      Check-Fail '存在备份但当前 SHA256 与原始值不符（DSH 升级过？请人工核对）'
    }
  } else {
    Check-Ok '无补丁、无备份：正常未安装状态'
  }
}

# ── 3) 插件管理四件套 + 联接 ────────────────────────────────────────────────
$refCount = 0
if ($SkipPlugin) {
  Write-Step '3/4  插件管理四件套 + 联接（bundle 模式）'
  Check-Info '按钮 UI 由 DSH UI Beautify 提供：跳过 dsh-restart-button 四件套/联接检查'
} else {
Write-Step '3/4  插件管理四件套 + 联接'
$state = Get-ProfileReferenceState -ProfileDir $profileDir -PackageName $packageName
Write-ProfileReferenceState -State $state
$refCount = Get-ProfileReferenceCount -State $state
$installed = ($state.Dependency -and $state.Bundle)
if ($installed) {
  if (-not $state.Junction) { Check-Fail 'profile 标记已安装，但 node_modules 里没有联接（重装插件修复）' }
  else { Check-Ok '插件包已安装且 profile 引用一致' }
} else {
  if ($refCount -eq 0) { Check-Ok '插件包未安装（四件套无残留，正常卸载态）' }
  else { Check-Fail ('插件包处于半安装/半卸载状态（四件套仍有 ' + $refCount + ' 处引用），重跑安装或卸载脚本收敛') }
}
$junctionOk = Remove-OrphanJunction -State $state -Fix:($false)
if (-not $junctionOk) { Check-Fail 'node_modules 残留联接（插件卸载后的自动清理会处理；也可运行 scripts\uninstall-restart-key.ps1）' }
}

# ── 4) 运行态提示 ──────────────────────────────────────────────────────────
Write-Step '4/4  运行态'
$running = Get-DshProcesses
if ($running.Count -gt 0) {
  $started = ($running | Sort-Object StartTime | Select-Object -First 1).StartTime
  Check-Info ('DSH 正在运行（启动于 ' + $started + '）')
  if ($asarItem.LastWriteTime -gt $started) {
    Check-Info ('app.asar 修改于 ' + $asarItem.LastWriteTime + '（晚于本次启动）—— 补丁要重启 DSH 后才生效')
  } else {
    Check-Ok '当前进程是在补丁写入之后启动的，补丁应已加载'
  }
} else {
  Check-Info 'DSH 当前未运行'
}

# ── 汇总 ────────────────────────────────────────────────────────────────────
Write-Log ''
# ── 4) 冲突检查：与 DSH UI Beautify 同时安装会让标题栏出现两个「重启」按钮 ──
$beautifyPkgPath = Join-Path $profileDir 'node_modules\dsh-ui-beautify\package.json'
if ((Test-Path -LiteralPath $beautifyPkgPath) -and $refCount -gt 0) {
  Check-Fail '重复按钮风险：DSH UI Beautify 与本插件同时安装（标题栏会出现两个「重启」）。建议卸载其一（推荐卸载本插件，按钮由美化插件提供）'
}

if ($problems.Count -eq 0) {
  Write-Log '体检结果：PASS（补丁/备份/四件套/运行态一致）' 'Green'
  Write-Log '标题栏实例：' 'DarkGray'
  Write-Log '  - 已安装：DSH 重启后标题栏「应用」「编辑」右边有「重启」按钮' 'DarkGray'
  Write-Log '  - 未安装：安装 DSH UI Beautify v0.8.6+（内含「重启」按钮）或本插件（自动准备补丁）' 'DarkGray'
  Write-ScriptFooter '体检通过。'
  exit 0
}
Write-Log ('体检结果：FAIL（' + $problems.Count + ' 项问题）') 'Red'
foreach ($problem in $problems) { Write-Log ('  - ' + $problem) 'Red' }
if (-not $NoPopup -and -not $script:IsDryRun) {
  Show-Popup -Title 'DSH 重启键 · 体检' -Text ("体检发现 " + $problems.Count + " 项问题，详见日志：`r`n" + $script:LogPath) -Icon 48
}
Write-ScriptFooter '体检未通过。'
exit 4
