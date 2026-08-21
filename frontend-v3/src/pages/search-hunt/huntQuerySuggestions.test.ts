import { describe, expect, it } from 'vitest';

import { getKqlHuntSuggestions, normalizeHuntQuery } from './huntQuerySuggestions';
import { foundationHuntFields } from './searchHunt.fixtures';

describe('Search & Hunt KQL suggestions', () => {
  it('maps a blank query to the bounded match-all query', () => {
    expect(normalizeHuntQuery('   ')).toBe('*:*');
    expect(normalizeHuntQuery(' host.name:server-01 ')).toBe('host.name:server-01');
  });

  it('suggests authorized schema fields for an empty editor', () => {
    const suggestions = getKqlHuntSuggestions('', foundationHuntFields);

    expect(suggestions[0]).toMatchObject({ kind: 'field', label: '@timestamp', nextValue: '@timestamp:' });
    expect(suggestions).toHaveLength(8);
  });

  it('suggests field values and then Boolean operators', () => {
    const values = getKqlHuntSuggestions('event.severity:c', foundationHuntFields);
    const operators = getKqlHuntSuggestions('event.severity:critical', foundationHuntFields);

    expect(values.map((suggestion) => suggestion.label)).toContain('critical');
    expect(operators.map((suggestion) => suggestion.label)).toEqual(['AND', 'OR']);
  });

  it('preserves the selected KQL conjunction when completing another field', () => {
    const suggestions = getKqlHuntSuggestions('event.severity:critical AND host', foundationHuntFields);

    expect(suggestions[0].nextValue).toBe('event.severity:critical AND host.name:');
  });
});
