import { api } from "@/lib/api";

export interface IncidentJob {
  id: number;
  actionId: number;
  params?: string;
  agent?: string;
  status: number;   // 0=PENDING, 1=RUNNING, 2=EXECUTED, 3=ERROR
  jobResult?: string;
  originId: number;
  originType: string;
  createdDate: string;
  modifiedDate?: string;
  createdUser: string;
  modifiedUser?: string;
  action?: {
    id: number;
    actionCommand?: string;
    actionDescription?: string;
    actionType?: number;
  };
}

export type IncidentJobStatus = "PENDING" | "RUNNING" | "EXECUTED" | "ERROR";

export function jobStatusLabel(status: number): IncidentJobStatus {
  switch (status) {
    case 0: return "PENDING";
    case 1: return "RUNNING";
    case 2: return "EXECUTED";
    default: return "ERROR";
  }
}

class IncidentResponseService {
  async getJobs(page = 0, size = 20, params?: Record<string, string>): Promise<{ data: IncidentJob[]; total: number }> {
    try {
      const qs = new URLSearchParams({ page: String(page), size: String(size), sort: "id,desc", ...params });
      const { data, headers } = await api.getWithHeaders<IncidentJob[]>(`/api/ha-incident-jobs?${qs}`);
      const total = parseInt(headers.get("X-Total-Count") ?? "0", 10);
      return { data: Array.isArray(data) ? data : [], total };
    } catch {
      return { data: [], total: 0 };
    }
  }

  async deleteJob(id: number): Promise<void> {
    await api.delete(`/api/ha-incident-jobs/${id}`);
  }
}

export const incidentResponseService = new IncidentResponseService();
