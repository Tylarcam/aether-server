# Watchdog for the Aether local server (server.js on port 3000).
# Run by the "AetherServer" scheduled task: at logon + every 5 minutes.
# If the server is already healthy, exits immediately (IgnoreNew policy keeps
# the running instance). If not, starts node in the foreground so the task
# stays alive while the server runs; a crash ends the task and the next
# 5-minute tick restarts it.

$ErrorActionPreference = 'Stop'
$AetherDir = 'C:\Users\tylar\code\Aether'
$LogFile = Join-Path $AetherDir 'aether-server.log'

try {
    $health = Invoke-WebRequest -Uri 'http://localhost:3000/health' -TimeoutSec 3 -UseBasicParsing
    if ($health.StatusCode -eq 200) { exit 0 }
} catch {
    # Not running — fall through and start it.
}

Set-Location $AetherDir
Add-Content -Path $LogFile -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] watchdog starting node server.js"
& node server.js *>> $LogFile
Add-Content -Path $LogFile -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] node server.js exited with code $LASTEXITCODE"
exit 1
