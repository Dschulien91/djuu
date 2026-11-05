# Registers the weekly data refresh in the Windows Task Scheduler for the current user.
# Runs Mondays at 05:00, or as soon as the computer is on again if it was off.
# Remove it with: Unregister-ScheduledTask -TaskName 'Djuu weekly refresh' -Confirm:$false
$python = 'C:\Users\julia\AppData\Local\Programs\Python\Python312\python.exe'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$action = New-ScheduledTaskAction -Execute $python -Argument "`"$root\tools\refresh.py`"" -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At 5:00
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 4)
Register-ScheduledTask -TaskName 'Djuu weekly refresh' -Action $action -Trigger $trigger -Settings $settings -Description 'Refreshes Djuu courses and events and publishes them' -Force | Out-Null
Write-Host 'Registered: Djuu weekly refresh, Mondays 05:00'
