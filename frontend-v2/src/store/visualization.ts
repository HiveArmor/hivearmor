import { create } from "zustand";
import {
  ChartType,
  MetricAggregation,
  BucketAggregation,
  BucketParams,
  ElasticFilter,
  IndexPatternField,
  ChartData,
  VisualizationPayload,
  SavedVisualization,
  TermsParams,
} from "@/types/visualization-builder";

// ─── State Interface ─────────────────────────────────────────────────────────

interface VisualizationState {
  // Core state
  id: number | null;
  name: string;
  chartType: ChartType;
  indexPattern: { id: number; pattern: string } | null;
  fields: IndexPatternField[];
  metrics: MetricAggregation[];
  buckets: BucketAggregation[];
  filters: ElasticFilter[];
  timeRange: { from: string; to: string };
  queryMode: "dsl" | "sql";
  sqlQuery: string;
  previewData: ChartData | null;
  previewLoading: boolean;
  previewError: string | null;
  description: string;
  systemOwner: boolean;

  // Computed
  isValid: boolean;

  // Actions
  setName: (name: string) => void;
  setChartType: (chartType: ChartType) => void;
  setIndexPattern: (indexPattern: { id: number; pattern: string } | null) => void;
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
  setTimeRange: (timeRange: { from: string; to: string }) => void;
  setQueryMode: (mode: "dsl" | "sql") => void;
  setSqlQuery: (query: string) => void;
  setPreviewData: (data: ChartData | null) => void;
  setPreviewLoading: (loading: boolean) => void;
  setPreviewError: (error: string | null) => void;
  loadVisualization: (vis: SavedVisualization) => void;
  reset: () => void;
  toApiPayload: () => VisualizationPayload;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createDefaultMetric(): MetricAggregation {
  return {
    id: crypto.randomUUID(),
    type: "count",
    field: null,
    label: "Count",
  };
}

function createDefaultBucket(): BucketAggregation {
  return {
    id: crypto.randomUUID(),
    type: "terms",
    field: null,
    label: "Terms",
    params: { size: 5, order: { field: "_count", direction: "desc" } } as TermsParams,
  };
}

function computeIsValid(
  name: string,
  indexPattern: { id: number; pattern: string } | null,
  metrics: MetricAggregation[]
): boolean {
  return name.trim().length > 0 && indexPattern !== null && metrics.length > 0;
}

// ─── Initial State ───────────────────────────────────────────────────────────

const initialMetrics: MetricAggregation[] = [createDefaultMetric()];

const initialState = {
  id: null as number | null,
  name: "",
  chartType: ChartType.LINE,
  indexPattern: null as { id: number; pattern: string } | null,
  fields: [] as IndexPatternField[],
  metrics: initialMetrics,
  buckets: [] as BucketAggregation[],
  filters: [] as ElasticFilter[],
  timeRange: { from: "now-24h", to: "now" },
  queryMode: "dsl" as "dsl" | "sql",
  sqlQuery: "",
  previewData: null as ChartData | null,
  previewLoading: false,
  previewError: null as string | null,
  description: "",
  systemOwner: false,
  isValid: false,
};

// ─── Store ───────────────────────────────────────────────────────────────────

export const useVisualizationStore = create<VisualizationState>((set, get) => ({
  ...initialState,

  setName: (name: string) => {
    const state = get();
    set({ name, isValid: computeIsValid(name, state.indexPattern, state.metrics) });
  },

  setChartType: (chartType: ChartType) => {
    set({ chartType });
  },

  setIndexPattern: (indexPattern: { id: number; pattern: string } | null) => {
    const state = get();
    set({
      indexPattern,
      isValid: computeIsValid(state.name, indexPattern, state.metrics),
    });
  },

  setFields: (fields: IndexPatternField[]) => {
    set({ fields });
  },

  addMetric: () => {
    const state = get();
    const metrics = [...state.metrics, createDefaultMetric()];
    set({ metrics, isValid: computeIsValid(state.name, state.indexPattern, metrics) });
  },

  updateMetric: (index: number, metric: MetricAggregation) => {
    const state = get();
    const metrics = [...state.metrics];
    metrics[index] = metric;
    set({ metrics });
  },

  removeMetric: (index: number) => {
    const state = get();
    // Enforce minimum 1 metric
    if (state.metrics.length <= 1) return;
    const metrics = state.metrics.filter((_, i) => i !== index);
    set({ metrics, isValid: computeIsValid(state.name, state.indexPattern, metrics) });
  },

  addBucket: () => {
    const state = get();
    const buckets = [...state.buckets, createDefaultBucket()];
    set({ buckets });
  },

  updateBucket: (index: number, bucket: BucketAggregation) => {
    const state = get();
    const buckets = [...state.buckets];
    buckets[index] = bucket;
    set({ buckets });
  },

  removeBucket: (index: number) => {
    const state = get();
    const buckets = state.buckets.filter((_, i) => i !== index);
    set({ buckets });
  },

  addSubBucket: (parentIndex: number) => {
    const state = get();
    const buckets = [...state.buckets];
    const parent = { ...buckets[parentIndex] };
    parent.subBucket = createDefaultBucket();
    buckets[parentIndex] = parent;
    set({ buckets });
  },

  addFilter: (filter: ElasticFilter) => {
    const state = get();
    const filters = [...state.filters, filter];
    set({ filters });
  },

  removeFilter: (index: number) => {
    const state = get();
    const filters = state.filters.filter((_, i) => i !== index);
    set({ filters });
  },

  updateFilter: (index: number, filter: ElasticFilter) => {
    const state = get();
    const filters = [...state.filters];
    filters[index] = filter;
    set({ filters });
  },

  setTimeRange: (timeRange: { from: string; to: string }) => {
    set({ timeRange });
  },

  setQueryMode: (mode: "dsl" | "sql") => {
    set({ queryMode: mode });
  },

  setSqlQuery: (query: string) => {
    set({ sqlQuery: query });
  },

  setPreviewData: (data: ChartData | null) => {
    set({ previewData: data });
  },

  setPreviewLoading: (loading: boolean) => {
    set({ previewLoading: loading });
  },

  setPreviewError: (error: string | null) => {
    set({ previewError: error });
  },

  loadVisualization: (vis: SavedVisualization) => {
    // Map backend metric aggregation names back to frontend types
    const metricReverseMap: Record<string, MetricAggregation["type"]> = {
      COUNT: "count",
      SUM: "sum",
      AVERAGE: "avg",
      MIN: "min",
      MAX: "max",
      MEDIAN: "percentiles",
    };

    // Map backend bucket aggregation names back to frontend types
    const bucketReverseMap: Record<string, BucketAggregation["type"]> = {
      TERMS: "terms",
      DATE_HISTOGRAM: "date_histogram",
      RANGE: "range",
      DATE_RANGE: "date_histogram",
      FILTERS: "filters",
    };

    // Map backend chart type to frontend
    const chartTypeReverseMap: Record<string, ChartType> = {
      LINE_CHART: ChartType.LINE,
      AREA_CHART: ChartType.AREA,
      VERTICAL_BAR_CHART: ChartType.BAR,
      HORIZONTAL_BAR_CHART: ChartType.BAR_HORIZONTAL,
      PIE_CHART: ChartType.PIE,
      TAG_CLOUD_CHART: ChartType.TAG_CLOUD,
      TABLE_CHART: ChartType.TABLE,
      LIST_CHART: ChartType.LIST,
      GAUGE_CHART: ChartType.GAUGE,
      GOAL_CHART: ChartType.GOAL,
      METRIC_CHART: ChartType.METRIC,
      COORDINATE_MAP_CHART: ChartType.REGION_MAP,
      HEATMAP_CHART: ChartType.HEAT_MAP,
      TEXT_CHART: ChartType.TEXT,
    };

    // Convert backend metrics to frontend format
    const convertMetrics = (): MetricAggregation[] => {
      const backendMetrics = vis.aggregationType?.metrics;
      if (!backendMetrics || backendMetrics.length === 0) return [createDefaultMetric()];

      return backendMetrics.map((m) => ({
        id: m.id || crypto.randomUUID(),
        type: metricReverseMap[(m as { aggregation?: string }).aggregation ?? ""] || "count",
        field: (m as { field?: string }).field || null,
        label: (m as { customLabel?: string }).customLabel || metricReverseMap[(m as { aggregation?: string }).aggregation ?? ""] || "Count",
      }));
    };

    // Convert backend bucket chain to frontend array
    const convertBuckets = (): BucketAggregation[] => {
      const backendBucket = (vis.aggregationType as { bucket?: Record<string, unknown> })?.bucket;
      if (!backendBucket) return [];

      const result: BucketAggregation[] = [];
      let current: Record<string, unknown> | null | undefined = backendBucket;

      while (current) {
        const bucketType = bucketReverseMap[(current.aggregation as string) ?? ""] || "terms";
        let params: BucketParams = { size: 5, order: { field: "_count", direction: "desc" } } as TermsParams;

        if (bucketType === "terms" && current.terms) {
          const t = current.terms as { sortBy: string; asc: boolean; size: number };
          params = { size: t.size || 5, order: { field: t.sortBy || "_count", direction: t.asc ? "asc" : "desc" } } as TermsParams;
        } else if (bucketType === "date_histogram" && current.dateHistogram) {
          const d = current.dateHistogram as { interval: string };
          params = { interval: d.interval || "1d" };
        } else if (bucketType === "range" && current.ranges) {
          params = { ranges: current.ranges as { from: number; to: number }[] };
        }

        result.push({
          id: (current.id as string) || crypto.randomUUID(),
          type: bucketType,
          field: (current.field as string) || null,
          label: (current.customLabel as string) || bucketType,
          params,
        });

        current = current.subBucket as Record<string, unknown> | null | undefined;
      }

      return result;
    };

    const metrics = convertMetrics();
    const buckets = convertBuckets();
    const name = vis.name ?? "";
    const chartType = chartTypeReverseMap[vis.chartType] || (vis.chartType as ChartType) || ChartType.LINE;
    const indexPattern = vis.idPattern
      ? { id: vis.idPattern, pattern: vis.eventType ?? "" }
      : null;

    set({
      id: vis.id,
      name,
      chartType,
      indexPattern,
      metrics,
      buckets,
      filters: vis.filterType ?? [],
      queryMode: (vis.queryLanguage === "sql" || vis.queryLanguage === "SQL") ? "sql" : "dsl",
      sqlQuery: vis.sqlQuery ?? "",
      description: vis.description ?? "",
      systemOwner: vis.systemOwner ?? false,
      isValid: computeIsValid(name, indexPattern, metrics),
    });
  },

  reset: () => {
    const freshMetrics = [createDefaultMetric()];
    set({
      id: null,
      name: "",
      chartType: ChartType.LINE,
      indexPattern: null,
      fields: [],
      metrics: freshMetrics,
      buckets: [],
      filters: [],
      timeRange: { from: "now-24h", to: "now" },
      queryMode: "dsl",
      sqlQuery: "",
      previewData: null,
      previewLoading: false,
      previewError: null,
      description: "",
      systemOwner: false,
      isValid: false,
    });
  },

  toApiPayload: (): VisualizationPayload => {
    const state = get();

    // Map frontend metric types to backend enum values
    const metricTypeMap: Record<string, string> = {
      count: "COUNT",
      sum: "SUM",
      avg: "AVERAGE",
      min: "MIN",
      max: "MAX",
      cardinality: "COUNT", // closest match
      percentiles: "MEDIAN",
      top_hits: "COUNT",
    };

    // Map frontend bucket types to backend enum values
    const bucketAggMap: Record<string, string> = {
      terms: "TERMS",
      date_histogram: "DATE_HISTOGRAM",
      histogram: "RANGE", // closest match
      range: "RANGE",
      filters: "FILTERS",
    };

    // Map frontend chart type to backend enum value
    const chartTypeMap: Record<string, string> = {
      line_chart: "LINE_CHART",
      area_chart: "AREA_CHART",
      bar_chart: "VERTICAL_BAR_CHART",
      bar_horizontal_chart: "HORIZONTAL_BAR_CHART",
      pie_chart: "PIE_CHART",
      tag_cloud_chart: "TAG_CLOUD_CHART",
      table_chart: "TABLE_CHART",
      list_chart: "LIST_CHART",
      gauge_chart: "GAUGE_CHART",
      goal_chart: "GOAL_CHART",
      metric_chart: "METRIC_CHART",
      region_map_chart: "COORDINATE_MAP_CHART",
      heat_map_chart: "HEATMAP_CHART",
      text_chart: "TEXT_CHART",
    };

    // Convert frontend metrics to backend format
    const backendMetrics = state.metrics.map((m) => ({
      id: m.id,
      aggregation: metricTypeMap[m.type] || "COUNT",
      field: m.field || undefined,
      customLabel: m.label || undefined,
    }));

    // Convert frontend buckets to backend format (nested single bucket)
    interface ConvertedBucket {
      id: string;
      aggregation: string;
      type: string;
      field?: string | null;
      customLabel?: string;
      subBucket?: ConvertedBucket | null;
      terms?: { sortBy: string; asc: boolean; size: number } | null;
      dateHistogram?: { interval: string } | null;
      ranges?: { from: number; to: number }[] | null;
    }

    const convertBucket = (b: typeof state.buckets[0]): ConvertedBucket => {
      const isAxis = b.type === "date_histogram";
      const result: ConvertedBucket = {
        id: b.id,
        aggregation: bucketAggMap[b.type] || "TERMS",
        type: isAxis ? "AXIS" : "BUCKET",
        field: b.field || undefined,
        customLabel: b.label || undefined,
        subBucket: b.subBucket ? convertBucket(b.subBucket) : null,
        terms: null,
        dateHistogram: null,
        ranges: null,
      };

      if (b.type === "terms" && b.params && "size" in b.params) {
        const p = b.params as { size: number; order: { field: string; direction: string } };
        result.terms = {
          sortBy: p.order?.field || "_count",
          asc: p.order?.direction === "asc",
          size: p.size || 5,
        };
      }

      if (b.type === "date_histogram" && b.params && "interval" in b.params) {
        const p = b.params as { interval: string };
        result.dateHistogram = { interval: p.interval || "1d" };
      }

      if (b.type === "range" && b.params && "ranges" in b.params) {
        const p = b.params as { ranges: { from: number; to: number }[] };
        result.ranges = p.ranges || [];
      }

      return result;
    };

    // Build nested bucket chain (first bucket, rest become subBuckets)
    let backendBucket: ConvertedBucket | null = null;
    if (state.buckets.length > 0) {
      backendBucket = convertBucket(state.buckets[0]);
      // Chain remaining buckets as sub-buckets
      let current = backendBucket;
      for (let i = 1; i < state.buckets.length; i++) {
        const sub = convertBucket(state.buckets[i]);
        current.subBucket = sub;
        current = sub;
      }
    }

    return {
      ...(state.id != null ? { id: state.id } : {}),
      name: state.name,
      chartType: chartTypeMap[state.chartType] || "LINE_CHART",
      chartConfig: "",
      idPattern: state.indexPattern?.id ?? 0,
      pattern: state.indexPattern
        ? { id: state.indexPattern.id, pattern: state.indexPattern.pattern }
        : null,
      filterType: state.filters,
      eventType: state.indexPattern?.pattern ?? "",
      aggregationType: {
        metrics: backendMetrics,
        bucket: backendBucket,
      },
      description: state.description,
      queryLanguage: state.queryMode === "sql" ? "SQL" : "DSL",
      ...(state.queryMode === "sql" ? { sqlQuery: state.sqlQuery } : {}),
    };
  },
}));
