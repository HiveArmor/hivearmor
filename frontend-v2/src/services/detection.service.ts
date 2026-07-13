import { api } from "@/lib/api";

export interface CorrelationRule {
  id: number;
  name: string;
  confidentiality: number;
  integrity: number;
  availability: number;
  category: string;
  technique: string;
  adversary: string;
  description?: string;
  definition?: unknown;
  ruleLastUpdate?: string;
  ruleActive: boolean;
  systemOwner: boolean;
  dataTypes?: { id: number; dsName: string }[];
}

export interface RuleVersion {
  id: number;
  ruleId: number;
  versionNum: number;
  ruleSnapshot: string;
  changedBy: string;
  changedAt: string;
  changeNote?: string;
}

export interface RuleTestResult {
  ruleId: number;
  ruleName: string;
  syntaxOk: boolean;
  variableCount: number;
  simulatedMatchCount: number;
  evaluationNote: string;
  durationMs: number;
}

export interface SigmaImportResult {
  imported: number;
  skipped: number;
  skippedReasons: string[];
}

export interface RulePack {
  name: string;
  description: string;
  ruleCount: number;
  category: string;
}

export interface PushLogEntry {
  id: number;
  ruleId: number;
  ruleName: string;
  agentId: string;
  pushedAt: string;
  pushStatus: "PENDING" | "DELIVERED" | "FAILED" | "ACKNOWLEDGED";
  errorMsg?: string;
  ackAt?: string;
}

export interface AlertResponseRule {
  id: number;
  ruleName: string;
  ruleDescription?: string;
  ruleConditions: string;
  ruleCmd: string;
  ruleActive: boolean;
  agentPlatform?: string;
  ruleShell?: string;
  excludedAgents?: string;
  systemOwner: boolean;
  createdBy?: string;
  createdDate?: string;
}

class DetectionService {
  async search(
    filters: Partial<{ name: string; active: boolean; category: string }> = {},
    page = 0,
    size = 50
  ): Promise<{ data: CorrelationRule[]; total: number }> {
    const params = new URLSearchParams({ page: String(page), size: String(size) });
    if (filters.name) params.set("name", filters.name);
    if (filters.active !== undefined) params.set("active", String(filters.active));
    const { data, headers } = await api.getWithHeaders<CorrelationRule[]>(
      `/api/correlation-rule/search-by-filters?${params}`
    );
    const total = parseInt(headers.get("X-Total-Count") ?? "0", 10);
    return { data, total };
  }

  getOne(id: number): Promise<CorrelationRule> {
    return api.get<CorrelationRule>(`/api/correlation-rule/${id}`);
  }

  create(payload: Partial<CorrelationRule>): Promise<void> {
    return api.post<void>("/api/correlation-rule", payload);
  }

  update(payload: Partial<CorrelationRule>): Promise<void> {
    return api.put<void>("/api/correlation-rule", payload);
  }

  delete(id: number): Promise<void> {
    return api.delete<void>(`/api/correlation-rule/${id}`);
  }

  setActive(id: number, active: boolean): Promise<void> {
    return api.put<void>(`/api/correlation-rule/activate-deactivate?id=${id}&active=${active}`, {});
  }

  getVersions(id: number): Promise<RuleVersion[]> {
    return api.get<RuleVersion[]>(`/api/correlation-rule/${id}/versions`);
  }

  getVersion(id: number, vNum: number): Promise<RuleVersion> {
    return api.get<RuleVersion>(`/api/correlation-rule/${id}/versions/${vNum}`);
  }

  rollback(id: number, vNum: number): Promise<CorrelationRule> {
    return api.post<CorrelationRule>(`/api/correlation-rule/${id}/rollback/${vNum}`, {});
  }

  testRule(ruleId: number): Promise<RuleTestResult> {
    return api.post<RuleTestResult>("/api/correlation-rule/test", { ruleId });
  }

  importRules(format: string, content: string): Promise<SigmaImportResult> {
    return api.post<SigmaImportResult>("/api/correlation-rule/import", { format, content });
  }

  getPacks(): Promise<RulePack[]> {
    return api.get<RulePack[]>("/api/correlation-rule/packs");
  }

  installPack(name: string): Promise<SigmaImportResult> {
    return api.post<SigmaImportResult>(`/api/correlation-rule/packs/${name}/install`, {});
  }

  bulkEnable(ids: number[]): Promise<void> {
    return api.put<void>("/api/correlation-rule/bulk-enable", ids);
  }

  bulkDisable(ids: number[]): Promise<void> {
    return api.put<void>("/api/correlation-rule/bulk-disable", ids);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  bulkDelete(_ids: number[]): Promise<void> {
    return api.delete<void>("/api/correlation-rule/bulk");
  }

  // Response rules

  async searchResponseRules(page = 0, size = 50): Promise<{ data: AlertResponseRule[]; total: number }> {
    const { data, headers } = await api.getWithHeaders<AlertResponseRule[]>(
      `/api/ha-alert-response-rules?page=${page}&size=${size}`
    );
    const total = parseInt(headers.get("X-Total-Count") ?? "0", 10);
    return { data, total };
  }

  createResponseRule(payload: Partial<AlertResponseRule>): Promise<AlertResponseRule> {
    return api.post<AlertResponseRule>("/api/ha-alert-response-rules", payload);
  }

  updateResponseRule(payload: Partial<AlertResponseRule>): Promise<AlertResponseRule> {
    return api.put<AlertResponseRule>("/api/ha-alert-response-rules", payload);
  }

  deleteResponseRule(id: number): Promise<void> {
    return api.delete<void>(`/api/ha-alert-response-rules/${id}`);
  }

  getPushStatus(ruleId: number): Promise<PushLogEntry[]> {
    return api.get<PushLogEntry[]>(`/api/alert-response-rules/push-status/${ruleId}`);
  }

  pushRule(ruleId: number, agentIds: string[] = []): Promise<void> {
    return api.post<void>("/api/alert-response-rules/push", { ruleId, agentIds });
  }

  getFilterValues(): Promise<{ agentPlatforms: string[]; users: string[] }> {
    return api.get("/api/ha-alert-response-rules/resolve-filter-values");
  }
}

export const detectionService = new DetectionService();
