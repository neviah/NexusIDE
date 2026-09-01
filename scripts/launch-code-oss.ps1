param(
    [switch]$WithNexusAI,

    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Arguments
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$codeOss = Join-Path $root "code-oss"
$requiredNode = (Get-Content (Join-Path $codeOss ".nvmrc") -Raw).Trim()
$portableNodeDirectory = Join-Path $root ".tools\node-v$requiredNode-win-x64"
$productOverride = Join-Path $codeOss "product.overrides.json"
$runtimeName = if ($WithNexusAI) { "nexuside" } else { "stock-code-oss" }
$runtimeRoot = Join-Path $root ".runtime\$runtimeName"

if ((Test-Path (Join-Path $portableNodeDirectory "node.exe")) -and -not (($env:Path -split ";") -contains $portableNodeDirectory)) {
    $env:Path = "$portableNodeDirectory;$env:Path"
}

$env:vs2022_install = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools"
& (Join-Path $PSScriptRoot "check-prerequisites.ps1")
if ($LASTEXITCODE -ne 0) {
    throw "Prerequisite validation failed."
}

$userDataDirectory = Join-Path $runtimeRoot "user-data"
$extensionsDirectory = Join-Path $runtimeRoot "extensions"
New-Item -ItemType Directory -Force -Path $userDataDirectory, $extensionsDirectory | Out-Null

$launchArguments = @(
    "--user-data-dir", $userDataDirectory,
    "--extensions-dir", $extensionsDirectory
)

if ($WithNexusAI) {
    Copy-Item (Join-Path $root "product\nexuside.json") $productOverride -Force
    $launchArguments += @("--extensionDevelopmentPath", (Join-Path $root "extensions\nexus-ai"))
} elseif (Test-Path $productOverride) {
    Remove-Item $productOverride -Force
}

$launchArguments += $Arguments

& (Join-Path $codeOss "scripts\code.bat") @launchArguments
if ($LASTEXITCODE -ne 0) {
    throw "Stock Code-OSS launch failed."
}