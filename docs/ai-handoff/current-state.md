# Current product state

Snapshot time: **2026-08-23 10:44:00 IST (UTC+05:30)**
Baseline inspected: `staging/siem-mvp` at `be1845f61f36960f04733291b1b19822790282c5`
Worktree: dirty before these frontend slices. `.claude/settings.local.json`, `deploy/staging/run-windows-live-ingest.ps1`, hunt backend edits in `HaHuntService.java`, `HuntEventDetailService.java` and `HuntFieldRegistry.java`, their new source-includes test, and hunt validation helpers are unrelated user/Cursor-owned changes. Compliance, Dashboard Operations, Reporting Operations and Pipeline Operations frontend/handoff changes coexist in the same worktree; preserve every unrelated path and do not attribute its behavior to these slices.

## Repository and design constraints

- Active frontend: React 18, TypeScript 5, Vite, ECharts, Monaco and AG Grid under `frontend-v3/`.
- Do not add dependencies or change the stack without explicit permission.
- Preserve the 50px masthead, compact auto-collapsing navigation, sticky operational controls, shared thin scrollbars and shared status dock.
- Component colors must use finalized HiveCarbon Hybrid semantic tokens. Support dark and light modes.
- Development fixture imports must be dynamically isolated behind `VITE_USE_FOUNDATION_FIXTURES=true` and must not enter production bundles or storage.
- Canonical OpenSearch index pattern remains version-locked to `_v3_hive_<type>-YYYY.MM.DD` per `AGENTS.md`; do not rename without a migration.

Mandatory implementation references:

- `.agents/skills/frontend-design/SKILL.md`
- `.agents/skills/ui-ux-enterprise/SKILL.md`
- `docs/ui-ux/hivearmor-frontend-redesign-roadmap.md`
- `docs/ui-ux/hivearmor-colour-system.md`
- `docs/ui-ux/hivearmor-design-foundation.md`
- `docs/ui-ux/hivearmor-shell-density-standard.md`
- `docs/frontend-backend-contract-register.md`

## Phase status

| Phase | Scope | Current status |
|---|---|---|
| 1–4 | Foundation, mission control, incidents, triage, alert investigation | Redesign recorded as complete in the roadmap; full-stack production readiness still depends on route-specific live evidence. |
| 5 | Search, hunt, entities, constellation | UI substantially redesigned; search/entity backend contracts and real-backend verification exist in mixed states. Re-audit before claiming production ready. |
| 6 | Detection engineering | Rule inventory/editor/test workflows redesigned; backend readiness is mixed and must be checked against the contract register. |
| 7 | Response automation | Builder, library/detail, activity and authority/governance workflows redesigned. New SOAR/governance contracts are not all implemented. |
| 8 | Posture and exposure | Assets has a canonical partial backend slice. Identities, Active Directory and exposure UI are implemented with explicit missing/partial states. Vulnerability Operations and CIS Benchmark Posture UIs are implemented and zero-row live-verified against their existing partial APIs. Compliance Assurance is `UI IMPLEMENTED`, `CONTRACT RECORDED` and `FIXTURE-BROWSER VERIFIED` as of 2026-08-21 over the partial aggregate posture APIs; canonical tenant-scoped assessment/control/evidence workflows remain `CMP-001`–`CMP-009`. Phase 8 is not `PRODUCTION READY`. |
| 9 | Operations and administration | Dashboard, Reporting, Pipeline & Ingestion, Integration & Notification, Identity & Tenancy, and Governance & Platform Settings are `UI IMPLEMENTED`, `CONTRACT RECORDED` and `FIXTURE-BROWSER VERIFIED`. Production remains blocked by the route-family contracts, including `GOV-001`–`GOV-010`. Orphan operational workflows are next. |

## Production-readiness warning

The presence of a frontend route, fixture view or API controller is not evidence of an end-to-end production feature. Before marking a route ready, verify:

- tenant isolation and field-level authorization;
- bounded projection, deterministic pagination and request cancellation;
- permission, empty, stale, partial-source and dependency-failure states;
- server-authoritative counts, timestamps, actions and audit events;
- raw-log ingestion through normalization/correlation into the displayed record;
- migration/deprecation behavior for superseded endpoints;
- relevant unit/integration/E2E tests, full frontend suite and production build;
- observability, payload and latency evidence for the expected data volume.

## Current active slice

Orphan operational workflows are the next planned slice: first reconcile UEBA/risk/timeline ownership, endpoint timeline/quarantine/FIM/policies and threat-intelligence routes against the navigation and checked-in backend, then execute one bounded route family at a time. Governance & Platform Settings is now complete as a frontend slice across `/admin/audit`, `/admin/retention`, `/admin/settings` and `/settings/system`; production reads only the current Admin audit, retention and masked settings projections, while unsupported change/export/legal-hold/API-lifecycle mutations fail closed. Its backend requirements are `GOV-001`–`GOV-010`; legacy `/ha-settings` was not falsely marked deprecated.

`PILOT-00` is `CODE COMPLETE`: the producer and consumer implement and test `ha.raw-event.v1`; broker acknowledgement is `acks=all`; keys and headers carry tenant/event/schema/producer identity; legacy unwrapped records are validated and counted under a dated compatibility policy; and the topology, schema, ownership/deprecation map and pilot threat model are checked in. This is not live broker acceptance evidence.

`PILOT-01` Linux packaged systemd is `LIVE VERIFIED` as of **2026-08-19 18:45:08 IST** on staging (install/rotate/revoke, agent id 8). Packaged-host HTTP role matrix is `LIVE VERIFIED` as of **2026-08-19 20:00:00 IST** (Admin 200, SOC Manager 200, Analyst 403, SOC Manager tenant 3812 403). Enrollment-audit retention/export is `LIVE VERIFIED` as of **2026-08-19 20:35:00 IST** (NDJSON export 25 rows, append-only DELETE rejected, `ENROLLMENT_AUDIT` policy immutable, table dump). Windows SCM packaged-host (ACC-02) is `LIVE VERIFIED` as of **2026-08-21 14:45:00 IST** on Windows Server 2019 (`EC2AMAZ-8F0Q7DL`, agent **17**, rotate-credential **exit 0** without harness recovery after STOP_PENDING/1056 fix; Admin/SOC/Analyst role matrix 200/200/403 + cross-tenant 403; skip-cert yes). Brand-new Linux VM restore remains open. This is not `PRODUCTION READY`.

Hunt evidence promotion (`HNT-007`) is `LIVE VERIFIED` as of **2026-08-21 15:25:00 IST** for snapshot-bound `create_evidence` (including `permissionVersion`, `eventOutcomes`) onto incident 135, gated escalate/investigation (`approvalRequired=true`; missing `approvalId` → 400), and the SOC Manager approval path (`POST /ha-hunts/approvals` → SoD reject → `soc.manager` approve → execute with `approvalId` → consumed replay rejected). Preview without `searchId` is 400; unknown snapshot and events outside the PIT are 404. This is not `PRODUCTION READY`.

`PILOT-08` / SIEM-009 backup path is `LIVE VERIFIED` as of **2026-08-21 13:25:00 IST** for throwaway Postgres restore, OpenSearch snapshot+renamed restore, **named Redpanda volume**, **off-OpenSearch-volume** dump/snapshot copy on the same VM, and ISM `ha-hot-retention` (14d for `v3-hive-*`). Admin pipeline-signals board + hourly soak timer are `LIVE VERIFIED` as of **2026-08-21 15:00:00 IST**; soak pack collector + Admin `soakHistory` are `LIVE VERIFIED` as of **2026-08-21 15:40:00 IST** with pack status **`PARTIAL_SOAK`** (~0.6h span — 24h COMPLETE pending wall-clock ~**2026-08-22 09:25 UTC**). Object-store Object Lock drill (staging MinIO **COMPLIANCE**) is `LIVE VERIFIED` as of **2026-08-21 15:50:00 IST** (not commercial AWS Glacier WORM). New-VM restore deferred post production-ready. This is not `PRODUCTION READY`.

CIS catalog / EPSS / signed ingest is `LIVE VERIFIED` as of **2026-08-19 21:45:00 IST** on staging. Legacy INTERNAL_KEY ingest is **disabled** as of **2026-08-21 13:50:00 IST** (`ALLOW_LEGACY_TELEMETRY_INTERNAL_KEY=false`; signed telemetry-once accepted; INTERNAL_KEY-only **401**). This is not `PRODUCTION READY`.

`PILOT-02` is `LIVE VERIFIED` as of **2026-08-18 19:55:01 IST** for enrolled-agent ProcessLog identity ingest against rebuilt local-dev images: a valid send was acknowledged, forged tenant `999999` was denied, an oversized payload was rejected, connector burst returned `ResourceExhausted` with retry-after, a revoked credential was denied after authorization projection, and the enrollment token was absent from worker logs. The accepted event id was present in OpenSearch. Collector tenant binding, cloud-plugin identity and device mTLS remain open. This is not `PRODUCTION READY`.

`PILOT-03` is `LIVE VERIFIED` as of **2026-08-18 22:14:41 IST** for local-dev broker-outage and agent SQLite spool: enrolled ProcessLog was not acked while Redpanda was stopped, the unprocessed row remained (`LogsDropped=0`, no OpenSearch document), and after restore the same event id was delivered to `v3-hive-log-acme-2026.08.18`. Quarantine/restart retention from 19:55:01 IST still stands. This is not a packaged systemd agent, not `PRODUCTION READY`. `hivearmor-collector`/`as400` still drop on full memory queues. Encrypted spool contents and a write-failure retry budget remain open.

Wave 1 staging-minimum (`PILOT-04`–`PILOT-07` plus operational API/UI alignment) is `CODE COMPLETE` as of **2026-08-18 20:40:00 IST** on branch `staging/siem-mvp`. Crash-point persist tests, pilot CEL pack tests, TLS/default-secret unit tests, frontend DTO/search tests and `deploy/staging` compose config passed. Staging Compose now includes `POSTGRESQL_HOST=postgres` for tenant-prefix writes. No staging VM was provided, so this is **`STAGING CANDIDATE` artifacts**, not live ACC-01–14 and not `PRODUCTION READY`. Linux systemd observed telemetry (`hivearmor-telemetry.service` + `/etc/hivearmor/agent.env`) is `LIVE VERIFIED` on the staging VM as of **2026-08-19 18:28:18 IST** for pack `ha-linux-observed-ssh` and SBOM ingest. Packaged `HiveArmorAgent` PILOT-01 Linux is live-verified; Windows SCM packaged-host (ACC-02) is live-verified as of **2026-08-21 13:00:00 IST** (Admin-only, agent 13). Wave 2 live staging install ACC subset was previously recorded. This is not `PRODUCTION READY`.
