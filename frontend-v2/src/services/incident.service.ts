import { api } from "@/lib/api";

export interface Incident {
  id: number;
  incidentName: string;
  incidentDescription?: string;
  incidentStatus: string;
  incidentSeverity: number;
  incidentAssignedTo?: string;
  incidentCreatedBy?: string;
  incidentCreatedDate?: string;
  incidentClosedDate?: string;
  incidentSource?: string;
  incidentSolution?: string;
  alertCount?: number;
  // Phase 14 — SLA / Priority
  incidentPriority?: string;
  slaDeadline?: string;
  slaBreached?: boolean;
}

export enum IncidentStatus {
  OPEN = "OPEN",
  IN_REVIEW = "IN_REVIEW",
  COMPLETED = "COMPLETED",
}

class IncidentService {
  async list(page = 0, size = 50, sort = "incidentCreatedDate,desc"): Promise<{ content: Incident[]; totalElements: number }> {
    try {
      const token = api.getToken();
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`/api/ha-incidents?page=${page}&size=${size}&sort=${encodeURIComponent(sort)}`, { headers });
      const xTotal = res.headers.get("X-Total-Count");
      const data = (await res.json()) as Incident[];
      const content = Array.isArray(data) ? data : [];
      return { content, totalElements: xTotal !== null ? parseInt(xTotal, 10) : content.length };
    } catch {
      return { content: [], totalElements: 0 };
    }
  }

  async getById(id: number): Promise<Incident | null> {
    try { return await api.get<Incident>(`/api/ha-incidents/${id}`); } catch { return null; }
  }

  async create(incident: Partial<Incident>) { return api.post<Incident>("/api/ha-incidents", incident); }
  async update(incident: Partial<Incident>) { return api.put("/api/ha-incidents", incident); }
  async delete(id: number) { return api.delete(`/api/ha-incidents/${id}`); }

  async updateStatus(incident: Incident, status: string) {
    return api.put("/api/ha-incidents/change-status", { ...incident, incidentStatus: status });
  }

  async assignIncident(incident: Incident, assigneeLogin: string | null): Promise<Incident> {
    return api.put<Incident>("/api/ha-incidents/change-status", {
      ...incident,
      incidentAssignedTo: assigneeLogin,
    });
  }
}

export const incidentService = new IncidentService();
