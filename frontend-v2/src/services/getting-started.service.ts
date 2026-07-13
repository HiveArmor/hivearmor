import { api } from "@/lib/api";

export type GettingStartedStepEnum =
  | "SET_ADMIN_USER"
  | "APPLICATION_SETTINGS"
  | "DASHBOARD_BUILDER"
  | "THREAT_MANAGEMENT"
  | "INTEGRATIONS";

export interface GettingStartedStep {
  id: number;
  stepShort: GettingStartedStepEnum;
  stepOrder: number;
  completed: boolean;
}

class GettingStartedService {
  async getSteps(): Promise<GettingStartedStep[]> {
    try {
      return await api.get<GettingStartedStep[]>("/api/ha-getting-started?page=0&size=20") || [];
    } catch {
      return [];
    }
  }

  async completeStep(step: GettingStartedStepEnum): Promise<void> {
    await api.get<string>(`/api/ha-getting-started/complete?step=${step}`);
  }

  async initSteps(inSaas: boolean): Promise<void> {
    await api.post<string>("/api/ha-getting-started/init", { inSaas });
  }
}

export const gettingStartedService = new GettingStartedService();
