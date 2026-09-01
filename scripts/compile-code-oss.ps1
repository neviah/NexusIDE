$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$codeOss = Join-Path $root "code-oss"
$requiredNode = (Get-Content (Join-Path $codeOss ".nvmrc") -Raw).Trim()
$portableNodeDirectory = Join-Path $root ".tools\node-v$requiredNode-win-x64"

if ((Test-Path (Join-Path $portableNodeDirectory "node.exe")) -and -not (($env:Path -split ";") -contains $portableNodeDirectory)) {
    $env:Path = "$portableNodeDirectory;$env:Path"
}

$env:vs2022_install = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools"
& (Join-Path $PSScriptRoot "check-prerequisites.ps1")
if ($LASTEXITCODE -ne 0) {
    throw "Prerequisite validation failed."
}

Push-Location $codeOss
try {
    & npm.cmd run compile
    if ($LASTEXITCODE -ne 0) {
        throw "Code-OSS compilation failed."
    }
} finally {
    Pop-Location
}

Write-Host "Stock Code-OSS compilation completed."