$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$codeOss = Join-Path $root "code-oss"

& git -C $root submodule update --init --recursive
if ($LASTEXITCODE -ne 0) {
    throw "Unable to initialize the Code-OSS submodule."
}

$requiredNode = (Get-Content (Join-Path $codeOss ".nvmrc") -Raw).Trim()
$portableRoot = Join-Path $root ".tools\node-v$requiredNode-win-x64"
$portableNode = Join-Path $portableRoot "node.exe"

$useSystemNode = $false
try {
    $systemVersion = [version]((& node --version).TrimStart("v"))
    $requiredVersion = [version]$requiredNode
    $useSystemNode = $systemVersion.Major -eq $requiredVersion.Major -and $systemVersion -ge $requiredVersion
} catch {
    $useSystemNode = $false
}

if ($useSystemNode) {
    $selectedNode = (Get-Command node).Source
} else {
    if (-not (Test-Path $portableNode)) {
        $tools = Join-Path $root ".tools"
        $archive = Join-Path $tools "node-v$requiredNode-win-x64.zip"
        New-Item -ItemType Directory -Force -Path $tools | Out-Null
        Write-Host "Downloading Node.js $requiredNode..."
        Invoke-WebRequest "https://nodejs.org/dist/v$requiredNode/node-v$requiredNode-win-x64.zip" -OutFile $archive
        Expand-Archive $archive -DestinationPath $tools -Force
        Remove-Item $archive
    }
    $selectedNode = $portableNode
}

$nodeDirectory = Split-Path -Parent $selectedNode
if (-not (($env:Path -split ";") -contains $nodeDirectory)) {
    $env:Path = "$nodeDirectory;$env:Path"
}
$env:vs2022_install = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools"

& (Join-Path $PSScriptRoot "check-prerequisites.ps1") -NodePath $selectedNode
if ($LASTEXITCODE -ne 0) {
    throw "Prerequisite validation failed."
}

Write-Host "Installing Code-OSS dependencies with Node.js $requiredNode..."
Push-Location $codeOss
try {
    & npm.cmd install
    if ($LASTEXITCODE -ne 0) {
        throw "Code-OSS dependency installation failed."
    }
} finally {
    Pop-Location
}

Write-Host "Code-OSS dependencies are installed."