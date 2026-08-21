---
name: d3-visualization
description: D3.js v7 chart patterns for HiveArmor dashboards — geo threat map, attack heatmap, kill-chain timeline, investigation graph. Use when Recharts cannot handle the required chart type (choropleth, force-directed graph, custom heatmap).
metadata:
  type: skill
  source: HiveArmor-specific (D3 v7 + MapLibre/Leaflet for geo)
---

# D3.js Visualization — HiveArmor SIEM

## When to Use D3 vs Recharts

| Use D3 for | Use Recharts for |
|---|---|
| Geo threat map (choropleth / marker) | Alert volume timeline (area chart) |
| Attack heatmap (day × hour matrix) | Severity donut |
| Kill-chain Sankey / funnel | MITRE tactics bar chart |
| Investigation force graph | KPI sparklines |
| Custom SVG correlation timeline | EPS gauge |

Rule: if the chart type exists in Recharts and handles your data size, use Recharts. D3 only when Recharts cannot do it.

---

## Setup in Next.js 14

```tsx
// Always lazy-import D3 — it's large and SSR-hostile
import dynamic from 'next/dynamic'

const GeoThreatMap = dynamic(
  () => import('@/components/dashboard/geo-threat-map'),
  { ssr: false, loading: () => <Skeleton className="h-64 w-full" /> }
)
```

```bash
# Install D3 v7 (already in package.json if dashboard exists)
npm install d3@7
npm install --save-dev @types/d3
```

---

## Chart 1 — Attack Heatmap (hour × day of week)

Visualizes attack volume: rows = day of week, columns = hour. Essential for SOC shift planning.

```tsx
'use client'
import { useEffect, useRef } from 'react'
import * as d3 from 'd3'
import { useTheme } from 'next-themes'

interface HeatmapCell {
  day: number    // 0–6 (Mon–Sun)
  hour: number   // 0–23
  count: number
}

export function AttackHeatmap({ data }: { data: HeatmapCell[] }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const { resolvedTheme } = useTheme()

  useEffect(() => {
    if (!svgRef.current || !data.length) return

    const margin = { top: 20, right: 20, bottom: 30, left: 40 }
    const cellSize = 28
    const width = 24 * cellSize + margin.left + margin.right
    const height = 7 * cellSize + margin.top + margin.bottom

    // Clear previous render
    d3.select(svgRef.current).selectAll('*').remove()

    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    // Color scale — map count to severity colors
    const maxCount = d3.max(data, d => d.count) ?? 1
    const colorScale = d3.scaleSequential()
      .domain([0, maxCount])
      .interpolator(d3.interpolateRgb('#1e2d42', '#ef4444'))  // dark blue → red

    // X axis (hours)
    const xScale = d3.scaleBand()
      .domain(d3.range(24).map(String))
      .range([0, 24 * cellSize])
      .padding(0.05)

    svg.append('g')
      .attr('transform', `translate(0,${7 * cellSize})`)
      .call(d3.axisBottom(xScale).tickValues(['0','6','12','18','23']))
      .call(g => g.select('.domain').remove())
      .call(g => g.selectAll('text').style('fill', '#8fa3bb').style('font-size', '11px'))

    // Y axis (days)
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    const yScale = d3.scaleBand()
      .domain(days)
      .range([0, 7 * cellSize])
      .padding(0.05)

    svg.append('g')
      .call(d3.axisLeft(yScale).tickSize(0))
      .call(g => g.select('.domain').remove())
      .call(g => g.selectAll('text').style('fill', '#8fa3bb').style('font-size', '11px'))

    // Cells
    svg.selectAll('rect')
      .data(data)
      .join('rect')
      .attr('x', d => xScale(String(d.hour)) ?? 0)
      .attr('y', d => yScale(days[d.day]) ?? 0)
      .attr('width', xScale.bandwidth())
      .attr('height', yScale.bandwidth())
      .attr('rx', 2)
      .style('fill', d => colorScale(d.count))
      .style('opacity', d => d.count === 0 ? 0.15 : 1)
      // Tooltip on hover
      .append('title')
      .text(d => `${days[d.day]} ${String(d.hour).padStart(2, '0')}:00 — ${d.count} attacks`)

  }, [data, resolvedTheme])

  return (
    <div className="w-full overflow-x-auto">
      <svg ref={svgRef} />
    </div>
  )
}
```

---

## Chart 2 — Geo Threat Map (choropleth + markers)

Uses MapLibre GL JS (lighter than Leaflet, no jQuery dependency).

```bash
npm install maplibre-gl
npm install --save-dev @types/maplibre-gl
```

```tsx
'use client'
import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

interface ThreatMarker {
  lat: number
  lon: number
  count: number
  country: string
  topIp: string
}

export function GeoThreatMap({ markers }: { markers: ThreatMarker[] }) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<maplibregl.Map | null>(null)

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return

    mapInstance.current = new maplibregl.Map({
      container: mapRef.current,
      // Free tile server — no API key required
      style: 'https://demotiles.maplibre.org/style.json',
      center: [0, 20],
      zoom: 1.5,
      attributionControl: false,
    })

    const map = mapInstance.current

    map.on('load', () => {
      // Add threat markers as a GeoJSON source
      map.addSource('threats', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: markers.map(m => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [m.lon, m.lat] },
            properties: { count: m.count, country: m.country, topIp: m.topIp }
          }))
        },
        cluster: true,
        clusterRadius: 40,
        clusterMaxZoom: 6,
      })

      // Clustered circles — size and color by count
      map.addLayer({
        id: 'clusters',
        type: 'circle',
        source: 'threats',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': [
            'step', ['get', 'point_count'],
            '#f59e0b',   // amber: < 10
            10, '#f97316',  // orange: 10–50
            50, '#ef4444'   // red: > 50
          ],
          'circle-radius': ['step', ['get', 'point_count'], 16, 10, 22, 50, 30],
          'circle-opacity': 0.85,
        }
      })

      // Individual markers
      map.addLayer({
        id: 'unclustered',
        type: 'circle',
        source: 'threats',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': '#ef4444',
          'circle-radius': 6,
          'circle-opacity': 0.9,
          'circle-stroke-width': 1,
          'circle-stroke-color': '#fee2e2',
        }
      })

      // Click handler — show detail popup
      map.on('click', 'unclustered', (e) => {
        const props = e.features?.[0]?.properties
        if (!props) return
        new maplibregl.Popup()
          .setLngLat(e.lngLat)
          .setHTML(`<strong>${props.country}</strong><br/>${props.count} attacks<br/>Top IP: ${props.topIp}`)
          .addTo(map)
      })
    })

    return () => { mapInstance.current?.remove(); mapInstance.current = null }
  }, [])

  // Update markers when data changes without re-mounting
  useEffect(() => {
    const map = mapInstance.current
    if (!map?.isStyleLoaded()) return
    const source = map.getSource('threats') as maplibregl.GeoJSONSource
    source?.setData({
      type: 'FeatureCollection',
      features: markers.map(m => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [m.lon, m.lat] },
        properties: { count: m.count, country: m.country, topIp: m.topIp }
      }))
    })
  }, [markers])

  return <div ref={mapRef} className="h-64 w-full rounded-lg" style={{ background: '#0b0f1a' }} />
}
```

---

## Chart 3 — Kill-Chain Timeline (Gantt-style)

Shows attack stages (recon → initial access → lateral movement → exfiltration) as horizontal bars across time.

```tsx
'use client'
import { useEffect, useRef } from 'react'
import * as d3 from 'd3'

interface KillChainEvent {
  stage: string       // MITRE tactic name
  startTime: Date
  endTime: Date
  alertCount: number
  severity: 'critical' | 'high' | 'medium' | 'low'
}

const SEVERITY_COLOR = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#22c55e',
}

export function KillChainTimeline({ events }: { events: KillChainEvent[] }) {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!svgRef.current || !events.length) return

    const margin = { top: 10, right: 20, bottom: 30, left: 160 }
    const width = 800 - margin.left - margin.right
    const rowHeight = 32
    const stages = [...new Set(events.map(e => e.stage))]
    const height = stages.length * rowHeight

    d3.select(svgRef.current).selectAll('*').remove()

    const svg = d3.select(svgRef.current)
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    const timeExtent = [
      d3.min(events, d => d.startTime) as Date,
      d3.max(events, d => d.endTime) as Date,
    ]

    const xScale = d3.scaleTime().domain(timeExtent).range([0, width])
    const yScale = d3.scaleBand().domain(stages).range([0, height]).padding(0.2)

    // X axis
    svg.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(xScale).ticks(6).tickFormat(d3.timeFormat('%H:%M')))
      .call(g => g.select('.domain').attr('stroke', '#1e2d42'))
      .call(g => g.selectAll('text').style('fill', '#8fa3bb').style('font-size', '11px'))

    // Y axis (stage labels)
    svg.append('g')
      .call(d3.axisLeft(yScale).tickSize(0))
      .call(g => g.select('.domain').remove())
      .call(g => g.selectAll('text')
        .style('fill', '#dde5f0')
        .style('font-size', '12px')
        .attr('x', -8))

    // Grid lines
    svg.append('g')
      .selectAll('line')
      .data(xScale.ticks(6))
      .join('line')
      .attr('x1', d => xScale(d))
      .attr('x2', d => xScale(d))
      .attr('y1', 0)
      .attr('y2', height)
      .attr('stroke', '#1e2d42')
      .attr('stroke-dasharray', '2,4')

    // Event bars
    svg.selectAll('.event-bar')
      .data(events)
      .join('rect')
      .attr('class', 'event-bar')
      .attr('x', d => xScale(d.startTime))
      .attr('width', d => Math.max(4, xScale(d.endTime) - xScale(d.startTime)))
      .attr('y', d => yScale(d.stage) ?? 0)
      .attr('height', yScale.bandwidth())
      .attr('rx', 3)
      .attr('fill', d => SEVERITY_COLOR[d.severity])
      .attr('opacity', 0.85)
      .append('title')
      .text(d => `${d.stage}\n${d.alertCount} alerts (${d.severity})`)

  }, [events])

  return (
    <div className="w-full overflow-x-auto">
      <svg ref={svgRef} />
    </div>
  )
}
```

---

## Chart 4 — Investigation Force Graph

For incident investigation — shows entity relationships (host → process → network connection → threat-intel).

```tsx
'use client'
import { useEffect, useRef } from 'react'
import * as d3 from 'd3'

interface GraphNode { id: string; type: 'host' | 'process' | 'ip' | 'user' | 'file'; label: string }
interface GraphLink { source: string; target: string; relationship: string }

const NODE_COLOR = {
  host: '#3b82f6',
  process: '#8b5cf6',
  ip: '#ef4444',
  user: '#22c55e',
  file: '#f59e0b',
}

export function InvestigationGraph({ nodes, links }: { nodes: GraphNode[]; links: GraphLink[] }) {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!svgRef.current) return
    const width = 700, height = 420

    d3.select(svgRef.current).selectAll('*').remove()

    const svg = d3.select(svgRef.current)
      .attr('width', width).attr('height', height)

    // Zoom + pan
    const g = svg.append('g')
    svg.call(d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3])
      .on('zoom', ({ transform }) => g.attr('transform', transform)))

    const simulation = d3.forceSimulation(nodes as d3.SimulationNodeDatum[])
      .force('link', d3.forceLink(links).id((d: any) => d.id).distance(80))
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide(30))

    // Links
    const link = g.append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', '#1e2d42')
      .attr('stroke-width', 1.5)

    // Link labels
    g.append('g')
      .selectAll('text')
      .data(links)
      .join('text')
      .text(d => d.relationship)
      .attr('fill', '#8fa3bb')
      .attr('font-size', '9px')
      .attr('text-anchor', 'middle')

    // Nodes
    const node = g.append('g')
      .selectAll('circle')
      .data(nodes as d3.SimulationNodeDatum[])
      .join('circle')
      .attr('r', 14)
      .attr('fill', (d: any) => NODE_COLOR[d.type as keyof typeof NODE_COLOR])
      .attr('stroke', '#0b0f1a')
      .attr('stroke-width', 2)
      .call(d3.drag<SVGCircleElement, d3.SimulationNodeDatum>()
        .on('start', (event, d) => { if (!event.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y })
        .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y })
        .on('end', (event, d) => { if (!event.active) simulation.alphaTarget(0); d.fx = null; d.fy = null }))

    node.append('title').text((d: any) => `${d.type}: ${d.label}`)

    // Node labels
    const label = g.append('g')
      .selectAll('text')
      .data(nodes as d3.SimulationNodeDatum[])
      .join('text')
      .text((d: any) => d.label)
      .attr('fill', '#dde5f0')
      .attr('font-size', '10px')
      .attr('text-anchor', 'middle')
      .attr('dy', 26)

    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y)
      node.attr('cx', (d: any) => d.x).attr('cy', (d: any) => d.y)
      label.attr('x', (d: any) => d.x).attr('y', (d: any) => d.y)
    })

    return () => simulation.stop()
  }, [nodes, links])

  return <svg ref={svgRef} className="w-full bg-card rounded-lg border border-border" />
}
```

---

## Design Rules for D3 in HiveArmor

1. Always use CSS variables from `chart-theme.ts` for colors — never hardcode Tailwind values
2. Dark background: `#07090f` (background) or `#0b0f1a` (card) — not white
3. Grid lines: `#1e2d42` (border color) — low visibility
4. Axis text: `#8fa3bb` (muted-foreground) — 11–12px
5. Data labels: `#dde5f0` (foreground) — 12–13px
6. All D3 components must clean up (`selection.selectAll('*').remove()` or return cleanup from useEffect)
7. Disable D3 animations for datasets > 1000 points (`.duration(0)` or skip transitions)
8. All D3 components must be `'use client'` + `ssr: false` dynamic imports
9. Use `svgRef` + `useEffect` pattern — do not use D3 in render function
10. Provide `<title>` on interactive elements for screen reader support
