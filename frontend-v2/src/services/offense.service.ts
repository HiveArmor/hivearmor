import { api } from "@/lib/api";

export interface Offense {
  id: string;
  timestamp: string;
  lastUpdate: string;
  name: string;
  magnitude: number;
  status: "open" | "closed" | "false-positive";
  alertCount: number;
  dataTypes: string[];
  adversary: { ip?: string; user?: string };
  target?: { ip?: string };
  alerts: string[];
  technique?: string;
  category?: string;
}

export interface Alert {
  id: string;
  name?: string;
  severity?: number;
  status?: number;
  timestamp?: string;
  "@timestamp"?: string;
  dataSource?: string;
  technique?: string;
  category?: string;
  adversary?: { ip?: string; user?: string };
  target?: { ip?: string };
  [key: string]: unknown;
}

function mapOffense(doc: Record<string, unknown>): Offense {
  return {
    id:          String(doc.id          ?? ""),
    timestamp:   String(doc["@timestamp"] ?? doc.timestamp ?? ""),
    lastUpdate:  String(doc.lastUpdate  ?? ""),
    name:        String(doc.name        ?? ""),
    magnitude:   Number(doc.magnitude   ?? 0),
    status:      (doc.status as Offense["status"]) ?? "open",
    alertCount:  Number(doc.alertCount  ?? 0),
    dataTypes:   Array.isArray(doc.dataTypes) ? (doc.dataTypes as string[]) : [],
    adversary:   (doc.adversary as Offense["adversary"]) ?? {},
    target:      doc.target ? (doc.target as Offense["target"]) : undefined,
    alerts:      Array.isArray(doc.alerts) ? (doc.alerts as string[]) : [],
    technique:   doc.technique ? String(doc.technique) : undefined,
    category:    doc.category  ? String(doc.category)  : undefined,
  };
}

class OffenseService {
  async listOffenses(params: {
    page?: number;
    size?: number;
    status?: string;
    sort?: string;
  } = {}): Promise<{ content: Offense[]; total: number }> {
    try {
      const { page = 0, size = 25, status, sort = "magnitude,desc" } = params;
      const token = api.getToken();
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const qs = new URLSearchParams({
        page: String(page),
        size: String(size),
        sort: sort,
      });
      if (status) qs.set("status", status);

      const res = await fetch(`/api/offenses?${qs.toString()}`, { headers });
      if (!res.ok) return { content: [], total: 0 };

      const xTotal = res.headers.get("X-Total-Count");
      const docs = (await res.json()) as Record<string, unknown>[];
      const content = Array.isArray(docs) ? docs.map(mapOffense) : [];
      return { content, total: xTotal !== null ? parseInt(xTotal, 10) : content.length };
    } catch {
      return { content: [], total: 0 };
    }
  }

  async getOffense(id: string): Promise<Offense | null> {
    try {
      const doc = await api.get<Record<string, unknown>>(`/api/offenses/${encodeURIComponent(id)}`);
      return doc ? mapOffense(doc) : null;
    } catch {
      return null;
    }
  }

  async updateOffenseStatus(id: string, status: string): Promise<void> {
    await api.put(`/api/offenses/${encodeURIComponent(id)}/status`, { status });
  }

  async getOffenseAlerts(id: string): Promise<Alert[]> {
    try {
      const docs = await api.get<Record<string, unknown>[]>(
        `/api/offenses/${encodeURIComponent(id)}/alerts`
      );
      if (!Array.isArray(docs)) return [];
      return docs.map((d) => ({
        ...d,
        id:        String(d.id ?? ""),
        timestamp: String(d["@timestamp"] ?? d.timestamp ?? ""),
      })) as Alert[];
    } catch {
      return [];
    }
  }
}

export const offenseService = new OffenseService();
