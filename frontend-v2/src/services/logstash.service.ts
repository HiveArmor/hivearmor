import { api } from "@/lib/api";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface LogstashFilterGroup {
  id?: number;
  groupName: string;
  groupDescription?: string;
  systemOwner?: boolean;
}

export interface LogstashFilter {
  id?: number;
  filterName?: string;
  logstashFilter: string;
  filterGroupId?: number;
  group?: LogstashFilterGroup;
  systemOwner?: boolean;
  isActive?: boolean;
  moduleName?: string;
  filterVersion?: string;
  updatedAt?: string;
}

export interface LogstashPipelineDTO {
  id: number;
  pipelineId: string;
  pipelineName: string;
  pipelineStatus: string;
  moduleName?: string;
  systemOwner?: boolean;
  pipelineDescription?: string;
  pipelineInternal?: boolean;
}

export interface LogstashPipelineVM {
  pipeline: LogstashPipelineDTO;
  filters: unknown[];
}

export interface PipelineStats {
  general?: {
    host: string;
    version: string;
    status: string;
    pipeline?: { workers: number; batchSize: number; batchDelay: number };
    jvm?: {
      threads: { count: number; peakCount: number };
      mem: {
        heapUsedPercent: number;
        heapUsedInBytes: number;
        heapMaxInBytes: number;
      };
      uptimeInMillis: number;
    };
  };
  pipelines?: LogstashPipelineDTO[];
}

function authHeaders(): Record<string, string> {
  const token = api.getToken();
  const h: Record<string, string> = {};
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

// ─── Service ───────────────────────────────────────────────────────────────────

class LogstashService {
  // ── Pipelines ──────────────────────────────────────────────────────────────

  async listPipelines(page = 0, size = 50): Promise<{ content: LogstashPipelineDTO[]; total: number }> {
    try {
      const res = await fetch(`/api/logstash-pipelines?page=${page}&size=${size}&sort=id,asc`, {
        headers: authHeaders(),
      });
      const total = parseInt(res.headers.get("X-Total-Count") ?? "0", 10);
      const data = (await res.json()) as LogstashPipelineDTO[];
      return { content: Array.isArray(data) ? data : [], total };
    } catch {
      return { content: [], total: 0 };
    }
  }

  async getPipeline(id: number): Promise<LogstashPipelineVM | null> {
    try {
      return await api.get<LogstashPipelineVM>(`/api/logstash-pipelines/${id}`);
    } catch {
      return null;
    }
  }

  async getPipelineStats(): Promise<PipelineStats | null> {
    try {
      return await api.get<PipelineStats>("/api/logstash-pipelines/stats");
    } catch {
      return null;
    }
  }

  async deletePipeline(id: number): Promise<boolean> {
    try {
      await api.delete(`/api/logstash-pipelines/${id}`);
      return true;
    } catch {
      return false;
    }
  }

  // ── Filter Groups ──────────────────────────────────────────────────────────

  async listFilterGroups(page = 0, size = 100): Promise<{ content: LogstashFilterGroup[]; total: number }> {
    try {
      const res = await fetch(`/api/ha-logstash-filter-groups?page=${page}&size=${size}&sort=id,asc`, {
        headers: authHeaders(),
      });
      const total = parseInt(res.headers.get("X-Total-Count") ?? "0", 10);
      const data = (await res.json()) as LogstashFilterGroup[];
      return { content: Array.isArray(data) ? data : [], total };
    } catch {
      return { content: [], total: 0 };
    }
  }

  async createFilterGroup(group: Omit<LogstashFilterGroup, "id">): Promise<LogstashFilterGroup | null> {
    try {
      return await api.post<LogstashFilterGroup>("/api/ha-logstash-filter-groups", group);
    } catch {
      return null;
    }
  }

  async updateFilterGroup(group: LogstashFilterGroup): Promise<LogstashFilterGroup | null> {
    try {
      return await api.put<LogstashFilterGroup>("/api/ha-logstash-filter-groups", group);
    } catch {
      return null;
    }
  }

  async deleteFilterGroup(id: number): Promise<boolean> {
    try {
      await api.delete(`/api/ha-logstash-filter-groups/${id}`);
      return true;
    } catch {
      return false;
    }
  }

  // ── Filters ────────────────────────────────────────────────────────────────

  async listFilters(page = 0, size = 100): Promise<{ content: LogstashFilter[]; total: number }> {
    try {
      const res = await fetch(`/api/ha-filters?page=${page}&size=${size}&sort=id,asc`, {
        headers: authHeaders(),
      });
      const total = parseInt(res.headers.get("X-Total-Count") ?? "0", 10);
      const data = (await res.json()) as LogstashFilter[];
      return { content: Array.isArray(data) ? data : [], total };
    } catch {
      return { content: [], total: 0 };
    }
  }

  async listFiltersByPipeline(pipelineId: number): Promise<LogstashFilter[]> {
    try {
      const res = await fetch(`/api/ha-filters/by-pipelineid?pipelineId=${pipelineId}`, {
        headers: authHeaders(),
      });
      const data = (await res.json()) as LogstashFilter[];
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  async getFilter(id: number): Promise<LogstashFilter | null> {
    try {
      return await api.get<LogstashFilter>(`/api/ha-filters/${id}`);
    } catch {
      return null;
    }
  }

  async createFilter(filter: Omit<LogstashFilter, "id">, pipelineId?: number): Promise<LogstashFilter | null> {
    try {
      const url = pipelineId != null ? `/api/ha-filters?pipelineId=${pipelineId}` : "/api/ha-filters";
      return await api.post<LogstashFilter>(url, filter);
    } catch {
      return null;
    }
  }

  async updateFilter(filter: LogstashFilter): Promise<LogstashFilter | null> {
    try {
      return await api.put<LogstashFilter>("/api/ha-filters", filter);
    } catch {
      return null;
    }
  }

  async deleteFilter(id: number): Promise<boolean> {
    try {
      await api.delete(`/api/ha-filters/${id}`);
      return true;
    } catch {
      return false;
    }
  }

  // ── Import / Export ────────────────────────────────────────────────────────

  exportFilters(filters: LogstashFilter[]): void {
    const json = JSON.stringify(filters, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `logstash-filters-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  parseImportFile(text: string): LogstashFilter[] {
    const parsed = JSON.parse(text);
    const items: LogstashFilter[] = Array.isArray(parsed) ? parsed : [parsed];
    return items.map((item) => {
      const { id: _id, systemOwner: _so, ...rest } = item;  // eslint-disable-line @typescript-eslint/no-unused-vars
      return rest as LogstashFilter;
    });
  }
}

export const logstashService = new LogstashService();
