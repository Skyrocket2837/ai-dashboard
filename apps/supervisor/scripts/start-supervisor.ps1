# start-supervisor.ps1 — launches the Windows supervisor daemon.
# Run manually or register via register-task.ps1 to start at logon.

param(
    [string]$EnvFile = "$PSScriptRoot\..\.env"
)

$ErrorActionPreference = "Stop"

if (Test-Path $EnvFile) {
    Get-Content $EnvFile | ForEach-Object {
        if ($_ -match "^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.+?)\s*$") {
            $name = $Matches[1]
            $value = $Matches[2].Trim('"').Trim("'")
            [System.Environment]::SetEnvironmentVariable($name, $value, "Process")
        }
    }
}

$projectRoot = Resolve-Path "$PSScriptRoot\.."
Set-Location $projectRoot
$entry = Join-Path $projectRoot "src\supervisor.mjs"

Write-Output "[start-supervisor] node $entry"
& node $entry
