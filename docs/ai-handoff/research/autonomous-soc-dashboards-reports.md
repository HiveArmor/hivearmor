# Autonomous SOC — Dashboards & reports research (Wave C1)

Retrieved: **2026-08-25**

Purpose: preserve OEM/standard conclusions for HiveArmor Wave C1 routes
(`/dashboards`, `/dashboards/studio`, `/reports/*`).
Paraphrased design conclusions only — not copied vendor content. Status vocabulary
remains **STAGING CANDIDATE**; never claim `PRODUCTION READY` from this note alone.

## Official sources and conclusions

### Splunk Dashboard Studio — governed panels and permissions

- Source: [Splunk Dashboard Studio overview](https://docs.splunk.com/Documentation/Splunk/latest/DashStudio/WhatIsDashStudio)
- Date consulted: **2026-08-25**
- Paraphrase: Mature dashboard UX separates **discovery/gallery**, **runtime with shared context**, and **authoring studio**. Panels declare data sources; permissions gate edit vs view; drilldowns are intentional pivots, not silent exports of raw customer payloads.
- HiveArmor implication: Keep gallery open to authenticated users for discovery; gate Studio/edit and visualization **run** to Analyst|SOC Manager|Admin (SEC-06). Do not claim bounded/tenant-scoped inventory when the legacy list lacks pagination headers.

### Microsoft Sentinel / Azure Workbooks — shared parameters without fake tenants

- Source: [https://learn.microsoft.com/en-us/azure/azure-monitor/visualize/workbooks-overview](https://learn.microsoft.com/en-us/azure/azure-monitor/visualize/workbooks-overview)
- Date consulted: **2026-08-25**
- Paraphrase: Workbooks bind **parameters** (time, resource scope) that actually drive queries. Decorative selectors that do not affect execution mislead operators.
- HiveArmor implication: Remove fictional Northwind/Contoso tenant chrome until DSH variable contracts apply filters to `/ha-visualizations/run`. Label UI-only time filters honestly.

### NIST SP 800-61 Rev. 3 — incident communications and evidence-backed reporting

- Source: [https://csrc.nist.gov/pubs/sp/800/61/r3/final](https://csrc.nist.gov/pubs/sp/800/61/r3/final)
- Date consulted: **2026-08-25**
- Paraphrase: Incident communications require **accurate, timely, authorized** reporting. Generating or distributing artifacts without a governed pipeline is an integrity failure, not a UI convenience.
- HiveArmor implication: Keep Queue generation disabled (`canSubmit={false}`). Treat schedule `POST …/run` as **last-execution stamp only** (REP-004) — never toast as “report generated.” Soften “Ready to distribute” KPI copy until approval/delivery contracts exist.

## Synthesized Wave C1 operator journey

1. Gallery — discover dashboards; open runtime panels via role-gated run.
2. Studio — author only with Analyst+; save remains fixture-only until DSH-002.
3. Reporting Operations — inventory legacy reports/schedules; generation/distribution blocked.
4. Templates — SOC Manager|Admin; live list empty until template API lands.

## Gap matrix seeds (audit)

| Gap ID | Theme | Severity | Status |
|---|---|---|---|
| C1-AUTH-01/02 | Studio/report AuthGuard vs nav | High | Closed — roles aligned |
| C1-API-01 | Absolute `VITE_BACKEND_URL` in dashboards.service | High | Closed — apiClient `/api/*` |
| C1-FIX-01 | Missing fixture-disabled aliases | Med | Closed |
| C1-REP-01/02/03 | Fake run / overclaim KPI / invented fields | Med | Thin honesty |
| C1-DSH-01/02 | Bounded claim / fictional tenants | Med | Thin honesty |
| C1-LIVE-01 | StatusDock `mode=live` on snapshot inventory | Low | Closed — historical outside fixtures |
| C1-AUTH-04 | Metrics builder ADMIN-only claim | Med | Closed — Analyst+ + save gated |

## Limitations and refresh trigger

Refresh when Splunk Dashboard Studio, Azure Workbooks, or NIST SP 800-61 guidance changes, or when HiveArmor DSH/REP contracts land. Do not vendor live. No Kafka/Neo4j assumptions.
