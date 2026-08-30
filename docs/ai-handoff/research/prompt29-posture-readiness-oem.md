# Prompt 29 — Posture Detection Coverage (`/posture/readiness`) OEM research

Retrieved: **2026-08-30**

Purpose: decide matrix-first Detection Coverage hub IA so **MITRE ATT&CK technique × correlation-rule coverage** stays distinct from `/detection-rules` (rule authoring), `/posture/cis-benchmark` (CIS SCA host checks), `/compliance` (framework assurance), `/posture/vulnerabilities` (CVE findings), and `/posture/exposure` (attack-path analysis). Paraphrase only. Product claim stays **STAGING CANDIDATE**.

Prior: Prompt 28 `/posture/cis-benchmark` — Wave B2 slice 6 (merged @ `b9dcdc6` via PR #115).

Base tip: `main` @ `b9dcdc6` includes Prompt 28 — `based_on_main_includes_pr28: yes`.

Confirmed APIs for this slice (verified in backend source — do **not** invent):

| Endpoint | Backend | UI use |
|---|---|---|
| `GET /api/mitre/coverage` | Technique list with `ruleCount` + `activeCount` | Primary coverage matrix |
| `GET /api/mitre/rules?techniqueId=` | Rules mapped to selected technique | Technique drawer / drill-down |
| `GET /api/mitre/coverage/export` | CSV of coverage projection | Export when coverage exists; fail closed on error |

**Auth:** `@PreAuthorize(MITRE_READ_AUTH)` = `ROLE_ANALYST | ROLE_SOC_MANAGER | ROLE_ADMIN`. SOC Analyst is **not** in auth or nav — role note is Analyst · SOC Manager · Platform Administrator.

**Forbidden:** Fake ATT&CK Navigator heatmaps from incomplete data; claims of “full ATT&CK coverage” when empty or sparse; CIS SCA or Compliance framework endpoints on this page; inline hex colors; inventing techniques that have no correlation-rule mapping.

**Honesty:** Empty HTTP 200 (coverage array length 0) ≠ missing contract ≠ API error. Empty projection means no correlation rules currently report a MITRE technique id — not proof of full ATT&CK coverage or ingest failure. Unlike AD/Exposure, the backend contract **exists**.

**Staging probe label:** `MITRE-EMPTY-STAGING` when coverage is `[]`; otherwise record technique count and sample `techniqueId` for rules probe.

---

## A1. Commercial detection-coverage UX (≥3)

### Microsoft Defender XDR — MITRE ATT&CK coverage map

| Item | Detail |
|---|---|
| Sources | [Microsoft Defender XDR](https://learn.microsoft.com/en-us/microsoft-365/security/defender/microsoft-365-defender), [ATT&CK coverage / security content](https://learn.microsoft.com/en-us/microsoft-365/security/defender-endpoint/) |
| Access date | **2026-08-30** |
| Coverage-first | Operators review **technique × detection content** coverage as a map/matrix, not a rule-editor grid. Drill from a technique into the detections that claim coverage; coverage gaps stay visible rather than implied as “covered by platform defaults.” |
| Honesty | Coverage reflects mapped detections in scope — not a claim that every ATT&CK technique is monitored. Empty or sparse maps are operational signals. |
| Avoid | Treating a colorful heatmap as proof of enterprise-wide detection completeness; conflating coverage maps with compliance framework scores. |

### Elastic Security — MITRE ATT&CK coverage

| Item | Detail |
|---|---|
| Sources | [Elastic Security](https://www.elastic.co/guide/en/security/current/es-overview.html), [MITRE ATT&CK coverage](https://www.elastic.co/guide/en/security/current/prebuilt-rules.html) |
| Access date | **2026-08-30** |
| Coverage-first | Prebuilt / enabled rules project onto ATT&CK techniques; the coverage view emphasizes **which techniques have enabled detections** versus gap techniques. Rule authoring remains a sibling surface. |
| Honesty | Coverage is derived from rule-to-technique mappings that exist in the detection content pack — absence of a cell is a gap, not “unknown secure.” |
| Avoid | Mixing CIS host-audit checks into the MITRE matrix; inventing navigator layers when the rule inventory is empty. |

### Splunk ESCU — analytics coverage

| Item | Detail |
|---|---|
| Sources | [Splunk ESCU](https://splunkbase.splunk.com/app/3449), [Enterprise Security content](https://docs.splunk.com/Documentation/ES/) |
| Access date | **2026-08-30** |
| Coverage-first | ESCU-style content shows analytic stories / detections mapped to ATT&CK; operators filter and export coverage for gap analysis. Export is a read-only artifact of the current mapping, not a remediation plan. |
| Honesty | Coverage reports what content is installed/enabled — not what adversaries cannot do. Sparse content packs produce sparse coverage. |
| Avoid | Fake CSV on export failure; presenting empty mapping as “full enterprise coverage.” |

---

## A2. Open-source borrow patterns (≥3)

### MITRE ATT&CK Navigator — layer / heatmap UX

| Item | Detail |
|---|---|
| Sources | [ATT&CK Navigator](https://mitre-attack.github.io/attack-navigator/), [attack-navigator GitHub](https://github.com/mitre-attack/attack-navigator) |
| Access date | **2026-08-30** |
| Borrow | Technique cells as the primary workspace; color bands by coverage intensity; click-through to annotations / related content. Empty layer = no scored techniques, not full coverage. |
| Avoid | Shipping a full Navigator clone or claiming a complete ATT&CK matrix when HiveArmor only projects techniques that appear on correlation rules. |

### Atomic Red Team — technique coverage views

| Item | Detail |
|---|---|
| Sources | [Atomic Red Team](https://github.com/redcanaryco/atomic-red-team), [Atomic docs](https://www.atomicredteam.io/) |
| Access date | **2026-08-30** |
| Borrow | Technique-centric inventory: which tests/detections exist per technique id; gap lists as first-class. Coverage is “content present,” not “validated in production.” |
| Avoid | Implying HiveArmor runs Atomic tests from this page; conflating detection coverage with purple-team execution status. |

### SigmaHQ — rule-to-technique mapping UIs

| Item | Detail |
|---|---|
| Sources | [SigmaHQ](https://github.com/SigmaHQ/sigma), [Sigma rule format](https://sigmahq.io/) |
| Access date | **2026-08-30** |
| Borrow | Rules carry ATT&CK tags; coverage is an aggregation of tagged/active rules. Drill from technique → rule list; authoring stays on the rules surface. |
| Avoid | Editing correlation rules inline on the coverage page; inventing tags when `rule_technique` is null. |

---

## A3. Decision table

| Surface | Decision | Rationale |
|---|---|---|
| `/posture/readiness` | **RESTRUCTURE** | Matrix-first Detection Coverage hub with Wave B2 honesty chrome; keep route path; title/nav = Detection Coverage; empty-honesty distinct from API error; CSS extract; HaDrawer for technique rules; compact inline stats (not 6-tile hero). |
| `/detection-rules` | **KEEP** (sibling) | Rule authoring / activation inventory (Wave A) — meta link. |
| `/posture/cis-benchmark` | **KEEP** (sibling) | CIS SCA host-file checks (Prompt 28) — meta link. |
| `/compliance` | **KEEP** (sibling) | Framework assurance (Prompt 30) — meta link. |
| `/posture/vulnerabilities` | **KEEP** (sibling) | CVE findings — meta link. |
| `/posture/exposure` | **KEEP** (sibling) | Attack-path analysis — meta link. |
| `/dashboard` | **KEEP** (sibling) | Mission Control — meta link. |

---

## Next recommended slice

**`/compliance`** (Prompt 30) — Wave B2 closure: framework assurance with Wave B2 honesty chrome, distinct from Detection Coverage (MITRE), CIS SCA checks, and CVE findings.
