param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[A-Za-z0-9_-]{6,64}$')]
  [string]$JobId,
  [string]$AetherRoot = 'C:\Users\tylar\code\Aether'
)
$ErrorActionPreference = 'Stop'
$JobDir = Join-Path $AetherRoot "jobs\$JobId"
$LaunchLog = Join-Path $JobDir 'launch.log'
$TaskName = "AetherTranscribe-$JobId"
$Runner = Join-Path $AetherRoot 'scripts\run_aether_job.ps1'
$StartAt = (Get-Date).AddMinutes(1).ToString('HH:mm')
$TaskCommand = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$Runner`" -JobId $JobId"

# A scheduled task escapes the Windows OpenSSH Job Object, which otherwise kills
# child processes as soon as the SSH session closes. The URL remains in url.txt;
# only validated JobId + fixed paths appear in the task command.
$create = & schtasks.exe /Create /TN $TaskName /SC ONCE /ST $StartAt /TR $TaskCommand /F 2>&1
if ($LASTEXITCODE -ne 0) { throw "schtasks create failed: $($create -join ' ')" }
$run = & schtasks.exe /Run /TN $TaskName 2>&1
if ($LASTEXITCODE -ne 0) { throw "schtasks run failed: $($run -join ' ')" }
"task=$TaskName launched=$((Get-Date).ToString('o'))" | Out-File -LiteralPath $LaunchLog -Encoding UTF8
Write-Output "LAUNCHED:$TaskName"
