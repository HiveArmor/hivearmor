# Staging single-node SIEM (PILOT-07 / SIEM-008)

Host-published ports: **443** (HTTPS UI/API via edge proxy), **50051** (agent log ingress), **9000** (agent-manager enrollment gRPC), and **9001** (agent dependency HTTPS, including `version.json`). OpenSearch, PostgreSQL, Redpanda, backend 8080 and `/v1/inject` stay on the private compose network.

## Prerequisites

1. Docker Engine on a dedicated VM (or this host for a lab-shaped rehearsal).
2. Non-default secrets in `deploy/staging/.env` (never `localdev123!`, `LocalDev@2024!`, or `local-dev-internal-key-do-not-use-in-prod-12345678`).
3. TLS material in `local-dev/certs/` (lab CA) or replacements with SANs for the DNS name **and** `opensearch`.
4. Build secrets already used by this repo: `MAVEN_TK`, agent `REPLACE_KEY` / `AGENT_SECRET_PREFIX`, event-processor geolocation CSVs.
5. One Linux endpoint for enrollment (the same VM is acceptable).

## Install

```bash
cd deploy/staging
cp .env.example .env
# edit .env — every password and INTERNAL_KEY must be unique
docker compose --env-file .env config >/dev/null
docker compose --env-file .env up -d --build
```

Wait until `backend` and `eventprocessor` are healthy. `/v1/inject` is not started (`HA_PROFILE=staging`). Kafka consumers run only on the manager (`KAFKA_WORKERS=1`); the worker owns `:50051`.

## Staging MVP checks (ACC subset)

| Gate | What to do |
|---|---|
| ACC-01 | Compose starts; HTTPS login on `:443` with frontend-v3 |
| ACC-04 | Enroll a Linux agent with a tenant-bound one-time token; ProcessLog identity is accepted |
| ACC-05 | Fire one positive pilot rule (`PILOT-WIN-PS-ENCODED`, `PILOT-WIN-FAILED-LOGON`, or `PILOT-LIN-AUTH-FAIL`); the alert id appears on `/alerts` |
| ACC-06 | A negative control (plain PowerShell, 4624, accepted SSH) does not create that rule’s alert |
| ACC-10 | Forged tenant on an enrolled stream is denied |
| ACC-11 | Revoke the device credential; subsequent ingest is denied |
| ACC-14 | Do not use `/v1/inject` or foundation fixtures |
| ACC-09 | Broker outage: enrolled ProcessLog is not acked; agent SQLite keeps the unprocessed row; after restore the same id is delivered. Local-dev rehearsal: `local-dev/tests/pilot-broker-outage.sh` |
| ACC-12 | Subset: `bash deploy/staging/run-siem009-backup-restore.sh` — throwaway Postgres restore counts plus renamed OpenSearch snapshot restore. Not a new-VM rebuild. See `BACKUP-RESTORE.md`. |

## Restart

Restart `eventprocessor` and `eventprocessor-worker`. Kafka offsets must not advance when required OpenSearch writes fail. Unprocessed agent spool rows must remain.

## Label

Passing this guide is **`STAGING CANDIDATE`**, not `PRODUCTION READY`. Packaged Windows SCM (ACC-02), signed agents, 24-hour soak and a restore onto a **new** VM remain open. ACC-12 on this host is a throwaway-database / renamed-index drill, not an off-box copy.
