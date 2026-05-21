# hook-bridge.ps1 — invoked by Claude Code for every hook event.
# Reads JSON from stdin, POSTs to supervisor :7777, echoes response.
# Stays under 60s (Claude hook timeout) by using short timeout + safe fallback.

$ErrorActionPreference = "Stop"

try {
    $body = [Console]::In.ReadToEnd()
    if ([string]::IsNullOrWhiteSpace($body)) {
        Write-Output "{}"
        exit 0
    }

    $port = if ($env:AID_SUPERVISOR_PORT) { $env:AID_SUPERVISOR_PORT } else { "7777" }
    $url = "http://127.0.0.1:$port/hook"

    $resp = Invoke-RestMethod -Uri $url -Method Post -Body $body `
        -ContentType "application/json" -TimeoutSec 5 -ErrorAction Stop

    if ($null -eq $resp) {
        Write-Output "{}"
    } else {
        $resp | ConvertTo-Json -Depth 8 -Compress
    }
    exit 0
} catch {
    # Supervisor down → fail open (do not block Claude).
    Write-Output "{}"
    exit 0
}
