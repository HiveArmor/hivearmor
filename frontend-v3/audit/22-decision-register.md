# 22 — Decision Register
## HiveArmor frontend-v3

**Audit date:** 2026-07-26  
**Author:** Phase 2 audit  
**Purpose:** Record all product, architecture, and engineering decisions that must be made before specific implementation batches can begin.

---

## DEC-01: AG Grid Enterprise Licence vs Community + Workaround

**Context:** The spec requires `IServerSideDatasource` (AG Grid Enterprise ServerSideRowModel). The codebase uses Community 36 with an `InfiniteRowModel` bridge that provides basic server-side pagination but cannot support grouped rows, master-detail expansion (incident → alerts), or tree data.

**Options:**
- A. Purchase AG Grid Enterprise licence — enables full SSRM, grouped views, master-detail
- B. Accept Community 36 with InfiniteRowModel — update spec to remove Enterprise-only features; document workaround limits
- C. Migrate to a different grid library (TanStack Table, Glide Data Grid) — significant rewrite

**Recommendation:** Option B in the near term (document and accept the limitation); evaluate Option A when grouped views or master-detail are required by a specific customer contract. Option C is disproportionate.

**Consequence if delayed:** H2 incident detail cannot show sub-alert master-detail. H3 detection rules cannot show rule-group hierarchies. Analysts get flat lists where the spec expects grouped views.

**Owner:** Product owner + Engineering lead  
**Required by:** Before H2 begins  
**Blocking batches:** H2-INCIDENT-01 (master-detail), H3-DETECT-01 (grouped rules)

---

## DEC-02: MSSP Tenant Architecture

**Context:** FS-01 identifies that MSSP tenant isolation is completely absent. The architecture decision determines whether data isolation is implemented via PostgreSQL row-level security per tenant, separate schemas per tenant, or separate database clusters. This decision shapes the entire H6 workstream and cannot be reversed without rebuilding all persistence layers.

**Options:**
- A. PostgreSQL Row-Level Security (RLS) — `tenant_id` column on all tables; Postgres RLS policies per tenant; single schema, single database
- B. Separate schemas per tenant — `tenant_ABC.utm_alert`, `tenant_XYZ.utm_alert`; no RLS; schema-per-tenant isolation
- C. Separate database clusters per tenant — strongest isolation; highest operational cost; no shared DB connections

**Recommendation:** Option A (RLS) for up to ~1,000 tenants. Provides strong isolation without schema explosion. Industry standard for SaaS. Evaluate Option C only if a large enterprise customer requires physical database separation for compliance.

**Consequence if delayed:** H6 cannot start. Do NOT begin any multi-tenant code until this decision is made and documented. Wrong choice requires complete rebuild of all persistence layers.

**Owner:** Architecture lead + DBA + Security lead  
**Required by:** Before H6-TENANT-01  
**Blocking batches:** H6-TENANT-01, H6-TENANT-02, H6-FE-01, H6-FE-02

---

## DEC-03: Authentication Session Design After DEBT-14 Fix

**Context:** DEBT-14 (ephemeral JWT key) must be fixed. The fix requires defining how the signing key is stored and rotated. This also raises the question of refresh tokens — currently there are no refresh tokens; the JWT simply expires and the user re-logs in.

**Options:**
- A. Environment variable only — `JWT_SECRET` in deployment manifest; key rotation requires redeployment
- B. Database-persisted key — generated once, stored in `ha_settings` table; survives restarts; rotated via admin API
- C. Refresh token pair — short-lived access token (15m) + long-lived refresh token (7d); more complex but industry-standard session management

**Recommendation:** Option B for immediate DEBT-14 fix (lowest implementation cost, highest reliability). Evaluate Option C in H4 as a security hardening improvement.

**Consequence if delayed:** Every backend restart invalidates all sessions. Unacceptable for production operations.

**Owner:** Backend lead + Security lead  
**Required by:** H0-SEC-05 (Horizon 0)  
**Blocking batches:** H0-SEC-05

---

## DEC-04: Permission Catalogue — Fine-Grained RBAC

**Context:** The current permission model uses 6 roles (ROLE_ADMIN, ROLE_SOC_MANAGER, ROLE_ANALYST, ROLE_THREAT_HUNTER, ROLE_READ_ONLY, ROLE_USER). The backend has 123 endpoints relying on a global `hasAnyRole(ADMIN,USER)` catch-all. Fine-grained permissions (e.g., "can-acknowledge-alert", "can-run-playbook") are not defined anywhere.

**Options:**
- A. Stay with role-based — no change to current 6 roles; just ensure all endpoints have correct role checks
- B. Add permission-level granularity — define ~30 permissions; roles map to permission sets; backend uses `hasPermission()`
- C. Full ABAC (attribute-based) — policy engine (OPA or Spring Security ABAC); most flexible, highest complexity

**Recommendation:** Option A for H0–H2 (fix the missing role checks); Option B for H3 onward as SOAR playbook execution requires permission-level granularity (e.g., "can-approve-automated-kill-process").

**Owner:** Architecture lead + Product owner  
**Required by:** H0 for role-level; H3 for permission-level  
**Blocking batches:** H3-RESPONSE-01 (approval gates), H6-FE-02 (CROSS_TENANT_READ permission)

---

## DEC-05: Correlated Findings Route Naming (/offenses vs /correlated-findings)

**Context:** Spec calls the route `/correlated-findings`. The router currently uses `/offenses` (matching the backend resource path `GET /api/offenses`). This is a naming mismatch in 4 places (route, nav link, breadcrumb, URL shown to users).

**Options:**
- A. Keep `/offenses` — matches backend resource path; no change needed
- B. Change frontend route to `/correlated-findings` — matches spec; requires updating router, nav, breadcrumbs; backend path unchanged
- C. Create redirect: `/correlated-findings` → `/offenses` — accommodates both

**Recommendation:** Option B — align with spec. The backend API path `/api/offenses` is decoupled from the UI route. Frontend routes should use domain language.

**Consequence if delayed:** Spec compliance matrices continue to show route mismatch. Low urgency but creates confusion.

**Owner:** Product owner  
**Required by:** H1-ROUTE-01  
**Blocking batches:** H1-ROUTE-01

---

## DEC-06: Mission Control Globe Implementation

**Context:** The spec requires a geo-threat map on the Mission Control / Command Center page. The existing `CommandCenterPage.tsx` has a placeholder. Three implementation options exist with different bundle size and capability trade-offs.

**Options:**
- A. ECharts geo chart (choropleth) — already in stack (`echarts@6.1.0`); no new dependency; limited to country-level
- B. D3.js choropleth — D3 not in `package.json`; requires AGENTS.md approval for new dependency; most flexible
- C. Third-party map library (Mapbox, Leaflet) — large bundle; licensing cost (Mapbox); violates "no unapproved libraries" rule

**Recommendation:** Option A — use ECharts geo chart. ECharts already in bundle; D3 addition requires approval and increases bundle by ~250 KB; Option C violates stack rules.

**Owner:** Frontend lead  
**Required by:** H2-COMMAND-01 (Mission Control FE-21)  
**Blocking batches:** FE-21 (Geo Threats widget)

---

## DEC-07: Parser DSL Language

**Context:** The event processor parses log events using YAML filters. The Parser Intelligence roadmap (H5) introduces AI-generated draft parsers. The DSL language choice determines what the AI generates and whether that output can be safely executed.

**Options:**
- A. Constrained YAML schema — strict whitelist of allowed fields and transformations; AI generates YAML; statically validated before load; no arbitrary code execution
- B. CEL (Common Expression Language) — expressive but sandboxed; AI generates CEL expressions; CEL interpreter provides execution isolation
- C. Full scripting (Go text/template or Lua) — maximum flexibility; AI generates scripts; RCE risk if validation fails

**Recommendation:** Option A for MVP; Option B for advanced regex/conditional transforms. NEVER Option C — AI-generated code execution in a log processing pipeline is an unacceptable RCE risk.

**Consequence if delayed:** H5-PARSER-03 (AI draft parsers) cannot start. Developers may implement Option C by default without explicit guidance.

**Owner:** Security lead + Architecture lead  
**Required by:** Before H5-PARSER-03  
**Blocking batches:** H5-PARSER-03, H5-PARSER-04

---

## DEC-08: Graph Database Strategy (Neo4j)

**Context:** `ThreatConstellationPage.tsx` exists and imports ReactFlow for a relationship graph. Backend code confirms Neo4j is configured (`spring.neo4j.*` properties). However, the Neo4j schema (node labels, relationship types, properties) is not documented anywhere in the repository. The frontend cannot model graph data without knowing the schema.

**Options:**
- A. Define and document Neo4j schema — node labels: Alert, Entity, IP, Domain, Hash; relationships: CONNECTED_TO, RESOLVES_TO, TRIGGERED_BY; properties per type
- B. Abandon Neo4j; implement graph as PostgreSQL adjacency list — simpler; sufficient for basic relationship queries
- C. Defer graph entirely — remove ThreatConstellationPage from router until schema exists

**Recommendation:** Option A — hold a schema discovery session with the backend team. The page already exists and ReactFlow is already rendering. 2–4 sessions to define and document the schema is justified. Option B would lose the native graph traversal capability.

**Consequence if delayed:** H3-CONST-01 blocked indefinitely. ThreatConstellationPage renders empty graph forever.

**Owner:** Architecture lead + Backend lead  
**Required by:** Before H3-CONST-01  
**Blocking batches:** H3-CONST-01

---

## DEC-09: Response Approval Policy

**Context:** SOAR playbooks can execute automated actions including isolating hosts, killing processes, and blocking IPs. The spec references approval gates in the playbook builder. The decision is who can approve automated actions and what the blast radius controls are.

**Options:**
- A. Role-based approval — ROLE_SOC_MANAGER or ROLE_ADMIN can approve; no per-action limits
- B. Permission-based approval — specific `can-approve-kill-process`, `can-approve-network-block` permissions; requires DEC-04 Option B
- C. Time-window + justification — any ANALYST can execute with mandatory justification text; actions audited; no explicit approval

**Recommendation:** Option A for MVP (tied to DEC-04 Option A); Option B when permission catalogue is implemented (DEC-04 Option B). Option C is insufficient for enterprise security posture.

**Owner:** Security lead + Product owner  
**Required by:** H3-RESPONSE-01  
**Blocking batches:** H3-RESPONSE-01 (approval gate nodes in playbook builder)

---

## DEC-10: Dashboard Ownership and Sharing Model

**Context:** `DashboardViewPage.tsx` exists. `DashboardStudioPage` does not yet exist (CONTRADICTION-07). Before building the studio, the ownership model must be defined.

**Options:**
- A. Personal only — dashboards owned by creating user; no sharing
- B. Personal + org-shared — dashboards can be shared with all org users
- C. Personal + team + org + tenant (MSSP) — full hierarchy; requires H6 tenant model

**Recommendation:** Option B for H4; defer Option C until H6 is complete. Dashboard tenant column will be added in H6-TENANT-01 Liquibase migration.

**Owner:** Product owner  
**Required by:** H4-DASH-01  
**Blocking batches:** H4-DASH-01

---

## DEC-11: Report Output Formats

**Context:** Report generation (H4-REPORT-01) requires building a backend PDF generation service. The decision is which output formats to support.

**Options:**
- A. PDF only — common standard; web-pdf module already exists in repo
- B. PDF + CSV — CSV for raw data export; straightforward backend implementation
- C. PDF + CSV + XLSX + DOCX — maximum compatibility; highest implementation cost

**Recommendation:** Option B (PDF + CSV) for H4. XLSX and DOCX can be added as follow-on features in H4+. The `web-pdf` Java module in the repository suggests PDF is already partially implemented.

**Owner:** Product owner  
**Required by:** H4-REPORT-01  
**Blocking batches:** H4-REPORT-01 (backend report service design)

---

## DEC-12: AI Hosting and Customer-Log Policy

**Context:** SOC AI features (`POST /api/ha-ai/chat`, `POST /api/ha-soc-ai/query`) send log context to an AI model. The deployment model and data handling policy must be defined before these features reach production.

**Options:**
- A. Cloud AI (OpenAI/Anthropic API) — simplest; customer log data leaves the customer's environment; PII/PHI risk
- B. Self-hosted AI (Ollama / vLLM) — log data stays in customer environment; higher infrastructure cost
- C. Hybrid — non-sensitive queries to cloud AI; sensitive content to self-hosted only

**Recommendation:** Option B for regulated sectors (government, healthcare, financial). Option A acceptable for cloud-native customers with appropriate DPA. Document the policy clearly in the product privacy statement.

**Consequence if delayed:** SOC AI features cannot be deployed in regulated environments.

**Owner:** Product owner + Legal + Security lead  
**Required by:** Before H2-AI-01 production deployment  
**Blocking batches:** H2-AI-01 (production only)

---

## DEC-13: Internationalisation

**Context:** The codebase is English-only. No i18n library is installed. No `t()` translation function wraps any UI string.

**Options:**
- A. English-only indefinitely — no i18n; all strings hardcoded
- B. i18n from H1 — install `i18next`; wrap all strings; English only initially but ready for translation
- C. i18n for specific markets — add only when a non-English customer is signed

**Recommendation:** Option A for H0–H3 (adding i18n mid-development is disruptive); make Option B a deliberate decision before H4 if international customers are on the roadmap.

**Owner:** Product owner  
**Required by:** Before H4 begins  
**Blocking batches:** None immediately; blocks internationalisation expansion

---

## DEC-14: Mobile and Limited-Mode Scope

**Context:** Current UI is desktop-only. Spec references responsive design. Doc 12 (accessibility) confirmed no viewport testing below 1280px.

**Options:**
- A. Desktop-only — no responsive investment; minimum 1280px
- B. Tablet-compatible (768px+) — key pages degrade gracefully; sidebar collapses; grids horizontal-scroll
- C. Full mobile (320px+) — full responsive; significant layout work

**Recommendation:** Option B — tablet-compatible is achievable with PatternFly responsive utilities. Option C requires full layout redesign and is out of scope for H0–H4.

**Owner:** Product owner + UX lead  
**Required by:** Before H2 (so new pages are built mobile-aware)  
**Blocking batches:** None immediately; informs page layout decisions in H2+

---

## DEC-15: Production Performance Budgets

**Context:** Current bundle is 4.1 MB. No Lighthouse CI gates exist. No performance budgets are defined.

**Options:**
- A. Define targets now — initial JS < 500 KB; LCP < 2.5s; INP < 200ms; CLS < 0.1; Performance score ≥ 90
- B. Measure first, set targets later — run Lighthouse after H1 code splitting; set realistic targets based on measurements
- C. No formal performance budget — rely on engineer judgment

**Recommendation:** Option A — set targets now per doc 20 thresholds. This motivates H1-FND-01 (code splitting) as a P1 item and establishes a CI gate that prevents future regressions.

**Owner:** Frontend lead + DevOps  
**Required by:** H1 (for Lighthouse CI setup)  
**Blocking batches:** H1-TEST-01 (Lighthouse CI config)

---

## DEC-16: UAT Owners and Acceptance Sign-Off Process

**Context:** There is no documented UAT process. No acceptance owners are named.

**Options:**
- A. Engineering self-certify — engineers mark features complete; no external UAT
- B. Internal QA team sign-off — separate QA team validates against acceptance criteria before merge
- C. Customer UAT — named customer participates in each feature sign-off

**Recommendation:** Option B minimum for H2 onwards; Option C for H4+ features (dashboards, reports) where customer feedback is critical.

**Owner:** Delivery manager + Product owner  
**Required by:** Before H2 begins  
**Blocking batches:** All H2+ batches

---

## DEC-17: `.skip.ts` Resolution Strategy

**Context:** 26 `.skip.ts` files exist. Three strategies exist for resolving them.

**Options:**
- A. Batch activation — implement features per roadmap horizon; remove `.skip.ts` as each page is built
- B. Full rewrite — treat each `.skip.ts` page as a blank slate; rebuild from spec regardless of existing skip file content
- C. Feature-flag gate — replace `.skip.ts` with `if (FLAGS.featureX)` runtime flags; enable via admin panel

**Recommendation:** Option A (batch activation) for pages that have meaningful skip file content; Option B for pages like `DashboardStudioPage` where the skip file is a pure stub with no useful content. Option C adds complexity without meaningful benefit given H0-FE-02 adds visible notices.

**Owner:** Frontend lead  
**Required by:** H0-FE-02  
**Blocking batches:** H0-FE-02, H2-SEARCH-01, H2-INCIDENT-01, H2-FINDING-01, H4-DASH-01
