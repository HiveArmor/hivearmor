# Phase 15 — Navigation Redesign + Angular Migration Plan

**Date:** 2026-07-05  
**Scope:** Complete Angular UI decommission readiness — sidebar restructure + all missing page builds  
**Single outcome:** Old Angular UI can be switched off with zero feature regression

---

## Background

The Angular frontend has ~110 distinct routes across 14 feature modules. The new Next.js frontend (`frontend-v2`) covers the core SOC workflow but has gaps in: Active Directory, Scanner/Asset Discovery, Vulnerability Scanner, Report Center, and several Settings sub-sections. This plan closes every gap.

---

## Angular → Next.js Gap Analysis

### ✅ Fully Covered — translateUrl() map only

These Angular routes already have a solid Next.js page. Only `translateUrl()` entries need to be added/confirmed.

| Angular Route | Next.js Route |
|---|---|
| /dashboard/overview | /dashboard |
| /dashboard/render/:id/:dashboard | /dashboard/render/[id]/[name] |
| /dashboard/log-sources | /data-sources |
| /dashboard/export/:id/:dashboard | /creator/dashboards |
| /data/alert/view | /alerts |
| /data/alert/list | /alerts |
| /data/alert/detail/:id | /alerts |
| /data/alert/alert-rule-management | /alerts/tagging-rules |
| /data/adversary/view | /alerts/adversary |
| /discover/log-analyzer | /logs |
| /discover/log-analyzer-queries | /logs |
| /incident/view | /incidents |
| /alerting-rules/rules | /rules |
| /alerting-rules/rule | /rules |
| /alerting-rules/rule/:id | /rules |
| /alerting-rules/manage/assets | /data-sources |
| /alerting-rules/manage/types | /data-sources |
| /alerting-rules/manage/patterns | /data-parsing |
| /threat-intelligence | /threat-intel |
| /threat-intelligence/feed | /threat-intel |
| /integrations/explore | /integrations |
| /compliance/management | /compliance |
| /compliance/templates | /compliance |
| /compliance/template-result | /compliance |
| /compliance/template-custom | /compliance |
| /compliance/schedule | /compliance |
| /compliance/report-viewer | /compliance |
| /compliance/print-view | /compliance |
| /compliance/evaluations-print-view | /compliance |
| /compliance/evaluation-detail-print-view/:id | /compliance |
| /soar/flows | /soar/flows |
| /soar/create-flow | /soar/flows |
| /soar/audit | /soar/audit |
| /soar/interactive-console | /soar/console |
| /data-sources/sources | /data-sources |
| /data-sources/sources-groups | /data-sources |
| /data-sources/collectors | /data-sources |
| /data-sources/collectors-groups | /data-sources |
| /data-parsing/pipelines | /data-parsing |
| /creator/dashboard/list | /creator/dashboards |
| /creator/dashboard/builder | /creator/dashboards/new |
| /creator/dashboard/render | /creator/dashboards |
| /creator/visualization | /creator/visualizations |
| /creator/builder | /creator/visualizations/builder |
| /creator/visualization/builder | /creator/visualizations/builder |
| /management/user | /admin/users |
| /management/new-user | /admin/users |
| /management/user/:login/edit | /admin/users |
| /app-management/settings/notifications | /admin/notifications |
| /app-management/settings/connection-key | /admin/settings |
| /app-management/settings/rollover | /admin/settings |
| /app-management/settings/app-logs | /admin/settings |
| /app-management/settings/menu-management | /admin/settings |
| /app-management/settings/index-pattern | /admin/settings |
| /app-management/settings/health-checks | /admin/settings |
| /app-management/settings/about | /admin/settings |
| /app-management/settings/user-access-audit | /admin/settings |
| /app-management/settings/index-management | /admin/settings |
| /app-management/settings/application-config | /admin/settings |
| /app-management/settings/application-theme | /admin/settings |
| /app-management/settings/providers | /admin/settings |
| /app-management/settings/api-keys | /settings |
| /variables/list | /admin/variables |
| /scanner/assets-discovery | /scanner |
| /scanner/assets-discovery/dashboard | /scanner |
| /scanner/assets-discovery/assets | /scanner |
| /scanner/config/task | /scanner |
| /scanner/config/target | /scanner |
| /scanner/config/schedule | /scanner |
| /scanner/config/port | /scanner |
| /scanner/config/credential | /scanner |
| /vulnerability-scanner/overview | /vulnerability-scanner |
| /vulnerability-scanner/tasks | /vulnerability-scanner |
| /vulnerability-scanner/task-result | /vulnerability-scanner |
| /active-directory | /active-directory |
| /active-directory/view | /active-directory |
| /active-directory/tracker | /active-directory |
| /active-directory/overview | /active-directory |
| /active-directory/detail/users | /active-directory |
| /active-directory/reports | /active-directory |
| /active-directory/reports/list | /active-directory |
| /active-directory/reports/schedule | /active-directory |
| /report/templates | /reports |
| /report/template-result | /reports |
| /report/template-view | /reports |
| /data/alert/reports/list | /reports |
| /data/alert/report/view/:id/:name | /reports |
| /data/file | /data-sources |
| /file-browser/correlation-rules | /rules |
| /getting-started | /dashboard |
| /license | /admin/settings |

### ⚠️ Partially Covered — existing page needs enhancement

| Angular Feature | What's Missing in Next.js | Plan |
|---|---|---|
| /admin/settings | 13 Angular sub-pages collapsed into one flat list — needs tab/section navigation | Phase 15B-5: Add section tabs (General / Security / Infrastructure / Audit) inside existing /admin/settings page |
| /alerts | No /alerts/reports sub-page for alert report list/viewer | Phase 15B-4: Add Reports tab to existing /alerts page |

### ❌ Not Covered — new pages required

| Feature | Angular Routes | Priority |
|---|---|---|
| **Active Directory Hub** | /active-directory/* (8 routes) | HIGH |
| **Vulnerability Scanner** | /vulnerability-scanner/* (3 routes) | HIGH |
| **Report Center** | /report/*, /data/alert/reports/* (5 routes) | HIGH |
| **Scanner / Asset Discovery** | /scanner/* (9 routes) | MEDIUM |
| **Admin Settings Sections** | /app-management/settings/* (13 routes) | MEDIUM |

---

## PHASE 15A — Sidebar Restructure

**One file:** `frontend-v2/src/components/layout/sidebar.tsx`  
**Outcome:** 7 SOC sections + compact Admin footer, every item has an icon, translateUrl() covers all legacy routes

### New Section Architecture

Ordered by SOC analyst daily workflow — monitor first, admin last.

```
Section       Group Icon     Items
─────────────────────────────────────────────────────────────────
MONITOR       Eye            Overview, Threat Activity
INVESTIGATE   Microscope     Alerts, Log Explorer, Incidents, Adversary View
THREATS       ShieldAlert    Threat Intel, User Behavior, Detection Rules, Alert Tagging
RESPOND       Zap            Playbooks, Console, Audit Log
ASSETS        Server         Agents, EDR, Data Sources, Active Directory, Asset Discovery, Vuln Scanner
COMPLIANCE    Scale          Frameworks, Reports
BUILD         PenLine        Dashboards, Widget Creator, Visualizations, Data Parsing, Integrations, OpenSearch
─────────────────────────────────────────────────────────────────
ADMIN (flat)  Lock           Users, System Settings, Notifications, Variables, Search Acceleration, My Account
```

**Rationale:**
- **ASSETS** (not "Manage"): groups all host-centric views so an analyst hunting a compromised host has one place
- **THREATS**: surfaces detection + intel together — Splunk Security Essentials pattern  
- **BUILD**: content creation + data pipeline separated from operational SOC sections
- **RESPOND**: pure SOAR, no infrastructure noise
- **COMPLIANCE**: isolated for GRC team use

### Per-Item Icon Assignments

| Section | Item | href | Lucide Icon |
|---------|------|------|-------------|
| Monitor | Overview | /dashboard | `LayoutDashboard` |
| Monitor | Threat Activity | /dashboard/threat-activity | `Activity` |
| Investigate | Alerts | /alerts | `AlertTriangle` |
| Investigate | Log Explorer | /logs | `Search` |
| Investigate | Incidents | /incidents | `Siren` |
| Investigate | Adversary View | /alerts/adversary | `Crosshair` |
| Threats | Threat Intel | /threat-intel | `Globe` |
| Threats | User Behavior | /uba | `UserCheck` |
| Threats | Detection Rules | /rules | `ShieldCheck` |
| Threats | Alert Tagging | /alerts/tagging-rules | `Tag` |
| Respond | Playbooks | /soar | `GitBranch` |
| Respond | Console | /soar/console | `Terminal` |
| Respond | Audit Log | /soar/audit | `ClipboardList` |
| Assets | Agents | /agents | `Bot` |
| Assets | EDR | /edr | `ScanLine` |
| Assets | Data Sources | /data-sources | `Database` |
| Assets | Active Directory | /active-directory | `Building2` |
| Assets | Asset Discovery | /scanner | `Radar` |
| Assets | Vuln Scanner | /vulnerability-scanner | `Bug` |
| Compliance | Frameworks | /compliance | `Scale` |
| Compliance | Reports | /reports | `FileBarChart2` |
| Build | Dashboards | /creator/dashboards | `Layers` |
| Build | Widget Creator | /creator | `PenLine` |
| Build | Visualizations | /creator/visualizations | `PieChart` |
| Build | Data Parsing | /data-parsing | `Code2` |
| Build | Integrations | /integrations | `Puzzle` |
| Build | OpenSearch | /opensearch | `Gauge` |
| Admin | Users | /admin/users | `Users` |
| Admin | System Settings | /admin/settings | `Settings` |
| Admin | Notifications | /admin/notifications | `Bell` |
| Admin | Variables | /admin/variables | `Braces` |
| Admin | Search Acceleration | /admin/search-acceleration | `Gauge` |
| Admin | My Account | /settings | `UserCog` |

### Code Changes (sidebar.tsx)

**1. Add `icon` field to NavItem interface:**
```typescript
interface NavItem {
  label: string;
  href: string;
  icon?: React.ReactNode;
}
```

**2. Item render — add icon before label in `<Link>`:**
```tsx
{item.icon && (
  <span className="shrink-0 w-3.5 h-3.5 text-muted group-hover/item:text-brand transition-colors">
    {item.icon}
  </span>
)}
<span className="truncate">{item.label}</span>
```

**3. Compact spacing:**
- Item padding: `py-1.5 px-3` → `py-1 px-2.5`
- Section header margin: `mt-4` → `mt-3`
- Icon size: `w-3.5 h-3.5` throughout

**4. Lucide import changes:**

Add: `Microscope, ShieldAlert, ShieldCheck, Scale, PenLine, UserCheck, Terminal, ClipboardList, Bot, ScanLine, Code2, PieChart, Braces, Tag, Building2, Radar, Bug, FileBarChart2, Gauge`

Remove (no longer used): `BookOpen, Network, BarChart3, Radio, TrendingUp`

Keep: `LayoutDashboard, AlertTriangle, Search, Siren, Crosshair, GitBranch, Globe, Eye, Activity, Zap, Layers, Puzzle, Database, Bell, Users, Settings, UserCog, Lock, Server`

**5. translateUrl() — replace with complete map covering all ~90 legacy routes** (see gap analysis table above)

---

## PHASE 15B — New Pages

### 15B-1: `/active-directory` — Active Directory Hub ⭐ HIGH

**What the Angular version had:** AD overview dashboard, user directory with login tracking, anomaly detection (failed auth spikes, off-hours logins, new admin accounts), scheduled AD reports.

**New page design:** `frontend-v2/src/app/(app)/active-directory/page.tsx`

4 tabs:
- **Overview** — KPI cards (total users, privileged accounts, failed logins today, anomalies detected), recent auth event feed filtered from OpenSearch `dataType: windows-ad-*`
- **Users** — searchable table of AD users with risk score badge, last login, group membership, privilege level; click row → user detail drawer
- **Tracker** — login timeline with anomaly flags: off-hours logins, geolocation jumps, failed auth bursts, new admin privilege grants; color-coded severity
- **Reports** — list of scheduled/generated AD reports with download, schedule new report button

**Backend data source:** OpenSearch index filtered by `dataType: windows-ad-*` or `logx.windows.EventID: [4624, 4625, 4648, 4720, 4728, 4732, 4756]` — no new migrations required for read-only views.

**New files:**
- `frontend-v2/src/app/(app)/active-directory/page.tsx`

---

### 15B-2: `/vulnerability-scanner` — Vulnerability Scanner ⭐ HIGH

**What the Angular version had:** Overview dashboard (severity distribution, top vulnerable assets), scan task list with scheduling, task results with CVE details and CVSS scores.

**New page design:** `frontend-v2/src/app/(app)/vulnerability-scanner/page.tsx`

3 tabs:
- **Overview** — KPI cards (critical CVEs, high CVEs, assets scanned, last scan time), severity donut chart, top 10 assets by vuln count, CVE trend chart
- **Scan Tasks** — table of scan configs (name, target range, schedule, last run, status); create/edit modal with target IP range, scan type, cron schedule
- **Results** — CVE findings table (CVE-ID, CVSS score, severity, affected asset, service/port, description, remediation); filterable by severity, asset, date range

**Backend data source:** OpenSearch `v11-vulnerability-*` or `v11-nmap-*` index. If no data, render with empty states and "No scans found — configure a scan task to get started."

**New files:**
- `frontend-v2/src/app/(app)/vulnerability-scanner/page.tsx`

---

### 15B-3: `/reports` — Report Center ⭐ HIGH

**What the Angular version had:** General report templates (not just compliance) for alerts, incidents, data sources; template result viewer; custom report builder; compliance exports. Also alert-specific reports under `/data/alert/reports/list`.

**New page design:** `frontend-v2/src/app/(app)/reports/page.tsx`

2 tabs:
- **Templates** — grid of report cards grouped by category (Alerts, Incidents, Compliance, Data Sources, Executive Summary); each card shows name, description, last generated; "Generate" button opens a modal with time range, format (PDF/CSV), optional email delivery via notification channels
- **Generated Reports** — table of past generated reports with status (Pending/Ready/Failed), file size, download link, generated-by, created-at; delete action

**Backend:** Reuses existing `utm_report_schedule` / compliance report infrastructure. New endpoint `GET/POST /api/utm-reports` for the general report list if needed.

**New files:**
- `frontend-v2/src/app/(app)/reports/page.tsx`

---

### 15B-4: `/scanner` — Asset Discovery & Network Scanner MEDIUM

**What the Angular version had:** Network scan task configuration (targets, ports, credentials, schedules), asset discovery dashboard (discovered hosts, open ports, OS fingerprint, last seen).

**New page design:** `frontend-v2/src/app/(app)/scanner/page.tsx`

2 tabs:
- **Scan Tasks** — table of scan configs (name, targets, scan type, schedule, last run, status); create modal (name, target IPs/CIDR, scan ports, scan type: full/quick/stealth, cron schedule, credentials)
- **Asset Inventory** — discovered hosts table (IP, hostname, OS, open ports, last seen, risk score); click row → host detail drawer with full port list, OS version, vulnerability count

**Backend data source:** OpenSearch `v11-nmap-*` or scanner integration data. Fall back to data-sources if no dedicated index.

**New files:**
- `frontend-v2/src/app/(app)/scanner/page.tsx`

---

### 15B-5: `/admin/settings` Enhancement MEDIUM

**What the Angular version had:** 13 separate settings sub-pages organized as a side-nav within the settings module: General Config, Connection Key, App Logs, Index Patterns, Rollover Config, Health Checks, About/API Docs, User Access Audit, Index Management, App Theme, API Keys, Identity Providers.

**Current Next.js:** All config params in one flat scrollable list with no sections.

**Enhancement:** Add section navigation tabs (or a left sub-nav) within the existing `/admin/settings` page:

| Tab | Content |
|-----|---------|
| **General** | App config params (existing list, just scoped) |
| **Security** | API keys management, Connection key display/rotate, Identity providers (SSO/LDAP/OAuth) |
| **Infrastructure** | Index patterns, Index rollover config, OpenSearch index management |
| **Audit & Logs** | Application logs viewer (last N log lines), User access audit trail (who did what, when) |
| **Health** | Health checks dashboard (backend service status, OpenSearch cluster, DB) |

**Files to edit:**
- `frontend-v2/src/app/(app)/admin/settings/page.tsx` (rewrite with tab navigation)

---

### 15B-6: File Integrity Monitoring LOW

**What the Angular version had:** Simple table of file change events — file path, change type (create/modify/delete), file hash before/after, hostname, timestamp.

**New page design:** `frontend-v2/src/app/(app)/file-integrity/page.tsx`

Single page: filter bar (host, change type, time range) + table of FIM events from OpenSearch `dataType: fim-*`.

**Files:**
- `frontend-v2/src/app/(app)/file-integrity/page.tsx`
- Add "File Integrity" item under ASSETS section in sidebar (icon: `FileSearch`)

---

## Execution Order

```
Phase 15A    sidebar.tsx rewrite (translateUrl + new sections + icons)     ← do first, single file
─────────────────────────────────────────────────────────────────────────
Phase 15B-1  /active-directory page                                         ← HIGH, no backend needed
Phase 15B-2  /vulnerability-scanner page                                    ← HIGH, no backend needed
Phase 15B-3  /reports page                                                  ← HIGH, light backend
─────────────────────────────────────────────────────────────────────────
Phase 15B-4  /scanner page                                                  ← MEDIUM
Phase 15B-5  /admin/settings tab enhancement                                ← MEDIUM
Phase 15B-6  /file-integrity page                                           ← LOW
```

---

## Files Changed Summary

### Phase 15A (1 file)
| File | Change |
|------|--------|
| `frontend-v2/src/components/layout/sidebar.tsx` | Full rewrite: new sections, per-item icons, compact spacing, complete translateUrl() map |

### Phase 15B (new files)
| File | Phase |
|------|-------|
| `frontend-v2/src/app/(app)/active-directory/page.tsx` | 15B-1 |
| `frontend-v2/src/app/(app)/vulnerability-scanner/page.tsx` | 15B-2 |
| `frontend-v2/src/app/(app)/reports/page.tsx` | 15B-3 |
| `frontend-v2/src/app/(app)/scanner/page.tsx` | 15B-4 |
| `frontend-v2/src/app/(app)/admin/settings/page.tsx` (rewrite) | 15B-5 |
| `frontend-v2/src/app/(app)/file-integrity/page.tsx` | 15B-6 |

---

## Verification Checklist

### Phase 15A
- [ ] Sidebar renders 7 SOC sections + flat Admin footer
- [ ] Every item has a unique icon visible in expanded state
- [ ] Collapsed sidebar shows only section icons (no regression)
- [ ] No dead links — all hrefs have a corresponding page.tsx
- [ ] Active Directory, Vuln Scanner, Scanner, Reports items appear in sidebar (linked to new pages from 15B)
- [ ] `translateUrl("/app-management/settings/api-keys")` → `/settings`
- [ ] `translateUrl("/active-directory/tracker")` → `/active-directory`
- [ ] `translateUrl("/vulnerability-scanner/overview")` → `/vulnerability-scanner`
- [ ] `translateUrl("/soar/create-flow")` → `/soar/flows`
- [ ] `translateUrl("/compliance/schedule")` → `/compliance`

### Phase 15B-1 (Active Directory)
- [ ] 4 tabs render: Overview, Users, Tracker, Reports
- [ ] Overview KPIs load from OpenSearch (or show empty state if no AD data)
- [ ] Users table searchable, risk badges show
- [ ] Tracker anomaly flags render for events in the last 24h

### Phase 15B-2 (Vulnerability Scanner)
- [ ] 3 tabs render: Overview, Scan Tasks, Results
- [ ] Empty state shown cleanly when no scan data
- [ ] Create scan task modal opens and saves

### Phase 15B-3 (Report Center)
- [ ] Templates grid shows categorized report cards
- [ ] Generate modal opens with time range + format selector
- [ ] Generated Reports tab shows history table

### Phase 15B-4 (Scanner)
- [ ] 2 tabs render: Scan Tasks, Asset Inventory
- [ ] Asset Inventory table shows discovered hosts

### Phase 15B-5 (Admin Settings)
- [ ] 5 tabs: General, Security, Infrastructure, Audit & Logs, Health
- [ ] General tab shows existing config params
- [ ] Health tab shows service status indicators

### Phase 15B-6 (File Integrity)
- [ ] FIM events table loads from OpenSearch
- [ ] Filter by host and change type works
