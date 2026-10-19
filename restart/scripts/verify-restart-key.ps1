<#
.SYNOPSIS
  DSH 重启键 · 体检：壳补丁 / 备份 / SHA256 / 按钮 UI（美化插件）/ 运行态

.DESCRIPTION
  一条命令确认：
    1. DSH 安装目录与 app.asar 是否正常；
    2. 桌面壳补丁状态（未打 / 已打且校验通过 / 已打但版本不符）；
    3. 备份目录与 meta.json 的双 SHA 记录，当前 app.asar SHA 与记录是否吻合；
    4. 按钮 UI 提供方 DSH UI Beautify 是否已安装（v0.8.0+ 才有按钮）；
    5. DSH 是否在运行（运行中不能改 app.asar）。
  退出码：0 = PASS；1 = 发现问题；2 = 参数错误；4 = 校验失败。
#>
[CmdletBinding()]
param(
  [string]$InstallDir = '',
  [string]$NodePath = '',
  [switch]$DryRun
)

. (Join-Path $PSScriptRoot 'common.ps1')
Initialize-Common -LogName 'verify' -DryRun:$DryRun
$ErrorActionPreference = 'Stop'

$projectRoot = Get-ProjectRoot
$tool = Join-Path $projectRoot 'shell\tools\apply-shell-patch.mjs'
$profileDir = Get-ProfileDir
$problems = New-Object System.Collections.ArrayList

function Check-Ok { param([string]$Text) Write-Log ('   [PASS] ' + $Text) 'Green' }
function Check-Fail { param([string]$Text) Write-Log ('   [FAIL] ' + $Text) 'Red'; [void]$problems.Add($Text) }

Write-Log ''
Write-Log '=====================================================' 'DarkCyan'
Write-Log '  DSH 重启键 —— 体检' 'DarkCyan'
Write-Log '=====================================================' 'DarkCyan'

# ── 1) 路径 ─────────────────────────────────────────────────────────────────
Write-Step '1/4  路径与环境'
foreach ($required in @($tool)) {
  if (Test-Path -LiteralPath $required) { Check-Ok ('补丁工具存在：' + $required) } else { Check-Fail ('缺少补丁工具：' + $required) }
}
try {
  $InstallDir = Resolve-DshInstallDir -InstallDir $InstallDir
  $NodePath = Resolve-NodePath -InstallDir $InstallDir -NodePath $NodePath
  Check-Ok ('DSH 安装目录：' + $InstallDir)
  Check-Ok ('node：' + $NodePath)
} catch {
  Check-Fail ('环境异常：' + $_.Exception.Message)
}
$asar = Join-Path $InstallDir 'resources\app.asar'
$backupDir = Join-Path $InstallDir 'resources\.dsh-restart-button-backup'
if (Test-Path -LiteralPath $asar) { Check-Ok 'app.asar 存在' } else { Check-Fail ('找不到 app.asar：' + $asar) }

# ── 2) 壳补丁状态 ───────────────────────────────────────────────────────────
Write-Step '2/4  桌面壳补丁'
if ($problems.Count -eq 0) {
  $statusResult = Invoke-Capture -FilePath $NodePath -Arguments @($tool, 'status', '--asar', $asar)
  Write-Captured $statusResult
  $patched = ($statusResult.Code -eq 0)
  if ($patched) {
    $verifyResult = Invoke-Capture -FilePath $NodePath -Arguments @($tool, 'verify', '--asar', $asar)
    Write-Captured $verifyResult
    if ($verifyResult.Code -eq 0) { Check-Ok '补丁已安装且校验通过（标题栏「重启」可用）' }
    else { Check-Fail '补丁标记存在但校验失败（版本不符？重跑 install-restart-key.cmd）' }
  } else {
    Check-Ok '补丁未安装（按钮 UI 仍在，点击会提示装壳补丁）'
  }
}

# ── 3) 备份与 SHA ───────────────────────────────────────────────────────────
Write-Step '3/4  备份与 SHA256'
$currentSha = ''
if (Test-Path -LiteralPath $asar) { $currentSha = Get-Sha256OfFile $asar }
$metaPath = Join-Path $backupDir 'meta.json'
if (Test-Path -LiteralPath $backupDir) {
  Check-Ok ('备份目录存在：' + $backupDir)
  if (Test-Path -LiteralPath $metaPath) {
    try {
      $meta = Get-Content -LiteralPath $metaPath -Raw -Encoding UTF8 | ConvertFrom-Json
      Check-Ok ('备份记录 originalSha256 = ' + $meta.originalSha256)
      Check-Ok ('备份记录 patchedSha256  = ' + $meta.patchedSha256)
      if ($currentSha) {
        if ($currentSha -eq $meta.patchedSha256) { Check-Ok '当前 app.asar == 补丁后 SHA（状态一致）' }
        elseif ($currentSha -eq $meta.originalSha256) { Check-Ok '当前 app.asar == 原始 SHA（补丁已还原，可清理备份）' }
        else { Check-Fail '当前 app.asar SHA 与备份记录都不符（DSH 升级过？请人工核对后再动）' }
      }
    } catch { Check-Fail ('备份 meta.json 读取失败：' + $metaPath) }
  } else { Check-Fail ('备份目录存在但缺 meta.json：' + $metaPath) }
} else {
  Check-Ok '无备份目录（未打补丁 / 已还原）'
}

# ── 4) 按钮 UI（美化插件）与运行态 ──────────────────────────────────────────
Write-Step '4/4  按钮 UI（DSH UI Beautify）与运行态'
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
    Check-Ok ('DSH UI Beautify 已安装：' + $(if ($beautifyReal) { 'v' + $beautifyReal } else { $beautifyVersion }) + '（提供标题栏按钮）')
  }
  else { Check-Fail '未安装 dsh-ui-beautify —— 装上 v0.8.0+ 才会出现「重启」按钮' }
} catch {
  Check-Fail ('读取 profile 失败：' + $_.Exception.Message)
}
if (Test-DshRunning) { Write-Info 'DSH 正在运行：改/还原 app.asar 需要先完全退出（托盘右键 → 退出）。' }
else { Write-Info 'DSH 当前未运行：可以直接应用/还原壳补丁。' }

Write-Log ''
if ($problems.Count -eq 0) {
  Write-Log '体检结果：PASS（补丁 / 备份 / SHA256 / 按钮 UI 一致）' 'Green'
  Write-ScriptFooter '体检完成。'
  exit 0
}
Write-Log ('体检结果：FAIL（' + $problems.Count + ' 项问题）') 'Red'
foreach ($problem in $problems) { Write-Log ('  - ' + $problem) 'Red' }
Write-ScriptFooter '体检发现问题，见上。'
exit 4
