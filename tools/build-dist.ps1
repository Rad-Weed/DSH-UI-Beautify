# build-dist.ps1 - packaging recipe (HANDOFF section 10, scripted since 0.3.0)
#   Checks the 3 version spots match, builds <workspace>/dist/dsh-ui-beautify-<version>.zip
#   (28 entries: plugin + splash + restart shell-patch tooling), prints entries / bytes / SHA256.
# NOTE 1: keep this file pure ASCII - Windows PowerShell 5.1 reads BOM-less files as ANSI.
# NOTE 2: every path here is built ABSOLUTE. .NET file APIs resolve relative paths against the
#         PROCESS working directory, not PowerShell's location, so `Set-Location` alone would
#         silently look in the wrong place when the script is launched from another cwd.
# Usage: powershell -ExecutionPolicy Bypass -File <plugin>\tools\build-dist.ps1
$ErrorActionPreference = 'Stop'
$scriptDir = (Resolve-Path $PSScriptRoot).Path
$pluginDir = Split-Path -Parent $scriptDir          # <workspace>\dsh-ui-beautify
$workspace = Split-Path -Parent $pluginDir          # <workspace>
$plugin = Split-Path -Leaf $pluginDir
Set-Location $workspace
[Environment]::CurrentDirectory = $workspace

$pkgRaw = [System.IO.File]::ReadAllText((Join-Path $pluginDir 'package.json'))
$version = [regex]::Match($pkgRaw, '"version"\s*:\s*"([^"]+)"').Groups[1].Value
$vClient = (Select-String -Path (Join-Path $pluginDir 'lib\client.js') -Pattern "VERSION = '([^']+)'").Matches[0].Groups[1].Value
$vHost = (Select-String -Path (Join-Path $pluginDir 'lib\index.js') -Pattern "PLUGIN_VERSION = '([^']+)'").Matches[0].Groups[1].Value
if ($vClient -ne $version -or $vHost -ne $version) {
  throw "version mismatch: pkg=$version / client=$vClient / host=$vHost"
}
"pluginDir : $pluginDir"
"workspace : $workspace"
"versions consistent: $version"

$distDir = Join-Path $workspace 'dist'
New-Item -ItemType Directory -Force $distDir | Out-Null
$out = Join-Path $distDir "$plugin-$version.zip"
Add-Type -AssemblyName System.IO.Compression.FileSystem
$entries = @(
  'package.json', 'cordis.patch.yml', 'README.md', 'HANDOFF.md', 'LICENSE',
  'lib/client.js', 'lib/index.js',
  'assets/deepseek-4k.webp', 'assets/deepseek-bw-nowater.webp', 'assets/deepseek-dark.webp', 'assets/splash.html', 'assets/dynamic-layout.json', 'assets/deepseek-4k-2x.webp', 'assets/deepseek-dark-2x.webp',
  'scripts/uninstall-cleanup.ps1',
  'restart/README.md', 'restart/USAGE.txt',
  'restart/install-restart-key.cmd', 'restart/uninstall-restart-key.cmd', 'restart/verify-restart-key.cmd',
  'restart/scripts/common.ps1', 'restart/scripts/install-restart-key.ps1', 'restart/scripts/uninstall-restart-key.ps1',
  'restart/scripts/verify-restart-key.ps1', 'restart/scripts/restore-on-exit.ps1',
  'restart/scripts/auto-restore-on-uninstall.ps1',
  'restart/shell/patch-spec.json',
  'restart/shell/patches/main.js.snippet.txt', 'restart/shell/patches/preload-app.cjs.snippet.txt',
  'restart/shell/tools/apply-shell-patch.mjs',
  'test/host.test.mjs', 'test/client.test.mjs', 'test/fake-dom.js'
)
if (Test-Path $out) { Remove-Item $out -Force }
$zip = [System.IO.Compression.ZipFile]::Open($out, 'Create')
try {
  foreach ($rel in $entries) {
    $src = Join-Path $pluginDir ($rel -replace '/', '\')
    if (-not (Test-Path $src)) { throw "missing file: $rel" }
    [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, (Resolve-Path $src), "$plugin/$rel", 'Optimal')
  }
} finally { $zip.Dispose() }

$z = [System.IO.Compression.ZipFile]::OpenRead($out)
try {
  $z.Entries | ForEach-Object { '{0,9}  {1}' -f $_.Length, $_.FullName }
  "entries: $($z.Entries.Count)"
} finally { $z.Dispose() }
Get-Item $out | ForEach-Object { "zip: $($_.FullName)"; "zip bytes: $($_.Length)" }
Get-FileHash $out -Algorithm SHA256 | ForEach-Object { "SHA256: $($_.Hash)" }
