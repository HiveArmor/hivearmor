# Technical Design: Visualization Builder

## Overview

This document describes the technical architecture for the UTMStack Visualization Builder feature. The builder enables security analysts to create, configure, preview, and save data visualizations using a three-panel workspace with live chart preview powered by ECharts and data from OpenSearch via the UTMStack backend API.

## Architecture

### Component Hierarchy

```
/creator/visualizations/new (page.tsx)
└── ChartTypeSelector
    └── (navigates to)
        /creator/visualizations/builder (page.tsx)
        └── BuilderWorkspace
            ├── BuilderHeader
            │   ├── BackButton
            │   ├── VisualizationNameInput
            │   ├── IndexPatternSelector
            │   ├── QueryModeToggle (DSL / SQL)
            │   └── SaveButton
            ├── LeftPanel (ConfigPanel)
            │   ├── MetricAggregationList
            │   │   └── MetricAggregationItem[]
            │   │       ├── AggregationTypeSelect
            │   │       ├── FieldAutocomplete
            │   │       └── CustomLabelInput
            │   └── BucketAggregationList
            │       └── BucketAggregationItem[]
            │           ├── BucketTypeSelect
            │           ├── FieldAutocomplete
            │           ├── BucketOptions (size, interval, order, ranges)
            │           └── SubBucketAggregationItem (recursive)
            ├── CenterPanel (PreviewPanel)
            │   ├── ChartRenderer (ECharts)
            │   ├── LoadingOverlay
            │   ├── ErrorDisplay
            │   └── NoDataPlaceholder
            ├── RightPanel (FilterPanel)
            │   ├── TimeRangeFilter
            │   └── FilterConditionList
            │       └── FilterConditionItem[]
            │           ├── FieldAutocomplete
            │           ├── OperatorSelect
            │           └── ValueInput
            └── SqlEditorPanel (shown when SQL mode active)
                └── MonacoEditor
```

### Data Flow

```
User Interaction
     │
     ▼
Visualization Store (Zustand)
     │
     ├──► [debounce 500ms] ──► Visualization Service
     │                              │
     │                              ▼
     │                     POST /api/utm-visualizations/run
     │                              │
     │                              ▼
     │                     Chart Data (response)
     │                              │
     │                              ▼
     │                     ECharts Config Builder
     │                              │
     │                              ▼
     │                     ChartRenderer (re-render)
     │
     └──► [on save] ──► POST/PUT /api/utm-visualizations
                              │
                              ▼
                         Navigate to list + toast
```

## Components

### 1. ChartTypeSelector (`/creator/visualizations/new/page.tsx`)

**Purpose:** Presents all 14 chart types for the user to select from before entering the builder.

**Props:** None (page component)

**State:**
- `selectedType: ChartType | null`
- `name: string`

**Behavior:**
- Displays a grid of chart type cards with icons
- On selection, highlights the card and enables "Create visualization" button
- On confirm, navigates to `/creator/visualizations/builder?chart=<type>&name=<name>`

**Chart Types Enum:**
```typescript
enum ChartType {
  LINE = "line_chart",
  AREA = "area_chart",
  BAR = "bar_chart",
  BAR_HORIZONTAL = "bar_horizontal_chart",
  PIE = "pie_chart",
  TAG_CLOUD = "tag_cloud_chart",
  TABLE = "table_chart",
  LIST = "list_chart",
  GAUGE = "gauge_chart",
  GOAL = "goal_chart",
  METRIC = "metric_chart",
  REGION_MAP = "region_map_chart",
  HEAT_MAP = "heat_map_chart",
  TEXT = "text_chart",
}
```

### 2. BuilderWorkspace (`/creator/visualizations/builder/page.tsx`)

**Purpose:** Main three-panel workspace for visualization configuration.

**URL Params:**
- `chart` — chart type (from ChartType enum)
- `name` — visualization name
- `mode` — "edit" (optional, for existing visualization)
- `visualizationId` — existing ID (optional, for edit mode)

**Layout:** CSS Grid with `grid-template-columns: 300px 1fr 280px` (collapsible on mobile)

### 3. FieldAutocomplete (`src/components/builder/field-autocomplete.tsx`)

**Purpose:** Searchable dropdown showing fields from the selected index pattern with type annotations.

**Props:**
```typescript
interface FieldAutocompleteProps {
  fields: IndexPatternField[];
  value: string | null;
  onChange: (field: string) => void;
  filterByType?: FieldDataType[];  // restrict to specific types
  placeholder?: string;
  disabled?: boolean;
}
```

**Behavior:**
- Shows all fields grouped by type when opened
- Filters on typing (case-insensitive substring match)
- Displays type badge (string, number, date, boolean, ip, geo_point)
- Only shows fields matching `filterByType` when specified

### 4. MetricAggregationItem (`src/components/builder/metric-aggregation-item.tsx`)

**Purpose:** Single metric aggregation configuration row.

**Props:**
```typescript
interface MetricAggregationItemProps {
  metric: MetricAggregation;
  index: number;
  fields: IndexPatternField[];
  onUpdate: (index: number, metric: MetricAggregation) => void;
  onRemove: (index: number) => void;
}
```

**Behavior:**
- Dropdown for aggregation type selection
- Field autocomplete (filtered by type based on selected aggregation)
- Custom label text input
- Remove button (disabled if only one metric exists)

### 5. BucketAggregationItem (`src/components/builder/bucket-aggregation-item.tsx`)

**Purpose:** Single bucket aggregation configuration with type-specific options.

**Props:**
```typescript
interface BucketAggregationItemProps {
  bucket: BucketAggregation;
  index: number;
  fields: IndexPatternField[];
  onUpdate: (index: number, bucket: BucketAggregation) => void;
  onRemove: (index: number) => void;
  onAddSubBucket: (parentIndex: number) => void;
}
```

**Conditional rendering based on bucket type:**
- **Terms:** field, size (number input, default 5), order (select: count asc/desc, term asc/desc)
- **Date Histogram:** date field, interval (select: auto/1s/1m/1h/1d/1w/1M/1y)
- **Histogram:** numeric field, interval (number input)
- **Range:** numeric field, range list (from/to pairs, add/remove)
- **Filters:** named filter list (label + filter condition, add/remove)

### 6. ChartRenderer (`src/components/builder/chart-renderer.tsx`)

**Purpose:** Renders the ECharts visualization based on chart type and data.

**Props:**
```typescript
interface ChartRendererProps {
  chartType: ChartType;
  data: ChartData | null;
  loading: boolean;
  error: string | null;
  height?: string;
}
```

**Chart Type → ECharts Mapping:**

| Chart Type | ECharts Series Type | X Axis | Y Axis |
|---|---|---|---|
| Line | line | category (buckets) | value (metrics) |
| Area | line (areaStyle) | category (buckets) | value (metrics) |
| Bar | bar | category (buckets) | value (metrics) |
| Bar Horizontal | bar | value (metrics) | category (buckets) |
| Pie | pie | — | — (data array) |
| Gauge | gauge | — | — (single value) |
| Goal | gauge (progress) | — | — (value vs target) |
| Metric | — (custom div) | — | — (large number) |
| Tag Cloud | wordCloud | — | — (word/value pairs) |
| Heat Map | heatmap | category X | category Y |
| Table | — (HTML table) | — | — (rows/columns) |
| List | — (HTML list) | — | — (items) |
| Region Map | map (geo) | — | — (region/value pairs) |
| Text | — (markdown) | — | — (rendered text) |

### 7. FilterPanel (`src/components/builder/filter-panel.tsx`)

**Purpose:** Right panel for defining query filters and time range.

**State managed via Visualization Store** — filters array.

### 8. SqlEditorPanel (`src/components/builder/sql-editor-panel.tsx`)

**Purpose:** Monaco editor for SQL query mode.

**Props:**
```typescript
interface SqlEditorPanelProps {
  value: string;
  onChange: (sql: string) => void;
  onRun: () => void;
}
```

## State Management

### Visualization Store (`src/store/visualization.ts`)

```typescript
interface VisualizationState {
  // Identity
  id: number | null;
  name: string;
  chartType: ChartType | null;
  
  // Data source
  indexPattern: { id: number; pattern: string } | null;
  fields: IndexPatternField[];
  
  // Aggregation config
  metrics: MetricAggregation[];
  buckets: BucketAggregation[];
  
  // Filters
  filters: ElasticFilter[];
  timeRange: { from: string; to: string };
  
  // Query mode
  queryMode: "dsl" | "sql";
  sqlQuery: string;
  
  // Preview state
  previewData: ChartData | null;
  previewLoading: boolean;
  previewError: string | null;
  
  // Metadata
  systemOwner: boolean;
  description: string;
  
  // Computed
  isValid: boolean;  // computed from: name + indexPattern + metrics.length > 0
  
  // Actions
  setName: (name: string) => void;
  setChartType: (type: ChartType) => void;
  setIndexPattern: (pattern: { id: number; pattern: string }) => void;
  setFields: (fields: IndexPatternField[]) => void;
  addMetric: () => void;
  updateMetric: (index: number, metric: MetricAggregation) => void;
  removeMetric: (index: number) => void;
  addBucket: () => void;
  updateBucket: (index: number, bucket: BucketAggregation) => void;
  removeBucket: (index: number) => void;
  addSubBucket: (parentIndex: number) => void;
  addFilter: (filter: ElasticFilter) => void;
  removeFilter: (index: number) => void;
  updateFilter: (index: number, filter: ElasticFilter) => void;
  setTimeRange: (from: string, to: string) => void;
  setQueryMode: (mode: "dsl" | "sql") => void;
  setSqlQuery: (sql: string) => void;
  setPreviewData: (data: ChartData | null) => void;
  setPreviewLoading: (loading: boolean) => void;
  setPreviewError: (error: string | null) => void;
  loadVisualization: (vis: SavedVisualization) => void;
  reset: () => void;
  toApiPayload: () => VisualizationPayload;
}
```

## Data Models

### Core Types (`src/types/visualization.ts`)

```typescript
// Field from an index pattern
interface IndexPatternField {
  name: string;
  type: FieldDataType;
  aggregatable: boolean;
  searchable: boolean;
}

type FieldDataType = "string" | "number" | "date" | "boolean" | "ip" | "geo_point" | "object";

// Metric aggregation config
interface MetricAggregation {
  id: string;  // uuid for React key
  type: MetricType;
  field: string | null;  // null for Count
  label: string;
  params?: Record<string, unknown>;  // e.g., percentiles values
}

type MetricType = "count" | "sum" | "avg" | "min" | "max" | "cardinality" | "percentiles" | "top_hits";

// Bucket aggregation config
interface BucketAggregation {
  id: string;  // uuid for React key
  type: BucketType;
  field: string | null;
  label: string;
  params: BucketParams;
  subBucket?: BucketAggregation;  // nested sub-bucket
}

type BucketType = "terms" | "date_histogram" | "histogram" | "range" | "filters";

type BucketParams = TermsParams | DateHistogramParams | HistogramParams | RangeParams | FiltersParams;

interface TermsParams { size: number; order: { field: string; direction: "asc" | "desc" } }
interface DateHistogramParams { interval: string }  // auto, 1s, 1m, 1h, 1d, 1w, 1M, 1y
interface HistogramParams { interval: number }
interface RangeParams { ranges: { from: number; to: number }[] }
interface FiltersParams { filters: { label: string; filter: ElasticFilter }[] }

// Chart data returned from /run endpoint
interface ChartData {
  series: ChartSeries[];
  categories?: string[];
  total?: number;
}

interface ChartSeries {
  name: string;
  data: (number | { name: string; value: number })[];
}

// API payload for save
interface VisualizationPayload {
  id?: number;
  name: string;
  chartType: string;
  chartConfig: string;  // JSON stringified ECharts options
  idPattern: number;
  filterType: ElasticFilter[];
  eventType: string;
  aggregationType: { metrics: MetricAggregation[]; buckets: BucketAggregation[] };
  description: string;
  queryLanguage: "elastic" | "sql";
  sqlQuery?: string;
  showTime: boolean;
}
```

## API Integration

### Visualization Service (`src/services/visualization.service.ts`)

```typescript
class VisualizationService {
  // CRUD
  async create(payload: VisualizationPayload): Promise<SavedVisualization>
  async update(payload: VisualizationPayload): Promise<SavedVisualization>
  async getById(id: number): Promise<SavedVisualization | null>
  async delete(id: number): Promise<void>
  
  // Execution
  async run(payload: VisualizationPayload, timeRange: { from: string; to: string }): Promise<ChartData>
  
  // Index patterns
  async getIndexPatterns(): Promise<IndexPattern[]>
  async getFieldsForPattern(patternId: number): Promise<IndexPatternField[]>
}
```

### API Endpoint Mapping

| Operation | Method | Endpoint | Body |
|---|---|---|---|
| List visualizations | GET | `/api/utm-visualizations` | — |
| Get by ID | GET | `/api/utm-visualizations/:id` | — |
| Create | POST | `/api/utm-visualizations` | VisualizationPayload |
| Update | PUT | `/api/utm-visualizations` | VisualizationPayload |
| Delete | DELETE | `/api/utm-visualizations/:id` | — |
| Run/Preview | POST | `/api/utm-visualizations/run` | VisualizationPayload + params |
| Index patterns | GET | `/api/utm-index-patterns?page=0&size=100` | — |
| Fields for pattern | GET | `/api/utm-index-patterns/:id/fields` | — |

## File Structure

```
src/
├── app/(app)/creator/visualizations/
│   ├── new/page.tsx                    # Chart type selector
│   └── builder/page.tsx                # Builder workspace
├── components/builder/
│   ├── chart-type-selector.tsx         # Chart type grid
│   ├── builder-workspace.tsx           # Three-panel layout
│   ├── builder-header.tsx              # Top bar (name, pattern, save)
│   ├── config-panel.tsx                # Left panel wrapper
│   ├── metric-aggregation-list.tsx     # Metrics section
│   ├── metric-aggregation-item.tsx     # Single metric config
│   ├── bucket-aggregation-list.tsx     # Buckets section
│   ├── bucket-aggregation-item.tsx     # Single bucket config
│   ├── field-autocomplete.tsx          # Searchable field selector
│   ├── chart-renderer.tsx              # ECharts wrapper
│   ├── chart-config-builder.ts         # Data → ECharts options mapper
│   ├── filter-panel.tsx                # Right panel
│   ├── filter-condition-item.tsx       # Single filter row
│   ├── time-range-filter.tsx           # Time range selector
│   ├── sql-editor-panel.tsx            # SQL mode editor
│   └── index-pattern-selector.tsx      # Pattern dropdown
├── store/
│   └── visualization.ts               # Zustand store
├── services/
│   └── visualization.service.ts        # API service
├── types/
│   └── visualization.ts               # All TypeScript types
└── lib/
    └── chart-theme.ts                  # ECharts dark theme config
```

## ECharts Integration

### Dark Theme (`src/lib/chart-theme.ts`)

Custom ECharts theme matching the UTMStack design system:
- Background: transparent (card provides background)
- Text color: `var(--text-secondary)` / `#94A3B8`
- Axis line: `var(--surface-border)` / `#2E3A4E`
- Color palette: `['#3B82F6', '#8B5CF6', '#06B6D4', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#F97316']`
- Grid: subtle, no strong lines
- Tooltip: dark background, rounded

### Chart Config Builder (`src/components/builder/chart-config-builder.ts`)

Pure function that transforms `ChartData` + `ChartType` into an ECharts `EChartsOption`:

```typescript
function buildChartOptions(
  chartType: ChartType,
  data: ChartData,
  metrics: MetricAggregation[],
  buckets: BucketAggregation[]
): EChartsOption
```

This isolates the mapping logic from React rendering, making it testable.

## Preview Execution Flow

1. User changes metric/bucket/filter → store updates
2. Store change triggers `useEffect` in `BuilderWorkspace` with 500ms debounce
3. Debounced callback calls `visualizationService.run()` with current store state
4. Store sets `previewLoading = true`
5. Response arrives → `chart-config-builder` transforms data → `ChartRenderer` re-renders
6. Error case → store sets `previewError` → `ChartRenderer` shows error state

## Responsive Design

- **≥1280px:** Three panels side-by-side (300px | flex | 280px)
- **768–1279px:** Config panel as collapsible overlay, filter panel hidden in drawer
- **<768px:** Stacked vertical with tab navigation (Config | Preview | Filters)

## Error Handling

- **API failures:** Toast notification + inline error message in preview area
- **Invalid config:** Disabled preview with validation message
- **No data:** "No data matches your query" placeholder with suggestion to adjust time range
- **Network offline:** Disabled save button with "No connection" indicator

## Performance Considerations

- **Debounced preview:** 500ms delay prevents excessive API calls during rapid editing
- **Lazy-loaded ECharts:** Import only needed chart modules per type
- **Memoized chart options:** Only recalculate when data or config changes
- **Virtual scrolling in field autocomplete:** For patterns with 500+ fields

## Requirements Traceability

| Requirement | Design Components |
|---|---|
| Req 1: Chart Type Selection | ChartTypeSelector, ChartType enum |
| Req 2: Builder Workspace Layout | BuilderWorkspace, CSS Grid layout |
| Req 3: Index Pattern Selection | IndexPatternSelector, VisualizationService.getIndexPatterns |
| Req 4: Metric Aggregation | MetricAggregationList/Item, MetricType enum |
| Req 5: Bucket Aggregation | BucketAggregationList/Item, BucketType enum, sub-bucket recursion |
| Req 6: Live Chart Preview | ChartRenderer, debounced preview flow, VisualizationService.run |
| Req 7: Field Autocomplete | FieldAutocomplete component, type filtering |
| Req 8: Filter Panel | FilterPanel, FilterConditionItem, TimeRangeFilter |
| Req 9: Save Visualization | BuilderHeader save button, VisualizationService.create/update |
| Req 10: Edit Existing | Builder page query params, VisualizationService.getById, store.loadVisualization |
| Req 11: State Management | Visualization Zustand store, reset on unmount |
| Req 12: Chart-Type-Specific Rendering | chart-config-builder.ts mapping function |
| Req 13: SQL Query Mode | SqlEditorPanel, queryMode toggle, queryLanguage field |

## Components and Interfaces

### Public Interfaces

#### VisualizationService (src/services/visualization.service.ts)

```typescript
interface IVisualizationService {
  create(payload: VisualizationPayload): Promise<SavedVisualization>;
  update(payload: VisualizationPayload): Promise<SavedVisualization>;
  getById(id: number): Promise<SavedVisualization | null>;
  delete(id: number): Promise<void>;
  run(payload: VisualizationPayload, timeRange: { from: string; to: string }): Promise<ChartData>;
  getIndexPatterns(): Promise<IndexPattern[]>;
  getFieldsForPattern(patternId: number): Promise<IndexPatternField[]>;
}
```

#### Visualization Store (src/store/visualization.ts)

```typescript
interface IVisualizationStore {
  // State accessors
  readonly id: number | null;
  readonly name: string;
  readonly chartType: ChartType | null;
  readonly indexPattern: { id: number; pattern: string } | null;
  readonly fields: IndexPatternField[];
  readonly metrics: MetricAggregation[];
  readonly buckets: BucketAggregation[];
  readonly filters: ElasticFilter[];
  readonly timeRange: { from: string; to: string };
  readonly queryMode: "dsl" | "sql";
  readonly sqlQuery: string;
  readonly previewData: ChartData | null;
  readonly previewLoading: boolean;
  readonly previewError: string | null;
  readonly isValid: boolean;

  // Mutators
  setName(name: string): void;
  setChartType(type: ChartType): void;
  setIndexPattern(pattern: { id: number; pattern: string }): void;
  setFields(fields: IndexPatternField[]): void;
  addMetric(): void;
  updateMetric(index: number, metric: MetricAggregation): void;
  removeMetric(index: number): void;
  addBucket(): void;
  updateBucket(index: number, bucket: BucketAggregation): void;
  removeBucket(index: number): void;
  addFilter(filter: ElasticFilter): void;
  removeFilter(index: number): void;
  setTimeRange(from: string, to: string): void;
  setQueryMode(mode: "dsl" | "sql"): void;
  setSqlQuery(sql: string): void;
  loadVisualization(vis: SavedVisualization): void;
  reset(): void;
  toApiPayload(): VisualizationPayload;
}
```

#### ChartConfigBuilder (src/components/builder/chart-config-builder.ts)

```typescript
interface IChartConfigBuilder {
  buildChartOptions(
    chartType: ChartType,
    data: ChartData,
    metrics: MetricAggregation[],
    buckets: BucketAggregation[]
  ): EChartsOption;
}
```

#### FieldAutocomplete Component

```typescript
interface FieldAutocompleteProps {
  fields: IndexPatternField[];
  value: string | null;
  onChange: (field: string) => void;
  filterByType?: FieldDataType[];
  placeholder?: string;
  disabled?: boolean;
}
```

#### ChartRenderer Component

```typescript
interface ChartRendererProps {
  chartType: ChartType;
  data: ChartData | null;
  loading: boolean;
  error: string | null;
  height?: string;
}
```

### Internal Component Interfaces

#### MetricAggregationItem

```typescript
interface MetricAggregationItemProps {
  metric: MetricAggregation;
  index: number;
  fields: IndexPatternField[];
  onUpdate: (index: number, metric: MetricAggregation) => void;
  onRemove: (index: number) => void;
}
```

#### BucketAggregationItem

```typescript
interface BucketAggregationItemProps {
  bucket: BucketAggregation;
  index: number;
  fields: IndexPatternField[];
  onUpdate: (index: number, bucket: BucketAggregation) => void;
  onRemove: (index: number) => void;
  onAddSubBucket: (parentIndex: number) => void;
}
```

#### FilterConditionItem

```typescript
interface FilterConditionItemProps {
  filter: ElasticFilter;
  index: number;
  fields: IndexPatternField[];
  onUpdate: (index: number, filter: ElasticFilter) => void;
  onRemove: (index: number) => void;
}
```

## Correctness Properties

### Property 1: Store Validity Invariant
`isValid` SHALL be `true` if and only if `name.trim().length > 0 AND indexPattern !== null AND metrics.length > 0`.

**Validates: Requirement 11.3**

### Property 2: Metric Field Constraint
When a MetricAggregation has type `sum | avg | min | max | percentiles`, the `field` property SHALL reference a field with `type === "number"` from the current `fields` array. When type is `count`, `field` SHALL be `null`.

**Validates: Requirements 4.3, 4.4**

### Property 3: Bucket Field Constraint
When a BucketAggregation has type `date_histogram`, the `field` property SHALL reference a field with `type === "date"`. When type is `histogram | range`, the field SHALL have `type === "number"`.

**Validates: Requirements 5.9, 5.10**

### Property 4: Preview Debounce Guarantee
The system SHALL NOT call the `/run` endpoint more than once per 500ms window regardless of how rapidly the user modifies configuration.

**Validates: Requirement 6.2**

### Property 5: Save Idempotency
Calling `toApiPayload()` multiple times with the same store state SHALL produce identical payloads.

**Validates: Requirements 9.3, 9.4**

### Property 6: Store Reset Guarantee
After `reset()` is called, all state properties SHALL return to their initial default values and `isValid` SHALL be `false`.

**Validates: Requirement 11.4**

### Property 7: Chart Config Determinism
Given identical `ChartType`, `ChartData`, `MetricAggregation[]`, and `BucketAggregation[]` inputs, `buildChartOptions` SHALL always produce the same `EChartsOption` output.

**Validates: Requirement 12**

## Testing Strategy

### Unit Tests

| Component/Module | Test Focus | Tool |
|---|---|---|
| `chart-config-builder.ts` | Input/output mapping for all 14 chart types, edge cases (empty data, single point, large datasets) | Jest |
| `visualization.ts` (store) | State transitions, computed `isValid`, `toApiPayload` serialization, `reset` behavior | Jest + Zustand testing |
| `visualization.service.ts` | API call formatting, error handling, response parsing | Jest + MSW (Mock Service Worker) |
| `FieldAutocomplete` | Filtering by type, search behavior, empty state | React Testing Library |
| `MetricAggregationItem` | Type-based field filtering, label updates, removal | React Testing Library |
| `BucketAggregationItem` | Type-specific option rendering, sub-bucket addition | React Testing Library |

### Integration Tests

| Scenario | Test Focus | Tool |
|---|---|---|
| Create new visualization (happy path) | Select type → configure → preview → save → redirect | Playwright |
| Edit existing visualization | Load → verify restored config → modify → save | Playwright |
| Field autocomplete interaction | Select pattern → verify fields load → type to filter → select field | React Testing Library |
| Live preview execution | Configure metric + bucket → verify /run called → verify chart renders | React Testing Library + MSW |
| SQL mode toggle | Switch to SQL → enter query → run → verify response renders | React Testing Library |

### E2E Tests

| Test | Description |
|---|---|
| Full creation flow | Navigate → select chart → name → select pattern → add metric → add bucket → see preview → save → verify in list |
| Edit flow | List → click edit → verify config loaded → change name → save → verify updated in list |
| Error resilience | Disconnect backend → attempt preview → verify error message → reconnect → retry succeeds |
