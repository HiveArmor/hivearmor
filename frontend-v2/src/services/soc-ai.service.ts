import { api } from "@/lib/api";
import { UtmAlert, TriageResult } from "@/types/alert";

export interface SocAiQueuedResponse {
  status: "queued";
  alertId: string | number;
  message: string;
}

export interface SocAiErrorResponse {
  status: "error";
  message: string;
}

export type AnalyzeResponse = SocAiQueuedResponse | SocAiErrorResponse;

export interface TriageHistory {
  items: TriageResult[];
}

class SocAiService {
  /** POST /api/soc-ai/analyze — queue an alert for analysis */
  async analyze(alert: UtmAlert): Promise<AnalyzeResponse | null> {
    try {
      return await api.post<AnalyzeResponse>("/api/soc-ai/analyze", alert);
    } catch {
      return null;
    }
  }

  /** GET /api/soc-ai/result/{alertId} — latest cached result (204 = no result yet) */
  async getResult(alertId: string): Promise<TriageResult | null> {
    try {
      return await api.get<TriageResult>(`/api/soc-ai/result/${encodeURIComponent(alertId)}`);
    } catch {
      return null;
    }
  }

  /** GET /api/soc-ai/history/{alertId} — full triage history */
  async getHistory(alertId: string): Promise<TriageResult[]> {
    try {
      return (await api.get<TriageResult[]>(`/api/soc-ai/history/${encodeURIComponent(alertId)}`)) ?? [];
    } catch {
      return [];
    }
  }

  /**
   * Convenience: submit then poll until COMPLETED or FAILED (up to maxAttempts).
   * Calls onPoll on each check so callers can update UI state.
   */
  async analyzeAndPoll(
    alert: UtmAlert,
    opts: {
      intervalMs?: number;
      maxAttempts?: number;
      onPoll?: (attempt: number) => void;
    } = {}
  ): Promise<TriageResult | null> {
    const { intervalMs = 3000, maxAttempts = 20, onPoll } = opts;

    const queued = await this.analyze(alert);
    if (!queued || queued.status === "error") return null;

    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, intervalMs));
      onPoll?.(i + 1);
      const result = await this.getResult(String(alert.id));
      if (result && (result.status === "COMPLETED" || result.status === "FAILED")) {
        return result;
      }
    }
    return null;
  }
}

export const socAiService = new SocAiService();
