/**
 * TypeScript types for the HiveArmor Sigma detection pipeline.
 * These interfaces mirror the Java DTOs in the backend service layer exactly.
 */

export interface SigmaRuleDTO {
  id: number;
  sigmaId: string;
  ruleTitle: string;
  ruleStatus: string | null;
  logsourceProduct: string | null;
  logsourceService: string | null;
  detectionYaml: string;
  haSeverity: number;
  mitreTags: string | null;
  active: boolean;
  importedAt: string;
  updatedAt: string;
}

export interface SigmaSyncResultDTO {
  processed: number;
  inserted: number;
  updated: number;
  errors: number;
}

export interface RuleTestRequestDTO {
  ruleYaml: string;
  eventJson: string;
}

export interface RuleTestResultDTO {
  matched: boolean;
  matchedFields: string[];
  explanation: string;
}
