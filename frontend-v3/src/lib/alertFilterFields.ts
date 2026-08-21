/**
 * KQL-style filter field registry — used for autocomplete in AlertsListPage
 */

export interface AlertFilterField {
  field: string; // "severity"
  label: string; // "Severity"
  paramKey: string; // API query param name
  valueType: 'enum' | 'text' | 'ip';
  enumValues?: { label: string; value: string }[];
}

export const ALERT_FILTER_FIELDS: AlertFilterField[] = [
  {
    field: 'severity',
    label: 'Severity',
    paramKey: 'severity',
    valueType: 'enum',
    enumValues: [
      { label: 'Critical', value: 'critical' },
      { label: 'High', value: 'high' },
      { label: 'Medium', value: 'medium' },
      { label: 'Low', value: 'low' },
    ],
  },
  {
    field: 'status',
    label: 'Status',
    paramKey: 'status',
    valueType: 'enum',
    enumValues: [
      { label: 'Open', value: 'open' },
      { label: 'In review', value: 'in_review' },
      { label: 'True positive', value: 'true_positive' },
      { label: 'False positive', value: 'false_positive' },
      { label: 'Completed', value: 'completed' },
    ],
  },
  {
    field: 'title',
    label: 'Alert Title',
    paramKey: 'q',
    valueType: 'text',
  },
  {
    field: 'adversary.networkId',
    label: 'Source IP',
    paramKey: 'adversaryIp',
    valueType: 'ip',
  },
  {
    field: 'target.networkId',
    label: 'Destination IP',
    paramKey: 'targetIp',
    valueType: 'ip',
  },
  {
    field: 'category',
    label: 'Category',
    paramKey: 'category',
    valueType: 'text',
  },
  {
    field: 'tags',
    label: 'Tags',
    paramKey: 'tags',
    valueType: 'text',
  },
  {
    field: 'tenant',
    label: 'Tenant',
    paramKey: 'tenantId',
    valueType: 'text',
  },
  {
    field: 'assignee',
    label: 'Assignee',
    paramKey: 'assignee',
    valueType: 'enum',
    enumValues: [
      { label: 'Me', value: 'me' },
      { label: 'Unassigned', value: 'unassigned' },
    ],
  },
  {
    field: 'risk',
    label: 'Minimum risk',
    paramKey: 'riskMin',
    valueType: 'text',
  },
  {
    field: 'sla',
    label: 'SLA state',
    paramKey: 'sla',
    valueType: 'enum',
    enumValues: [
      { label: 'At risk', value: 'at_risk' },
      { label: 'Breached', value: 'breached' },
      { label: 'On track', value: 'on_track' },
    ],
  },
  {
    field: 'threat.intel',
    label: 'Threat intelligence',
    paramKey: 'threatIntel',
    valueType: 'enum',
    enumValues: [{ label: 'Matched', value: 'matched' }],
  },
];

export type AlertQueryJoin = 'AND' | 'OR';

export interface AlertQueryClause {
  field: string;
  paramKey: string;
  value: string;
  negated: boolean;
  contains: boolean;
}

export interface ParsedAlertQuery {
  clauses: AlertQueryClause[];
  joins: AlertQueryJoin[];
}

export interface AlertQuerySuggestion {
  id: string;
  label: string;
  detail: string;
  nextValue: string;
  kind: 'field' | 'value' | 'operator';
}

function splitQueryExpression(expression: string): { parts: string[]; joins: AlertQueryJoin[] } | null {
  const parts: string[] = [];
  const joins: AlertQueryJoin[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;

  for (let index = 0; index < expression.length; index += 1) {
    const character = expression[index];
    if ((character === '"' || character === "'") && expression[index - 1] !== '\\') {
      quote = quote === character ? null : quote === null ? character : quote;
      current += character;
      continue;
    }

    const remainder = expression.slice(index);
    const match = quote === null ? remainder.match(/^\s+(AND|OR)\s+/i) : null;
    if (match) {
      if (!current.trim()) return null;
      parts.push(current.trim());
      joins.push(match[1].toUpperCase() as AlertQueryJoin);
      current = '';
      index += match[0].length - 1;
      continue;
    }
    current += character;
  }

  if (quote !== null || !current.trim()) return null;
  parts.push(current.trim());
  return { parts, joins };
}

export function parseAlertQueryExpression(expression: string): ParsedAlertQuery | null {
  if (!expression.trim()) return { clauses: [], joins: [] };
  const split = splitQueryExpression(expression);
  if (!split) return null;

  const clauses: AlertQueryClause[] = [];
  for (const rawPart of split.parts) {
    const negated = /^NOT\s+/i.test(rawPart);
    const part = rawPart.replace(/^NOT\s+/i, '').trim();
    const colonIdx = part.indexOf(':');
    if (colonIdx <= 0) return null;

    const field = part.slice(0, colonIdx).trim().replace(/^"|"$/g, '');
    const fieldDef = ALERT_FILTER_FIELDS.find((candidate) => candidate.field === field);
    if (!fieldDef) return null;

    const rawValue = part.slice(colonIdx + 1).trim();
    if (!rawValue) return null;
    const quoteStart = rawValue[0] === '"' || rawValue[0] === "'" ? rawValue[0] : null;
    if (quoteStart && rawValue[rawValue.length - 1] !== quoteStart) return null;
    const unquoted = quoteStart ? rawValue.slice(1, -1) : rawValue;
    if (!unquoted) return null;
    const contains = unquoted.length > 2 && unquoted.startsWith('*') && unquoted.endsWith('*');
    const value = contains ? unquoted.slice(1, -1) : unquoted;
    if (!value) return null;

    clauses.push({ field, paramKey: fieldDef.paramKey, value, negated, contains });
  }

  return { clauses, joins: split.joins };
}

/**
 * Parse a KQL-style expression like "severity:critical AND status:open"
 * Returns: Record<string, string> of API params, or null if parse fails
 */
export function parseKqlToParams(expr: string): Record<string, string> | null {
  const parsed = parseAlertQueryExpression(expr);
  if (!parsed) return null;
  if (!parsed.clauses.length) return {};
  if (parsed.joins.includes('OR') || parsed.clauses.some((clause) => clause.negated || clause.contains)) {
    return { queryExpression: expr.trim() };
  }
  const result: Record<string, string> = {};
  for (const clause of parsed.clauses) {
    result[clause.paramKey] = clause.value;
  }
  return result;
}

function currentQuerySegment(expression: string): { prefix: string; segment: string } {
  let quote: '"' | "'" | null = null;
  let lastBoundary = 0;
  for (let index = 0; index < expression.length; index += 1) {
    const character = expression[index];
    if ((character === '"' || character === "'") && expression[index - 1] !== '\\') {
      quote = quote === character ? null : quote === null ? character : quote;
      continue;
    }
    if (quote !== null) continue;
    const match = expression.slice(index).match(/^\s+(AND|OR)\s+/i);
    if (match) {
      lastBoundary = index + match[0].length;
      index += match[0].length - 1;
    }
  }
  return { prefix: expression.slice(0, lastBoundary), segment: expression.slice(lastBoundary) };
}

function formatSuggestionValue(value: string): string {
  return /\s/.test(value) ? `"${value}"` : value;
}

export function getAlertQuerySuggestions(expression: string): AlertQuerySuggestion[] {
  const { prefix, segment } = currentQuerySegment(expression);
  const trimmedSegment = segment.trimStart();
  const negatedPrefix = /^NOT\s+/i.test(trimmedSegment) ? 'NOT ' : '';
  const clauseText = trimmedSegment.replace(/^NOT\s+/i, '');
  const colonIdx = clauseText.indexOf(':');

  if (colonIdx < 0) {
    const needle = clauseText.toLowerCase();
    return ALERT_FILTER_FIELDS
      .filter((field) => field.field.toLowerCase().includes(needle) || field.label.toLowerCase().includes(needle))
      .slice(0, 7)
      .map((field) => ({
        id: `field-${field.field}`,
        label: field.field,
        detail: field.label,
        nextValue: `${prefix}${negatedPrefix}${field.field}:`,
        kind: 'field' as const,
      }));
  }

  const fieldName = clauseText.slice(0, colonIdx).trim();
  const field = ALERT_FILTER_FIELDS.find((candidate) => candidate.field === fieldName);
  if (!field) return [];
  const valueNeedle = clauseText.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, '').toLowerCase();
  if (field.enumValues) {
    const values = field.enumValues
      .filter((candidate) => candidate.value.toLowerCase().includes(valueNeedle) || candidate.label.toLowerCase().includes(valueNeedle))
      .slice(0, 6)
      .map((candidate) => ({
        id: `value-${field.field}-${candidate.value}`,
        label: candidate.label,
        detail: `${field.field}:${candidate.value}`,
        nextValue: `${prefix}${negatedPrefix}${field.field}:${formatSuggestionValue(candidate.value)}`,
        kind: 'value' as const,
      }));
    if (values.length && !field.enumValues.some((candidate) => candidate.value.toLowerCase() === valueNeedle)) return values;
  }

  if (valueNeedle) {
    const normalized = expression.trimEnd();
    return ([
      { id: 'operator-and', label: 'AND', detail: 'Require another condition', nextValue: `${normalized} AND `, kind: 'operator' as const },
      { id: 'operator-or', label: 'OR', detail: 'Match either condition', nextValue: `${normalized} OR `, kind: 'operator' as const },
    ]);
  }
  return [];
}
