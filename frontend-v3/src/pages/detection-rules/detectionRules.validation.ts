import type { DetectionRule, RuleAuthoringDiagnostic, RuleValidationResult } from './detectionRules.types';

function lineFor(definition: string, expression: RegExp): number | undefined {
  const match = expression.exec(definition);
  if (!match || match.index == null) return undefined;
  return definition.slice(0, match.index).split('\n').length;
}

export function buildRuleClientValidation(rule: Partial<DetectionRule>): RuleValidationResult {
  const definition = rule.ruleDefinition ?? '';
  const diagnostics: RuleAuthoringDiagnostic[] = [];
  const add = (code: string, severity: RuleAuthoringDiagnostic['severity'], message: string, path: string, expression?: RegExp): void => {
    diagnostics.push({ id: `${code}-${diagnostics.length}`, code, severity, message, path, line: expression ? lineFor(definition, expression) : undefined, source: 'client' });
  };

  if (!rule.ruleName?.trim()) add('HA-RULE-001', 'error', 'A rule name is required.', 'metadata.name');
  else if (rule.ruleName.trim().length < 3) add('HA-RULE-002', 'error', 'Rule name must contain at least three characters.', 'metadata.name');
  if (!rule.dataTypes?.length) add('HA-DATA-001', 'error', 'Select at least one normalized data source.', 'dataSources');
  if (!definition.trim()) add('HA-CEL-001', 'error', 'The CEL detection expression is empty.', 'definition');
  const balance = (text: string, open: string, close: string): boolean => text.split(open).length === text.split(close).length;
  if (definition && !balance(definition, '(', ')')) add('HA-CEL-002', 'error', 'Parentheses are not balanced.', 'definition');
  if (definition && !/(&&|\|\||==|!=|\b(?:equals|oneOf|contains|regexMatch|inCIDR|celExists)\s*\()/m.test(definition)) add('HA-CEL-003', 'warning', 'Use an explicit CEL comparison or supported helper function.', 'definition');
  if (definition && !/\b(?:event|process|source|destination|user|host|file|network|dns|http|url|registry|cloud|service)\.[\w.]+/m.test(definition)) add('HA-FIELD-001', 'warning', 'Reference at least one normalized event field.', 'definition');
  if (definition && !/!|exclude|allowlist|exception/i.test(definition)) add('HA-QUALITY-001', 'warning', 'Review exclusions or exception handling before publishing.', 'definition');
  if (!rule.techniqueId?.match(/^T\d{4}(?:\.\d{3})?$/)) add('HA-ATTACK-002', 'warning', 'Confirm the structured ATT&CK technique identifier.', 'metadata.technique');

  const scheduleMinutes = Number.parseInt(rule.schedule?.match(/\d+/)?.[0] ?? '0', 10);
  const lookbackMinutes = (() => {
    const value = Number.parseInt(rule.lookback?.match(/\d+/)?.[0] ?? '0', 10);
    return rule.lookback?.endsWith('h') ? value * 60 : value;
  })();
  if (scheduleMinutes && lookbackMinutes && lookbackMinutes < scheduleMinutes) add('HA-SCHEDULE-001', 'error', 'Lookback must be at least as long as the execution interval.', 'schedule.lookback');
  if ((rule.threshold ?? 1) > 1000) add('HA-VOLUME-001', 'warning', 'A high threshold can hide meaningful low-volume behavior.', 'alerting.threshold');

  const fieldMatches = [...new Set([...definition.matchAll(/\b(?:event|process|source|destination|user|host|file|network|dns|http|url|registry|cloud|service)\.[a-zA-Z0-9_.]+/g)].map((match) => match[0]))];
  const fieldCoverage = fieldMatches.length ? 100 : null;

  return {
    available: true,
    authoritative: false,
    valid: !diagnostics.some((diagnostic) => diagnostic.severity === 'error'),
    diagnostics,
    fieldCoverage,
    requiredDataSources: rule.dataTypes ?? [],
    engineVersion: null,
    checkedAt: new Date().toISOString(),
  };
}
