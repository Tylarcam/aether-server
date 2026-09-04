# Aether job runner — file-driven, no URL on the command line.
# Invoked on the laptop by aether_remote.py (Hermes VPS) via Start-Process.
#
# Job layout (under $AetherRoot\jobs\<JobId>\):
#   url.txt      input URL (written by VPS via scp)
#   result.json  normalized Aether CLI JSON
#   done         success sentinel (ISO timestamp)
#   err          failure sentinel (error text)
#   job.log      stderr / diagnostics

param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[A-Za-z0-9_-]{6,64}$')]
    [string]$JobId,

    [string]$AetherRoot = 'C:\Users\tylar\code\Aether'
)

$ErrorActionPreference = 'Stop'

$JobDir = Join-Path $AetherRoot "jobs\$JobId"
$UrlFile = Join-Path $JobDir 'url.txt'
$ResultFile = Join-Path $JobDir 'result.json'
$DoneFile = Join-Path $JobDir 'done'
$ErrFile = Join-Path $JobDir 'err'
$LogFile = Join-Path $JobDir 'job.log'
$Cli = Join-Path $AetherRoot 'scripts\aether.py'

function Write-Utf8NoBom([string]$Path, [string]$Text) {
    $enc = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($Path, $Text, $enc)
}

function Write-Fail([string]$Message) {
    $ts = Get-Date -Format 'o'
    Add-Content -Path $LogFile -Value "[$ts] FAIL: $Message" -Encoding utf8
    if (-not (Test-Path -LiteralPath $ResultFile)) {
        $payload = @{
            success = $false
            text    = ''
            title   = $null
            channel = $null
            duration_sec = $null
            method  = ''
            backend = ''
            error   = $Message
        } | ConvertTo-Json -Compress
        Write-Utf8NoBom -Path $ResultFile -Text $payload
    }
    Write-Utf8NoBom -Path $ErrFile -Text $Message
}

try {
    New-Item -ItemType Directory -Force -Path $JobDir | Out-Null
    Remove-Item -LiteralPath $DoneFile, $ErrFile -ErrorAction SilentlyContinue

    $ts = Get-Date -Format 'o'
    Set-Content -Path $LogFile -Value "[$ts] start JobId=$JobId" -Encoding utf8

    if (-not (Test-Path -LiteralPath $UrlFile)) {
        throw "missing url.txt in $JobDir"
    }
    if (-not (Test-Path -LiteralPath $Cli)) {
        throw "missing Aether CLI at $Cli"
    }

    $url = (Get-Content -LiteralPath $UrlFile -Raw -Encoding utf8).Trim()
    if (-not $url) {
        throw 'url.txt is empty'
    }
    if ($url -notmatch '^https?://') {
        throw "url.txt must be http(s); got: $($url.Substring(0, [Math]::Min(40, $url.Length)))"
    }

    # Capture stdout (JSON) separately from stderr (log).
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = 'python'
    $psi.Arguments = "`"$Cli`" transcribe `"$url`""
    $psi.WorkingDirectory = $AetherRoot
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true

    $proc = New-Object System.Diagnostics.Process
    $proc.StartInfo = $psi
    [void]$proc.Start()
    $stdout = $proc.StandardOutput.ReadToEnd()
    $stderr = $proc.StandardError.ReadToEnd()
    $proc.WaitForExit()

    if ($stderr) {
        Add-Content -Path $LogFile -Value $stderr -Encoding utf8
    }
    Add-Content -Path $LogFile -Value "[$(Get-Date -Format 'o')] exit_code=$($proc.ExitCode)" -Encoding utf8

    if (-not $stdout.Trim()) {
        throw "aether CLI produced empty stdout (exit $($proc.ExitCode))"
    }

    Write-Utf8NoBom -Path $ResultFile -Text $stdout.TrimEnd()

    $data = $stdout | ConvertFrom-Json
    if (-not $data.success) {
        $errMsg = if ($data.error) { [string]$data.error } else { 'aether success=false' }
        throw $errMsg
    }
    if (-not $data.text -or -not ([string]$data.text).Trim()) {
        throw 'aether returned success without text'
    }
    if (-not $data.method) {
        throw 'aether result missing method'
    }
    if (-not $data.backend) {
        throw 'aether result missing backend'
    }

    Write-Utf8NoBom -Path $DoneFile -Text (Get-Date -Format 'o')
    Add-Content -Path $LogFile -Value "[$(Get-Date -Format 'o')] done method=$($data.method) backend=$($data.backend) chars=$($data.text.Length)" -Encoding utf8
    exit 0
}
catch {
    Write-Fail $_.Exception.Message
    exit 1
}
