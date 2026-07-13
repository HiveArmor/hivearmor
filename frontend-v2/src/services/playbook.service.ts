import { api } from "@/lib/api";

export interface SavedPlaybook {
  id: number;
  name: string;
  description?: string;
  definitionJson: string;
  isActive: boolean;
  systemOwner?: boolean;
  createdBy?: string;
  createdDate?: string;
  lastModifiedDate?: string;
}

export interface PlaybookExecution {
  id: number;
  playbookId: number;
  playbookName: string;
  status: "RUNNING" | "SUCCESS" | "ERROR" | "ABORTED";
  triggerType: string;
  triggeredBy: string;
  alertId?: string;
  startedAt: string;
  endedAt?: string;
  totalSteps: number;
  completedSteps: number;
  errorMessage?: string;
  stepsLog?: string;
}

class PlaybookService {
  list(): Promise<SavedPlaybook[]> {
    return api.get<SavedPlaybook[]>("/api/soar/playbooks");
  }

  getById(id: number): Promise<SavedPlaybook> {
    return api.get<SavedPlaybook>(`/api/soar/playbooks/${id}`);
  }

  create(payload: Omit<SavedPlaybook, "id" | "createdBy" | "createdDate" | "lastModifiedDate">): Promise<SavedPlaybook> {
    return api.post<SavedPlaybook>("/api/soar/playbooks", payload);
  }

  update(id: number, payload: Partial<SavedPlaybook>): Promise<SavedPlaybook> {
    return api.put<SavedPlaybook>(`/api/soar/playbooks/${id}`, { ...payload, id });
  }

  delete(id: number): Promise<void> {
    return api.delete<void>(`/api/soar/playbooks/${id}`);
  }

  execute(id: number, alertId?: string, triggerType?: string): Promise<PlaybookExecution> {
    return api.post<PlaybookExecution>(`/api/soar/playbooks/${id}/execute`, {
      alertId: alertId ?? null,
      triggerType: triggerType ?? "manual",
    });
  }

  async getAudit(page = 0, size = 20): Promise<{ data: PlaybookExecution[]; total: number }> {
    const { data, headers } = await api.getWithHeaders<PlaybookExecution[]>(
      `/api/soar/audit?page=${page}&size=${size}`
    );
    const total = parseInt(headers.get("X-Total-Count") ?? "0", 10);
    return { data, total };
  }
}

export const playbookService = new PlaybookService();
