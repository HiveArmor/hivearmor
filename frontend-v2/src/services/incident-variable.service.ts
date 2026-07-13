import { api } from "@/lib/api";

export interface IncidentVariable {
  id?: number;
  variableName: string;
  variableDescription: string;
  variableValue: string;
  secret: boolean;
  createdBy?: string;
  lastModifiedBy?: string;
  lastModifiedDate?: string;
}

class IncidentVariableService {
  async list(): Promise<IncidentVariable[]> {
    // GET returns a Spring Page — content array is in .content or the body itself
    const result = await api.getWithHeaders<IncidentVariable[] | { content: IncidentVariable[] }>(
      "/api/ha-incident-variables?size=200"
    );
    const data = result.data;
    if (Array.isArray(data)) return data;
    return (data as { content: IncidentVariable[] }).content ?? [];
  }

  async create(variable: Omit<IncidentVariable, "id" | "createdBy" | "lastModifiedBy" | "lastModifiedDate">): Promise<IncidentVariable> {
    return api.post<IncidentVariable>("/api/ha-incident-variables", variable);
  }

  async update(variable: IncidentVariable): Promise<IncidentVariable> {
    return api.put<IncidentVariable>("/api/ha-incident-variables", variable);
  }

  async delete(id: number): Promise<void> {
    await api.delete(`/api/ha-incident-variables/${id}`);
  }
}

export const incidentVariableService = new IncidentVariableService();
