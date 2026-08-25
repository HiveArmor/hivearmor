# Orphan operational workflows — route inventory

Retrieved / authored: **2026-08-25**  
Status: **STAGING CANDIDATE** inventory + one bounded threat-intel honesty slice. Not `PRODUCTION READY`.  
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

Bounded improvement shipped in this PR:

1. Align `/intelligence` page authority with AuthGuard + backend lookup/IOC roles (include SOC Manager).
2. Wire `GET /api/ha-threat-intel/stats` as a compact read on `/intelligence`.
3. Keep feed enable/sync Admin-only; show an explicit read-only note for non-admins.
4. Replace Admin access-denied copy that exposed `ROLE_ADMIN` with a human permission label.
5. Record `TI-001`–`TI-004` contract gaps. Do not adopt unsecured `/api/v1/threat-intel`.

## Inventory matrix

Gap severity: **H** = broken or unsafe operator expectation; **M** = partial/honest-but-incomplete; **L** = polish / missing deep-link only.

| URL / path | Nav | FE status | BE status | Gap | Severity |
|---|---|---|---|---|---|
| `/intelligence` | Hive Intelligence (Analyst, SOC Manager, Admin) | `UI IMPLEMENTED` hub: feeds, IOC browser, lookup; Admin-gated toggle/sync | Secured `GET/PUT/POST /api/ha-threat-intel/feeds*`, `GET /iocs`, `POST /lookup`, `GET /stats` | Page previously omitted SOC Manager from in-page gate; stats unread on hub; feed list PreAuthorize is Admin\|User (relies on ROLE_USER co-assignment) | **H→M** (honesty fix this slice) |
| `/admin/threat-intel` | Hidden specialized Admin (comment in nav) | `UI IMPLEMENTED` TAXII/MISP CRUD + stats | Secured Admin TAXII/MISP CRUD + sync; stats Admin\|Analyst\|User | Access copy leaked `ROLE_ADMIN`; no nav entry (discoverability) | **M** |
| `/api/v1/threat-intel/*` | None | Not used by frontend-v3 service | Legacy controller **without** `@PreAuthorize` on inspected methods | Must not be wired; migration/deprecation not complete | **H** (keep fail-closed / unused) |
| `/ueba/risk` | UEBA Risk (Analyst, Admin) | `UI IMPLEMENTED` risk table + drawer embeds entity timeline | `GET /api/ha-ueba/*` exists | `@PreAuthorize` uses `'ANALYST','ADMIN'` **without** `ROLE_` prefix — likely always deny under Spring | **H** |
| `/ueba/entity-timeline` | Constant only; **no router entry** | Page component exists; used inside risk drawer | `GET /api/ha-ueba/entity-timeline` | Orphan deep-link constant; no standalone route | **L** |
| `/edr/timeline/:agentId` | Via Endpoints list | `UI IMPLEMENTED` | `GET /api/ha-edr/timeline`, `/process-tree` (Admin\|User) | No top-level nav; agent-scoped only | **M** |
| `/edr/endpoints` | Endpoints | `UI IMPLEMENTED` agent list → timeline | `GET /api/agent-manager/agents` | Entry point only; not a full EDR fleet ops surface | **M** |
| `/edr/quarantine` | Alias of quarantine page | Same as `/response/quarantine` | `GET/PATCH/POST /api/ha-edr/quarantine*` (Analyst\|Admin) | Duplicate path; nav prefers `/response/quarantine` | **L** |
| `/response/quarantine` | Quarantine & Containment (Analyst, SOC Manager, Admin) | `UI IMPLEMENTED` file inventory + containment tab; restore/delete mutations live | File quarantine secured; host isolation inventory gaps per `RESP-021`; **SOC Manager not on BE PreAuthorize** | Nav allows SOC Manager; BE list/mutate Analyst\|Admin only → likely 403 | **H** |
| `/edr/fim` | File Integrity (open roles `[]`) | `UI IMPLEMENTED` summary dashboard | `GET /api/ha-edr/fim/summary` (Analyst\|Admin) | Nav open to all authenticated; BE Analyst\|Admin | **M** |
| `/edr/policies` | Agent Policies (Admin) | `UI IMPLEMENTED` CRUD + assign | `GET/POST/PUT/DELETE /api/ha-edr/policies*`, assign (Admin) | Agent delivery/enforcement evidence incomplete | **M** |
| Legacy `/api/edr/*` | None (SensorGrid uses subset) | Not adopted for quarantine UI | Separate `EdrResource` (rules/events/quarantine/isolation/kill) | Contract register: do not adopt unsecured/legacy duplicate for quarantine inventory | **H** (avoid) |

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
| Endpoint quarantine / timeline | `HaEdrResource` (`/api/ha-edr`) |
| FIM | `HaEdrFimResource` |
| Agent policies | `HaAgentPolicyResource` |
| Legacy EDR | `edr/EdrResource` (`/api/edr`) — isolation/kill used elsewhere; quarantine inventory not adopted |

## Contract notes recorded this slice

See `docs/frontend-backend-contract-register.md` entries **`TI-001`–`TI-004`** (timestamped). Summary:

| ID | Status | Intent |
|---|---|---|
| TI-001 | `PARTIAL` | Analyst hub role alignment + stats read; feed mutations remain Admin-only |
| TI-002 | `PARTIAL` | Feed list auth is Admin\|User; Analyst/SOC Manager depend on ROLE_USER co-assignment |
| TI-003 | `MISSING` | Unsecured `/api/v1/threat-intel` successor/cutover/deprecation headers |
| TI-004 | `PARTIAL` | TAXII/MISP admin exists; cursor/freshness/sync receipt/governance incomplete |

Related prior: **`RESP-021`** for quarantine (not reopened as missing).

## Explicit non-goals

- No redesign of all orphan routes in one PR.
- No UEBA PreAuthorize backend fix in this thin FE honesty slice (recorded as inventory **H** for a follow-on).
- No quarantine SOC Manager authorization redesign (prefer dedicated RESP follow-on).
- No `PRODUCTION READY`, `LIVE VERIFIED`, or full family consolidation claim.
