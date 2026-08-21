# Pilot telemetry matrix (PILOT-05 / SIEM-006)

Updated: **2026-08-18 20:30:00 IST (UTC+05:30)**  
Pack version: `hivearmor-pilot-detection` `1.0.0`  
Engine format: native HiveArmor CEL YAML (`name` + `where`). Sigma files under `builtin-rules/` are skipped at load.

## Bounded sources

| Source | Agent dataType | Filter | Staging proof |
|---|---|---|---|
| Windows process / PowerShell | `powershell`, `process`, `wineventlog`, `windows`, `windows-etw` | `filters/endpoint/powershell.yaml`, `filters/windows/windows-events.yml` | Encoded command positive; plain `Get-Process` negative |
| Windows Security logon | `wineventlog`, `windows`, `windows-etw` | `filters/windows/windows-events.yml` (`log.eventCode` / `log.eventId`) | Event 4625 positive; 4624 negative |
| Linux auth (sshd/sudo) | `linux`, `syslog` | `filters/linux/linux.yml` | `Failed password` / `authentication failure` positive; `Accepted password` negative |

`DET-ING-001` remains a lab injection control. It is not the staging enrollment proof.

## Versioned rules

Loaded from `event-processor/builtin-rules/pilot/` (copied to `/workdir/rules/pilot` in the image):

| Rule name | MITRE | Positive | Negative |
|---|---|---|---|
| `PILOT-WIN-PS-ENCODED` | T1059.001 | `-EncodedCommand` / `-enc` | PowerShell without encoded flags |
| `PILOT-WIN-FAILED-LOGON` | T1110 | Event ID 4625 | Event ID 4624 |
| `PILOT-LIN-AUTH-FAIL` | T1110 | Failed SSH/sudo auth | Accepted SSH password |

Health is `degraded` when any required pilot rule is missing or fails CEL compile. Invalid files are skipped and listed; the process still starts.

## IDs

- Event `_id` is the log/event id (idempotent OpenSearch PUT).
- Alert `_id` is SHA-1 name-based UUID of `eventId:ruleId:ruleName` so Kafka retry does not create a second alert document.
