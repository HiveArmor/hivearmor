# Windows packaged-host role matrix only (Admin / SOC / Analyst / cross-tenant).
# Passwords from C:\ha-agent-test\secrets\ — never echoed.
$ErrorActionPreference = "Stop"

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

$backend = "https://172.31.17.117"
$tenantId = 1
$unauthorizedTenantId = 3812
$secretDir = "C:\ha-agent-test\secrets"
$report = "C:\ha-agent-test\hivearmor-pilot01-windows-role-matrix.json"

function Read-Secret([string]$Name) {
    $path = Join-Path $secretDir $Name
    if (-not (Test-Path $path)) { throw "missing $path" }
    $v = (Get-Content -Path $path -Raw).Trim()
    if ([string]::IsNullOrWhiteSpace($v)) { throw "$path empty" }
    return $v
}

function Invoke-Login([string]$User, [string]$Pass) {
    $body = @{ username = $User; password = $Pass; rememberMe = $false } | ConvertTo-Json
    $response = Invoke-RestMethod -Method Post -Uri "$backend/api/authenticate" -ContentType "application/json" -Body $body
    $token = if ($response.id_token) { $response.id_token } else { $response.token }
    if (-not $token) { throw "login $User returned no token" }
    Write-Host "PASS: login $User HTTP 200"
    return $token
}

function Invoke-List([string]$Token, [int]$SelectedTenantId) {
    $headers = @{ Authorization = "Bearer $Token"; "X-Tenant-ID" = "$SelectedTenantId" }
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Method Get -Uri "$backend/api/ha-agent-enrollments?page=0&size=25" -Headers $headers
        return [int]$response.StatusCode
    } catch {
        if ($_.Exception.Response) {
            return [int]$_.Exception.Response.StatusCode
        }
        throw
    }
}

$admin = Invoke-Login "admin" (Read-Secret "admin.pass")
$soc = Invoke-Login "soc.manager" (Read-Secret "soc.manager.pass")
$analyst = Invoke-Login "analyst.chen" (Read-Secret "analyst.chen.pass")

$adminStatus = Invoke-List $admin $tenantId
$socStatus = Invoke-List $soc $tenantId
$analystStatus = Invoke-List $analyst $tenantId
$unauthorizedStatus = Invoke-List $soc $unauthorizedTenantId

if ($adminStatus -ne 200) { throw "Admin list returned $adminStatus expected 200" }
Write-Host "PASS: Admin list HTTP $adminStatus"
if ($socStatus -ne 200) { throw "SOC Manager list returned $socStatus expected 200" }
Write-Host "PASS: SOC Manager list HTTP $socStatus"
if ($analystStatus -lt 400) { throw "Analyst list returned $analystStatus expected deny" }
Write-Host "PASS: Analyst list denied HTTP $analystStatus"
if ($unauthorizedStatus -lt 400) { throw "Unauthorized tenant returned $unauthorizedStatus expected deny" }
Write-Host "PASS: Unauthorized tenant denied HTTP $unauthorizedStatus"

$reportObj = [ordered]@{
    workId                   = "PILOT-01"
    gate                     = "packaged-host-role-matrix"
    platform                 = "windows"
    backendUrl               = $backend
    tenantId                 = $tenantId
    unauthorizedTenantId     = $unauthorizedTenantId
    adminStatus              = $adminStatus
    socManagerStatus         = $socStatus
    analystStatus            = $analystStatus
    unauthorizedTenantStatus = $unauthorizedStatus
    status                   = "script-complete"
}
$reportObj | ConvertTo-Json | Set-Content -Path $report -Encoding utf8
Write-Host "REPORT=$report"
Write-Host "status=script-complete"
