# Staging ACC-02 runner with Admin + SOC Manager + Analyst role matrix.
# Passwords live under C:\ha-agent-test\secrets\ — never echoed.
$ErrorActionPreference = "Stop"

$pkg = "C:\ha-agent-test\pkg\hivearmor-agent-11.0.0-staging-windows-amd64"
$secretDir = "C:\ha-agent-test\secrets"
$report = "C:\ha-agent-test\hivearmor-pilot01-windows-report.json"
$verify = "C:\ha-agent-test\verify-packaged-windows-staging.ps1"
$server = "172.31.17.117"
$backend = "https://172.31.17.117"

function Read-Secret([string]$Path) {
    if (-not (Test-Path $Path)) { throw "missing $Path" }
    $value = (Get-Content -Path $Path -Raw).Trim()
    if ([string]::IsNullOrWhiteSpace($value)) { throw "$Path is empty" }
    return $value
}

if (-not (Test-Path "$pkg\hivearmor_agent_service.exe")) { throw "missing agent package at $pkg" }
if (-not (Test-Path $verify)) { throw "missing $verify" }

$adminPass = Read-Secret (Join-Path $secretDir "admin.pass")
$socPass = Read-Secret (Join-Path $secretDir "soc.manager.pass")
$analystPass = Read-Secret (Join-Path $secretDir "analyst.chen.pass")

Set-Location $pkg
& $verify `
  -PackageDir $pkg `
  -Server $server `
  -BackendUrl $backend `
  -GrpcServerName $server `
  -TenantId 1 `
  -AdminUser admin `
  -AdminPass $adminPass `
  -SocUser "soc.manager" `
  -SocPass $socPass `
  -AnalystUser "analyst.chen" `
  -AnalystPass $analystPass `
  -UnauthorizedTenantId 3812 `
  -SkipCertValidation yes `
  -ReportFile $report

Write-Host "REPORT=$report"
if (Test-Path $report) {
  $j = Get-Content -Raw $report | ConvertFrom-Json
  Write-Host ("status=" + $j.status)
  Write-Host ("agentId=" + $j.agentId)
  Write-Host ("tokenId=" + $j.tokenId)
  Write-Host ("platform=" + $j.platform)
  Write-Host ("roleMatrixSkipped=" + $j.roleMatrixSkipped)
  Write-Host ("socManagerStatus=" + $j.socManagerStatus)
  Write-Host ("analystStatus=" + $j.analystStatus)
  Write-Host ("unauthorizedTenantStatus=" + $j.unauthorizedTenantStatus)
  Write-Host ("skipCertValidation=" + $j.skipCertValidation)
}
