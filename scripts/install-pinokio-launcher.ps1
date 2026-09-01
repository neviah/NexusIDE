param(
    [string]$Name = "nexuside"
)

$ErrorActionPreference = "Stop"
$configPath = Join-Path $HOME ".pinokio\config.json"
$pinokioHome = $null
if (Test-Path $configPath) {
    $config = Get-Content $configPath -Raw | ConvertFrom-Json
    $pinokioHome = $config.home
}
if (-not $pinokioHome) {
    try {
        $pinokioHome = (Invoke-RestMethod "http://127.0.0.1:42000/pinokio/home" -TimeoutSec 3).path
    } catch {
        if ($config.access) {
            $endpoint = "$($config.access.protocol)://$($config.access.host):$($config.access.port)/pinokio/home"
            try { $pinokioHome = (Invoke-RestMethod $endpoint -TimeoutSec 3).path } catch { }
        }
    }
}
if (-not $pinokioHome) {
    $pinokioHome = $env:PINOKIO_HOME
}
if (-not $pinokioHome) {
    throw "PINOKIO_HOME could not be resolved. Configure Pinokio before installing the launcher."
}

$pinokioHome = [System.IO.Path]::GetFullPath($pinokioHome)
$target = Join-Path $pinokioHome "api\$Name"
New-Item -ItemType Directory -Force -Path $target | Out-Null

$files = @{
    "pinokio.js" = @'
module.exports = {
  version: "7.0",
  title: "NexusIDE",
  description: "A Code-OSS IDE with free-first AI routing and supervised coding agents.",
  icon: "icon.png",
  menu: async (kernel, info) => {
    const installed = info.exists("app/NexusIDE.exe")
    const running = {
      install: info.running("install.js"),
      start: info.running("start.js"),
      update: info.running("update.js"),
      repair: info.running("repair.js"),
      reset: info.running("reset.js")
    }
    if (running.install || running.update || running.repair || running.reset) {
      const active = Object.keys(running).find((name) => running[name])
      const labels = { install: "Installing", update: "Updating", repair: "Repairing", reset: "Resetting" }
      return [{ default: true, icon: "fa-solid fa-terminal", text: labels[active], href: `${active}.js` }]
    }
    if (!installed) {
      return [{ default: true, icon: "fa-solid fa-plug", text: "Install", href: "install.js" }]
    }
    return [
      { default: true, icon: "fa-solid fa-power-off", text: "Launch", href: "start.js" },
      { icon: "fa-solid fa-rotate", text: "Update", href: "update.js" },
      { icon: "fa-solid fa-screwdriver-wrench", text: "Repair", href: "repair.js" },
      { icon: "fa-regular fa-circle-xmark", text: "Reset", href: "reset.js" }
    ]
  }
}
'@
    "install.js" = @'
module.exports = {
  requires: { platform: "win32" },
  run: [{
    method: "shell.run",
    params: { message: "powershell -NoProfile -ExecutionPolicy Bypass -File install.ps1" }
  }]
}
'@
    "start.js" = @'
module.exports = {
  run: [{
    method: "shell.run",
    params: { path: "app", message: "powershell -NoProfile -Command \"Start-Process -FilePath './NexusIDE.exe'\"" }
  }]
}
'@
    "update.js" = @'
module.exports = {
  requires: { platform: "win32" },
  run: [{
    method: "shell.run",
    params: { message: "powershell -NoProfile -ExecutionPolicy Bypass -File install.ps1 -Force" }
  }]
}
'@
    "repair.js" = @'
module.exports = {
  requires: { platform: "win32" },
  run: [{
    method: "shell.run",
    params: { message: "powershell -NoProfile -ExecutionPolicy Bypass -File install.ps1 -Force" }
  }]
}
'@
    "reset.js" = @'
module.exports = {
  run: [{ method: "fs.rm", params: { path: "app" } }]
}
'@
    "install.ps1" = @'
param([switch]$Force)
$ErrorActionPreference = "Stop"
$repo = "neviah/NexusIDE"
$app = Join-Path $PSScriptRoot "app"
$staging = Join-Path $PSScriptRoot ".download"
if ((Test-Path (Join-Path $app "NexusIDE.exe")) -and -not $Force) {
    Write-Host "NexusIDE is already installed."
    exit 0
}
$headers = @{ "User-Agent" = "NexusIDE-Pinokio" }
$release = Invoke-RestMethod "https://api.github.com/repos/$repo/releases/latest" -Headers $headers
$archiveAsset = $release.assets | Where-Object name -Like "NexusIDE-win32-x64-*.zip" | Select-Object -First 1
$manifestAsset = $release.assets | Where-Object name -EQ "release.json" | Select-Object -First 1
if (-not $archiveAsset -or -not $manifestAsset) { throw "The latest release is missing required artifacts." }
Remove-Item $staging -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $staging | Out-Null
$archive = Join-Path $staging $archiveAsset.name
$manifestPath = Join-Path $staging "release.json"
Invoke-WebRequest $archiveAsset.browser_download_url -Headers $headers -OutFile $archive
Invoke-WebRequest $manifestAsset.browser_download_url -Headers $headers -OutFile $manifestPath
$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
$record = $manifest.files | Where-Object name -EQ $archiveAsset.name
if (-not $record -or (Get-FileHash $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $record.sha256) {
    throw "The downloaded NexusIDE archive failed checksum validation."
}
$next = Join-Path $PSScriptRoot "app.next"
Remove-Item $next -Recurse -Force -ErrorAction SilentlyContinue
Expand-Archive $archive -DestinationPath $next
if (-not (Test-Path (Join-Path $next "NexusIDE.exe"))) { throw "The release archive is invalid." }
Remove-Item $app -Recurse -Force -ErrorAction SilentlyContinue
Move-Item $next $app
Remove-Item $staging -Recurse -Force
Write-Host "NexusIDE $($manifest.version) is ready."
'@
    "README.md" = @'
# NexusIDE for Pinokio

Install and launch the latest unsigned NexusIDE private alpha on Windows. Update downloads the newest GitHub release, Repair re-downloads the current release, and Reset removes the installed application while leaving the launcher intact.

Windows may show an unsigned-publisher warning. Review the release checksum before continuing. Provider credentials remain in NexusIDE SecretStorage and are not managed by Pinokio.

## Automation

NexusIDE is a desktop application and exposes no HTTP API, so curl does not apply. JavaScript can use `child_process.spawn("app/NexusIDE.exe")`; Python can use `subprocess.Popen(["app/NexusIDE.exe"])` from this launcher directory.
'@
}

foreach ($entry in $files.GetEnumerator()) {
    [System.IO.File]::WriteAllText((Join-Path $target $entry.Key), $entry.Value.TrimStart(), [System.Text.UTF8Encoding]::new($false))
}
Copy-Item (Join-Path (Split-Path -Parent $PSScriptRoot) "product\assets\nexuside-512.png") (Join-Path $target "icon.png") -Force

Write-Host "Pinokio launcher installed at $target"