# HiveArmor — Frontend v2

**Hyper-scale Incident Visibility Engine**

The primary user interface for HiveArmor, an enterprise SIEM/XDR platform. Built on Next.js 14 App Router with React 18 and TypeScript, this frontend delivers real-time threat visibility, alert management, log analysis, compliance reporting, and security operations workflows.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| UI Library | React 18 |
| Language | TypeScript |
| Styling | Tailwind CSS 3 |
| State Management | Zustand |
| Data Fetching | TanStack Query v5 |
| Charts | ECharts (via echarts-for-react) |
| Icons | Lucide React |
| Tables | @tanstack/react-table + @tanstack/react-virtual |
| Dates | date-fns |
| Testing | Vitest |
| Linting | ESLint |
| Node | 18+ |

---

## Quick Start

```bash
cd frontend-v2
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

Default credentials (local dev): `admin` / `localdev123!`

---

## Environment

Create `.env.local` in the `frontend-v2/` directory:

```env
BACKEND_URL=http://localhost:8088
```

The API proxy at `src/app/api/[...path]/route.ts` forwards all `/api/*` requests to `BACKEND_URL`. This means the browser never talks directly to the backend — all `/api/ha-*` calls from client components are transparently proxied. No `NEXT_PUBLIC_API_URL` is needed for production; set `BACKEND_URL` in the server environment.

For the full local stack (PostgreSQL, OpenSearch, backend, agent services), see `local-dev/` and follow the instructions in `local-dev/.env.example`.

---

## Pages and Routes

| Route | Page | Description |
|---|---|---|
| `/login` | Login | JWT authentication, connects to `/api/authenticate` |
| `/dashboard` | Dashboard | KPI summary cards, recent alerts, system health |
| `/alerts` | Alert Management | Alert table with live streaming, search, bulk actions, detail slide-over |
| `/logs` | Log Analyzer | Full-text log search, time range picker, field filters, query suggestions |
| `/incidents` | Incidents | Incident lifecycle management, timeline, evidence linking |
| `/compliance` | Compliance | Compliance framework status, control mapping, gap reports |
| `/reports` | Reports | Scheduled and on-demand report generation and download |
| `/vulnerability` | Vulnerability Scanner | Asset vulnerability findings, CVSS scoring, remediation tracking |
| `/assets` | Asset Scanner | Discovered assets inventory, OS/service fingerprinting |
| `/soar` | SOAR | Security orchestration playbooks, response rule builder |
| `/active-directory` | Active Directory | AD user and group monitoring, anomaly detection |
| `/data-sources` | Data Sources | Configured log sources, ingestion health, parser assignments |
| `/integrations` | Integrations | Third-party connector management (AWS, Azure, GCP, O365, CrowdStrike, etc.) |
| `/app-management` | App Management | Plugin status, event processor pipeline, module configuration |
| `/users` | User Management | HiveArmor user accounts, roles, MFA status |
| `/threat-intel` | Threat Intelligence | IOC feed management, reputation lookups, feed health |
| `/rules` | Detection Rules | Correlation rule editor, YAML rule viewer, rule testing |

---

## Architecture

### Route Structure

```
src/app/
  (app)/                  # Protected route group
    layout.tsx            # Auth guard — redirects to /login if no valid JWT
    dashboard/
    alerts/
    logs/
    incidents/
    ...all other protected pages
  login/                  # Public route
  api/
    [...path]/
      route.ts            # Catch-all API proxy to BACKEND_URL
```

The `(app)/` route group layout enforces authentication on every page inside it. The auth guard reads the JWT from `localStorage` under the key `hivearmor_auth_token` and validates expiry. Unauthenticated requests are redirected to `/login`.

### API Proxy

All backend calls flow through the Next.js server-side proxy:

```
Browser  →  /api/ha-alerts/...  →  Next.js proxy  →  BACKEND_URL/api/ha-alerts/...
```

The proxy attaches the `Authorization: Bearer <token>` header from the session and forwards the response verbatim. This avoids CORS issues in any deployment topology and keeps the backend URL server-side only.

### Authentication

- JWT tokens are stored in `localStorage` as `hivearmor_auth_token`
- Token is sent as `Authorization: Bearer <token>` on every API request
- On 401 responses, the auth store clears the token and redirects to `/login`
- No refresh token mechanism — the backend issues long-lived tokens (see DEBT-14 for the planned rotation fix)

---

## State Management

Zustand stores live in `src/store/`:

| Store | File | Purpose |
|---|---|---|
| Auth | `auth.ts` | Current user, JWT token, login/logout actions |
| Alert Stream | `alert-stream.ts` | Live alert WebSocket/SSE state, incoming alert buffer |
| Theme | `theme.ts` | Light/dark mode toggle, persisted to localStorage |
| Visualization | `visualization.ts` | Dashboard chart preferences, date range selection |

Stores are initialized on the client only. SSR pages use server-fetched data via TanStack Query; stores hydrate after mount.

---

## Component Library

### `src/components/ui/`

| Component | Description |
|---|---|
| `SeverityBadge` | Colored badge for Critical / High / Medium / Low / Info severity levels |
| `StatCard` | KPI tile with value, label, trend indicator, and optional sparkline |
| `LoadingSkeleton` | Shimmer placeholder in table row, card, and full-page variants |
| `EmptyState` | Centered icon + title + description + optional CTA button |
| `Toast` | Stackable toast notifications with auto-dismiss and manual close |

### `src/components/layout/`

| Component | Description |
|---|---|
| `AppShell` | Root layout wrapper — composes sidebar, top bar, and page content area |
| `Sidebar` | Collapsible navigation rail — icon-only and expanded modes, active route highlighting |
| `TopBar` | Search trigger, theme toggle, notification bell, user menu with logout |

---

## Design System

- Dark mode first, with light mode available via class-based toggle (`dark` on `<html>`)
- Theme preference persisted to `localStorage` by the theme store
- CSS custom properties for all design tokens (colors, radius, shadow)
- Tailwind extended with semantic color aliases (`surface`, `border-subtle`, `text-muted`, etc.)
- Typography: Inter for UI text, JetBrains Mono for log output and code

---

## Scripts

```bash
npm run dev          # Start development server on port 3000
npm run build        # Production build (output: standalone)
npm run lint         # Run ESLint across the project
npm run test         # Run Vitest test suite once
npm run test:watch   # Run Vitest in watch mode
```

### Production Build

`npm run build` produces a [Next.js standalone output](https://nextjs.org/docs/pages/api-reference/next-config-js/output) in `.next/standalone/`. The Docker image (`hivearmor/frontend-v2`) copies this directory and runs `node server.js`. The `BACKEND_URL` environment variable must be set at container start time.

---

## Backend Integration

The HiveArmor backend exposes REST endpoints under `/api/ha-*` (Java 17, Spring Boot 3.3). Key endpoints consumed by this frontend:

| Endpoint prefix | Purpose |
|---|---|
| `/api/authenticate` | JWT login |
| `/api/ha-alerts` | Alert CRUD and filtering |
| `/api/ha-incidents` | Incident management |
| `/api/ha-rules` | Detection rule management |
| `/api/ha-compliance` | Compliance control status |
| `/api/ha-reports` | Report generation and download |
| `/api/ha-users` | User and role management |
| `/api/ha-integrations` | Connector configuration |
| `/api/ha-data-sources` | Log source configuration |

Log events are stored in OpenSearch under the index pattern `_v3_hive_<type>-YYYY.MM.DD`. The backend abstracts all OpenSearch queries — the frontend never calls OpenSearch directly.

---

## Project Layout

```
frontend-v2/
  src/
    app/
      (app)/           # Protected pages (auth-guarded layout)
      login/           # Public login page
      api/[...path]/   # API proxy
    components/
      ui/              # Reusable UI primitives
      layout/          # AppShell, Sidebar, TopBar
      features/        # Page-specific composite components
    services/          # TanStack Query hooks and API call functions
    store/             # Zustand state stores
    lib/               # Utility functions (dates, formatters, etc.)
    types/             # Shared TypeScript interfaces and enums
  public/              # Static assets, favicon, logo
  tailwind.config.ts
  next.config.ts
```

---

## Related Services

| Service | Description |
|---|---|
| `backend/` | Java 17 Spring Boot REST API, PostgreSQL via Liquibase |
| `event-processor/` | Go correlation engine, YAML rules, CEL expressions |
| `agent/` | Go endpoint agent (Windows / Linux / macOS) |
| `hivearmor-collector/` | Go syslog/UDP/TCP collector for network devices |
| `agent-manager/` | Go gRPC agent registry (ports 9000/9001) |
| `plugins/*/` | 17 Go plugins: alerts, aws, azure, gcp, o365, crowdstrike, feeds, soc-ai, and more |
| `local-dev/` | Docker Compose stack for full local development |

---

## Support

- Documentation: [https://docs.hivearmor.io](https://docs.hivearmor.io)
- GitHub: [https://github.com/hivearmor](https://github.com/hivearmor)
- Support: support@hivearmor.io
- LTS: v11.x supported until November 2030
