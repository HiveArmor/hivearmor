/**
 * Compliance Types
 */

export interface ComplianceFrameworkDTO {
  id: string;
  name: string;
  version: string | null;
  description: string | null;
  controlCount: number;
  overallScore: number;
  lastAssessed: string | null;
}

export interface ComplianceFindingDTO {
  id: string;
  frameworkId: string;
  controlId: string;
  controlName: string;
  description: string;
  status: 'compliant' | 'non_compliant' | 'not_applicable' | 'in_progress';
  evidenceCount: number;
  lastChecked: string | null;
  remediationGuidance: string | null;
  tags: string[];
}

export interface MitreHeatmapCellDTO {
  tacticId: string;
  tacticName: string;
  techniqueId: string;
  techniqueName: string;
  coverageScore: number;
  ruleCount: number;
}

export interface ComplianceFilters {
  framework?: string;
  status?: string[];
  controlId?: string;
  q?: string;
}

/** CMP-004 — standard section row from /api/compliance/standard-section. */
export interface ComplianceStandardSectionDTO {
  id: number;
  standardId?: number | null;
  standardSectionName?: string | null;
  standardSectionDescription?: string | null;
}

/** CMP-004 — representative catalog control resolved for a framework drawer. */
export interface FrameworkControlResolution {
  standardId: number;
  sectionId: number;
  sectionName: string | null;
  controlId: number;
  controlName: string | null;
}

/** CMP-005 — paginated section control list from get-by-section. */
export interface SectionControlsPage {
  items: ComplianceControlLatestEvaluationDTO[];
  total: number;
}

export interface SectionControlsQuery {
  sectionId: number;
  page?: number;
  size?: number;
  sort?: string;
  search?: string;
}

/** CMP-002 — latest evaluation projection for a catalog control. */
export interface ComplianceControlLatestEvaluationDTO {
  id: number;
  standardSectionId: number;
  controlName: string;
  controlSolution?: string | null;
  controlRemediation?: string | null;
  controlStrategy?: string | null;
  lastEvaluationStatus?: string | null;
  lastEvaluationTimestamp?: string | null;
}

/** CMP-003 — grouped evaluation history for a control. */
export interface ComplianceControlEvaluationGroupedDTO {
  controlId?: number;
  controlName?: string;
  status?: string | null;
  timestamp?: string | null;
}

export interface ComplianceControlEvaluationHistoryDTO {
  startDate?: string | null;
  endDate?: string | null;
  evaluations: ComplianceControlEvaluationGroupedDTO[];
}

/** CMP-006 — improvement action (POA&M) row — schema only until REST is authorized. */
export interface ComplianceImprovementActionDTO {
  id: number;
  frameworkId: string;
  controlId: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  status: string;
  assignee: string | null;
  createdAt: string;
  updatedAt: string;
  overdue: boolean;
}

/** CMP-006 — control exception row — schema only until REST is authorized. */
export interface ComplianceControlExceptionDTO {
  id: number;
  controlId: number;
  title: string;
  reason: string | null;
  status: string;
  effectiveFrom: string | null;
  effectiveUntil: string | null;
  approver: string | null;
  createdAt: string;
  updatedAt: string;
}

/** CMP-003 — evidence row for a control. */
export interface ComplianceEvidenceItemDTO {
  evidenceId?: string | null;
  controlId?: number | null;
  mappingType?: string | null;
  timestamp?: string | null;
  weight?: number | null;
  eventId?: string | null;
  eventSource?: string | null;
  eventSummary?: string | null;
  eventIndexPath?: string | null;
}
