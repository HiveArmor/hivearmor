import { api } from "@/lib/api";
import type { EntityGraph } from "@/components/investigation/investigation-entity-graph";

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

  async getEntityGraph(id: number): Promise<EntityGraph> {
    interface ApiNode { id: string; type: string; label: string; properties?: Record<string, unknown> }
    interface ApiEdge { source: string; target: string; relation: string }
    interface ApiGraph { nodes: ApiNode[]; edges: ApiEdge[] }

    try {
      const raw = await api.get<ApiGraph>(`/api/ha-incidents/${id}/entity-graph`);
      return {
        nodes: (raw?.nodes ?? []).map((n) => ({
          id: n.id,
          kind: (["ip","host","user","process","file","domain"].includes(n.type) ? n.type : "ip") as EntityGraph["nodes"][number]["kind"],
          label: n.label,
          sublabel: buildSublabel(n.type, n.properties),
          suspicious: n.properties?.malicious === true || (typeof n.properties?.riskScore === "number" && (n.properties.riskScore as number) > 30),
          compromised: typeof n.properties?.riskScore === "number" && (n.properties.riskScore as number) > 70,
        })),
        edges: (raw?.edges ?? []).map((e, i) => ({
          id: `e${i}-${e.source}-${e.target}`,
          source: e.source,
          target: e.target,
          label: e.relation.replace(/_/g, " "),
          suspicious: e.relation === "associated_with" || e.relation === "connected_to",
        })),
      };
    } catch {
      return { nodes: [], edges: [] };
    }
  }
}

function buildSublabel(type: string, props?: Record<string, unknown>): string | undefined {
  if (!props) return undefined;
  if (type === "ip") return props.country as string | undefined;
  if (type === "user") return props.domain as string | undefined;
  if (type === "host") return props.os as string | undefined;
  if (type === "process") return props.path as string | undefined;
  return undefined;
}

export const incidentService = new IncidentService();
