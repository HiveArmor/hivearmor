/**
 * mitre.types.ts — MITRE ATT&CK coverage types
 */

export interface TechniqueCoverageDTO {
  technique: string; // e.g., "T1003.001"
  ruleCount: number; // Total rules for this technique
  activeCount: number; // Active rules for this technique
}

export interface RuleRefDTO {
  id: number;
  name: string;
  active: boolean;
}
