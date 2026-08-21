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
