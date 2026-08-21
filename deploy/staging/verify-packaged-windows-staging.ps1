param(
    [Parameter(Mandatory = $true)][string]$PackageDir,
    [Parameter(Mandatory = $true)][string]$Server,
    [Parameter(Mandatory = $true)][string]$BackendUrl,
    [Parameter(Mandatory = $true)][string]$GrpcServerName,
    [Parameter(Mandatory = $true)][int]$TenantId,
    [Parameter(Mandatory = $true)][string]$AdminUser,
    [Parameter(Mandatory = $true)][string]$AdminPass,
    [string]$SocUser,
    [string]$SocPass,
    [string]$AnalystUser,
    [string]$AnalystPass,
    [int]$UnauthorizedTenantId = 0,
    [string]$SkipCertValidation = "yes",
    [string]$ReportFile = "",
    # When false (default), rotate-credential must exit 0 without harness sc stop/start recovery.
    [switch]$AllowRotateHarnessRecovery = $false
)

$ErrorActionPreference = "Stop"

# Windows PowerShell 5.1 + staging self-signed edge cert.
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

function Assert-Status {
    param(
        [string]$Label,
        [int]$Actual,
        [int]$Expected
    )
    if ($Actual -ne $Expected) {
        throw "$Label returned HTTP $Actual, expected $Expected"
    }
    Write-Host "PASS: $Label returned HTTP $Actual"
}

function Assert-Denied {
    param(
        [string]$Label,
        [int]$Actual
    )
    if ($Actual -ge 200 -and $Actual -lt 300) {
        throw "$Label unexpectedly returned HTTP $Actual"
    }
    Write-Host "PASS: $Label denied with HTTP $Actual"
}

function Invoke-Login {
    param(
        [string]$Username,
        [string]$Password
    )
    $body = @{
        username   = $Username
        password   = $Password
        rememberMe = $false
    } | ConvertTo-Json
    $response = Invoke-RestMethod -Method Post -Uri "$BackendUrl/api/authenticate" -ContentType "application/json" -Body $body
    $token = if ($response.id_token) { $response.id_token } else { $response.token }
    if (-not $token) {
        throw "login for $Username returned no JWT token"
    }
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
            $response = Invoke-WebRequest -UseBasicParsing -Method $Method -Uri "$BackendUrl$Path" -Headers $headers
        } else {
            $json = $Body | ConvertTo-Json -Depth 6
            $response = Invoke-WebRequest -UseBasicParsing -Method $Method -Uri "$BackendUrl$Path" -Headers $headers -ContentType "application/json" -Body $json
        }
        return [pscustomobject]@{
            StatusCode = [int]$response.StatusCode
            Body       = if ($response.Content) { $response.Content | ConvertFrom-Json } else { $null }
        }
    } catch {
        if ($_.Exception.Response) {
            $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            $content = $reader.ReadToEnd()
            $body = if ($content) { $content | ConvertFrom-Json } else { $null }
            return [pscustomobject]@{
                StatusCode = [int]$_.Exception.Response.StatusCode
                Body       = $body
            }
        }
        throw
    }
}

function Get-AgentIdFromConfig {
    param([string]$Path)
    $match = Select-String -Path $Path -Pattern '^agent-id:\s*(\d+)\s*$'
    if (-not $match) {
        throw "agent-id not found in $Path"
    }
    return [int]$match.Matches[0].Groups[1].Value
}

function Protect-SecretFile {
    param(
        [string]$Path,
        [string]$Value
    )
    # Avoid UTF-8 BOM — PowerShell 5.1 Set-Content -Encoding utf8 writes a BOM
    # that breaks ha_agent_ prefix validation on stdin/file reads.
    [System.IO.File]::WriteAllText($Path, $Value, [System.Text.UTF8Encoding]::new($false))
    icacls $Path /inheritance:r | Out-Null
    icacls $Path /grant:r "$($env:USERNAME):(R,W)" "Administrators:(R,W)" "SYSTEM:(R,W)" | Out-Null
}

if (-not (Test-Path "$PackageDir\hivearmor_agent_service.exe")) {
    throw "package directory must contain hivearmor_agent_service.exe"
}
if (-not (Test-Path "$PackageDir\SHA256SUMS")) {
    throw "package directory must contain SHA256SUMS"
}
if (-not $ReportFile) {
    $ReportFile = Join-Path $PackageDir "pilot01-windows-report.json"
}
if ($SkipCertValidation -ne "yes" -and $SkipCertValidation -ne "no") {
    throw "SkipCertValidation must be yes or no"
}

$workDir = Join-Path $env:TEMP ("hivearmor-pilot01-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $workDir | Out-Null
$tokenFile = Join-Path $workDir "enrollment.token"
$credentialFile = Join-Path $workDir "device.credential"
$installLog = Join-Path $workDir "install.log"
$rotateLog = Join-Path $workDir "rotate.log"

try {
    Write-Host "login_admin"
    $adminToken = Invoke-Login -Username $AdminUser -Password $AdminPass
    Write-Host "PASS: admin login"
    $socToken = if ($SocUser -and $SocPass) { Invoke-Login -Username $SocUser -Password $SocPass } else { $null }
    $analystToken = if ($AnalystUser -and $AnalystPass) { Invoke-Login -Username $AnalystUser -Password $AnalystPass } else { $null }

    $expiresAt = [DateTimeOffset]::UtcNow.AddMinutes(30).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    $create = Invoke-TenantRequest -Method Post -Token $adminToken -SelectedTenantId $TenantId -Path "/api/ha-agent-enrollments" -Body @{
        policyId  = "pilot-windows-packaged-host"
        platform  = "windows"
        expiresAt = $expiresAt
        maxUses   = 1
    }
    Assert-Status "create enrollment token" $create.StatusCode 201
    $tokenId = $create.Body.enrollment.id
    $enrollmentToken = $create.Body.token
    Protect-SecretFile -Path $tokenFile -Value $enrollmentToken

    # Uninstall any previous lab install so PreRunE requireNotInstalled passes.
    Push-Location $PackageDir
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
    } finally {
        Pop-Location
    }

    Push-Location $PackageDir
    try {
        $hashes = Get-Content -Path ".\SHA256SUMS" | Where-Object { $_.Trim() -ne "" }
        foreach ($line in $hashes) {
            $parts = $line -split '\s+', 2
            $expected = $parts[0].Trim()
            $name = $parts[1].Trim().TrimStart('*')
            $actual = (Get-FileHash -Algorithm SHA256 -Path (Join-Path $PackageDir $name)).Hash.ToLowerInvariant()
            if ($actual -ne $expected.ToLowerInvariant()) {
                throw "SHA-256 mismatch for $name"
            }
        }

        Write-Host "install_begin"
        & ".\hivearmor_agent_service.exe" install $Server $SkipCertValidation --enrollment-token-file $tokenFile --mode edr 2>&1 |
            Tee-Object -FilePath $installLog
        if ($LASTEXITCODE -ne 0) {
            throw "agent install failed with exit $LASTEXITCODE"
        }
        Write-Host "install_end"
    } finally {
        Pop-Location
    }
    Remove-Item -Force $tokenFile

    $serviceName = "HiveArmorAgent"
    if ((Get-Service -Name $serviceName).Status -ne "Running") {
        throw "HiveArmorAgent service is not running after install"
    }
    Write-Host "PASS: service running after install"
    # Prefer explicit stop/start with timeout; Restart-Service can hang on Windows SCM.
    Stop-Service -Name $serviceName -Force -ErrorAction SilentlyContinue
    $deadline = (Get-Date).AddSeconds(45)
    while ((Get-Service -Name $serviceName).Status -ne "Stopped" -and (Get-Date) -lt $deadline) {
        Start-Sleep -Seconds 2
    }
    if ((Get-Service -Name $serviceName).Status -ne "Stopped") {
        sc.exe stop $serviceName | Out-Null
        Start-Sleep -Seconds 5
    }
    Start-Service -Name $serviceName
    $deadline = (Get-Date).AddSeconds(45)
    while ((Get-Service -Name $serviceName).Status -ne "Running" -and (Get-Date) -lt $deadline) {
        Start-Sleep -Seconds 2
    }
    if ((Get-Service -Name $serviceName).Status -ne "Running") {
        throw "HiveArmorAgent service is not running after restart cycle"
    }
    Write-Host "PASS: service restart cycle"

    $configPath = Join-Path $PackageDir "config.yml"
    $agentId = Get-AgentIdFromConfig -Path $configPath
    Write-Host "signed_agent_id $agentId"

    $audit = Invoke-TenantRequest -Method Get -Token $adminToken -SelectedTenantId $TenantId -Path "/api/ha-agent-enrollments/audit?page=0&size=100&tokenId=$tokenId"
    Assert-Status "list enrollment audit after install" $audit.StatusCode 200
    $auditEvents = @($audit.Body | ForEach-Object { $_.eventType })
    foreach ($required in @("enrollment.token.created", "enrollment.token.consumed")) {
        if ($auditEvents -notcontains $required) {
            throw "missing audit event after install: $required"
        }
    }

    $rotate = Invoke-TenantRequest -Method Post -Token $adminToken -SelectedTenantId $TenantId -Path "/api/ha-agent-enrollments/agents/$agentId/credential/rotate" -Body @{
        reason = "packaged host credential rotation acceptance"
    }
    Assert-Status "rotate credential" $rotate.StatusCode 201
    $rotatedCredential = $rotate.Body.key
    Protect-SecretFile -Path $credentialFile -Value $rotatedCredential

    Push-Location $PackageDir
    try {
        $prevEap = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        $rotateOut = & ".\hivearmor_agent_service.exe" rotate-credential --credential-file $credentialFile 2>&1
        $rotateRc = $LASTEXITCODE
        $ErrorActionPreference = $prevEap
        $rotateText = ($rotateOut | ForEach-Object { "$_" }) -join "`n"
        $rotateText | Tee-Object -FilePath $rotateLog | Out-Null
        Write-Host "rotate_rc=$rotateRc"
        if ($rotateRc -ne 0) {
            if (-not $AllowRotateHarnessRecovery) {
                throw "rotate-credential failed with exit $rotateRc (harness recovery disabled): $rotateText"
            }
            $svc = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
            if ($rotateText -match "credential saved") {
                sc.exe stop $serviceName | Out-Null
                $deadline = (Get-Date).AddSeconds(45)
                while ((Get-Service -Name $serviceName).Status -ne "Stopped" -and (Get-Date) -lt $deadline) {
                    Start-Sleep -Milliseconds 500
                }
                sc.exe start $serviceName | Out-Null
                $deadline = (Get-Date).AddSeconds(45)
                while ((Get-Service -Name $serviceName).Status -ne "Running" -and (Get-Date) -lt $deadline) {
                    Start-Sleep -Milliseconds 500
                }
                $svc = Get-Service -Name $serviceName
                if ($svc.Status -eq "Running") {
                    Write-Host "WARN: rotate-credential restart raced (rc=$rotateRc); recovered service start"
                } else {
                    throw "rotate-credential saved credential but service did not become Running"
                }
            } elseif ($svc -and $svc.Status -eq "Running") {
                Write-Host "WARN: rotate-credential rc=$rotateRc but service running; continuing"
            } else {
                throw "rotate-credential failed with exit $rotateRc : $rotateText"
            }
        } else {
            Write-Host "PASS: rotate-credential exit 0 (no harness recovery)"
        }
    } finally {
        Pop-Location
    }
    Remove-Item -Force $credentialFile -ErrorAction SilentlyContinue

    if ((Get-Service -Name $serviceName).Status -ne "Running") {
        throw "HiveArmorAgent service is not running after credential rotation"
    }
    Write-Host "PASS: service running after rotation"

    $revoke = Invoke-TenantRequest -Method Post -Token $adminToken -SelectedTenantId $TenantId -Path "/api/ha-agent-enrollments/agents/$agentId/credential/revoke" -Body @{
        reason = "packaged host revoke after rotation acceptance"
    }
    Assert-Status "revoke credential" $revoke.StatusCode 200

    $audit = Invoke-TenantRequest -Method Get -Token $adminToken -SelectedTenantId $TenantId -Path "/api/ha-agent-enrollments/audit?page=0&size=100"
    Assert-Status "list enrollment audit after rotation and revoke" $audit.StatusCode 200
    $agentEvents = @($audit.Body | Where-Object { $_.agentId -eq $agentId } | ForEach-Object { $_.eventType })
    foreach ($required in @("agent.credential.rotated", "agent.credential.revoked")) {
        if ($agentEvents -notcontains $required) {
            throw "missing credential audit event: $required"
        }
    }

    $socStatus = $null
    $analystStatus = $null
    $unauthorizedTenantStatus = $null
    if ($socToken) {
        $soc = Invoke-TenantRequest -Method Get -Token $socToken -SelectedTenantId $TenantId -Path "/api/ha-agent-enrollments?page=0&size=25"
        Assert-Status "SOC Manager list enrollment tokens" $soc.StatusCode 200
        $socStatus = $soc.StatusCode
    }
    if ($analystToken) {
        $analyst = Invoke-TenantRequest -Method Get -Token $analystToken -SelectedTenantId $TenantId -Path "/api/ha-agent-enrollments?page=0&size=25"
        Assert-Denied "Analyst list enrollment tokens" $analyst.StatusCode
        $analystStatus = $analyst.StatusCode
    }
    if ($UnauthorizedTenantId -gt 0) {
        if (-not $socToken) {
            throw "UnauthorizedTenantId requires SocUser/SocPass so the denial is checked as SOC Manager, not Admin"
        }
        $unauthorized = Invoke-TenantRequest -Method Get -Token $socToken -SelectedTenantId $UnauthorizedTenantId -Path "/api/ha-agent-enrollments?page=0&size=25"
        Assert-Denied "Unauthorized tenant selection" $unauthorized.StatusCode
        $unauthorizedTenantStatus = $unauthorized.StatusCode
    }

    $processList = (Get-CimInstance Win32_Process | Select-Object -ExpandProperty CommandLine) -join "`n"
    if ($processList -like "*$enrollmentToken*" -or $processList -like "*$rotatedCredential*") {
        throw "a secret appeared in process arguments"
    }
    foreach ($path in @($installLog, $rotateLog, (Join-Path $PackageDir "logs\hivearmor_agent.log"))) {
        if ((Test-Path $path) -and ((Get-Content -Raw -Path $path) -like "*$enrollmentToken*" -or (Get-Content -Raw -Path $path) -like "*$rotatedCredential*")) {
            throw "a secret appeared in $path"
        }
    }

    $report = [ordered]@{
        workId                   = "PILOT-01"
        platform                 = "windows"
        server                   = $Server
        backendUrl               = $BackendUrl
        grpcServerName           = $GrpcServerName
        tenantId                 = $TenantId
        tokenId                  = $tokenId
        agentId                  = $agentId
        skipCertValidation       = $SkipCertValidation
        socManagerStatus         = $socStatus
        analystStatus            = $analystStatus
        unauthorizedTenantStatus = $unauthorizedTenantStatus
        roleMatrixSkipped        = -not ($socToken -or $analystToken)
        status                   = "script-complete"
    }
    $report | ConvertTo-Json -Depth 4 | Set-Content -Path $ReportFile -Encoding utf8
    Write-Host "Windows packaged-host acceptance completed. Report written to $ReportFile"
} finally {
    Remove-Item -Recurse -Force $workDir -ErrorAction SilentlyContinue
}
