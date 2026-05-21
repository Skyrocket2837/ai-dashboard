# deploy-pi.ps1 — sync the built bundle to the Pi and restart the service.
# Requires: ssh + rsync (or scp fallback) reachable; Pi user can sudo systemctl.

param(
    [Parameter(Mandatory = $true)] [string]$PiHost,
    [string]$PiUser = "pi",
    [string]$RemoteDir = "/home/pi/ai-dashboard"
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path "$PSScriptRoot\.."
$bundleDir = Join-Path $repoRoot "deploy-out"

Write-Output "[deploy] building bundle"
& node (Join-Path $repoRoot "scripts\build-deploy-bundle.mjs")
if ($LASTEXITCODE -ne 0) { throw "bundle build failed" }

$target = "${PiUser}@${PiHost}"

Write-Output "[deploy] rsync → ${target}:${RemoteDir}"
$rsyncArgs = @(
    "-avz",
    "--delete",
    "--exclude=.env",
    "--exclude=data/",
    "$bundleDir/",
    "${target}:${RemoteDir}/"
)
& rsync @rsyncArgs
if ($LASTEXITCODE -ne 0) { throw "rsync failed" }

Write-Output "[deploy] installing prod deps + restart"
& ssh $target "cd $RemoteDir && npm install --omit=dev && sudo systemctl restart ai-dashboard && sudo systemctl status ai-dashboard --no-pager"
if ($LASTEXITCODE -ne 0) { throw "remote install/restart failed" }

Write-Output "[deploy] done"
