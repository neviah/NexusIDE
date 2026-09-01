param(
    [string]$UpstreamRef = "refs/heads/release/1.136",
    [switch]$NoFetch
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$codeOss = Join-Path $root "code-oss"
if (& git -C $codeOss status --porcelain) {
    throw "The Code-OSS submodule must be clean before an upstream rehearsal."
}

$target = $UpstreamRef
if (-not $NoFetch) {
    & git -C $codeOss fetch --no-tags origin "+${UpstreamRef}:refs/remotes/origin/nexuside-rehearsal"
    if ($LASTEXITCODE -ne 0) {
        throw "Unable to fetch upstream rehearsal ref $UpstreamRef."
    }
    $target = "refs/remotes/origin/nexuside-rehearsal"
}

$head = (& git -C $codeOss rev-parse HEAD).Trim()
$targetCommit = (& git -C $codeOss rev-parse $target).Trim()
$mergeBase = (& git -C $codeOss merge-base $head $targetCommit).Trim()
$output = & git -C $codeOss merge-tree --write-tree $head $targetCommit 2>&1
if ($LASTEXITCODE -ne 0) {
    throw "Upstream merge rehearsal found conflicts:`n$($output -join "`n")"
}

$report = [ordered]@{
    rehearsedAt = (Get-Date).ToUniversalTime().ToString("o")
    currentCommit = $head
    upstreamCommit = $targetCommit
    mergeBase = $mergeBase
    mergeTree = ($output | Select-Object -First 1)
    worktreeModified = [bool](& git -C $codeOss status --porcelain)
}
$reportPath = Join-Path $root ".runtime\upstream-merge-rehearsal.json"
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $reportPath) | Out-Null
[IO.File]::WriteAllText($reportPath, ($report | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
if ($report.worktreeModified) {
    throw "Upstream rehearsal modified the Code-OSS worktree."
}
Write-Host "Upstream merge rehearsal passed: $head -> $targetCommit"