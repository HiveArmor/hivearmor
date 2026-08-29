# Prompt 20 — Response Quarantine (`/response/quarantine`) OEM research

Retrieved: **2026-08-29**

Purpose: decide containment-inventory-first IA so **quarantined files + host isolation read model** are clearly distinct from `/response/playbooks` (SOAR inventory), `/response/activity` (execution ledger), `/response/authority` (approval queue), `/posture/sensors` (agent fleet), and `/edr/endpoints` (endpoint timeline workbench). Paraphrase only. Product claim stays **STAGING CANDIDATE**.

Prior: Prompt 19 Response Authority (merged @ `4d6a6d8` via PR #106).

Base tip: `main` @ `4d6a6d8` includes Prompt 19 — `based_on_main_includes_pr19: yes`.

Confirmed APIs for this slice (verified in backend source — do **not** invent):

| Endpoint | Backend | UI use |
|---|---|---|
| `GET /api/ha-edr/quarantine` | Paginated file inventory | Primary quarantined-files tab |
| `PATCH /api/ha-edr/quarantine/{id}` | restore \| delete | Single-file disposition |
| `POST /api/ha-edr/quarantine/bulk` | bulk restore \| delete | Bulk selection actions |
| `GET /api/ha-edr/isolation` | Host isolation inventory | Endpoint isolation tab (read-only STAGING CANDIDATE) |

Do **not** wire: legacy `GET/PATCH /api/edr/*`, governed isolation lift/release APIs (RESP-021 open), fake connector-delivery success.

---

## A1. Commercial EDR/XDR (≥3)

### CrowdStrike Falcon — Quarantined files inventory

| Item | Detail |
|---|---|
| Sources | [Quarantine API](https://developer.crowdstrike.com/api-reference/collections/quarantine/), [Endpoint Security Monitor](https://www.certsforce.com/discussions/crowdstrike/view/exam-ccfr-201b-topic-6-question-55-discussion) |
| Access date | **2026-08-29** |
| Inventory-first | Dedicated quarantine list under Endpoint Security → Monitor → Quarantined Files; separate from playbook/automation surfaces. |
| Row actions | Release (restore), delete, unrelease — always behind confirmation; preview/count before bulk filter actions. |
| Evidence drawer | File hash, path, host, detection linkage; pivot to investigate without leaving inventory. |
| Avoid | Hero KPI tiles counting “malicious on loaded page” — misleading when paginated. |

### Microsoft Defender for Endpoint — File quarantine

| Item | Detail |
|---|---|
| Sources | [Manage quarantined files](https://learn.microsoft.com/en-us/microsoft-365/security/defender-endpoint/respond-file-alerts), [Automated investigation](https://learn.microsoft.com/en-us/microsoft-365/security/defender-endpoint/automated-investigations) |
| Access date | **2026-08-29** |
| Inventory-first | Quarantined files grid with filters by device, file name, action state; host containment shown as related but separate action class. |
| Disposition | Download, release, remove — gated by role; confirmation before irreversible delete. |
| Host isolation | Device isolation status visible in device inventory; lift requires explicit release workflow, not inline fake success. |
| Avoid | Conflating file quarantine counts with fleet health KPI strips on empty inventory. |

### Microsoft Sentinel / Defender — Endpoint isolation & containment

| Item | Detail |
|---|---|
| Sources | [Isolate devices](https://learn.microsoft.com/en-us/azure/sentinel/microsoft-365-defender-integration), [Live response](https://learn.microsoft.com/en-us/microsoft-365/security/defender-endpoint/live-response) |
| Access date | **2026-08-29** |
| Dual workspace | File quarantine inventory separate from host isolation/containment list; tabs or linked views, not merged hero metrics. |
| Read-only honesty | When lift/release API is unavailable, show isolation state read-only with link to approval/governance path. |
| Freshness | Snapshot/as-of labeling on paged inventory — not cursor-bound totals presented as live KPIs. |
| Avoid | Enabling “Release host” without secured mutate contract. |

### Palo Alto Cortex XDR — Quarantine management (optional)

| Item | Detail |
|---|---|
| Sources | [Cortex XDR quarantine](https://docs-cortex.paloaltonetworks.com/r/Cortex-XDR-Administrator-Guide/Quarantine-Management) |
| Access date | **2026-08-29** |
| Borrow | Compact toolbar filters + dense grid; bulk restore/delete with eligibility exclusions. |
| Avoid | Borrowing endpoint policy editor UX into containment inventory hub. |

---

## A2. Open-source / open-core (≥3)

### TheHive — Observable quarantine workflow

| Item | Detail |
|---|---|
| Sources | [TheHive observables](https://docs.thehive-project.org/thehive/) |
| Access date | **2026-08-29** |
| Borrow | Case-linked observable list with disposition actions; drawer shows provenance before restore/delete. |
| Avoid | Treating case observables as platform-wide quarantine inventory. |

### Wazuh — Active response file delete

| Item | Detail |
|---|---|
| Sources | [Wazuh active response](https://documentation.wazuh.com/current/user-manual/capabilities/active-response/index.html) |
| Access date | **2026-08-29** |
| Borrow | Explicit command confirmation before file removal; eligibility excludes offline agents. |
| Avoid | Wiring Wazuh active-response scripts — HiveArmor uses `/api/ha-edr/quarantine` only. |

### MISP — Attribute containment tagging

| Item | Detail |
|---|---|
| Sources | [MISP attribute taxonomy](https://www.misp-project.org/taxonomies.html) |
| Access date | **2026-08-29** |
| Borrow | Containment state badges (quarantined / restored / deleted) on grid rows; filter by state. |
| Avoid | Intel attribute UI patterns that imply IOC sharing replaces EDR file inventory. |

### OpenEDR / Velociraptor — Hunt-to-quarantine pivot (UX borrow only)

| Item | Detail |
|---|---|
| Sources | [Velociraptor hunting](https://docs.velociraptor.app/docs/hunting/) |
| Access date | **2026-08-29** |
| Borrow | Pivot links from quarantine row to search/entity dossier without raw `<a href>`. |
| Avoid | Borrowing collector query language into quarantine grid columns. |

---

## A3 → A4: KEEP | RESTRUCTURE | SPLIT

| Area | Decision | Rationale |
|---|---|---|
| Dual tabs: Quarantined files · Endpoint isolation | **KEEP** | OEM pattern — file vs host containment are related but distinct inventories |
| Compact filters, AG Grid, row density, J/K/Enter/`/` | **KEEP** | Dense SOC toolbar; keyboard nav |
| Restore/delete confirmation modal + bulk selection | **KEEP** | CrowdStrike/Defender disposition pattern |
| Drawer evidence/history + eligibility rules | **KEEP** | Progressive disclosure before irreversible action |
| Hero `.qrn-summary` 6-tile KPI strip | **RESTRUCTURE** | Demote to compact inline stats in results toolbar when data exists |
| Legacy eyebrow “Response automation” | **RESTRUCTURE** | Replace with **RESPOND** + STAGING CANDIDATE badge |
| Full-width RESP-021 isolation banner stack | **RESTRUCTURE** | Fold into `qrn-page__projection-note` in identity chrome |
| Job sentence + meta cross-links + role note | **ADD** | Match Prompt 16–19 honesty chrome |
| Empty-inventory honesty banner | **ADD** | Zero rows, no filters — distinct from filtered empty |
| Grid workspace ≥50vh (`.qrn-inventory`) | **ADD** | Inventory owns viewport |
| Host isolation lift/release | **KEEP disabled** | No secured mutate API (RESP-021); link to Response Approvals |
| SOAR playbook inventory | **SPLIT** | Lives on `/response/playbooks` (P17) |
| Execution ledger | **SPLIT** | Lives on `/response/activity` (P18) |
| Approval queue | **SPLIT** | Lives on `/response/authority` (P19) |
| Agent fleet admin | **SPLIT** | Lives on `/posture/sensors` |
| Endpoint timeline workbench | **SPLIT** | Lives on `/edr/endpoints` |

---

## Next recommended slice

**`/response/library` (Prompt 21)** — response action library / connector catalogue with honesty gates.
