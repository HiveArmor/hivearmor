/**
 * Severity level constants and helpers.
 * All severity colors reference CSS custom properties defined in tokens.css.
 */

export const SEVERITY_LEVELS = ['critical', 'high', 'medium', 'low', 'info'] as const;
export type SeverityLevel = typeof SEVERITY_LEVELS[number];

export const SEVERITY_COLORS: Record<SeverityLevel, string> = {
  critical: 'var(--ha-severity-critical)',
  high:     'var(--ha-severity-high)',
  medium:   'var(--ha-severity-medium)',
  low:      'var(--ha-severity-low)',
  info:     'var(--ha-severity-info)',
};

export const SEVERITY_LABELS: Record<SeverityLevel, string> = {
  critical: 'Critical',
  high:     'High',
  medium:   'Medium',
  low:      'Low',
  info:     'Info',
};

export const SEVERITY_ORDER: Record<SeverityLevel, number> = {
  critical: 5,
  high:     4,
  medium:   3,
  low:      2,
  info:     1,
};

/**
 * Map numeric severity (1-10) to severity level
 * Per CMD-03 spec §7.3:
 *   9-10 → Critical
 *   7-8  → High
 *   4-6  → Medium
 *   1-3  → Low
 */
export function numericToSeverityLevel(numeric: number): SeverityLevel {
  if (numeric >= 9) return 'critical';
  if (numeric >= 7) return 'high';
  if (numeric >= 4) return 'medium';
  return 'low';
}

/**
 * Get severity label for display (accepts numeric 1-10 or SeverityLevel)
 */
export function getSeverityLabel(severity: number | SeverityLevel): string {
  if (typeof severity === 'number') {
    const level = numericToSeverityLevel(severity);
    return SEVERITY_LABELS[level];
  }
  return SEVERITY_LABELS[severity];
}

/**
 * Get severity color CSS variable (accepts numeric 1-10 or SeverityLevel)
 */
export function getSeverityColor(severity: number | SeverityLevel): string {
  if (typeof severity === 'number') {
    const level = numericToSeverityLevel(severity);
    return SEVERITY_COLORS[level];
  }
  return SEVERITY_COLORS[severity];
}

/**
 * Get severity order (higher number = higher severity)
 */
export function getSeverityOrder(severity: SeverityLevel): number {
  return SEVERITY_ORDER[severity];
}

/**
 * Compare two severity levels
 * @returns positive if a > b, negative if a < b, 0 if equal
 */
export function compareSeverity(a: SeverityLevel, b: SeverityLevel): number {
  return SEVERITY_ORDER[a] - SEVERITY_ORDER[b];
}
