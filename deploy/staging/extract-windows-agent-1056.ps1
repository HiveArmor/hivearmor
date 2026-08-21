$ErrorActionPreference = "Continue"
Write-Host "=== stop/kill agent ==="
Stop-Service HiveArmorAgent -Force -ErrorAction SilentlyContinue
sc.exe stop HiveArmorAgent | Out-Null
Start-Sleep -Seconds 2
Get-Process hivearmor* -ErrorAction SilentlyContinue | ForEach-Object {
  Write-Host ("killing pid=" + $_.Id + " name=" + $_.ProcessName)
  Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
}
Start-Sleep -Seconds 3
$left = @(Get-Process hivearmor* -ErrorAction SilentlyContinue)
if ($left.Count -gt 0) {
  Write-Host "FAIL: processes still running"
  $left | Format-Table Id, ProcessName -AutoSize | Out-String | Write-Host
  exit 2
}
Write-Host "PASS: no hivearmor processes"

$pkg = "C:\ha-agent-test\pkg\hivearmor-agent-11.0.0-staging-windows-amd64"
if (Test-Path $pkg) {
  Remove-Item -Recurse -Force $pkg
}
New-Item -ItemType Directory -Force -Path "C:\ha-agent-test\pkg" | Out-Null
tar -xzf "C:\ha-agent-test\hivearmor-agent-windows-amd64.tar.gz" -C "C:\ha-agent-test\pkg"
if (-not (Test-Path "$pkg\hivearmor_agent_service.exe")) {
  Write-Host "FAIL: extract missing agent exe"
  exit 3
}
Write-Host "=== package ==="
Get-ChildItem $pkg | Select-Object Name, Length, LastWriteTime | Format-Table -AutoSize | Out-String -Width 200 | Write-Host
$hash = (Get-FileHash "$pkg\hivearmor_agent_service.exe" -Algorithm SHA256).Hash
Write-Host ("agent_sha256=" + $hash)
Write-Host "EXTRACT_OK"
