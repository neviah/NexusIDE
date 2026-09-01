param(
    [string]$ArtifactRoot = (Join-Path (Split-Path -Parent $PSScriptRoot) ".runtime\artifacts")
)

$ErrorActionPreference = "Stop"
$manifestPath = Join-Path $ArtifactRoot "release.json"
if (-not (Test-Path $manifestPath)) {
    throw "Release manifest not found: $manifestPath"
}

$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
if (-not $manifest.version -or $manifest.files.Count -ne 2) {
    throw "Release manifest must describe one installer and one portable archive."
}

foreach ($file in $manifest.files) {
    $path = Join-Path $ArtifactRoot $file.name
    if (-not (Test-Path $path)) {
        throw "Release artifact not found: $path"
    }
    $item = Get-Item $path
    $hash = (Get-FileHash $path -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($item.Length -ne $file.size -or $hash -ne $file.sha256) {
        throw "Release artifact metadata mismatch: $($file.name)"
    }
}

$archive = Get-ChildItem $ArtifactRoot -Filter "NexusIDE-win32-x64-$($manifest.version).zip" | Select-Object -First 1
$installer = Get-ChildItem $ArtifactRoot -Filter "NexusIDEUserSetup-x64-$($manifest.version).exe" | Select-Object -First 1
if (-not $archive -or -not $installer) {
    throw "Versioned installer and portable archive are required."
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($archive.FullName)
try {
    $entries = @($zip.Entries.FullName -replace "\\", "/")
    foreach ($required in @("NexusIDE.exe", "data/.nexuside-portable", "resources/app/extensions/nexus-ai/out/extension.js")) {
        if ($entries -notcontains $required) {
            throw "Portable archive is missing $required."
        }
    }
    if ($entries | Where-Object { $_ -like "resources/app/extensions/copilot/*" }) {
        throw "Portable archive must not contain the redundant upstream Copilot extension."
    }
} finally {
    $zip.Dispose()
}

$signature = Get-AuthenticodeSignature $installer.FullName
if ($signature.Status -notin @("NotSigned", "Valid")) {
    throw "Unexpected installer signature status: $($signature.Status)"
}
$portableExecutable = Join-Path $ArtifactRoot "NexusIDE-win32-x64\NexusIDE.exe"
$portableSignature = Get-AuthenticodeSignature $portableExecutable
if ($manifest.signed -eq $true -and ($signature.Status -ne "Valid" -or $portableSignature.Status -ne "Valid")) {
    throw "The manifest describes a signed release but an executable signature is not valid."
}
if ($manifest.channel -in @("beta", "stable") -and $manifest.signed -ne $true) {
    throw "$($manifest.channel) artifacts must be signed."
}

Write-Host "Phase 8 artifact validation passed for NexusIDE $($manifest.version)."