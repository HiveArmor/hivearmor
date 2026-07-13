# Implementation Plan: Visualization Builder

## Overview

This plan implements the full end-to-end visualization builder for UTMStack frontend-v2. It covers types, services, state management, UI components, ECharts integration, and the workspace assembly. Tasks are ordered by dependency — foundational layers first, then UI components, then integration.

## Tasks

- [x] 1. Create TypeScript types and enums for the visualization builder (ChartType enum with 14 chart types, FieldDataType, IndexPatternField, MetricType with 8 types, MetricAggregation, BucketType with 5 types, BucketAggregation, BucketParams union, ChartData, ChartSeries, VisualizationPayload, SavedVisualization, and CHART_TYPE_CONFIG constant array with id/name/icon/description for each type). Create helper functions: getMetricRequiresField, getFieldTypesForMetric, getFieldTypesForBucket. File: src/types/visualization-builder.ts. Requirements: 1, 4, 5, 7, 11.
- [x] 2. Create Visualization Service with API methods: create (POST /api/utm-visualizations), update (PUT /api/utm-visualizations), getById (GET /api/utm-visualizations/:id), delete (DELETE /api/utm-visualizations/:id), run (POST /api/utm-visualizations/run), getIndexPatterns (GET /api/utm-index-patterns), getFieldsForPattern (GET /api/utm-index-patterns/:id/fields). Use existing api client from @/lib/api. Handle errors gracefully returning null/empty arrays. File: src/services/visualization.service.ts. Requirements: 3, 6, 9, 10.
- [x] 3. Create Visualization Zustand Store with state (id, name, chartType, indexPattern, fields, metrics, buckets, filters, timeRange, queryMode, sqlQuery, previewData, previewLoading, previewError, description, systemOwner), computed isValid property (name + indexPattern + metrics), and all actions (setName, setChartType, setIndexPattern, setFields, addMetric, updateMetric, removeMetric, addBucket, updateBucket, removeBucket, addSubBucket, addFilter, removeFilter, updateFilter, setTimeRange, setQueryMode, setSqlQuery, setPreviewData, setPreviewLoading, setPreviewError, loadVisualization, reset, toApiPayload). Initialize with one Count metric and timeRange now-24h/now. File: src/store/visualization.ts. Requirements: 11, 4, 5, 8.
- [x] 4. Create ECharts dark theme config (DARK_CHART_THEME with transparent bg, #94A3B8 text, #2E3A4E axes, color palette of 8 brand colors) and chart-config-builder pure function that maps ChartType + ChartData + metrics + buckets to EChartsOption. Handle Line, Area, Bar, BarH, Pie, Gauge, Goal, HeatMap with ECharts. Return null for Metric, Table, List, Text (custom React rendering). File: src/lib/chart-theme.ts and src/components/builder/chart-config-builder.ts. Requirements: 6, 12.
- [x] 5. Create FieldAutocomplete component: searchable dropdown showing index pattern fields with type badges (string=gray, number=blue, date=green, boolean=purple, ip=cyan, geo_point=orange), filtering by filterByType prop, case-insensitive search, grouped by type when unfiltered, click-outside to close, disabled state. File: src/components/builder/field-autocomplete.tsx. Requirements: 7.
- [x] 6. Create MetricAggregation components: MetricAggregationItem (type select with 8 options, field autocomplete filtered by type, custom label input, remove button disabled for last metric) and MetricAggregationList (section header, add button, maps over store metrics). Files: src/components/builder/metric-aggregation-item.tsx, src/components/builder/metric-aggregation-list.tsx. Requirements: 4.
- [x] 7. Create BucketAggregation components: BucketAggregationItem with type-specific options (Terms: field+size+order, DateHistogram: date field+interval, Histogram: number field+interval, Range: number field+from-to pairs, Filters: named conditions), sub-bucket support, remove button. BucketAggregationList (section header, add button, maps over store buckets recursively). Files: src/components/builder/bucket-aggregation-item.tsx, src/components/builder/bucket-aggregation-list.tsx. Requirements: 5.
- [x] 8. Create ChartRenderer component: registers dark theme, renders ECharts for supported types using buildChartOptions, renders custom React for Metric (large number), Table (HTML table), List (ordered list), Text (markdown). Shows loading overlay, error state with retry, no-data placeholder. Memoizes chart options. File: src/components/builder/chart-renderer.tsx. Requirements: 6, 12.
- [x] 9. Create FilterPanel components: TimeRangeFilter (quick range buttons 15m/1h/6h/24h/7d/30d, custom range, default now-24h), FilterConditionItem (field autocomplete + operator select with 9 operators + value input), FilterPanel (time range + add filter button + condition list). Files: src/components/builder/time-range-filter.tsx, src/components/builder/filter-condition-item.tsx, src/components/builder/filter-panel.tsx. Requirements: 8.
- [x] 10. Create Builder Workspace page and layout: builder page reads query params (chart/name/mode/visualizationId), initializes store, fetches existing viz for edit mode, resets on unmount. BuilderHeader with back/name/pattern/mode-toggle/save. BuilderWorkspace three-panel grid (300px|flex|280px) with ConfigPanel OR SqlEditorPanel on left, ChartRenderer center, FilterPanel right. Preview auto-executes with 500ms debounce on config changes. IndexPatternSelector dropdown. SqlEditorPanel textarea/editor with run button. Files: src/app/(app)/creator/visualizations/builder/page.tsx, src/components/builder/builder-header.tsx, src/components/builder/builder-workspace.tsx, src/components/builder/index-pattern-selector.tsx, src/components/builder/sql-editor-panel.tsx. Requirements: 2, 3, 6, 9, 10, 13.
- [x] 11. Update Chart Type Selector page to match old UI layout: two-column layout with chart type grid (4 cols, 14 types with Lucide icons) on left and description panel on right. Name input required. Cancel and Create Visualization buttons. Create navigates to builder with chart+name params. File: src/app/(app)/creator/visualizations/new/page.tsx. Requirements: 1.
- [x] 12. End-to-end integration: verify full create flow (select type → configure → preview → save → redirect), edit flow (load existing → modify → save), build passes with zero errors. Fix any TypeScript/ESLint issues. Ensure all new routes accessible. Test preview shows loading/error/no-data states. Requirements: 6, 9, 10.

## Task Dependency Graph

```json
{
  "waves": [
    {"tasks": [1]},
    {"tasks": [2, 4, 5]},
    {"tasks": [3, 6, 7, 8, 9]},
    {"tasks": [10, 11]},
    {"tasks": [12]}
  ]
}
```

```
1 (Types) ──► 2 (Service) ──► 3 (Store) ──► 10 (Workspace)
                                   │              ▲
1 (Types) ──► 4 (ECharts) ──► 8 (Renderer) ──► 10
                                                  ▲
1 (Types) ──► 5 (FieldAutocomplete) ──► 6 (Metrics) ──► 10
                                    ──► 7 (Buckets) ──► 10
                                    ──► 9 (Filters) ──► 10
                                                        │
                                              11 (ChartSelector) ──► 12 (Integration)
                                              10 (Workspace) ──► 12
```

## Notes

- Task 1 is the foundation — all other tasks depend on its types
- Tasks 2, 4, 5 can be done in parallel after Task 1
- Tasks 6, 7, 8, 9 can be done in parallel after their direct dependencies
- Task 10 is the assembly point that brings all components together
- Task 11 is independent of the workspace but should be done before final integration
- Task 12 is the final verification pass
- ECharts wordCloud extension may need a separate npm install for Tag Cloud support
- Monaco Editor is already available in the project (used in log search) but may need lazy loading for the SQL panel
