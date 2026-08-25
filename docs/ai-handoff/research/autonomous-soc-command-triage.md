# Autonomous SOC — Command & triage research (Wave A1)

Retrieved: **2026-08-25**

Purpose: preserve OEM/standard conclusions for HiveArmor Wave A1 routes
(`/dashboard`, `/queue`, `/alerts`, `/correlated-findings`, `/incidents`).
Paraphrased design conclusions only — not copied vendor content. Status vocabulary
for product claims remains **STAGING CANDIDATE** honesty; never claim `PRODUCTION READY`
from this note alone.

## Official sources and conclusions

### Microsoft Defender / Sentinel — incident queue as primary triage surface

- Source: https://learn.microsoft.com/en-us/defender-xdr/incident-queue  
- Source: https://learn.microsoft.com/en-us/azure/sentinel/migration-security-operations-center-processes  
- Date consulted: **2026-08-25**
- Paraphrase: Mature SOCs triage a prioritized **incident queue** first (ownership, severity, entity context), then drill into contributing alerts. Queue assistants and prioritization scores surface “what matters now”; assignment, status, and investigation graph remain human-gated. Unified SecOps reduces context switching between alert and incident silos.
- HiveArmor implication: Command spine should prefer **queue → correlated finding / incident**, not a flat alert dump as the only primary work surface. Mission Control KPIs must reflect true queue/incident totals (or label sample/partial honestly). Role gates on queue APIs must match nav so non-analyst users do not land on empty/403 shells.

### Splunk Enterprise Security — Mission Control analyst queue

- Source: https://help.splunk.com/en/splunk-enterprise-security-8/administer/8.3/mission-control/manage-analyst-workflows-using-the-analyst-queue-in-splunk-enterprise-security  
- Source: https://help.splunk.com/en/splunk-enterprise-security-8/administer/8.3/mission-control/configure-the-settings-for-the-analyst-queue-in-splunk-enterprise-security  
- Date consulted: **2026-08-25**
- Paraphrase: ES Mission Control centralizes **findings and investigations** in one analyst queue with time-range bounds, auto-refresh, saved views, and actions (assign, suppress, adaptive response, add to investigation). Intermediate findings can be hidden from the top-level queue once attached to an investigation to prevent duplicate work.
- HiveArmor implication: `/queue` and `/correlated-findings` should share disposition semantics (owner, SLA, hide-when-promoted) and avoid double-counting promoted alerts as fresh triage work. Nav labels should map to queue-tier authorities (`ALERT_QUEUE_AUTH`), including `ROLE_SOC_ANALYST`.

### Elastic Security — alert → case triage loop (assistive automation)

- Source: https://www.elastic.co/docs/explore-analyze/workflows/use-cases/security/automate-security-operations/alert-triage-with-case  
- Source: https://www.elastic.co/security-labs/alert-triage-agentic-soc-elastic-workflows  
- Date consulted: **2026-08-25**
- Paraphrase: Automation enriches alerts, branches on evidence, opens cases, attaches observables, and may notify or contain — but agentic SOC pipelines write verdicts into **cases** with provenance; AI does not silently replace analyst authority. Deterministic checks can close obvious false positives before LLM spend.
- HiveArmor implication: AI surfaces on alert investigation (`/ha-soc-ai/*`, Ask Hive) must remain **assistive** with stub/unavailable honesty; never invent `/response/actions` or silent mutates. Investigation soft-link/pin stays STAGING CANDIDATE until LIVE verified.

### NIST SP 800-61 Rev. 3 — detect → triage → respond lifecycle

- Source: https://csrc.nist.gov/pubs/sp/800/61/r3/final  
- Source: https://doi.org/10.6028/NIST.SP.800-61r3  
- Date consulted: **2026-08-25**
- Paraphrase: Incident response is integrated with CSF 2.0 across preparation, detection/analysis, containment, and lessons learned — not a single terminal ticket screen. Communications and improvement need retained context across the lifecycle.
- HiveArmor implication: Wave A1 is the **Detect → Triage → Decide** spine; response/governance waves must not orphan evidence. Partial/error/cancellation states on Mission Control and queues are required for honest shift handover.

## Synthesized Wave A1 operator journey

1. Mission Control — shift risk, volume, ingestion health, priority work (honest totals or partial banners).
2. Analyst Queue / Alerts — high-volume triage with ownership, SLA, density, live/historical honesty.
3. Correlated Findings — multi-alert attack stories before or beside raw alerts.
4. Incidents — owned cases with evidence, status, and human decision gates.
5. AI — enrichment and narrative assist only; authority-gated mutate/respond.

## Gap matrix seeds (audit)

| Gap ID | Theme | Severity | Note | Status |
|---|---|---|---|---|
| A1-AUTH-01 | Nav/AuthGuard vs `ALERT_QUEUE_AUTH` | High | Alerts/CF were any-auth; Queue/Incidents omitted `ROLE_SOC_ANALYST` — thin fix in #55 | Closed (#55) |
| A1-KPI-01 | Mission Control sample KPIs | High | Critical/SLA/unassigned derived from `size:5` incident page — understates risk | Closed (gaps PR — population counts) |
| A1-SSE-01 | Dual alert SSE | Medium | FE used `/api/alerts/stream`; hardened `/api/ha-alerts/stream` exists | Closed (gaps PR) |
| A1-LEGACY-01 | `/offenses/:id` redirect | Medium | Dropped id (thin fix: preserve → `/correlated-findings/:id`) | Closed (#55) |
| A1-AI-01 | Alert response catalogue path | Medium | Keep confirmed `HaResponseActionResource` `/response/actions`; fail-closed static on error | Closed (gaps PR) |
| A1-DET-01 | Detection health counts | Low | `correlation-rule` `size:1` + array length vs `X-Total-Count` | Closed (gaps PR) |
| A1-OVW-01 | Overview auth | Low | `/api/overview/*` lacked method-level `@PreAuthorize` | Closed (gaps PR — `ALERT_QUEUE_AUTH`) |

## Limitations and refresh trigger

Refresh when Microsoft Defender queue, Splunk ES Mission Control, Elastic Workflows/Cases, or NIST IR guidance changes, or when HiveArmor `ALERT_QUEUE_AUTH` / COR / ALT contracts change. Do not vendor live. No Kafka/Neo4j assumptions.
