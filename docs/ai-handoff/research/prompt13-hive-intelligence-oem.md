# Prompt 13 — Hive Intelligence (`/intelligence`) OEM research

Retrieved: **2026-08-27**

Purpose: decide Hive Intelligence IA so analysts can **look up IOCs, inspect feed honesty, and ask assistive SOC AI** — clearly distinct from `/search` (ad-hoc hunt), `/entities` (inventory + dossier), `/ueba/risk` (UEBA risk), and `/constellation` (graph). Paraphrase only. Product claim stays **STAGING CANDIDATE**.

Prior: Prompt 06–12 closed (Queue through Entities). Do not re-litigate those routes.

Base tip: `main` includes Prompt 12 Entities (`620fe8c`) — `based_on_main_includes_pr99: yes`.

Confirmed APIs for this slice (do not invent):
- Threat intel: `GET/PUT /api/ha-threat-intel/feeds`, `POST .../feeds/{id}/sync`, `POST /api/ha-threat-intel/lookup`, `GET /api/ha-threat-intel/iocs` (+ existing `GET /stats` already on page)
- SOC AI: `POST /api/ha-soc-ai/query` (NOT `/api/ha-ai/query`)
- Chat SSE: `POST /api/ha-ai/chat` only if this page uses streaming chat
- Do **not** call legacy `/api/v1/threat-intel` from frontend-v3 (TI-003)

---

## A1. Commercial SIEM (≥3)

### Splunk Enterprise Security / Mission Control — Threat Intelligence

| Item | Detail |
|---|---|
| Sources | [Threat intelligence dashboards](https://help.splunk.com/en/splunk-enterprise-security-8/user-guide/8.6/analytics/threat-intelligence-dashboards), [Access Threat Intelligence Management](https://docs.splunk.com/Documentation/MC/latest/Detect/AccessTIM), [Troubleshoot TI in ES](https://help.splunk.com/en/splunk-enterprise-security-8/troubleshoot/8.6/troubleshooting/troubleshoot-threat-intelligence-in-splunk-enterprise-security) |
| Access date | **2026-08-27** |
| IOC lookup first viewport | **Indicators** dashboard is a dedicated place to explore threat content from configured download sources; Mission Control exposes intelligence on the **Intelligence** tab of an investigation — lookup/enrichment is operational, not a chatbot home. |
| Feed health | Dedicated threat-intelligence audit / health panels; modular-input disabled states surface as errors — health is evidence-backed, not decorative green. |
| AI chat placement | Intelligence Management correlates observables with curated workflows; AI/copilot (where present) is **not** the primary TI surface. |
| Provenance | Indicator context shows intel source ID/path, threat category/group — source attribution is first-class. |

### Elastic Security — Intelligence / Indicators + AI Assistant patterns

| Item | Detail |
|---|---|
| Sources | [Indicators of compromise](https://www.elastic.co/docs/solutions/security/investigate/indicators-of-compromise), [Enable threat intelligence integrations](https://www.elastic.co/docs/solutions/security/get-started/enable-threat-intelligence-integrations), [Elastic Security UI](https://www.elastic.co/guide/en/security/8.19/es-ui-overview.html) |
| Access date | **2026-08-27** |
| IOC lookup first viewport | **Intelligence → Indicators** is the TI workbench: search/filter IOCs from enabled feeds; details flyout shows feed name, type, TLP/confidence **only when the feed provides them** (empty when absent). |
| Feed health | Threat Intelligence view on Overview shows source names from `threat.feed.name`; unnamed sources labeled **Other** — no fake “healthy” without ingested indicators. |
| AI chat placement | Elastic AI Assistant is a **separate assist** surface for analyst Q&A / investigation help — not a replacement for the Indicators table. |
| Provenance | Indicator overview tab: feed provenance, TLP, confidence when present; attach-to-case carries source context. |

### Microsoft Sentinel — Threat intelligence + Security Copilot (assistive framing)

| Item | Detail |
|---|---|
| Sources | [Security Copilot agents](https://learn.microsoft.com/en-us/copilot/security/security-copilot-application-card-agents), [RAI FAQs — agents](https://learn.microsoft.com/en-us/copilot/security/rai-faqs-security-copilot-agents), [Security Copilot in Defender](https://techcommunity.microsoft.com/blog/microsoftthreatprotectionblog/security-copilot-in-defender-empowering-the-soc-with-assistive-and-autonomous-ai/4503047) |
| Access date | **2026-08-27** |
| IOC lookup first viewport | Sentinel TI / entity enrichment remains the intel work surface; Copilot sits **beside** investigation, not instead of TI browsers. |
| Feed health | TI platform health is config/ops (connectors, workbooks) — empty TI stays empty. |
| AI chat placement | Security Copilot documents **assistive** (prompted summarization, NL→KQL) vs **autonomous agents** with admin-defined boundaries. HiveArmor must ship **assistive only** for this slice — no silent mutates. |
| Provenance | Copilot/agent outputs expect transparent reasoning and human control; HiveArmor must show STAGING CANDIDATE, confidence/sources when returned, and honesty when AI is unconfigured (503 / fallback copy). |

### Optional — Recorded Future / MISP enterprise UX (high level)

Enterprise TI portals emphasize **lookup → verdict + source → pivot to hunt/case**. Avoid decorative “AI confidence” meters without model provenance.

---

## A2. Open-source / open-core (≥3)

### MISP — event / IOC browse

| Item | Detail |
|---|---|
| Sources | [MISP project](https://www.misp-project.org/), MISP vs OpenCTI comparison literature (community) |
| Access date | **2026-08-27** |
| Borrow | Event/attribute browse with tags, TLP, org provenance; feed/sync status is operational truth. |
| Avoid | Presenting empty communities as “healthy green”; inventing AI scores on MISP attributes. |

### OpenCTI — knowledge / observables

| Item | Detail |
|---|---|
| Sources | [OpenCTI](https://filigran.io/solutions/open-cti/), [OpenCTI Cortex analyzer docs](https://thehive-project.github.io/Cortex-Analyzers/analyzers/OpenCTI/) |
| Access date | **2026-08-27** |
| Borrow | Observable-centric lookup with relationship context when graph data exists; STIX provenance. |
| Avoid | Rebuilding a full knowledge graph on `/intelligence` without confirmed graph APIs (Constellation is `/constellation`). |

### TheHive + Cortex analyzers

| Item | Detail |
|---|---|
| Sources | [TheHive](https://strangebee.com/thehive/), Cortex analyzer enablement docs |
| Access date | **2026-08-27** |
| Borrow | Observable enrichment is **explicit analyst action** (run analyzer) with result provenance; cases own response. |
| Avoid | Silent auto-enrichment that mutates cases; fake analyzer confidence. |

### Optional — Wazuh threat intel integrations

Wazuh documents feed integrations that enrich alerts when configured. Borrow honesty: no enrichment UI claims when feeds are off.

---

## A3. Implication table

| OEM pattern | HiveArmor implication |
|---|---|
| TI workbench ≠ chatbot toy | First viewport = **IOC lookup** + feed honesty; AI is assistive panel/tab with STAGING CANDIDATE. |
| Feed health from data | Show enabled/disabled, lastUpdated, indicatorCount from API; never invent “healthy” greens without data. |
| Empty / 503 honesty | Lookup miss, empty feeds, AI unconfigured → honest copy; no fixture IOC hits in production. |
| Provenance | Show source feed / verdict from lookup summary; AI shows sources + confidence when present, stub/unavailable when not. |
| Role gates | Feed enable/sync = Platform Administrator (human label); browse/lookup for Analyst / SOC Manager / Admin. |
| Cross-links | Mission Control · Search · Entities · Alerts · Incidents · UEBA risk (link only) · Constellation (link only). |
| Confirmed APIs only | `ha-threat-intel/*` + `ha-soc-ai/query`; never legacy v1; never `/ha-ai/query`. |
| Admin TAXII/MISP CRUD | Stays on `/admin/threat-intel` — not redesigned here. |
| Fixture-disabled | Production builds must not receive foundation fixtures. |

---

## A4. Decision: **RESTRUCTURE** (single route) — do **not** SPLIT routes

| Surface | Decision | Rationale |
|---|---|---|
| `/intelligence` TI workbench | **RESTRUCTURE** | Today: feeds-left / IOC-table-right; lookup buried in a footer bar after feed select. Re-identity as **threat intel + assistive SOC AI**; IOC lookup is hero; feeds health secondary; AI assistive panel. |
| AI chat as separate route | **KEEP combined** (no SPLIT) | Product placement assigns both jobs to `/intelligence`. Splitting would orphan AI or dilute TI. Panel/tab hierarchy is enough. |
| `/admin/threat-intel` | **KEEP** | TAXII/MISP CRUD remains Admin console — out of scope redesign. |
| Streaming `ha-ai/chat` | **KEEP optional / unused on this page** | Prefer synchronous `POST /api/ha-soc-ai/query` for assist Q&A; do not force SSE chat toy UX. |
| Legacy `/api/v1/threat-intel` | **KEEP forbidden** | Capabilities must not call it (TI-003). |

**Verdict:** **RESTRUCTURE** within `/intelligence` — IOC/feeds primary, assistive SOC AI secondary — comparable to Elastic Indicators + separate assist patterns, not a chatbot-first toy.

---

## Plan sketch (Phase B → C)

1. Job sentence + STAGING CANDIDATE + meta cross-links.
2. Hero: IOC lookup form + result honesty (empty/error/unknown verdict).
3. Feeds panel: list from `GET /feeds` with enabled honesty; sync/toggle Admin-gated with human labels.
4. Assist panel: `POST /ha-soc-ai/query` with assistive framing; show answer + confidence/sources; honesty when unconfigured / error.
5. Keep feed→IOC browser (TLP-aware) as drill-down; preserve Vitest TLP cases + add job/lookup/AI honesty tests.
6. Staging: codes-only for feeds, lookup, iocs, soc-ai/query.
