import type { DetectionExecution, DetectionRule, DetectionRuleSummary, DetectionRuleVersion, DetectionSampleEvent, RuleListParams } from './detectionRules.types';

const unavailable = (): never => {
  throw new Error('Detection Rules fixture data is excluded from production builds.');
};

export const foundationDetectionRules: DetectionRule[] = [];
export const foundationDetectionExecutions: DetectionExecution[] = [];
export const foundationDetectionSampleEvents: DetectionSampleEvent[] = [];
export const foundationDetectionRuleVersions: DetectionRuleVersion[] = [];
export const foundationDetectionRuleSummary = {} as DetectionRuleSummary;
export function filterFoundationDetectionRules(_params: RuleListParams): { items: DetectionRule[]; total: number } {
  return unavailable();
}
