---
name: ui-ux-pro-max
description: UI/UX design intelligence for HiveArmor — 84 styles, 161 color palettes, 57 font pairings, 99 UX guidelines, 25 chart types across React/Next.js/shadcn/Tailwind. Use when designing or building any UI: pages, components, color schemes, typography, layout, accessibility, animation, or data visualization.
metadata:
  type: skill
  source: nextlevelbuilder/ui-ux-pro-max-skill (adapted inline — full Python+CSV install blocked by sandbox)
---

# UI/UX Pro Max — HiveArmor Design Intelligence

## When This Skill Applies
Use for every UI task: new pages, new components, color/theme decisions, typography, layout, responsive design, accessibility, animation, chart/data visualization. Skip for pure backend, API, infrastructure, or non-visual work.

---

## Stack: Next.js 14 + shadcn/ui + Tailwind CSS + React 18

### shadcn/ui Component Priority (use before building custom)
```
Alert tables → Table + Badge (severity)
KPI metrics → Card + Skeleton
Modal/drawer → Sheet (slide-in panel) or Dialog
Command palette → Command
Toast/feedback → Sonner or Toast
Dropdowns → DropdownMenu + Select
Forms → Form + react-hook-form + zod
Tabs → Tabs
Date picker → Calendar + Popover
Progress → Progress
```

### Tailwind v3 Utility Conventions (project uses v3, not v4)
```tsx
// Spacing scale: 4px base (1 = 4px, 2 = 8px, 4 = 16px)
// Data-dense tables: p-2 (8px) — not p-4
// Cards: p-4 (16px) — not p-6 for SIEM density
// Gap between dashboard cards: gap-4
// Border radius: rounded-lg for cards, rounded-md for badges, rounded-full for dots
```

---

## Priority Framework (10 tiers — check in order)

### P1 — Accessibility (Critical, never skip)
```tsx
// Contrast ratios — WCAG 2.1 AA minimum
// Normal text: 4.5:1    Large text: 3:1    UI components: 3:1
// Check: critical red on dark bg → use hsl(0,84%,60%) on hsl(224,71%,6%) ✓

// ARIA requirements for SIEM components
<Table aria-label="Security alerts">
  <TableHeader>
    <TableRow>
      <TableHead scope="col" aria-sort="descending">Time</TableHead>
      <TableHead scope="col">Severity</TableHead>
    </TableRow>
  </TableHeader>
</Table>

// Focus management — slide-in panels
<Sheet>
  <SheetContent onOpenAutoFocus={(e) => e.preventDefault()} />
  {/* prevent focus jump on open for panel-heavy SIEM workflows */}
</Sheet>

// Live regions for streaming alerts
<div role="status" aria-live="polite" aria-atomic="false" className="sr-only">
  {newAlertCount > 0 && `${newAlertCount} new alerts`}
</div>

// Icon-only buttons must have label
<Button variant="ghost" size="icon" aria-label="Close alert detail">
  <X className="h-4 w-4" />
</Button>
```

### P2 — Touch & Interaction (Critical for analyst workflows)
```tsx
// Minimum tap target: 44×44px (even on desktop — analysts use touchscreens)
// Space between clickable rows: min 4px
// Row hover state: always visible (bg-muted/50)
// Click target for table row: entire row, not just text

<TableRow
  className="cursor-pointer hover:bg-muted/50 transition-colors"
  onClick={() => openAlertDetail(alert.id)}
  tabIndex={0}
  onKeyDown={(e) => e.key === 'Enter' && openAlertDetail(alert.id)}
>
```

### P3 — Performance (High — SIEM dashboards load heavy data)
```tsx
// Virtual scroll for alert tables > 100 rows
import { useVirtualizer } from '@tanstack/react-virtual'

// Lazy load heavy widgets (geo map, investigation graph)
const GeoThreatMap = dynamic(() => import('@/components/dashboard/geo-threat-map'), {
  loading: () => <Skeleton className="h-64 w-full" />,
  ssr: false
})

// Image formats: use next/image with WebP
// Chart data: memoize expensive transformations
const chartData = useMemo(() => transformAlerts(alerts), [alerts])

// Avoid layout shift: always specify dimensions for charts
<div className="h-64 w-full">  {/* fixed height prevents CLS */}
  <AlertTimelineHeatmap />
</div>
```

### P4 — Style Selection for SIEM/Cybersecurity

**Recommended Style: Dark Data-Dense Enterprise**
```
Profile: Real-Time Monitoring Dashboard
- True dark background (not gray — near-black #0a0f1e)
- High information density (analysts scan 100s of rows)
- Muted borders (low visual noise)
- Status always visible at a glance
- No decorative gradients, glassmorphism, or bloom effects
- Micro-animations only (no page transitions, no hero animations)
```

**Anti-patterns for SIEM (never use):**
- ❌ Purple/indigo gradient backgrounds ("AI startup aesthetic")
- ❌ Glassmorphism cards with backdrop-blur
- ❌ Large whitespace / "airy" layouts (wastes analyst screen space)
- ❌ Rounded-2xl or rounded-3xl borders on data tables
- ❌ Emoji in interface text (unprofessional in enterprise SOC)
- ❌ Auto-playing animations on metric changes
- ❌ Light mode as the default (SOC analysts work in dark rooms)

### P5 — Layout & Responsive
```tsx
// Dashboard grid — 4-column on wide monitors (SOC wall displays)
<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">

// Alert table — always full-width, min-width for data integrity
<div className="w-full overflow-x-auto">
  <table className="w-full min-w-[900px]">

// Sidebar collapsed state — critical for alert detail panels
// When detail panel opens (Sheet/right panel), table stays visible at reduced width
<div className={cn("flex-1 transition-all", detailOpen ? "mr-96" : "mr-0")}>

// Breakpoints: prioritize 1440px and 1920px (analyst monitors)
// Mobile is secondary — most SOC work is desktop
```

### P6 — Typography & Color System
```tsx
// Font stack
// Headlines: font-sans (Inter/Geist) font-semibold
// Table data: font-mono for IPs, hashes, IDs, timestamps
// Labels/badges: text-xs font-medium uppercase tracking-wide

// Tabular numbers (critical for aligned columns)
<td className="font-mono tabular-nums text-sm">
  {alert.timestamp}
</td>

// Severity color mapping (use these exact classes — defined in globals.css)
const severityConfig = {
  critical: { bg: 'bg-red-500/10',    text: 'text-red-400',    border: 'border-red-500/20'    },
  high:     { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/20' },
  medium:   { bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/20' },
  low:      { bg: 'bg-green-500/10',  text: 'text-green-400',  border: 'border-green-500/20'  },
  info:     { bg: 'bg-blue-500/10',   text: 'text-blue-400',   border: 'border-blue-500/20'   },
}
```

### P7 — Animation (purposeful only)
```tsx
// ✓ Live pulse dot — indicates active streaming
<span className="relative flex h-2 w-2">
  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
</span>

// ✓ New alert slide-in — 150ms, subtle
<div className={cn(
  "transition-all duration-150",
  isNew && "animate-in slide-in-from-top-2"
)}>

// ✓ Severity badge pulse for critical — draws attention
<Badge className={cn(severity === 'critical' && "animate-pulse")}>

// ✗ Never: page-level transitions, hero animations, scroll-triggered reveals
// ✗ Never: duration > 300ms for any interactive feedback
// Chart animations: disabled for large datasets (> 1000 points), enabled for < 100
```

### P8 — Forms & Feedback
```tsx
// Always use react-hook-form + zod (existing project pattern)
const schema = z.object({
  severity: z.enum(['critical', 'high', 'medium', 'low', 'info']),
  assignee: z.string().min(1, 'Assignee required'),
  notes: z.string().max(500).optional(),
})

// Inline validation — never modal for form errors
<FormField
  control={form.control}
  name="assignee"
  render={({ field }) => (
    <FormItem>
      <FormLabel>Assign to</FormLabel>
      <FormControl><Input {...field} /></FormControl>
      <FormMessage />  {/* shows inline below field */}
    </FormItem>
  )}
/>

// Loading states — optimistic UI for status changes
// Show change immediately, revert on error (existing mutation pattern)
```

### P9 — Navigation Patterns
```tsx
// SIEM navigation hierarchy:
// Primary: sidebar (always visible, collapsible)
// Secondary: tabs within a section (alerts/incidents/offenses)
// Tertiary: breadcrumb for deep pages (alert > incident > timeline)

// Command palette (Cmd+K) for power users — already exists in layout
// Keyboard shortcuts on alert board: J/K navigate, Enter opens detail

// Breadcrumb for nested routes
<Breadcrumb>
  <BreadcrumbList>
    <BreadcrumbItem><BreadcrumbLink href="/incidents">Incidents</BreadcrumbLink></BreadcrumbItem>
    <BreadcrumbSeparator />
    <BreadcrumbItem><BreadcrumbPage>INC-2847</BreadcrumbPage></BreadcrumbItem>
  </BreadcrumbList>
</Breadcrumb>
```

### P10 — Charts & Data Visualization (25 chart types)

**Chart type selection guide for SIEM:**

| Data need | Chart type | Component |
|---|---|---|
| Alert volume over time | Area chart / line chart | Recharts AreaChart |
| Severity distribution | Donut chart | Recharts PieChart |
| Attack timeline | Heatmap (hour × day) | Custom SVG / D3 |
| Geo threat origins | Choropleth / marker map | Leaflet / MapLibre |
| MITRE ATT&CK coverage | Horizontal bar | Recharts BarChart |
| EPS real-time | Sparkline + number | Recharts Sparkline |
| Alert trend delta | Area + delta badge | Recharts + custom |
| Source distribution | Treemap | Recharts Treemap |
| Correlation timeline | Gantt-style | Custom SVG |
| Kill-chain stage flow | Sankey / funnel | D3 Sankey |

```tsx
// Always use project chart-theme.ts — never Recharts defaults
import { chartTheme } from '@/lib/chart-theme'

<ResponsiveContainer width="100%" height={240}>
  <AreaChart data={data}>
    <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
    <XAxis dataKey="time" tick={{ fill: chartTheme.axis, fontSize: 11 }} />
    <YAxis tick={{ fill: chartTheme.axis, fontSize: 11 }} />
    <Tooltip
      contentStyle={{
        background: chartTheme.tooltipBg,
        border: `1px solid ${chartTheme.border}`,
        borderRadius: '4px',
        fontSize: '12px',
      }}
    />
    <Area
      type="monotone"
      dataKey="count"
      stroke={chartTheme.colors[0]}
      fill={`${chartTheme.colors[0]}20`}  // 12% opacity fill
      strokeWidth={1.5}
    />
  </AreaChart>
</ResponsiveContainer>
```

---

## Design System Output — SIEM Dashboard

When designing a new page, answer these in order:
1. **Product type:** Real-time monitoring / Analytics / Admin / Detail view?
2. **Primary action:** What does the analyst need to do first?
3. **Data density:** How many rows/items visible without scrolling?
4. **Update frequency:** Static / polled (30s) / streaming (SSE/WS)?
5. **Drill-down path:** Where does clicking a row go?

### Page Templates

**List page (alerts, incidents, offenses):**
```
Header: title + count badge + filter bar + bulk actions
Body: virtual-scrolled table, row click → slide-in detail panel
Detail panel: full-width on mobile, 384px fixed on desktop
Footer: pagination or infinite scroll
```

**Detail page (incident/[id], alert/[id]):**
```
Header: breadcrumb + status badge + action buttons
Body: 2/3 content + 1/3 metadata sidebar
Tabs: Overview / Timeline / Evidence / Activity
```

**Dashboard page:**
```
Row 1: 4× KPI cards (EPS, active alerts, open incidents, MTTR)
Row 2: Alert timeline heatmap (full width) 
Row 3: 1/2 severity donut + 1/2 MITRE tactics bar
Row 4: Geo threat map (full width)
Row 5: Top sources table + collector health matrix
```

---

## Font Pairings for Enterprise SIEM

**Recommended (already in project — Geist/Inter):**
- UI labels + headings: `Inter` or `Geist Sans` — 400/500/600
- Monospace data: `Geist Mono` — IPs, hashes, event IDs, timestamps
- Never: decorative fonts (Playfair, Lobster, etc.)

**Size scale for data-dense UI:**
```
xs: 11px — table labels, timestamps, badge text
sm: 13px — table cell content, sidebar items  
base: 14px — body, descriptions
lg: 16px — section headings
xl: 20px — page headings
2xl: 28px — KPI numbers (large display)
```

---

## Color Palettes — Enterprise Dark

**Primary palette (use CSS variables from globals.css):**
```css
--background:         224 71% 4%    /* #07090f */
--card:               224 71% 6%    /* #0b0f1a */
--border:             216 34% 17%   /* #1e2d42 */
--muted:              223 47% 11%   /* #111827 */
--muted-foreground:   215 20% 65%   /* #8fa3bb */
--foreground:         213 31% 91%   /* #dde5f0 */
--primary:            217 91% 60%   /* #3b82f6 — blue accent */
--primary-foreground: 0 0% 100%
```

**Status palette:**
```css
--success:  142 71% 45%  /* green  — resolved, healthy */
--warning:   48 96% 53%  /* amber  — medium severity */
--error:      0 84% 60%  /* red    — critical */
--info:     217 91% 60%  /* blue   — informational */
```

Never use the default Tailwind blue/indigo for SIEM alerts — it conflicts with "informational" severity semantics.
