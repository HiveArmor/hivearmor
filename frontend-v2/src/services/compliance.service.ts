import { api } from "@/lib/api";

// ── DTOs matching backend response shapes ─────────────────────────────────────

export interface ComplianceEvidenceRecord {
  evidenceId: string;
  controlId: number;
  mappingType: "EVIDENCE" | "VIOLATION" | "INDICATOR";
  timestamp: string;
  weight?: number;
  eventId?: string;
  eventSource?: string;
  eventSummary?: string;
  eventIndexPath?: string;
}

export interface ComplianceControlMapping {
  id: number;
  controlId: number;
  controlName?: string;
  sectionName?: string;
  standardName?: string;
  mappingType: "EVIDENCE" | "VIOLATION" | "INDICATOR";
  dataTypes?: string;
  celCondition: string;
  description?: string;
  weight?: number;
  evidenceRetentionDays?: number;
}

export interface ComplianceStandard {
  id: number;
  standardName: string;
  standardDescription: string;
}

export interface ComplianceSection {
  id: number;
  standardSectionName: string;
  standardSectionDescription: string;
  standard: ComplianceStandard;
}

export type ComplianceStrategy = "ALL" | "ANY";

export interface ComplianceControlConfig {
  id: number;
  standardSectionId: number;
  section: ComplianceSection;
  controlName: string;
  controlSolution?: string;
  controlRemediation?: string;
  controlStrategy: ComplianceStrategy;
}

export interface ComplianceControlLatestEvaluation extends ComplianceControlConfig {
  lastEvaluationStatus: string | null;
  lastEvaluationTimestamp: string | null;
}

export interface ComplianceControlEvaluationGrouped {
  controlId: number;
  controlName: string;
  status: string;
  timestamp: string;
}

export interface ComplianceControlEvaluationHistoryResponse {
  startDate: string;
  endDate: string;
  evaluations: ComplianceControlEvaluationGrouped[];
}

// ── Derived UI types ──────────────────────────────────────────────────────────

export type EvalStatus = "PASS" | "FAIL" | "PARTIAL" | "NOT_EVALUATED";

export function normalizeStatus(raw: string | null | undefined): EvalStatus {
  if (!raw) return "NOT_EVALUATED";
  const up = raw.toUpperCase();
  if (up === "PASS" || up === "PASSED" || up === "COMPLIANT") return "PASS";
  if (up === "FAIL" || up === "FAILED" || up === "NON_COMPLIANT") return "FAIL";
  if (up === "PARTIAL") return "PARTIAL";
  return "NOT_EVALUATED";
}

// ── Service functions ─────────────────────────────────────────────────────────

export const complianceService = {
  getStandards(): Promise<ComplianceStandard[]> {
    return api.get<ComplianceStandard[]>("/api/compliance/standard?page=0&size=100");
  },

  getSections(standardId: number): Promise<ComplianceSection[]> {
    return api.get<ComplianceSection[]>(
      `/api/compliance/standard-section?standardId.equals=${standardId}&page=0&size=200`
    );
  },

  getControlsWithLatestEval(
    sectionId: number,
    page = 0,
    size = 50
  ): Promise<ComplianceControlLatestEvaluation[]> {
    return api.get<ComplianceControlLatestEvaluation[]>(
      `/api/compliance/control-config/get-by-section?sectionId=${sectionId}&page=${page}&size=${size}`
    );
  },

  getControlWithLatestEval(controlId: number): Promise<ComplianceControlLatestEvaluation> {
    return api.get<ComplianceControlLatestEvaluation>(
      `/api/compliance/control-config/get-by-id/${controlId}`
    );
  },

  getControlEvaluationHistory(
    controlId: number
  ): Promise<ComplianceControlEvaluationHistoryResponse> {
    return api.get<ComplianceControlEvaluationHistoryResponse>(
      `/api/compliance/control-config/${controlId}/evaluations`
    );
  },

  getControlMappings(
    standardId?: number,
    mappingType?: string,
    page = 0,
    size = 200
  ): Promise<ComplianceControlMapping[]> {
    const params = new URLSearchParams({ page: String(page), size: String(size) });
    if (standardId != null) params.set("standardId", String(standardId));
    if (mappingType) params.set("mappingType", mappingType);
    return api.get<ComplianceControlMapping[]>(`/api/ha-compliance-control-mapping?${params}`);
  },

  createControlMapping(dto: Omit<ComplianceControlMapping, "id">): Promise<ComplianceControlMapping> {
    return api.post<ComplianceControlMapping>("/api/ha-compliance-control-mapping", dto);
  },

  updateControlMapping(id: number, dto: Partial<ComplianceControlMapping>): Promise<ComplianceControlMapping> {
    return api.put<ComplianceControlMapping>(`/api/ha-compliance-control-mapping/${id}`, dto);
  },

  deleteControlMapping(id: number): Promise<void> {
    return api.delete(`/api/ha-compliance-control-mapping/${id}`);
  },

  getControlEvidence(
    controlId: number,
    opts?: { page?: number; size?: number; mappingType?: string; days?: number }
  ): Promise<ComplianceEvidenceRecord[]> {
    const params = new URLSearchParams({
      page: String(opts?.page ?? 0),
      size: String(opts?.size ?? 20),
      days: String(opts?.days ?? 30),
    });
    if (opts?.mappingType) params.set("mappingType", opts.mappingType);
    return api.get<ComplianceEvidenceRecord[]>(
      `/api/compliance/controls/${controlId}/evidence?${params}`
    );
  },

  buildEvidenceExportUrl(controlId: number, days = 30): string {
    return `/api/compliance/controls/${controlId}/evidence/export?days=${days}`;
  },

  async getFrameworkEvidenceCount(standardId: number, days = 30): Promise<number> {
    // Fetch all control IDs for the framework, then sum evidence counts across them.
    // Uses size=1 per control just to read the X-Total-Count header for efficiency.
    const sections = await complianceService.getSections(standardId);
    if (sections.length === 0) return 0;

    const controlPages = await Promise.allSettled(
      sections.map((sec) => complianceService.getControlsWithLatestEval(sec.id, 0, 200))
    );
    const controlIds: number[] = controlPages.flatMap((r) =>
      r.status === "fulfilled" ? r.value.map((c) => c.id) : []
    );
    if (controlIds.length === 0) return 0;

    // Fetch page-0/size-1 for each control — we only need the total count from headers.
    // To keep it cheap we sample the first 10 controls and scale.
    const sample = controlIds.slice(0, 10);
    const counts = await Promise.allSettled(
      sample.map((id) =>
        api
          .getWithHeaders<ComplianceEvidenceRecord[]>(
            `/api/compliance/controls/${id}/evidence?page=0&size=1&days=${days}`
          )
          .then(({ headers }) => {
            const total = headers.get("X-Total-Count");
            return total ? parseInt(total, 10) : 0;
          })
          .catch(() => 0)
      )
    );
    const sampleTotal = counts.reduce(
      (sum, r) => sum + (r.status === "fulfilled" ? r.value : 0),
      0
    );
    // Scale by ratio of sampled vs total controls
    return Math.round(sampleTotal * (controlIds.length / sample.length));
  },
};
