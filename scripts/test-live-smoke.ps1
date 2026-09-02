#Requires -Version 5.1
<#
.SYNOPSIS
    Runs the opt-in live smoke check against real free-tier providers.
.DESCRIPTION
    This is not part of the normal build. It needs network access and real credentials, and it
    exercises only local or free-tier routes. Trial, mixed, and paid routes are refused so a run
    can never bill the user.

    Credentials are read from environment variables, never from VS Code SecretStorage:
      OLLAMA_HOST, GROQ_API_KEY, OPENROUTER_API_KEY, NVIDIA_API_KEY,
      GEMINI_API_KEY, CEREBRAS_API_KEY, MISTRAL_API_KEY

    Optional:
      NEXUS_SMOKE_MCP_URL     also verify an MCP server, for example http://localhost:8080
      NEXUS_SMOKE_SKIP_OLLAMA set to 1 when no local runtime is installed
      NEXUS_SMOKE_TIMEOUT_MS  per-request budget, default 30000
.EXAMPLE
    $env:GROQ_API_KEY = "..."; .\scripts\test-live-smoke.ps1
#>
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$core = Join-Path $root "packages\ai-core"
$requiredNode = (Get-Content (Join-Path $root "code-oss\.nvmrc") -Raw).Trim()
$portableNodeDirectory = Join-Path $root ".tools\node-v$requiredNode-win-x64"

if ((Test-Path (Join-Path $portableNodeDirectory "node.exe")) -and -not (($env:Path -split ";") -contains $portableNodeDirectory)) {
    $env:Path = "$portableNodeDirectory;$env:Path"
}

Push-Location $core
try {
    & npm.cmd run compile
    if ($LASTEXITCODE -ne 0) { throw "AI core compilation failed." }

    & node.exe (Join-Path $core "out\smokeCli.js")
    $smokeExit = $LASTEXITCODE
} finally {
    Pop-Location
}

if ($smokeExit -ne 0) {
    Write-Host "Live smoke did not pass. No paid route was used." -ForegroundColor Yellow
    exit $smokeExit
}

Write-Host "Live smoke passed." -ForegroundColor Green
