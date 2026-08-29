# Prompt 22 — File Integrity Monitoring (`/edr/fim`) OEM research

Retrieved: **2026-08-29**

Purpose: decide analytics-dashboard-first IA so **FIM change trends, top paths, and suspicious hashes** are clearly distinct from `/edr/endpoints` (per-host timeline workbench), `/posture/sensors` (fleet admin), `/edr/policies` (agent policy templates), `/response/quarantine` (containment inventory), and `/search` (ad-hoc hunt). Paraphrase only. Product claim stays **STAGING CANDIDATE**.

Prior: Prompt 21 Response Library (merged @ `57ba337` via PR #108).

Base tip: `main` @ `57ba337` includes Prompt 21 — `based_on_main_includes_pr21: yes`.

Confirmed APIs for this slice (verified in backend source — do **not** invent):

| Endpoint | Backend | UI use |
|---|---|---|
| `GET /api/ha-edr/fim/summary` | `HaEdrFimResource` | changesOverTime, topPaths, suspiciousHashes |
| `GET /api/agent-manager/agents` | Agent registry | Agent filter dropdown only (via `fetchSensors`) |

**Forbidden:** `GET /api/ha-edr/fim/events`, paginated FIM inventory, legacy non-`ha-edr` FIM paths.

---

## A1. Commercial EDR/FIM (≥3)

### CrowdStrike Falcon — File Integrity Monitoring

| Item | Detail |
|---|---|
| Sources | [FIM policy documentation](https://www.crowdstrike.com/platform/endpoint-security/file-integrity-monitoring/), Falcon console FIM dashboards |
| Access date | **2026-08-29** |
| Dashboard-first | Summary charts for change volume over time, top modified paths, and hash reputation — not a raw event grid as the primary surface. |
| Separation | Per-host file events live in host timeline / process tree; fleet policy assignment is a separate admin surface. |
| Empty honesty | Zero-change windows show explicit “no monitored changes” copy — not implied platform health. |
| Avoid | Hero KPI tiles claiming “protected endpoints” when FIM telemetry is empty or agents lack FIM policy. |

### Microsoft Defender for Endpoint — File integrity / change monitoring

| Item | Detail |
|---|---|
| Sources | [Defender device timeline](https://learn.microsoft.com/en-us/microsoft-365/security/defender-endpoint/investigate-device), Advanced hunting file events |
| Access date | **2026-08-29** |
| Dashboard-first | Trend visualizations and “top entities” panels precede drill-down; summary aggregates before row-level hunt. |
| Separation | Device timeline is per-endpoint; org-wide FIM analytics are a distinct lens from Advanced Hunting query editor. |
| Filter bar | Time range + device scope + change-type filters above charts — compact, not a second permanent toolbar stack. |
| Avoid | Conflating org-wide FIM summary with per-device file event inventory on the same page. |

### Elastic Security — File integrity / syscheck-style dashboards

| Item | Detail |
|---|---|
| Sources | [Elastic Security dashboards](https://www.elastic.co/guide/en/security/current/dashboards-overview.html), FIM integration patterns |
| Access date | **2026-08-29** |
| Dashboard-first | Lens/visualize panels for change trends, top paths, and hash outliers; hunt pivots via linked searches. |
| Separation | Dashboard workspace owns viewport; ad-hoc hunt opens in Discover / Kibana query — not embedded as primary grid. |
| Empty honesty | Empty time series ≠ healthy tenant — staging/dev empty states called out explicitly. |
| Avoid | Forcing AG Grid event inventory when only summary aggregation API exists. |

---

## A2. Open-source borrow patterns (≥3)

### Wazuh — Syscheck FIM dashboard

| Item | Detail |
|---|---|
| Sources | [Wazuh FIM](https://documentation.wazuh.com/current/user-manual/capabilities/file-integrity/index.html), Wazuh dashboard FIM panels |
| Access date | **2026-08-29** |
| Borrow | Time-series change chart + top-altered-files bar chart + integrity hash table — three-panel analytics layout. |
| Avoid | Wazuh manager rule editor UX — HiveArmor policy templates live on `/edr/policies`. |

### OSSEC — Syscheck reporting

| Item | Detail |
|---|---|
| Sources | [OSSEC syscheck](https://www.ossec.net/docs/manual/syscheck/syscheck.html), legacy reporting dashboards |
| Access date | **2026-08-29** |
| Borrow | Change-type breakdown (create/modify/delete) in trend line; path-centric top-N bar chart. |
| Avoid | Email/report-only UX without interactive filters — HiveArmor needs live filter bar. |

### Samhain — File integrity monitoring

| Item | Detail |
|---|---|
| Sources | [Samhain documentation](https://www.la-samhna.de/samhain/index.html), admin reporting views |
| Access date | **2026-08-29** |
| Borrow | Suspicious hash / integrity violation table with first-seen / last-seen columns separate from path analytics. |
| Avoid | Host-local CLI report aesthetic — keep HiveArmor design tokens and honesty chrome. |

---

## A3. KEEP | RESTRUCTURE | SPLIT

| Surface | Decision | Rationale |
|---|---|---|
| `/edr/fim` summary charts (Changes Over Time · Top Paths · Suspicious Hashes) | **KEEP** | Matches `GET /api/ha-edr/fim/summary` contract; analytics-dashboard-first is correct job. |
| `/edr/fim` bare 48px title header | **RESTRUCTURE** | Add Wave A3 honesty chrome: job sentence, STAGING CANDIDATE badge, meta cross-links, role note. |
| `/edr/fim` inline styles | **RESTRUCTURE** | Extract to `FimDashboardPage.css` with design tokens only. |
| `/edr/fim` centered EmptyState hiding charts | **RESTRUCTURE** | Empty-window honesty banner + dashboard workspace ≥50vh; charts remain visible with empty series. |
| `/edr/fim` separate agent-filter Alert | **RESTRUCTURE** | Fold partial failure into projection note; summary still loads for all agents. |
| `/edr/fim` paginated FIM event grid | **SPLIT** | No row-level API — per-host investigation belongs on `/edr/endpoints` + timeline; ad-hoc hunt on `/search`. |
| `/posture/sensors` fleet admin | **KEEP** (cross-link) | Enroll / packages / containment gates — not FIM analytics. |
| `/edr/endpoints` host workbench | **KEEP** (cross-link) | Per-host timeline investigation. |
| `/edr/policies` agent FIM paths config | **KEEP** (cross-link) | Policy templates + assignment honesty. |
| `/response/quarantine` containment | **KEEP** (cross-link) | File quarantine + isolation inventory — not change analytics. |

---

## Next recommended slice

**Prompt 23 — `/posture/assets` (Wave B2)** — asset inventory and posture scoring distinct from endpoint FIM analytics and sensor fleet admin.
