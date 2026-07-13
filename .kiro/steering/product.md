---
inclusion: always
---

# Product: NilaChakra

Enterprise open-source **SIEM + XDR** platform (AGPL-3.0). Ingests logs from 25+ sources, correlates events before storage using a custom Go engine, and surfaces threats as alerts with SOC AI, incident management, and SOAR playbooks.

**Brand name:** NilaChakra (previously UTMStack — rebrand in progress per `REBRAND_NILACHAKRA_PLAN.md`)  
**Active line**: v11. v10 is EOL December 5, 2026 — no new features go there.

## User Personas

| Persona | Primary tasks |
|---|---|
| SOC Analyst L1 | Alert triage, status changes, incident creation |
| SOC Analyst L2/L3 | Deep investigation, log search, playbook execution |
| Security Engineer | Correlation rules, integration setup, data parsing |
| Compliance Officer | Compliance dashboards, scheduled PDF reports |
| Platform Admin | Users, API keys, system health, update management |

## Core Product Flows (preserve these end-to-end)

1. **Detect**: Log ingested → parsed → enriched → correlated → alert written to OpenSearch
2. **Investigate**: Analyst opens alert → drills into events → searches raw logs → views AI analysis
3. **Respond**: Alert triggers response rule → SOAR playbook sends command to agent → result recorded
4. **Report**: Compliance schedule runs → OpenSearch query evaluated → PDF generated and emailed

## Active / Disabled Routes

Active routes (all require auth unless noted):
`/dashboard`, `/data`, `/discover`, `/data-sources`, `/integrations`, `/app-management`, `/soar`, `/incident`, `/compliance`, `/data-parsing`, `/alerting-rules`, `/threat-intelligence`, `/active-directory`, `/management` (ADMIN only), `/creator`, `/profile`, `/variables`, `/getting-started`

**Disabled** — code exists, routes are commented out, do not re-enable without full testing:
- `/vulnerability-scanner` — code in `frontend/src/app/scanner/` and `vulnerability-scanner/`
- `/reports` — code in `frontend/src/app/report/`
- `/explore` — code in `frontend/src/app/filebrowser/`

The `compliance-orchestrator` Go plugin is built but intentionally excluded from `event_processor.Dockerfile`.

## Deployment Model

Single-node Docker Swarm on Ubuntu 22.04. Beyond 500 data sources requires secondary nodes. Container images currently at `ghcr.io/utmstack/utmstack/<service>:<tag>` (registry will move to `ghcr.io/nilachakra/` when new GitHub org is provisioned — see `REBRAND_NILACHAKRA_PLAN.md` SPEC 7). Full topology: `local-dev/docker-compose.yml`.
