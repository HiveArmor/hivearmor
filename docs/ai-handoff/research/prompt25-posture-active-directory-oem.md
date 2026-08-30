# Prompt 25 — Posture Active Directory (`/posture/active-directory`) OEM research

Retrieved: **2026-08-30**

Purpose: decide inventory-first AD domain posture hub IA so **domain assessments, trust relationships, privileged changes, and identity infrastructure health** are clearly distinct from `/posture/identities` (user/service identity inventory), `/posture/assets` (host/asset posture inventory), `/posture/exposure` (attack-path analysis), and `/entities` (entity dossier + behavioral timeline). Paraphrase only. Product claim stays **STAGING CANDIDATE**.

Prior: Prompt 24 `/posture/identities` — Wave B2 slice 2 (merged @ `d9759fa` via PR #111).

Base tip: `main` @ `d9759fa` includes Prompt 24 — `based_on_main_includes_pr24: yes`.

Confirmed APIs for this slice (verified in backend source — do **not** invent):

| Endpoint | Backend | UI use |
|---|---|---|
| AD posture APIs (ADP-001+) | **NOT IMPLEMENTED** | `fetchAdPosture` returns explicit `contractState: 'missing'` |

**Forbidden:** fake domain health, Tier-0 paths, privileged changes, or posture scores; legacy AD compatibility empties (`getAdReportSummary`, `getAdDomainSummary` — removed B2-AD-01); any unverified `/api/ha-ad-*` path without backend source confirmation.

**Staging probe label:** `AD-CONTRACT-MISSING-STAGING` unless real data found.

---

## A1. Commercial AD security (≥3)

### Microsoft Defender for Identity — Secure score & domain overview

| Item | Detail |
|---|---|
| Sources | [Microsoft Defender for Identity overview](https://learn.microsoft.com/en-us/defender-for-identity/what-is), secure score and security assessment views |
| Access date | **2026-08-30** |
| Inventory-first | Security assessments list with severity, category, and affected entities — tabbed views (assessments · lateral movement · sensitive accounts) above a dense grid, not a six-tile hero KPI strip duplicating grid counts. |
| Progressive detail | Row opens side panel with evidence, remediation guidance, and hunt pivots — mirrors drawer tabs (overview · evidence · exposure). |
| Honesty | Missing sensor or incomplete directory coverage shown explicitly — not fabricated posture scores. |
| Avoid | Conflating Entra ID user admin with on-prem AD domain posture; hero KPI tiles with dashes when backend contract is absent. |

### Semperis Directory Services Protector — AD security posture dashboard

| Item | Detail |
|---|---|
| Sources | [Semperis DSP](https://www.semperis.com/products/directory-services-protector/), AD security assessment and change monitoring views |
| Access date | **2026-08-30** |
| Domain & trust focus | Domain forest overview with trust relationships, privileged change tracking, and identity infrastructure health as coordinated views — not merged into a single KPI hero. |
| Change monitoring | Privileged directory changes in a time-bounded event grid with actor, target, and authorization state — filter bar above grid. |
| Cross-links | Pivots to incident response and forensic hunt on sibling surfaces — not inline entity dossiers. |
| Avoid | Showing Tier-0 path counts or posture scores when the authoritative contract is missing. |

### Tenable Active Directory Secure — Exposure analytics

| Item | Detail |
|---|---|
| Sources | [Tenable AD Secure](https://www.tenable.com/products/tenable-ad), exposure and attack-path prioritization views |
| Access date | **2026-08-30** |
| Assessment categories | Security findings grouped by category (accounts, GPO, certificates, hybrid) with risk level and score impact per row — inventory-first grid workspace (≥50vh). |
| Trust & infrastructure | Domain controller health, replication lag, and trust risk surfaced in dedicated views — not pre-aggregated into misleading hero tiles. |
| Empty honesty | Zero assessments with no filters shows explicit directory sensor onboarding guidance — distinct from filter-empty, API error, and missing-contract states. |
| Avoid | Fabricating domain posture scores or critical assessment counts when API returns null. |

---

## A2. Open-source borrow patterns (≥3)

### BloodHound — Domain overview & attack paths

| Item | Detail |
|---|---|
| Sources | [BloodHound CE documentation](https://bloodhound.specterops.io/), domain overview and path-finding views |
| Access date | **2026-08-30** |
| Borrow | Domain-centric navigation with trust boundaries and privileged reachability in progressive detail — inventory of findings as primary workspace, path analysis as sibling pivot to Exposure. |
| Avoid | BloodHound graph canvas as primary surface — attack-path visualization lives on `/posture/exposure` (Prompt 26). |

### Wazuh — Active Directory monitoring

| Item | Detail |
|---|---|
| Sources | [Wazuh Active Directory monitoring](https://documentation.wazuh.com/current/user-manual/capabilities/active-response/index.html), Windows security event correlation for AD |
| Access date | **2026-08-30** |
| Borrow | Directory change events with actor, action, and target in a filterable grid; time-window selector for privileged changes; hunt pivot from row to log search. |
| Avoid | Wazuh agent enrollment UX — sensor admin lives on `/posture/sensors`. |

### PingCastle — AD security report layout

| Item | Detail |
|---|---|
| Sources | [PingCastle documentation](https://www.pingcastle.com/documentation/), HTML report structure and risk rules |
| Access date | **2026-08-30** |
| Borrow | Assessment findings organized by category with score impact and remediation recommendation per finding; domain summary in drawer overview — not a six-tile hero duplicating assessment counts. |
| Avoid | PingCastle standalone report export as primary UX — HiveArmor reports live on `/reports/*`. |

---

## A3. Decision table

| Surface | Decision | Rationale |
|---|---|---|
| `/posture/active-directory` | **RESTRUCTURE** | Inventory-first AD hub with honesty chrome; demote 6-tile `.adp-summary` hero; POSTURE eyebrow + STAGING CANDIDATE badge; meta cross-links via `Link` + `ROUTES`; missing-contract honesty distinct from empty inventory and filter-empty. |
| `/posture/identities` | **KEEP** (sibling) | User/service identity inventory (Prompt 24) — meta link, not merged. |
| `/posture/assets` | **KEEP** (sibling) | Host/asset posture inventory (Prompt 23) — meta link. |
| `/posture/exposure` | **KEEP** (sibling) | Attack-path analysis (Prompt 26) — meta link and drawer pivot. |
| `/entities` | **KEEP** (sibling) | Entity dossier + behavioral timeline — drawer pivot only. |
| `/posture/vulnerabilities` | **KEEP** (sibling) | Vuln findings inventory — meta link only. |

---

## Next recommended slice

**`/posture/exposure`** (Prompt 26) — Attack-path and exposure analysis with Wave B2 honesty chrome, distinct from AD domain posture inventory and identity entity inventory.
