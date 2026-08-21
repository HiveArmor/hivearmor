# HiveArmor — Master Context Document

## Generated: 2026-08-02
## Purpose: Single-file AI-readable reference. Any AI assistant reading sections 2–7 + 18 can contribute safely without exploring the repo further.

---

## 1. Project Identity & Brand Rules

**Product name:** HiveArmor
**Full name:** Hybrid Intelligence & Visibility Engine for Advanced Response, Monitoring, Orchestration and Resilience
**Short name (code only):** `ha`
**Current version:** 11.0.0 (LTS, supported until November 2030)
**Current branch state:** Unreleased features being built iteratively via sprints S11–S33+

### Brand name rules — enforced everywhere

| Form | Usage |
|---|---|
| `HiveArmor` | All UI text, docs, labels, error messages, log strings visible to users |
| `ha` | CSS custom property prefix (`--ha-*`), React component prefix (`Ha*`), CLI short name |
| `com.hivearmor` | Java package root |
| `github.com/hivearmor/...` | Go module paths for all new modules |
| `hivearmor/` | Local Docker image names |
| `ghcr.io/hivearmor/` | CI Docker image names |

### NEVER use these forms

`Hive Armor` (space), `Hive-Armor` (hyphen), `HIVEARMOR` (all-caps), `hivearmor` (lowercase in UI text), `ArmorSight` (retired name), `UTMStack` (original upstream — never expose to users), `nilachakra` (internal codename — never expose), `threatwinds` (upstream SDK vendor — never in UI text or user-facing strings)

---

## 2. Repository Map & File Conventions

```
/                             repo root
  sdk/                        HiveArmor Go SDK — github.com/hivearmor/sdk (Sprint 12 fork of go-sdk-main)
  go-sdk-main/                upstream SDK source — READ ONLY, never modify
  event-processor/            Go — core log correlation engine (CEL rules, geo, feeds)
  agent/                      Go — endpoint agent (Windows/Linux/macOS)
  agent-manager/              Go — gRPC agent registry
  hivearmor-collector/        Go — log collector (syslog/UDP/TCP)
  as400/                      Go — IBM AS/400 log collector
  plugins/                    Go — 17 correlation engine plugins
  backend/                    Java 17 + Spring Boot 3.3 + JHipster 8 — REST API
  frontend-v3/                React 18 + TypeScript 5 + Vite — ACTIVE UI (all new UI work here)
  frontend-v2/                Next.js 14 — previous UI, read-only, no new features
  frontend/                   Angular 17 — legacy, scheduled for deletion, DO NOT TOUCH
  local-dev/                  Docker Compose — full stack local environment
  filters/                    YAML source-type filter definitions (47 files, 29 vendor categories)
  .plan/                      Feature roadmap, platform audit, SDD session prompts
  .kiro/                      Kiro steering docs and sprint specs (auto-loaded by Kiro)
  .claude/rules/              Claude Code rule files (auto-loaded for matching files)
  CHANGELOG.md                Version history (authoritative for what was fixed/added)
  HIVEARMOR_AGENT_ENHANCEMENT_REPORT.md  Full report of 2026-07-29 Cursor agent work
```

### Key path shortcuts

| Purpose | Path |
|---|---|
| Backend REST controllers | `backend/src/main/java/com/hivearmor/web/rest/` |
| Backend services | `backend/src/main/java/com/hivearmor/service/` |
| Backend config / security | `backend/src/main/java/com/hivearmor/config/` |
| Backend multitenancy | `backend/src/main/java/com/hivearmor/multitenancy/` |
| Liquibase changelogs | `backend/src/main/resources/config/liquibase/changelog/` |
| New UI pages | `frontend-v3/src/pages/` |
| UI components | `frontend-v3/src/components/` |
| UI services | `frontend-v3/src/services/` |
| UI types | `frontend-v3/src/types/` |
| UI stores (Zustand) | `frontend-v3/src/store/` |
| Design tokens | `frontend-v3/src/styles/tokens.css` |
| Correlation rules | `event-processor/builtin-rules/` (135 YAML files) |
| Source parsers | `filters/` (47 files) |
| MSSP frontend feature | `frontend-v3/src/features/mssp/` |

### Important non-code files to read before starting any work

- `.plan/PLATFORM_AUDIT.md` — authoritative gap analysis (2026-07-24)
- `.plan/NEXTGEN-ARCHITECTURE.md` — strategic direction and OTel/Lakehouse/GitOps roadmap
- `.plan/MASTER_PLAN.md` — phased roadmap overview
- `CHANGELOG.md` — what was actually shipped/fixed in each version
- `HIVEARMOR_AGENT_ENHANCEMENT_REPORT.md` — all agent changes from 2026-07-29 session
- `.kiro/specs/sprint-<N>-*/tasks.md` — sprint task checklists with completion state

---

## 3. Architecture — Data Flow & Service Communication

### End-to-end data flow

```
Log source (endpoint / network / cloud)
  → Agent (Go, port 9000 gRPC) or Collector (Go, syslog/UDP/TCP)
      → AgentManager (gRPC TLS 1.3 registry)
  → EventProcessor (Go)
      → parse       (YAML filters/, CEL expressions)
      → enrich      (geo lookup via MaxMind, threat feeds, entity graph)
      → correlate   (YAML builtin-rules/, CEL engine, time-window afterEvents)
      → index to OpenSearch: v3-hive-<type>-YYYY.MM.DD
  → Backend (Java Spring Boot) queries OpenSearch on demand
  → Frontend (React v3) displays alerts, incidents, dashboards, hunts
```

**Critical invariant:** Correlation runs INSIDE EventProcessor BEFORE data reaches OpenSearch. Never short-circuit — never write raw logs directly to OpenSearch from agents.

### Service communication matrix

| From | To | Protocol | Auth |
|---|---|---|---|
| Browser | Backend | HTTPS | JWT `Authorization: Bearer <token>` |
| Backend | OpenSearch | HTTPS | Basic auth via env vars |
| Backend | AgentManager | gRPC | `INTERNAL_KEY` env var |
| Backend | EventProcessor | HTTP | `X-Internal-Key` header |
| Agent/Collector | AgentManager | gRPC TLS 1.3 | `REPLACE_KEY` injected via ldflags |
| Go plugins | EventProcessor | Unix socket gRPC | Socket path `{WorkDir}/sockets/{name}_{type}.sock` |

**No message broker.** Kafka/RabbitMQ/NATS must NOT be added without an explicit architecture decision record.

### Databases

| Database | Purpose | Schema manager |
|---|---|---|
| PostgreSQL `hivearmor` | App data: users, rules, incidents, dashboards, AI chat, MSSP tenants | Liquibase (immutable changesets) |
| PostgreSQL `hivearmor_agents` | Agent registry | GORM auto-migrate |
| OpenSearch | All log events, alerts, statistics, compliance evidence, SOC-AI results | ISM policies for retention |

### OpenSearch index pattern — VERSION-LOCKED, DO NOT CHANGE

```
Standard:             v3-hive-<type>-YYYY.MM.DD
MSSP tenant:          v3-hive-<type>-<tenantPrefix>-YYYY.MM.DD
Wildcard:             v3-hive-<type>-*
Tenant wildcard:      v3-hive-<type>-<tenantPrefix>-*
```

Use SDK builders: `sdkos.BuildCurrentDayIndex()`, `sdkos.BuildTenantIndex()`, `sdkos.BuildIndexPattern()`, `sdkos.BuildTenantIndexPattern()` from `github.com/hivearmor/sdk/os`. Never construct by string concatenation.

IMPORTANT NOTE: The CHANGELOG and some older docs show `_v3_hive_*` with a leading underscore. The CORRECT pattern is `v3-hive-<type>-YYYY.MM.DD` with NO leading underscore — this was corrected in the Platform Audit 2026-07-24.

### EventProcessor plugins (launched via supervisord in entrypoint.sh)

Always-started: `com.hivearmor.config.plugin`, `com.hivearmor.events.plugin`, `com.hivearmor.alerts.plugin`, `com.hivearmor.geolocation.plugin`
Optional: `com.hivearmor.inputs.plugin` (when binary present), `com.hivearmor.compliance-orchestrator.plugin`
Not in entrypoint (side-loaded or manual): aws, azure, gcp, o365, crowdstrike, bitdefender, sophos, feeds, stats, soc-ai, modules-config

---

## 4. Technology Stack Decisions (Immutable Constraints)

### Frontend v3 technology boundaries

| Purpose | Required library | Forbidden |
|---|---|---|
| Core UI components | PatternFly 6 via `Ha*` wrappers | Tailwind, Radix, Ant Design, MUI, Bootstrap, shadcn |
| Dense operational grids | AG Grid Community 36 via `SiemDataGrid` | PF Table for large datasets |
| Charts | Apache ECharts via `HaChart` wrapper | Chart.js, Recharts, D3 directly |
| Dashboard layout | GridStack.js 13 via `DashboardCanvas` | CSS grid for drag-drop canvas |
| Server state | TanStack Query v5 | SWR, RTK Query |
| UI/interaction state | Zustand v5 | Redux, MobX, Context for global UI state |
| Routing | React Router v6 | Next.js router, TanStack Router |
| Rule/query editors | Monaco Editor | CodeMirror, Ace |

Never introduce a library not in this list without explicit written approval.

### Backend stack

- Java 17 + Spring Boot 3.3 + JHipster 8 scaffolding
- Spring Security 6 `SecurityFilterChain` bean pattern
- Liquibase for all schema changes (changesets immutable once merged)
- JWT authentication: ephemeral key was a known issue (DEBT-14) — FIXED in v11 Unreleased (key now persisted to encrypted DB column)

### Go components stack

- Go 1.25.5 across all Go modules
- Module path: `github.com/hivearmor/sdk` for the local SDK
- All new Go modules use `github.com/hivearmor/<name>` paths
- `replace github.com/hivearmor/sdk => ../sdk` in every consumer module
- `replace github.com/hivearmor/shared => ../shared` in agent/go.mod (required, never remove)

### Plugins still on old SDK (UNRESOLVED as of 2026-08-02)

Sprint 33 migrated `agent/`, `event-processor/`, `hivearmor-collector/`, `as400/` from `github.com/threatwinds/go-sdk` to `github.com/hivearmor/sdk`. However, all 17 plugins in `plugins/*/` still import `github.com/threatwinds/go-sdk v1.1.26` in their go.mod files. `plugins/soc-ai/main.go` imports `github.com/threatwinds/go-sdk/catcher` and `github.com/threatwinds/go-sdk/plugins`. A migration sprint for plugins is needed. The `go-sdk-main/` directory also still imports the upstream path (it is the fork source, read-only reference — this is expected).

Exception: `agent/utils/logger.go` still imports `github.com/threatwinds/logger` — one stray import.

---

## 5. Design System & UI Conventions

### Design tokens (ALL VALUES IMMUTABLE — tokens.css is locked)

```css
/* Surfaces */
--ha-background:      #070A0F;   /* Page background */
--ha-surface-primary: #0D131C;   /* Cards, panels */
--ha-surface-raised:  #131C28;   /* Toolbar, header, dropdowns */
--ha-border:          #253244;   /* All borders — 1px solid only */

/* Brand / Semantic */
--ha-primary:         #32D6C5;   /* Teal — actions, links, focus rings */
--ha-intelligence:    #8B7CFF;   /* Purple — AI, intel, enrichment */
--ha-critical:        #FF5D6C;   /* Red — Critical severity (4) */
--ha-high:            #FFAA45;   /* Amber — High severity (3) */
--ha-medium:          #5AA7FF;   /* Blue — Medium severity (2) */
--ha-positive:        #40D69A;   /* Green — Low sev (1), resolved, on-track */
--ha-text-primary:    #E8EDF4;   /* Body text, labels */
--ha-text-secondary:  #97A6B8;   /* Muted text, captions */
```

### Typography

- UI font: `Inter` (variable)
- Monospace: `JetBrains Mono` (code, IPs, hashes, query fields)
- Tabular nums required for all changing numeric data: `font-variant-numeric: tabular-nums`

### Spacing: 4px base grid (4, 8, 12, 16, 20, 24, 32, 40, 48px only)

### Z-index scale: drawer=200, modal=300, toast=400, tooltip=500

### Border radius: sm=2px (badges), base=4px (buttons/inputs/cards), md=6px (drawers/modals), lg=8px (large panels max). NEVER > 8px on primary data surfaces.

### Elevation (two steps only)

| Layer | Background | Border | Use case |
|---|---|---|---|
| Base | `--ha-background` | none | Page canvas |
| Surface | `--ha-surface-primary` | `1px solid var(--ha-border)` | Cards, panels, drawers |
| Raised | `--ha-surface-raised` | `1px solid var(--ha-border)` | Toolbars, headers, dropdowns |
| Overlay | `--ha-surface-raised` | `1px solid var(--ha-border)` + `0 4px 16px rgba(0,0,0,.45)` | Modals, tooltips |

### Visual anti-patterns (FORBIDDEN)

- Glassmorphism (`backdrop-filter: blur`)
- Neon glow effects (`box-shadow` with color opacity on UI elements)
- Decorative gradients on data-bearing surfaces
- Oversized rounded cards (> 8px)
- Cards nested inside cards
- Multiple permanent toolbars stacked vertically
- Animated world maps
- Excessive honeycomb decoration (max 1 structural honeycomb per page)
- Random KPI tile grids as the only homepage content

### Visual reference hierarchy by feature area

| Feature area | Reference |
|---|---|
| All surfaces, spacing, typography | IBM Carbon Gray 100 discipline |
| Search & Hunt, event table, flyouts | Elastic Security / EUI patterns |
| Analyst Queue, saved views, bulk actions | Splunk ES Mission Control patterns |
| Incident Investigation, attack story | Exabeam Threat Center patterns |
| Active case context strip | LogRhythm Current Case patterns |
| Agent health, compliance, FIM | Wazuh coverage patterns |

### Known design rule violations (audit findings)

- `frontend-v3/src/pages/detection-rules/RuleEditorPage.tsx` — 5 raw hex color values in Monaco editor theme definition (design token violation, low severity — Monaco requires string config)
- `frontend-v3/src/pages/constellation/ThreatConstellationCanvas.tsx` — 5 raw hex values in inline HTML tooltip strings (higher severity, should use CSS variables injected at runtime)
- No `any` type violations found in production page files (zero matches)

### Severity label constants

Import from `src/lib/severity.ts` and `src/constants/severity.constants.ts`. Never hardcode.

| Value | Display |
|---|---|
| 4 | `Critical` |
| 3 | `High` |
| 2 | `Medium` |
| 1 | `Low` |

### Status label constants

Import from `src/lib/status.ts` and `src/constants/status.constants.ts`.

| Value | Display |
|---|---|
| `open` | `Open` |
| `in_progress` | `In Progress` |
| `resolved` | `Resolved` |
| `false_positive` | `False Positive` |

### Navigation labels (exact strings — do not alter case or spelling)

| Route | Label |
|---|---|
| Main dashboard | `Command Center` |
| Alert triage | `Analyst Queue` |
| Case management | `Investigations` |
| Alert correlation view | `Correlated Findings` |
| YAML rule management | `Detection Rules` |
| AI enrichment / threat intel | `Hive Intelligence` |
| SOAR / response | `Response` |
| Regulatory compliance | `Compliance` |
| Vulnerability / posture | `Posture` |
| Custom dashboards | `Dashboards` |
| Scheduled reports | `Reports` |
| System configuration | `Administration` |

---

## 6. Backend Conventions & API Contracts

### Security rules (every new endpoint)

Every new REST endpoint MUST have EITHER:
- `@PreAuthorize("...")` annotation, OR
- An explicit entry in `SecurityConfiguration.java` public paths list

Current state audit (2026-08-02): 213 Java files in `web/rest/`, 146 lack `@PreAuthorize`. Many of these are DTOs, inner classes, or SSE endpoints with auth delegated to `SecurityConfiguration`. The count is misleading — controllers themselves should be audited individually.

### API prefix

New HiveArmor endpoints: `/api/ha-*`
Auth endpoint: `POST /api/authenticate` → `{ id_token: string }`
JWT key in localStorage: `hivearmor_auth_token`

### Breaking change policy

Keep old endpoint with `Deprecation` response header for 2 releases before removing.
New fields are always safe (additive changes).

### Liquibase rules

1. New file: `backend/src/main/resources/config/liquibase/changelog/YYYYMMDDNNN_description.xml`
2. Include in `master.xml` in strict date order
3. Run `mvn -s settings.xml liquibase:validate` before merging
4. New columns MUST have a default value or be nullable
5. No `DROP COLUMN` or `RENAME COLUMN` without 2-release deprecation
6. Changesets are IMMUTABLE once merged — never edit a shipped changeset

### Known Liquibase migrations (key ones)

- `20260724050_mssp_schema.xml` — MSSP ha_client extensions (Sprint 21)
- `20260728001_ueba_baseline.xml` — UEBA baseline tables (Sprint 29)
- `20260731001_govt_compliance.xml` — ha_poam_item table (Sprint 33)

### Backend services catalog (key services)

| Service | Purpose |
|---|---|
| `HaAiChatService` | Streaming AI chat, PII scrubbing, tenant isolation |
| `HaEdrService`, `HaEdrFimService`, `HaEdrQuarantineService` | EDR response actions |
| `HaLlmConfigService` | LLM provider registry (OpenAI, Azure OpenAI, Ollama) |
| `HaRuleTestService` | Rule sandbox — test YAML rule against sample events |
| `HaScimService` | SCIM 2.0 user provisioning |
| `HaSearchService` | NL-to-DSL search + SearchUtil DSL builders |
| `HaSearchSuggestionService` | AI-powered search suggestions |
| `HaSigmaSyncService` | Sigma rule import and sync |
| `HiveTenantService` | MSSP tenant CRUD |
| `MsspTenantService` | MSSP tenant isolation and user management |
| `PlaybookService`, `PlaybookExecutionStreamService` | SOAR playbook lifecycle + streaming execution |
| `ResponseActionService` | SOAR response actions |
| `ThreatIntelLookupService` | IOC enrichment lookup |
| `TaxiiClientService`, `MispConnectorService` | STIX/TAXII 2.1 + MISP threat feed connectors |
| `UbaService`, `UbaSyncService` | UEBA risk scoring and anomaly feed |
| `AgentInstallScriptBuilder` | One-click agent provisioning script generator |
| `PluginHealthService` | Plugin health monitoring |

### LLM providers implemented

`OpenAiLlmProvider`, `AzureOpenAiLlmProvider`, `OllamaLlmProvider` (Sprint 27), `DisabledLlmProvider`
Air-gap mode: `HaAirGapConfig.AirGapGuard` (Sprint 31) — gates external LLM and CVE enrichment calls

### MSSP multitenancy implementation (Sprints 21–24)

- `TenantContext` — `ThreadLocal<String>` final class
- `MsspTenantResolver` — `@Service` + `@Cacheable("tenantResolution")`, 5-min TTL, 500 entries
- `TenantContextFilter` — `OncePerRequestFilter`, `@Order(HIGHEST_PRECEDENCE + 10)`, wired after `JWTFilter`
- `MsspIndexResolver` — replaces hardcoded `v3-hive-*` with tenant-aware index names
- `MsspTenantController`, `MsspTenantUserController` — MSSP REST endpoints
- Role: `ROLE_MSSP_ADMIN` separate from `ROLE_ADMIN`

---

## 7. Go Components & Build Requirements

### SDK location and usage

The local SDK lives at `sdk/` (module `github.com/hivearmor/sdk`). Consumer modules reference it via:
```
require github.com/hivearmor/sdk v0.0.0
replace github.com/hivearmor/sdk => ../sdk
```

### SDK packages

| Package | Import path | Purpose |
|---|---|---|
| `catcher` | `github.com/hivearmor/sdk/catcher` | Structured logger, error types, retry helpers |
| `utils` | `github.com/hivearmor/sdk/utils` | Type casts, HTTP helpers, file utilities, AirGapCheck |
| `entities` | `github.com/hivearmor/sdk/entities` | 30+ cyber-threat type validators |
| `os` | `github.com/hivearmor/sdk/os` | OpenSearch client, DSL builders, bulk ops, index builders |
| `plugins` | `github.com/hivearmor/sdk/plugins` | Proto definitions, CEL engine, plugin lifecycle, config loader |

**Import alias for sdk/os:** Always use `sdkos "github.com/hivearmor/sdk/os"` — conflicts with stdlib `os`.

### Error handling rules

```go
// Correct — sdk catcher
return catcher.Error("description", err, map[string]any{"key": value})

// Wrong — never use
return fmt.Errorf("failed: %w", err)
log.Printf("error: %v", err)
```

Never swallow errors silently. Never use raw `fmt.Errorf` in plugin code.

### Build requirements — ldflags injection

Three components REQUIRE ldflags at build time:

| Component | Variable | Flag |
|---|---|---|
| `agent/` | `github.com/hivearmor/agent/config.REPLACE_KEY` | `-ldflags="-X 'github.com/hivearmor/agent/config.REPLACE_KEY=${AGENT_SECRET_PREFIX}'"` |
| `hivearmor-collector/` | `main.replaceKey` | Same pattern |
| `as400/` | `main.replaceKey` | Same pattern |

CI: `$AGENT_SECRET_PREFIX` from `secrets.AGENT_SECRET_PREFIX`. NEVER build for production without it.

### Go module replace directives (NEVER remove)

```
# In agent/go.mod
replace github.com/hivearmor/shared => ../shared
replace github.com/hivearmor/sdk => ../sdk
```

### Plugin naming convention

All event-processor plugins must be built as: `com.hivearmor.<name>.plugin`
Plugin `main()` must call `sdk.InitXxxPlugin("com.hivearmor.<name>.plugin", handlerFunc)` first.

### CEL function names — DO NOT RENAME (production rules reference these by name)

`celExists`, `safe`, `inCIDR`, `equals`, `equalsIgnoreCase`, `contains`, `containsAll`, `oneOf`, `startsWith`, `endsWith`, `regexMatch`

These live in `sdk/plugins/cel.go`. Adding new functions is safe; renaming or removing existing ones silently breaks deployed YAML rules.

### Go build gates (all must pass before marking session complete)

```bash
go build ./...          # zero compilation errors
go vet ./...            # zero vet issues
go test -short ./...    # unit tests pass
go mod tidy             # go.mod and go.sum in sync
```

Integration tests: `//go:build integration` tag, excluded from `go test -short`.

### Agent modules — new in 2026-07-29 Cursor session

The agent was enhanced with enterprise EDR modules. All live in `agent/collector/`:

| Directory | Purpose | Status |
|---|---|---|
| `agent/collector/ebpf/` | Linux eBPF tracepoints (17 syscall hooks), ring-buffer read, process/file/net events | Files present, needs `cilium/ebpf` dep + `go generate` to compile BPF objects |
| `agent/collector/etw/` | Windows ETW 8 providers (process, network, DNS, PowerShell, USB, WMI, scheduled tasks) | Files present, needs `golang-etw` dep wired |
| `agent/collector/esf/` | macOS EndpointSecurity Framework (14 event types) | Files present, needs Apple entitlement |
| `agent/collector/fim/` | File Integrity Monitoring — SHA-256 baseline SQLite DB, registry FIM on Windows | Fully integrated |
| `agent/collector/dns/` | Per-process DNS telemetry, Shannon entropy for DGA detection | Fully integrated (Linux tcpdump) |
| `agent/collector/netconn/` | Per-process network connections (Linux /proc, Windows GetExtendedTcpTable, macOS lsof) | Fully integrated |
| `agent/collector/usb/` | USB/removable media events | Present |
| `agent/tamper/` | Binary hash watchdog, Windows SCM DACL, Linux chattr+i | Fully integrated |

**Note:** `go.mod` for `agent/` does NOT yet include `github.com/cilium/ebpf` or `github.com/0xrawsec/golang-etw`. Those deps must be added (`go get`) and `go generate` run in `agent/collector/ebpf/` and `agent/collector/etw/` respectively before the eBPF and ETW collectors are production-ready.

### Agent dual-mode install

```
hivearmor-agent install <server> <key> <insecure> [--mode=log|edr]
```

`log` mode (~25MB RAM): log collectors only. `edr` mode (~75MB RAM): log + eBPF/ETW/ESF + FIM + DNS + NetConn + USB.

---

## 8. Feature Inventory — Current Implementation Status

### Legend: Real = backend + frontend fully wired, no mock data | Partial = one side complete | Stub = page exists but shows EngineeringNotice or static content | Missing = not built

| Feature | Route | Backend Endpoint | Status | Notes |
|---|---|---|---|---|
| Login / TFA / OIDC | `/login`, `/tfa`, `/oidc/callback` | `/api/authenticate` | Real | OIDC callback page added |
| Command Center | `/` | `/api/ha-overview/*` | Real | Live EPS SSE, alert stream, KPI tiles |
| Analyst Queue | `/analyst-queue` | `/api/ha-incidents/*` | Real | Bulk actions, saved views, SSE banner |
| Correlated Findings | `/correlated-findings` | `/api/ha-alerts/*` | Real | Offense grouping via entity graph |
| Incident Detail | `/investigations/:id` | `/api/ha-incidents/:id` | Real | Notes, evidence, timeline, SLA |
| Incident List | `/investigations` | `/api/ha-incidents/` | Real | AG Grid, SLA deadline renderers |
| Detection Rules | `/detection-rules` | `/api/ha-correlation-rules/*` | Real | Rule editor (Monaco), MITRE tagging |
| Rule Editor | `/detection-rules/:id/edit` | `/api/ha-correlation-rules/:id` | Real | Monaco, YAML validation |
| Rule Testing | `/detection-rules/:id/test` | `/api/ha-rule-test/*` | Real | Test sandbox UI (Sprint 14) |
| Sigma Import | `/admin/rule-import` | `/api/ha-correlation-rules/sigma/import` | Real | Sprint 14 |
| AI Rule Generation | `/admin/rule-generation` | `/api/ha-rulegen/*` | Real | Sprint 16 enhancement |
| Hive Intelligence | `/intelligence` | `/api/ha-threat-intel/*` | Real | IOC feeds, TAXII/MISP, enrichment lookup |
| Search & Hunt | `/hunt` | `/api/ha-log-analyzer/*` + `/api/ha-nl-search` | Real | NL query bar, DSL preview, field browser, timeline (Sprint 26) |
| Dashboards (canvas) | `/dashboards/:id` | `/api/ha-dashboards/*` | Real | GridStack drag-drop, widget system |
| Dashboard Gallery | `/dashboards` | `/api/ha-dashboards/` | Real | |
| Dashboard Studio | `/dashboards/:id/edit` | `/api/ha-dashboards/:id` | Real | Widget catalogue, config panel |
| Playbooks | `/response/playbooks` | `/api/ha-soar-playbooks/*` | Real | Builder with ReactFlow nodes (Sprint 18) |
| Playbook Builder | `/response/playbooks/:id/edit` | `/api/ha-soar-playbooks/:id` | Real | |
| Response Library | `/response/library` | `/api/ha-response-actions/*` | Real | |
| Response Activity | `/response/activity` | `/api/ha-response-actions/history` | Partial | Stub content |
| Compliance | `/compliance` | `/api/ha-compliance/*` | Partial | Shows ComplianceFindingDTO grid; drill-down not built |
| Posture / Sensors | `/posture/sensors` | `/api/ha-agents/*` | Real | Add agent drawer with one-click provisioning |
| Posture / Vulnerabilities | `/posture/vulnerabilities` | `/api/ha-telemetry/vuln/*` | Real | Sprint 33 wired |
| Posture / CIS Benchmark | `/posture/cis-benchmark` | `/api/ha-telemetry/sca/*` | Real | Sprint 16 |
| Posture / Active Directory | `/posture/active-directory` | `/api/ha-active-directory/*` | Partial | |
| Posture / Identities | `/posture/identities` | `/api/ha-posture/*` | Partial | |
| Posture / Exposure | `/posture/exposure` | `/api/ha-posture/exposure` | Stub | |
| Posture / Assets | `/posture/assets` | `/api/ha-posture/assets` | Partial | |
| Posture / Readiness Matrix | `/posture/readiness` | `/api/ha-compliance/readiness` | Partial | |
| UEBA Risk Dashboard | `/ueba/risk` | `/api/ha-uba/*` | Real | Risk leaderboard, trend charts (Sprint 28/29) |
| UEBA Entity Timeline | `/ueba/entity-timeline` | `/api/ha-uba/entity-timeline/*` | Real | Sprint 29 |
| Entity List / Detail | `/entities`, `/entities/:id` | `/api/ha-entities/*` | Partial | |
| Threat Constellation | `/constellation` | `/api/ha-graph/*` | Real | Neo4j entity graph, node detail panel |
| EDR Endpoints | `/edr/endpoints` | `/api/ha-edr/*` | Real | Sprint 16 UX |
| EDR Endpoint Timeline | `/edr/endpoints/:id/timeline` | `/api/ha-edr/timeline/*` | Real | |
| EDR File Quarantine | `/edr/quarantine` | `/api/ha-edr/quarantine/*` | Real | |
| EDR FIM Dashboard | `/edr/fim` | `/api/ha-edr/fim/*` | Real | Sprint 16 / Sprint 33 |
| EDR Agent Policies | `/edr/policies` | `/api/ha-agent-policies/*` | Real | |
| Reports / Scheduled | `/reports/scheduled` | `/api/ha-reports/scheduled/*` | Real | |
| Reports / Incident Reports | `/reports/incidents` | `/api/ha-reports/incidents/*` | Real | |
| Reports / Templates | `/reports/templates` | `/api/ha-reports/templates/*` | Real | |
| Reports / SITREP | `/reports/sitrep` | `/api/ha-reports/sitrep/*` | Partial | |
| Reports / After Action | `/reports/after-action` | `/api/ha-reports/after-action/*` | Partial | |
| Admin Users | `/admin/users` | `/api/admin/users/*` | Real | |
| Admin Tenants | `/admin/tenants` | `/api/ha-tenants/*` | Real | CRUD only, no data isolation UI |
| MSSP Portal Overview | `/mssp/overview` | `/api/ha-mssp/*` | Real | Sprint 23 — MsspOverviewPage |
| Admin SSO | `/admin/sso` | `/api/ha-sso/*` | Real | OIDC/SAML (Sprint 17) |
| Admin SCIM | `/admin/scim` | `/api/ha-scim/*` | Real | Sprint 17 |
| Admin Threat Intel | `/admin/threat-intel` | `/api/ha-threat-intel/admin/*` | Real | Feed management, TAXII/MISP config |
| Admin Data Parsing | `/admin/data-parsing` | `/api/ha-parser-rules/*` | Partial | Parser authoring UI partial |
| Admin Audit | `/admin/audit` | `/api/ha-audit/*` | Real | Audit trail page |
| Admin Retention | `/admin/retention` | `/api/ha-retention/*` | Real | ISM policy UI |
| Admin Notifications | `/admin/notifications` | `/api/ha-notifications/*` | Partial | |
| Admin Integrations | `/admin/integrations` | `/api/ha-integrations/*` | Partial | |
| Admin Connection Keys | `/admin/connection-keys` | `/api/ha-connection-keys/*` | Partial | |
| System Settings | `/settings` | `/api/ha-settings/*` | Real | AI/LLM tab, email, security, general (Sprint 20) |
| API Keys | `/settings/api-keys` | `/api/ha-api-keys/*` | Real | |
| Inputs / Data Sources | `/inputs` | `/api/ha-inputs/*` | Real | Add Data Source Wizard |
| AI Chat panel | (component, not dedicated page) | `/api/ha-ai-chat/*` | Real (backend), Partial (UI) | Chat service built (Sprint 25), no dedicated page yet — surfaced in drawer |
| NL Search | Built into `/hunt` | `/api/ha-nl-search` | Real | Sprint 26 NlQueryBar integrated |
| Ollama / local LLM | Admin setting | `/api/ha-settings/llm` | Real | Sprint 27 |
| Air-gap mode | Config flag | `HaAirGapConfig` bean | Real | Sprint 31 |


---

## 9. AI & Agentic Capabilities — Current State

### What is built and working

| Capability | Status | Location |
|---|---|---|
| SOC-AI alert triage | Real | `plugins/soc-ai/` — LLM classification, confidence, reasoning, next steps; stored in OpenSearch `v3-hive-soc-ai` |
| Streaming AI chat | Real (backend), Partial (UI) | `HaAiChatService` + `aiChatService.ts`; SSE streaming; PII scrubbing |
| NL-to-DSL query translation | Real | `HaSearchService` — user types natural language, LLM generates OpenSearch DSL; sanitizer + validator prevent injection |
| AI-assisted rule generation | Real | `HaRuleGenerationService` → `RuleGenerationPage.tsx`, Monaco review drawer |
| AI incident summary | Real (backend) | `HaIncidentContextService` — auto-summary of incident timeline |
| UEBA anomaly scoring | Real | `UbaService` — entity risk leaderboard, anomaly feed, watchlist, `hive_uba_entity_risk` table |
| LLM provider abstraction | Real | `HaLlmProvider` interface; implementations: OpenAI, Azure OpenAI, Ollama, Disabled |
| Ollama on-prem LLM | Real | `OllamaLlmProvider` (Sprint 27) — model pull, list, use |
| Air-gap mode | Real | `HaAirGapConfig.AirGapGuard` (Sprint 31) — blocks external LLM + CVE enrichment when `APP_AIR_GAP=true` |
| Threat intel enrichment | Real | `ThreatIntelLookupService`, `TaxiiClientService` (STIX/TAXII 2.1), `MispConnectorService` |
| Search suggestions | Real | `HaSearchSuggestionService` → `/hunt` suggestion chips |

### What is partial or missing

| Gap | Impact |
|---|---|
| AI chat dedicated page in frontend-v3 | Analyst workflow gap — chat surfaced in drawer only |
| Per-tenant LLM prompt isolation (MSSP) | AI results shared across tenants |
| AI explanation traceability | User cannot see which raw events fed the LLM triage conclusion |
| Peer-group UEBA baseline (Exabeam-style) | Current UEBA uses absolute thresholds, not cohort deviation |
| Entity risk score explanation | Score is visible; breakdown is not |
| Government: data sovereignty verification | Ollama path exists but no ATO documentation |

---

## 10. Agentic AI SIEM — Gap Analysis & Roadmap

### Current agentic capability: Level 1 (Assisted)

HiveArmor can: classify alerts autonomously via LLM, translate natural language to queries, generate detection rule YAML, summarize incident timelines, score entity risk, run SOAR playbooks automatically on rule match.

HiveArmor cannot: act autonomously across multi-step investigation flows, chain reasoning from alert → evidence → hypothesis → response without human confirmation at each step, maintain investigation memory across sessions.

### Gap vs. next-gen SIEM competitors

| Capability | HiveArmor | XSIAM | Stellar Cyber | Google SecOps | Sentinel Copilot |
|---|---|---|---|---|---|
| Alert triage (LLM) | Real | Real | Partial | Real | Real |
| NL query | Real | Real | Partial | Real | Real |
| Agentic investigation | Missing | Partial | Missing | Real (Gemini) | Real (GPT-4o) |
| Auto-root-cause chain | Missing | Partial | Missing | Partial | Partial |
| On-prem LLM | Real (Ollama) | No | No | No | No |
| Air-gap mode | Real | No | No | No | No |
| Peer-group UEBA | Missing | Real | Real | Partial | Partial |
| Detection content | 135 rules | 3000+ | 1500+ | 2000+ | Sigma community |

### Phased agentic roadmap

**AI-1 (Current — Sprints 25–29):** Assisted triage, NL search, rule generation, entity risk, Ollama. DONE.

**AI-2 (Recommended next — 6 sessions):** Investigation agent — LLM-driven multi-step pivot from alert to related events to entity to response recommendation. Requires: streaming investigation session API, structured reasoning trace stored to PostgreSQL, UI that renders the reasoning chain.

**AI-3 (12 sessions):** Autonomous playbook generation — AI generates SOAR YAML from alert + threat intel context; human reviews before first-run activation. Requires: richer SOAR action library, DRY-RUN enforcement, audit trail.

**AI-4 (18 sessions):** Peer-group UEBA baseline + behavioral detection — machine learning on entity time-series, deviation from cohort, automatic anomaly detection without threshold tuning. Requires: Flink or stateful stream processor for baseline state management (OpenSearch cannot hold rolling window state efficiently).

---

## 11. Enterprise SIEM Gap Matrix

Legend: ✅ Present | 🟡 Partial | ❌ Missing | 🗺️ Roadmapped

| Domain | Enterprise IT | MSSP | Government | Notes |
|---|---|---|---|---|
| Log ingestion (29 source types) | ✅ | 🟡 | ✅ | Missing per-tenant routing at collector level |
| Source parser YAML (47 parser families) | ✅ | 🟡 | ✅ | No self-service UI authoring |
| Detection engine (CEL, sequence, risk, graph, anomaly) | ✅ | 🟡 | ✅ | Per-tenant rule sets missing |
| Detection content (135 builtin rules) | 🟡 | 🟡 | 🟡 | 135 vs Elastic 900+, Sigma 7000+ |
| Sigma rule import | ✅ | 🟡 | ✅ | Scheduled community pull not automated |
| Threat intelligence (ThreatWinds, TAXII, MISP) | ✅ | 🟡 | 🟡 | No TLP enforcement, no ISAC connectors |
| Alert management + triage | ✅ | 🟡 | ✅ | No per-tenant alert isolation in index |
| Incident management (full lifecycle) | ✅ | 🟡 | 🟡 | No CISA/US-CERT classification fields |
| SOAR playbooks + response actions | ✅ | 🟡 | ✅ | Per-tenant playbook separation missing |
| EDR (process, file, net, FIM) | ✅ | 🟡 | ✅ | eBPF/ETW need deps; ESF needs Apple entitlement |
| UEBA / entity analytics | 🟡 | 🟡 | 🟡 | Peer-group baselines missing |
| Compliance (HIPAA, custom, NIST CSF) | 🟡 | 🟡 | 🟡 | NIST 800-53, CMMC, FedRAMP packs missing |
| Analytics / dashboards | ✅ | 🟡 | ✅ | MSSP all-tenant overview dashboard missing |
| AI triage (SOC-AI plugin) | ✅ | 🟡 | ✅ | External LLM = data sovereignty risk; Ollama mitigates |
| NL search | ✅ | 🟡 | ✅ | Per-tenant query scoping needs MSSP TenantContext |
| Multi-tenancy / MSSP | 🟡 | 🟡 | ❌ | Backend middleware complete; collector-level routing missing |
| OIDC / SAML SSO | ✅ | ✅ | ✅ | |
| SCIM 2.0 provisioning | ✅ | 🟡 | ✅ | |
| Air-gap / on-prem deployment | ✅ | ✅ | ✅ | Sprint 31 complete |
| Kubernetes log ingestion | ❌ | ❌ | ❌ | No OTel receiver; no K8s filter YAML |
| OTel/OTLP ingest | ❌ | ❌ | ❌ | Roadmapped in NEXTGEN-ARCHITECTURE.md |
| Detection-as-Code / GitOps webhook | 🟡 | 🟡 | 🟡 | Rules in git; no webhook-based auto-deploy |
| Security Knowledge Graph (Neo4j) | 🟡 | 🟡 | 🟡 | Constellation page built; graph depth limited |
| Government compliance packs (NIST 800-53, CMMC, FedRAMP) | ❌ | ❌ | ❌ | 🗺️ Phase 4 roadmap |
| POA&M management | 🟡 | 🟡 | 🟡 | `ha_poam_item` table created (Sprint 33); no UI yet |

---

## 12. Security Findings & Status

### SEC-01 — Password in GET query parameter

**Original issue:** `GET /api/check-credentials?password=...` in AccountResource.java  
**Status as of 2026-08-02:** FIXED — CHANGELOG v10.5.0 confirms endpoint converted to `POST`  
**Verification:** `AccountResource.java` has no GET endpoint with password parameter — only `@GetMapping("/authenticate")` (session check) and `@GetMapping("/account")` (current user)

### SEC-02 — JWT key rotates on every restart (DEBT-14)

**Original issue:** `TokenProvider.java` regenerated key at startup  
**Status:** FIXED — CHANGELOG Unreleased confirms "JWT signing key is now persisted to an encrypted database column and reloaded on startup"  
**Verification:** `TokenProvider.java` logs reference loading from configuration and explicit rotation action; no longer references `generateSafeToken()` on startup

### SEC-03 — CORS wildcard in production

**Original issue:** `application-prod.yml` had `allowed-origins: '*'`  
**Status:** FIXED — `application-prod.yml` now uses `allowed-origins: ${APP_FRONTEND_URL:https://localhost:4200}`; startup fails fast if unset  
**Verification:** Confirmed from grep of application-prod.yml

### SEC-04 — gRPC InsecureTrustManagerFactory

**Original issue:** `GrpcConfiguration.java` used `InsecureTrustManagerFactory.INSTANCE`  
**Status:** FIXED — CHANGELOG Unreleased confirms "TLS 1.3 enforced on all gRPC connections"  
**Verification:** Grep for `InsecureTrustManagerFactory` in backend Java returns only a comment in `OpenAiLlmProvider.java` and `HaLlmProvider.java` stating it is NEVER enabled

### SEC-05 — OpenSearch query string concatenation (injection)

**Status:** Mitigated in Java backend via `SearchUtil` DSL builders  
**Status in Go:** `sdk/os` provides DSL builders; agent/event-processor migrated to SDK (Sprint 33). Plugins still on `threatwinds/go-sdk` need verification individually.

### Rate limiting on /api/authenticate

**Status:** CHANGELOG Unreleased confirms "Rate limiting applied to `/api/authenticate`"  
**Verification:** No `@RateLimiter` annotation visible on endpoint; likely implemented as a filter in SecurityConfiguration or a Spring Boot 3 rate-limit bean. Exact implementation not verified in source — find the rate-limit bean before claiming this closed.

### WebSocket audit gap (WS-SEC-01)

**Original issue:** WebSocket upgrade token in URL query param (`?access_token=`)  
**Status:** Sprint 11 task T06 added audit events to the WebSocket command channel (checked). Full fix (move token to STOMP CONNECT frame) was listed in SEC-FIXES.md as requiring coordinated frontend change — verify current state in `WebsocketConfiguration.java`.

### X-HiveArmor-error header redaction

**Status:** FIXED — CHANGELOG Unreleased confirms redaction of error details in 4xx/5xx in production mode

### Audit trail coverage

CHANGELOG v10.0.0 and Unreleased confirm audit trail for: alert status changes, incident status changes, user login/logout, agent remote commands, API key creation/revocation, plus source IP and User-Agent added in Unreleased.

### Known remaining concerns

1. **164 files in `plugins/` still import `github.com/threatwinds/go-sdk`** — branding violation, not a security issue, but needs migration
2. **Rate limiting implementation** — described in CHANGELOG but exact code not located in SecurityConfiguration; verify
3. **NL search injection** — `HaSearchService` has `HaSearchServiceInjectionTest.java` and `HaSearchServiceSanitizerTest.java` — good coverage; verify prompt injection test coverage is adequate
4. **AI chat PII scrubbing** — `HaAiChatService` has property tests (`HaAiChatPiiWhitelistPropertyTest`); verify PII patterns are comprehensive
5. **Per-tenant AI prompt isolation** — MSSP tenants share the same LLM context; a tenant's event data could potentially appear in another tenant's AI triage if request boundaries are not enforced

---

## 13. Sprint History & Status

All sprint task checklists show 100% completion (verified by grep on tasks.md). However, "checked" in tasks.md reflects the sprint author's intent. The table below notes verification confidence.

| Sprint | Name | Scope | Task Status | Confidence | Key Notes |
|---|---|---|---|---|---|
| S11 | Audit Fixes | branding.md, backend-go.md, NL search hardening, WebSocket audit, compliance-orchestrator SDK | 8/8 ✅ | High | Rule files created; WebSocket audit event added; sanitizer for NL search |
| S12 | Go SDK Migration | Fork go-sdk-main → sdk/, rename threatwinds → hivearmor, migrate event-processor + 20 modules | 8/8 ✅ | High | sdk/ exists with correct module path; agent/event-processor have zero threatwinds imports |
| S13 | Alert Schema v2 | New alert fields: mitre[], risk_score, confidence, kill_chain_phase, threat_intel.* | 5/5 ✅ | Medium | Fields added; verify OpenSearch index template updated to match |
| S14 | Sigma Detection | Sigma import pipeline, `HaSigmaSyncService`, bulk import UI, rule testing sandbox | 7/7 ✅ | High | RuleImportPage, RuleTestingPage, RuleTestPage all present |
| S15 | ECS Hunt | ECS normalization layer in event-processor, SearchHuntPage, FieldBrowser | 6/6 ✅ | High | SearchHuntPage with FieldBrowser, QueryBar, TimelineTabContent present |
| S16 | Endpoint UX | EDR investigation pages, process tree, FIM dashboard, endpoint timeline, agent policies | 6/6 ✅ | High | All EDR pages present; agent policy management present |
| S17 | OIDC/SCIM | OIDC callback page, SCIM 2.0 API, SSO providers page | 6/6 ✅ | High | OidcCallbackPage, SsoProvidersPage, ScimConfigPage all present |
| S18 | SOAR | Playbook builder (ReactFlow), response action library, execution streaming | 5/5 ✅ | High | PlaybookBuilderPage with nodes, ActionPalette, NodeConfigPanel present |
| S19 | Threat Intel | HiveIntelligencePage, TAXII/MISP connectors, TlpBadge, feed management UI | 6/6 ✅ | High | Page real-data wired; TaxiiClientService + MispConnectorService present |
| S20 | System Settings | SystemSettingsPage tabs (AI/LLM, email, security, general), Ollama model picker | 4/4 ✅ | High | SystemSettingsAiTab present with property tests |
| S21 | MSSP Schema | Liquibase MSSP schema, HaClient extensions, TenantContext, MsspTenantResolver | 9/9 ✅ | High | All multitenancy/ classes confirmed present |
| S22 | Tenant Index Routing | MsspIndexResolver, service-layer refactor replacing hardcoded v3-hive-* | 10/10 ✅ | High | MsspIndexResolver present with property tests |
| S23 | MSSP Portal | MSSP frontend pages, MsspOverviewPage, tenant CRUD portal, ROLE_MSSP_ADMIN | 12/12 ✅ | High | features/mssp/ directory with pages, API, guards present |
| S24 | Per-tenant Compliance | Per-tenant compliance scope, report delivery | 6/6 ✅ | Medium | Verify tenant isolation wired in ComplianceOrchestrator |
| S25 | AI Chat | HaAiChatService, streaming chat API, aiChatService.ts, PII scrubbing | 5/5 ✅ | High | Service + property tests present; no dedicated chat page (drawer only) |
| S26 | NL Search | NlQueryBar in SearchHuntPage, DslPreviewPanel, search suggestions | 8/8 ✅ | High | Sprint 26 additions visible in SearchHuntPage comments |
| S27 | Ollama | OllamaLlmProvider, model pull/list/use, SystemSettingsAiTab Ollama section | 9/9 ✅ | High | OllamaLlmProvider + related DTOs present |
| S28 | UEBA Signals | UEBA signal collectors, RiskDashboardPage, anomaly chips | 8/8 ✅ | High | RiskDashboardPage wired to uebaService |
| S29 | UEBA Baseline | EntityTimelinePage, UbaSyncService baseline, ha_ueba_baseline Liquibase | 10/10 ✅ | Medium | EntityTimelinePage present; verify Liquibase migration |
| S30 | Compliance Packs | Additional compliance framework YAML packs | 7/7 ✅ | Low | Verify actual YAML packs added to event-processor/compliance/ |
| S31 | Air-gap | HaAirGapConfig, AirGapGuard, gated CVE enrichment | 5/5 ✅ | High | AirGapGuard injected into HaTelemetryService (Sprint 33 confirmed) |
| S32 | Smoke Test | End-to-end smoke test suite | 3/3 ✅ | Low | Verify test files exist in functional/ |
| S33 | Agent Integration | SDK import migration (agent/event-processor/collector/as400), chan<- fix, ha_poam_item | 5/5 ✅ | High | Zero threatwinds in agent/event-processor confirmed; plugins/ NOT migrated (out of scope) |

---

## 14. Cursor Agent Enhancement — What Was Built (2026-07-29)

A Cursor AI session on 2026-07-29 performed a large-scale enhancement of the agent and platform. The full report is at `HIVEARMOR_AGENT_ENHANCEMENT_REPORT.md`. Summary:

**Scope:** 108 new files, 30 modified files, ~14,710 lines added

### Fully integrated (confirmed files present and correct)

- `agent/collector/fim/` — 11 files, FIM engine with SHA-256 baseline SQLite DB, Windows registry FIM, cross-platform `owner_unix.go` / `owner_windows.go`
- `agent/collector/dns/` — Linux DNS telemetry via tcpdump, Shannon entropy for DGA detection
- `agent/collector/netconn/` — Per-process network connections, all three platforms
- `agent/tamper/` — 7 files including binary hash watchdog, platform-specific hardening
- `agent/serv/service.go` — dual-mode install (`log` / `log-edr`)
- `event-processor/builtin-rules/` — 135 YAML detection rules (windows, linux, network, cloud, graph subdirs)
- Backend: `HaEdrFimService.java`, `HaEdrQuarantineService.java`, new Liquibase migrations
- Frontend: `FimDashboardPage.tsx`, `EndpointTimelinePage.tsx`, `FileQuarantinePage.tsx`, `AgentPoliciesPage.tsx`, `posture/sensors/AddAgentDrawer.tsx`
- OpenSearch index template for FIM events

### Stub / pending activation (files present, external dependency missing)

- `agent/collector/ebpf/` — 8 files including `bpf/hivearmor.bpf.c` (17 tracepoints). Needs: `go get github.com/cilium/ebpf@v0.17.0` + `go generate` in package dir to compile BPF objects into Go.
- `agent/collector/etw/` — 4 files (Windows ETW 8 providers). Needs: `go get github.com/0xrawsec/golang-etw@v1.6.2` + stub `run()` body replacement.
- `agent/collector/esf/` — 5 files (macOS EndpointSecurity). Needs: Apple entitlement `com.apple.developer.endpoint-security.client` (3–6 week approval).

### Sprint 33 reconciliation (completed)

Sprint 33 handled the mechanical integration work: SDK import path migration for agent/event-processor/collector/as400, channel direction fix (`chan<- *plugins.Log`), AirGapGuard injection, ha_poam_item Liquibase migration, and full build verification gate. All tasks checked complete.

### Remaining gap from Cursor session

The Cursor session report mentions the agent `go.mod` needs `cilium/ebpf` and `golang-etw` added. Sprint 33 tasks.md does not explicitly include this. These two `go get` commands must be run manually before eBPF/ETW can be compiled.

---

## 15. Phased Roadmap

Based on `.plan/PLATFORM_AUDIT.md` and `.plan/NEXTGEN-ARCHITECTURE.md`:

### Phase 0 — Security & Stability (COMPLETE via Sprints S11–S13)

SEC-01 through SEC-04 fixed, JWT persistence fixed, CORS fixed, rate limiting added, NL search sanitized, audit trail extended.

### Phase 1 — Enterprise IT Readiness (Sprints S13–S20, COMPLETE)

Alert schema v2, Sigma detection content, ECS normalization, EDR investigation UI, OIDC/SCIM, SOAR playbooks, threat intel feeds (TAXII/MISP), system settings, AI chat, NL search, UEBA.

### Phase 2 — MSSP Readiness (Sprints S21–S24, COMPLETE at backend level)

MSSP schema, tenant index routing, MSSP portal, per-tenant compliance. Backend middleware fully built. Gaps remaining: collector-level per-tenant log routing (event-processor and plugins need tenant-prefix injection), per-tenant detection rules, per-tenant MSSP overview dashboard (MsspOverviewPage built but data scope needs verification).

### Phase 3 — AI Differentiation (Sprints S25–S29, COMPLETE)

Streaming AI chat, NL search, Ollama on-prem, UEBA signals + baseline, air-gap mode.

### Phase 4 — Government Readiness (NOT STARTED)

NIST 800-53 / NIST 800-171 / CMMC Level 2 compliance packs, FedRAMP evidence tagging, POA&M management UI (table exists, no UI), classified environment deployment guide, ISAC feed connectors, TLP-aware IOC handling.

### Next-generation architecture (strategic, multi-year)

From `.plan/NEXTGEN-ARCHITECTURE.md`:
- **OTel/OTLP ingest layer** — add OTLP receiver to event-processor; publish OTel Collector configs for top 10 source types; enables zero-agent Kubernetes log ingestion
- **Tiered storage** — keep OpenSearch as hot tier (last 30 days); add Apache Iceberg cold tier on S3/GCS/Azure Blob for 70–80% storage cost reduction; query via Trino
- **Detection-as-Code / GitOps** — webhook-based auto-deploy of YAML rules from git; CI test harness to validate rules against sample events before deploy
- **Flink migration** — stateful stream processor for sequence detection and UEBA baseline (fixes state-loss-on-restart problem for sequence engine)
- **Security Knowledge Graph** — deepen Neo4j entity graph beyond current offense grouping

---

## 16. Active Sprint Context

As of 2026-08-02, Sprints S11 through S33 are all marked complete (100% task completion in tasks.md).

**Identified next work items (not yet in a sprint spec):**

1. **Plugins SDK migration** — Migrate all 17 plugins in `plugins/*/` from `github.com/threatwinds/go-sdk` to `github.com/hivearmor/sdk`. Sprint 33 explicitly excluded plugins (only agent, event-processor, hivearmor-collector, as400 were in scope). ~164 files affected.

2. **eBPF/ETW dependency activation** — `go get github.com/cilium/ebpf@v0.17.0` in `agent/` and `go get github.com/0xrawsec/golang-etw@v1.6.2`; run `go generate` in `agent/collector/ebpf/`; replace ETW stub `run()` body.

3. **Rate limiting verification** — Locate the actual rate-limit implementation for `/api/authenticate` (CHANGELOG says it exists; source not found in security config scan).

4. **Government compliance packs** — Phase 4 not started; NIST 800-53, CMMC, FedRAMP YAML control packs needed.

5. **POA&M UI** — `ha_poam_item` table exists (Sprint 33); no frontend page.

6. **AI chat dedicated page** — Backend streaming chat API ready (Sprint 25); only surfaced in drawer currently.

7. **Design token violations** — ThreatConstellationCanvas.tsx hardcodes 5 hex values in inline HTML strings; should be refactored.

---

## 17. Key Decisions Log

| Decision | Detail |
|---|---|
| OpenSearch index pattern | `v3-hive-<type>-YYYY.MM.DD` — version-locked, hyphens not underscores, no leading underscore. Any doc showing `_v3_hive_*` is outdated. |
| Go SDK ownership | Forked from `go-sdk-main/` (upstream ThreatWinds); now lives at `sdk/` as `github.com/hivearmor/sdk`. go-sdk-main is READ-ONLY reference. |
| No message broker | Kafka/RabbitMQ/NATS NOT used; all inter-service communication is gRPC or HTTP. Adding a broker requires explicit ADR. |
| MSSP architecture | Greenfield; fully built via Sprints S21–S24. TenantContext → ThreadLocal, MsspIndexResolver replaces all hardcoded index names. |
| AI feature naming | "Hive Intelligence" in all UI text. Never "AI Assistant", "Copilot", "GPT", or any vendor AI brand. |
| LLM strategy | Multi-provider via HaLlmProvider interface: OpenAI, Azure OpenAI, Ollama (on-prem), Disabled. Air-gap mode blocks all external calls. |
| Frontend isolation | frontend-v3/ is completely isolated from frontend-v2/ and frontend/. Never import from v2. |
| Production data | No mock/demo/fixture data in production routes. Storybook fixtures live only in `.stories.tsx` files. |
| INTERNAL_KEY | Shared by backend, agentmanager, eventprocessor. Changing it requires simultaneous redeploy of all three. |
| Plugin hot-reload | YAML rules are loaded at event-processor startup. No hot-reload — restart required for rule changes. |
| Sequence state | Sequence detection state is lost on event-processor restart (known architectural limitation). Flink migration is the fix path. |
| SSO | SAML2 + OIDC implemented. Future-only SSO changes documented in product decisions. |
| JWT storage | `localStorage["hivearmor_auth_token"]`. Clear on logout and 401. Never in URL params or Zustand/React state. |

---

## 18. Conventions for AI Development Sessions

This section is the primary reference for safe contribution. Read this + sections 2–7 before writing any code.

### Naming rules

- Product: always `HiveArmor` — never `Hive Armor`, `HIVEARMOR`, `ArmorSight`, `UTMStack`, `nilachakra`, `threatwinds`
- Java packages: `com.hivearmor.*` — never `com.utmstack.*`
- Go modules: `github.com/hivearmor/...` — never `github.com/threatwinds/...` in new code
- React components: `Ha*` prefix for PatternFly wrappers (e.g., `HaMasthead`, `HaDrawer`)
- API endpoints: `/api/ha-*` for new HiveArmor endpoints
- CSS variables: `--ha-*` prefix

### Forbidden patterns (instant code review failure)

| What | Why |
|---|---|
| `any` type in TypeScript | Absolute prohibition. Use `unknown` + type guard. |
| Raw hex colors in `.tsx`/`.ts`/`.css` | Always use `var(--ha-<token>)` |
| `dangerouslySetInnerHTML` with user content | XSS risk |
| Mock/fixture data in production routes | Data integrity violation |
| `github.com/threatwinds/go-sdk` imports in new Go files | Branding + wrong SDK |
| `fmt.Errorf` / `log.Printf` in plugin code | Use `catcher.Error()` / `catcher.Log()` |
| Raw user input in OpenSearch query string | SEC-05 injection risk — use SearchUtil DSL builders |
| `InsecureSkipVerify: true` | SEC-04 — never in production TLS |
| JWT in URL query parameters | SEC-01 pattern — always in Authorization header |
| `console.log` with customer data | Data hygiene — use anonymized IDs |
| Hard-coded index names like `v3-hive-alert-` | Use SDK builders or MsspIndexResolver |
| Changing a shipped Liquibase changeset | Immutable — add a new changeset instead |

### Frontend validation gates (run in this order before claiming done)

```bash
cd frontend-v3
npm run lint         # zero ESLint errors
npm run type-check   # zero TypeScript errors (tsc --noEmit)
npm run test         # all Vitest tests pass
npm run build        # production build succeeds
```

**Never claim completion if any gate was skipped or failed.**

### Backend validation gates

```bash
cd backend
mvn -s settings.xml liquibase:validate   # after any schema change
mvn -s settings.xml test                 # unit tests pass
mvn -B -Pprod clean package -s settings.xml -DskipTests   # production build
```

### Go validation gates

```bash
go build ./...
go vet ./...
go test -short ./...
go mod tidy
```

### Component patterns (use existing, don't reinvent)

- Use `SiemDataGrid` (AG Grid wrapper) for any high-volume data table (100+ rows)
- Use `HaChart` for all charts (ECharts wrapper)
- Use `DashboardCanvas` for drag-drop dashboard layout
- Use `useAlertStream` hook for SSE alert feeds (never raw `EventSource`)
- Use `useEpsStream` hook for live EPS counter
- All API calls through typed service files in `src/services/` — never raw `fetch` in page components
- All server state through TanStack Query v5 — never `useEffect` + `fetch` chains
- All UI interaction state through Zustand v5 stores in `src/store/`

### New page checklist

Every new production route must implement all four states:
1. Loading state (skeleton, not spinner-only)
2. Empty state (no data, with actionable message)
3. Error state (typed `ApiError`, with retry option)
4. Access-denied state (redirect to login if no JWT; render access-denied component if insufficient role)

### New REST endpoint checklist

1. Add `@PreAuthorize("hasAnyRole('ROLE_ADMIN', 'ROLE_ANALYST')")` or appropriate role check
2. Use `/api/ha-*` prefix
3. Implement audit trail call for state-changing actions
4. Add typed DTO in `src/types/` for frontend consumption
5. Register new service in `src/services/` — wire through Vite proxy

### New Liquibase migration checklist

1. Create `YYYYMMDDNNN_description.xml` (date order strict)
2. Include `<preConditions onFail="MARK_RAN">` for idempotency
3. New columns must have `DEFAULT` or `NOT NULL` only with explicit default
4. Add include to `master.xml` after the most recent entry
5. Run `mvn -s settings.xml liquibase:validate`

### New Go plugin checklist

1. Use binary name `com.hivearmor.<name>.plugin` (exact — eventprocessor scans by name)
2. Call `sdk.InitXxxPlugin("com.hivearmor.<name>.plugin", handlerFunc)` as first action in `main()`
3. Implement health check handler (must respond within 5 seconds)
4. Read config via `sdk/plugins.GetCfg(processName)` — never directly from env vars
5. Add to supervisord config in `event-processor/entrypoint.sh`

### TanStack Query key conventions

```typescript
['alerts', filters, pagination]     ['alert', id]
['incidents', filters, pagination]  ['incident', id]
['rules', filters]                  ['rule', id]
['dashboards']                      ['dashboard', id]
```

### Auth token handling

- Store: `localStorage["hivearmor_auth_token"]`
- Send: `Authorization: Bearer <token>` header on every API call
- Clear: on logout, on 401 response
- Never: in URL params, React state, Zustand store, `console.log`

### MSSP multi-tenant API calls

When implementing features that must be tenant-scoped:
- Backend: inject `TenantContext` via `MsspTenantResolver` (auto-injected by `TenantContextFilter`)
- Go services: use `sdkos.BuildTenantIndex(dataType, tenant.Prefix)` for index names
- Frontend: MSSP admin role guard via `MsspAdminGuard` component in `src/features/mssp/guards/`

---

## 19. What to Read Before Starting Any Work

### Before any frontend-v3 work

1. `.claude/rules/frontend-v3.md` (auto-loaded)
2. `.claude/rules/frontend-v3-design-system.md` (auto-loaded)
3. `.claude/rules/frontend-v3-api-contracts.md` (auto-loaded)
4. `.claude/rules/frontend-v3-security.md` (auto-loaded)
5. `.kiro/steering/brand.md` (auto-loaded by Kiro)
6. `.plan/frontend-v3-spec/00-SDD-GUIDE.md` — SDD session model
7. The specific spec file for the feature being implemented

### Before any backend work

1. `.claude/rules/backend.md` (auto-loaded)
2. `.plan/features/SEC-FIXES.md` — open security issues
3. Check existing service classes in `service/` before creating a new one
4. Run `mvn -s settings.xml liquibase:validate` after any schema change

### Before any Go work

1. `.claude/rules/backend-go.md` (auto-loaded)
2. `.kiro/steering/go-rules.md` (auto-loaded by Kiro)
3. Check if the module imports `github.com/hivearmor/sdk` — if not, the import migration may be pending
4. Check `go.mod` for the correct `replace` directive for `../sdk`

### Before any sprint or feature work

1. `.plan/PLATFORM_AUDIT.md` — current state and gaps
2. `.plan/MASTER_PLAN.md` — phased roadmap
3. The specific `.kiro/specs/sprint-<N>-*/` directory for the sprint being worked
4. `CHANGELOG.md` — what was actually shipped to understand the baseline

---

## 20. Glossary of Internal Terms

| Term | Meaning |
|---|---|
| `ha` | Short name for HiveArmor in code identifiers. Never in UI text. |
| `INTERNAL_KEY` | Shared secret between backend, agentmanager, eventprocessor. Any change requires simultaneous redeploy of all three. |
| `REPLACE_KEY` | Secret injected at agent/collector build time via ldflags. Required for agent authentication. Sourced from `$AGENT_SECRET_PREFIX` in CI. |
| `v3-hive-<type>-YYYY.MM.DD` | Immutable OpenSearch index naming pattern. `v3` prefix is permanent for this platform generation. |
| `TenantContext` | Thread-local tenant identifier injected by `TenantContextFilter` on every request in MSSP mode. |
| `MsspIndexResolver` | Spring bean that replaces hardcoded index names with tenant-aware equivalents. |
| `SiemDataGrid` | AG Grid Community 36 wrapper used for all high-volume operational tables. |
| `HaChart` | Apache ECharts wrapper component. |
| `DashboardCanvas` | GridStack.js 13 wrapper for drag-drop dashboard layout. |
| `catcher` | SDK package providing structured logging and error handling. `catcher.Error(msg, cause, fields)` is the standard error constructor. |
| `SearchUtil` | Backend DSL builder library. Always use for OpenSearch queries — never raw string concatenation. |
| `afterEvents` | Time-window in CEL correlation rules defining the maximum window for correlated events. |
| `offense` | OpenSearch index type (`v3-hive-offense-*`) grouping alerts by adversary entity. |
| `SOC-AI` | The soc-ai plugin — runs LLM triage on alerts, produces classification + reasoning + next steps. |
| `Hive Intelligence` | UI name for the threat intel + AI enrichment feature area. |
| `Command Center` | UI name for the main dashboard/homepage. |
| `Analyst Queue` | UI name for alert triage / incident queue. |
| `Correlated Findings` | UI name for the offense/correlation view. |
| `Detection Rules` | UI name for YAML rule management. |
| `POAM` | Plan of Action and Milestones — US government compliance artifact; `ha_poam_item` table added Sprint 33. |
| `DEBT-14` | JWT key rotation on restart bug — fixed in v11 Unreleased. |
| `SDD` | Spec-Driven Development — one micro-task per session, all four gates required. |
| `ldflags` | Go linker flags injecting secrets at build time into agent/collector binaries. |
| `entrypoint.sh` | Event-processor container entrypoint; dynamically generates supervisord config to launch plugins. |
| go-sdk-main | Upstream ThreatWinds SDK source. Read-only reference in the repo. The actual SDK used is `sdk/`. |

---

## 21. Things That Still Need Verification

The following items were not fully confirmed during the 2026-08-02 audit and should be verified before being treated as complete:

1. **Rate limiting on `/api/authenticate`** — CHANGELOG says it exists; exact filter/bean not found in SecurityConfiguration.java scan. Locate `RateLimitFilter` or equivalent before closing.

2. **WebSocket token in STOMP frame (WS-SEC-01)** — Sprint 11 T06 added audit events but the token-in-URL issue may still exist. Read `WebsocketConfiguration.java` and `frontend-v3` WebSocket connection code.

3. **Sprint 30 compliance packs** — tasks.md shows 7/7 done. Verify actual YAML control pack files were added to `event-processor/compliance/` or relevant directory.

4. **Sprint 32 smoke test** — 3/3 done. Verify test files exist in `event-processor/functional/` or a dedicated test directory.

5. **Sprint 29 UEBA baseline Liquibase migration** — `ha_ueba_baseline` or equivalent table. Verify the migration file exists and was included in `master.xml`.

6. **eBPF BPF objects compilation** — `agent/collector/ebpf/bpf/hivearmor.bpf.c` exists. The Go bindings are stubs until `go get github.com/cilium/ebpf` is run and `go generate` compiles the C objects. Current build will not activate eBPF collection.

7. **ETW stub activation** — `agent/collector/etw/collector_windows.go` exists but imports `golang-etw` which is not in `agent/go.mod`. Build will fail on Windows until dep is added.

8. **alert schema v2 index template** — Sprint 13 added new alert fields (mitre[], risk_score, etc.). Verify the OpenSearch index template at `event-processor/` or `local-dev/` was updated to map these fields correctly.

9. **MsspIndexResolver adoption completeness** — Sprint 22 refactored services. Verify that ALL service classes that query OpenSearch now go through `MsspIndexResolver` rather than hardcoded strings. Grep for remaining `"v3-hive-"` string literals in Java service files.

10. **plugins/ SDK migration** — 164 files across 17 plugins still import `github.com/threatwinds/go-sdk`. This is not a security issue but is a code correctness and branding violation. No sprint has been planned for this.

---

*Document generated by automated repo audit — 2026-08-02*
*Repo path: /sessions/festive-intelligent-mendel/mnt/HiveArmor-v1/*
