param(
    [string]$NodePath
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$codeOss = Join-Path $root "code-oss"
$failures = [System.Collections.Generic.List[string]]::new()

if (-not (Test-Path (Join-Path $codeOss ".nvmrc"))) {
    throw "Code-OSS is missing. Run: git submodule update --init --recursive"
}

$requiredNode = [version](Get-Content (Join-Path $codeOss ".nvmrc") -Raw).Trim()
$nodeCommand = if ($NodePath) { $NodePath } else { "node" }

try {
    $nodeOutput = & $nodeCommand --version
    $currentNode = [version]$nodeOutput.TrimStart("v")
    if ($currentNode.Major -ne $requiredNode.Major -or $currentNode -lt $requiredNode) {
        $failures.Add("Node.js $requiredNode or newer in major $($requiredNode.Major) is required; found $currentNode.")
    } else {
        Write-Host "[ok] Node.js $currentNode"
    }
} catch {
    $failures.Add("Node.js is unavailable: $($_.Exception.Message)")
}

try {
    $pythonOutput = & python --version 2>&1
    Write-Host "[ok] $pythonOutput"
} catch {
    $failures.Add("Python is unavailable.")
}

try {
    $gitOutput = & git --version
    Write-Host "[ok] $gitOutput"
} catch {
    $failures.Add("Git is unavailable.")
}

$vswhere = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio\Installer\vswhere.exe"
if (-not (Test-Path $vswhere)) {
    $failures.Add("Visual Studio Installer (vswhere.exe) is unavailable.")
} else {
    $visualStudioPath = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
    if (-not $visualStudioPath) {
        $failures.Add("Visual Studio 2022 Build Tools with Desktop development with C++ is required.")
    } else {
        Write-Host "[ok] Visual C++ Build Tools: $visualStudioPath"

        $spectrePath = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Runtimes.x86.x64.Spectre -property installationPath
        if (-not $spectrePath) {
            $failures.Add("Install 'MSVC v143 - VS 2022 C++ x64/x86 Spectre-mitigated libs (Latest)' from Visual Studio Installer > Build Tools 2022 > Modify > Individual components.")
        } else {
            Write-Host "[ok] Visual C++ Spectre-mitigated libraries"
        }
    }
}

$windowsSdkLib = Join-Path ${env:ProgramFiles(x86)} "Windows Kits\10\Lib"
$kernelLibraries = if (Test-Path $windowsSdkLib) {
    Get-ChildItem $windowsSdkLib -Filter kernel32.lib -Recurse -ErrorAction SilentlyContinue |
        Where-Object FullName -Match "\\um\\x64\\kernel32\.lib$"
} else {
    @()
}

if (-not $kernelLibraries) {
    $failures.Add("A Windows 10 or 11 SDK with x64 libraries is required.")
} else {
    $latestSdk = $kernelLibraries | Sort-Object FullName -Descending | Select-Object -First 1
    Write-Host "[ok] Windows SDK: $($latestSdk.Directory.Parent.Parent.Name)"
}

if ($failures.Count -gt 0) {
    foreach ($failure in $failures) {
        Write-Host "[error] $failure" -ForegroundColor Red
    }
    exit 1
}

Write-Host "All Code-OSS prerequisites are available."