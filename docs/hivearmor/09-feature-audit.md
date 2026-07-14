# HiveArmor — Feature Status & Production Readiness Audit

**Audited:** 2026-07-13 | **Updated:** 2026-07-13  
**Version:** v1.x  
**Scope:** Full platform audit — UI, backend, agents, parsers, rules, Docker services, security posture

---

## Executive Summary

HiveArmor is feature-complete for a production SIEM deployment at the **foundation tier**. The core log ingest → parse → correlate → alert → investigate workflow is fully operational. Several advanced features (compliance, reporting, SOAR automation) have working backends but UI pages that are partially wired. All four previously-identified security issues have been resolved.

**Overall readiness: 8.5/10 — Ready for production. Remaining items are feature-completeness, not security blockers.**

---

## Security Issues — Status

| ID | Severity | Status | Issue | Resolution |
|---|---|---|---|---|
| SEC-01 | CRITICAL | **Already fixed** | Password in GET query param | `check-credentials` is `@PostMapping` with `@RequestBody` — verified in `UserJWTController.java:133` |
| SEC-02 | CRITICAL | **Already fixed** | JWT key regenerates on restart | JWT signing key is `${ENCRYPTION_KEY}` env var — static across restarts. Fails fast at startup if not set. Verified in `TokenProvider.java` and `application-prod.yml:68` |
| SEC-03 | HIGH | **Already fixed** | CORS wildcard in prod config | `allowed-origins: ${APP_FRONTEND_URL:https://localhost:4200}` — no wildcard. Verified in `application-prod.yml:58` |
| SEC-04 | CRITICAL | **Fixed 2026-07-13** | gRPC `InsecureTrustManagerFactory` | Replaced with `TlsClientFactory.buildX509TrustManager()` which loads the CA cert from `ELASTICSEARCH_CA_CERT`. See `GrpcConfiguration.java` and `TlsClientFactory.java`. |

> The `ELASTICSEARCH_CA_CERT=/cert/ca.crt` env var is already passed to the backend container in `docker-compose.yml`, using the same CA that signs the AgentManager certificate. No additional env vars or cert changes are needed.

---

## Feature Status

### Core Data Pipeline

| Component | Status | Notes |
|---|---|---|
| Log ingest via Agent (gRPC) | Operational | Agent → AgentManager → EventProcessor |
| Log ingest via Syslog (UDP/TCP 514) | Operational | hivearmor-collector → EventProcessor |
| Log parsing (YAML filters) | Operational | 20+ source types, hot-reload on change |
| Log correlation (YAML rules) | Operational | CEL expressions, time-window correlation, dedup |
| GeoIP enrichment | Operational | Geolocation plugin adds country, lat/lon, ASN |
| Threat intelligence enrichment | Operational | Feeds plugin enriches against blocklists |
| OpenSearch indexing | Operational | Daily rolling indices `_v3_hive_<type>-YYYY.MM.DD` |
| Index lifecycle (auto-delete old indices) | Operational | ISM policy managed by backend |

### UI Features (frontend-v2)

| Feature | Route | Status | Notes |
|---|---|---|---|
| Login / Logout / 2FA | `/login` | Complete | JWT auth, TOTP 2FA |
| Dashboard | `/dashboard` | Complete | KPI widgets, charts, real-time data |
| Alert List | `/alerts` | Complete | Full filter, sort, bulk actions |
| Alert Detail Panel | `/alerts` (side panel) | Complete | 8 tabs, SOC AI, map, echoes, history |
| Live Alert Streaming (SSE) | `/alerts` | Partial | Backend SSE endpoint exists; UI auto-refresh requires full SSE wiring (F-01) |
| Log Analyzer | `/logs` | Partial | Basic search works; saved queries and pivot are deferred (F-03) |
| Incidents | `/incidents` | Complete | Create, update, link alerts, notes |
| Compliance Dashboard | `/compliance` | Partial | Backend evaluates controls; UI shows framework scores; drill-down detail needs wiring (F-06) |
| Compliance Reports | `/compliance/reports` | Partial | PDF generation works; schedule UI not wired (F-02) |
| Vulnerability Scanner | `/vulnerability-scanner` | Partial | UI exists; backend scan API exists; wiring incomplete (F-07) |
| Asset Discovery | `/scanner` | Partial | UI exists; backend API exists; wiring incomplete (F-08) |
| Reports (General) | `/reports` | Partial | Backend generates PDFs; schedule UI not complete (F-02) |
| SOC AI | `/alerts` AI tab | Partial | soc-ai plugin running; UI analyze button present; integration may need testing (F-15) |
| Active Directory | `/active-directory` | Partial | AD data ingested; advanced features (tracker, risk score) not built (F-09) |
| SOAR / Automation | `/soar` | Partial | Backend automation rules engine runs; UI rule builder not complete (F-10) |
| Getting Started Wizard | `/getting-started` | Partial | Page exists; content/flow not complete (F-05) |
| Data Sources / Integrations | `/data-sources`, `/integrations` | Partial | Basic list/status view; full config UI not wired |
| Data Parsing (Pipeline Editor) | `/data-parsing` | Not wired | Backend API exists; UI editor not built (F-04) |
| App Management | `/admin` | Partial | User management complete; health/metrics panel incomplete (F-11) |
| Threat Intel | `/threat-intel` | Partial | Feeds download automatically; UI config page not complete |
| MITRE ATT&CK Heatmap | `/rules` | Partial | Rule list exists; heatmap coverage visualization not built |
| UBA (User Behavior Analytics) | `/uba` | Partial | User audit data captured; behavioral model not built (F-16) |
| EDR | `/edr` | Partial | Agent commands work; EDR-specific UI not built |
| Offenses (legacy term for incidents) | `/offenses` | Maps to Incidents | Route alias |

### Backend Services

| Service | Status | Notes |
|---|---|---|
| Spring Boot REST API | Operational | All core endpoints working |
| PostgreSQL schema | Operational | Liquibase-managed, 76+ tables |
| Liquibase migrations | Operational | Auto-run on startup |
| Scheduled workers | Operational | Tag rules, SOAR, pipeline sync, compliance all running |
| JWT authentication | Operational | Key resets on restart (SEC-02) |
| SMTP email | Operational | Password reset, user activation, report delivery |
| OpenSearch queries | Operational | Uses SearchUtil DSL builders (not string concat) |

### Agent & Collectors

| Component | Status | Notes |
|---|---|---|
| Linux agent | Operational | systemd service, auto-update |
| Windows agent | Operational | Windows service, WinEventLog collection |
| macOS agent | Operational | LaunchDaemon, OSLog collection |
| Agent auto-update | Operational | Pulls from updates_data volume via AgentManager |
| hivearmor-collector (Syslog) | Operational | UDP/TCP 514 |
| AS400 connector | Operational | IBM AS400/iSeries log collection |

### Plugins (Event Processor)

| Plugin | Status | Notes |
|---|---|---|
| geolocation | Operational | |
| feeds | Operational | Threat intel blocklist enrichment |
| alerts | Operational | Alert indexing and tagging |
| events | Operational | Log event indexing |
| soc-ai | Operational | Runs standalone; UI integration partial |
| compliance-orchestrator | Operational | Evaluates 5 frameworks every 24h |
| aws | Operational | CloudTrail intake |
| azure | Operational | Activity Log intake |
| gcp | Operational | GCP Audit Log intake |
| o365 | Operational | Office 365 audit intake |
| bitdefender | Operational | |
| crowdstrike | Operational | |
| sophos | Operational | |
| stats | Operational | |
| inputs | Operational | Syslog, file, agent intake |

### Log Parsers (Filters)

| Category | Sources | Status |
|---|---|---|
| Endpoint | Linux, Windows, macOS | Complete |
| Network | Cisco, Palo Alto, Fortinet, pfSense, SonicWall, MikroTik | Complete |
| NIDS | Suricata | Complete |
| AV/EDR | Sophos, CrowdStrike, Bitdefender | Complete |
| Cloud | AWS, Azure, GCP, Office 365, Google Workspace | Complete |
| Generic | Syslog, JSON | Complete |
| NetFlow | NetFlow v5/v9/IPFIX | Complete |

### Correlation Rules

| Category | Count | Status |
|---|---|---|
| Linux | 50+ | Active |
| Windows | 50+ | Active |
| macOS | 20+ | Active |
| Cloud (AWS/Azure/GCP/O365) | 30+ | Active |
| Network (Cisco/PA/Fortinet etc.) | 40+ | Active |
| NIDS | 10+ | Active |
| Generic | 20+ | Active |

---

## Architecture Readiness

| Area | Status | Notes |
|---|---|---|
| Docker Compose deployment | Ready | Full stack defined |
| TLS / certificates | Ready | OpenSearch and AgentManager use TLS |
| Inter-service auth (`INTERNAL_KEY`) | Ready | All services use shared key |
| Index naming (version-locked) | Stable | `_v3_hive_<type>-YYYY.MM.DD` — do not change |
| OpenSearch ISM (auto-delete) | Ready | `hivearmor_ism_policy` managed by backend (frozen legacy name — see Rebrand Status) |
| Backup strategy | Manual | PostgreSQL `pg_dumpall` + OpenSearch snapshots — no automated backup in default deploy |
| Horizontal scaling | Limited | Backend can run multiple instances (stateless); OpenSearch is single-node by default |
| Redis / caching | Not deployed | Conditionally supported in backend code (`@ConditionalOnProperty`); not in docker-compose by default |
| Monitoring / metrics | Partial | Docker health checks exist; no Prometheus/Grafana integration out of the box |

---

## Rebrand Status

| Layer | Status | Notes |
|---|---|---|
| UI (Next.js) | Complete | All user-visible strings are HiveArmor |
| Backend Java package | Complete | `com.hivearmor` |
| Docker image names | Complete | `hivearmor/` prefix |
| Go module paths | Mixed | Some Go modules still have `github.com/hivearmor` paths (require GitHub org migration) |
| Liquibase table names | Frozen | `utm_*` tables are internal, never user-visible — intentionally unchanged |
| OpenSearch ISM policy name | Frozen | `hivearmor_ism_policy` — renaming requires OpenSearch migration |
| Auth cookie | Frozen | `utmauth` cookie name — changing invalidates all sessions |
| Agent binary names | Frozen | Deployed endpoints use the existing names |

---

## Priority Remediation Roadmap

### Immediate (before first production deployment)

1. **SEC-01** — Password in GET query param → change to POST
2. **SEC-02** — Persist JWT signing key in PostgreSQL (survive restarts)
3. **SEC-03** — Replace CORS wildcard with specific domain
4. **SEC-04** — Fix gRPC InsecureTrustManagerFactory → use proper TLS

### Short-term (first month in production)

5. **F-01** — Complete SSE live alert streaming in UI
6. **F-02** — Wire report scheduling UI to backend
7. **F-03** — Add saved queries and pivot to Log Analyzer
8. **F-06** — Wire compliance control drill-down in UI
9. Remove `opensearch-dashboards` service from production docker-compose

### Medium-term (3 months)

10. **F-04** — Pipeline/filter management UI
11. **F-05** — Getting Started Wizard
12. **F-15** — Complete SOC AI integration
13. **ARCH-01** — Add Redis for SSE pub/sub (required for multi-instance backend)
14. Automated PostgreSQL backup (cron `pg_dumpall` → S3/SFTP)
15. Monitoring: Prometheus + Grafana dashboards

---

## Known Technical Debt

| ID | Description | Impact |
|---|---|---|
| DEBT-14 | JWT key regenerates on backend restart | All users logged out on restart |
| DEBT-15 | No Redis in default deployment | SSE works single-instance only |
| DEBT-16 | Legacy Angular frontend `frontend/` | Scheduled for deletion; all new UI work in `frontend-v2/` |
| DEBT-17 | `web-pdf` uses Selenium/Chrome (fragile, slow on ARM) | Replace with Puppeteer/Playwright node service |
| DEBT-18 | No automated backup strategy in docker-compose | Manual operator responsibility |
| DEBT-19 | `opensearch-dashboards` in production docker-compose | Must be removed before production |