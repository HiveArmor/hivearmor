# Changelog

All notable changes to HiveArmor are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Threat Hunt Workbench**: interactive query builder for ad-hoc OpenSearch queries across `_v3_hive_*` indices with saved-search library and scheduled execution
- **AI-assisted alert triage**: SOC AI plugin integration surfacing automated severity re-scoring and recommended response actions directly in the incident timeline
- **MITRE ATT&CK Navigator overlay**: map correlation rule hits to ATT&CK techniques and tactics; export coverage heatmap as SVG or JSON
- **Multi-tenant workspace isolation**: organisation-level data partitioning for MSSP deployments; per-tenant RBAC with cross-tenant read grants for shared SOC analyst pools
- **Enrichment pipeline v2**: pluggable enrichment chain (geolocation, threat intel, asset context, vulnerability data) with per-source TTL caching
- **Scheduled compliance reports**: automated NIST CSF, SOC 2, PCI-DSS, and ISO 27001 gap reports delivered by email on configurable cadence
- **Passkey / WebAuthn support**: FIDO2 hardware token and platform authenticator enrollment alongside existing TOTP MFA

### Changed
- Event Processor CEL expression evaluator upgraded; time-window correlation now supports sliding and tumbling windows up to 24 hours
- TanStack Query v5 cache invalidation strategy tightened to reduce stale-data windows on the Alerts and Incident dashboards
- OpenSearch ISM policy (`hivearmor_ism_policy`) warm-phase transition extended from 7 to 14 days; cold phase added at 60 days
- Agent auto-update check interval reduced from 60 s to 30 s; update packages validated with SHA-256 + Ed25519 signature before apply

### Fixed
- JWT signing key was regenerated on every backend restart, invalidating all active sessions (DEBT-14); key is now persisted to an encrypted database column and reloaded on startup
- CORS configuration no longer falls back to wildcard `*` when `APP_ALLOWED_ORIGINS` is unset; startup now fails fast with a descriptive error
- Rate limiting applied to `/api/authenticate` to mitigate brute-force credential stuffing

### Security
- `X-HiveArmor-error` response header redacted on 4xx/5xx responses in production mode to prevent internal stack-trace leakage
- Audit trail extended to record source IP and User-Agent for every login, logout, agent remote command, and API key usage event
- TLS 1.3 enforced on all gRPC connections between Agent, AgentManager, and EventProcessor

---

## [11.0.0] — 2025-11-18

LTS release. Supported until November 2030.

### Added
- **Incident Management v2**: full incident lifecycle (New → Investigating → Contained → Resolved → Closed) with SLA timers, assignee tracking, evidence attachments, and a complete audit timeline
- **SOAR response playbooks**: YAML-defined automated response actions (block IP, isolate host, quarantine file, enrich alert) triggered by correlation rule matches; dry-run mode available for safe testing
- **RBAC v2**: five built-in roles (Super Admin, Admin, Analyst, Auditor, Read-Only); custom roles with per-resource permission sets; assignment scoped to organisation or individual integration
- **17 correlation plugins** (alerts, aws, azure, bitdefender, config, crowdstrike, events, feeds, gcp, inputs, o365, sophos, stats, soc-ai, geolocation, as400, web-pdf) shipped as `com.hivearmor.<name>.plugin` binaries loaded dynamically by EventProcessor
- **Threat intelligence enrichment**: real-time IP, domain, and file-hash lookups against configurable threat-feed providers; enrichment fields stored alongside alert records in OpenSearch
- **Compliance dashboard**: pre-built panels for NIST CSF, SOC 2 Type II, PCI-DSS v4, HIPAA, and ISO 27001 with evidence bundle export
- **HiveArmor Collector** (`hivearmor-collector`): unified syslog/UDP/TCP ingest daemon for network devices, firewalls, and applications
- **Agent fleet management**: AgentManager gRPC service (ports 9000/9001) with real-time agent health monitoring, version matrix, remote command dispatch, and one-click rollback
- **Index lifecycle management**: OpenSearch ISM policy `hivearmor_ism_policy` auto-tiers `_v3_hive_*-YYYY.MM.DD` indices through hot → warm → delete phases
- **Snapshot and restore**: OpenSearch snapshot repository `hivearmor_backups`; configurable daily snapshots with retention policy

### Changed
- Frontend rebuilt on Next.js 14 + React 18 + TypeScript with App Router; all protected pages grouped under `(app)/` with JWT auth guard in layout
- Alert correlation engine migrated from per-plugin polling to a push-based internal event bus; median end-to-end correlation latency reduced by 68%
- PostgreSQL schema managed exclusively through Liquibase changesets; no DDL is executed outside tracked migrations
- Backend unified on Spring Boot 3.3 with Spring Security 6 `SecurityFilterChain` bean pattern; every endpoint requires a `@PreAuthorize` annotation or an explicit public-path entry in `SecurityConfiguration`

### Fixed
- Alert deduplication window was not applied consistently across plugin boundaries; dedup key is now computed in EventProcessor before any index write
- Large log bursts (>10 000 events/s) caused back-pressure spikes in the ingest pipeline; EventProcessor now applies per-source rate limiting with configurable burst allowance
- Dashboard date-range picker did not honour browser timezone when building OpenSearch range queries

---

## [10.5.0] — 2025-06-02

### Added
- **MFA / TOTP enforcement**: per-user and organisation-wide MFA enforcement policy; backup codes generated at enrollment
- **API key management**: long-lived service-account API keys with scoped permissions, revocation, and last-used tracking in the audit log
- **Geolocation enrichment plugin**: MaxMind GeoLite2 database integration appending city, country, ASN, and ISP fields to every ingested log event
- **Dark mode**: system-preference-aware theme; all dashboard panels, charts, and alert tables support light/dark rendering

### Changed
- Log enrichment decoupled from the ingest hot path and executed asynchronously; sustained ingest throughput increased by 40%
- Alert stream Zustand store now persists acknowledged state across page reloads via `sessionStorage`

### Fixed
- Credential value was exposed in the URL of a credential-check endpoint (SEC-01); endpoint converted to `POST` with a JSON request body
- OpenSearch snapshot repository credentials were emitted at `INFO` level on startup; log level reduced to `DEBUG` and credential value masked with `***`

---

## [10.0.0] — 2024-11-04

### Added
- **JWT authentication**: stateless Bearer-token authentication issued by `/api/authenticate`; token persisted client-side under the key `hivearmor_auth_token`; all browser requests proxied through Next.js `app/api/[...path]/route.ts` to the backend at `BACKEND_URL`
- **Role-based access control (RBAC v1)**: Admin and Analyst roles enforced via Spring Security method-level `@PreAuthorize` guards on all REST endpoints
- **Alert correlation engine**: Go-based EventProcessor with YAML rule definitions, CEL expression support, and multi-source time-window correlation; alert records written to `_v3_hive_alerts-YYYY.MM.DD`
- **Log ingestion pipeline**: structured parsing with per-source-type YAML filter definitions; normalised events indexed to `_v3_hive_<type>-YYYY.MM.DD` in OpenSearch
- **Endpoint agent**: Go agent for Windows, Linux, and macOS; installs as system service (`HiveArmorAgent` / `HiveArmorUpdater` on Windows); forwards log data to AgentManager over gRPC TLS 1.3
- **Alert management UI**: list, filter, acknowledge, escalate, and export alerts; bulk status update; saved filter presets
- **User management**: local user accounts with configurable password policy; LDAP/AD directory sync; session audit log
- **Installer binary**: Go-based first-run setup tool; handles Docker installation, TLS certificate generation, PostgreSQL initialisation (`hivearmor` database), and service startup on Ubuntu 22.04/24.04, Debian 12, and RHEL/Rocky/AlmaLinux 8/9
- **Instance management integration**: HiveArmor instances register with the CM server (`cm.onlyhacker.org`) for licence validation, version tracking, and remote update delivery

### Security
- All backend endpoints protected by Spring Security; public paths explicitly enumerated in `SecurityConfiguration`
- Audit trail records every alert status change, incident status change, user login/logout, and API key event

---

## [1.0.0] — 2023-08-14

Initial public release of HiveArmor — Hyper-scale Incident Visibility Engine.

### Added
- **Core SIEM platform**: centralised log collection, normalisation, storage, and full-text search backed by OpenSearch; immutable index pattern `_v3_hive_<type>-YYYY.MM.DD`
- **Event Processor**: Go-based correlation engine with YAML rule and filter definitions, CEL expression predicates, time-window grouping, and alert generation pipeline
- **HiveArmor Agent**: lightweight Go endpoint agent for Windows and Linux; gRPC transport to AgentManager; automatic service installation
- **AgentManager**: gRPC agent registry service (ports 9000/9001) storing agent state in a dedicated PostgreSQL database (`hivearmor_agents`) via GORM auto-migrate
- **Backend REST API**: Java 17 + Spring Boot 3 REST API at `/api/ha-*`; PostgreSQL (`hivearmor` database) managed by Liquibase; all OpenSearch queries issued through `SearchUtil` DSL builders
- **Frontend**: React/TypeScript single-page application with JWT authentication; alert list view; operations dashboard
- **AWS integration**: CloudTrail and CloudWatch log ingestion via the `aws` correlation plugin
- **Azure integration**: Activity Log and Microsoft Defender for Cloud event ingestion via the `azure` plugin
- **GCP integration**: Cloud Audit Logs ingestion via the `gcp` plugin
- **Microsoft 365 integration**: Unified Audit Log ingestion via the `o365` plugin
- **CrowdStrike Falcon integration**: telemetry ingest via the `crowdstrike` plugin
- **Bitdefender GravityZone integration**: security event ingest via the `bitdefender` plugin
- **Sophos Central integration**: endpoint and network event ingest via the `sophos` plugin
- **Threat feed integration**: configurable IOC feed consumption via the `feeds` plugin; indicators matched against ingested events at correlation time
- **Docker Compose deployment**: production-ready compose manifest for self-hosted deployments; all images published to `ghcr.io/hivearmor/`
- **Go installer**: automated first-run setup binary for supported Linux distributions

### Notes
- The OpenSearch index pattern `_v3_hive_<type>-YYYY.MM.DD` is version-locked and will not change in future releases
- All Go module paths follow the `github.com/hivearmor/...` namespace
- Community (free) and Enterprise licence tiers available; contact [support@hivearmor.io](mailto:support@hivearmor.io) or visit [https://docs.hivearmor.io](https://docs.hivearmor.io)

---

[Unreleased]: https://github.com/hivearmor/hivearmor/compare/v11.0.0...HEAD
[11.0.0]: https://github.com/hivearmor/hivearmor/compare/v10.5.0...v11.0.0
[10.5.0]: https://github.com/hivearmor/hivearmor/compare/v10.0.0...v10.5.0
[10.0.0]: https://github.com/hivearmor/hivearmor/compare/v1.0.0...v10.0.0
[1.0.0]: https://github.com/hivearmor/hivearmor/releases/tag/v1.0.0