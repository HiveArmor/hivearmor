# HiveArmor endpoint agent — secure install and lifecycle

Use a one-time enrollment token created for the correct tenant, policy and operating system. Do not place an enrollment token or device credential in a command argument, script variable, service definition, log or ticket.

## Package flavors (size / build tags)

Published Sensors downloads should use the **slim** endpoint build (DEP-SIZE-01):

| Flavor label | Recommended `go build` tags | When to use |
|---|---|---|
| **log** (default download) | `-tags agent_slim,nonetflow` | Log / light endpoint agents |
| **edr** | `-tags agent_slim,nonetflow` | Endpoint EDR (`--mode edr`); same binary tags as log today — collectors gated at runtime |
| **netflow** | `-tags agent_slim` | Network-sensor hosts that need the netflow collector linked in |

Do **not** set `agent_slim` on event-processor or `sdk` plugin builds.

```bash
# Preferred local build
make -C agent build-slim FLAVOR=log GOOS=linux GOARCH=amd64

# Or publish helper (builds then copies)
BUILD_SLIM=1 SOURCE_DIR=./dist/agents VERSION=11.0.0-staging \
  bash deploy/staging/publish-agent-packages.sh
```

CI / release jobs that still run plain `go build .` without tags ship the kitchen-sink ~53 MiB binary — update those pipelines to pass `-tags agent_slim,nonetflow` for endpoint packages.

## Linux

```bash
sudo install -d -m 0750 /opt/hivearmor/agent
sudo install -m 0755 hivearmor_agent_service /opt/hivearmor/agent/hivearmor_agent_service
sudo install -m 0600 /secure/operator/path/enrollment.token /opt/hivearmor/agent/enrollment.token
sudo /opt/hivearmor/agent/hivearmor_agent_service install siem.example no \
  --enrollment-token-file /opt/hivearmor/agent/enrollment.token \
  --mode edr
sudo rm -f /opt/hivearmor/agent/enrollment.token
systemctl is-active HiveArmorAgent
```

Install writes `/etc/systemd/system/HiveArmorAgent.service.d/10-telemetry.conf` so the service loads `/etc/hivearmor/agent.env` (mode `0600`). Copy `linux-telemetry.env.example` to that path, set `HA_INTERNAL_KEY` / `HA_TENANT_ID`, then `systemctl daemon-reload && systemctl restart HiveArmorAgent`. Do not put those values in the unit file or the install command line. Sharing `INTERNAL_KEY` with endpoints is staging-only until agent-manager signed telemetry ingest exists. Pack `ha-linux-observed-ssh` is observed host files, not an official CIS benchmark.

Until enrollment is complete, a Linux host may run the packaged `hivearmor-telemetry.service` unit (`telemetry-loop`) with the same env file.

For a rotated credential, place the one-time response in a `0600` file and run:

```bash
sudo /opt/hivearmor/agent/hivearmor_agent_service rotate-credential \
  --credential-file /secure/operator/path/device.credential
sudo rm -f /secure/operator/path/device.credential
systemctl is-active HiveArmorAgent
```

## Windows

Run PowerShell as Administrator. Standard input avoids leaving the secret in the process command line; ensure the source file has an Administrators/SYSTEM-only ACL and delete it immediately after use.

```powershell
Get-Content -Raw C:\Secure\enrollment.token |
  .\hivearmor_agent_service.exe install siem.example no --enrollment-token-file - --mode edr
Remove-Item -Force C:\Secure\enrollment.token
Get-Service HiveArmorAgent
```

After an authorized server-side rotation:

```powershell
Get-Content -Raw C:\Secure\device.credential |
  .\hivearmor_agent_service.exe rotate-credential --credential-file -
Remove-Item -Force C:\Secure\device.credential
Get-Service HiveArmorAgent
```

## Lost device and replacement

1. Revoke the lost device credential with a bounded reason in Response Governance or the enrollment API.
2. Confirm the credential-revoked audit event and that reconnect is denied.
3. Create a fresh one-time token for the replacement device.
4. Install using the protected flow above. A revoked predecessor with the same hostname/MAC does not block authorized re-enrollment; an unrevoked duplicate does.
5. Record only safe token ID, old/new agent UUID, credential version, tenant and audit event IDs/timestamps.

Never use `yes` for certificate validation in production. Verify `SHA256SUMS` and the release provenance/Windows Authenticode signature before installation.
