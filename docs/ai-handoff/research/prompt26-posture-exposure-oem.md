# Prompt 26 — Posture Exposure (`/posture/exposure`) OEM research

Retrieved: **2026-08-30**

Purpose: decide inventory-first exposure / attack-path hub IA so **attack paths, choke points, critical assets at risk, and remediation impact** stay distinct from `/posture/assets` (host inventory), `/posture/vulnerabilities` (vuln findings), `/constellation` (graph exploration), and `/posture/active-directory` (AD domain posture). Paraphrase only. Product claim stays **STAGING CANDIDATE**.

Prior: Prompt 25 `/posture/active-directory` — Wave B2 slice 3 (merged @ `dc1c721` via PR #112).

Base tip: `main` @ `dc1c721` includes Prompt 25 — `based_on_main_includes_pr25: yes`.

Confirmed APIs for this slice (verified in backend source — do **not** invent):

| Endpoint | Backend | UI use |
|---|---|---|
| Exposure graph APIs | **NOT IMPLEMENTED** | `fetchExposure` returns explicit `contractState: 'missing'` |

**Forbidden:** `/api/ha-exposure` or unverified exposure paths; fake attack paths, choke points, or exposure scores from asset inventory; Constellation graph as a substitute for the exposure contract.

**Staging probe label:** `EXPOSURE-CONTRACT-MISSING-STAGING` unless a verified backend resource is found in source.

---

## A1. Commercial exposure / attack-path (≥3)

### Tenable ExposureAI — Attack Path Analysis (Tenable One)

| Item | Detail |
|---|---|
| Sources | [Tenable Attack Path Analysis](https://docs.tenable.com/exposure-management/Content/attack-path/interact-with-asset-query-data.htm), [ExposureAI / AI Assistant](https://www.tenable.com/blog/introducing-tenable-ai-assistant-your-generative-ai-analyst-to-achieve-proactive-security), [2026 APA release notes](https://docs.tenable.com/release-notes/Content/exposure-management/2026.htm) |
| Access date | **2026-08-30** |
| Inventory-first | Top attack paths and techniques as filterable tables coordinated with a graph — practitioners work a list of paths, then open node/path detail. Choke-point and lifecycle status live in the same workspace, not a six-tile hero duplicating grid counts. |
| Progressive detail | Path summary, per-node context, security-control coverage, and mitigation guidance in a details panel — mirrors drawer tabs (overview · path · evidence · remediation). |
| Honesty | Missing graph coverage or incomplete asset sync is a visibility gap, not a zero-risk score. Do not fabricate path counts when the contract is absent. |
| Avoid | Treating Constellation (generic relationship graph) as Attack Path Analysis; hero KPI dashes when summary fields are null. |

### Microsoft Defender — Security Exposure Management (attack paths)

| Item | Detail |
|---|---|
| Sources | [Work with attack paths](https://learn.microsoft.com/en-us/security-exposure-management/work-attack-paths-overview), [Attack path management](https://learn.microsoft.com/en-us/azure/defender-for-cloud/how-to-manage-attack-path) |
| Access date | **2026-08-30** |
| Coordinated views | Overview insights, **attack-path list**, and **choke points** as first-class tabs — list is the operational surface; graph/map is progressive. Filters: risk, asset type, remediation status, time frame. |
| Choke points | Nodes where multiple paths converge; side panel + blast radius to show why a single fix removes many routes — keep choke points as a view tab, not a KPI tile. |
| Critical targets | Top targets and entry points as list/group-by dimensions — critical assets at risk belong on this hub, not on Assets inventory. |
| Avoid | Merging Exposure Management with asset inventory or vuln finding queues; showing exposure score tiles when the graph API is missing. |

### XM Cyber — Attack Graph Analysis

| Item | Detail |
|---|---|
| Sources | [XM Cyber Attack Graph Analysis](https://xmcyber.com/platform/attack-graph-analysis/), [Continuous Exposure Management](https://xmcyber.com/solution-briefs/continuous-exposure-management-platform/) |
| Access date | **2026-08-30** |
| Path vs inventory | Validated paths from external/hybrid exposure to business-critical assets — distinct from raw CVE lists. Non-viable paths are deprioritized rather than shown as zero risk. |
| Choke points & impact | Intersections of many paths to critical assets drive remediation priority (one control change, many paths). Remediation impact is a coordinated view, not a fabricated percentage on empty KPIs. |
| Honesty | Exploitability/reachability require an authoritative graph/digital-twin contract — generic host inventory cannot stand in. |
| Avoid | Deriving attack paths from `/ha-assets` or Constellation edges without an exposure contract. |

---

## A2. Open-source borrow patterns (≥3)

### BloodHound — Path queries

| Item | Detail |
|---|---|
| Sources | [BloodHound CE documentation](https://bloodhound.specterops.io/), Cypher-style shortest/all-paths queries against identity/host graphs |
| Access date | **2026-08-30** |
| Borrow | Path-centric inventory (query → bounded result rows → hop sequence in detail) with entry → target; choke-like high-degree nodes as a separate inspection. |
| Avoid | BloodHound canvas as the primary HiveArmor surface — graph exploration lives on `/constellation`; this page is attack-path analysis once a contract exists. |

### Microsoft Attack Surface Analyzer — Layout

| Item | Detail |
|---|---|
| Sources | [Attack Surface Analyzer](https://github.com/microsoft/AttackSurfaceAnalyzer), comparison/run result grids |
| Access date | **2026-08-30** |
| Borrow | Scan/run as a snapshot with filterable result inventory and explicit empty vs failed vs no-data states; dense grid as the workspace (≥50vh). |
| Avoid | ASA local-host comparison UX as product copy; do not imply a live attack-path engine from a host scan. |

### MITRE ATT&CK Navigator — Path / coverage view

| Item | Detail |
|---|---|
| Sources | [ATT&CK Navigator](https://mitre-attack.github.io/attack-navigator/), layer heatmaps and technique selection |
| Access date | **2026-08-30** |
| Borrow | Technique tags on path evidence as compact chips; coverage is a layer, not a fake exposure score. Pivot to hunt/search rather than embedding Navigator. |
| Avoid | ATT&CK heatmap as the Exposure page primary workspace — MITRE coverage lives on dedicated coverage surfaces. |

---

## A3. Decision table

| Surface | Decision | Rationale |
|---|---|---|
| `/posture/exposure` | **RESTRUCTURE** | Inventory-first exposure hub with Wave B2 honesty chrome; demote 6-tile `.exp-summary` hero; POSTURE eyebrow + STAGING CANDIDATE; meta cross-links via `Link` + `ROUTES`; **preserve missing-contract honesty** distinct from empty inventory and filter-empty. |
| `/posture/assets` | **KEEP** (sibling) | Host/asset posture inventory (Prompt 23) — meta link. |
| `/posture/vulnerabilities` | **KEEP** (sibling) | Vuln findings inventory (Prompt 27) — meta link. |
| `/constellation` | **KEEP** (sibling) | Graph exploration — meta/drawer pivot, **not** a substitute for exposure APIs. |
| `/posture/identities` | **KEEP** (sibling) | Identity inventory (Prompt 24) — meta link. |
| `/posture/active-directory` | **KEEP** (sibling) | AD domain posture (Prompt 25) — meta link. |

---

## Next recommended slice

**`/posture/vulnerabilities`** (Prompt 27) — Vulnerability findings inventory with Wave B2 honesty chrome, distinct from exposure attack-path analysis and asset host inventory.
