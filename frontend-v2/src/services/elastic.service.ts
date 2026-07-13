import { api } from "@/lib/api";

export interface ElasticFilter {
  field: string;
  operator: string;
  value: unknown;
}

export interface SearchParams {
  page: number;
  size: number;
  indexPattern?: string;
  filters?: ElasticFilter[];
  sort?: string;
  timeRange?: { from: string; to: string };
}

export interface SearchResult {
  body: Record<string, unknown>[];
  total: number;
  took: number;
}

export interface IndexPattern {
  id: number;
  pattern: string;
  name?: string;
}

export interface FieldAggResult {
  [key: string]: number;
}

export interface IndexField {
  name: string;
  type: string;
}

// Resolve a relative range key ("24h", "7d", …) to ISO timestamps
function resolveRelativeRange(rel: string): { from: string; to: string } {
  const now = Date.now();
  const units: Record<string, number> = {
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  const match = rel.match(/^(\d+)([mhd])$/);
  if (!match) return { from: new Date(0).toISOString(), to: new Date(now).toISOString() };
  const ms = parseInt(match[1], 10) * (units[match[2]] ?? 0);
  return {
    from: new Date(now - ms).toISOString(),
    to: new Date(now).toISOString(),
  };
}

class ElasticService {
  async search(params: SearchParams): Promise<SearchResult> {
    try {
      const {
        page,
        size,
        indexPattern = "_v3_hive_*",
        filters: extraFilters = [],
        sort = "@timestamp,desc",
        timeRange,
      } = params;

      const filters: ElasticFilter[] = [...extraFilters];

      if (timeRange) {
        filters.push({ field: "@timestamp", operator: "IS_BETWEEN", value: [timeRange.from, timeRange.to] });
      }

      const sortEncoded = encodeURIComponent(sort);
      const url = `/api/elasticsearch/search?top=${size}&indexPattern=${encodeURIComponent(indexPattern)}&sort=${sortEncoded}&page=${page}&size=${size}`;

      const reqHeaders: Record<string, string> = {
        "Content-Type": "application/json",
      };
      const token = api.getToken();
      if (token) reqHeaders["Authorization"] = `Bearer ${token}`;

      const started = Date.now();
      const res = await fetch(url, {
        method: "POST",
        headers: reqHeaders,
        body: JSON.stringify(filters),
      });

      if (!res.ok) return { body: [], total: 0, took: 0 };

      const xTotal = res.headers.get("X-Total-Count");
      const docs = (await res.json()) as Record<string, unknown>[];
      const body = Array.isArray(docs) ? docs : [];

      return {
        body,
        total: xTotal !== null ? parseInt(xTotal, 10) : body.length,
        took: Date.now() - started,
      };
    } catch {
      return { body: [], total: 0, took: 0 };
    }
  }

  async getIndexPatterns(): Promise<IndexPattern[]> {
    try {
      return (await api.get<IndexPattern[]>("/api/ha-index-patterns?page=0&size=100")) || [];
    } catch {
      return [];
    }
  }

  async getIndexFields(indexPattern: string): Promise<IndexField[]> {
    try {
      const res = await api.get<IndexField[]>(
        `/api/elasticsearch/index/properties?indexPattern=${encodeURIComponent(indexPattern)}`
      );
      return Array.isArray(res) ? res : [];
    } catch {
      return [];
    }
  }

  async getFieldValues(field: string, indexPattern: string, top = 10): Promise<FieldAggResult> {
    try {
      const res = await api.post<FieldAggResult>("/api/elasticsearch/field-values", {
        field,
        index: indexPattern,
        top,
        filters: [],
      });
      return res || {};
    } catch {
      return {};
    }
  }

  resolveRange(timeRange: { type: "relative" | "absolute"; relative?: string; from?: string; to?: string }): { from: string; to: string } | null {
    if (timeRange.type === "relative" && timeRange.relative) {
      return resolveRelativeRange(timeRange.relative);
    }
    if (timeRange.type === "absolute" && timeRange.from && timeRange.to) {
      return { from: timeRange.from, to: timeRange.to };
    }
    return null;
  }
}

export const elasticService = new ElasticService();
