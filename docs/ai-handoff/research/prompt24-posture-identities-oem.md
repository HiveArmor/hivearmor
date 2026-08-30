# Prompt 24 — Posture Identities (`/posture/identities`) OEM research

Retrieved: **2026-08-29**

Purpose: decide inventory-first identity hub IA so **user/service identity risk, privilege signals, and auth strength gaps** are clearly distinct from `/entities` (entity dossier + behavioral timeline), `/posture/assets` (host/asset posture inventory), `/posture/active-directory` (AD domain/report posture), and `/posture/exposure` (attack-path analysis). Paraphrase only. Product claim stays **STAGING CANDIDATE**.

Prior: Prompt 23 `/posture/assets` — Wave B2 opener (merged @ `f1f5d9c` via PR #110).

Base tip: `main` @ `f1f5d9c` includes Prompt 23 — `based_on_main_includes_pr23: yes`.

Confirmed APIs for this slice (verified in backend source — do **not** invent):

| Endpoint | Backend | UI use |
|---|---|---|
| `GET /api/ha-entities?types=user&…` | Entity inventory (user type) | Paginated identity inventory, cursor pagination |
| `GET /api/ha-entities/summary?types=user&…` | Entity summary | `total`, `highRisk` only — other counters null |
| `GET /api/ha-entities/{id}/preview` | Entity preview | Drawer: activity summary, alert summary |

**Forbidden:** `GET /api/ha-entities/{id}/risk` (removed B2-ID-02), fake privilege/auth/control-gap scores when API returns null, IAM connector mutations (no create/disable user actions).

---

## A1. Commercial IAM / ITDR (≥3)

### Microsoft Entra ID Protection — Risky users inventory

| Item | Detail |
|---|---|
| Sources | [Microsoft Entra ID Protection overview](https://learn.microsoft.com/en-us/entra/id-protection/overview-identity-protection), risky users blade and sign-in risk views |
| Access date | **2026-08-29** |
| Inventory-first | Risky users list is a sortable grid with risk level, risk state, and last updated — filters compact above grid, not a six-tile hero KPI strip. |
| Progressive detail | Row opens a side panel with risk detail, linked sign-ins, and remediation actions gated by role — mirrors drawer tabs (overview · risk · controls · activity). |
| Honesty | Unknown MFA or policy state shown as unknown — not fabricated scores when directory connector lacks fields. |
| Avoid | Conflating Entra "Users" admin blade (directory CRUD) with security posture inventory; hero KPI tiles duplicating grid aggregates. |

### Okta Identity Security — Universal Directory user list

| Item | Detail |
|---|---|
| Sources | [Okta Identity Security posture](https://www.okta.com/products/identity-security/), Okta admin console People / Devices views |
| Access date | **2026-08-29** |
| Inventory-first | People inventory with lifecycle state, MFA factor status, and group membership columns — category views (all · admins · service accounts) as tabs, not duplicate summary tiles. |
| Auth strength | Authentication strength and factor enrollment shown per row; control gaps surfaced as filterable views when backend exposes them. |
| Cross-links | Pivots to sign-in logs and threat events on sibling hunt surfaces — not inline entity dossiers. |
| Avoid | Raw external links for cross-navigation; enabling privileged/non-human tabs without backend projection. |

### CrowdStrike Falcon Identity — Identity protection dashboard

| Item | Detail |
|---|---|
| Sources | [CrowdStrike Falcon Identity Protection](https://www.crowdstrike.com/platform/identity-protection/), identity risk and policy views |
| Access date | **2026-08-29** |
| Inventory-first | Identity risk queue with risk score, privilege tier, and last activity — dense grid as primary workspace (≥50vh). |
| ITDR signals | Risk signals and lateral movement paths in progressive drawer detail — not pre-loaded for every row. |
| Empty honesty | Zero identities with no filters shows explicit IdP/telemetry onboarding guidance — distinct from filter-empty and API error. |
| Avoid | Fake aggregate counts for privileged, non-human, control gaps when API returns null; IAM disable/contain actions without governance gate. |

---

## A2. Open-source borrow patterns (≥3)

### Wazuh — User inventory / security events

| Item | Detail |
|---|---|
| Sources | [Wazuh user inventory](https://documentation.wazuh.com/current/user-manual/capabilities/system-inventory/index.html), Wazuh dashboard identity correlation |
| Access date | **2026-08-29** |
| Borrow | User/account table with last seen, source, and alert count; search and risk filter bar above grid; detail panel with recent events. |
| Avoid | Wazuh agent enrollment UX — HiveArmor sensor admin lives on `/posture/sensors`. |

### Keycloak admin console — User list

| Item | Detail |
|---|---|
| Sources | [Keycloak admin console users](https://www.keycloak.org/docs/latest/server_admin/index.html#assembly-managing-users_server_administration_guide), realm user management views |
| Access date | **2026-08-29** |
| Borrow | Paginated user list with username, email, enabled state; compact filters; row click opens attribute/session detail — inventory-first, not directory CRUD on this surface. |
| Avoid | User create/disable mutations — posture inventory is read-only; IAM connector actions are out of scope. |

### OSSEC — Identity correlation views

| Item | Detail |
|---|---|
| Sources | [OSSEC identity monitoring](https://www.ossec.net/docs/manual/rules/identity.html), correlation and user context in alerts |
| Access date | **2026-08-29** |
| Borrow | Identity-centric alert correlation with user principal and source host; hunt pivot from identity row to log search. |
| Avoid | Legacy rule-editor UX — detection content lives on `/detection-rules`. |

---

## A3. Decision table

| Surface | Decision | Rationale |
|---|---|---|
| `/posture/identities` | **RESTRUCTURE** | Inventory-first hub with honesty chrome; demote 6-tile `.idp-summary` to compact `.idp-inline-stats`; POSTURE eyebrow + STAGING CANDIDATE badge; meta cross-links via `Link` + `ROUTES`. |
| `/entities` | **KEEP** (sibling) | Entity dossier + behavioral timeline — drawer pivot only. |
| `/posture/assets` | **KEEP** (sibling) | Host/asset posture inventory (Prompt 23) — meta link, not merged. |
| `/posture/active-directory` | **SPLIT** (next slice) | AD domain/report posture (Prompt 25) — meta link. |
| `/posture/exposure` | **KEEP** (sibling) | Attack-path analysis — meta link and drawer pivot. |
| `/posture/vulnerabilities` | **KEEP** (sibling) | Vuln findings inventory — meta link only. |

---

## Next recommended slice

**`/posture/active-directory`** (Prompt 25) — Active Directory domain and report posture with Wave B2 honesty chrome, distinct from identity entity inventory and asset host inventory.
