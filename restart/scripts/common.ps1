# ============================================================================
# common.ps1 —— DSH 重启键 · 安装/卸载脚本公共库
# ============================================================================
# 对应《DSH 插件作者安装卸载与外部副作用规范建议 v0.1》：
#   §3.1 M1 安装/卸载对称、幂等、可重入
#   §3.3 M3 壳补丁类：绝不在 DSH 运行时写 app.asar；独立进程等待；双 SHA 校验
#   §3.4 M4 卸载后自检并清理「四件套 + 联接」
#   §3.5 M5 用户数据默认保留（本插件无用户数据）
#   §3.6 M6 等待 / 超时 / 日志 / 弹窗 / 退出码
#
# 用法：各脚本开头 `. (Join-Path $PSScriptRoot 'common.ps1')`，然后调用
#       Initialize-Common -LogName install; 其余函数直接用。
#
# 退出码约定（全项目一致）：
#   0 = 成功（含「已是目标状态」）；1 = 失败；2 = 参数错误；
#   3 = 等待超时；4 = 校验失败（SHA 不符 / 四件套仍有引用 / 补丁状态异常）。
#
# 注意：本文件含中文，Windows PowerShell 5.1 需要 UTF-8 BOM（仓库里已带）。
# ============================================================================

$ErrorActionPreference = 'Stop'

# 脚本目录（scripts）的上一级 = 项目根目录
$script:ProjectRoot = Split-Path -Parent $PSScriptRoot
$script:LogPath = $null
$script:LogName = 'dsh-restart-key'
$script:IsDryRun = $false
$script:DshProcessName = 'DeepSeek Harness'
$script:ExitCodeSuccess = 0
$script:ExitCodeFailure = 1
$script:ExitCodeParam = 2
$script:ExitCodeTimeout = 3
$script:ExitCodeVerify = 4

# ── 日志 / 输出 ─────────────────────────────────────────────────────────────

function Initialize-Common {
  param(
    [string]$LogName = 'dsh-restart-key',
    [switch]$DryRun
  )
  # 统一按 UTF-8 解码子进程输出（pnpm/工具输出都是 UTF-8；PS5.1 默认 OEM 会乱码）
  try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }
  try { $OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }
  $script:LogName = $LogName
  $script:IsDryRun = [bool]$DryRun
  $logsDir = Join-Path $script:ProjectRoot 'logs'
  if (-not (Test-Path -LiteralPath $logsDir)) {
    New-Item -ItemType Directory -Path $logsDir -Force | Out-Null
  }
  $script:LogPath = Join-Path $logsDir ($LogName + '-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.log')
  if (-not $script:IsDryRun) {
    try {
      Add-Content -LiteralPath $script:LogPath -Value ('==== ' + $LogName + ' ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + ' ====') -Encoding UTF8
    } catch { }
  }
}

function Get-LogPath { return $script:LogPath }
function Get-ProjectRoot { return $script:ProjectRoot }
function Test-DryRun { return [bool]$script:IsDryRun }

<#
沿用父进程传下来的同一个日志文件（独立编排进程用），不另开新日志。
#>
function Set-CommonLogPath {
  param(
    [string]$LogPath,
    [switch]$DryRun
  )
  $script:LogPath = $LogPath
  $script:IsDryRun = [bool]$DryRun
  if (-not $DryRun -and $LogPath) {
    try {
      Add-Content -LiteralPath $LogPath -Value ('[' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + '] ---- 独立编排进程 PID ' + $PID + ' ----') -Encoding UTF8
    } catch { }
  }
}

<#
计算文件 SHA256（不依赖 Get-FileHash：DSH 内部启动的脚本可能继承 PowerShell 7 的
PSModulePath，此时 Windows PowerShell 5.1 会找不到 Microsoft.PowerShell.Utility 里的
Get-FileHash；这里直接用 .NET 实现，任何环境都可用）。
#>
function Get-Sha256OfFile {
  param([Parameter(Mandatory = $true)][string]$FilePath)
  if (-not (Test-Path -LiteralPath $FilePath)) { return $null }
  $stream = [System.IO.File]::OpenRead($FilePath)
  try {
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try { $hash = $sha.ComputeHash($stream) } finally { $sha.Dispose() }
    $builder = New-Object System.Text.StringBuilder
    foreach ($byte in $hash) { [void]$builder.Append($byte.ToString("X2")) }
    return $builder.ToString()
  } finally {
    $stream.Dispose()
  }
}
function Write-Log {
  param(
    [string]$Text = '',
    [string]$Color = 'Gray'
  )
  Write-Host $Text -ForegroundColor $Color
  if ($script:IsDryRun) { return }
  if (-not $script:LogPath) { return }
  try {
    Add-Content -LiteralPath $script:LogPath -Value ('[' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + '] ' + $Text) -Encoding UTF8
  } catch { }
}

function Write-Info { param([string]$Text = '') Write-Log ('   ' + $Text) }
function Write-Step { param([string]$Text) Write-Log ''; Write-Log ('== ' + $Text) 'Cyan' }
function Write-Ok { param([string]$Text) Write-Log ('   [OK] ' + $Text) 'Green' }
function Write-Warn { param([string]$Text) Write-Log ('   [注意] ' + $Text) 'Yellow' }
function Write-ErrInfo { param([string]$Text) Write-Log ('   [失败] ' + $Text) 'Red' }
function Write-DryInfo { param([string]$Text) Write-Log ('   [DryRun] ' + $Text) 'Yellow' }

function Show-Popup {
  param(
    [string]$Title = 'DSH 重启键',
    [string]$Text = '',
    [int]$Icon = 64  # 16 错误 / 32 问号 / 48 警告 / 64 信息
  )
  try {
    $shell = New-Object -ComObject WScript.Shell
    $shell.Popup($Text, 0, $Title, $Icon) | Out-Null
  } catch { }
}

function Fail-WithCode {
  param(
    [string]$Text,
    [int]$Code = 1,
    [switch]$NoPopup
  )
  Write-ErrInfo $Text
  Write-ErrInfo ('退出码：' + $Code + '（日志：' + $(if ($script:LogPath) { $script:LogPath } else { '无' }) + '）')
  if (-not $NoPopup -and -not $script:IsDryRun) {
    Show-Popup -Title 'DSH 重启键' -Text ($Text + "`r`n`r`n日志：`r`n" + $script:LogPath) -Icon 16
  }
  exit $Code
}

function Get-ExitCodeHelp {
  return @'
退出码：0 = 成功（含"已是目标状态"）；1 = 失败；2 = 参数错误；
        3 = 等待超时（DSH 没退出 / 被占用）；4 = 校验失败（SHA 不符 / 残留引用）。
'@
}

# ── 进程 / 文件状态 ─────────────────────────────────────────────────────────

function Get-DshProcesses {
  try {
    return @(Get-Process -Name $script:DshProcessName -ErrorAction SilentlyContinue)
  } catch {
    return @()
  }
}

function Test-DshRunning {
  return ((Get-DshProcesses).Count -gt 0)
}

function Test-AsarExclusive {
  param([string]$AsarPath)
  if (-not (Test-Path -LiteralPath $AsarPath)) { return $false }
  try {
    $stream = [System.IO.File]::Open($AsarPath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
    $stream.Dispose()
    return $true
  } catch {
    return $false
  }
}

<#
等 DSH「完全退出」：进程数为 0 且 app.asar 可独占打开，连续 3 次确认（间隔 2 秒）。
只有满足这个条件才允许改 app.asar（§3.3 M3）。
#>
function Wait-DshFullyExited {
  param(
    [Parameter(Mandatory = $true)][string]$AsarPath,
    [int]$TimeoutSeconds = 3600,
    [int]$QuietAfterSeconds = 0
  )
  $startedAt = Get-Date
  $deadline = $startedAt.AddSeconds($TimeoutSeconds)
  $clean = 0
  $lastNotice = Get-Date
  if (Test-DshRunning) {
    $minutes = [int][Math]::Ceiling($TimeoutSeconds / 60)
    Write-Warn '检测到 DSH 正在运行：改 app.asar 必须等它完全退出。'
    Write-Warn '请右键系统托盘里的 DSH 图标 → 退出（只关窗口只是隐藏到托盘；不要点「重启」按钮）。'
    Write-Warn ('本脚本是独立进程，DSH 退出不会中断它；最多等待 ' + $minutes + ' 分钟。')
  }
  while ($true) {
    $running = Test-DshRunning
    $openable = $false
    if (-not $running) { $openable = Test-AsarExclusive -AsarPath $AsarPath }
    if ((-not $running) -and $openable) {
      $clean++
      if ($clean -ge 3) {
        Write-Ok ('DSH 已完全退出（等待 ' + [int]((Get-Date) - $startedAt).TotalSeconds + ' 秒），app.asar 可独占打开。')
        return $true
      }
    } else {
      $clean = 0
    }
    if ((Get-Date) -gt $deadline) {
      Write-ErrInfo ('等待 DSH 退出超时（' + [int]((Get-Date) - $startedAt).TotalSeconds + ' 秒）。本次没有修改 app.asar。')
      return $false
    }
    if (((Get-Date) - $lastNotice).TotalSeconds -ge 20) {
      Write-Log ('  仍在等待 DSH 完全退出（已等 ' + [int]((Get-Date) - $startedAt).TotalSeconds + ' 秒）...') 'DarkGray'
      $lastNotice = Get-Date
    }
    Start-Sleep -Seconds 2
  }
}

<#
当前脚本是不是跑在 DSH 的进程树里（agent 工具调用 / DSH 内置终端）。
是的话，等 DSH 退出时必须把等待逻辑交给独立进程，否则会被一起杀掉（§3.3 M3）。
#>
function Test-InsideDshTree {
  try {
    if ($env:DSH_SESSION_ID -or $env:DSH_PROFILE_DIR -or $env:DSH_WEB_URL) { return $true }
    $seen = @{}
    $current = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $PID) -ErrorAction Stop
    $seen[[int]$PID] = $true
    while ($null -ne $current -and $current.ParentProcessId -gt 0) {
      $parentId = [int]$current.ParentProcessId
      if ($seen.ContainsKey($parentId)) { break }
      $seen[$parentId] = $true
      $parent = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $parentId) -ErrorAction SilentlyContinue
      if ($null -eq $parent) { break }
      if ($parent.Name -like 'DeepSeek Harness*') { return $true }
      $current = $parent
    }
  } catch { }
  return $false
}

function Get-PowerShellExe {
  if ($PSHOME) {
    $candidate = Join-Path $PSHOME 'powershell.exe'
    if (Test-Path -LiteralPath $candidate) { return $candidate }
  }
  return (Get-Process -Id $PID).Path
}

function Quote-CommandArgument {
  param([string]$Value)
  if ($null -eq $Value) { return '""' }
  $text = [string]$Value
  if ($text -eq '') { return '""' }
  if ($text -match '[\s"]') {
    return '"' + ($text -replace '"', '\"') + '"'
  }
  return $text
}

<#
启动独立进程（不随调用方退出而被杀）。
- 在 DSH 进程树里：用 WMI Win32_Process.Create 逃逸（§3.3 M3 要求）；
- 不在 DSH 进程树里（用户双击 cmd）：普通隐藏子进程即可。
返回 @{ Mode; ProcessId }。
#>
function Start-DetachedWorker {
  param(
    [Parameter(Mandatory = $true)][string]$WorkerPath,
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [string]$WorkingDirectory = $script:ProjectRoot,
    [switch]$ForceWmi
  )
  if (-not (Test-Path -LiteralPath $WorkerPath)) {
    throw ('找不到独立进程脚本：' + $WorkerPath)
  }
  $psExe = Get-PowerShellExe
  $argLine = (@('-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', (Quote-CommandArgument $WorkerPath)) + ($Arguments | ForEach-Object { Quote-CommandArgument $_ })) -join ' '
  # 规范 §3.3：等待方必须是独立进程 —— 一律走 WMI Win32_Process.Create，
  # 不依赖父进程（双击 cmd 时父进程虽是 Explorer，也统一用 WMI，行为一致）。
  $useWmi = $true
  if ($useWmi) {
    try {
      $commandLine = (Quote-CommandArgument $psExe) + ' ' + $argLine
      $result = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
        CommandLine      = $commandLine
        CurrentDirectory = $WorkingDirectory
      } -ErrorAction Stop
      if ($null -eq $result -or [int]$result.ReturnValue -ne 0) {
        throw ('Win32_Process.Create 返回 ' + $(if ($result) { $result.ReturnValue } else { 'null' }))
      }
      Write-Log ('  已启动独立等待进程（WMI 逃逸，PID ' + [int]$result.ProcessId + '，不在 DSH 进程树里）') 'DarkGray'
      return [pscustomobject]@{ Mode = 'wmi'; ProcessId = [int]$result.ProcessId; Process = $null }
    } catch {
      Write-Warn ('WMI 独立进程启动失败：' + $_.Exception.Message + '；改用普通子进程。')
    }
  }
  $process = Start-Process -FilePath $psExe -ArgumentList $argLine -WindowStyle Hidden -PassThru
  Write-Log ('  已启动后台进程（PID ' + $process.Id + '）') 'DarkGray'
  return [pscustomobject]@{ Mode = 'process'; ProcessId = $process.Id; Process = $process }
}

<#
去掉会把 DSH 启动成 Node 模式的环境变量（§4 实现备注：实测踩过的坑）。
#>
function Clear-ElectronRunAsNodeEnv {
  foreach ($name in @('ELECTRON_RUN_AS_NODE', 'ELECTRON_NO_ATTACH_CONSOLE', 'NODE_OPTIONS', 'NODE_UNOPTIONS')) {
    try { Remove-Item -Path ('Env:' + $name) -ErrorAction SilentlyContinue } catch { }
  }
}

<#
启动（或重启）DSH 桌面端：先清掉 ELECTRON_RUN_AS_NODE，否则会以 Node 模式跑。
#>
function Start-DshApplication {
  param([Parameter(Mandatory = $true)][string]$InstallDir)
  $exe = Join-Path $InstallDir 'DeepSeek Harness.exe'
  if (-not (Test-Path -LiteralPath $exe)) {
    Write-ErrInfo ('找不到 DSH 可执行文件：' + $exe)
    return $false
  }
  try {
    Clear-ElectronRunAsNodeEnv
    $workingDirectory = $InstallDir
    Start-Process -FilePath $exe -WorkingDirectory $workingDirectory | Out-Null
    Write-Ok '已重新启动 DSH 桌面端。'
    return $true
  } catch {
    Write-ErrInfo ('启动 DSH 失败：' + $_.Exception.Message)
    return $false
  }
}

# ── 外部命令（node / dsh.cmd）────────────────────────────────────────────────

<#
运行外部命令并合并捕获 stdout/stderr。
Windows PowerShell 5.1 的怪癖：原生命令写 stderr 会被包装成 ErrorRecord，
若 ErrorActionPreference=Stop 会被当致命错误；这里临时 Continue + 2>&1 合并捕获。
返回 @{ Code; Lines }。
#>
function Invoke-Capture {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [string[]]$Arguments = @()
  )
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $raw = & $FilePath @Arguments 2>&1
    $code = $LASTEXITCODE
    $lines = @()
    foreach ($item in @($raw)) {
      $text = ''
      try { $text = [string]$item } catch { $text = '' }
      foreach ($part in ($text -split "`r?`n")) {
        if ($part -ne '') { $lines += $part }
      }
    }
    return [pscustomobject]@{ Code = $code; Lines = $lines }
  } finally {
    $ErrorActionPreference = $previous
  }
}

function Write-Captured {
  param(
    $Result,
    [string]$Indent = '   '
  )
  if (-not $Result) { return }
  foreach ($line in @($Result.Lines)) {
    Write-Log ($Indent + $line) 'DarkGray'
  }
}

<#
运行外部命令并带超时与进度提示（用于 pnpm —— 它走 registry 时可能静默数分钟）。
返回 @{ Code; Lines; TimedOut }；超时时 Code = 124。
#>
function Invoke-CaptureWithTimeout {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [string[]]$Arguments = @(),
    [int]$TimeoutSeconds = 1800,
    [string]$Activity = '外部命令'
  )
  $job = Start-Job -ScriptBlock {
    param($CommandPath, $CommandArguments)
    try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
      $raw = & $CommandPath @CommandArguments 2>&1
      $code = $LASTEXITCODE
      $lines = @()
      foreach ($item in @($raw)) {
        $text = ''
        try { $text = [string]$item } catch { $text = '' }
        foreach ($part in ($text -split "`r?`n")) {
          if ($part -ne '') { $lines += $part }
        }
      }
      return [pscustomobject]@{ Code = $code; Lines = $lines }
    } finally {
      $ErrorActionPreference = $previous
    }
  } -ArgumentList $FilePath, (,$Arguments)

  $startedAt = Get-Date
  $deadline = $startedAt.AddSeconds($TimeoutSeconds)
  $finished = $null
  while ((Get-Date) -lt $deadline) {
    $finished = Wait-Job -Job $job -Timeout 15
    if ($finished) { break }
    Write-Log ('  ' + $Activity + ' 仍在运行（已等 ' + [int]((Get-Date) - $startedAt).TotalSeconds + ' 秒）... 走 registry 时可能静默数分钟，请勿关闭窗口') 'DarkGray'
  }
  if (-not $finished) {
    Write-Warn ($Activity + ' 超时（' + $TimeoutSeconds + ' 秒）—— 后台命令可能仍在收尾。请稍等片刻再重跑脚本，不要连续重复点击。')
    try { Stop-Job -Job $job -ErrorAction SilentlyContinue } catch { }
    try { Remove-Job -Job $job -Force -ErrorAction SilentlyContinue } catch { }
    return [pscustomobject]@{ Code = 124; Lines = @(); TimedOut = $true }
  }
  $output = @(Receive-Job -Job $job -ErrorAction SilentlyContinue)
  try { Remove-Job -Job $job -Force -ErrorAction SilentlyContinue } catch { }
  $result = $null
  foreach ($item in $output) {
    if ($null -ne $item -and $item.PSObject -and $item.PSObject.Properties['Code']) { $result = $item }
  }
  if ($null -eq $result) {
    $texts = @()
    foreach ($item in $output) { $texts += [string]$item }
    return [pscustomobject]@{ Code = 1; Lines = $texts; TimedOut = $false }
  }
  return [pscustomobject]@{ Code = [int]$result.Code; Lines = @($result.Lines); TimedOut = $false }
}

# ── 项目/安装路径 ───────────────────────────────────────────────────────────

function Resolve-DshInstallDir {
  param([string]$InstallDir = '')
  if ($InstallDir) {
    $resolved = [System.IO.Path]::GetFullPath($InstallDir)
    if (-not (Test-Path -LiteralPath (Join-Path $resolved 'resources\app.asar'))) {
      throw ('指定的安装目录里没有 resources\app.asar：' + $resolved)
    }
    return $resolved
  }
  $candidates = @(
    'D:\DSH',
    (Join-Path $env:ProgramFiles 'DeepSeek Harness'),
    (Join-Path ${env:ProgramFiles(x86)} 'DeepSeek Harness'),
    (Join-Path $env:LOCALAPPDATA 'Programs\DeepSeek Harness')
  )
  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path -LiteralPath (Join-Path $candidate 'resources\app.asar'))) {
      return $candidate
    }
  }
  throw '没有自动找到 DSH 安装目录，请用 -InstallDir 指定（例如 -InstallDir "D:\DSH"）。'
}

function Resolve-NodePath {
  param(
    [string]$InstallDir,
    [string]$NodePath = ''
  )
  if ($NodePath) {
    if (-not (Test-Path -LiteralPath $NodePath)) { throw ('指定的 node.exe 不存在：' + $NodePath) }
    return [System.IO.Path]::GetFullPath($NodePath)
  }
  $bundled = Join-Path $InstallDir 'resources\runtime\primary-runtime\dependencies\node\bin\node.exe'
  if (Test-Path -LiteralPath $bundled) { return $bundled }
  $command = Get-Command node -ErrorAction SilentlyContinue
  if ($command -and $command.Source) { return $command.Source }
  throw '找不到 node.exe（DSH 自带的应在 resources\runtime\primary-runtime\dependencies\node\bin\node.exe；也可用 -NodePath 指定）。'
}

function Get-ProfileDir {
  if ($env:DSH_PROFILE_DIR) { return $env:DSH_PROFILE_DIR }
  return (Join-Path $env:USERPROFILE '.dsh\profiles\desktop')
}

# ── 插件管理「四件套 + 联接」自检（§3.4 M4）──────────────────────────────────

function Test-FileContains {
  param(
    [string]$FilePath,
    [string]$Needle
  )
  if (-not (Test-Path -LiteralPath $FilePath)) { return $false }
  try {
    $text = [System.IO.File]::ReadAllText($FilePath)
    return ($text.IndexOf($Needle, [System.StringComparison]::OrdinalIgnoreCase) -ge 0)
  } catch {
    return $false
  }
}

function Get-ProfileReferenceState {
  param(
    [string]$ProfileDir,
    [Parameter(Mandatory = $true)][string]$PackageName
  )
  $packageJson = Join-Path $ProfileDir 'package.json'
  $lockFile = Join-Path $ProfileDir 'pnpm-lock.yaml'
  $modulesYaml = Join-Path $ProfileDir 'node_modules\.modules.yaml'
  $cordisYml = Join-Path $ProfileDir 'cordis.yml'
  $junctionPath = Join-Path $ProfileDir ('node_modules\' + $PackageName)

  $hasDependency = $false
  $hasBundle = $false
  if (Test-Path -LiteralPath $packageJson) {
    try {
      $manifest = Get-Content -LiteralPath $packageJson -Raw -Encoding UTF8 | ConvertFrom-Json
      if ($manifest.dependencies) {
        foreach ($property in $manifest.dependencies.PSObject.Properties) {
          if ($property.Name -eq $PackageName) { $hasDependency = $true }
        }
      }
      if ($manifest.dsh -and $manifest.dsh.profile -and $manifest.dsh.profile.bundles) {
        foreach ($bundle in @($manifest.dsh.profile.bundles)) {
          if ($bundle -eq $PackageName) { $hasBundle = $true }
        }
      }
    } catch { }
  }

  $junction = $null
  if (Test-Path -LiteralPath $junctionPath) {
    $item = Get-Item -LiteralPath $junctionPath -Force -ErrorAction SilentlyContinue
    if ($item) {
      $junction = [pscustomobject]@{
        Path     = $item.FullName
        LinkType = [string]$item.LinkType
        Target   = ($item.Target -join '; ')
      }
    }
  }

  return [pscustomobject]@{
    PackageName      = $PackageName
    ProfileDir       = $ProfileDir
    PackageJsonPath  = $packageJson
    Dependency       = $hasDependency
    Bundle           = $hasBundle
    LockFile         = (Test-FileContains -FilePath $lockFile -Needle $PackageName)
    ModulesYaml      = (Test-FileContains -FilePath $modulesYaml -Needle $PackageName)
    CordisYml        = (Test-FileContains -FilePath $cordisYml -Needle $PackageName)
    Junction         = $junction
  }
}

function Get-ProfileReferenceCount {
  param($State)
  $count = 0
  if ($State.Dependency) { $count++ }
  if ($State.Bundle) { $count++ }
  if ($State.LockFile) { $count++ }
  if ($State.ModulesYaml) { $count++ }
  if ($State.CordisYml) { $count++ }
  if ($State.Junction) { $count++ }
  return $count
}

function Write-ProfileReferenceState {
  param($State)
  $rows = @(
    @{ Label = 'package.json · dependencies'; Value = $State.Dependency },
    @{ Label = 'package.json · dsh.profile.bundles'; Value = $State.Bundle },
    @{ Label = 'pnpm-lock.yaml'; Value = $State.LockFile },
    @{ Label = 'node_modules\.modules.yaml'; Value = $State.ModulesYaml },
    @{ Label = 'cordis.yml'; Value = $State.CordisYml }
  )
  foreach ($row in $rows) {
    if ($row.Value) { Write-Log ('  ✗ ' + $row.Label + '：仍引用 ' + $State.PackageName) 'Red' }
    else { Write-Log ('  ✓ ' + $row.Label + '：无引用') 'Green' }
  }
  if ($State.Junction) {
    Write-Log ('  ! node_modules\' + $State.PackageName + ' 仍有残留联接（' + $State.Junction.LinkType + ' → ' + $State.Junction.Target + '）') 'Yellow'
  } else {
    Write-Log ('  ✓ node_modules\' + $State.PackageName + '：无残留') 'Green'
  }
}

function Remove-OrphanJunction {
  param(
    $State,
    [switch]$Fix
  )
  if (-not $State.Junction) { return $true }
  $junction = $State.Junction
  if ([string]$junction.LinkType -notmatch 'Junction|SymbolicLink') {
    Write-ErrInfo ('node_modules\' + $State.PackageName + ' 不是联接（可能是真实目录）：为安全起见不自动删除，请人工确认：' + $junction.Path)
    return $false
  }
  if ($script:IsDryRun) {
    Write-DryInfo ('将执行：cmd /c rmdir "' + $junction.Path + '"（只删联接，不动链接目标）')
    return $true
  }
  if (-not $Fix) {
    Write-Warn ('残留联接未清理（未指定 -Fix）：' + $junction.Path)
    return $false
  }
  try {
    & cmd /c rmdir "$($junction.Path)" 2>&1 | Out-Null
  } catch { }
  if (Test-Path -LiteralPath $junction.Path) {
    Write-ErrInfo ('删除残留联接失败（可能被占用）：' + $junction.Path)
    return $false
  }
  Write-Ok ('已删除残留联接（链接目标未受影响）：' + $junction.Path)
  return $true
}

<#
卸载后的「四件套 + 联接」自检与清理（§3.4 M4）。
返回 $true 表示已干净；$false 表示仍有残留（调用方应按退出码 4 处理）。
#>
function Invoke-ProfileCleanup {
  param(
    [string]$ProfileDir = (Get-ProfileDir),
    [Parameter(Mandatory = $true)][string]$PackageName,
    [switch]$Fix
  )
  Write-Step '卸载后自检：插件管理四件套 + 联接'
  $state = Get-ProfileReferenceState -ProfileDir $ProfileDir -PackageName $PackageName
  Write-ProfileReferenceState -State $state
  $junctionOk = Remove-OrphanJunction -State $state -Fix:$Fix
  $state = Get-ProfileReferenceState -ProfileDir $ProfileDir -PackageName $PackageName
  $references = Get-ProfileReferenceCount -State ([pscustomobject]@{
    Dependency  = $state.Dependency
    Bundle      = $state.Bundle
    LockFile    = $state.LockFile
    ModulesYaml = $state.ModulesYaml
    CordisYml   = $state.CordisYml
    Junction    = $null
  })
  $ok = ($references -eq 0) -and $junctionOk -and (-not $state.Junction)
  if ($ok) {
    Write-Ok '四件套与联接均已清理干净。'
  } else {
    Write-ErrInfo '仍有残留引用（见上方 ✗/!）。常见处理：等插件管理器彻底结束后重试，或运行 scripts\uninstall-restart-key.ps1（开发者）；'
    Write-ErrInfo '或手动检查 .dsh\profiles\desktop\.plugin-manager\logs\operation-*\pnpm.log 后再试。'
  }
  return $ok
}

# ── 外部副作用声明（§3.2 M2）────────────────────────────────────────────────

function Write-EffectsDeclaration {
  Write-Step '外部副作用声明（本插件会改什么、怎么还原）'
  Write-Log '  修改对象：DSH 安装目录的 resources\app.asar 中两个已存在条目：'
  Write-Log '            lib/main.js（主进程 IPC）与 lib/preload-app.cjs（preload 桥）'
  Write-Log '  修改方式：只追加补丁块并把这两个条目的 offset/size/integrity 指向文件末尾新位置，其余文件字节不动'
  Write-Log '  在线还原：否。改/还原 app.asar 必须 DSH 完全退出（运行中会被独占锁定）'
  Write-Log '  备份位置：<DSH 安装目录>\resources\.dsh-restart-button-backup\'
  Write-Log '            （app.asar.header.bin + meta.json，含 originalSize / originalSha256 / patchedSha256）'
  Write-Log '  反向操作：在插件管理里卸载本插件（自动清理）；细节见 README「外部副作用声明」'
  Write-Log '  用户数据：无（本插件不写任何用户数据目录，卸载默认无需清理数据）'
}

function Write-ScriptFooter {
  param([string]$Text = '')
  Write-Log ''
  Write-Log '=====================================================' 'Green'
  if ($Text) { Write-Log ('  ' + $Text) 'Green' }
  if ($script:LogPath -and -not $script:IsDryRun) { Write-Log ('  日志：' + $script:LogPath) 'DarkGray' }
  Write-Log '=====================================================' 'Green'
}
