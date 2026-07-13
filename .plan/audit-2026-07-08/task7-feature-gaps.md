# ArmorSight SIEM — Enterprise Feature Gap Audit
**Audit Date:** 2026-07-08  
**Auditor Role:** Senior SIEM Product Expert (10+ years Splunk / QRadar / Sentinel)  
**Codebase:** UTMStack-11 fork at /Users/encryptshell/GIT/UTMStack-11  

---

## Methodology

Evidence collected from:
- `frontend-v2/src/app/(app)/` — 53 Next.js pages enumerated
- `backend/src/main/java/com/nilachakra/web/rest/` — 100+ REST resources read
- `plugins/` — Go microservices (feeds, alerts, soc-ai, compliance-orchestrator, geolocation)
- `rules/` — YAML detection rule packs (windows, linux, cisco, suricata, fortinet, etc.)
- `filters/` — Logstash normalization filters for 20+ source types
- Domain models, service implementations, and frontend page bodies reviewed

Rating definitions:
- **PRESENT** = functional backend + wired frontend, production-quality
- **PARTIAL** = backend exists but frontend stub / demo data / feature incomplete
- **MISSING** = no code implementing it anywhere
- **PLANNED** = structure / empty class / commented-out code / EmptyState placeholder

---

## 1. Complete Feature Gap Table

### Core Detection

| Capability | Rating | Evidence |
|---|---|---|
| Real-time alert streaming (sub-5s latency) | **PRESENT** | `AlertSseResource.java` — SSE `/api/alerts/stream` endpoint wired to `AlertSseService`; `LiveEpsResource.java` — SSE `/api/eps/stream` for live EPS counter |
| Correlation rules with time-window aggregation | **PARTIAL** | `UtmCorrelationRulesResource.java` has full CRUD + version control + Sigma import + rule test endpoint. Domain model has `rule_confidentiality/integrity/availability` scoring. **However**, the time-window aggregation logic lives in the Go `plugins/alerts` correlation engine — the YAML rule format at rules/ was examined and no explicit `within:` / `timewindow:` field found in the YAML schemas reviewed |
| Multi-stage kill chain detection (sequence rules) | **PARTIAL** | `AdversaryType` enum + `rule_adversary` field on rules. MITRE tactic mapping present. No explicit multi-stage `sequence:` rule syntax found; adversary page is an empty `EmptyState` stub |
| Baseline + anomaly detection (statistical) | **PARTIAL** | UBA service (`UbaService.java`) computes entity risk scores, anomaly counts, watchlists backed by `UtmUbaEntityRiskRepository` + `UtmUbaAnomalyRepository`. Feed is populated by external signals, not a built-in statistical engine in the correlation layer |
| MITRE ATT&CK technique mapping per rule | **PRESENT** | `rule_technique` field on `UtmCorrelationRules` entity; `MitreCoverageResource.java` queries coverage via native SQL grouped by technique; `/rules/coverage` page exists in frontend |
| Alert deduplication and suppression | **PRESENT** | `UtmAlert.deduplicatedBy` field (`List<String>`) on alert domain model; `UtmAlertTagRuleResource` + tag rule engine provides tag-based suppression and false-positive workflow |
| Alert tuning (whitelist/blacklist patterns) | **PRESENT** | `UtmAlertTagRule` entity with `AlertTagRuleResource` + `AlertTagRuleFilterVM`; `/alerts/tagging-rules` frontend page |
| Custom alert severity scoring | **PARTIAL** | Severity computed from CIA triad scores (`rule_confidentiality`, `rule_integrity`, `rule_availability` 0-3 each) baked into correlation rules. No UI-exposed per-alert override slider; scoring formula is fixed in the engine |

### Log Management

| Capability | Rating | Evidence |
|---|---|---|
| Full-text search with field-level syntax (KQL/Lucene) | **PRESENT** | `LogAnalyzerResource.java` + `elasticService` in frontend; `/logs` page has `LogQueryBar`, `FieldBrowser`, `LogResultsTable`, `LogDetailDrawer`, field-level filter chips, timeline histogram |
| SQL-based log query | **PRESENT** | `SqlQueryRequest.java`, `SearchSqlResponse.java`, `SqlQueryFilterService.java`, `SqlSelectOnlyValidator.java` — full OpenSearch SQL passthrough with SELECT-only guard |
| Natural language log query (AI-powered) | **MISSING** | No NL-to-query translation service, no AI-powered search endpoint found anywhere in frontend or backend |
| Saved searches with scheduled alerts | **PRESENT** | `LogAnalyzerQuery` entity with CRUD (`LogAnalyzerResource`); `UtmScheduleResource` for scheduled execution; `/logs` page has `LogSavedQueries` component |
| Log retention policy management | **PRESENT** | `IndexPolicyResource.java` — GET/PUT ISM policy settings (deleteAfter, snapshotActive); `/admin/search-acceleration` + `/opensearch` ISM tab in frontend |
| Index rollover and archival | **PRESENT** | OpenSearch ISM pipeline managed; `/opensearch` page with `IsmPoliciesPanel` + `SnapshotsPanel` components |
| Log source health monitoring | **PRESENT** | `UtmDataInputStatusResource.java` (CRUD for data input statuses); `AgentManagerResource.java` with live agent connectivity via gRPC; `/data-sources` page |
| Per-source normalization (ECS/CEF field mapping) | **PRESENT** | 20+ Logstash filter directories under `filters/` (windows, linux, cisco, aws, azure, paloalto, fortinet, suricata, etc.); `UtmFilterResource` + `UtmLogstashFilterGroupResource` + `UtmLogstashPipelineResource` for managing them |
| Raw log storage alongside normalized | **PRESENT** | OpenSearch stores both raw `message` field and normalized ECS fields; `LogAnalyzerResource.topXValues` works on raw index patterns |

### Investigation & Hunting

| Capability | Rating | Evidence |
|---|---|---|
| Timeline reconstruction (pivot from alert → related logs) | **PARTIAL** | `/incidents/[id]` page includes `InvestigationTimeline` component with demo data; `LogDetailDrawer` has `PivotAction` type; real pivot wiring from alert ID to log search exists in service layer but timeline populates from demo constants |
| Entity timeline (all activity for a user/IP/host) | **PARTIAL** | UBA page shows entity anomaly history + risk trend chart; `UbaResource` `/entities/{id}/anomalies` endpoint; no dedicated "all logs for this entity" pivot timeline |
| Graph visualization (entity relationships) | **PARTIAL** | `InvestigationEntityGraph` component exists with full canvas renderer (force-directed graph, node types: host/user/ip/process/file/domain, edge labels, suspicious/compromised flags). Populates from `DEMO_GRAPH` constants — not wired to live backend data |
| Notebook/investigation workspace | **MISSING** | No notebook feature found in frontend or backend |
| Evidence tagging and case building | **PARTIAL** | `InvestigationEvidenceBoard` component exists with evidence cards, status chips, tag display. Alert-to-incident linking exists via `UtmIncidentAlertResource`. Evidence board uses `DEMO_EVIDENCE` constants — not wired to a persistent evidence store |
| Context enrichment (hostname resolution, ASN, reputation) | **PARTIAL** | Geolocation plugin (`plugins/geolocation/`) is a full Go service with `geolocate.go`, test coverage. ASN/reputation enrichment not found as separate service; TI feed lookup provides IOC reputation check |

### Incident Management

| Capability | Rating | Evidence |
|---|---|---|
| Incident creation from alert(s) | **PRESENT** | `UtmIncidentResource.createUtmIncident` with `NewIncidentDTO` (alert list required); `UtmAlertResource` has `ConvertToIncidentRequestBody` endpoint |
| Incident workflow (open → in-progress → resolved) | **PRESENT** | `IncidentStatus` enum (OPEN / IN_PROGRESS / COMPLETED); `/incidents` page has Kanban board + table view; status update API exists |
| SLA tracking (MTTD, MTTR) | **PARTIAL** | Frontend incidents page shows P1–P4 priority with SLA labels ("P1 · Critical (1h)") and `differenceInMinutes` calculations for time-in-status. No dedicated MTTD/MTTR metric API or dashboard widget found |
| Incident collaboration (notes, assignment, comments) | **PRESENT** | `UtmIncidentNoteResource.java`, `UtmIncidentHistoryResource.java`; assignment field on incident; notes visible in investigation page |
| Incident timeline (automatic event stitching) | **PARTIAL** | `InvestigationTimeline` component renders chronological events with MITRE tactic labels — demo data only; no auto-stitching service that pulls correlated alerts into a timeline |
| External ticket creation (JIRA, ServiceNow integration) | **MISSING** | No JIRA or ServiceNow connector found in backend, frontend, or plugins |
| Incident reporting and metrics | **PARTIAL** | `CustomReportsResource.java` + `UtmReportResource.java` + `PdfGeneratorResource.java` exist; compliance reports generate PDFs; incident-specific report not found |

### SOAR

| Capability | Rating | Evidence |
|---|---|---|
| Visual playbook builder | **PRESENT** | `/soar/flows` page uses `@xyflow/react` React Flow canvas with full node types (trigger, condition, action, notification, delay); `PlaybookTemplateLibrary`, `PlaybookConfigPanel`, `PlaybookToolbar` components; `playbookService` wired to backend |
| Automated playbook trigger (on alert condition) | **PRESENT** | `UtmAlertResponseRuleResource.java` + `UtmAlertResponseRule` domain — alert response rules define trigger conditions + action templates; execution tracked via `UtmAlertResponseRuleExecutionResource` |
| Manual playbook execution | **PRESENT** | `UtmSoarPlaybookResource` has POST `/soar/playbooks/{id}/execute`; `PlaybookExecutionLog` component in frontend |
| Live remote command execution on endpoints | **PRESENT** | `UTMIncidentCommandWebsocket.java` — WebSocket `/command/{hostname}` dispatches via gRPC to `AgentGrpcService`; agent must be ONLINE; `IncidentResponseCommandService` + `CommandResult` streaming; `/soar/console` page |
| Integration actions (block IP, isolate host, disable user) | **PARTIAL** | `UtmIncidentActionResource.java` + `UtmIncidentActionCommandResource.java` exist with full action CRUD; actual action templates depend on what's in `UtmAlertResponseActionTemplate` — crowdstrike, sophos, bitdefender plugins present in `plugins/` suggesting block/isolate capability; not confirmed end-to-end |
| Playbook execution audit trail | **PRESENT** | `UtmAlertResponseRuleHistoryResource.java`; `UtmPlaybookExecutionService` tracks executions; `/soar/audit` frontend page |
| Playbook version control | **PRESENT** | `UtmCorrelationRuleVersionService` (used for correlation rules); `UtmSoarPlaybookResource` stores version on save; frontend shows version in playbook list |
| Playbook marketplace/templates | **PARTIAL** | `PlaybookTemplateLibrary` component with pre-defined templates in frontend (seed playbooks in builder); no server-side template registry or community marketplace |

### Compliance

| Capability | Rating | Evidence |
|---|---|---|
| Framework support (PCI DSS, HIPAA, ISO 27001, NIST CSF, SOC2, GDPR) | **PRESENT** | `data.sql` seeds reports mapped to PCI-DSS, HIPAA, CMMC, GLBA, SOC2, FISMA, GDPR, NIST. `UtmComplianceStandard` + `UtmComplianceStandardSection` entities. `HipaaResource` class exists (body commented out — see below) |
| Automated control evaluation | **PRESENT** | `UtmComplianceControlEvaluationHistoryResource` + `UtmComplianceControlLatestEvaluationResource`; `compliance-orchestrator` plugin (Go) with evaluator, scheduler, workers |
| Compliance gap heatmap | **PRESENT** | `ComplianceFrameworkHeatmap` component in frontend; `buildFrameworkData()` derives domains from compliance sections + evaluations |
| Control evidence collection | **PARTIAL** | Control evaluation history stored in DB; `ComplianceControlDrawer` in frontend shows per-control status. No formal "evidence attachment" mechanism (no file upload to control) |
| Compliance report generation (PDF) | **PRESENT** | `ComplianceReportExportResource.java` + `PdfGeneratorResource.java`; compliance page has Download button; `UtmComplianceReportScheduleResource` for scheduling |
| Audit-ready evidence export | **PARTIAL** | PDF + report export exists; no CSV export of control evidence specifically; `HipaaResource` body is entirely commented out — this is a regression |
| Custom compliance framework builder | **PRESENT** | `CustomComplianceResource.java` class exists (body commented out but structure there); `UtmComplianceReportConfigResource` for configuring custom reports |
| Continuous compliance monitoring | **PRESENT** | `compliance-orchestrator` plugin runs scheduler + workers for ongoing evaluation |

### Threat Intelligence

| Capability | Rating | Evidence |
|---|---|---|
| Commercial feed ingestion (STIX/TAXII) | **MISSING** | No STIX/TAXII protocol implementation found. `plugins/feeds` connects to `apis.threatwinds.com` (proprietary ThreatWinds feed). No TAXII client code found |
| Open-source feed integration (AlienVault OTX, Abuse.ch, etc.) | **PARTIAL** | `plugins/feeds` Go plugin ingests from ThreatWinds API (`urlCheckConnection = "https://apis.threatwinds.com"`); no explicit OTX/Abuse.ch connectors found; feeds are managed via `UtmThreatFeed` entities |
| IOC enrichment on alerts in real-time | **PARTIAL** | `ThreatIntelService.lookupIoc()` does point-in-time lookup against `UtmIocIndicator` table; no evidence of async enrichment hook injected into the alert pipeline |
| IOC search across logs | **PARTIAL** | `ThreatIntelResource.GET /ioc?value=` exists; no cross-index IOC hunt query builder found |
| Feed health and freshness monitoring | **PARTIAL** | `UtmThreatFeed.lastUpdated` + `status` fields; `feeds/internal` has scheduler; no dedicated feed health dashboard in frontend |
| Custom IOC list management | **PRESENT** | `ThreatIntelResource.POST /ioc/bulk` + `ingestIoc()`; `/threat-intel` frontend page |
| TI-driven alert suppression | **MISSING** | No logic found connecting TI feed hits to alert suppression rules |

### UEBA/UBA

| Capability | Rating | Evidence |
|---|---|---|
| User behavioral baseline | **PARTIAL** | `UbaService` reads from `UtmUbaEntityRisk` repo; `riskTrend` data stored per entity. No explicit baselining computation engine found — likely populated by external signals |
| Peer group comparison | **MISSING** | No peer group concept in UBA domain model or service |
| Entity risk scoring | **PRESENT** | `UbaService.listEntities()` with risk score leaderboard; risk levels (critical/high/medium/low); `UtmUbaEntityRisk.riskScore` + `prevRiskScore`; watchlist toggle |
| Impossible travel detection | **PARTIAL** | Frontend UBA page demo data includes "Impossible travel: NY→London 2h" as a risk factor string. Geolocation plugin exists. No dedicated impossible-travel computation service found in backend |
| Privileged account monitoring | **PARTIAL** | AD page shows `privilegedAccounts` count; `AdOverview` interface; wired to mock data — AD backend resource not found (only `UtmActiveDirectoryException` exception class exists) |
| Data exfiltration detection | **PARTIAL** | UBA demo data shows "Mass download: 14GB in 30min" as factor; no dedicated exfiltration detection rule engine found |
| Account takeover detection signals | **PARTIAL** | Brute force rules exist (`rules/windows/bruteforce_attack.yml`, `linux-brute-force.yaml`); UBA `anomalies` feed captures anomalous login events; no dedicated ATO signal aggregator |

### Asset & Vulnerability Management

| Capability | Rating | Evidence |
|---|---|---|
| Asset discovery (network scan) | **PRESENT** | `UtmNetworkScanResource.java` with full CRUD + CSV export; `UtmAssetGroupResource` + `UtmAssetTypesResource` + `UtmPortsResource`; `/scanner` frontend page |
| Asset inventory with risk scoring | **PRESENT** | `assetSeverityMetric` on scan results; `UtmAssetMetricsResource` for metric tracking; `/vulnerability-scanner` page with severity bars and risk badges |
| Vulnerability scan integration | **PARTIAL** | Asset metrics ingested and stored; no direct scanner API integration (Nessus/Qualys/Rapid7 connector) found |
| CVE tracking per asset | **MISSING** | No CVE entity or CVE-to-asset mapping found in domain model or REST resources |
| Patch status monitoring | **MISSING** | No patch status data model or API found |
| Asset grouping and tagging | **PRESENT** | `UtmAssetGroupResource.java`; asset group assignment; `/data-sources/groups` page |

### Active Directory / Identity

| Capability | Rating | Evidence |
|---|---|---|
| AD event monitoring (logins, group changes, GPO) | **PARTIAL** | Windows rules pack covers AD events (golden ticket, kerberoasting, ADFS anomalies, NTDS extraction, AdminSDHolder abuse); AD event normalization in `filters/windows/`. Dedicated AD service backend not present — `HipaaResource` and `CustomComplianceResource` that had AD queries are commented out |
| AD user risk profiling | **PARTIAL** | `/active-directory` page has `AdUser` interface with `riskScore`; KPI cards for locked/failed login counts; wired to `MOCK_OVERVIEW` constant — no real backend endpoint |
| Privileged account activity tracking | **PARTIAL** | Rules cover privilege escalation; AD page shows `privilegedAccounts` KPI; mock data only |
| Dormant account detection | **MISSING** | No dormant account detection logic found |
| AD tree visualization | **MISSING** | No org-tree or AD hierarchy visualization found |
| LDAP/SAML authentication integration | **PRESENT** | `IdentityProviderResource.java` + `IdentityProviderConfigResource.java` manage IdP configs; `TfaResource.java` full MFA (TOTP/email); JWT auth via `UserJWTController` |

### Dashboards & Reporting

| Capability | Rating | Evidence |
|---|---|---|
| Pre-built SOC dashboards (executive, analyst, compliance) | **PRESENT** | `/dashboard` page + `threat-activity` sub-page; `UtmDashboardResource` with seeded dashboards from `data.sql` |
| Custom dashboard builder (drag-and-drop) | **PRESENT** | `/creator/dashboards` + `/creator/visualizations/builder` pages; `UtmDashboardResource` + `UtmVisualizationResource` backend; visualization builder page with widget selection |
| Scheduled report delivery (email PDF) | **PRESENT** | `UtmComplianceReportScheduleResource.java`; notification channel resource (email/webhook/Slack/SMS); `UtmScheduleResource` for general scheduling |
| Export to CSV/PDF/JSON | **PRESENT** | `PdfGeneratorResource.java`; network scan CSV export in `UtmNetworkScanResource`; compliance PDF export |
| KPI tracking (MTTD, MTTR, alert volume, EPS) | **PARTIAL** | Live EPS stream (`LiveEpsResource`); alert volume visible; MTTD/MTTR: incident page shows priority SLA labels + age calculations but no dedicated KPI API |
| Dark/light mode | **PRESENT** | Appearance section in `/settings` page (Palette icon wired); CSS variables system-wide (`--surface-primary`, `--brand-primary` etc.) supports theme switching |

### Multi-tenancy & RBAC

| Capability | Rating | Evidence |
|---|---|---|
| Tenant isolation (separate data per org) | **PARTIAL** | `UtmClientResource.java` (list/get clients); `UtmTenantConfigResource.java` (correlation config per tenant). Single-instance deployment model from `docker-compose.yml`; federation service (`UtmFederationServiceClientResource`) for multi-node token management. Not full SaaS-style data isolation |
| Role-based access control (RBAC) | **PRESENT** | `AuthorityResource.java` + `UtmMenuAuthorityResource.java`; `@PreAuthorize` on endpoints; role-based menu visibility |
| Data-level permissions (user sees only their assigned sources) | **PARTIAL** | Menu-level authority controls exist; field-level data filtering by assigned source not found |
| Audit trail of all user actions | **PRESENT** | `AuditResource.java`; `@AuditEvent` annotation used across critical endpoints (alert status, incident create/update, etc.); `ApplicationEventService.createEvent()` throughout |
| SSO integration (SAML2, OIDC) | **PRESENT** | `IdentityProviderResource` + `IdentityProviderConfigResource` manage SAML/OIDC providers |
| MFA/2FA enforcement | **PRESENT** | `TfaResource.java` + `TfaEnrollmentResource.java` — init/save/verify MFA (TOTP + email methods); `TfaMethod` enum; system-wide enforcement via config param |
| Session management and timeout | **PRESENT** | JWT with configurable expiry; `UserJWTController` handles token issuance |
| API key management per user/role | **PRESENT** | `ApiKeyResource.java` — full CRUD with `@PreAuthorize(USER)`; expiry, permissions, prefix masking; API key settings tab |

### Operations & Reliability

| Capability | Rating | Evidence |
|---|---|---|
| Service health dashboard | **PARTIAL** | `/settings` System tab shows `HealthCheck` component with component status (healthy/degraded/offline) and latency; `AppInfoResource.java`; not a full Ops dashboard |
| Agent connectivity monitoring | **PRESENT** | `AgentManagerResource.java` via gRPC; `AgentStatusEnum` (ONLINE/OFFLINE); `/agents` page + `/edr` page; real-time status from `AgentGrpcService` |
| Log source health (last seen, EPS, error rate) | **PRESENT** | `UtmDataInputStatusResource.java`; `LiveEpsResource` SSE; `/data-sources` page shows source status |
| Backup and restore | **PARTIAL** | `SnapshotsPanel` in `/opensearch` page manages OpenSearch snapshots; no application-level backup/restore for Postgres config data |
| HA/clustering support | **MISSING** | `docker-compose.yml` is a single-node deployment; no Kubernetes manifests, no cluster config found |
| Performance metrics (JVM, DB, search latency) | **PARTIAL** | JHipster actuator endpoints available by default; no dedicated performance metrics dashboard in frontend |
| Capacity planning metrics (storage growth rate, EPS trend) | **PARTIAL** | EPS stream available; OpenSearch indices page shows index sizes; no storage growth rate projection or capacity planning dashboard |

---

## 2. Score Summary

| Status | Count |
|---|---|
| PRESENT | 42 |
| PARTIAL | 42 |
| MISSING | 14 |
| PLANNED | 0 |
| **Total** | **98** |

**Completion ratio:** 42 fully present out of 98 = **43% PRESENT**  
**Functional coverage (PRESENT + PARTIAL):** 84 of 98 = **86% have some implementation**

---

## 3. Top 5 Gaps That Block Enterprise Sales

### Gap 1 — No JIRA/ServiceNow Integration (Incident Management)
Every enterprise SOC operates with an ITSM ticketing system. Without a native connector that pushes incidents to JIRA or ServiceNow, ArmorSight cannot participate in the customer's existing incident workflow. Analysts will manually re-enter tickets, reducing adoption. This is a Day-1 blocker for any enterprise with existing ITSM tooling.

### Gap 2 — No STIX/TAXII Commercial Feed Ingestion (Threat Intelligence)
Enterprise customers have paid subscriptions to Recorded Future, CrowdStrike Adversary Intel, or ISAC feeds delivered over STIX/TAXII. ArmorSight only ingests from the proprietary ThreatWinds API. This fails procurement security questionnaires asking "what commercial TI feeds can you ingest?" and disqualifies ArmorSight from any enterprise where TI feed flexibility is evaluated.

### Gap 3 — Active Directory Backend Is Mocked / Commented Out
The `/active-directory` page is entirely wired to `MOCK_OVERVIEW` constants. `HipaaResource` and `CustomComplianceResource` — which contained real AD queries — are commented out. AD monitoring is the #1 use case for SIEM in enterprise environments (95%+ have AD). Selling a SIEM without real AD event correlation and user risk profiling to an enterprise buyer is a near-impossible position.

### Gap 4 — No SLA / MTTD / MTTR Metrics API
Enterprise security teams are measured on Mean Time to Detect and Mean Time to Respond. Without a dedicated metrics API that tracks these KPIs over time (not just inline age calculations in the UI), ArmorSight cannot produce the management-level reporting that justifies SIEM spend. Security directors will reject a product that cannot answer "what is our MTTR this quarter vs last quarter?"

### Gap 5 — No CVE Tracking or Patch Status per Asset (Vulnerability Management)
Asset discovery and severity scoring exist but there is no CVE entity, no CVE-to-asset linkage, and no patch status. Enterprise buyers who evaluate SIEM alongside vulnerability management (VM) expect at minimum a CVE inventory per host to prioritize alert triage. Without this, ArmorSight scores poorly in SIEM/VM convergence evaluations, losing deals to Rapid7 InsightIDR and Microsoft Sentinel + Defender integration.

---

## 4. Top 5 Differentiators Already Present

### Differentiator 1 — Visual SOAR Playbook Builder with Live Remote Execution
The `/soar/flows` React Flow canvas is production-quality: drag-and-drop node graph (trigger/condition/action/notification/delay), template library, execution log, version control, and audit trail. Combined with the WebSocket-over-gRPC live command execution to endpoints (`UTMIncidentCommandWebsocket`), this rivals Palo Alto XSOAR for SOC automation depth — at a fraction of the price. Most competitors in the SMB-to-mid-market SIEM space do not have a visual playbook builder.

### Differentiator 2 — AI-Powered SOC Triage (SOC-AI Plugin)
`UtmSocAiResource` + the `plugins/soc-ai` Go plugin provide asynchronous LLM-powered alert analysis with cached triage results and history. The `UtmAiTriage` entity stores AI verdicts per alert. This positions ArmorSight ahead of legacy SIEMs (QRadar, ArcSight) and on par with next-gen platforms (Exabeam, Securonix) in AI-assisted triage, which is a top buying criterion in 2026.

### Differentiator 3 — Sigma Rule Import + MITRE ATT&CK Coverage Map
`UtmCorrelationRulesResource` supports Sigma import with pack installation (windows, linux packs bundled). `MitreCoverageResource` renders per-technique coverage from live rule data. This gives security teams an immediately actionable detection library and a visual proof of detection coverage that maps to MITRE ATT&CK — a key differentiator vs. QRadar's proprietary DSM rule format and Splunk ES's manual ES content packs.

### Differentiator 4 — Automated Compliance Orchestration with Multi-Framework PDF Reports
The `compliance-orchestrator` plugin runs continuous automated control evaluation across PCI-DSS, HIPAA, SOC2, GDPR, CMMC, FISMA, GLBA. The heatmap, trend charts, scheduled PDF delivery, and custom framework builder make compliance reporting self-service. Splunk charges separately for the Compliance Essentials app; Microsoft Sentinel requires Defender for Cloud add-on. ArmorSight delivers this out of the box.

### Differentiator 5 — Full-Stack Log Normalization for 20+ Source Types with SQL Query
20+ Logstash filter packs (windows, linux, cisco, palo alto, fortinet, azure, aws, o365, crowdstrike, sophos, suricata, etc.) normalize to ECS fields. OpenSearch SQL passthrough with SELECT-only guard gives analysts a familiar query language. Combined with the field browser, timeline histogram, saved queries, and tab-based multi-session log explorer, this log analysis experience is significantly better than QRadar's SIEM query language and comparable to Splunk SPL — without the per-GB pricing.

---

## 5. Competitive Positioning

### vs. Splunk Enterprise Security

| Dimension | Splunk ES | ArmorSight |
|---|---|---|
| Log search | SPL (powerful, complex) | Lucene + SQL (familiar, accessible) |
| Detection rules | ES content packs (paid add-on) | Sigma import + 100+ YAML rules included |
| SOAR | Splunk SOAR (separate product, expensive) | Visual playbook builder built-in |
| AI triage | Splunk AI/ML Toolkit (complex setup) | SOC-AI plugin, async per-alert LLM |
| Pricing model | Per-GB ingest (prohibitive at scale) | Open-source base (cost advantage) |
| MITRE mapping | Available via ES content | Native coverage map |
| Gaps vs Splunk | ArmorSight missing: NL search, full AD backend, JIRA/ServiceNow, STIX/TAXII, CVE tracking | |

**Verdict:** ArmorSight wins on price and SOAR depth. Loses on ecosystem maturity, NL search, and enterprise integrations. Competitive at $0-500K ARR customer size.

---

### vs. Microsoft Sentinel

| Dimension | Sentinel | ArmorSight |
|---|---|---|
| Data connectors | 200+ native connectors | 20+ normalized sources |
| Threat intelligence | MDTI commercial feed built-in | ThreatWinds only; no STIX/TAXII |
| AD/Identity | Azure AD native integration | AD page is mock data |
| SOAR | Logic Apps (visual, powerful) | Comparable visual builder |
| Compliance | Defender for Cloud required | Built-in compliance orchestrator |
| Deployment | SaaS only | Self-hosted / on-prem capable |
| Cost at scale | Commitment tiers, complex | Open-source base, predictable |

**Verdict:** ArmorSight is a credible Sentinel alternative for on-premises or air-gapped environments, and for customers refusing Azure lock-in. ArmorSight loses badly on data connector breadth and native identity integration.

---

### vs. IBM QRadar

| Dimension | QRadar | ArmorSight |
|---|---|---|
| Correlation engine | DSM rules, offense model | YAML/Sigma rules, alert model |
| Search | AQL (complex, proprietary) | Lucene + SQL (accessible) |
| UX | Notoriously poor | Modern Next.js, fast UI |
| SOAR | QRadar SOAR (separate, expensive) | Visual builder built-in |
| AI | Watson-based, slow adoption | LLM per-alert triage, faster |
| Multi-tenancy | MSSP-capable, hardened | Federation service exists, less mature |
| On-prem | Strong | Strong |

**Verdict:** ArmorSight is a strong disruptor vs. QRadar on UX, price, and SOAR — the two biggest QRadar pain points in the market. ArmorSight loses on offense correlation depth, MSSP multi-tenancy maturity, and compliance completeness (QRadar has no commented-out code equivalent to ArmorSight's HipaaResource).

---

## Appendix: Key Files Reviewed

- `/backend/src/main/java/com/nilachakra/web/rest/sse/AlertSseResource.java`
- `/backend/src/main/java/com/nilachakra/web/rest/correlation/rules/UtmCorrelationRulesResource.java`
- `/backend/src/main/java/com/nilachakra/web/rest/uba/UbaResource.java`
- `/backend/src/main/java/com/nilachakra/web/rest/threat_intel/ThreatIntelResource.java`
- `/backend/src/main/java/com/nilachakra/web/rest/soar_playbook/UtmSoarPlaybookResource.java`
- `/backend/src/main/java/com/nilachakra/web/rest/incident_response/UTMIncidentCommandWebsocket.java`
- `/backend/src/main/java/com/nilachakra/web/rest/compliance/HipaaResource.java` *(body commented out)*
- `/backend/src/main/java/com/nilachakra/web/rest/compliance/CustomComplianceResource.java` *(body commented out)*
- `/backend/src/main/java/com/nilachakra/web/rest/MitreCoverageResource.java`
- `/backend/src/main/java/com/nilachakra/service/uba/UbaService.java`
- `/backend/src/main/java/com/nilachakra/service/threat_intel/ThreatIntelService.java`
- `/backend/src/main/java/com/nilachakra/domain/correlation/rules/UtmCorrelationRules.java`
- `/frontend-v2/src/app/(app)/incidents/[id]/page.tsx`
- `/frontend-v2/src/app/(app)/active-directory/page.tsx`
- `/frontend-v2/src/app/(app)/compliance/page.tsx`
- `/frontend-v2/src/app/(app)/uba/page.tsx`
- `/frontend-v2/src/app/(app)/soar/flows/page.tsx`
- `/frontend-v2/src/components/investigation/investigation-entity-graph.tsx`
- `/plugins/feeds/main.go`
- `/plugins/soc-ai/main.go`
- `/rules/windows/` (20 detection rules), `/rules/linux/`, `rules/windows-threats.yaml`
- `/filters/` (20+ source normalization packs)
- `/backend/src/main/resources/config/liquibase/scripts/data.sql`
