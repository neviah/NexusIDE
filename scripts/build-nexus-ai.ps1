$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$extension = Join-Path $root "extensions\nexus-ai"
$requiredNode = (Get-Content (Join-Path $root "code-oss\.nvmrc") -Raw).Trim()
$portableNodeDirectory = Join-Path $root ".tools\node-v$requiredNode-win-x64"

if (Test-Path (Join-Path $portableNodeDirectory "node.exe")) {
    $env:Path = "$portableNodeDirectory;$env:Path"
}

Push-Location $extension
try {
    & npm.cmd install
    if ($LASTEXITCODE -ne 0) {
        throw "Nexus AI dependency installation failed."
    }

    & npm.cmd run check
    if ($LASTEXITCODE -ne 0) {
        throw "Nexus AI typecheck failed."
    }

    & npm.cmd run compile
    if ($LASTEXITCODE -ne 0) {
        throw "Nexus AI compilation failed."
    }
} finally {
    Pop-Location
}

Write-Host "Nexus AI extension built successfully."