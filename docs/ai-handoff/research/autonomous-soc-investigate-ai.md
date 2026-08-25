# Autonomous SOC — Investigate & AI research (Wave A2)

Retrieved: **2026-08-25**

Purpose: preserve OEM/standard conclusions for HiveArmor Wave A2 routes
(`/search`, `/investigations`, `/entities`, `/intelligence`, `/ueba/risk`, `/constellation`).
Paraphrased design conclusions only — not copied vendor content. Status vocabulary
remains **STAGING CANDIDATE**; never claim `PRODUCTION READY` from this note alone.

## Official sources and conclusions

### Microsoft Defender XDR / Sentinel — investigation graph and entity pages

- Source: https://learn.microsoft.com/en-us/defender-xdr/investigate-incidents
- Source: https://learn.microsoft.com/en-us/azure/sentinel/entity-pages
- Date consulted: **2026-08-25**
- Paraphrase: Mature investigation UX centers an **attack/investigation graph** that connects alerts to users, devices, and other entities, with entity pages offering a unified timeline (alerts, anomalies, activities) over a bounded time range. Analysts play chronology on the graph and open entity panes for remediation — entity context is first-class, not a secondary dump.
- HiveArmor implication: Prefer **dossier + constellation** over a legacy `/entities/:id` detail that calls missing APIs. Soft-links and deep links should land on `/entities/:id/dossier`. Search/hunt and entity inventory must share queue-tier authority with backend `ALERT_QUEUE_AUTH`.

### Elastic Security — AI Assistant as assistive case evidence

- Source: https://www.elastic.co/docs/solutions/security/ai/ai-assistant
- Source: https://www.elastic.co/docs/solutions/security/ai/identify-investigate-document-threats
- Date consulted: **2026-08-25**
- Paraphrase: AI assists investigation (summaries, queries, remediation suggestions) and can **add messages to cases** with provenance; it does not silently close or mutate as autonomous authority. Attack discovery and chat stay reviewable analyst workflows.
- HiveArmor implication: Investigation Hive Intelligence / hypothesis generate controls must stay **disabled** until a secured AI contract exists, with unavailable copy — never fixture-looking affordances in production. Ask Hive remains assistive on alert/incident surfaces, not silent mutates.

### Splunk Enterprise Security — Mission Control TI on investigations

- Source: https://help.splunk.com/en/splunk-enterprise-security-8/user-guide/8.6/mission-control/investigate-observables-related-to-an-investigation-in-splunk-enterprise-security
- Source: https://docs.splunk.com/Documentation/MC/latest/Detect/AccessTIM
- Date consulted: **2026-08-25**
- Paraphrase: Threat intelligence is investigated as **observables on the investigation**, with priority scores when TIM is configured; missing intelligence routes analysts to search rather than inventing enrichment.
- HiveArmor implication: `/intelligence` remains the TI hub with honesty on sync/freshness; hunt assignee pickers and enrichment must use **confirmed** APIs (`/ha-incidents/users-assigned`, `/api/ha-threat-intel/*`) — never invent `/ha-users` or re-enable ungated `/api/v1/threat-intel` without cutover.

## Synthesized Wave A2 operator journey

1. Search & Hunt — bounded query, evidence selection, promote to incident with real assignees.
2. Entities / dossier — entity-centric timeline and relationships; constellation for graph expand.
3. Investigations — session/case wall with pinned artifacts; AI stubs fail closed.
4. Hive Intelligence — IOC/feed ops honesty; no LLM mute authority.
5. UEBA Risk — risk scores/trends with error/empty honesty before create-incident wiring.

## Gap matrix seeds (audit)

| Gap ID | Theme | Severity | Status |
|---|---|---|---|
| A2-AUTH-01 | Search nav/AuthGuard vs hunt `ALERT_QUEUE_AUTH` | High | Closed in thin PR |
| A2-AUTH-03 | Entities nav open vs AuthGuard queue | High | Closed in thin PR |
| A2-AUTH-04 | Constellation missing `ROLE_SOC_ANALYST` | High | Closed in thin PR |
| A2-ENT-01 | `/entities/:id` → missing detail/events APIs | High | Closed (redirect → dossier) |
| A2-SRCH-01 | Invented `/ha-users` assignee picker | Medium | Closed → `/ha-incidents/users-assigned` |
| A2-UEBA-01 | Risk dashboard missing error/empty honesty | Medium | Closed in thin PR |
| A2-INV-01 | Investigation AI affordances fixture-only | Medium | Thin copy honesty |
| A2-AUTH-02 | Investigations open nav (read OK) | Low | Documented fail-closed mutates |
| A2-TI-01/02 | TI USER read / freshness | Low | Backlog |
| A2-SRCH-02 | Dead v1 TI helpers in hunt service | Low | Next implement |
| A2-UEBA-02 | Create Incident CustomEvent may be unwired | Low | Next implement |

## Limitations and refresh trigger

Refresh when Defender investigation graph, Elastic AI Assistant/Cases, or Splunk TIM/Mission Control guidance changes, or when HiveArmor hunt/entity/constellation contracts change. Do not vendor live. No Kafka/Neo4j assumptions.
