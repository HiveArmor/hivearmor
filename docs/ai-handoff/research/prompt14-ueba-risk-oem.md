# Prompt 14 — UEBA Risk Dashboard (`/ueba/risk`) OEM research

Retrieved: **2026-08-28**

Purpose: decide UEBA risk dashboard IA so user risk scores, trends, and anomalies are **behavioral risk overview** — prioritize users by aggregate score, inspect contributing metrics, pivot to per-user behavioral timeline — clearly distinct from `/entities` (entity inventory/dossier), `/intelligence` (threat intel + assistive SOC AI), `/alerts` (triage), and `/search` (ad-hoc hunt). Paraphrase only. Product claim stays **STAGING CANDIDATE**.

Prior: Prompt 12 Entities; Prompt 13 Hive Intelligence.

Base tip: `main` includes Prompt 13 Hive Intelligence #100 (`4a6aa9d`) — `based_on_main_includes_pr100: yes`.

Confirmed APIs for this slice (do not invent):
- `GET /api/ha-ueba/risk-scores`
- `GET /api/ha-ueba/risk-trend`
- `GET /api/ha-ueba/anomaly-counts`
- `GET /api/ha-ueba/deviations`
- `GET /api/ha-ueba/peer-groups`
- `GET /api/ha-ueba/entity-timeline?userId=`

---

## A1. Commercial SIEM (≥3)

### Splunk Enterprise Security — UEBA dashboards

| Item | Detail |
|---|---|
| Sources | [UEBA overview](https://help.splunk.com/en/splunk-enterprise-security-8/administer/8.6/user-and-entity-behavior-analytics/user-and-entity-behavior-analytics-ueba-overview-in-splunk-enterprise-security), [Understanding the UEBA dashboards](https://help.splunk.com/en/splunk-enterprise-security-8/administer/8.6/user-and-entity-behavior-analytics/understanding-the-ueba-dashboards) |
| Access date | **2026-08-28** |
| Risk presentation | Entity Risk Score (ERS) per user/asset; overview dashboard shows highest-risk entities; entity analysis drill-down shows score + trend sparkline + contributing factors. |
| Trend charts | 7-day risk score trend with sparkline on entity analysis; overview shows environment-wide behavioral metrics. |
| Anomaly tiers | Findings from Risk data model feed score contributions; detection activity lists findings with tiered point values (10/25/50 style). |
| Pivot | Entity analysis → detection activity → UEBA baseline visualizations → investigation workflow. Empty when UEBA not licensed or no baseline data. |

### Elastic Security — Entity analytics / risk scoring

| Item | Detail |
|---|---|
| Sources | [Monitor entity risk](https://www.elastic.co/docs/solutions/security/advanced-entity-analytics/monitor-entity-risk), [Entity risk scoring](https://www.elastic.co/docs/solutions/security/advanced-entity-analytics/entity-risk-scoring), [Turn on risk scoring](https://www.elastic.co/docs/solutions/security/advanced-entity-analytics/turn-on-risk-scoring-engine) |
| Access date | **2026-08-28** |
| Risk presentation | Normalized 0–100 score with levels (Unknown→Critical); hosts/users/services lists are primary work surface; score explainable via alert aggregation + asset criticality + watchlist weights. |
| Trend charts | Risk score recalculated hourly; historical scores retained; entity analytics page shows recent anomalies panel when ML jobs run. |
| Anomaly tiers | Prebuilt ML anomaly detection jobs; severity filters; empty when jobs not installed — honest empty, not fabricated. |
| Pivot | Entity analytics → user/host detail risk tab → Alerts / Anomaly Explorer / Cases. Preview risky entities before enabling engine. |

### Microsoft Sentinel — UEBA / Entity behavior

| Item | Detail |
|---|---|
| Sources | [Identify threats with entity behavior analytics](https://learn.microsoft.com/en-us/azure/sentinel/identify-threats-with-entity-behavior-analytics), [Enable entity behavior analytics](https://learn.microsoft.com/en-us/azure/sentinel/enable-entity-behavior-analytics), [UEBA workbook v2](https://techcommunity.microsoft.com/blog/microsoftsentinelblog/unleash-the-full-potential-of-user-and-entity-behavior-analytics-with-our-update/4031570) |
| Access date | **2026-08-28** |
| Risk presentation | Investigation priority score (0–10, event-level) + anomaly score (0–1, behavior-level); entity behavior page searches entities and shows alert breakdown by type. |
| Trend charts | Workbook shows incidents/alerts/anomalies KPIs; top users/IPs/hosts by anomalies; incidents with anomalous entities up to 3 days prior. |
| Anomaly tiers | Anomalies table with severity; BehaviorAnalytics vs Anomalies tables serve different scoring purposes. |
| Pivot | Entity page → timeline of alerts/bookmarks → Logs hunt → incident graph. Empty when UEBA not enabled or no telemetry baselines. |

### Optional — Exabeam / Securonix

Both emphasize user-centric risk timelines and peer-group baselines. Borrow: per-user timeline pivot and peer-group context. Avoid: decorative ML heatmaps without API backing.

---

## A2. Open-source / open-core (≥3)

### Wazuh — Syscollector / anomaly views

| Item | Detail |
|---|---|
| Sources | [System inventory](https://documentation.wazuh.com/current/user-manual/capabilities/system-inventory/index.html) |
| Access date | **2026-08-28** |
| Borrow | Inventory honesty — panels only populate when collector data exists. |
| Avoid | Synthetic risk scores when only agent heartbeat is available. |

### OpenSearch Security Analytics — anomaly detection

| Item | Detail |
|---|---|
| Sources | [Anomaly detection](https://docs.opensearch.org/latest/observing-your-data/ad/index/) |
| Access date | **2026-08-28** |
| Borrow | Detector-based anomaly counts with tiered severity; empty state when detectors have not run. |
| Avoid | Decorative relationship graphs without a graph API. |

### TheHive — User-centric case pivots

| Item | Detail |
|---|---|
| Sources | [TheHive](https://strangebee.com/thehive/) |
| Access date | **2026-08-28** |
| Borrow | Observable/user pivots into cases; behavioral context is evidence, not case ownership. |
| Avoid | Conflating UEBA risk overview with the incident list. |

### Optional — Apache Metron

Legacy UEBA references emphasize peer profiling and triage scoring — borrow peer-group concept only when `/peer-groups` returns data; do not surface without rows.

---

## A3. Implication table

| OEM pattern | HiveArmor implication |
|---|---|
| Risk overview ≠ entity inventory ≠ threat intel | Job copy: **UEBA risk overview** — users, trends, anomalies. Cross-link Entities · Intelligence · Mission Control · Search · Investigations · Incidents. |
| Table/grid is hero (≥50%) | User risk table primary in first viewport; charts secondary sidebar — not stacked chart chrome above a buried grid. |
| Scores from live API only | Bar/trend/chips from `/risk-scores`, `/risk-trend`, `/anomaly-counts` — no fabricated ML scores. |
| Anomaly tiers | 10/25/50-point chips from `/anomaly-counts`; color-mix badge backgrounds, not solid fills. |
| Per-user timeline pivot | View Timeline drawer → `EntityTimelinePage` via `/entity-timeline?userId=`; deep-link route stays `/ueba/entity-timeline`. |
| Create incident honesty | No promote API from risk row — guide to Search & Hunt for evidence collection (A2-UEBA-02). |
| Empty staging honesty | UBA index often empty on staging — banner + empty table/chart copy; never PRODUCTION READY. |
| Role gates | Analyst \| SOC Manager \| Platform Administrator (JWT ROLE_*). |

---

## A4. Decision: **RESTRUCTURE** — **KEEP** route split

| Surface | Decision | Rationale |
|---|---|---|
| `/ueba/risk` RiskDashboardPage | **RESTRUCTURE** | APIs and drawer wiring exist but layout is chart-heavy (charts above table). Re-identity with job sentence, meta links, table-primary ≥50vh, compact chart sidebar, staging honesty banner. |
| `/ueba/entity-timeline` | **KEEP** | Deep-link + drawer embed already wired; touch only if drawer coherence breaks. |
| Entities / Intelligence | **KEEP separate** | Do not re-litigate Prompts 12–13. |
| Constellation graph | **OUT OF SCOPE** | Prompt 15. |

### Chart-heavy vs table-primary

**Table-primary with chart sidebar.** OEM leaders (Elastic entity analytics, Splunk UEBA overview) use a scannable entity/user list as the investigation starting point; trend and anomaly summary panels support prioritization but do not dominate the first viewport.

### Empty staging behavior

When all three primary endpoints return `[]` or zero counts: show STAGING CANDIDATE honesty banner explaining UEBA baseline engine may have no rows yet; per-panel empty copy; table empty state with link to Search & Hunt and Entities. No synthetic seed data in production UI.

---

## Phase B plan summary

1. Export `UEBA_RISK_JOB_SENTENCE`; header + STAGING CANDIDATE badge + sibling meta links.
2. Flip layout: `UserRiskTable` primary (min-height 50vh); charts + anomaly chips in secondary column.
3. Keep confirmed API wiring via `ueba.service.ts`; partial-error retry banner retained.
4. View Timeline drawer + Create Incident guidance unchanged in behavior.
5. Vitest: source-scan honesty + component tests updated for new structure.
6. Staging: rsync FE, verify each `ha-ueba/*` endpoint (counts only), headed smoke on `/ueba/risk`.
