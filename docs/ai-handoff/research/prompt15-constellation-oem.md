# Prompt 15 — Threat Constellation (`/constellation`) OEM research

Retrieved: **2026-08-29**

Purpose: decide Threat Constellation IA so entity/activity **relationship graphs** for investigation are clearly distinct from `/entities` (inventory + dossier), `/ueba/risk` (behavioral risk overview), `/intelligence` (threat intel + assistive SOC AI), `/investigations` (evidence sessions), and `/search` (ad-hoc hunt). Paraphrase only. Product claim stays **STAGING CANDIDATE**.

Prior: Prompt 12 Entities; Prompt 13 Intelligence; Prompt 14 UEBA Risk.

Base tip: `main` @ `a9641b4` includes Prompt 14 UEBA Risk merge — `based_on_main_includes_pr101: yes` (UEBA merged as feat commit).

Confirmed APIs for this slice (verified in backend source — use **ha-constellation**, not ha-graph dual-call):
- `POST /api/ha-constellation/explore` — bounded snapshot (CON-001)
- `POST /api/ha-constellation/explore/{snapshotId}/expand` — node expansion (CON-002)
- `GET /api/ha-constellation/relationships/{relationshipId}` — edge evidence (CON-003)
- `GET /api/ha-constellation/stream?snapshot=` — SSE snapshot updates (CON-005)

Legacy `GET /api/ha-graph/nodes|edges` (Sprint 43 INV-06) exists but is superseded by ha-constellation explore contract; UI must not call both.

---

## A1. Commercial SIEM (≥3)

### Splunk Enterprise Security — Investigation Workbench / UBA graph

| Item | Detail |
|---|---|
| Sources | [Investigation Workbench](https://help.splunk.com/en/splunk-enterprise-security-8/investigate-and-respond/8.6/investigate-and-respond/investigation-workbench), [UBA entity graph](https://help.splunk.com/en/splunk-enterprise-security-8/administer/8.6/user-and-entity-behavior-analytics/user-and-entity-behavior-analytics-ueba-overview-in-splunk-enterprise-security) |
| Access date | **2026-08-29** |
| Graph vs list | Investigation Workbench pairs a **graph canvas** with entity/artifact lists; UBA shows entity relationships as investigatable links, not a decorative network wallpaper. |
| Snapshot/freshness | Workbench sessions are bounded snapshots; analysts refresh when underlying notable events change. |
| Expand node | Pivot from a selected entity to related notables, assets, and identities with explicit hop limits. |
| Relationship evidence | Edge selection opens supporting events/alerts — graph edge is a pointer, not proof. |
| Partial failure | Empty graph when no correlated data; panels say so rather than fabricating density. |

### Elastic Security — Analyzer / entity analytics relationships

| Item | Detail |
|---|---|
| Sources | [Analyze](https://www.elastic.co/docs/solutions/security/analyze), [Entity analytics](https://www.elastic.co/docs/solutions/security/advanced-entity-analytics) |
| Access date | **2026-08-29** |
| Graph vs list | Analyzer graph is primary for relationship exploration; adjacent tables list entities/alerts for keyboard access. |
| Snapshot/freshness | Graph reflects current query scope; time range and filters bound the projection. |
| Expand node | Click entity → expand related alerts, cases, and observables within authorized indices. |
| Relationship evidence | Relationship inspector shows linked alerts/events; confidence comes from underlying documents. |
| Partial failure | Honest empty when ML/entity analytics not enabled or indices empty. |

### Microsoft Sentinel — Investigation graph / entity graph

| Item | Detail |
|---|---|
| Sources | [Investigate incidents with the investigation graph](https://learn.microsoft.com/en-us/azure/sentinel/investigate-cases), [Entity behavior analytics](https://learn.microsoft.com/en-us/azure/sentinel/identify-threats-with-entity-behavior-analytics) |
| Access date | **2026-08-29** |
| Graph vs list | Investigation graph is the hero workspace (~60%+ viewport); entity list rail supports selection and keyboard navigation. |
| Snapshot/freshness | Graph built from incident/bookmark scope; refresh when new entities enter scope. |
| Expand node | Expand related entities/alerts within hop budget; attack-path claims only when backend returns paths. |
| Relationship evidence | Edge click → timeline of supporting alerts and bookmarks. |
| Partial failure | Partial graph banner when some entity types fail to resolve; no fake Neo4j attack paths. |

### Optional — Maltego-style link analysis

| Item | Detail |
|---|---|
| Borrow | Seed-entity exploration, expand-one-hop-at-a-time, evidence panel per link. |
| Avoid | OSINT-transform theater, animated “world view”, decorative link density without documents. |

---

## A2. Open-source / open-core (≥3)

### OpenCTI — Knowledge graph / relationships

| Item | Detail |
|---|---|
| Sources | [OpenCTI documentation](https://docs.opencti.io/latest/usage/overview/) |
| Access date | **2026-08-29** |
| Borrow | STIX relationship objects with typed edges; graph is evidence-backed knowledge, not decoration. |
| Avoid | Over-dense graphs without truncation honesty. |

### TheHive — Observables graph

| Item | Detail |
|---|---|
| Sources | [TheHive observables](https://docs.strangebee.com/thehive/) |
| Access date | **2026-08-29** |
| Borrow | Observable-to-case pivots; relationship list mirrors graph selection. |
| Avoid | Conflating case ownership with relationship exploration. |

### BloodHound / graph hunt tools (pattern only)

| Item | Detail |
|---|---|
| Borrow | Hop-limited expansion, path honesty (“authorized projection only”). |
| Avoid | AD/BloodHound integration claims without backend ticket; no fake attack-path labels. |

### Gephi / generic graph UX

| Item | Detail |
|---|---|
| Borrow | Force layout with zoom/fit controls; legend for node size/color semantics. |
| Avoid | Neon glow, glassmorphism, animated world maps, physics toys that obscure data density limits. |

---

## A3. Implication table

| OEM pattern | HiveArmor implication |
|---|---|
| Graph ≠ entity inventory ≠ UEBA dashboard | Job copy: **relationship graph for investigation** — evidence-backed entity/activity links. Cross-link Entities · Investigations · Search · Intelligence · Mission Control. |
| Graph + rail ≥50% viewport | Remove stacked KPI chrome; workspace (rail + canvas + optional detail drawer) owns vertical space. |
| Snapshot-bound explore | POST explore → snapshotId; SSE stream for pending changes; refresh on expiry. |
| Expand honesty | Expand only when snapshot valid; surface 404/expired/errors inline. |
| Edge evidence drawer | GET relationships/{id}; loading/error/retry; edge summary ≠ proof until evidence loads. |
| Partial failure banner | Show backend partialFailures[] when present; never silent drop. |
| Empty staging honesty | Entity/relationship index often empty on staging — banner + empty state copy; STAGING CANDIDATE badge. |
| Role gates | Analyst \| SOC Manager \| Platform Administrator (ALERT_QUEUE_AUTH). |
| No fake nodes | Fixture mode dev-only, clearly labeled; production build aliases fixtures out. |

---

## A4. Decision: **RESTRUCTURE** — **KEEP** route

| Surface | Decision | Rationale |
|---|---|---|
| `/constellation` ThreatConstellationPage | **RESTRUCTURE** | Core graph/rail/evidence/SSE already wired to ha-constellation; needs job sentence, meta links, reduced header chrome, staging honesty banner, cross-links. |
| `constellation.service.ts` | **KEEP** | Already uses `/ha-constellation/explore|expand|relationships`; do not add ha-graph dual-fetch. |
| Entities / UEBA / Intelligence | **KEEP separate** | Do not re-litigate Prompts 12–14. |
| Neo4j live integration | **OUT OF SCOPE** | No backend ticket; no attack-path claims. |

**SPLIT:** None — single route `/constellation` remains the relationship graph surface.

---

## Backend verification note

| Endpoint | Resource | Auth |
|---|---|---|
| POST `/api/ha-constellation/explore` | `HaConstellationGraphResource.explore` | ALERT_QUEUE_AUTH |
| POST `/api/ha-constellation/explore/{id}/expand` | `HaConstellationGraphResource.expand` | ALERT_QUEUE_AUTH |
| GET `/api/ha-constellation/relationships/{id}` | `HaConstellationGraphResource.getRelationshipEvidence` | ALERT_QUEUE_AUTH |
| GET `/api/ha-constellation/stream` | `HaConstellationGraphResource.stream` | ALERT_QUEUE_AUTH |
| GET `/api/ha-graph/nodes\|edges` | `HaGraphResource` (legacy) | ROLE_ADMIN\|ROLE_USER — **not used by v3 UI** |
