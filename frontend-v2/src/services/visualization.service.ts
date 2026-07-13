import { api } from "@/lib/api";
import {
  VisualizationPayload,
  SavedVisualization,
  ChartData,
  ChartSeries,
  IndexPattern,
  IndexPatternField,
  ChartType,
} from "@/types/visualization-builder";

// ─── Backend response types (different per chart type) ───────────────────────

interface BackendBarResult {
  categories?: string[];
  series?: { name: string; metricId?: string; data: number[] }[];
}

interface BackendPieResult {
  metricId?: string;
  bucketKey?: string;
  value?: number;
  bucketId?: string;
}

interface BackendMetricResult {
  metricId?: string;
  value?: number;
  bucketKey?: string;
  bucketId?: string;
}

interface BackendTableResult {
  columns?: string[];
  rows?: { value: unknown; metric?: boolean }[][];
}

// ─── Response transformer ────────────────────────────────────────────────────

function transformRunResponse(
  rawResponse: unknown,
  chartType: string
): ChartData {
  // The backend returns List<?> — always an array
  const data = Array.isArray(rawResponse) ? rawResponse : [];

  if (data.length === 0) {
    return { series: [], categories: [], total: 0 };
  }

  // Determine format based on chart type and response shape
  const ct = chartType as ChartType;

  // Bar, Line, Area, HeatMap return [{categories, series}]
  if (
    ct === ChartType.LINE ||
    ct === ChartType.AREA ||
    ct === ChartType.BAR ||
    ct === ChartType.BAR_HORIZONTAL ||
    ct === ChartType.HEAT_MAP
  ) {
    return transformBarLikeResponse(data);
  }

  // Pie, Tag Cloud return [{bucketKey, value, ...}]
  if (ct === ChartType.PIE || ct === ChartType.TAG_CLOUD) {
    return transformPieResponse(data);
  }

  // Metric, Gauge, Goal return [{metricId, value, ...}]
  if (
    ct === ChartType.METRIC ||
    ct === ChartType.GAUGE ||
    ct === ChartType.GOAL
  ) {
    return transformMetricResponse(data);
  }

  // Table, List return [{columns, rows}]
  if (ct === ChartType.TABLE || ct === ChartType.LIST) {
    return transformTableResponse(data);
  }

  // Fallback: try to detect shape
  const first = data[0];
  if (first && "categories" in first && "series" in first) {
    return transformBarLikeResponse(data);
  }
  if (first && "columns" in first && "rows" in first) {
    return transformTableResponse(data);
  }
  if (first && "bucketKey" in first && "value" in first) {
    return transformPieResponse(data);
  }
  if (first && "value" in first) {
    return transformMetricResponse(data);
  }

  return { series: [], categories: [], total: 0 };
}

function transformBarLikeResponse(data: unknown[]): ChartData {
  // Backend wraps in a list with one item: [{categories, series}]
  const result = data[0] as BackendBarResult;
  if (!result || !result.series) {
    return { series: [], categories: [], total: 0 };
  }

  const series: ChartSeries[] = result.series.map((s) => ({
    name: s.name || "Value",
    data: s.data || [],
  }));

  return {
    categories: result.categories || [],
    series,
    total: series.reduce((sum: number, s) => {
      const seriesTotal = s.data.reduce((a: number, b) => a + (typeof b === "number" ? b : b.value), 0);
      return sum + seriesTotal;
    }, 0),
  };
}

function transformPieResponse(data: unknown[]): ChartData {
  // Backend returns [{bucketKey, value, metricId, bucketId}, ...]
  const items = data as BackendPieResult[];
  const pieData = items
    .filter((item) => item.bucketKey && item.value !== undefined)
    .map((item) => ({
      name: item.bucketKey!,
      value: item.value!,
    }));

  return {
    series: [{ name: "Value", data: pieData }],
    categories: pieData.map((d) => d.name),
    total: pieData.reduce((sum, d) => sum + d.value, 0),
  };
}

function transformMetricResponse(data: unknown[]): ChartData {
  // Backend returns [{metricId, value, bucketKey, bucketId}, ...]
  const items = data as BackendMetricResult[];
  const values = items
    .filter((item) => item.value !== undefined)
    .map((item) => item.value!);

  const total = values.length > 0 ? values[0] : 0;

  return {
    series: [{ name: "Metric", data: values.length > 0 ? values : [0] }],
    categories: items.map((item) => item.bucketKey || "").filter(Boolean),
    total,
  };
}

function transformTableResponse(data: unknown[]): ChartData {
  // Backend returns [{columns, rows}] where rows is [[{value, isMetric}]]
  const result = data[0] as BackendTableResult;
  if (!result || !result.columns || !result.rows) {
    return { series: [], categories: [], total: 0 };
  }

  const columns = result.columns;
  // Transform: each column becomes a series, categories are row indices
  const series: ChartSeries[] = columns.map((col, colIdx) => ({
    name: col,
    data: result.rows!.map((row) => {
      const cell = row[colIdx];
      if (!cell) return 0;
      const val = cell.value;
      if (typeof val === "number") return val;
      if (typeof val === "string") return { name: val, value: 0 } as { name: string; value: number };
      return 0;
    }) as (number | { name: string; value: number })[],
  }));

  return {
    series,
    categories: result.rows.map((_, idx) => String(idx + 1)),
    total: result.rows.length,
  };
}

class VisualizationService {
  // Map frontend filter operators to backend OperatorType enum values
  private operatorMap: Record<string, string> = {
    "is": "IS",
    "is not": "IS_NOT",
    "contains": "CONTAIN",
    "does not contain": "DOES_NOT_CONTAIN",
    "exists": "EXIST",
    "does not exist": "DOES_NOT_EXIST",
    "is between": "IS_BETWEEN",
    "is greater than": "IS_GREATER_THAN",
    "is less than": "IS_LESS_THAN_OR_EQUALS",
  };

  private mapFiltersToBackend(filters: { field: string; operator: string; value: unknown }[]): { field: string; operator: string; value: unknown }[] {
    return (filters || []).map((f) => ({
      field: f.field,
      operator: this.operatorMap[f.operator] || f.operator,
      value: f.value,
    }));
  }

  async create(
    payload: VisualizationPayload
  ): Promise<SavedVisualization> {
    return api.post<SavedVisualization>(
      "/api/ha-visualizations",
      { ...payload, filterType: this.mapFiltersToBackend(payload.filterType) }
    );
  }

  async update(
    payload: VisualizationPayload
  ): Promise<SavedVisualization | null> {
    try {
      return await api.put<SavedVisualization>(
        "/api/ha-visualizations",
        { ...payload, filterType: this.mapFiltersToBackend(payload.filterType) }
      );
    } catch (error) {
      console.error("Failed to update visualization:", error);
      return null;
    }
  }

  async getById(id: number): Promise<SavedVisualization | null> {
    try {
      return await api.get<SavedVisualization>(
        `/api/ha-visualizations/${id}`
      );
    } catch (error) {
      console.error("Failed to get visualization:", error);
      return null;
    }
  }

  async delete(id: number): Promise<void> {
    try {
      await api.delete(`/api/ha-visualizations/${id}`);
    } catch (error) {
      console.error("Failed to delete visualization:", error);
    }
  }

  async run(
    payload: VisualizationPayload,
    timeRange: { from: string; to: string }
  ): Promise<ChartData> {
    try {
      // Convert filters to backend format
      const backendFilters = this.mapFiltersToBackend(payload.filterType);

      // Add time range as a filter condition (IS_BETWEEN on @timestamp)
      const timeFilter = {
        field: "@timestamp",
        operator: "IS_BETWEEN",
        value: [timeRange.from, timeRange.to],
      };

      const payloadWithTime = {
        ...payload,
        filterType: [...backendFilters, timeFilter],
      };

      console.log("[VisualizationService] run payload:", JSON.stringify(payloadWithTime, null, 2));
      const rawResponse = await api.post<unknown>("/api/ha-visualizations/run", payloadWithTime);
      console.log("[VisualizationService] run response:", JSON.stringify(rawResponse, null, 2));
      return transformRunResponse(rawResponse, payload.chartType);
    } catch (error) {
      console.error("[VisualizationService] run error:", error);
      return { series: [], categories: [], total: 0 };
    }
  }

  async getIndexPatterns(): Promise<IndexPattern[]> {
    try {
      const response = await api.get<
        IndexPattern[] | { content: IndexPattern[] }
      >("/api/ha-index-patterns?page=0&size=100");

      if (Array.isArray(response)) {
        return response;
      }

      if (response && "content" in response) {
        return response.content;
      }

      return [];
    } catch (error) {
      console.error("Failed to get index patterns:", error);
      return [];
    }
  }

  async getFieldsForPattern(id: number): Promise<IndexPatternField[]> {
    try {
      return await api.get<IndexPatternField[]>(
        `/api/ha-index-patterns/${id}/fields`
      );
    } catch (error) {
      console.error("Failed to get fields for pattern:", error);
      return [];
    }
  }
}

export const visualizationService = new VisualizationService();
