<#
  卸载后自检与清理 · dsh-ui-beautify
  ===========================================================================
  对应《DSH 插件作者安装卸载与外部副作用规范建议 v0.1》：
    §3.1 M1 安装/卸载对称、幂等、可重入（连跑两次第二次只输出"已是目标状态"）
    §3.4 M4 卸载后自检并清理"四件套 + 联接"
    §3.6 M6 等待/超时/日志/退出码

  背景：本插件是**纯 Cordis 插件**（不改 app.asar、无安装脚本、无 daemon、无网络请求），
  但官方卸载走 pnpm：① 它可能静默数分钟（registry 重试）；② 完成后 `node_modules/<包名>`
  这个 **junction 可能残留**（2026-10-17 实测遇到过）。本脚本负责"卸载之后"的那一半：

    1. 确认官方移除已经完成（四件套里都没有本包）——**没完成就拒绝清理，绝不半路拆**
    2. 清理 node_modules 里的残留联接（**只删联接，绝不递归进真实目录**）
    3. 打印最终清单，作为"真的卸载干净了"的证据
    4. 全程写日志；退出码约定见下

  用法（在本文件所在目录执行）：
    # 先看会做什么（不改任何文件）
    powershell -ExecutionPolicy Bypass -File .\uninstall-cleanup.ps1 -DryRun

    # 官方移除完成后，做自检 + 清理
    powershell -ExecutionPolicy Bypass -File .\uninstall-cleanup.ps1

    # 只自检、不清理联接
    powershell -ExecutionPolicy Bypass -File .\uninstall-cleanup.ps1 -NoCleanup

    # 用户数据：默认保留；-PurgeData 只打印清除命令（localStorage 由页面持有，脚本删不了）
    powershell -ExecutionPolicy Bypass -File .\uninstall-cleanup.ps1 -PurgeData

  退出码：0 = 成功（含"已是目标状态"）；1 = 失败；2 = 参数错误；
          3 = 等待超时；4 = 校验失败（四件套仍引用本包）。
#>
[CmdletBinding()]
param(
  [string]$ProfileDir = (Join-Path $env:USERPROFILE '.dsh\profiles\desktop'),
  [string]$PackageName = 'dsh-ui-beautify',
  [int]$TimeoutSeconds = 900,
  [switch]$NoCleanup,
  [switch]$DryRun,
  [switch]$PurgeData
)

$ErrorActionPreference = 'Continue'
$exitCode = 0
$logDir = Join-Path $env:USERPROFILE '.dsh'
$logPath = Join-Path $logDir ('dsh-' + $PackageName + '-uninstall.log')

function Write-Log {
  param([string]$Text, [string]$Color = 'Gray')
  $line = '[' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + '] ' + $Text
  Write-Host $Text -ForegroundColor $Color
  if (-not $DryRun) {
    try { Add-Content -Path $logPath -Value $line -Encoding UTF8 } catch { }
  }
}

function Fail {
  param([string]$Text, [int]$Code = 1)
  Write-Log ('失败：' + $Text) 'Red'
  exit $Code
}

Write-Log ('==== 卸载后自检与清理：' + $PackageName + ' ====') 'Cyan'
if ($DryRun) { Write-Log '（DryRun：只打印，不改任何文件，也不写日志）' 'Yellow' }

# ── 0) 参数检查（§3.6：参数错误 → 退出码 2）──────────────────────────────────
if (-not (Test-Path (Join-Path $ProfileDir 'package.json'))) {
  Fail ('找不到 profile 的 package.json：' + $ProfileDir + '　请用 -ProfileDir 指定正确的 profile 目录') 2
}
if ($TimeoutSeconds -lt 1) { Fail ('-TimeoutSeconds 必须 ≥ 1') 2 }

$pkgJsonPath = Join-Path $ProfileDir 'package.json'
$lockPath    = Join-Path $ProfileDir 'pnpm-lock.yaml'
$modulesYaml = Join-Path $ProfileDir 'node_modules\.modules.yaml'
$cordisYml   = Join-Path $ProfileDir 'cordis.yml'
$installed   = Join-Path $ProfileDir ('node_modules\' + $PackageName)

function Test-ReferencedInFile {
  param([string]$FilePath, [string]$Needle)
  if (-not (Test-Path $FilePath)) { return $false }
  try { return ([System.IO.File]::ReadAllText($FilePath).IndexOf($Needle, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) } catch { return $false }
}

function Get-ReferenceState {
  $state = [ordered]@{}
  $state['package.json(bundles/deps)'] = Test-ReferencedInFile $pkgJsonPath $PackageName
  $state['pnpm-lock.yaml']             = Test-ReferencedInFile $lockPath $PackageName
  $state['node_modules/.modules.yaml'] = Test-ReferencedInFile $modulesYaml $PackageName
  $state['cordis.yml']                 = Test-ReferencedInFile $cordisYml $PackageName
  return $state
}

function Get-JunctionInfo {
  if (-not (Test-Path $installed)) { return $null }
  $item = Get-Item -LiteralPath $installed -Force -ErrorAction SilentlyContinue
  if (-not $item) { return $null }
  return [pscustomobject]@{
    Path     = $item.FullName
    LinkType = [string]$item.LinkType
    Target   = ($item.Target -join '; ')
  }
}

# ── 1) 等官方移除完成（§3.6：等待 / 超时）────────────────────────────────────
$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
$waited = $false
while ($true) {
  $state = Get-ReferenceState
  $dirty = @($state.Keys | Where-Object { $state[$_] })
  if (-not $dirty.Count) { break }
  if (-not $waited) {
    Write-Log ('检测到本包仍被引用：' + ($dirty -join '、')) 'Yellow'
    Write-Log '如果你刚点了"卸载"，请等它真正结束（pnpm 可能因 registry 重试静默数分钟，属正常现象）；本脚本会继续等待。' 'Yellow'
    Write-Log ('等待上限 ' + $TimeoutSeconds + ' 秒；可随时 Ctrl+C 退出（不会改动任何文件）。') 'DarkGray'
    $waited = $true
  }
  if ((Get-Date) -gt $deadline) {
    Write-Log '超时：四件套里仍有本包的引用 —— 说明官方移除还没完成。**本次不做任何清理**。' 'Red'
    Write-Log '建议：等插件管理器彻底结束（看 .dsh\profiles\desktop\.plugin-manager\logs\operation-*\pnpm.log），再重跑本脚本。' 'Red'
    exit 3
  }
  Start-Sleep -Seconds 2
}

# ── 2) 四件套断言（§3.4）────────────────────────────────────────────────────
Write-Log '四件套自检：' 'Cyan'
$state = Get-ReferenceState
foreach ($key in $state.Keys) {
  if ($state[$key]) { Write-Log ('  ✗ ' + $key + ' 仍引用 ' + $PackageName) 'Red' }
  else { Write-Log ('  ✓ ' + $key + ' 无引用') 'Green' }
}
if (@($state.Values | Where-Object { $_ }).Count -gt 0) {
  Write-Log '校验失败：仍有引用，按约定退出码 4（不清理任何东西）。' 'Red'
  exit 4
}

# ── 3) 清理残留联接（§3.4：只删链接，不动真实目录）────────────────────────────
$junction = Get-JunctionInfo
if (-not $junction) {
  Write-Log ('  ✓ node_modules\' + $PackageName + ' 已无残留') 'Green'
} else {
  Write-Log ('  ! node_modules\' + $PackageName + ' 仍在：LinkType=' + $junction.LinkType + ' → ' + $junction.Target) 'Yellow'
  $isLink = ($junction.LinkType -eq 'Junction' -or $junction.LinkType -eq 'SymbolicLink')
  if (-not $isLink) {
    Write-Log '  这不是联接（可能是真实目录）—— 为安全起见**不删除**，请人工确认后再处理。' 'Red'
    $exitCode = 1
  } elseif ($NoCleanup) {
    Write-Log '  已指定 -NoCleanup：保留联接，只做自检。' 'Yellow'
  } elseif ($DryRun) {
    Write-Log '  [DryRun] 将执行：cmd /c rmdir "' + $junction.Path + '"（只删链接）' 'Yellow'
  } else {
    # 用 cmd 的 rmdir：只删重解析点，绝不递归进目标目录（Remove-Item -Recurse 会删目标内容）
    & cmd /c rmdir "$($junction.Path)" 2>&1 | Out-Null
    if (Test-Path -LiteralPath $installed) {
      Write-Log '  删除联接失败（可能被占用）——请关掉占用的程序后重跑本脚本。' 'Red'
      $exitCode = 1
    } else {
      Write-Log '  ✓ 已删除残留联接（链接目标未受影响）' 'Green'
    }
  }
}

# ── 4) 用户数据（§3.5：默认保留，清除必须显式）────────────────────────────────
if ($PurgeData) {
  Write-Log '用户数据：本插件的数据全在浏览器侧 localStorage（脚本无法直接删除），请打开 DSH 页面后在控制台执行：' 'Yellow'
  Write-Log "  Object.keys(localStorage).filter(function(k){return k.indexOf('__dshui.')===0}).forEach(function(k){localStorage.removeItem(k)})" 'Yellow'
} else {
  Write-Log '用户数据：默认保留（localStorage 的 __dshui.* 键；卸载不会删除它们）。想清除见 README「用户数据」一节，或加 -PurgeData 查看命令。' 'DarkGray'
}

# ── 5) 最终清单（作为"真的卸载干净了"的证据）──────────────────────────────────
Write-Log '' 
Write-Log '最终清单：' 'Cyan'
$state = Get-ReferenceState
foreach ($key in $state.Keys) { Write-Log ('  ' + $key + '：' + $(if ($state[$key]) { '引用仍在' } else { '无引用' })) 'Gray' }
$junction = Get-JunctionInfo
Write-Log ('  node_modules\' + $PackageName + '：' + $(if ($junction) { '残留（' + $junction.LinkType + '）' } else { '无残留' })) 'Gray'
Write-Log ('  插件目录（你解压的那份，不会被本脚本删除）：见 README「卸载」一节') 'DarkGray'
if ($DryRun) { Write-Log '[DryRun] 未改动任何文件。' 'Yellow' }

if ($exitCode -eq 0) {
  Write-Log 'PASS —— 卸载已清理干净。' 'Green'
} else {
  Write-Log 'PARTIAL —— 有项目未清理成功，见上面红字。' 'Red'
}
if (-not $DryRun) { Write-Log ('日志：' + $logPath) 'DarkGray' }
exit $exitCode
