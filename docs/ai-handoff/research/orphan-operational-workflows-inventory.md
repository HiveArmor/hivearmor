# Orphan operational workflows — route inventory

Retrieved / authored: **2026-08-25**  
Status: **STAGING CANDIDATE** inventory + threat-intel honesty strip + TI-002–TI-004 depth slice (explicit feed-read roles, legacy v1 harden, thin sync receipt) + optional MISP `lastSyncStatus` / bounded Last Sync. Not `PRODUCTION READY`.  
Program: `docs/ai-handoff/remaining-page-program.md` item 8; active slice in `next-production-slice.md`.

This note inventories visible and hidden routes, navigation, frontend services and backend controllers for UEBA/risk/timeline, endpoint timeline/quarantine/FIM/policies, and threat intelligence. It selects **one** coherent family for a thin honesty improvement; it does not redesign all orphan routes.

## Primary-source findings (research gate)

### MISP — threat sharing and feed operations

- Sources: [MISP features](https://www.misp-project.org/features/) and the [MISP OpenAPI surface](https://www.misp-project.org/openapi/#tag/Attributes).
- Conclusion: production CTI platforms treat feeds/events as shareable, syncable corpora with correlation, sightings, export formats (including STIX), and role-aware collaboration. Operators need feed health, sync outcomes and indicator browse/lookup as first-class reads before feed mutation.
- HiveArmor implication: `/intelligence` and `/admin/threat-intel` should expose honest feed/IOC reads and withhold enable/sync/CRUD from roles the secured `/api/ha-threat-intel/*` controllers reject. Do not present an unsecured legacy `/api/v1/threat-intel` path as the operator contract.
- Limitation: MISP event/galaxy/sharing-group depth exceeds HiveArmor’s current feed + IOC browser; this inventory does not authorize cloning MISP UX.

### OpenCTI — hot vs cold knowledge and observations

- Source: [OpenCTI usage overview](https://docs.opencti.io/latest/usage/overview/).
- Conclusion: CTI workspaces separate frequently updated observations/indicators (“hot”) from encyclopedia context (“cold”), and entity pages expose overview, knowledge relationships, analyses and history rather than a single flat feed toggle.
- HiveArmor implication: keep analyst browse/lookup (`/intelligence`) distinct from Admin TAXII/MISP source administration (`/admin/threat-intel`). Aggregate stats belong on the analyst-facing surface as a read, not only on the Admin console.
- Limitation: OpenCTI’s knowledge graph and cases model is out of scope for this thin slice.

### OASIS STIX 2.1 — structured CTI exchange

- Source: [Introduction to STIX](https://oasis-open.github.io/cti-documentation/stix/intro) (OASIS CTI TC).
- Conclusion: STIX models indicators, observables, relationships and sightings as typed objects for machine exchange; TAXII is the common transport companion for feed sync.
- HiveArmor implication: TAXII/MISP admin surfaces and IOC lookup should preserve indicator identity, marking/TLP and confidence where the backend returns them, and must not invent STIX graph completeness the API does not provide.
- Limitation: STIX object completeness is not claimed; HiveArmor currently projects feed/IOC DTOs, not a full SDO/SCO graph.

### Refresh triggers

Refresh when MISP/OpenCTI operator workflows change materially, STIX/TAXII guidance updates, HiveArmor deploys a secured successor for `/api/v1/threat-intel`, or `TI-001`–`TI-004` status changes.

## Chosen family for this slice

**Threat intelligence operations** (`/intelligence`, `/admin/threat-intel`, `/api/ha-threat-intel/*`).

Rationale: secured backend reads and Admin mutations already exist; the analyst hub had a role mismatch with navigation/AuthGuard and did not surface the existing stats read. Endpoint quarantine was a close second (`RESP-021` already recorded) but SOC Manager nav vs `ROLE_ANALYST|ROLE_ADMIN` backend auth remains a larger authorization design question — deferred.

Bounded improvement shipped (inventory honesty + depth follow-on):

1. Align `/intelligence` page authority with AuthGuard + backend lookup/IOC roles (include SOC Manager).
2. Wire `GET /api/ha-threat-intel/stats` as a compact read on `/intelligence`.
3. Keep feed enable/sync Admin-only; show an explicit read-only note for non-admins.
4. Replace Admin access-denied copy that exposed `ROLE_ADMIN` with a human permission label.
5. Record `TI-001`–`TI-004` contract gaps. Do not adopt `/api/v1/threat-intel` from frontend-v3.
6. **Depth (2026-08-25):** TI-002 explicit Analyst/SOC Manager on feed list/get/stats; TI-003 `@PreAuthorize` on legacy v1 (no Deprecation headers); TI-004 `ThreatFeedSyncReceipt` on TAXII/MISP sync.

## Inventory matrix

Gap severity: **H** = broken or unsafe operator expectation; **M** = partial/honest-but-incomplete; **L** = polish / missing deep-link only.

| URL / path | Nav | FE status | BE status | Gap | Severity |
|---|---|---|---|---|---|
| `/intelligence` | Hive Intelligence (Analyst, SOC Manager, Admin) | `UI IMPLEMENTED` hub: feeds, IOC browser, lookup; Admin-gated toggle/sync | Secured `GET/PUT/POST /api/ha-threat-intel/feeds*`, `GET /iocs`, `POST /lookup`, `GET /stats` — feed list/get/stats include Analyst\|SOC Manager | Prior hub honesty + TI-002 explicit read authorities | **M** (depth remaining: IOC cursor/freshness) |
| `/admin/threat-intel` | Hidden specialized Admin (comment in nav) | `UI IMPLEMENTED` TAXII/MISP CRUD + stats; sync toasts show receipt id / failed reason | Secured Admin TAXII/MISP CRUD + sync receipt JSON; stats Admin\|User\|Analyst\|SOC Manager | No nav entry (discoverability); no durable sync ledger | **M** |
| `/api/v1/threat-intel/*` | None | Not used by frontend-v3 service | Legacy controller **hardened** with `@PreAuthorize` (same ROLE_ matrix as ha-threat-intel); no Deprecation headers yet | Cutover/deprecation headers incomplete | **M** (was H; auth closed, lifecycle open) |
| `/ueba/risk` | UEBA Risk (Analyst, SOC Manager, Platform Administrator) | `UI IMPLEMENTED` risk table + drawer embeds entity timeline | `GET /api/ha-ueba/*` secured with `ROLE_ANALYST\|ROLE_SOC_MANAGER\|ROLE_ADMIN` | **Addressed (STAGING CANDIDATE):** PreAuthorize now uses JWT `ROLE_` authorities + SOC Manager; nav/AuthGuard aligned | **H→closed** (auth honesty) |
| `/ueba/entity-timeline` | Deep-link (`?userId=`); missing userId → `/ueba/risk` | `UI IMPLEMENTED` standalone route wraps `EntityTimelinePage` | `GET /api/ha-ueba/entity-timeline` (same ROLE_ guard) | **Addressed:** router entry registered; constant no longer orphan | **L→closed** |
| `/edr/timeline/:agentId` | Via Endpoints list | `UI IMPLEMENTED` | `GET /api/ha-edr/timeline`, `/process-tree` (Admin\|Analyst\|SOC Manager) | No top-level nav; agent-scoped only | **M** (auth aligned) |
| `/edr/endpoints` | Endpoints | `UI IMPLEMENTED` agent list → timeline | `GET /api/agent-manager/agents` | Entry point only; not a full EDR fleet ops surface | **M** |
| `/edr/quarantine` | Alias of quarantine page | Same as `/response/quarantine` | `GET/PATCH/POST /api/ha-edr/quarantine*` (Analyst\|SOC Manager\|Admin) | Duplicate path; nav prefers `/response/quarantine` | **L** |
| `/response/quarantine` | Quarantine & Containment (Analyst, SOC Manager, Admin) | `UI IMPLEMENTED` file inventory + host isolation tab; page gate matches BE; restore/delete mutations live; list freshness banner | File quarantine secured; host isolation inventory via `GET /api/ha-edr/isolation`; thin `snapshotAt`/`asOf` on quarantine+isolation (STAGING CANDIDATE) | **SOC Manager auth + isolation inventory + list freshness closed**; remaining RESP-021 depth gaps open | **H→M** |
| `/edr/fim` | File Integrity (Analyst, SOC Manager, Admin) | `UI IMPLEMENTED` summary dashboard; page gate matches BE | `GET /api/ha-edr/fim/summary` (Analyst\|SOC Manager\|Admin) | Nav no longer open to all authenticated | **M→L** (auth aligned) |
| `/edr/policies` | Agent Policies (Analyst, SOC Manager, Admin) | `UI IMPLEMENTED` CRUD + assign; enforcement evidence drawer | `GET/POST/PUT/DELETE /api/ha-edr/policies*`, assign (Admin\|SOC Manager mutate; Analyst read); `GET .../enforcement` | **Addressed (STAGING CANDIDATE):** surfaces assignment + AgentPolicyStateDTO with unavailable/partial; host enforcement not verified | **M→partial honesty** |
| Legacy `/api/edr/*` | None (SensorGrid uses subset) | Not adopted for quarantine/isolation inventory UI | Separate `EdrResource` (rules/events/quarantine/isolation/kill) | Contract register: do not adopt legacy duplicate for quarantine/isolation inventory | **H** (avoid) |

### Frontend ownership map

| Family | Pages | Services / hooks |
|---|---|---|
| Threat intel | `pages/intelligence/HiveIntelligencePage.tsx`, `pages/admin/threat-intel/ThreatIntelAdminPage.tsx` | `services/threatIntel.service.ts` |
| UEBA | `pages/ueba/risk/*`, `pages/ueba/entity-timeline/*` | `services/ueba.service.ts`, hooks `useEntityTimeline` |
| Endpoint / quarantine / FIM / policies | `pages/edr/*` | `services/edrService.ts`, `agentPolicyService.ts`, hooks `useQuarantine`, `useFimSummary`, `useEdrTimeline` |

### Backend ownership map

| Family | Controllers |
|---|---|
| Threat intel (canonical) | `HaThreatIntelResource`, `HaThreatIntelStatsResource`, `HaTaxiiFeedResource`, `HaMispFeedResource` |
| Threat intel (legacy) | `threat_intel/ThreatIntelResource` (`/api/v1/threat-intel`) |
| UEBA | `ueba/HaUebaResource` |
| Endpoint quarantine / timeline / isolation | `HaEdrResource` (`/api/ha-edr`) |
| FIM | `HaEdrFimResource` |
| Agent policies | `HaAgentPolicyResource` |
| Legacy EDR | `edr/EdrResource` (`/api/edr`) — isolation/kill used elsewhere; quarantine/isolation inventory not adopted for Quarantine UI |

## Contract notes recorded this slice

See `docs/frontend-backend-contract-register.md` entries **`TI-001`–`TI-004`** (timestamped). Summary:

| ID | Status | Intent |
|---|---|---|
| TI-001 | `PARTIAL` | Analyst hub role alignment + stats read; feed mutations remain Admin-only |
| TI-002 | `PARTIAL` | Feed list/get + stats authorize Admin\|User\|Analyst\|SOC Manager explicitly; mutations Admin-only |
| TI-003 | `PARTIAL` | Legacy `/api/v1/threat-intel` hardened with `@PreAuthorize`; Deprecation/Sunset/Link deferred until cutover |
| TI-004 | `PARTIAL` | Thin `ThreatFeedSyncReceipt` on TAXII/MISP sync; MISP + TAXII persist `lastSyncStatus`; Admin Status + bounded Last Sync |

### Follow-on note (2026-08-25) — TI-004 MISP status / bounded lastSyncAt

STAGING CANDIDATE: `hive_misp_feed.last_sync_status` added; manual and scheduled MISP sync persist `OK`/`ERROR` with `lastSyncAt` (ROLE_ADMIN). Admin MISP table Status column reads the field; Last Sync uses `formatBoundedRelativeTime` (`>30d` cap). No Deprecation/Sunset on `/api/v1/threat-intel`. Durable ledger / IOC cursor / vendor live remain open.

Related prior: **`RESP-021`** for quarantine (not reopened as missing).

## Explicit non-goals

- No redesign of all orphan routes in one PR.
- UEBA PreAuthorize `ROLE_` fix + `/ueba/entity-timeline` router entry: **addressed** in follow-on `feat/p1-ueba-auth-fix` (STAGING CANDIDATE) — see matrix rows above.
- Quarantine SOC Manager authorization was deferred here and closed in the endpoint-auth follow-on (`feat/p1-endpoint-quarantine-auth`) — see matrix **H→M** above.
- Host isolation inventory read closed in `feat/p1-resp021-isolation-inventory` (STAGING CANDIDATE) via `GET /api/ha-edr/isolation`. Remaining `RESP-021` depth gaps stay open.
- No `PRODUCTION READY`, `LIVE VERIFIED`, or full family consolidation claim.

### Follow-on note (2026-08-25) — endpoint quarantine / FIM / timeline auth

STAGING CANDIDATE: `HaEdrResource` quarantine list/mutate now includes `ROLE_SOC_MANAGER`; timeline/process-tree accept Analyst + SOC Manager (keep Admin); FIM summary includes SOC Manager. Frontend quarantine/FIM page gates and FIM nav roles match. Legacy unsecured `/api/edr/*` was not adopted for quarantine inventory.

### Follow-on note (2026-08-25) — agent policies enforcement evidence

STAGING CANDIDATE: `GET /api/ha-edr/policies/{id}/enforcement` returns assignment plus existing `AgentPolicyStateDTO` fields with `evidenceAvailability` limited to `unavailable`|`partial`. Reads allow Analyst|SOC Manager|Admin; mutations Admin|SOC Manager. UI honesty banner and evidence drawer — no fictional host-enforcement green checks. Live agent apply/ack path and production verification remain open (`POL-001`–`POL-003`).

### Follow-on note (2026-08-25) — POL-003 apply/ack honesty

STAGING CANDIDATE after #48: when `AgentPolicyStateDTO` lacks `appliedVersion`/`lastAppliedAt`, API sets `evidenceAvailability=unavailable`, `applyAckPathAvailable=false`, and honesty notes say **apply/ack path unavailable** — never green “enforced on host”. UI surfaces lastCheckedAt/driftDetails and per-row apply/ack. Production agent INTERNAL_KEY / gRPC apply+ack and LIVE VERIFIED host enforcement remain open.
### Follow-on note (2026-08-25) — RESP-021 host isolation inventory

STAGING CANDIDATE: secured `GET /api/ha-edr/isolation` lists `hive_edr_isolation` with Analyst \| SOC Manager \| Admin PreAuthorize. Quarantine & Containment Endpoint isolation tab consumes that inventory with honest empty/error states. Legacy `/api/edr/isolation` not adopted. Governed release/preview, action history, and resumable delivery remain open.

### Follow-on note (2026-08-25) — RESP-021 list freshness honesty

STAGING CANDIDATE: `GET /api/ha-edr/quarantine` and `GET /api/ha-edr/isolation` return `snapshotAt` (server read time) and `asOf` (newest row timestamp on the page) in the JSON body, mirrored as `X-Snapshot-At` / `X-As-Of`. UI shows server freshness on Endpoint isolation (and files toolbar when present). Not cursor/PIT-bound. Enriched evidence, action history, governed release, and resumable delivery remain open.
