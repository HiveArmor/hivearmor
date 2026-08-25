# Remaining enterprise page program

Updated: **2026-08-23 10:44:00 IST (UTC+05:30)**
Execution model: one vertical slice at a time; inspect frontend/backend first, compare multiple official OEM workflows, implement honest UI, record contracts, validate, browser-review, then advance.

## Mandatory per-page research gate

Every page slice must compare at least three relevant official primary sources, including two product/OEM workflows where available and one authoritative standard when applicable. Record source URL, retrieval date, paraphrased conclusion, HiveArmor implication and refresh trigger under `docs/ai-handoff/research/`. Research informs workflow structure; it does not authorize stack changes, copied branding, unsupported backend state or licensed content reproduction.

## Sequenced program

| Order | Product slice | Principal routes | Required comparison set | Exit condition |
|---|---|---|---|---|
| 1 | Compliance assurance | `/compliance` | Microsoft Purview, AWS Audit Manager, ServiceNow GRC, NIST CSF, CIS | UI implemented over real aggregates; `CMP-001`–`CMP-009` recorded; full verification and browser review. **Completed UI slice.** |
| 2 | Dashboard operations | `/dashboards`, `/dashboards/studio`, dashboard view/edit/metrics | Splunk Dashboard Studio, Elastic dashboards/Lens, Microsoft Sentinel workbooks, Grafana | Enterprise gallery/runtime/low-code Studio implemented; `DSH-001`–`DSH-010` recorded. **Completed UI slice; production backend contract remains partial.** |
| 3 | Reporting and SOC communications | `/reports/scheduled`, report templates, SITREP, incident and after-action reports | Splunk reporting, Sentinel workbooks/playbooks, ServiceNow SecOps reporting, NIST incident communications | **UI IMPLEMENTED · CONTRACT RECORDED · FIXTURE-BROWSER VERIFIED.** One governed generated/scheduled/template lifecycle now spans all legacy entry routes. Production generation, review, delivery and retention remain `REP-001`–`REP-010`. |
| 4 | Pipeline and ingestion administration | `/admin/pipeline-signals`, `/inputs/sources`, parsing/data-quality routes | Splunk Monitoring Console, Elastic Stack Monitoring, Sentinel health/data connectors, OpenSearch observability | **UI IMPLEMENTED · CONTRACT RECORDED · FIXTURE-BROWSER VERIFIED.** One source-to-index workspace covers Flow, Sources, Parsers, Failures and Capacity with governed onboarding/replay previews. Production operations remain `ING-001`–`ING-010`. |
| 5 | Integration and notification operations | `/admin/integrations`, `/admin/notifications`, API/service keys | Microsoft Sentinel content/data connectors, Elastic integrations/Fleet, Splunk apps/data inputs, ServiceNow integration hub | **UI IMPLEMENTED · CONTRACT RECORDED · FIXTURE-BROWSER VERIFIED.** One operations workbench now covers configured connections, delivery destinations/routes, service access and activity. Production operations remain `INO-001`–`INO-010`. |
| 6 | Identity, tenancy and MSSP administration | `/admin/users`, `/admin/tenants`, SCIM, SSO and tenant settings | Microsoft Entra admin, Okta, Splunk workload/roles, Sentinel Lighthouse/MSSP | **UI IMPLEMENTED · CONTRACT RECORDED · FIXTURE-BROWSER VERIFIED.** One control plane now covers directory, tenants, reviews, federation and identity audit with explicit authority boundaries. Production lifecycle remains `IAM-001`–`IAM-010`. |
| 7 | Governance and platform settings | `/admin/audit`, retention, platform/system settings | ServiceNow audit/governance, Elastic security settings/audit, Splunk data retention, NIST 800-92 | **UI IMPLEMENTED · CONTRACT RECORDED · FIXTURE-BROWSER VERIFIED.** One control plane separates audit evidence, effective retention, secret-safe settings, change control and API lifecycle. Production operations remain `GOV-001`–`GOV-010`. |
| 8 | Orphan operational workflows | UEBA risk/timelines, endpoint timeline/quarantine/FIM/policies, threat intelligence | Exabeam/Sentinel UEBA, CrowdStrike/Microsoft Defender endpoint, MISP/OpenCTI | Route-by-route ownership and navigation; no isolated screen remains without bounded data, operational pivots, states and contract evidence. **Inventory + threat-intel honesty + policies enforcement evidence: STAGING CANDIDATE** (`research/orphan-operational-workflows-inventory.md`, `TI-001`–`TI-004`, `POL-001`–`POL-003`). Remaining orphans/depth still open. |
| 9 | Cross-product readiness closure | all visible routes | WCAG 2.2, OWASP ASVS/API, OEM consistency review | Dark/light, keyboard, density, responsive geometry, performance budgets, live backend/raw-log acceptance, deprecation telemetry and release evidence. |

## Scope guard

Completing a route visually does not mark its backend production ready. Each route receives the status vocabulary from `README.md`. Production fixture isolation, tenant authorization, stable pagination/caching, cancellation, partial-source and stale states, observability and raw-source acceptance remain release gates.
