<#
.SYNOPSIS
  安装「DSH 重启键」：标题栏「应用」「编辑」旁边的「重启」按钮。

.DESCRIPTION
  按《DSH 插件作者安装卸载与外部副作用规范建议 v0.1》实现（M1/M2/M3/M4/M6）：

    ① DSH 插件包（plugin\dsh-restart-button）
       走官方通道装进 desktop profile；已装则跳过（幂等，避免重复跑 pnpm）。
    ② 桌面壳补丁（shell\tools\apply-shell-patch.mjs）
       **绝不在 DSH 运行时写 app.asar**：检测到 DSH 在运行就启动一个**独立编排进程**
       （restore-on-exit.ps1，在 DSH 进程树里会用 WMI 逃逸），由它等待 DSH 完全退出
       （进程为 0 且 app.asar 可独占打开、连续 3 次确认）→ 打补丁 → 校验 → 自动重启 DSH。
       打补丁前先备份原始头部（含 SHA256），补丁后记录 patchedSha256。

  装完 DSH 会自动重启；标题栏「应用」「编辑」右边出现「重启」。
  想先看会做什么：加 -DryRun（不改任何文件、不写日志）。

.PARAMETER InstallDir
  DSH 安装目录（含 "DeepSeek Harness.exe" 与 resources\app.asar）。默认自动探测。

.PARAMETER NodePath
  执行补丁脚本用的 node.exe。默认用 DSH 自带的 node 运行时。

.PARAMETER SkipPlugin
  只装桌面壳补丁，不装 DSH 插件包。

.PARAMETER SkipShellPatch
  只装 DSH 插件包，不装桌面壳补丁。

.PARAMETER DryRun
  只打印将做什么，不改任何文件、不改 profile、不写日志。

.PARAMETER NoRestart
  操作完成后不自动重启 DSH（仍需你先完全退出 DSH 才能改 app.asar）。

.PARAMETER TimeoutSeconds
  等待 DSH 退出的最长时间（默认 3600 秒 = 60 分钟；壳补丁类建议 ≥ 3600）。

.PARAMETER PnpmTimeoutSeconds
  pnpm 插件安装命令的超时（默认 1800 秒）。pnpm 走 registry 时可能静默数分钟。

  退出码：0 = 成功（含"已是目标状态"）；1 = 失败；2 = 参数错误；
          3 = 等待超时；4 = 校验失败。

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\install-restart-key.ps1
  powershell -ExecutionPolicy Bypass -File .\scripts\install-restart-key.ps1 -DryRun
#>
[CmdletBinding()]
param(
  [string]$InstallDir = '',
  [string]$NodePath = '',
  [switch]$SkipPlugin,
  [switch]$SkipShellPatch,
  [switch]$DryRun,
  [switch]$NoRestart,
  [int]$TimeoutSeconds = 3600,
  [int]$PnpmTimeoutSeconds = 1800
)

. (Join-Path $PSScriptRoot 'common.ps1')
Initialize-Common -LogName 'install' -DryRun:$DryRun
$ErrorActionPreference = 'Stop'

$projectRoot = Get-ProjectRoot
$pluginDir = Join-Path $projectRoot 'plugin\dsh-restart-button'
$packageName = 'dsh-restart-button'
$tool = Join-Path $projectRoot 'shell\tools\apply-shell-patch.mjs'
$orchestrator = Join-Path $PSScriptRoot 'restore-on-exit.ps1'
$profileDir = Get-ProfileDir
$exitCode = 0

Write-Log ''
Write-Log '=====================================================' 'DarkCyan'
Write-Log '  DSH 重启键 —— 安装            （标题栏「重启」按钮）' 'DarkCyan'
Write-Log '=====================================================' 'DarkCyan'
Write-Info ('日志：' + $(if ($script:IsDryRun) { '（DryRun 不写日志）' } elseif ($script:LogPath) { $script:LogPath } else { '无' }))
if ($DryRun) { Write-DryInfo '本次为 DryRun：只打印，不改任何文件、不改 profile。' }
Write-Log (Get-ExitCodeHelp) 'DarkGray'

# ── 1) 参数与路径 ───────────────────────────────────────────────────────────
Write-Step '1/5  参数与路径'
if ($TimeoutSeconds -lt 10) { Fail-WithCode '参数错误：-TimeoutSeconds 必须 ≥ 10。' 2 -NoPopup }
if ($PnpmTimeoutSeconds -lt 10) { Fail-WithCode '参数错误：-PnpmTimeoutSeconds 必须 ≥ 10。' 2 -NoPopup }
$requiredFiles = @($tool, $orchestrator)
if (-not $SkipPlugin) { $requiredFiles = @($pluginDir) + $requiredFiles }
foreach ($required in $requiredFiles) {
  if (-not (Test-Path -LiteralPath $required)) { Fail-WithCode ('项目文件不完整，找不到：' + $required) 2 }
}
try {
  $InstallDir = Resolve-DshInstallDir -InstallDir $InstallDir
  $NodePath = Resolve-NodePath -InstallDir $InstallDir -NodePath $NodePath
} catch {
  Fail-WithCode ('参数错误：' + $_.Exception.Message) 2
}
$asar = Join-Path $InstallDir 'resources\app.asar'
$dshCli = Join-Path $InstallDir 'resources\runtime\cli\bin\dsh.cmd'
if (-not (Test-Path -LiteralPath $dshCli)) {
  Fail-WithCode ('找不到 dsh 命令（安装不完整？）：' + $dshCli) 2
}
Write-Ok ('DSH 安装目录：' + $InstallDir)
Write-Ok ('node：' + $NodePath)
Write-Ok ('desktop profile：' + $profileDir)
Write-EffectsDeclaration

# 冲突保护：DSH UI Beautify v0.8.0+ 已内置「重启」按钮；若它装着，本次只装壳补丁，
# 不再安装本仓库的插件半区（否则标题栏会出现两个都能用的「重启」按钮）。
$beautifyPkgPath = Join-Path $profileDir 'node_modules\dsh-ui-beautify\package.json'
$beautifyVersion = ''
if (Test-Path -LiteralPath $beautifyPkgPath) {
  try {
    $beautifyPkg = Get-Content -LiteralPath $beautifyPkgPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $beautifyVersion = [string]$beautifyPkg.version
  } catch { }
}
if ($beautifyVersion) {
  Write-Warn ('检测到 DSH UI Beautify v' + $beautifyVersion + ' 已提供「重启」按钮：本次自动跳过插件半区，只安装桌面壳补丁（避免双按钮）。')
  $SkipPlugin = $true
}

# ── 2) DSH 插件包（幂等）────────────────────────────────────────────────────
$pluginChanged = $false
if ($SkipPlugin) {
  Write-Step '2/5  DSH 插件包（已跳过：按钮 UI 由 DSH UI Beautify 提供 / 或 -SkipPlugin）'
} else {
  Write-Step '2/5  DSH 插件包（官方通道进入 desktop profile）'
  $state = Get-ProfileReferenceState -ProfileDir $profileDir -PackageName $packageName
  $dependencyValue = ''
  try {
    $manifest = Get-Content -LiteralPath $state.PackageJsonPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($manifest.dependencies) {
      foreach ($property in $manifest.dependencies.PSObject.Properties) {
        if ($property.Name -eq $packageName) { $dependencyValue = [string]$property.Value }
      }
    }
  } catch { }
  $installedOnDisk = Test-Path -LiteralPath (Join-Path $profileDir ('node_modules\' + $packageName))
  $alreadyInstalled = $state.Dependency -and $state.Bundle -and $installedOnDisk
  if ($alreadyInstalled) {
    Write-Ok ('插件包已安装（' + $dependencyValue + '），跳过 pnpm（幂等）。')
  } else {
    $linkSpec = 'link:' + ($pluginDir -replace '\\', '/')
    if ($DryRun) {
      Write-DryInfo ('将执行：dsh plugin --profile desktop add "' + $linkSpec + '"（改动 profile 的 dependencies + bundles）')
    } else {
      Write-Warn '正在安装/更新插件包：pnpm 走 registry 时可能静默数分钟（registry 重试属正常），请勿关闭窗口。'
      Write-Info ('命令：dsh plugin --profile desktop add ' + $linkSpec)
      $result = Invoke-CaptureWithTimeout -FilePath $dshCli -Arguments @('plugin', '--profile', 'desktop', 'add', $linkSpec) -TimeoutSeconds $PnpmTimeoutSeconds -Activity 'dsh plugin add（pnpm）'
      Write-Captured $result
      if ($result.TimedOut) {
        Fail-WithCode ('插件包安装命令超时（' + $PnpmTimeoutSeconds + ' 秒）。请等 pnpm 收尾后重跑本脚本（幂等，已装部分会跳过）；诊断日志：' + (Join-Path $profileDir '.plugin-manager\logs')) 3
      }
      if ($result.Code -ne 0) {
        Fail-WithCode ('插件包安装失败（pnpm 退出码 ' + $result.Code + '）。诊断日志：' + (Join-Path $profileDir '.plugin-manager\logs')) 1
      }
      $state = Get-ProfileReferenceState -ProfileDir $profileDir -PackageName $packageName
      if (-not ($state.Dependency -and $state.Bundle)) {
        Fail-WithCode '插件包安装命令成功，但 profile 的 dependencies/bundles 里没有本包（请查看 logs 或运行 scripts\verify-restart-key.ps1 排障）。' 4
      }
      $pluginChanged = $true
      Write-Ok '插件包已安装并启用。'
    }
  }
}

# ── 3) 桌面壳补丁状态检查 ───────────────────────────────────────────────────
$patchChanged = $false
if ($SkipShellPatch) {
  Write-Step '3/5  桌面壳补丁（已按 -SkipShellPatch 跳过）'
} else {
  Write-Step '3/5  桌面壳补丁状态检查'
  $statusResult = Invoke-Capture -FilePath $NodePath -Arguments @($tool, 'status', '--asar', $asar)
  Write-Captured $statusResult
  $patchCurrent = $false
  if ($statusResult.Code -eq 0) {
    $verifyResult = Invoke-Capture -FilePath $NodePath -Arguments @($tool, 'verify', '--asar', $asar)
    if ($verifyResult.Code -eq 0) {
      $patchCurrent = $true
      Write-Ok '桌面壳补丁已是当前版本（跳过写入，幂等）。'
    } else {
      Write-Captured $verifyResult
      Write-Warn '补丁已存在但与本项目当前版本不一致：将重新应用。'
      $patchChanged = $true
    }
  } else {
    Write-Info 'app.asar 当前未打补丁：需要应用桌面壳补丁。'
    $patchChanged = $true
  }
}

# ── 4) 决策 ─────────────────────────────────────────────────────────────────
Write-Step '4/5  决策'
if (-not $pluginChanged -and -not $patchChanged) {
  if ($DryRun) { Write-DryInfo '已是目标状态：无需做任何改动。' }
  Write-Ok '已是目标状态（插件与壳补丁都是当前版本），无需改动。'
  if (-not (Test-DshRunning)) { Write-Info 'DSH 当前未运行；需要时直接打开即可看到「重启」按钮。' }
  Write-ScriptFooter '安装完成（无改动）。'
  exit 0
}
if ($DryRun) {
  if ($patchChanged) {
    Write-DryInfo '将启动独立编排进程：等待 DSH 完全退出 → 应用桌面壳补丁 → 校验 → 自动重启 DSH。'
  }
  if ($pluginChanged) { Write-DryInfo 'DSH 重启后插件包生效。' }
  Write-ScriptFooter 'DryRun 完成：未写任何文件。'
  exit 0
}
if ($patchChanged -and -not (Test-DshRunning) -and (Test-AsarExclusive -AsarPath $asar)) {
  # DSH 已经退出：直接同步执行（同一控制台可立即看到结果）
  Write-Step '5/5  应用桌面壳补丁（DSH 已退出，直接执行）'
  $orchestratorArgs = @(
    '-Action', 'install',
    '-InstallDir', $InstallDir,
    '-NodePath', $NodePath,
    '-ProjectDir', $projectRoot,
    '-TimeoutSeconds', [string]$TimeoutSeconds,
    '-NoPopup'
  )
  if ($script:LogPath) { $orchestratorArgs += @('-LogPath', $script:LogPath) }
  if ($NoRestart) { $orchestratorArgs += '-NoRestart' }
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    & (Get-PowerShellExe) -NoProfile -ExecutionPolicy Bypass -File $orchestrator @orchestratorArgs
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previous
  }
  if ($exitCode -ne 0) { exit $exitCode }
  Write-ScriptFooter '安装完成：桌面壳补丁已应用，DSH 已重新启动。'
  exit 0
}

# ── 4.5) 只差插件包：不需要改 app.asar，只需重启 DSH 让插件加载 ──────────────
if (-not $patchChanged) {
  Write-Step '5/5  插件包已安装：需要重启 DSH 后加载'
  if ($NoRestart) {
    Write-Info '已指定 -NoRestart：不自动重启；下次打开 DSH 后按钮生效。'
  } elseif (Test-DshRunning) {
    Write-Info '将启动独立进程：等待 DSH 完全退出（托盘右键 → 退出）→ 自动重启 DSH。'
    $restartArgs = @(
      '-Action', 'restart',
      '-InstallDir', $InstallDir,
      '-NodePath', $NodePath,
      '-ProjectDir', $projectRoot,
      '-TimeoutSeconds', [string]$TimeoutSeconds
    )
    if ($script:LogPath) { $restartArgs += @('-LogPath', $script:LogPath) }
    try {
      $worker = Start-DetachedWorker -WorkerPath $orchestrator -Arguments $restartArgs
      Write-Ok ('独立编排进程已启动（' + $worker.Mode + '，PID ' + $worker.ProcessId + '）。')
      Write-Log '    请右键系统托盘里的 DSH 图标 → 退出；后台进程会在退出后自动重启 DSH。' 'Yellow'
    } catch {
      Write-Warn ('无法启动独立进程（' + $_.Exception.Message + '）；请手动重启 DSH。')
    }
  } else {
    Write-Info 'DSH 当前未运行；下次打开 DSH 后按钮生效。'
  }
  Write-ScriptFooter '安装完成（插件包已就绪，未改动 app.asar）。'
  exit 0
}

# ── 5) 需要 DSH 退出：交给独立编排进程（§3.3 M3）───────────────────────────
Write-Step '5/5  需要 DSH 完全退出：启动独立编排进程'
Write-Warn '按规范，绝不在 DSH 运行时写 app.asar。'
Write-Info '将启动一个独立进程：等待 DSH 完全退出（托盘右键 → 退出）→ 打补丁 → 校验 → 自动重启 DSH。'
Write-Info '它不在 DSH 的进程树里，DSH 退出不会把它一起杀掉；完成后会弹窗提示。'
$orchestratorArgs = @(
  '-Action', 'install',
  '-InstallDir', $InstallDir,
  '-NodePath', $NodePath,
  '-ProjectDir', $projectRoot,
  '-TimeoutSeconds', [string]$TimeoutSeconds
)
if ($script:LogPath) { $orchestratorArgs += @('-LogPath', $script:LogPath) }
if ($NoRestart) { $orchestratorArgs += '-NoRestart' }
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
