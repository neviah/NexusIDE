param(
    [Parameter(Mandatory = $true)]
    [string]$InstallerPath
)

$ErrorActionPreference = "Stop"
$installer = (Resolve-Path $InstallerPath).Path
$unicodeSegment = [string]([char]0x6D4B) + [char]0x8BD5
$runId = [guid]::NewGuid().ToString("N").Substring(0, 8)
$testRoot = Join-Path $env:LOCALAPPDATA "Nexus $unicodeSegment-$runId"
$installDirectory = Join-Path $testRoot "IDE Files"
$installLog = Join-Path $testRoot "install.log"
$uninstallLog = Join-Path $testRoot "uninstall.log"

Remove-Item $testRoot -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $testRoot | Out-Null
$passed = $false

try {
    $install = Start-Process $installer -Wait -PassThru -ArgumentList @(
        "/SP-", "/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART",
        "/MERGETASKS=!runcode", "/DIR=`"$installDirectory`"", "/LOG=`"$installLog`""
    )
    if ($install.ExitCode -ne 0) {
        throw "Installer exited with code $($install.ExitCode). See $installLog"
    }

    $executable = Join-Path $installDirectory "NexusIDE.exe"
    if (-not (Test-Path $executable)) {
        throw "NexusIDE.exe was not installed to the requested non-admin path."
    }
    $userDataDirectory = Join-Path $testRoot "User Data"
    $launch = Start-Process $executable -PassThru -ArgumentList @(
        "--user-data-dir=`"$userDataDirectory`"", "--disable-gpu", "--disable-extensions"
    )
    $testProcesses = @()
    $startupDeadline = [DateTime]::UtcNow.AddSeconds(30)
    while ($testProcesses.Count -eq 0 -and [DateTime]::UtcNow -lt $startupDeadline) {
        [Threading.Thread]::Sleep(250)
        $testProcesses = @(Get-Process NexusIDE -ErrorAction SilentlyContinue | Where-Object Path -Like "$installDirectory*")
    }
    if ($testProcesses.Count -eq 0) {
        throw "Installed NexusIDE did not reach an interactive launch state."
    }

    $testProcesses | Stop-Process -Force
    if (Get-Process NexusIDE -ErrorAction SilentlyContinue | Where-Object Path -Like "$installDirectory*") {
        throw "Unable to stop the NexusIDE smoke-test processes."
    }
    $uninstaller = Get-ChildItem $installDirectory -Filter "unins*.exe" | Select-Object -First 1
    if (-not $uninstaller) {
        throw "The installer did not register an uninstaller."
    }
    $uninstall = Start-Process $uninstaller.FullName -Wait -PassThru -ArgumentList @(
        "/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART", "/CLOSEAPPLICATIONS", "/LOG=`"$uninstallLog`""
    )
    if ($uninstall.ExitCode -ne 0 -or (Test-Path $executable)) {
        throw "Uninstall failed with code $($uninstall.ExitCode). See $uninstallLog"
    }
    $passed = $true
} finally {
    if ($passed) {
        Remove-Item $testRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}

Write-Host "Phase 8 non-admin install and uninstall smoke test passed."