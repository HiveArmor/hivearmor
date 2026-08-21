/**
 * Severity level constants.
 * Import from here — never hardcode severity strings or numbers in components.
 * Full mapping implemented in S02.
 */

export const SEVERITY = {
  CRITICAL: 'critical',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
  INFO: 'info',
} as const;

export type SeverityLevel = (typeof SEVERITY)[keyof typeof SEVERITY];

/** Numeric severity thresholds (backend values) */
export const SEVERITY_THRESHOLD = {
  CRITICAL: 90,
  HIGH: 70,
  MEDIUM: 40,
  LOW: 10,
} as const;
