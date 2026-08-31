/**
 * compliance.service.ts — CMP read contracts (CMP-002 … CMP-008).
 */

import { apiClient } from '@/lib/apiClient';
import type {
  ComplianceControlEvaluationHistoryDTO,
  ComplianceControlLatestEvaluationDTO,
  ComplianceControlExceptionDTO,
  ComplianceEvidenceItemDTO,
  ComplianceImprovementActionDTO,
  ComplianceReportSnapshotDTO,
  ComplianceScheduledReportDTO,
  ComplianceStandardSectionDTO,
  FrameworkControlResolution,
  SectionControlsPage,
  SectionControlsQuery,
} from '@/types/compliance.types';

const TOKEN_KEY = 'hivearmor_auth_token';

/** Page size for drawer control picker — honest pagination boundary. */
export const CMP_SECTION_CONTROLS_PAGE_SIZE = 25;

/**
 * CMP-010 — HaPoamItemResource GET /ha-compliance/poam has class-level @PreAuthorize
 * (ADMIN|USER|ANALYST|SOC_MANAGER) matching evaluation-history auth tier.
 */
export const CMP_IMPROVEMENT_ACTIONS_READ_AVAILABLE = true;

/**
 * CMP-011 — HaComplianceExceptionResource GET /ha-compliance/exceptions has class-level @PreAuthorize
 * (ADMIN|USER|ANALYST|SOC_MANAGER) matching evaluation-history auth tier.
 */
export const CMP_EXCEPTIONS_READ_AVAILABLE = true;

/**
 * CMP-013 — HaPoamItemResource POST/PUT/DELETE /ha-compliance/poam has method-level @PreAuthorize
 * (ADMIN|SOC_MANAGER).
 */
export const CMP_IMPROVEMENT_ACTIONS_WRITE_AVAILABLE = true;

/**
 * CMP-013 — HaComplianceExceptionResource POST/PATCH/DELETE /ha-compliance/exceptions has
 * method-level @PreAuthorize (ADMIN|SOC_MANAGER).
 */
export const CMP_EXCEPTIONS_WRITE_AVAILABLE = true;

export type CmpGovernanceReadKind = 'improvement_actions' | 'exceptions';

export interface CmpGovernanceReadContract {
  kind: CmpGovernanceReadKind;
  available: boolean;
  label: string;
  blockedReason: string;
  /** Documented future path — not called while {@link available} is false. */
  futurePath: string;
}

/**
 * CMP-007 — UtmComplianceControlEvaluationHistoryResource has class-level @PreAuthorize
 * (ADMIN|USER|ANALYST|SOC_MANAGER) on GET /compliance/control-config/{id}/evaluations.
 */
export const CMP_EVALUATION_HISTORY_READ_AVAILABLE = true;

/**
 * CMP-009 — ComplianceReportExportResource GET /ha-compliance-report-config and
 * GET /ha-compliance-report-config/{id}/export have @PreAuthorize
 * (ADMIN|USER|ANALYST|SOC_MANAGER).
 */
export const CMP_REPORT_SNAPSHOTS_READ_AVAILABLE = true;

/**
 * CMP-009 — UtmComplianceReportScheduleResource GET /compliance-report-schedules-by-user has
 * @PreAuthorize (ADMIN|USER|ANALYST|SOC_MANAGER).
 */
export const CMP_SCHEDULED_REPORTS_READ_AVAILABLE = true;

export type CmpDrawerReadKind = 'evaluation_history' | 'report_snapshots' | 'scheduled_reports';

export interface CmpDrawerReadContract {
  kind: CmpDrawerReadKind;
  available: boolean;
  label: string;
  blockedReason: string;
  /** Documented future path — not called while {@link available} is false. */
  futurePath: string;
}

/** CMP-007 drawer tab contracts — honest availability for progressive disclosure. */
export const CMP_DRAWER_READ_CONTRACTS: readonly CmpDrawerReadContract[] = [
  {
    kind: 'evaluation_history',
    available: CMP_EVALUATION_HISTORY_READ_AVAILABLE,
    label: 'Evaluation history',
    blockedReason:
      'Control evaluation history requires an authorized read contract with explicit @PreAuthorize.',
    futurePath: '/compliance/control-config/{id}/evaluations',
  },
  {
    kind: 'report_snapshots',
    available: CMP_REPORT_SNAPSHOTS_READ_AVAILABLE,
    label: 'Report snapshots',
    blockedReason:
      'Generated report exports require an authorized read contract with explicit @PreAuthorize.',
    futurePath: '/ha-compliance-report-config',
  },
  {
    kind: 'scheduled_reports',
    available: CMP_SCHEDULED_REPORTS_READ_AVAILABLE,
    label: 'Scheduled reports',
    blockedReason:
      'Compliance report schedules require an authorized read contract with explicit @PreAuthorize.',
    futurePath: '/compliance-report-schedules-by-user',
  },
] as const;

/** CMP-006 drawer tab contracts — honest availability for progressive disclosure. */
export const CMP_GOVERNANCE_READ_CONTRACTS: readonly CmpGovernanceReadContract[] = [
  {
    kind: 'improvement_actions',
    available: CMP_IMPROVEMENT_ACTIONS_READ_AVAILABLE,
    label: 'Improvement actions',
    blockedReason:
      'POA&M persistence exists server-side, but no authorized read API is exposed for this control yet.',
    futurePath: '/ha-compliance/poam',
  },
  {
    kind: 'exceptions',
    available: CMP_EXCEPTIONS_READ_AVAILABLE,
    label: 'Exceptions',
    blockedReason:
      'Control exceptions require a governed approval lifecycle that is not exposed by the backend yet.',
    futurePath: '/ha-compliance/exceptions',
  },
] as const;

/** Parses posture framework id (numeric standard id) for CMP catalog mapping. */
export function parseFrameworkStandardId(frameworkId: string): number | null {
  const trimmed = frameworkId.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const standardId = Number.parseInt(trimmed, 10);
  return Number.isFinite(standardId) && standardId > 0 ? standardId : null;
}

export const complianceService = {
  getStandardSections: (standardId: number, signal?: AbortSignal) =>
    apiClient.get<ComplianceStandardSectionDTO[]>('/compliance/standard-section', {
      params: {
        'standardId.equals': standardId,
        size: 50,
        sort: 'id,asc',
      },
      signal,
    }),

  getSectionControls: (sectionId: number, signal?: AbortSignal) =>
    apiClient.get<ComplianceControlLatestEvaluationDTO[]>('/compliance/control-config/get-by-section', {
      params: {
        sectionId,
        size: 1,
        sort: 'id,asc',
      },
      signal,
    }),

  getSectionControlsPage: async (
    query: SectionControlsQuery,
    signal?: AbortSignal,
  ): Promise<SectionControlsPage> => {
    const token = localStorage.getItem(TOKEN_KEY);
    const params = new URLSearchParams();
    params.set('sectionId', String(query.sectionId));
    params.set('page', String(query.page ?? 0));
    params.set('size', String(query.size ?? CMP_SECTION_CONTROLS_PAGE_SIZE));
    params.set('sort', query.sort ?? 'id,asc');
    if (query.search?.trim()) params.set('search', query.search.trim());

    const headers: Record<string, string> = { Accept: 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(`/api/compliance/control-config/get-by-section?${params.toString()}`, {
      headers,
      signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const items = (await response.json()) as ComplianceControlLatestEvaluationDTO[];
    const total = Number.parseInt(response.headers.get('X-Total-Count') ?? String(items.length), 10);
    return { items, total: Number.isFinite(total) ? total : items.length };
  },

  resolveFrameworkRepresentativeControl: async (
    frameworkId: string,
    signal?: AbortSignal,
  ): Promise<FrameworkControlResolution | null> => {
    const standardId = parseFrameworkStandardId(frameworkId);
    if (standardId === null) return null;

    const sections = await complianceService.getStandardSections(standardId, signal);
    for (const section of sections) {
      const controls = await complianceService.getSectionControls(section.id, signal);
      const control = controls[0];
      if (control?.id != null) {
        return {
          standardId,
          sectionId: section.id,
          sectionName: section.standardSectionName ?? null,
          controlId: control.id,
          controlName: control.controlName ?? null,
        };
      }
    }
    return null;
  },

  getControlLatestEvaluation: (controlId: number, signal?: AbortSignal) =>
    apiClient.get<ComplianceControlLatestEvaluationDTO>(
      `/compliance/control-config/get-by-id/${controlId}`,
      { signal },
    ),

  getControlEvaluations: (controlId: number, signal?: AbortSignal) =>
    apiClient.get<ComplianceControlEvaluationHistoryDTO>(
      `/compliance/control-config/${controlId}/evaluations`,
      { signal },
    ),

  getControlEvidence: (controlId: number, signal?: AbortSignal) =>
    apiClient.get<ComplianceEvidenceItemDTO[]>(`/compliance/controls/${controlId}/evidence`, {
      params: { page: 0, size: 20, days: 30 },
      signal,
    }),

  /** CMP-006 — wired when {@link CMP_IMPROVEMENT_ACTIONS_READ_AVAILABLE} flips true. */
  getControlImprovementActions: (controlId: number, signal?: AbortSignal) => {
    if (!CMP_IMPROVEMENT_ACTIONS_READ_AVAILABLE) {
      return Promise.reject(
        new Error('CMP-006 improvement-action read contract is not authorized yet.'),
      );
    }
    return apiClient.get<ComplianceImprovementActionDTO[]>('/ha-compliance/poam', {
      params: { controlId, page: 0, size: 20, sort: 'dueDate,asc' },
      signal,
    });
  },

  /** CMP-006 — wired when {@link CMP_EXCEPTIONS_READ_AVAILABLE} flips true. */
  getControlExceptions: (controlId: number, signal?: AbortSignal) => {
    if (!CMP_EXCEPTIONS_READ_AVAILABLE) {
      return Promise.reject(new Error('CMP-006 exception read contract is not authorized yet.'));
    }
    return apiClient.get<ComplianceControlExceptionDTO[]>('/ha-compliance/exceptions', {
      params: { controlId, page: 0, size: 20, sort: 'effectiveUntil,asc' },
      signal,
    });
  },

  /** CMP-013 — create POA&M row when write contract is authorized. */
  createImprovementAction: (
    body: {
      frameworkId: string;
      controlId: number;
      title: string;
      description?: string | null;
      dueDate?: string | null;
      assignee?: string | null;
      status?: string | null;
    },
    signal?: AbortSignal,
  ) => {
    if (!CMP_IMPROVEMENT_ACTIONS_WRITE_AVAILABLE) {
      return Promise.reject(
        new Error('CMP-013 improvement-action write contract is not authorized yet.'),
      );
    }
    return apiClient.post<ComplianceImprovementActionDTO>('/ha-compliance/poam', body, { signal });
  },

  /** CMP-013 — update POA&M row (status, assignee, due date, title). */
  updateImprovementAction: (
    id: number,
    body: {
      title?: string | null;
      status?: string | null;
      assignee?: string | null;
      dueDate?: string | null;
    },
    signal?: AbortSignal,
  ) => {
    if (!CMP_IMPROVEMENT_ACTIONS_WRITE_AVAILABLE) {
      return Promise.reject(
        new Error('CMP-013 improvement-action write contract is not authorized yet.'),
      );
    }
    return apiClient.put<ComplianceImprovementActionDTO>(`/ha-compliance/poam/${id}`, body, {
      signal,
    });
  },

  /** CMP-013 — delete POA&M row. */
  deleteImprovementAction: (id: number, signal?: AbortSignal) => {
    if (!CMP_IMPROVEMENT_ACTIONS_WRITE_AVAILABLE) {
      return Promise.reject(
        new Error('CMP-013 improvement-action write contract is not authorized yet.'),
      );
    }
    return apiClient.delete<void>(`/ha-compliance/poam/${id}`, { signal });
  },

  /** CMP-013 — request compensating-control exception (status pending). */
  createControlException: (
    body: {
      controlId: number;
      title: string;
      reason?: string | null;
      effectiveFrom?: string | null;
      effectiveUntil?: string | null;
    },
    signal?: AbortSignal,
  ) => {
    if (!CMP_EXCEPTIONS_WRITE_AVAILABLE) {
      return Promise.reject(new Error('CMP-013 exception write contract is not authorized yet.'));
    }
    return apiClient.post<ComplianceControlExceptionDTO>('/ha-compliance/exceptions', body, {
      signal,
    });
  },

  /** CMP-013 — approve pending exception. */
  approveControlException: (id: number, signal?: AbortSignal) => {
    if (!CMP_EXCEPTIONS_WRITE_AVAILABLE) {
      return Promise.reject(new Error('CMP-013 exception write contract is not authorized yet.'));
    }
    return apiClient.patch<ComplianceControlExceptionDTO>(
      `/ha-compliance/exceptions/${id}/approve`,
      undefined,
      { signal },
    );
  },

  /** CMP-013 — reject pending exception. */
  rejectControlException: (id: number, signal?: AbortSignal) => {
    if (!CMP_EXCEPTIONS_WRITE_AVAILABLE) {
      return Promise.reject(new Error('CMP-013 exception write contract is not authorized yet.'));
    }
    return apiClient.patch<ComplianceControlExceptionDTO>(
      `/ha-compliance/exceptions/${id}/reject`,
      undefined,
      { signal },
    );
  },

  /** CMP-013 — revoke approved exception. */
  revokeControlException: (id: number, signal?: AbortSignal) => {
    if (!CMP_EXCEPTIONS_WRITE_AVAILABLE) {
      return Promise.reject(new Error('CMP-013 exception write contract is not authorized yet.'));
    }
    return apiClient.patch<ComplianceControlExceptionDTO>(
      `/ha-compliance/exceptions/${id}/revoke`,
      undefined,
      { signal },
    );
  },

  /** CMP-013 — delete exception row. */
  deleteControlException: (id: number, signal?: AbortSignal) => {
    if (!CMP_EXCEPTIONS_WRITE_AVAILABLE) {
      return Promise.reject(new Error('CMP-013 exception write contract is not authorized yet.'));
    }
    return apiClient.delete<void>(`/ha-compliance/exceptions/${id}`, { signal });
  },

  /** CMP-009 — wired when {@link CMP_REPORT_SNAPSHOTS_READ_AVAILABLE} is true. */
  getFrameworkReportSnapshots: (standardId: number, signal?: AbortSignal) => {
    if (!CMP_REPORT_SNAPSHOTS_READ_AVAILABLE) {
      return Promise.reject(
        new Error('CMP-007 report-snapshot read contract is not authorized yet.'),
      );
    }
    return apiClient
      .get<ComplianceReportSnapshotDTO[]>('/ha-compliance-report-config', {
        params: { page: 0, size: 20 },
        signal,
      })
      .then((rows) =>
        rows.filter(
          (row) =>
            row.standard.trim() === String(standardId) ||
            row.standard.toLocaleLowerCase().includes(String(standardId)),
        ),
      );
  },

  /** CMP-009 — wired when {@link CMP_SCHEDULED_REPORTS_READ_AVAILABLE} is true. */
  getFrameworkScheduledReports: (_standardId: number, signal?: AbortSignal) => {
    if (!CMP_SCHEDULED_REPORTS_READ_AVAILABLE) {
      return Promise.reject(
        new Error('CMP-008 scheduled-report read contract is not authorized yet.'),
      );
    }
    return apiClient.get<ComplianceScheduledReportDTO[]>('/compliance-report-schedules-by-user', {
      params: { page: 0, size: 20, sort: 'id,desc' },
      signal,
    });
  },

  /** CMP-009 — PDF export path when report snapshot read contract is authorized. */
  getReportSnapshotExportPath: (reportId: number): string | null => {
    if (!CMP_REPORT_SNAPSHOTS_READ_AVAILABLE) return null;
    return `/api/ha-compliance-report-config/${reportId}/export`;
  },
};
