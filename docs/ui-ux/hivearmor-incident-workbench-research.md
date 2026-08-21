# HiveArmor Incident Workbench — research synthesis

Date: 2026-08-02  
Scope: `frontend-v3` incident detail and investigation workflow

## Product objective

Reduce the time between opening an incident and taking a defensible analyst action. The page must keep case identity, operational state, ownership, SLA, evidence, and investigation history available without forcing analysts to reconstruct context across routes.

## Official-product research

### Microsoft Sentinel

Microsoft describes incident details as the central location for an investigation. Its persistent context includes status, severity, owner, evidence, and entities, while the main workspace adds a timeline, similar incidents, entity context, and insights. Tasks, activity, comments, logs, and playbooks remain accessible without leaving the incident.

Source: [Investigate Microsoft Sentinel incidents in depth](https://learn.microsoft.com/en-us/azure/sentinel/investigate-incidents)

Design implication for HiveArmor: keep identity, severity, priority, state, SLA, owner, and core response actions persistent while investigation tabs change.

### Elastic Security

Elastic's alert-detail experience uses layered panels so analysts can inspect an alert, related entities, history, threat-intelligence matches, correlations, and raw fields while preserving navigation context. Its Timeline guidance also recommends selecting only the fields required for an investigation when querying large indices.

Sources: [View detection alert details](https://www.elastic.co/guide/en/security/current/view-alert-details.html), [Elastic Timeline](https://www.elastic.co/guide/en/security/current/timelines-ui.html)

Design implication for HiveArmor: linked-alert details open in a code-split side panel; the initial alert request is bounded to 50 rows; deeper data is requested only when its tab is opened.

### Google Security Operations

Google's current case model treats a case as a flexible container for alerts, detections, raw telemetry, entities, activity, and playbooks. The case top bar carries identity, priority, and stage. The platform uses persistent URLs, breadcrumbs, quick previews, entity graphs, case history, and dedicated investigation tabs.

Sources: [Investigation and case management overview](https://docs.cloud.google.com/chronicle/docs/secops/investigate/investigation-management/investigation-management-overview), [Investigate alerts](https://docs.cloud.google.com/chronicle/docs/investigation/investigate-alert)

Design implication for HiveArmor: the selected investigation tab is URL-addressable; alert details open without losing the incident; entity context is visible before an analyst opens a deeper entity dossier.

### Splunk Enterprise Security

Splunk lets analysts begin an investigation from Incident Review and continue gathering assets, identities, and supporting details in an investigation workbench.

Source: [Start an investigation in Splunk Enterprise Security](https://help.splunk.com/en/splunk-enterprise-security-7/user-guide/7.3/investigations/start-an-investigation-in-splunk-enterprise-security)

Design implication for HiveArmor: the incident is a durable work container, not a static detail record.

### OpenSearch Security Analytics

OpenSearch represents correlated findings as a knowledge graph that can be filtered by time, log type, and severity and inspected at increasing levels of detail.

Source: [Working with the correlation graph](https://docs.opensearch.org/latest/security-analytics/usage/correlation-graph/)

Design implication for HiveArmor: keep affected entities and correlations ready for later graph expansion, but do not render an empty graph or decorative canvas before relationship data is available.

## Information architecture adopted

1. Persistent case command bar
   - Back path and durable incident ID
   - Title, severity score, priority, status, owner, SLA, freshness
   - Ask Hive AI and preserve-evidence actions

2. Analyst context rail
   - What is happening
   - Recommended outcome
   - Affected entities and risk scores
   - Risk explanation derived from real incident and entity data

3. Investigation workspace
   - Overview
   - Timeline
   - Evidence
   - Linked alerts
   - Investigation sessions

4. Response rail
   - Immediate next actions
   - Supported case controls
   - Latest auditable activity
   - Confirmed closure and reopen actions

## Deliberate exclusions

- Removed the empty evidence-board canvas. It suggested capability without delivering investigative value.
- Removed the “Tasks coming soon” tab. The backend contract does not currently expose tasks.
- Removed inline editing for title, description, owner, and findings. Those controls previously appeared to save but the backend has no generic update endpoint.
- Did not invent notes, playbooks, similar incidents, entity graphs, or raw-event queries in production mode. These should be added only when their API contracts exist.

## Performance budget and loading policy

- Target LCP: under 2.5 seconds on a representative enterprise workstation.
- Case detail, timeline, and affected entities load in parallel; the case header is not blocked by supporting context.
- Evidence, linked alerts, sessions, the alert grid, alert drawer, AI summary, and AI chat are progressively loaded.
- The repository's esbuild fallback now preserves dynamic-import boundaries (`splitting=true`), reducing its entry bundle from 4,579 KB to 82 KB and emitting route/panel chunks. The canonical Vite production build retains its own native splitting strategy.
- Main incident cache: 30 seconds; timeline and linked alerts: 15 seconds; entities and sessions: 60 seconds.
- No page-level automatic refresh. Analysts retain control while reading or editing.
- Linked-alert review is bounded to the newest 50 rows; the UI explicitly reports when more results exist.
- Fixed-height skeletons reserve structure and avoid layout shift.
- Production never receives demonstration content. Fixtures require `VITE_USE_FOUNDATION_FIXTURES=true`; automatic fictional authentication is additionally limited to Vite development mode.

## Accessibility and interaction

- One top-level application `main` landmark; the investigation surface is a labelled section.
- URL-addressable tabs support Arrow Left/Right, Home, and End.
- Evidence uses an accessible listbox/option selection model and an `aria-live` detail reader.
- Incident ID and evidence references have named copy controls.
- Resolution requires confirmation; failed mutations preserve analyst input and show an inline error.
- Tested with automated WCAG 2.0 A/AA and WCAG 2.2 AA structural rules at component level.
- Responsive review completed at 1440×900, 1024×768, and 390×844 with no horizontal page overflow.
