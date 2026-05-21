# register-task.ps1 — registers the supervisor in Windows Task Scheduler to start at logon.
# Requires admin only if you want it to survive UAC; default uses current user context.

param(
    [string]$TaskName = "AIDashboardSupervisor"
)

$ErrorActionPreference = "Stop"

$script = Resolve-Path "$PSScriptRoot\start-supervisor.ps1"
$action = New-ScheduledTaskAction `
    -Execute "pwsh.exe" `
    -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$script`""

$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -DontStopOnIdleEnd `
    -RestartCount 5 `
    -RestartInterval (New-TimeSpan -Minutes 1)

$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Description "AI Dashboard supervisor daemon (hook bridge + RAM monitor)" `
    -Force | Out-Null

Write-Output "[register-task] '$TaskName' registered. Start now? Use:"
Write-Output "  Start-ScheduledTask -TaskName $TaskName"
