$ErrorActionPreference = "Continue"
Write-Host "status_before=$((Get-Service HiveArmorAgent).Status)"
sc.exe start HiveArmorAgent
Start-Sleep -Seconds 5
Write-Host "status_after=$((Get-Service HiveArmorAgent).Status)"
sc.exe query HiveArmorAgent
# Safe log tail: drop lines that look like secrets
$log = "C:\ha-agent-test\pkg\hivearmor-agent-11.0.0-staging-windows-amd64\logs\hivearmor_agent.log"
if (Test-Path $log) {
  Get-Content $log -Tail 30 | Where-Object { $_ -notmatch '(?i)(agent-key|agent_key|password|token|secret|credential\s*=)' } | ForEach-Object { Write-Host $_ }
} else {
  Write-Host "no_agent_log"
}
