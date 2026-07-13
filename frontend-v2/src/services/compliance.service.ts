import { api } from "@/lib/api";

// ── DTOs matching backend response shapes ─────────────────────────────────────

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
};
