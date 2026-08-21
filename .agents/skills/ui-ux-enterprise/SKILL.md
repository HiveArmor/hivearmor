---
name: ui-ux-enterprise
description: Enterprise dashboard patterns — data-dense tables, real-time widgets, SIEM-specific UX (alert boards, log analyzers, rule editors, SOAR flows). Use when building pages in frontend-v2.
metadata:
  type: skill
  source: nextlevelbuilder/ui-ux-pro-max-skill + HiveArmor-specific patterns
---

# Enterprise SIEM UX Patterns — HiveArmor

## Page Archetypes and Their Patterns

### Alert Board (alerts/, offenses/)
```tsx
// Pattern: virtual-scrolled table with sticky column headers
// Left-fixed: severity badge + checkbox
// Core columns: time, source, name, status
// Right-fixed: actions (assign, close, SOAR launch)
// Row interaction: click → slide-in detail panel (not new page)

// Keyboard shortcuts (mandatory for SOC efficiency)
// J/K: next/previous alert
// Space: toggle selection
// A: assign selected
// C: close selected
// Shift+F: filter panel
```

### Log Analyzer (logs/)
```tsx
// Pattern: split-pane — query bar top, results below, detail drawer right
// Query bar: Monaco editor with OpenSearch DSL syntax highlighting
// Results: virtual scroll, 50 rows/page, time-bucketed histogram above
// Field browser: left sidebar, collapsible, shows top values + count
// Saved queries: command palette accessible (Cmd+K)
```

### Rule Editor (rules/)
```tsx
// Pattern: code editor (Monaco) + live preview pane side-by-side
// Editor: YAML syntax highlighting for CEL rules
// Preview: shows matching events from last 24h in real-time
// Validation: inline error underlines, not modal dialogs
// History drawer: version diff with applied/reverted states
```

### Dashboard Widgets
```tsx
// EPS Live Widget — sparkline + large number, updates every 1s via SSE
// Geo Threat Map — dark map, animated pulse markers for active threats
// Alert Timeline Heatmap — hour×day grid, green→yellow→red
// MITRE Tactics Bar — horizontal bar chart, ordered by ATT&CK framework stage
// Severity Donut — 5 segments with count labels, no animations
// Collector Health Matrix — grid of source × status badges
```

### SOAR Console (soar/)
```tsx
// Pattern: node-based flow editor (XYFlow/ReactFlow)
// Nodes: trigger, condition, action, notification
// Execution log: right panel, shows last 10 runs with expand/collapse
// Playbook list: left sidebar, drag to canvas
```

## TanStack Query Patterns (v5 — existing codebase)
```tsx
// List with polling (alerts dashboard)
const { data, isLoading } = useQuery({
    queryKey: ['alerts', filters],
    queryFn: () => alertService.findAll(filters),
    refetchInterval: 30_000,  // 30s poll — use SSE for true real-time
    staleTime: 10_000,
})

// Mutation with optimistic update (status change)
const mutation = useMutation({
    mutationFn: (update: AlertStatusUpdate) => alertService.updateStatus(update),
    onMutate: async (update) => {
        await queryClient.cancelQueries({ queryKey: ['alerts'] })
        const previous = queryClient.getQueryData(['alerts'])
        queryClient.setQueryData(['alerts'], (old: Alert[]) =>
            old.map(a => a.id === update.id ? {...a, status: update.status} : a)
        )
        return { previous }
    },
    onError: (err, update, context) => {
        queryClient.setQueryData(['alerts'], context?.previous)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['alerts'] }),
})
```

## SSE Streaming (existing hook — use it)
```tsx
import { useAlertStream } from '@/hooks/use-alert-stream'

// In alert board — plugs into Zustand alert-stream store
const { connected, latestAlert } = useAlertStream()

// EPS stream
import { useEpsStream } from '@/hooks/use-eps-stream'
const { eps, trend } = useEpsStream()
```

## Command Palette (Cmd+K — existing in layout)
Register new actions in the command palette, don't create floating buttons:
```tsx
// Add to command palette registry, not as floating UI elements
commandRegistry.register({
    id: 'alert.assign',
    label: 'Assign Alert',
    icon: UserIcon,
    keywords: ['assign', 'analyst'],
    action: () => openAssignModal(selectedAlertIds),
})
```

## Accessibility Requirements
- All interactive elements: keyboard accessible
- Color-coded severity: always paired with text label (not color only)
- Tables: proper `<th scope="col">` and `aria-sort`
- Modals: focus trap + `aria-modal="true"`
- Live regions: `aria-live="polite"` for SSE alert count updates
- Target: WCAG 2.1 AA minimum
