$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$codeOss = Join-Path $root "code-oss"
$extension = Join-Path $root "extensions\nexus-ai"
$runtime = Join-Path $root ".runtime\extension-tests"
$requiredNode = (Get-Content (Join-Path $codeOss ".nvmrc") -Raw).Trim()
$portableNodeDirectory = Join-Path $root ".tools\node-v$requiredNode-win-x64"

if (Test-Path (Join-Path $portableNodeDirectory "node.exe")) {
    $env:Path = "$portableNodeDirectory;$env:Path"
}

& (Join-Path $PSScriptRoot "build-nexus-ai.ps1")
if ($LASTEXITCODE -ne 0) {
    throw "Nexus AI build failed."
}

Remove-Item $runtime -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path (Join-Path $runtime "user-data"), (Join-Path $runtime "extensions") | Out-Null

$previousErrorActionPreference = $ErrorActionPreference
try {
    $ErrorActionPreference = "Continue"
    $capturedOutput = & (Join-Path $codeOss "scripts\code.bat") `
        --user-data-dir (Join-Path $runtime "user-data") `
        --extensions-dir (Join-Path $runtime "extensions") `
        --extensionDevelopmentPath $extension `
        --extensionTestsPath (Join-Path $extension "out\test\suite\index.js") `
        --disable-updates `
        --skip-welcome 2>&1
    $testExitCode = $LASTEXITCODE
} finally {
    $ErrorActionPreference = $previousErrorActionPreference
}

if ($testExitCode -ne 0 -or ($capturedOutput | Out-String) -match "AssertionError|NexusIDE integration test failed") {
    throw "Nexus AI integration tests failed."
}

Write-Host "Nexus AI integration tests passed."