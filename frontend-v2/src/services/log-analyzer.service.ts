import { api } from "@/lib/api";

export interface ServerSavedQuery {
  id: number;
  name: string;
  description?: string; // stores raw KQL/lucene query string
  dataOrigin?: string;  // stores indexPattern
  creationDate?: string;
  modificationDate?: string;
  owner?: string;
}

export interface TopValuesResult {
  total: number;
  top: { value: string; count: number; percent: number }[];
}

export interface ChartViewResult {
  categories: string[];
  values: number[];
}

class LogAnalyzerService {
  async listQueries(page = 0, size = 100): Promise<ServerSavedQuery[]> {
    try {
      const { data } = await api.getWithHeaders<ServerSavedQuery[]>(
        `/api/log-analyzer/queries?page=${page}&size=${size}&sort=creationDate,desc`
      );
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  async saveQuery(name: string, query: string, indexPattern: string): Promise<ServerSavedQuery> {
    return api.post<ServerSavedQuery>("/api/log-analyzer/queries", {
      name,
      description: query,
      dataOrigin: indexPattern,
    });
  }

  async updateQuery(id: number, data: { name: string; query: string; indexPattern: string; owner?: string; creationDate?: string }): Promise<ServerSavedQuery> {
    return api.put<ServerSavedQuery>("/api/log-analyzer/queries", {
      id,
      name: data.name,
      description: data.query,
      dataOrigin: data.indexPattern,
      owner: data.owner,
      creationDate: data.creationDate,
    });
  }

  async deleteQuery(id: number): Promise<void> {
    await api.delete(`/api/log-analyzer/queries/${id}`);
  }

  async getTopValues(
    field: string,
    indexPattern: string,
    filters: { field: string; operator: string; value: unknown }[] = [],
    top = 10
  ): Promise<TopValuesResult> {
    const mappedFilters = filters.map((f) => ({ field: f.field, operator: f.operator, value: f.value }));

    const fetchField = async (f: string) => {
      const res = await api.post<ChartViewResult>("/api/log-analyzer/chart-view", {
        indexPattern,
        filters: mappedFilters,
        interval: "Hour",
        field: f,
        fieldDataType: "keyword",
        top,
      });
      return res && Array.isArray(res.categories) ? res : null;
    };

    try {
      let res = await fetchField(field);
      // OpenSearch text fields aggregate via their .keyword sub-field
      if ((!res || res.categories.length === 0) && !field.endsWith(".keyword")) {
        const fallback = await fetchField(`${field}.keyword`);
        if (fallback && fallback.categories.length > 0) res = fallback;
      }
      if (!res || res.categories.length === 0) return { total: 0, top: [] };
      const total = res.values.reduce((s, v) => s + v, 0);
      return {
        total,
        top: res.categories.map((cat, i) => ({
          value: cat,
          count: res.values[i] ?? 0,
          percent: total > 0 ? Math.round(((res.values[i] ?? 0) / total) * 1000) / 10 : 0,
        })),
      };
    } catch {
      return { total: 0, top: [] };
    }
  }

  async getDateHistogram(
    indexPattern: string,
    filters: { field: string; operator: string; value: unknown }[],
    interval: "hour" | "day" | "week" | "month" = "hour"
  ): Promise<ChartViewResult> {
    try {
      // CalendarInterval enum values are title-cased in the Java client
      const intervalMap: Record<string, string> = {
        hour: "Hour",
        day: "Day",
        week: "Week",
        month: "Month",
      };
      const res = await api.post<ChartViewResult>("/api/log-analyzer/chart-view", {
        indexPattern,
        filters: filters.map((f) => ({ field: f.field, operator: f.operator, value: f.value })),
        interval: intervalMap[interval] ?? "HOUR",
        field: "@timestamp",
        fieldDataType: "date",
        top: 0,
      });
      return res ?? { categories: [], values: [] };
    } catch {
      return { categories: [], values: [] };
    }
  }
}

export const logAnalyzerService = new LogAnalyzerService();
