$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$codeOss = Join-Path $root "code-oss"
$productOverlay = Join-Path $root "product\nexuside.json"
$productAssets = Join-Path $root "product\assets"
$upstreamOutput = Join-Path $root "VSCode-win32-x64"
$artifactRoot = Join-Path $root ".runtime\artifacts"
$artifact = Join-Path $artifactRoot "NexusIDE-win32-x64"
$archive = Join-Path $artifactRoot "NexusIDE-win32-x64.zip"
$requiredNode = (Get-Content (Join-Path $codeOss ".nvmrc") -Raw).Trim()
$portableNodeDirectory = Join-Path $root ".tools\node-v$requiredNode-win-x64"

if (Test-Path (Join-Path $portableNodeDirectory "node.exe")) {
    $env:Path = "$portableNodeDirectory;$env:Path"
}

$env:vs2022_install = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools"
$env:VSCODE_ARCH = "x64"
& (Join-Path $PSScriptRoot "check-prerequisites.ps1")
if ($LASTEXITCODE -ne 0) {
    throw "Prerequisite validation failed."
}

& (Join-Path $PSScriptRoot "generate-brand-assets.ps1")
& (Join-Path $PSScriptRoot "build-nexus-ai.ps1")

$dirty = & git -C $codeOss status --porcelain
if ($dirty) {
    throw "The Code-OSS submodule has tracked changes. Portable packaging requires a clean upstream worktree."
}

$sdkTool = Get-ChildItem (Join-Path ${env:ProgramFiles(x86)} "Windows Kits\10\bin") -Filter signtool.exe -Recurse -ErrorAction SilentlyContinue |
    Where-Object FullName -Match "\\x64\\signtool\.exe$" |
    Sort-Object FullName -Descending |
    Select-Object -First 1
if ($sdkTool) {
    $env:Path = "$($sdkTool.Directory.FullName);$env:Path"
}

$overlayTargets = @{
    (Join-Path $codeOss "product.json") = $productOverlay
    (Join-Path $codeOss "resources\win32\code.ico") = (Join-Path $productAssets "code.ico")
    (Join-Path $codeOss "resources\win32\code_70x70.png") = (Join-Path $productAssets "code_70x70.png")
    (Join-Path $codeOss "resources\win32\code_150x150.png") = (Join-Path $productAssets "code_150x150.png")
}
$backups = @{}

try {
    foreach ($target in $overlayTargets.Keys) {
        $backups[$target] = [System.IO.File]::ReadAllBytes($target)
    }

    $baseProduct = Get-Content (Join-Path $codeOss "product.json") -Raw | ConvertFrom-Json
    $overrides = Get-Content $productOverlay -Raw | ConvertFrom-Json
    foreach ($property in $overrides.PSObject.Properties) {
        $baseProduct | Add-Member -NotePropertyName $property.Name -NotePropertyValue $property.Value -Force
    }
    [System.IO.File]::WriteAllText((Join-Path $codeOss "product.json"), ($baseProduct | ConvertTo-Json -Depth 100), [System.Text.UTF8Encoding]::new($false))
    Copy-Item (Join-Path $productAssets "code.ico") (Join-Path $codeOss "resources\win32\code.ico") -Force
    Copy-Item (Join-Path $productAssets "code_70x70.png") (Join-Path $codeOss "resources\win32\code_70x70.png") -Force
    Copy-Item (Join-Path $productAssets "code_150x150.png") (Join-Path $codeOss "resources\win32\code_150x150.png") -Force

    Push-Location $codeOss
    try {
        & npm.cmd run gulp -- vscode-win32-x64
        if ($LASTEXITCODE -ne 0) {
            throw "Code-OSS Windows packaging failed."
        }
    } finally {
        Pop-Location
    }
} finally {
    foreach ($target in $backups.Keys) {
        [System.IO.File]::WriteAllBytes($target, $backups[$target])
    }
}

if (-not (Test-Path (Join-Path $upstreamOutput "NexusIDE.exe"))) {
    throw "The branded NexusIDE executable was not produced."
}

Remove-Item $artifact -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $artifactRoot | Out-Null
Move-Item $upstreamOutput $artifact

$extensionSource = Join-Path $root "extensions\nexus-ai"
$extensionTarget = Join-Path $artifact "resources\app\extensions\nexus-ai"
New-Item -ItemType Directory -Force -Path (Join-Path $extensionTarget "out"), (Join-Path $extensionTarget "media") | Out-Null
$extensionManifest = Get-Content (Join-Path $extensionSource "package.json") -Raw | ConvertFrom-Json
$extensionManifest.PSObject.Properties.Remove("scripts")
$extensionManifest.PSObject.Properties.Remove("devDependencies")
[System.IO.File]::WriteAllText((Join-Path $extensionTarget "package.json"), ($extensionManifest | ConvertTo-Json -Depth 30), [System.Text.UTF8Encoding]::new($false))
Copy-Item (Join-Path $extensionSource "out\*.js") (Join-Path $extensionTarget "out")
Copy-Item (Join-Path $extensionSource "media\*") (Join-Path $extensionTarget "media") -Recurse

$coreSource = Join-Path $root "packages\ai-core"
$coreTarget = Join-Path $extensionTarget "node_modules\@nexus\ai-core"
New-Item -ItemType Directory -Force -Path (Join-Path $coreTarget "out") | Out-Null
Copy-Item (Join-Path $coreSource "package.json") $coreTarget
Copy-Item (Join-Path $coreSource "out\*.js") (Join-Path $coreTarget "out")

$portableData = Join-Path $artifact "data"
New-Item -ItemType Directory -Force -Path $portableData | Out-Null
[System.IO.File]::WriteAllText((Join-Path $portableData ".nexuside-portable"), "")
Remove-Item $archive -Force -ErrorAction SilentlyContinue
Compress-Archive -Path (Join-Path $artifact "*") -DestinationPath $archive -CompressionLevel Optimal

$packagedProduct = Get-Content (Join-Path $artifact "resources\app\product.json") -Raw | ConvertFrom-Json
if ($packagedProduct.applicationName -ne "nexuside" -or
    -not (Test-Path (Join-Path $extensionTarget "out\extension.js")) -or
    -not (Test-Path (Join-Path $portableData ".nexuside-portable"))) {
    throw "Portable artifact validation failed."
}

Write-Host "Portable NexusIDE artifact: $archive"