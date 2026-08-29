# Prompt 16 — Detection Rules (`/detection-rules`) OEM research

Retrieved: **2026-08-29**

Purpose: decide Detection Engineering IA so **detection content management** is clearly distinct from `/queue` (shift triage), `/alerts` (full alert inventory), `/correlated-findings` (offense queue), and `/response/playbooks` (SOAR orchestration). Paraphrase only. Product claim stays **STAGING CANDIDATE**.

Prior: Prompt 07 Alerts; Prompt 08 Correlated Findings; Prompt 15 Constellation.

Base tip: `main` @ `f76745c` includes Prompt 15 Constellation merge — `based_on_main_includes_pr15: yes`.

Confirmed APIs for this slice (verified in backend source — wire **ha-detection-rules** inventory, not legacy correlation-rule dual paths unless endpoint exists):

| Endpoint | Backend | UI use |
|---|---|---|
| `GET /api/ha-detection-rules` | `HaDetectionRuleResource.listRules` (DET-008) | Primary inventory grid |
| `GET /api/ha-detection-rules/{id}` | detail + versions | Editor / drawer |
| `POST /api/ha-detection-rules` | create | New rule |
| `PATCH /api/ha-detection-rules/{id}` | update | Editor save |
| `POST /api/ha-detection-rules/bulk/status` | activate/deactivate | Grid toggle |
| `POST /api/ha-detection-rules/bulk/delete` | delete | Admin delete |
| `POST /api/ha-detection-rules/validate` | CEL validation | Editor |
| `POST /api/ha-detection-rules/preview` | historical preview | Editor / test |
| `GET /api/ha-detection-rules/executions` | execution history | Monitoring tab |
| `GET /api/ha-detection-rules/coverage` | ATT&CK matrix | Coverage tab |
| `POST /api/ha-sigma-sync/trigger` | Sigma staging | Sigma sync (Admin) |

Legacy `GET/POST/PUT/DELETE /api/correlation-rule*` (UtmCorrelationRulesResource) remains for YAML engine rules; UI inventory uses **ha-detection-rules** contract per Sprint 47 DET-*.

---

## A1. Commercial SIEM (≥3)

### Splunk Enterprise Security — Content Management / Correlation Searches

| Item | Detail |
|---|---|
| Sources | [Configure correlation searches](https://help.splunk.com/en/splunk-enterprise-security-7/administer/7.2/correlation-searches/configure-correlation-searches-in-splunk-enterprise-security), [Managing security content](https://help.splunk.com/en/splunk-enterprise-security-8/administer/8.6/managing-security-content/managing-security-content-in-splunk-enterprise-security) |
| Access date | **2026-08-29** |
| Inventory-first | Configure → Content → Content Management filtered by Correlation Search type; enable/disable from grid before editing SPL. |
| MITRE / metadata | Correlation searches carry severity, drilldown, and ATT&CK annotations in content packages — not implied by alert volume alone. |
| Test / validate | Edit flow includes scheduling, throttling, and adaptive-response wiring; test is secondary to inventory review. |
| Role honesty | "Edit Correlation Searches" capability gates mutations — read-only analysts see inventory without write affordances. |
| Avoid | Fake "all green" health when searches ship disabled; Splunk ships most correlation searches **disabled** until operator enables. |

### Elastic Security — Detection Rules

| Item | Detail |
|---|---|
| Sources | [Manage detection rules](https://www.elastic.co/docs/solutions/security/detect-and-alert/manage-detection-rules), [Rule types](https://www.elastic.co/docs/solutions/security/detect-and-alert/detection-rules) |
| Access date | **2026-08-29** |
| Inventory-first | Rules management page is a sortable/filterable table (name, severity, tags, MITRE, enabled) — primary workspace ≥50% viewport. |
| MITRE honesty | MITRE ATT&CK tags on rules; coverage analytics separate from alert triage queue. |
| Test console | "Test rule" runs against historical index samples; secondary panel, not homepage hero. |
| Activate gates | Enable/disable and edit require `security:write` — UI disables mutations with role copy. |
| Avoid | Implied 100% ATT&CK coverage greens when rule pack is empty. |

### Microsoft Sentinel — Analytics rules

| Item | Detail |
|---|---|
| Sources | [Manage and monitor analytics rules](https://learn.microsoft.com/en-us/azure/sentinel/manage-analytics-rules), [Create custom detection rules](https://learn.microsoft.com/en-us/azure/sentinel/create-analytics-rules) |
| Access date | **2026-08-29** |
| Inventory-first | Active rules blade lists scheduled, NRT, and ML rules with status/severity filters — not incident triage. |
| MITRE mapping | ATT&CK tactics/techniques on rule templates; coverage workbook is separate analytics artifact. |
| Test / validate | Rule logic test against sample data; activation requires explicit enable + permissions. |
| Role honesty | Microsoft Entra roles gate create/edit; read-only SOC sees inventory without mutation buttons. |
| Avoid | Fabricated rule health when no executions yet. |

---

## A2. Open-source / open-core (≥3)

### Sigma HQ — Rule repository

| Item | Detail |
|---|---|
| Sources | [Sigma specification](https://github.com/SigmaHQ/sigma-specification), [SigmaHQ rules](https://github.com/SigmaHQ/sigma) |
| Access date | **2026-08-29** |
| Borrow | Portable YAML detections with `logsource`, `detection`, MITRE tags — import/stage workflow before activation. |
| Avoid | Treating Sigma sync as "rules are live" without operator review. |

### Suricata / Snort — Rule managers (Emerging Threats, PulledPork)

| Item | Detail |
|---|---|
| Sources | [Suricata rule management](https://docs.suricata.io/en/latest/rule-management/index.html) |
| Access date | **2026-08-29** |
| Borrow | Versioned rule sets, enable/disable sid lists, diff-on-update — inventory before inline edit. |
| Avoid | Inline activation without staging diff. |

### OpenSearch Security Analytics — Detections

| Item | Detail |
|---|---|
| Sources | [Security Analytics](https://docs.opensearch.org/latest/security-analytics/index/) |
| Access date | **2026-08-29** |
| Borrow | Detector inventory with per-detector status; findings link back to detector, not conflated with alert queue. |
| Avoid | Empty detector list shown as "fully covered". |

---

## A3. HiveArmor Prompt 16 decisions

| Decision | Rationale |
|---|---|
| **RESTRUCTURE** hub at `/detection-rules` | Matches Splunk Content Management + Elastic rules table pattern |
| Job sentence + STAGING CANDIDATE | Honest staging boundary; distinct from alert triage |
| Remove 6-tile health KPI strip | No fake greens when execution projection is unknown |
| Compact filters: status / severity / MITRE / search | Elastic/Sentinel filter bar pattern |
| Grid ≥50vh | Inventory-first viewport ownership |
| Create / Test / Activate → `canManage` (SOC Manager \| Admin) | Splunk "Edit Correlation Searches" gate pattern |
| Meta links → Mission Control, Alerts, Correlated Findings, Playbooks | Cross-product navigation without merging triage |
| Empty inventory honesty banner | Sigma/content gap is ops truth — not a UI fabrication |
| Test console secondary tab | Elastic "Test rule" is drawer/tab, not landing page |

**Next recommended slice:** `/response/playbooks` (Prompt 17).
