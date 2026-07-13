# UTMStack Frontend v2 — New UI

Modern React/Next.js frontend for UTMStack, implementing the design system from the UI Improvement Plan.

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **UI**: React 18 + Tailwind CSS 3
- **State**: Zustand (lightweight store)
- **Icons**: Lucide React
- **Charts**: ECharts (via echarts-for-react)
- **Tables**: @tanstack/react-table + @tanstack/react-virtual
- **Dates**: date-fns
- **Node**: 18+ (no more Node 14 requirement)

## Quick Start

```bash
cd frontend-v2
npm install
npm run dev -- -p 3100
```

Open http://localhost:3100 in your browser.

## Environment

Create `.env.local`:
```
NEXT_PUBLIC_API_URL=http://localhost:8088
```

This points to the UTMStack backend API (running in Docker via local-dev setup).

## Pages Implemented

| Route | Page | Status |
|---|---|---|
| `/login` | Login | ✅ Full (connects to /api/authenticate) |
| `/dashboard` | Dashboard | ✅ KPI cards + alert table (connects to /api/utm-alerts/filter) |
| `/alerts` | Alert Management | ✅ Table, search, bulk select, detail slide-over |
| `/logs` | Log Search | ✅ Search bar, time range picker, query suggestions |
| `/incidents` | Incidents | ⬜ Placeholder |
| `/rules` | Alerting Rules | ⬜ Placeholder |
| `/settings` | Settings | ⬜ Placeholder |

## Design System

- Dark mode first (class-based toggle, persisted to localStorage)
- CSS custom properties for all design tokens
- Tailwind extended with semantic color aliases
- Inter font (headings/body) + JetBrains Mono (code/logs)

## Component Library (`src/components/ui/`)

- `SeverityBadge` — Critical/High/Medium/Low/Info
- `StatCard` — KPI with trend indicator
- `LoadingSkeleton` — Shimmer placeholders (table, card variants)
- `EmptyState` — Icon + title + description + CTA
- `Toast` — Stackable notifications with auto-dismiss

## Layout (`src/components/layout/`)

- `AppShell` — Main layout wrapper
- `Sidebar` — Collapsible navigation (icon-only ↔ expanded)
- `TopBar` — Search trigger, theme toggle, notifications, user menu

## Relationship to Existing Frontend

This app runs **alongside** the existing Angular 7 frontend (which runs in Docker on port 4443). It connects to the same backend API. No changes were made to the existing frontend code.
