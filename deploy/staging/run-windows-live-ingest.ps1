# Re-enroll Windows agent (no revoke) and generate live Security/PowerShell activity.
# Secrets stay in C:\ha-agent-test\secrets\ — never echoed. Windows PowerShell 5.1 compatible.
$ErrorActionPreference = "Stop"

$pkg = "C:\ha-agent-test\pkg\hivearmor-agent-11.0.0-staging-windows-amd64"
$secretDir = "C:\ha-agent-test\secrets"
$report = "C:\ha-agent-test\hivearmor-windows-live-ingest-report.json"
$server = "172.31.17.117"
$backend = "https://172.31.17.117"
$marker = "HA-LIVE-WIN-" + [DateTimeOffset]::UtcNow.ToString("yyyyMMddHHmmss")

if (-not ([System.Management.Automation.PSTypeName]'HaTrustAllCerts').Type) {
    Add-Type @"
using System.Net;
using System.Security.Cryptography.X509Certificates;
public class HaTrustAllCerts {
  public static void Enable() {
    ServicePointManager.ServerCertificateValidationCallback = delegate { return true; };
    ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;
  }
}
"@
}
[HaTrustAllCerts]::Enable()

function Read-Secret([string]$Path) {
    if (-not (Test-Path $Path)) { throw "missing $Path" }
    $value = (Get-Content -Path $Path -Raw).Trim()
    if ([string]::IsNullOrWhiteSpace($value)) { throw "$Path is empty" }
    return $value
}

function Invoke-Login([string]$Username, [string]$Password) {
    $body = @{ username = $Username; password = $Password; rememberMe = $false } | ConvertTo-Json
    $response = Invoke-RestMethod -Method Post -Uri "$backend/api/authenticate" -ContentType "application/json" -Body $body
    $token = if ($response.id_token) { $response.id_token } else { $response.token }
    if (-not $token) { throw "login for $Username returned no JWT token" }
    return $token
}

function Invoke-TenantRequest {
    param(
        [string]$Method,
        [string]$Token,
        [int]$SelectedTenantId,
        [string]$Path,
        [object]$Body = $null
    )
    $headers = @{
        Authorization = "Bearer $Token"
        "X-Tenant-ID" = "$SelectedTenantId"
    }
    try {
        if ($null -eq $Body) {
            $response = Invoke-WebRequest -UseBasicParsing -Method $Method -Uri "$backend$Path" -Headers $headers
        } else {
            $json = $Body | ConvertTo-Json -Depth 6
            $response = Invoke-WebRequest -UseBasicParsing -Method $Method -Uri "$backend$Path" -Headers $headers -ContentType "application/json" -Body $json
        }
        return [pscustomobject]@{
            StatusCode = [int]$response.StatusCode
            Body       = if ($response.Content) { $response.Content | ConvertFrom-Json } else { $null }
        }
    } catch {
        if ($_.Exception.Response) {
            $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            $content = $reader.ReadToEnd()
            $parsed = $null
            if ($content) { try { $parsed = $content | ConvertFrom-Json } catch { $parsed = $content } }
            return [pscustomobject]@{
                StatusCode = [int]$_.Exception.Response.StatusCode
                Body       = $parsed
            }
        }
        throw
    }
}

function Protect-SecretFile {
    param([string]$Path, [string]$Value)
    [System.IO.File]::WriteAllText($Path, $Value, [System.Text.UTF8Encoding]::new($false))
    icacls $Path /inheritance:r | Out-Null
    icacls $Path /grant:r "$($env:USERNAME):(R,W)" "Administrators:(R,W)" "SYSTEM:(R,W)" | Out-Null
}

if (-not (Test-Path "$pkg\hivearmor_agent_service.exe")) { throw "missing agent at $pkg" }
$adminPass = Read-Secret (Join-Path $secretDir "admin.pass")

Write-Host "marker=$marker"
Write-Host "login_admin"
$adminToken = Invoke-Login -Username admin -Password $adminPass
Write-Host "PASS: admin login"

$expiresAt = [DateTimeOffset]::UtcNow.AddMinutes(45).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
$create = Invoke-TenantRequest -Method Post -Token $adminToken -SelectedTenantId 1 -Path "/api/ha-agent-enrollments" -Body @{
    policyId  = "pilot-windows-live-ingest"
    platform  = "windows"
    expiresAt = $expiresAt
    maxUses   = 1
}
if ($create.StatusCode -ne 201) { throw "enrollment create failed $($create.StatusCode)" }
$tokenId = $create.Body.enrollment.id
$enrollmentToken = $create.Body.token
$tokenFile = Join-Path $env:TEMP ("ha-enroll-" + [guid]::NewGuid().ToString("N") + ".token")
Protect-SecretFile -Path $tokenFile -Value $enrollmentToken
Write-Host "PASS: enrollment token created id=$tokenId"

Push-Location $pkg
try {
    $existing = Get-Service -Name "HiveArmorAgent" -ErrorAction SilentlyContinue
    if ($existing) {
        Write-Host "removing_previous_HiveArmorAgent"
        $prevEap = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        & ".\hivearmor_agent_service.exe" uninstall 2>&1 | Out-Null
        sc.exe stop HiveArmorAgent 2>&1 | Out-Null
        sc.exe delete HiveArmorAgent 2>&1 | Out-Null
        $ErrorActionPreference = $prevEap
        $deadline = (Get-Date).AddSeconds(30)
        while ((Get-Service -Name "HiveArmorAgent" -ErrorAction SilentlyContinue) -and (Get-Date) -lt $deadline) {
            Start-Sleep -Seconds 1
        }
        Start-Sleep -Seconds 2
    }

    Write-Host "install_begin"
    & ".\hivearmor_agent_service.exe" install $server yes --enrollment-token-file $tokenFile --mode edr
    if ($LASTEXITCODE -ne 0) { throw "install failed exit $LASTEXITCODE" }
    Write-Host "install_end"
} finally {
    Pop-Location
    Remove-Item -Force $tokenFile -ErrorAction SilentlyContinue
}

$svc = Get-Service -Name "HiveArmorAgent"
if ($svc.Status -ne "Running") { throw "HiveArmorAgent not running: $($svc.Status)" }
Write-Host "PASS: service running"

$configYml = Join-Path $pkg "config.yml"
$agentId = $null
if (Test-Path $configYml) {
    $match = Select-String -Path $configYml -Pattern '^agent-id:\s*(\d+)\s*$'
    if ($match) { $agentId = [int]$match.Matches[0].Groups[1].Value }
}
Write-Host "agentId=$agentId"

Write-Host "generate_activity_begin"
$t0 = [DateTimeOffset]::UtcNow.ToString("o")
Restart-Service -Name "Spooler" -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
try {
    Write-EventLog -LogName Application -Source "Application" -EventId 1001 -EntryType Information `
        -Message "HiveArmor live ingest marker $marker"
} catch {}
Get-Process | Out-Null
powershell -NoProfile -Command "Write-Output 'HiveArmor live PS marker $marker'" | Out-Null
$bytes = [System.Text.Encoding]::Unicode.GetBytes("Write-Output 'HiveArmor encoded marker $marker'")
$enc = [Convert]::ToBase64String($bytes)
powershell -NoProfile -EncodedCommand $enc | Out-Null
$badUser = "ha-live-baduser-$([guid]::NewGuid().ToString('N').Substring(0,8))"
cmd /c "net use \\127.0.0.1\IPC$ /user:$badUser WrongPass123 >nul 2>&1"
Write-Host "generate_activity_end"

Write-Host "waiting_45s_for_pipeline"
Start-Sleep -Seconds 45

$logPath = Join-Path $pkg "logs\hivearmor_agent.log"
$authErrors = 0
if (Test-Path $logPath) {
    $recentLines = Get-Content -Path $logPath -Tail 60
    $authErrors = (@($recentLines | Where-Object { $_ -match "invalid key|Unauthenticated|PermissionDenied|status 401" })).Count
}

$payload = [ordered]@{
    workId = "WINDOWS-LIVE-INGEST"
    marker = $marker
    hostname = $env:COMPUTERNAME
    agentId = $agentId
    tokenId = "$tokenId"
    activitySinceUtc = $t0
    serviceStatus = (Get-Service HiveArmorAgent).Status.ToString()
    authErrorHitsInTail = $authErrors
    generatedAtUtc = [DateTimeOffset]::UtcNow.ToString("o")
    status = if ($authErrors -eq 0 -and $agentId) { "enrolled-activity-generated" } else { "enrolled-with-warnings" }
    note = "Credential left active (no revoke) for live OpenSearch/UI verification"
}
($payload | ConvertTo-Json -Depth 4) | Set-Content -Path $report -Encoding UTF8
Write-Host "REPORT=$report"
Write-Host ("status=" + $payload.status)
Write-Host ("marker=" + $marker)
Write-Host ("agentId=" + $agentId)
Write-Host ("authErrorHitsInTail=" + $authErrors)
Write-Host ("activitySinceUtc=" + $t0)
