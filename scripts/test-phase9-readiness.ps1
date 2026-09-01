$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

function Assert-Contains([string]$Path, [string]$Pattern, [string]$Message) {
    $content = Get-Content (Join-Path $root $Path) -Raw
    if ($content -notmatch $Pattern) { throw $Message }
}

Assert-Contains ".github/workflows/release.yml" "attest-build-provenance@v2" "Release provenance attestation is required."
Assert-Contains ".github/workflows/release.yml" "NEXUSIDE_SIGNING_CERTIFICATE" "Release signing secrets are not wired."
Assert-Contains "scripts/build-portable.ps1" 'ValidateSet\("alpha", "beta", "stable"\)' "Release channels are not defined."
Assert-Contains "scripts/build-portable.ps1" "Get-AuthenticodeSignature" "Authenticode verification is required."
Assert-Contains "scripts/install-pinokio-launcher.ps1" 'href: "rollback.js"' "Pinokio rollback is not exposed."
Assert-Contains "extensions/nexus-ai/package.json" "nexusAI.exportSupportDiagnostics" "Support diagnostics command is missing."
Assert-Contains "extensions/nexus-ai/src/nexusChatViewProvider.ts" 'aria-live="polite"' "Chat output must be announced to assistive technology."
Assert-Contains "extensions/nexus-ai/src/nexusChatViewProvider.ts" "addEventListener\('keydown'" "Keyboard interaction coverage is missing."
Assert-Contains "extensions/nexus-ai/src/test/unit/workspaceContext.test.ts" "workspace context is bounded" "Large-workspace context must remain bounded."
Assert-Contains "extensions/nexus-ai/src/test/unit/readOnlyChatRuntime.test.ts" "no-routes error" "Offline behavior test is missing."
Assert-Contains "extensions/nexus-ai/src/test/unit/readOnlyChatRuntime.test.ts" "throttled free route falls back" "Degraded-provider fallback test is missing."
Assert-Contains ".github/workflows/ci.yml" "gitleaks/gitleaks-action" "Secret scanning is required."

$requiredDocs = @("docs/BETA_TEST_MATRIX.md", "docs/RELEASE_CHANNELS.md", "SECURITY.md")
foreach ($document in $requiredDocs) {
    if (-not (Test-Path (Join-Path $root $document))) { throw "Missing Phase 9 document: $document" }
}
if (& git -C (Join-Path $root "code-oss") status --porcelain) {
    throw "Code-OSS contains tracked changes."
}

Write-Host "Phase 9 readiness contract passed."