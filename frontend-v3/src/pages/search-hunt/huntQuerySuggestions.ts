import type { HuntFieldDefinition } from './searchHunt.types';

export const DEFAULT_HUNT_QUERY = '*:*';

export type HuntQuerySuggestionKind = 'field' | 'value' | 'operator';

export interface HuntQuerySuggestion {
  id: string;
  label: string;
  detail: string;
  nextValue: string;
  kind: HuntQuerySuggestionKind;
}

export function normalizeHuntQuery(value: string): string {
  return value.trim() || DEFAULT_HUNT_QUERY;
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

function formatValue(value: string): string {
  const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return /[\s:()]/.test(value) ? `"${escaped}"` : escaped;
}

export function getKqlHuntSuggestions(expression: string, fields: HuntFieldDefinition[]): HuntQuerySuggestion[] {
  const { prefix, segment } = currentQuerySegment(expression);
  const trimmedSegment = segment.trimStart();
  const negatedPrefix = /^NOT\s+/i.test(trimmedSegment) ? 'NOT ' : '';
  const clauseText = trimmedSegment.replace(/^NOT\s+/i, '');
  const operatorMatch = clauseText.match(/^([@\w.]+)\s*(!=|>=|<=|>|<|:)\s*(.*)$/);

  if (!operatorMatch) {
    const needle = clauseText.toLocaleLowerCase();
    return fields
      .filter((field) => field.name.toLocaleLowerCase().includes(needle) || field.label.toLocaleLowerCase().includes(needle))
      .slice(0, 8)
      .map((field) => ({
        id: `hunt-field-${field.name}`,
        label: field.name,
        detail: `${field.label} · ${field.type} · KQL field`,
        nextValue: `${prefix}${negatedPrefix}${field.name}:`,
        kind: 'field' as const,
      }));
  }

  const [, fieldName, operator, rawValue] = operatorMatch;
  const field = fields.find((candidate) => candidate.name === fieldName);
  if (!field) return [];
  const valueNeedle = rawValue.trim().replace(/^["']|["']$/g, '').toLocaleLowerCase();
  const samples = field.sampleValues ?? [];
  const valueSuggestions: HuntQuerySuggestion[] = samples
    .filter((value) => value.toLocaleLowerCase().includes(valueNeedle))
    .slice(0, 7)
    .map((value) => ({
      id: `hunt-value-${field.name}-${value}`,
      label: value,
      detail: `${field.name}${operator}${formatValue(value)}`,
      nextValue: `${prefix}${negatedPrefix}${field.name}${operator}${formatValue(value)}`,
      kind: 'value' as const,
    }));

  if (!valueNeedle) {
    return [
      {
        id: `hunt-value-${field.name}-exists`,
        label: '*',
        detail: `${field.name} exists`,
        nextValue: `${prefix}${negatedPrefix}${field.name}${operator}*`,
        kind: 'value' as const,
      },
      ...valueSuggestions,
    ].slice(0, 8);
  }

  const hasExactSample = samples.some((value) => value.toLocaleLowerCase() === valueNeedle);
  if (valueSuggestions.length > 0 && !hasExactSample) return valueSuggestions;

  const normalized = expression.trimEnd();
  return [
    { id: 'hunt-operator-and', label: 'AND', detail: 'Require another KQL condition', nextValue: `${normalized} AND `, kind: 'operator' },
    { id: 'hunt-operator-or', label: 'OR', detail: 'Match either KQL condition', nextValue: `${normalized} OR `, kind: 'operator' },
  ];
}
