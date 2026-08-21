---
name: frontend-design
description: Enterprise UI/UX design intelligence for HiveArmor — SIEM dashboard aesthetics, component design, dark theme, typography, spacing. Use before building any new page or component in frontend-v2.
metadata:
  type: skill
  source: anthropic/frontend-design + nextlevelbuilder/ui-ux-pro-max-skill (adapted for HiveArmor)
---

# Frontend Design — HiveArmor Enterprise SIEM

## Design Identity
HiveArmor is an enterprise SIEM/XDR platform used by SOC analysts in high-stress environments.
Design must be: **data-dense, readable at a glance, high-contrast, no decorative clutter**.

## Color System
```css
/* Core palette — use CSS variables from globals.css, never hardcode */
--background: hsl(224, 71%, 4%);        /* near-black, not pure black */
--foreground: hsl(213, 31%, 91%);       /* soft white */
--card: hsl(224, 71%, 6%);
--card-foreground: hsl(213, 31%, 91%);
--border: hsl(216, 34%, 17%);
--muted: hsl(223, 47%, 11%);
--muted-foreground: hsl(215, 20%, 65%);

/* Semantic alert colors — critical for SIEM */
--severity-critical: hsl(0, 84%, 60%);   /* red */
--severity-high:     hsl(25, 95%, 53%);  /* orange */
--severity-medium:   hsl(48, 96%, 53%);  /* amber */
--severity-low:      hsl(142, 71%, 45%); /* green */
--severity-info:     hsl(217, 91%, 60%); /* blue */
```
Never use pink/purple gradients, glassmorphism, or decorative animations in a SIEM context.

## Typography
- **Headers:** Inter or Geist, 600 weight — never decorative serifs
- **Data/tables:** font-variant-numeric: tabular-nums — critical for aligned numbers in alert tables
- **Monospace (IDs, hashes, IP addresses):** font-family: 'Geist Mono', monospace
- **Minimum readable size:** 12px for dense tables, 14px for body

## Layout Principles for SIEM Dashboards
1. **Information hierarchy:** Critical alerts surface first, always top-left
2. **Density over whitespace:** SOC analysts scan 100s of alerts — compact rows win over spacious cards
3. **Status always visible:** Severity badge, status badge, and timestamp visible without scrolling or hover
4. **Real-time indicators:** Live dot (pulsing) for streaming data, never static
5. **Keyboard navigation:** Tab order matches visual scan order (top-to-bottom, critical-to-low)

## Component Conventions (existing codebase — match these)
```tsx
// Severity badge — use existing component
import { SeverityBadge } from '@/components/ui/severity-badge'
<SeverityBadge severity="critical" />  // not custom inline styles

// KPI card — use existing primitive
import { KpiCard } from '@/components/ui/kpi-card'
<KpiCard title="Active Alerts" value={count} delta={+12} trend="up" />

// Live dot for streaming status
import { LiveDot } from '@/components/ui/live-dot'
<LiveDot status="connected" />  // pulses when active

// Loading state — always skeleton, never spinner for table rows
import { LoadingSkeleton } from '@/components/ui/loading-skeleton'
```

## Chart Design Rules
- **Always use chart-theme.ts tokens** — never Recharts default colors
- Dark chart background matches `--card` variable
- Grid lines: `--border` color at 30% opacity
- Tooltip: dark background, no rounded corners, monospace values
- Axis labels: `--muted-foreground`, 11px
- **Heatmaps (alert timeline):** green→yellow→red, never diverging blue-red
- **Geo threat map:** dark map tiles, accent color for threat locations

## Responsive Breakpoints for Dashboard
```tsx
// Dashboard grid — tight breakpoints for SOC monitor sizes
<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
  {/* KPI cards */}
</div>

// Alert table — full width always, horizontal scroll on mobile
<div className="w-full overflow-x-auto">
  <table className="min-w-[1024px]"> {/* minimum width for data integrity */}
```

## Anti-Patterns — Never in HiveArmor UI
- Skeleton placeholders for more than 2s — show stale data with an indicator instead
- Modal dialogs for destructive actions without explicit confirmation text
- Color as the only differentiator (accessibility — always pair with icon/text)
- Auto-refreshing the page — use SSE/WebSocket for updates, never full reload
- Truncating alert IDs or IP addresses without a copy-to-clipboard affordance
