---
name: web-quality
description: Core Web Vitals, WCAG 2.2, SEO, and performance budgets for HiveArmor Next.js 14 frontend. Use when building or auditing any page for LCP/INP/CLS compliance, accessibility, or Lighthouse score. Based on addyosmani/web-quality-skills.
metadata:
  type: skill
  source: addyosmani/web-quality-skills (adapted inline — network blocked)
---

# Web Quality — HiveArmor Frontend

## When This Skill Applies
Any time you build or review a page/component in `frontend-v2/` — especially dashboard, alert board, log analyzer, and report pages which load heavy datasets and must meet enterprise SOC performance expectations.

---

## Core Web Vitals Targets

| Metric | Good | Needs Improvement | Poor |
|---|---|---|---|
| **LCP** (Largest Contentful Paint) | < 2.5s | 2.5s–4s | > 4s |
| **INP** (Interaction to Next Paint) | < 200ms | 200–500ms | > 500ms |
| **CLS** (Cumulative Layout Shift) | < 0.1 | 0.1–0.25 | > 0.25 |
| **FCP** (First Contentful Paint) | < 1.8s | 1.8–3s | > 3s |
| **TTFB** (Time to First Byte) | < 800ms | 800–1800ms | > 1800ms |

### LCP — Largest Contentful Paint
```tsx
// ✓ Preload the above-the-fold table/chart (KPI row on dashboard)
// In _document or layout:
<link rel="preload" as="fetch" href="/api/ha-alerts?size=25" crossOrigin="anonymous" />

// ✓ next/image for any logo or hero image
import Image from 'next/image'
<Image src="/logo.svg" width={120} height={32} priority />  // priority = preload

// ✓ Fonts: next/font/google (self-hosted, no layout shift)
import { Inter } from 'next/font/google'
const inter = Inter({ subsets: ['latin'], display: 'swap' })

// ✗ Never: <img> with unsized dimensions (causes layout shift)
// ✗ Never: @import in CSS (render-blocking)
```

### INP — Interaction to Next Paint (replaces FID in CWV 2024+)
```tsx
// ✓ Debounce expensive filter handlers
import { useDeferredValue } from 'react'
const deferredFilter = useDeferredValue(filterInput)

// ✓ Break up long tasks: use startTransition for non-urgent state
import { startTransition } from 'react'
startTransition(() => setHeavyFilterResults(results))

// ✓ Virtualize long alert lists — prevents scripting time on row render
import { useVirtualizer } from '@tanstack/react-virtual'

// ✗ Never: synchronous JSON.parse of large payloads on the main thread
// ✗ Never: unthrottled scroll/resize handlers without requestAnimationFrame
```

### CLS — Cumulative Layout Shift
```tsx
// ✓ Always size chart containers explicitly — prevents jump when data loads
<div className="h-64 w-full">  {/* fixed height, no CLS */}
  <Suspense fallback={<Skeleton className="h-64 w-full" />}>
    <AlertTimeline />
  </Suspense>
</div>

// ✓ Reserve space for KPI cards before data arrives
<Card className="h-24">  {/* match the rendered height */}
  {isLoading ? <Skeleton className="h-8 w-24" /> : <span>{value}</span>}
</Card>

// ✓ Specify image dimensions — Next.js Image does this automatically
// ✗ Never: inject ads or banners above existing content
// ✗ Never: async-load fonts without font-display: swap
```

---

## Performance Budgets

| Resource | Budget |
|---|---|
| JS bundle (compressed) | < 300 KB |
| Total page weight | < 1.5 MB |
| First-party JS | < 150 KB |
| Third-party scripts | < 100 KB |
| Images per page | WebP, < 200 KB each |
| CSS | < 50 KB |

### Audit Commands
```bash
# Lighthouse CI (run against local dev server)
cd frontend-v2
npm run build && npx serve out &
npx lighthouse http://localhost:3000 --output=json --output-path=lh-report.json

# Bundle analysis
ANALYZE=true npm run build  # next-bundle-analyzer

# Check CLS and LCP in browser DevTools → Performance → Web Vitals
```

### Next.js 14 Optimization Checklist
```tsx
// ✓ Dynamic imports for heavy widgets
const GeoThreatMap = dynamic(() => import('@/components/dashboard/geo-threat-map'), {
  loading: () => <Skeleton className="h-64 w-full" />,
  ssr: false
})

// ✓ Route segment config for static pages (settings, docs)
export const dynamic = 'force-static'  // in page.tsx
export const revalidate = 3600         // ISR: revalidate hourly

// ✓ Streaming with Suspense for slow data
<Suspense fallback={<AlertTableSkeleton />}>
  <AlertTable />  {/* server component that fetches data */}
</Suspense>

// ✓ Parallel data fetching in server components
const [alerts, incidents] = await Promise.all([
  getAlerts(filters),
  getIncidentSummary()
])
```

---

## WCAG 2.2 Accessibility

### Contrast Ratios (AA minimum — enterprise SOC requirement)
```
Normal text (< 18px): 4.5:1
Large text (≥ 18px bold or ≥ 24px): 3:1
UI components (borders, icons): 3:1
Focus indicators: 3:1 against adjacent colors

# HiveArmor color pairs — all pass AA:
foreground (#dde5f0) on background (#07090f) → ~14:1 ✓
red-400 (#f87171) on card (#0b0f1a) → ~6.5:1 ✓
muted-foreground (#8fa3bb) on card (#0b0f1a) → ~5.2:1 ✓
```

### Keyboard Navigation
```tsx
// ✓ All interactive elements reachable by Tab
// ✓ Focus ring — never remove outline without a visible replacement
// Focus visible (use :focus-visible, not :focus, to avoid mouse click rings)
className="focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"

// ✓ Skip link for keyboard users
<a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 z-50">
  Skip to main content
</a>

// ✓ Table row keyboard navigation (SIEM-specific)
<TableRow
  tabIndex={0}
  onKeyDown={(e) => { if (e.key === 'Enter') openDetail(row.id) }}
  role="button"
  aria-label={`Open alert ${row.id}`}
>
```

### ARIA Patterns for SIEM
```tsx
// Live region for streaming alert count
<div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
  {`${alertCount} alerts, ${criticalCount} critical`}
</div>

// Alert severity badge
<Badge
  role="img"
  aria-label={`Severity: ${severity}`}
  className={severityConfig[severity].text}
>
  {severity}
</Badge>

// Loading state
<div aria-busy={isLoading} aria-live="polite">
  {isLoading ? <Skeleton /> : <DataTable />}
</div>

// Sortable column header
<th scope="col" aria-sort={sortDir === 'asc' ? 'ascending' : sortDir === 'desc' ? 'descending' : 'none'}>
  Time
</th>
```

### WCAG 2.2 New Requirements (Level AA)
- **2.4.11 Focus Appearance**: Focus indicator must be at least 2px solid and have 3:1 contrast
- **2.4.12 Focus Not Obscured**: Focused element must not be fully hidden by sticky headers
- **2.5.7 Dragging Movements**: Any drag action must have a single-pointer alternative
- **3.2.6 Consistent Help**: Help/support link must be in the same location on every page
- **3.3.7 Redundant Entry**: Don't ask users to re-enter data already provided in the same flow
- **3.3.8 Accessible Authentication**: Login must not require cognitive tests (CAPTCHA) without alternative

---

## SEO (applies to marketing pages — not authenticated SIEM pages)

For the authenticated SIEM app (`/app/*`), SEO is irrelevant — pages require login.

For public pages (`/login`, `/register`, landing pages if any):
```tsx
// ✓ Metadata API (Next.js 14 App Router)
export const metadata: Metadata = {
  title: 'HiveArmor — Enterprise SIEM & XDR',
  description: 'Hyper-scale incident visibility. Real-time threat detection.',
  robots: { index: false }  // don't index authenticated app routes
}

// ✓ Structured data for product pages (JSON-LD)
<script type="application/ld+json">{JSON.stringify({
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "HiveArmor",
  "applicationCategory": "SecurityApplication"
})}</script>

// ✓ Canonical URL for any pages with query params
<link rel="canonical" href="https://app.hivearmor.io/login" />
```

---

## Lighthouse Score Targets

| Category | Target | Notes |
|---|---|---|
| Performance | ≥ 80 | SIEM dashboards are data-heavy; 90+ unrealistic with real-time streaming |
| Accessibility | 100 | Non-negotiable for enterprise |
| Best Practices | ≥ 95 | HTTPS, no deprecated APIs |
| SEO | ≥ 95 | Login + public pages only |

### Common Lighthouse Failures in SIEM UIs
```
❌ "Image elements do not have explicit width and height" — fix: use next/image
❌ "Eliminate render-blocking resources" — fix: preload critical CSS/fonts
❌ "Reduce unused JavaScript" — fix: dynamic imports for chart libraries
❌ "Does not use passive listeners for scroll events" — fix: { passive: true }
❌ "Background and foreground colors do not have sufficient contrast" — verify with devtools
❌ "Form elements do not have associated labels" — fix: <label htmlFor> or aria-label
```
