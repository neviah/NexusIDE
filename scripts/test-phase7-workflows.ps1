param(
    [switch]$SkipGitHubConnectivity
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$runtime = Join-Path $root ".runtime\phase7-workflows"
$remote = Join-Path $runtime "remote.git"
$first = Join-Path $runtime "first"
$second = Join-Path $runtime "second"
$languageRoot = Join-Path $runtime "languages"
$results = [System.Collections.Generic.List[string]]::new()

function Invoke-Checked([string]$Command, [string[]]$Arguments, [string]$WorkingDirectory = $root) {
    Push-Location $WorkingDirectory
    try {
        & $Command @Arguments
        if ($LASTEXITCODE -ne 0) {
            throw "$Command $($Arguments -join ' ') failed with exit code $LASTEXITCODE."
        }
    } finally {
        Pop-Location
    }
}

function Add-Result([string]$Area, [string]$Status, [string]$Detail) {
    $results.Add("[$Status] $Area - $Detail")
}

Remove-Item $runtime -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $runtime, $languageRoot | Out-Null

Invoke-Checked git @("init", "--bare", $remote)
Invoke-Checked git @("clone", $remote, $first)
Invoke-Checked git @("config", "user.name", "NexusIDE Phase 7") $first
Invoke-Checked git @("config", "user.email", "phase7@nexuside.invalid") $first
[System.IO.File]::WriteAllText((Join-Path $first "README.md"), "initial`n")
Invoke-Checked git @("add", "README.md") $first
Invoke-Checked git @("commit", "-m", "initial") $first
Invoke-Checked git @("push", "-u", "origin", "HEAD:main") $first
Invoke-Checked git @("switch", "-c", "phase7") $first
[System.IO.File]::AppendAllText((Join-Path $first "README.md"), "first change`n")
$workingDiff = & git -C $first diff -- README.md
if (-not ($workingDiff -match "first change")) { throw "Git working-tree diff was not produced." }
Invoke-Checked git @("add", "README.md") $first
$stagedDiff = & git -C $first diff --cached -- README.md
if (-not ($stagedDiff -match "first change")) { throw "Git staged diff was not produced." }
Invoke-Checked git @("commit", "-m", "phase7 change") $first
Invoke-Checked git @("push", "-u", "origin", "phase7") $first

Invoke-Checked git @("clone", "--branch", "phase7", $remote, $second)
Invoke-Checked git @("config", "user.name", "NexusIDE Phase 7") $second
Invoke-Checked git @("config", "user.email", "phase7@nexuside.invalid") $second
[System.IO.File]::AppendAllText((Join-Path $second "README.md"), "remote change`n")
Invoke-Checked git @("add", "README.md") $second
Invoke-Checked git @("commit", "-m", "remote change") $second
Invoke-Checked git @("push") $second
Invoke-Checked git @("pull", "--ff-only") $first
if (-not ((Get-Content (Join-Path $first "README.md") -Raw).Contains("remote change"))) { throw "Git pull did not update the checkout." }
Add-Result "Git" "pass" "status, diff, stage, commit, branch, push, clone, and pull passed against an isolated remote"

$credentialHelpers = @(git config --show-origin --get-all credential.helper 2>$null)
if ($credentialHelpers.Count -gt 0) {
    Add-Result "Git credentials" "pass" ($credentialHelpers -join "; ")
} else {
    Add-Result "Git credentials" "setup" "no credential.helper is configured; install Git Credential Manager before private GitHub use"
}
if (-not $SkipGitHubConnectivity) {
    Invoke-Checked git @("ls-remote", "https://github.com/neviah/NexusIDE.git", "HEAD")
    Add-Result "GitHub" "pass" "public HTTPS clone/fetch transport reached github.com; authenticated push uses the system credential helper"
}

[System.IO.File]::WriteAllText((Join-Path $languageRoot "app.js"), "const answer = 42;`nconsole.log(answer);`n")
[System.IO.File]::WriteAllText((Join-Path $languageRoot "data.json"), '{"valid":true}')
Invoke-Checked node @("--check", (Join-Path $languageRoot "app.js"))
Invoke-Checked node @("-e", "JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'))", (Join-Path $languageRoot "data.json"))
Add-Result "Web languages" "pass" "JavaScript and JSON runtime syntax checks passed; Electron tests cover JS/TS/HTML/CSS/JSON providers"

$python = Get-Command python -ErrorAction SilentlyContinue
if ($python) {
    [System.IO.File]::WriteAllText((Join-Path $languageRoot "app.py"), "value: int = 42`nprint(value)`n")
    Invoke-Checked $python.Source @("-m", "py_compile", (Join-Path $languageRoot "app.py"))
    Invoke-Checked $python.Source @((Join-Path $languageRoot "app.py"))
    Add-Result "Python" "pass" "interpreter compile and execution passed; run NexusIDE: Check Language Tooling for extension/debug readiness"
} else {
    Add-Result "Python" "setup" "install Python and the reviewed ms-python.python plus ms-python.debugpy extensions"
}

$dotnet = Get-Command dotnet -ErrorAction SilentlyContinue
$sdks = if ($dotnet) { @(& $dotnet.Source --list-sdks) } else { @() }
if ($sdks.Count -gt 0) {
    $csharpRoot = Join-Path $languageRoot "csharp"
    Invoke-Checked $dotnet.Source @("new", "console", "--output", $csharpRoot, "--force")
    Invoke-Checked $dotnet.Source @("build", "--nologo") $csharpRoot
    Add-Result "C#" "pass" ".NET project discovery and build passed; editor language/debug readiness is reported inside NexusIDE"
} else {
    Add-Result "C#" "setup" "install a .NET SDK and a reviewed C# extension; only .NET runtimes are currently installed"
}

$unityRoots = @(
    (Join-Path $env:ProgramFiles "Unity\Hub\Editor"),
    (Join-Path ${env:ProgramFiles(x86)} "Unity\Hub\Editor")
) | Where-Object { $_ -and (Test-Path $_) }
if ($unityRoots.Count -gt 0 -or ($env:UNITY_EDITOR_PATH -and (Test-Path $env:UNITY_EDITOR_PATH))) {
    Add-Result "Unity" "pass" "editor detected; solution generation and attach/debug still require the project package and reviewed extensions reported inside NexusIDE"
} else {
    Add-Result "Unity" "setup" "install Unity Hub/editor, add com.unity.ide.vscode, and install reviewed C# plus Unity VSIX extensions"
}

$results | ForEach-Object { Write-Host $_ }
Write-Host "Phase 7 mandatory workflow checks passed. Optional setup rows are expected on hosts without those toolchains."