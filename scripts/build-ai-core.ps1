$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$package = Join-Path $root "packages\ai-core"
$requiredNode = (Get-Content (Join-Path $root "code-oss\.nvmrc") -Raw).Trim()
$portableNodeDirectory = Join-Path $root ".tools\node-v$requiredNode-win-x64"

if (Test-Path (Join-Path $portableNodeDirectory "node.exe")) {
    $env:Path = "$portableNodeDirectory;$env:Path"
}

Push-Location $package
try {
    & npm.cmd install
    if ($LASTEXITCODE -ne 0) {
        throw "AI core dependency installation failed."
    }

    & npm.cmd run check
    if ($LASTEXITCODE -ne 0) {
        throw "AI core typecheck failed."
    }

    & npm.cmd test
    if ($LASTEXITCODE -ne 0) {
        throw "AI core tests failed."
    }
} finally {
    Pop-Location
}

Write-Host "AI core built and tested successfully."