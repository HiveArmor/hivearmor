import { api } from "@/lib/api";

export interface UbaSummary {
  critical: number;
  high: number;
  medium: number;
  low: number;
  watchlisted: number;
  openAnomalies: number;
  anomaliesLast24h: number;
  avgRiskScore: number;
}

export interface RiskTrendPoint {
  date: string;
  score: number;
}

export interface EntityRisk {
  id: number;
  entityId: string;
  entityType: "user" | "host" | "service";
  displayName: string;
  department?: string;
  role?: string;
  riskScore: number;
  prevRiskScore: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  anomalyCount: number;
  alertCount: number;
  lastSeen?: string;
  watchlisted: boolean;
  status: string;
  factors: string[];
  riskTrend: RiskTrendPoint[];
}

export interface UbaAnomaly {
  id: number;
  entityId: string;
  entityType: string;
  anomalyType: string;
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  riskContribution: number;
  detectedAt: string;
  sourceIp?: string;
  sourceCountry?: string;
  status: "open" | "investigating" | "resolved" | "false_positive";
  details: Record<string, unknown>;
}

export interface EntityPage {
  content: EntityRisk[];
  totalElements: number;
  totalPages: number;
  page: number;
}

export const ANOMALY_TYPE_LABELS: Record<string, string> = {
  impossible_travel:     "Impossible Travel",
  off_hours_login:       "Off-Hours Login",
  mass_download:         "Mass Download",
  privilege_escalation:  "Privilege Escalation",
  lateral_movement:      "Lateral Movement",
  new_country_login:     "New Country Login",
  bulk_data_access:      "Bulk Data Access",
  c2_beacon:             "C2 Beacon",
  after_hours_admin:     "After-Hours Admin",
  failed_auth_spike:     "Failed Auth Spike",
};

class UbaServiceClient {
  async getSummary(): Promise<UbaSummary> {
    return api.get<UbaSummary>("/api/uba/summary");
  }

  async listEntities(params?: {
    entityType?: string;
    riskLevel?: string;
    page?: number;
    size?: number;
  }): Promise<EntityPage> {
    const q = new URLSearchParams();
    if (params?.entityType) q.set("entityType", params.entityType);
    if (params?.riskLevel)  q.set("riskLevel",  params.riskLevel);
    q.set("page", String(params?.page ?? 0));
    q.set("size", String(params?.size ?? 20));
    return api.get<EntityPage>(`/api/uba/entities?${q}`);
  }

  async listAnomalies(page = 0, size = 50): Promise<UbaAnomaly[]> {
    return api.get<UbaAnomaly[]>(`/api/uba/anomalies?page=${page}&size=${size}`);
  }

  async getEntityAnomalies(entityId: string, entityType = "user"): Promise<UbaAnomaly[]> {
    return api.get<UbaAnomaly[]>(
      `/api/uba/entities/${encodeURIComponent(entityId)}/anomalies?entityType=${entityType}`
    );
  }

  async setWatchlist(id: number, watchlisted: boolean): Promise<EntityRisk> {
    return api.put<EntityRisk>(`/api/uba/entities/${id}/watchlist`, { watchlisted });
  }

  async updateAnomalyStatus(id: number, status: string): Promise<UbaAnomaly> {
    return api.put<UbaAnomaly>(`/api/uba/anomalies/${id}/status`, { status });
  }
}

export const ubaService = new UbaServiceClient();
