# Prompt 23 — Posture Assets (`/posture/assets`) OEM research

Retrieved: **2026-08-29**

Purpose: decide inventory-first asset hub IA so **discovered hosts, risk scores, exposure, and sensor coverage** are clearly distinct from `/entities` (entity dossier + behavioral risk), `/posture/sensors` (agent fleet admin), `/edr/endpoints` (per-host timeline workbench), `/posture/exposure` (attack-path analysis), `/posture/vulnerabilities` (vuln findings inventory), and `/posture/identities` (identity security posture). Paraphrase only. Product claim stays **STAGING CANDIDATE**.

Prior: Prompt 22 `/edr/fim` — Wave B1 closure (merged @ `18ac487` via PR #109).

Base tip: `main` @ `18ac487` includes Prompt 22 — `based_on_main_includes_pr22: yes`.

Confirmed APIs for this slice (verified in backend source — do **not** invent):

| Endpoint | Backend | UI use |
|---|---|---|
| `GET /api/ha-assets` | Asset inventory projection | Paginated inventory, summary, snapshotAt, partialFailures, cursor |
| `GET /api/ha-assets/{id}` | Asset detail | Drawer: risk drivers, coverage, recommendations |

**Forbidden:** `GET /api/ha-network-scans/*` (legacy/unprotected), `GET /api/ha-clients` as production inventory path, fabricated risk/exposure scores when API returns null.

---

## A1. Commercial ASM / exposure (≥3)

### Tenable.asm — External attack surface asset inventory

| Item | Detail |
|---|---|
| Sources | [Tenable.asm platform overview](https://www.tenable.com/products/tenable-asm), ASM asset inventory and exposure dashboards |
| Access date | **2026-08-29** |
| Inventory-first | Asset list is the primary surface — hostname, IP, exposure grade, last seen, and ownership context in a dense grid before drill-down. |
| Risk / exposure | Risk and exposure scores sit as columns with explainable drivers on detail — not hero KPI tiles above the grid. |
| Sensor / coverage | Discovery source and agent coverage shown per asset; unmanaged assets flagged inline, not buried in a summary strip. |
| Avoid | Six-tile hero KPI strip that duplicates grid aggregates; conflating external ASM assets with internal entity dossiers. |

### Rapid7 Exposure Command — Unified asset inventory

| Item | Detail |
|---|---|
| Sources | [Rapid7 Exposure Command](https://www.rapid7.com/products/exposure-command/), InsightVM/Exposure Command asset views |
| Access date | **2026-08-29** |
| Inventory-first | Unified asset inventory with filters for risk, exposure, and coverage — category tabs (endpoint, cloud, network) above a sortable table. |
| Detail drawer | Progressive disclosure: overview → risk drivers → coverage gaps → pivot links to vulns and attack paths on sibling surfaces. |
| Empty honesty | Zero assets with no filters shows explicit onboarding guidance — distinct from filter-empty and API error states. |
| Avoid | Fake aggregate scores when backend returns null; raw `<a href>` cross-links instead of router navigation. |

### Microsoft Defender Vulnerability Management — Device inventory

| Item | Detail |
|---|---|
| Sources | [Defender vulnerability management device inventory](https://learn.microsoft.com/en-us/microsoft-365/security/defender-vulnerability-management/tvm-software-inventory), Defender exposure management assets |
| Access date | **2026-08-29** |
| Inventory-first | Device inventory grid with risk level, exposure level, OS, and onboarded state — filters compact above grid, not a second toolbar stack. |
| Separation | Device inventory ≠ Security Graph entity page; fleet onboarding is a separate admin surface (Intune/Defender deployment). |
| Coverage column | Sensor/onboarding status per row with degraded/missing states — aligns with HiveArmor sensorHealth column. |
| Avoid | "Asset Intelligence" hero title when nav label is "Assets"; mixing entity behavioral risk with posture asset inventory. |

---

## A2. Open-source borrow patterns (≥3)

### Wazuh — Asset inventory / agent inventory

| Item | Detail |
|---|---|
| Sources | [Wazuh agent inventory](https://documentation.wazuh.com/current/user-manual/capabilities/system-inventory/index.html), Wazuh dashboard agent views |
| Access date | **2026-08-29** |
| Borrow | Dense agent/host table with OS, last keepalive, and group membership; category filter tabs; detail panel with syscollector fields. |
| Avoid | Wazuh manager configuration UX — HiveArmor fleet enrollment lives on `/posture/sensors`. |

### OpenVAS / Greenbone — Asset groups and host list

| Item | Detail |
|---|---|
| Sources | [Greenbone asset management](https://docs.greenbone.net/GSM-Manual/gos-22.04/en/managing-assets.html), host list and asset group views |
| Access date | **2026-08-29** |
| Borrow | Host list with severity columns, filter bar (risk, OS, last scan), paginated grid with detail side panel. |
| Avoid | Scan-task scheduling UX — vuln scan orchestration is out of scope for this inventory slice. |

### Security Onion — Host inventory

| Item | Detail |
|---|---|
| Sources | [Security Onion host inventory](https://docs.securityonion.net/en/2.4/host-inventory.html), Kibana/Fleet host views |
| Access date | **2026-08-29** |
| Borrow | Host inventory with first/last seen, IP/MAC, and agent status; empty state when no agents enrolled; hunt pivot from host row. |
| Avoid | Elastic Fleet enrollment wizard — HiveArmor sensor admin is `/posture/sensors`. |

---

## A3. Decision table

| Surface | Decision | Rationale |
|---|---|---|
| `/posture/assets` | **RESTRUCTURE** | Inventory-first hub with honesty chrome; demote 6-tile KPI strip to compact inline stats; POSTURE eyebrow + STAGING CANDIDATE badge; meta cross-links via `Link` + `ROUTES`. |
| `/entities` | **KEEP** (sibling) | Entity dossier + behavioral risk — different API/shape; cross-link from asset drawer only. |
| `/posture/sensors` | **KEEP** (sibling) | Fleet enrollment admin — linked from empty-inventory honesty and meta row. |
| `/posture/exposure` | **KEEP** (sibling) | Attack-path analysis — drawer pivot only, not primary inventory. |
| `/posture/vulnerabilities` | **KEEP** (sibling) | Vuln findings inventory (Prompt 25) — drawer pivot only. |
| `/posture/identities` | **SPLIT** (next slice) | Identity security posture is a separate route (Prompt 24) — meta link, not merged into assets. |
| `/edr/endpoints` | **KEEP** (sibling) | Per-host timeline workbench — not asset inventory. |

---

## Next recommended slice

**`/posture/identities`** (Prompt 24) — identity security posture inventory with Wave B2 honesty chrome, distinct from asset host inventory and entity dossiers.
