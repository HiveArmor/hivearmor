## PILOT-01 Packaged-Host Acceptance

Recorded: **2026-08-18 15:30:51 IST (UTC+05:30)**

Purpose: standardize the remaining real-host acceptance gate for `PILOT-01` without inventing a new backend contract. These checks must run from the actual packaged Windows and Linux hosts after the agent archives are unpacked.

This document does not mark `PILOT-01` complete. It defines the exact operator flow and reusable scripts to collect evidence for the remaining gate.

### Required evidence

Capture and retain:

- host OS, version and architecture
- package name and local SHA-256 verification result
- backend URL, gRPC server name and tenant ID
- token ID, agent numeric ID, agent UUID and audit event IDs
- install/start/stop/restart/reconnect timestamps
- role-matrix HTTP statuses for Admin, SOC Manager and Analyst
- denial status for unauthorized tenant selection when a second tenant is available
- confirmation that no enrollment token or device credential appeared in process arguments or agent logs

Never record the enrollment token or rotated device credential themselves.

### Linux

Run from the unpacked package directory on a supported Linux host:

```bash
chmod +x verify-packaged-linux.sh
sudo ./verify-packaged-linux.sh \
  --package-dir "$(pwd)" \
  --server siem.example \
  --backend-url https://siem.example \
  --grpc-server-name siem.example \
  --tenant-id 1 \
  --admin-user admin \
  --admin-pass 'REDACTED' \
  --soc-user soc.manager \
  --soc-pass 'REDACTED' \
  --analyst-user analyst.chen \
  --analyst-pass 'REDACTED'
```

Optional cross-tenant denial inputs:

```bash
  --unauthorized-tenant-id 2 \
  --report-file /var/tmp/hivearmor-pilot01-linux-report.json
```

### Windows

Run from an elevated PowerShell session in the unpacked package directory:

```powershell
Set-ExecutionPolicy -Scope Process Bypass -Force
.\verify-packaged-windows.ps1 `
  -PackageDir (Get-Location).Path `
  -Server siem.example `
  -BackendUrl https://siem.example `
  -GrpcServerName siem.example `
  -TenantId 1 `
  -AdminUser admin `
  -AdminPass 'REDACTED' `
  -SocUser soc.manager `
  -SocPass 'REDACTED' `
  -AnalystUser analyst.chen `
  -AnalystPass 'REDACTED'
```

Optional cross-tenant denial input:

```powershell
  -UnauthorizedTenantId 2 `
  -ReportFile "$env:TEMP\hivearmor-pilot01-windows-report.json"
```

### Expected outcomes

The host-side verification scripts should prove all of the following:

1. A one-time enrollment token is created through the authenticated tenant-scoped REST API and consumed exactly once during install.
2. The packaged binary installs the `HiveArmorAgent` service, and service-manager start/stop/restart succeeds on the real host.
3. The package-local `config.yml` yields an agent ID that can be used for authoritative server-side credential rotation and revocation.
4. A rotated credential is accepted only through a protected file and `rotate-credential`; the service reconnects after rotation.
5. The revoked credential produces a denial event rather than a silent reconnect.
6. Enrollment audit records include token-created, token-consumed, credential-rotated and credential-revoked events without secret fields.
7. Admin and SOC Manager can read `/api/ha-agent-enrollments` with the selected tenant; Analyst is denied.
8. If an existing but unauthorized tenant ID is supplied, the request is denied and reported.
9. Neither the process list nor the agent log contains the one-time enrollment token or rotated device credential.

### Remaining manual review

Even after these scripts pass, the operator still needs to attach:

- signed package provenance verification
- screenshot or terminal proof of the OS service state
- any relevant server-side audit query output with secrets redacted
- any observed discrepancy between expected and actual denial status for unauthorized tenant selection

Only after the actual Windows and Linux host executions are recorded in `docs/ai-handoff/validation-evidence.md` may `PILOT-01` move toward `CODE COMPLETE`.
