# UTMStack UI/UX Audit & Improvement Blueprint

## Step 1 — Current State Audit

### UI Framework & Component Library

| Layer | Technology | Version |
|---|---|---|
| Framework | Angular | 7.2.0 |
| UI Kit | Bootstrap (Limitless theme) | 4.3.1 |
| Component Library | ng-bootstrap | 4.1.0 |
| Charts | ngx-echarts (ECharts 4) | 4.1.1 |
| Select Dropdowns | ng-select | 2.20.0 |
| Code Editor | Monaco Editor | 0.20.0 |
| Icons | icomoon + Font Awesome 4 | — |
| Maps | Leaflet | 1.6.0 |
| Font | Poppins (Google Fonts) | 300–700 |
| CSS Preprocessor | SCSS (node-sass 4) | — |

### All Routes / Pages

| Route | Module | Purpose |
|---|---|---|
| `/` | — | Redirects to login |
| `/dashboard` | UtmDashboardModule | Custom dashboards |
| `/data` | DataManagementModule | Alert management |
| `/discover` | LogAnalyzerModule | Log search & exploration |
| `/incident` | IncidentModule | Incident lifecycle |
| `/soar` | IncidentResponseModule | Automated response |
| `/compliance` | ComplianceModule | Compliance reporting |
| `/alerting-rules` | RuleManagementModule | Correlation rule editor |
| `/threat-intelligence` | ThreatWindModule | Threat intel feeds |
| `/data-sources` | AssetsDiscoverModule | Data source/agent management |
| `/integrations` | AppModuleModule | Integration configuration |
| `/management` | AdminModule | System admin (users, config) |
| `/creator` | GraphicBuilderModule | Visualization builder |
| `/app-management` | AppManagementModule | Application management |
| `/variables` | AutomationVariablesModule | Automation variables |
| `/active-directory` | ActiveDirectoryModule | AD integration |
| `/data-parsing` | LogstashModule | Pipeline configuration |
| `/profile` | UtmAccountModule | User profile |
| `/getting-started` | — | Onboarding wizard |
| `/iframe` | AlertManagementModule | Embedded alert view |

### Current Color Scheme

```scss
// Primary palette
$primary-color: #232f3e;        // Dark navy (header, buttons)
$primary-color-hover: #1a202f;  // Darker navy
$blue-scroll: #0277bd;          // Active/accent blue
$blue-component: #0277bd;       // Component accent

// Semantic colors
$success-color: #4caf50;        // Green
$danger-color: #f44336;         // Red
$info-color: #FF9800;           // Orange (misleading name)
$warning: #FFA800;              // Amber

// Surfaces
Background: #F2F3F7;            // Page background
Text: #3F4254;                  // Primary text
$grey-border-color: #d3dae6;    // Borders
```

### Typography System

- **Font**: Poppins (300, 400, 500, 600, 700 weights)
- **Base font-size**: 0.8125rem (13px)
- **Body text**: Globally overridden to `.75rem` (12px) via `span`, `label` selectors
- **Heading scale**: No formal type scale — h6 set to 15px, others uncontrolled
- **Line height**: 1.5385

**Issues**: Font size is aggressively small (12px body), making it difficult to read dense log data. No type scale system exists.

### State Management

BehaviorSubject-based "Behaviors" pattern — lightweight but scattered:
- `DashboardBehavior`, `MenuBehavior`, `NavBehavior`
- `NewAlertBehavior`, `AlertIncidentStatusChangeBehavior`
- `ThemeChangeBehavior`, `GettingStartedBehavior`
- No centralized store (no NgRx/NGXS)
- State is ephemeral — lost on refresh unless backed by localStorage

### Performance Issues Identified from Code

1. **No tree-shaking of ECharts** — entire echarts library imported (400KB+ gzipped)
2. **No virtual scrolling** — tables use ngx-infinite-scroll (appends DOM nodes indefinitely)
3. **Global `CUSTOM_ELEMENTS_SCHEMA` + `NO_ERRORS_SCHEMA`** — hides template binding errors at compile time
4. **Lazy loading IS present** (via `loadChildren` string syntax) — but every lazy module likely bundles all its components
5. **Monaco Editor loaded globally** in shared module — adds ~2MB to initial bundle even when not needed
6. **No OnPush change detection** — all components use default CD strategy
7. **jQuery + jQuery UI included** — 85KB+ added for minimal drag-drop functionality
8. **Moment.js + moment-timezone** — 300KB+ (should be date-fns or Luxon)
9. **Duplicate imports** — `UtmInputErrorDirective` declared twice in shared module
10. **No AOT optimization flags** visible in build config

### Missing UX Patterns

| Pattern | Status |
|---|---|
| Skeleton/shimmer loading | ❌ Missing |
| Global error boundary | ❌ Missing |
| Breadcrumbs | ❌ Missing |
| Keyboard shortcuts | ❌ Missing |
| Command palette (Ctrl+K) | ❌ Missing |
| Skip-to-content (accessibility) | ❌ Missing |
| Focus trap in modals | ❌ Missing |
| ARIA live regions | ❌ Missing |
| Optimistic UI updates | ❌ Missing |
| Undo/redo for edits | ❌ Missing |
| Dark mode | ❌ Missing (commented-out CSS exists) |
| Responsive sidebar collapse | ⚠️ Partial |
| Loading state per component | ⚠️ Spinner only (no skeleton) |
| Empty states | ✅ Present (basic) |
| Toast notifications | ✅ Present |
| Confirmation modals | ✅ Present |


---

## Step 2 — Feature Gap Analysis (vs. Splunk, Elastic Security, Microsoft Sentinel)

### Missing Entirely

| Feature | Competitors | Impact |
|---|---|---|
| MITRE ATT&CK Navigator / Matrix visualization | Elastic, Sentinel | Critical for SOC analysts |
| Entity-relationship threat graph | Sentinel (Investigation Graph) | High — enables visual investigation |
| UEBA (User/Entity Behavior Analytics) risk scoring | Splunk UBA, Sentinel UEBA | High — proactive threat detection |
| Unified investigation workbench / timeline | Elastic Timeline, Sentinel Investigation | Critical — core analyst workflow |
| Asset inventory with risk scores | Splunk Asset Framework | Medium — contextual enrichment |
| Playbook visual editor (drag-and-drop SOAR) | Splunk SOAR, Sentinel Playbooks | Medium — automation UX |
| Natural language query (AI-assisted search) | Splunk AI Assistant, Sentinel Copilot | Medium — reduces query complexity |
| Real-time event streaming (live tail) | Splunk Live Tail, Elastic Discover | High — operational monitoring |
| Multi-tenant workspace switcher | Sentinel (Workspace), Splunk (Org) | Medium for MSPs |
| Saved search library with sharing | All competitors | Medium |
| Detection rule testing sandbox | Elastic Detection Rules | Medium |
| Case management with evidence attachments | Elastic Cases | Medium |
| Threat hunting workbooks / notebooks | Sentinel Workbooks (Jupyter-like) | High |

### Present but Poorly Implemented

| Feature | Current State | Gap |
|---|---|---|
| **Dashboard system** | Gridster-based, functional but clunky | No drag-to-create, no template gallery, no drill-down linking between dashboards |
| **Alert triage** | Table-based list view | No card view, no bulk actions, no quick-filter sidebar, no severity timeline |
| **Log search** | Monaco editor + results table | No query autocomplete for field names, no histogram above results, no saved queries panel |
| **Correlation rules** | YAML editor + form | No visual rule builder, no test-against-data feature, no rule simulation |
| **Compliance** | Report-focused | No posture dashboard, no drift detection, no control-by-control heatmap |
| **Incident management** | Basic CRUD | No timeline view, no linked evidence, no kill-chain progression |
| **Threat intelligence** | Single component (likely iframe) | Should be native: IOC search, feed comparison, reputation lookup |

### Present but with Poor UX

| Feature | UX Issue |
|---|---|
| **Table filtering** | Elastic DSL knowledge required — no GUI filter builder |
| **Date/time picker** | Custom component — not timezone-aware in UI, confusing for multi-region |
| **Navigation** | Two-level navbar (primary + secondary) wastes vertical space; no collapsible sidebar |
| **Alert details** | Opens in slide-over panel — cannot compare multiple alerts simultaneously |
| **Data source setup** | Multi-step but no progress indicator, no validation before final step |
| **User management** | Basic table — no role permission matrix, no audit trail visibility |
| **Mobile experience** | Layout breaks below 768px — critical panels unusable |
| **Charts** | ECharts 4 with generic colors — no severity-aware color palette |

---

## Step 3 — New Design System Proposal

### Color Palette

#### Surfaces (Dark Mode First — SIEM standard)

| Token | Hex | Usage |
|---|---|---|
| `--surface-ground` | `#0F1117` | Page background |
| `--surface-primary` | `#161B26` | Cards, panels |
| `--surface-secondary` | `#1D2432` | Elevated panels, dropdowns |
| `--surface-tertiary` | `#252D3D` | Hover states, active items |
| `--surface-border` | `#2E3A4E` | Subtle borders |
| `--surface-border-strong` | `#3D4F6A` | Prominent borders |

#### Brand / Accent

| Token | Hex | Usage |
|---|---|---|
| `--brand-primary` | `#3B82F6` | Primary actions, active states |
| `--brand-primary-hover` | `#2563EB` | Hover on primary |
| `--brand-primary-subtle` | `#1E3A5F` | Backgrounds of selected items |
| `--brand-secondary` | `#8B5CF6` | Secondary accent (threat intel) |

#### Semantic Colors

| Token | Hex | Usage |
|---|---|---|
| `--color-critical` | `#EF4444` | Critical severity alerts |
| `--color-high` | `#F97316` | High severity |
| `--color-medium` | `#EAB308` | Medium severity |
| `--color-low` | `#22C55E` | Low severity / success |
| `--color-info` | `#06B6D4` | Informational |
| `--color-success` | `#10B981` | Success states |
| `--color-warning` | `#F59E0B` | Warning states |
| `--color-danger` | `#EF4444` | Error / destructive |

#### Text Hierarchy

| Token | Hex | Usage |
|---|---|---|
| `--text-primary` | `#F1F5F9` | Headings, important text |
| `--text-secondary` | `#94A3B8` | Body text, descriptions |
| `--text-muted` | `#64748B` | Labels, timestamps |
| `--text-disabled` | `#475569` | Disabled states |
| `--text-inverse` | `#0F172A` | Text on light backgrounds |

### Typography

| Role | Font | Fallback | Size |
|---|---|---|---|
| Headings | Inter | -apple-system, sans-serif | Variable |
| Body / UI | Inter | -apple-system, sans-serif | 14px base |
| Monospace | JetBrains Mono | Fira Code, Consolas | 13px |

#### Type Scale

| Token | Size | Weight | Line Height | Usage |
|---|---|---|---|---|
| `--text-display` | 32px | 700 | 1.2 | Page titles |
| `--text-h1` | 24px | 600 | 1.3 | Section headers |
| `--text-h2` | 20px | 600 | 1.35 | Card titles |
| `--text-h3` | 16px | 500 | 1.4 | Subsection headers |
| `--text-h4` | 14px | 500 | 1.5 | Table headers, labels |
| `--text-body` | 14px | 400 | 1.6 | Body text |
| `--text-small` | 12px | 400 | 1.5 | Captions, badges |
| `--text-tiny` | 11px | 400 | 1.4 | Timestamps, metadata |

### Component Inventory

#### Navigation
- **AppShell** — Main layout with collapsible sidebar + topbar
- **Sidebar** — Collapsible (icon-only ↔ expanded), grouped sections, badge counts
- **Topbar** — Search (command palette trigger), notifications, user menu, time range
- **Breadcrumbs** — Context-aware breadcrumb trail
- **CommandPalette** — Ctrl+K overlay for quick navigation/search

#### Data Display
- **DataTable** — Virtualized (CDK virtual scroll), sortable, filterable, resizable columns, row selection, bulk actions
- **LogViewer** — Monospace, syntax-highlighted, virtualized (100K+ lines), collapsible JSON, field extraction
- **Timeline** — Horizontal/vertical event timeline with severity color coding
- **KPICard** — Metric display with sparkline, trend indicator, comparison
- **StatCard** — Simple stat with label, value, delta
- **Badge** — Severity badge (critical/high/medium/low/info)

#### Charts & Visualization
- **TimeSeriesChart** — Area/line chart with zoom, brush selection
- **BarChart** — Horizontal/vertical with severity coloring
- **PieChart** — Donut with center metric
- **HeatMap** — Calendar heatmap, MITRE matrix heatmap
- **GeoMap** — Threat map with connection arcs
- **TreeMap** — Hierarchical data visualization
- **SankeyDiagram** — Flow visualization (attack paths)
- **GraphVisualization** — Force-directed entity graph

#### Alert & Incident
- **AlertCard** — Compact alert display with severity, source, time, quick actions
- **AlertDetailPanel** — Full slide-over with timeline, related events, response actions
- **IncidentCard** — Incident summary with status, assignee, SLA timer
- **SeverityIndicator** — Color-coded pill/dot/bar

#### Search & Filter
- **SearchBar** — Full-text search with query language autocomplete
- **FilterBuilder** — Visual filter builder (field + operator + value)
- **FilterChips** — Active filter pills with remove action
- **TimeRangePicker** — Quick ranges + custom range, relative/absolute
- **SavedSearches** — Dropdown of saved queries

#### Modals & Panels
- **SlideOver** — Right panel (alert detail, entity detail)
- **Modal** — Centered dialog (confirmation, forms)
- **BottomSheet** — Bottom panel (log detail, query results)
- **Drawer** — Full-height side drawer (investigation workspace)

#### Forms
- **Input** — Text, number, password with label, error, hint
- **Select** — Single/multi select with search
- **Toggle** — Switch with label
- **Checkbox/Radio** — Grouped options
- **TextArea** — Auto-resize, with character count
- **CodeEditor** — Monaco-based with language selection
- **DatePicker** — Calendar with time, timezone

#### Feedback
- **Toast** — Success/error/warning/info positioned top-right
- **ProgressBar** — Determinate/indeterminate
- **Skeleton** — Loading placeholder matching content shape
- **EmptyState** — Illustration + title + description + CTA
- **ErrorState** — Error illustration + retry button


---

## Step 4 — Page-by-Page Improvement Spec

### Dashboard (`/dashboard`)
- **Changes**: Replace gridster with modern grid (CSS Grid + drag). Add template gallery. Drill-down linking. Real-time refresh indicator. Dashboard variables (parameterized).
- **New components**: DashboardTemplateGallery, DashboardVariableBar, WidgetConfigPanel
- **Priority**: High

### Alert Management (`/data`)
- **Changes**: Add card view toggle. Severity histogram above table. Quick-filter sidebar (severity, source, status). Bulk actions toolbar. Alert timeline view. AI summary per alert.
- **New components**: AlertHistogram, AlertQuickFilters, AlertCardView, AlertBulkActions, AlertAISummary
- **Priority**: High

### Log Analyzer (`/discover`)
- **Changes**: Add field autocomplete in query bar. Event histogram above results. Collapsible field sidebar (like Elastic). Saved queries panel. Surrounding events view. Live tail mode.
- **New components**: LogHistogram, FieldSidebar, QueryAutocomplete, LiveTailToggle, SurroundingEvents
- **Priority**: High

### Incident Management (`/incident`)
- **Changes**: Kanban board view (by status). Timeline view per incident. Evidence attachment. Kill-chain progression indicator. SLA countdown timer. Related alerts panel.
- **New components**: IncidentKanban, IncidentTimeline, EvidencePanel, KillChainProgress, SLATimer
- **Priority**: High

### Incident Response / SOAR (`/soar`)
- **Changes**: Visual playbook editor (node-based). Execution history with status per step. Response action templates with variables.
- **New components**: PlaybookEditor, ExecutionTimeline, ActionTemplateLibrary
- **Priority**: Medium

### Correlation Rules (`/alerting-rules`)
- **Changes**: Visual rule builder (condition tree). Test rule against historical data. Rule simulation results. Import/export. Rule template library.
- **New components**: VisualRuleBuilder, RuleTestPanel, RuleSimulation, RuleTemplateGallery
- **Priority**: Medium

### Compliance (`/compliance`)
- **Changes**: Posture overview dashboard (compliance score per framework). Control-by-control heatmap. Drift detection timeline. Remediation guidance per control.
- **New components**: CompliancePostureDashboard, ControlHeatmap, DriftTimeline, RemediationPanel
- **Priority**: Medium

### Threat Intelligence (`/threat-intelligence`)
- **Changes**: Replace iframe with native UI. IOC search bar. Feed management panel. Reputation lookup. IOC-to-alert correlation view.
- **New components**: IOCSearch, FeedManager, ReputationLookup, IOCCorrelationPanel
- **Priority**: Medium

### Data Sources (`/data-sources`)
- **Changes**: Agent health dashboard (connectivity, last seen, version). Data source onboarding wizard with validation at each step. Data flow visualization.
- **New components**: AgentHealthDashboard, OnboardingWizard, DataFlowDiagram
- **Priority**: Medium

### Admin (`/management`)
- **Changes**: Role permission matrix. Audit log viewer. System health dashboard. Backup/restore UI.
- **New components**: PermissionMatrix, AuditLogViewer, SystemHealthDashboard
- **Priority**: Low

### Visualization Builder (`/creator`)
- **Changes**: Preview pane alongside config. More chart types. Field drag-and-drop. Quick filters applied live.
- **New components**: ChartPreviewPane, FieldDragSource, ChartTypeGallery
- **Priority**: Low

### Login / Auth
- **Changes**: Modern centered card design. SSO provider buttons prominently displayed. "Powered by" branding. Password strength real-time meter.
- **New components**: AuthCard, SSOProviderButton
- **Priority**: Low

---

## Step 5 — New Pages to Add

### MITRE ATT&CK Navigator (`/mitre-attack`)

A full-screen interactive matrix showing all MITRE ATT&CK techniques. Each cell is color-coded by detection coverage (green = rule exists, yellow = partial, gray = no coverage) and by recent activity (heat intensity = how many alerts mapped to that technique in the selected time range). Clicking a technique opens a slide-over showing related rules, recent alerts, and recommended detections. This is the single most requested feature by SOC teams evaluating SIEM platforms.

### Threat Graph / Investigation Workbench (`/investigate`)

A force-directed graph visualization showing relationships between entities (IPs, users, hosts, processes, files, domains). Starting from any alert or entity, analysts can pivot — clicking a node expands related entities. The timeline at the bottom allows scrubbing through events chronologically. Supports saving investigation sessions. Inspired by Microsoft Sentinel's Investigation Graph and Maltego-style link analysis.

### UEBA Risk Dashboard (`/ueba`)

Displays a ranked list of users and entities by risk score, calculated from behavioral anomalies (unusual login times, impossible travel, privilege escalation patterns, data exfiltration volumes). Each entity card shows a risk score (0–100), contributing factors, historical risk trend sparkline, and quick link to investigate. Filters by department, role, asset type.

### Incident Timeline / War Room (`/war-room`)

A collaborative real-time workspace for active incident response. Shows a unified timeline of all events, actions taken, communications, and status changes. Supports adding notes/commentary, attaching evidence, assigning tasks to team members, and tracking remediation progress. Designed for the SOC team to work together during an active incident.

### Compliance Posture Dashboard (`/compliance/posture`)

A single-pane view showing compliance posture across all configured frameworks (PCI-DSS, HIPAA, SOC2, CMMC, etc.). Radial progress charts per framework, with the ability to drill into individual controls. Trend lines showing compliance score over time. Automated gap identification with remediation priorities.

### Asset Inventory with Risk Scoring (`/assets`)

A comprehensive asset registry combining discovered hosts, agents, and cloud resources. Each asset shows: risk score, vulnerabilities, installed software, running services, open ports, associated users, and recent security events. Filterable by risk level, OS type, network segment, compliance status. Supports asset grouping and tagging.

### SOC Metrics / Analyst Performance (`/soc-metrics`)

Operational metrics for SOC management: MTTD (Mean Time to Detect), MTTR (Mean Time to Respond), alert volume trends, false positive rate, analyst workload distribution, SLA compliance rates, detection coverage gaps. Designed for SOC managers to measure and improve team performance.


---

## Step 6 — Implementation Roadmap

### Sprint 1: Design System + Core Components + Layout Shell (4 weeks)

| Task | Effort | Notes |
|---|---|---|
| Upgrade to Angular 17+ (standalone components) | 5d | Enables modern patterns, signals, SSR |
| Replace node-sass with dart-sass | 1d | Unblocks Node 18+ |
| Implement CSS custom property design system (tokens) | 3d | Dark/light mode via variable swap |
| Build AppShell (sidebar + topbar + content area) | 4d | Responsive, collapsible |
| Build DataTable (virtual scroll, sort, filter, select) | 5d | CDK-based, replaces current tables |
| Build LogViewer (virtualized, syntax highlight) | 4d | Monospace, JSON collapse |
| Build form components (Input, Select, Toggle, DatePicker) | 4d | Consistent API |
| Build feedback components (Toast, Skeleton, EmptyState) | 2d | Used everywhere |
| Build FilterBuilder + FilterChips | 3d | Visual query building |
| Build TimeRangePicker | 2d | Quick ranges + custom |
| Build CommandPalette (Ctrl+K) | 2d | Quick nav/search |
| Build Badge, KPICard, StatCard | 1d | Reusable small components |
| **Total Sprint 1** | **~36 days (4 weeks, 2 devs)** | Foundation for everything |

### Sprint 2: Core SIEM Pages (5 weeks)

| Task | Effort | Notes |
|---|---|---|
| Rebuild Alert Management page | 5d | Card/table toggle, histogram, quick filters, bulk actions |
| Rebuild Log Analyzer page | 5d | Field sidebar, histogram, autocomplete, live tail |
| Rebuild Dashboard system | 5d | CSS Grid, template gallery, variables, drill-down |
| Build Incident Management (kanban + timeline) | 5d | Board view, SLA timers, evidence |
| Build MITRE ATT&CK Navigator | 4d | Interactive matrix, coverage heatmap |
| Rebuild Correlation Rules page | 4d | Visual builder, test panel |
| Rebuild Data Sources page | 3d | Agent health, onboarding wizard |
| Implement WebSocket real-time updates | 2d | Live event count, alert notifications |
| Implement dark/light theme toggle | 1d | CSS variable swap |
| **Total Sprint 2** | **~34 days (5 weeks, 2 devs)** | Core analyst workflow |

### Sprint 3: Advanced Features (4 weeks)

| Task | Effort | Notes |
|---|---|---|
| Build Threat Graph / Investigation Workbench | 6d | D3 force-directed, pivoting, session save |
| Build UEBA Risk Dashboard | 4d | Risk scoring display, anomaly cards |
| Build Compliance Posture Dashboard | 4d | Multi-framework, trend lines, gap analysis |
| Build Asset Inventory with risk scoring | 4d | Discovery + enrichment view |
| Rebuild Threat Intelligence (native, not iframe) | 3d | IOC search, feed management |
| Build SOC Metrics / Analyst Performance | 3d | MTTD/MTTR, workload, SLA |
| Build War Room / Incident Timeline | 4d | Collaborative, real-time |
| Build Playbook Visual Editor (SOAR) | 4d | Node-based workflow editor |
| **Total Sprint 3** | **~32 days (4 weeks, 2 devs)** | Differentiating features |

### Sprint 4: Polish, Performance, Accessibility (3 weeks)

| Task | Effort | Notes |
|---|---|---|
| Performance optimization (lazy loading, tree-shaking) | 3d | ECharts, Monaco on-demand |
| Replace moment.js with date-fns | 2d | -250KB bundle size |
| Remove jQuery dependency | 2d | Use native drag-drop or CDK |
| Accessibility audit (WCAG 2.1 AA) | 3d | Focus management, ARIA, contrast |
| Keyboard navigation throughout | 3d | Tab order, shortcuts, focus indicators |
| Responsive design pass (tablet + mobile) | 4d | Sidebar collapse, card layouts |
| Loading state polish (skeleton screens) | 2d | Per-component skeletons |
| Error handling & retry patterns | 2d | Global error boundary, retry buttons |
| E2E test suite (Playwright) | 3d | Critical path coverage |
| Documentation (Storybook) | 3d | Component library documentation |
| **Total Sprint 4** | **~27 days (3 weeks, 2 devs)** | Production readiness |

---

### Total Effort Summary

| Sprint | Duration | Team | Focus |
|---|---|---|---|
| Sprint 1 | 4 weeks | 2 FE devs | Foundation |
| Sprint 2 | 5 weeks | 2 FE devs | Core SIEM |
| Sprint 3 | 4 weeks | 2 FE devs | Advanced |
| Sprint 4 | 3 weeks | 2 FE devs | Polish |
| **Total** | **16 weeks** | **2 frontend developers** | **Full rebuild** |

### Key Decisions Required Before Starting

1. **Angular upgrade path**: 7 → 17 is a major jump. Recommend incremental (7→12→15→17) over 2–3 weeks, or greenfield alongside existing app (micro-frontend approach).
2. **Component library choice**: Build custom (full control, more effort) or adopt PrimeNG / Angular CDK + Tailwind (faster, less custom).
3. **Charting library**: Keep ECharts (powerful, large) or switch to Apache ECharts 5 (tree-shakeable) or Plotly/D3 (more control for graph viz).
4. **Dark mode only or dual theme**: SIEM analysts overwhelmingly prefer dark mode. Consider dark-first with optional light mode.
5. **Graph visualization library**: D3.js (low-level, full control) vs. vis.js/Cytoscape.js (higher-level, faster).

---

*Document generated: June 22, 2026*
*Scope: Frontend UI/UX only. Backend API changes needed to support new features are not covered here.*
