// ─── Enums ───────────────────────────────────────────────────────────────────

export enum ChartType {
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

// ─── String Literal Union Types ──────────────────────────────────────────────

export type MetricType =
  | "count"
  | "sum"
  | "avg"
  | "min"
  | "max"
  | "cardinality"
  | "percentiles"
  | "top_hits";

export type BucketType =
  | "terms"
  | "date_histogram"
  | "histogram"
  | "range"
  | "filters";

export type FieldDataType =
  | "string"
  | "number"
  | "date"
  | "boolean"
  | "ip"
  | "geo_point"
  | "object";

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface IndexPatternField {
  name: string;
  type: FieldDataType;
  aggregatable: boolean;
  searchable: boolean;
}

export interface MetricAggregation {
  id: string;
  type: MetricType;
  field: string | null;
  label: string;
  params?: Record<string, unknown>;
}

export interface BucketAggregation {
  id: string;
  type: BucketType;
  field: string | null;
  label: string;
  params: BucketParams;
  subBucket?: BucketAggregation;
}

// ─── Bucket Params ───────────────────────────────────────────────────────────

export interface TermsParams {
  size: number;
  order: { field: string; direction: "asc" | "desc" };
}

export interface DateHistogramParams {
  interval: string; // auto | 1s | 1m | 1h | 1d | 1w | 1M | 1y
}

export interface HistogramParams {
  interval: number;
}

export interface RangeParams {
  ranges: { from: number; to: number }[];
}

export interface FiltersParams {
  filters: { label: string; filter: ElasticFilter }[];
}

export type BucketParams =
  | TermsParams
  | DateHistogramParams
  | HistogramParams
  | RangeParams
  | FiltersParams;

// ─── Filter ──────────────────────────────────────────────────────────────────

export interface ElasticFilter {
  field: string;
  operator: string;
  value: unknown;
}

// ─── Chart Data ──────────────────────────────────────────────────────────────

export interface ChartSeries {
  name: string;
  data: (number | { name: string; value: number })[];
}

export interface ChartData {
  series: ChartSeries[];
  categories?: string[];
  total?: number;
}

// ─── API Payload Types ───────────────────────────────────────────────────────

// Backend-compatible metric format
export interface BackendMetric {
  id: string;
  aggregation: string; // COUNT | AVERAGE | MAX | MIN | MEDIAN | SUM
  field?: string | null;
  customLabel?: string;
}

// Backend-compatible bucket format
export interface BackendBucket {
  id: string;
  aggregation: string; // TERMS | RANGE | DATE_HISTOGRAM | DATE_RANGE | FILTERS
  type: string; // AXIS | BUCKET (uppercase enum)
  field?: string | null;
  customLabel?: string;
  subBucket?: BackendBucket | null;
  terms?: { sortBy: string; asc: boolean; size: number } | null;
  dateHistogram?: { interval: string } | null;
  ranges?: { from: number; to: number }[] | null;
}

// Backend-compatible aggregation type
export interface BackendAggregationType {
  metrics: BackendMetric[];
  bucket?: BackendBucket | null;
}

export interface VisualizationPayload {
  id?: number;
  name: string;
  chartType: string;
  chartConfig: string;
  idPattern: number;
  pattern: { id: number; pattern: string } | null;
  filterType: ElasticFilter[];
  eventType: string;
  aggregationType: BackendAggregationType;
  description: string;
  queryLanguage: string;
  sqlQuery?: string;
  showTime?: boolean;
}

export interface SavedVisualization {
  id: number;
  name: string;
  chartType: string;
  chartConfig: string;
  idPattern: number;
  filterType: ElasticFilter[];
  eventType: string;
  aggregationType: BackendAggregationType;
  description: string;
  queryLanguage: string;
  sqlQuery?: string;
  showTime?: boolean;
  systemOwner: boolean;
  createdDate?: string;
  modifiedDate?: string;
}

export interface IndexPattern {
  id: number;
  pattern: string;
  name?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

export const CHART_TYPE_CONFIG: {
  id: string;
  name: string;
  icon: string;
  description: string;
}[] = [
  { id: ChartType.LINE, name: "Line", icon: "TrendingUp", description: "Display trends over time" },
  { id: ChartType.AREA, name: "Area", icon: "AreaChart", description: "Show volume changes over time" },
  { id: ChartType.BAR, name: "Bar", icon: "BarChart3", description: "Compare values across categories" },
  { id: ChartType.BAR_HORIZONTAL, name: "Bar Horizontal", icon: "BarChartHorizontal", description: "Horizontal comparison of categories" },
  { id: ChartType.PIE, name: "Pie", icon: "PieChart", description: "Show proportions of a whole" },
  { id: ChartType.TAG_CLOUD, name: "Tag Cloud", icon: "Cloud", description: "Visualize term frequency as sized text" },
  { id: ChartType.TABLE, name: "Table", icon: "Table", description: "Display raw data in rows and columns" },
  { id: ChartType.LIST, name: "List", icon: "List", description: "Show ranked items in order" },
  { id: ChartType.GAUGE, name: "Gauge", icon: "Gauge", description: "Display a value on a gauge dial" },
  { id: ChartType.GOAL, name: "Goal", icon: "Target", description: "Track progress toward a target" },
  { id: ChartType.METRIC, name: "Metric", icon: "Hash", description: "Show a single numeric value" },
  { id: ChartType.REGION_MAP, name: "Region Map", icon: "Map", description: "Color regions by metric value" },
  { id: ChartType.HEAT_MAP, name: "Heat Map", icon: "Grid3x3", description: "Show intensity across two dimensions" },
  { id: ChartType.TEXT, name: "Text", icon: "Type", description: "Display formatted text or markdown" },
];

// ─── Helper Functions ────────────────────────────────────────────────────────

export function getMetricRequiresField(type: MetricType): boolean {
  return type !== "count";
}

export function getFieldTypesForMetric(type: MetricType): FieldDataType[] {
  switch (type) {
    case "count":
      return [];
    case "sum":
    case "avg":
    case "min":
    case "max":
    case "percentiles":
      return ["number"];
    case "cardinality":
    case "top_hits":
      return ["string", "number", "date", "boolean", "ip", "geo_point", "object"];
    default:
      return [];
  }
}

export function getFieldTypesForBucket(type: BucketType): FieldDataType[] {
  switch (type) {
    case "terms":
      return ["string", "number", "date", "boolean", "ip", "geo_point", "object"];
    case "date_histogram":
      return ["date"];
    case "histogram":
    case "range":
      return ["number"];
    case "filters":
      return [];
    default:
      return [];
  }
}
