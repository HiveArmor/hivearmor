/**
 * Detection Rules Constants (S23)
 */

export const DATA_TYPE_OPTIONS: string[] = [
  'Log',
  'Windows',
  'Network',
  'Endpoint',
  'Cloud',
  'Email',
  'DNS',
  'Other',
];

export const NEW_RULE_TEMPLATE = `celExists(event.action) &&
equals(event.action, "process_start") &&
celExists(process.name) &&
equals(process.name, "powershell.exe")`;

export const SPLIT_STORAGE_KEY = 'ha_rule_editor_split';
export const DEFAULT_SPLIT_RATIO = 40; // percentage for left panel

export const RULE_SEVERITY_OPTIONS = ['critical', 'high', 'medium', 'low', 'info'] as const;

export const RULE_TACTIC_OPTIONS = [
  'Reconnaissance', 'Resource Development', 'Initial Access', 'Execution', 'Persistence',
  'Privilege Escalation', 'Defense Evasion', 'Credential Access', 'Discovery',
  'Lateral Movement', 'Collection', 'Command and Control', 'Exfiltration', 'Impact',
] as const;

export const RULE_SCHEDULE_OPTIONS = ['Every 1m', 'Every 5m', 'Every 10m', 'Every 15m', 'Every 30m', 'Every 1h'] as const;
export const RULE_LOOKBACK_OPTIONS = ['5m', '10m', '20m', '30m', '1h', '4h', '24h'] as const;
export const RULE_SUPPRESSION_OPTIONS = ['Off', '5m', '15m', '1h', '4h', '24h'] as const;
