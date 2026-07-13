import { api } from "@/lib/api";
import { UtmAlert, AlertTag, SocAiResponse, AlertStatus, TriageResult } from "@/types/alert";

export interface ElasticFilter {
  field: string;
  operator: string;
  value: unknown;
}

export interface AlertFilterParams {
  page: number;
  size: number;
  sort?: string;
  sortField?: string;
  sortDir?: "asc" | "desc";
  // status: numeric code to filter by (undefined = all)
  status?: number;
  // severity: numeric code to filter by (undefined = all)
  severity?: number;
  // time window filter
  timeRange?: { from: string; to: string };
  extraFilters?: ElasticFilter[];
}

export interface AlertSearchResponse {
  content: UtmAlert[];
  totalElements: number;
  newestTimestamp?: string;
}

const INDEX = "_v3_hive_alert-*";

// Map a raw ES document (uses @timestamp, numeric severity 1-4) to UtmAlert shape
function mapDoc(doc: Record<string, unknown>): UtmAlert {
  const ts = (doc["@timestamp"] as string | undefined) ?? "";
  return {
    ...doc,
    id:            String(doc.id         ?? ""),
    name:          String(doc.name       ?? ""),
    severity:      Number(doc.severity   ?? 1),
    severityLabel: String(doc.severityLabel ?? ""),
    status:        Number(doc.status     ?? 2) as UtmAlert["status"],
    statusLabel:   String(doc.statusLabel ?? ""),
    timestamp:     ts,
    technique:     doc.technique ? String(doc.technique).split(" - ")[0] : undefined,
    category:      doc.category  ? String(doc.category)  : undefined,
    dataSource:    doc.dataSource ? String(doc.dataSource) : undefined,
    target:        doc.target    as UtmAlert["target"],
    adversary:     doc.adversary as UtmAlert["adversary"],
    tags:          Array.isArray(doc.tags)  ? (doc.tags as string[]) : [],
    notes:         doc.notes     ? String(doc.notes) : "",
    echoes:        doc.echoes !== undefined ? Number(doc.echoes) : undefined,
  } as UtmAlert;
}

class AlertService {
  async search(params: AlertFilterParams): Promise<AlertSearchResponse> {
    try {
      const {
        page, size,
        sortField = "@timestamp", sortDir = "desc",
        sort,
        status, severity, timeRange, extraFilters = [],
      } = params;

      const filters: ElasticFilter[] = [...extraFilters];

      if (status !== undefined) {
        filters.push({ field: "status", operator: "IS", value: status });
      } else {
        filters.push({ field: "status", operator: "IS_NOT", value: 1 });
      }

      if (severity !== undefined) {
        filters.push({ field: "severity", operator: "IS", value: severity });
      }

      if (timeRange) {
        filters.push({ field: "@timestamp", operator: "IS_BETWEEN", value: [timeRange.from, timeRange.to] });
      }

      // Prefer explicit sort string, otherwise build from field+dir
      const sortParam = sort ?? `${sortField},${sortDir}`;
      const sortEncoded = encodeURIComponent(sortParam);
      const url = `/api/elasticsearch/search?top=${size}&indexPattern=${encodeURIComponent(INDEX)}&sort=${sortEncoded}&page=${page}&size=${size}`;

      const reqHeaders: Record<string, string> = {
        "Content-Type": "application/json",
      };
      const token = api.getToken();
      if (token) reqHeaders["Authorization"] = `Bearer ${token}`;

      const res = await fetch(url, {
        method: "POST",
        headers: reqHeaders,
        body: JSON.stringify(filters),
      });

      if (!res.ok) return { content: [], totalElements: 0 };

      const xTotal = res.headers.get("X-Total-Count");
      const docs   = (await res.json()) as Record<string, unknown>[];
      const mapped = Array.isArray(docs) ? docs.map(mapDoc) : [];

      return {
        content:       mapped,
        totalElements: xTotal !== null ? parseInt(xTotal, 10) : mapped.length,
        newestTimestamp: mapped[0]?.timestamp,
      };
    } catch {
      return { content: [], totalElements: 0 };
    }
  }

  async countByStatus(from: string, to: string): Promise<Record<number, number>> {
    const statuses = [AlertStatus.OPEN, AlertStatus.IN_REVIEW, AlertStatus.COMPLETED, AlertStatus.IGNORED];
    const results = await Promise.allSettled(
      statuses.map((s) =>
        this.search({ page: 0, size: 1, status: s, timeRange: { from, to } })
      )
    );
    const counts: Record<number, number> = {};
    results.forEach((r, i) => {
      counts[statuses[i]] = r.status === "fulfilled" ? r.value.totalElements : 0;
    });
    return counts;
  }

  async getById(id: string): Promise<UtmAlert | null> {
    try {
      const reqHeaders: Record<string, string> = { "Content-Type": "application/json" };
      const token = api.getToken();
      if (token) reqHeaders["Authorization"] = `Bearer ${token}`;
      const res = await fetch(
        `/api/elasticsearch/search?top=1&indexPattern=${encodeURIComponent(INDEX)}`,
        { method: "POST", headers: reqHeaders, body: JSON.stringify([{ field: "id", operator: "IS", value: id }]) }
      );
      if (!res.ok) return null;
      const docs = await res.json() as Record<string, unknown>[];
      return docs?.length ? mapDoc(docs[0]) : null;
    } catch {
      return null;
    }
  }

  async updateStatus(alertIds: string[], status: number, statusObservation = "", addFalsePositiveTag = false) {
    return api.post("/api/ha-alerts/status", {
      alertIds,
      status,
      statusObservation,
      addFalsePositiveTag,
    });
  }

  async updateTags(alertIds: string[], tags: string[], createRule = false) {
    return api.post("/api/ha-alerts/tags", { alertIds, tags, createRule });
  }

  async updateNotes(alertId: string, notes: string) {
    return api.post(`/api/ha-alerts/notes?alertId=${alertId}`, notes);
  }

  async updateSolution(alertName: string, solution: string) {
    return api.post("/api/ha-alerts/solution", { alertName, solution });
  }

  async convertToIncident(eventIds: string[], incidentName: string, incidentId?: number, incidentSource = "ALERT") {
    return api.post("/api/ha-alerts/convert-to-incident", {
      eventIds,
      incidentName,
      incidentId,
      incidentSource,
    });
  }

  async analyzeSocAi(alert: UtmAlert): Promise<SocAiResponse | null> {
    try {
      return await api.post<SocAiResponse>("/api/soc-ai/analyze", alert);
    } catch {
      return null;
    }
  }

  async getTriageResult(alertId: string): Promise<TriageResult | null> {
    try {
      return await api.get<TriageResult>(`/api/soc-ai/result/${encodeURIComponent(alertId)}`);
    } catch {
      return null;
    }
  }

  async getTags(): Promise<AlertTag[]> {
    try {
      return (await api.get<AlertTag[]>("/api/ha-alert-tags?page=0&size=1000")) || [];
    } catch {
      return [];
    }
  }

  async countOpen(): Promise<number> {
    try {
      const n = await api.get<number>("/api/ha-alerts/count-open-alerts");
      return typeof n === "number" ? n : 0;
    } catch {
      return 0;
    }
  }
}

export const alertService = new AlertService();
