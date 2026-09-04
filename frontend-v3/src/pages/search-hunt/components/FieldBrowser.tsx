import { useDeferredValue, useEffect, useMemo, useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import {
  Braces, ChevronDown, ChevronLeft, ChevronRight, CircleMinus, CirclePlus, Plus, Search,
} from 'lucide-react';

import { fetchHuntFieldValues } from '../searchHunt.service';
import type { HuntFieldDefinition } from '../searchHunt.types';

import { HaFieldTypeIcon } from '@/components/ha-field-type-icon';

export interface FieldBrowserProps {
  fields: HuntFieldDefinition[];
  selectedFields: string[];
  searchId?: string;
  onAddField: (fieldName: string) => void;
  onInsertCondition: (fieldName: string, operator?: string, value?: string) => void;
  /** R5: toggle a value filter on/off (appends or strips the fragment; debounced auto-run upstream). */
  onFilterToggle?: (fragment: string, active: boolean) => void;
  loading?: boolean;
  unavailable?: boolean;
}

const CATEGORY_LABELS: Record<HuntFieldDefinition['category'], string> = {
  event: 'Event', host: 'Host', identity: 'Identity', network: 'Network', process: 'Process', source: 'Source', other: 'Other',
};

export function FieldBrowser({
  fields,
  selectedFields,
  searchId,
  onAddField,
  onInsertCondition,
  onFilterToggle,
  loading = false,
  unavailable = false,
}: FieldBrowserProps): JSX.Element {
  const [filter, setFilter] = useState('');
  // R5: which include/exclude fragments the analyst has toggled on, so the pills reflect applied state.
  const [appliedFilters, setAppliedFilters] = useState<Set<string>>(new Set());
  const applyToggle = (fragment: string, opposite: string): void => {
    setAppliedFilters((current) => {
      const next = new Set(current);
      if (next.has(fragment)) {
        next.delete(fragment);
        onFilterToggle?.(fragment, false);
      } else {
        // Prevent contradictory include+exclude of the same value: drop the opposite first.
        if (next.has(opposite)) {
          next.delete(opposite);
          onFilterToggle?.(opposite, false);
        }
        next.add(fragment);
        onFilterToggle?.(fragment, true);
      }
      return next;
    });
  };
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['event', 'host', 'identity', 'network']));
  const [expandedField, setExpandedField] = useState<string | null>(null);
  const [valueFilter, setValueFilter] = useState('');
  const deferredValueFilter = useDeferredValue(valueFilter);
  const [valueCursors, setValueCursors] = useState<Array<string | null>>([null]);
  const [valuePageIndex, setValuePageIndex] = useState(0);
  const valueCursor = valueCursors[valuePageIndex] ?? null;

  const grouped = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const visible = needle ? fields.filter((field) => `${field.name} ${field.label}`.toLowerCase().includes(needle)) : fields;
    return Object.entries(CATEGORY_LABELS).map(([category, label]) => ({
      category: category as HuntFieldDefinition['category'],
      label,
      fields: visible.filter((field) => field.category === category),
    })).filter((group) => group.fields.length > 0);
  }, [fields, filter]);

  const valuesQuery = useQuery({
    queryKey: ['hunt-field-values', searchId, expandedField, deferredValueFilter, valueCursor],
    queryFn: ({ signal }) => fetchHuntFieldValues(
      searchId ?? '',
      expandedField ?? '',
      valueCursor,
      deferredValueFilter.trim(),
      signal,
    ),
    enabled: Boolean(searchId && expandedField),
    staleTime: 30_000,
    gcTime: 2 * 60_000,
    retry: false,
  });

  useEffect(() => {
    setValueCursors([null]);
    setValuePageIndex(0);
  }, [deferredValueFilter, expandedField, searchId]);

  const toggle = (category: string): void => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category); else next.add(category);
      return next;
    });
  };

  const toggleField = (fieldName: string): void => {
    setExpandedField((current) => current === fieldName ? null : fieldName);
    setValueFilter('');
  };

  const nextValuePage = (): void => {
    const nextCursor = valuesQuery.data?.nextCursor;
    if (!nextCursor || valuesQuery.isFetching) return;
    setValueCursors((current) => [...current.slice(0, valuePageIndex + 1), nextCursor]);
    setValuePageIndex((current) => current + 1);
  };

  return (
    <aside className="hunt-field-browser" aria-label="Filter and field browser">
      <header className="hunt-field-browser__header">
        <div><Braces size={15} aria-hidden="true" /><strong>Fields &amp; values</strong></div>
        <span>{fields.length} fields</span>
      </header>
      <label className="hunt-field-browser__search">
        <Search size={13} aria-hidden="true" />
        <span className="hunt-sr-only">Filter available fields</span>
        <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter fields" />
        <kbd>/</kbd>
      </label>
      <div className="hunt-field-browser__legend"><span>FIELD</span></div>
      <div className="hunt-field-browser__list">
        {loading && <div className="hunt-rail-state">Loading authorized fields…</div>}
        {unavailable && !loading && <div className="hunt-rail-state" role="status">Field metadata is unavailable. Query execution can continue with known fields.</div>}
        {!loading && !unavailable && grouped.map((group) => {
          const isExpanded = expanded.has(group.category) || Boolean(filter);
          return (
            <section key={group.category} className="hunt-field-group">
              <button type="button" className="hunt-field-group__toggle" onClick={() => toggle(group.category)} aria-expanded={isExpanded}>
                {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                <span>{group.label}</span><em>{group.fields.length}</em>
              </button>
              {isExpanded && <ul>{group.fields.map((field) => {
                const fieldIsExpanded = expandedField === field.name;
                const valuesId = `hunt-field-values-${field.name.replace(/[^a-z0-9]/gi, '-')}`;
                return (
                  <li key={field.name} data-expanded={fieldIsExpanded || undefined}>
                    <button
                      type="button"
                      className="hunt-field-row"
                      onClick={() => toggleField(field.name)}
                      title={`${field.description} Operators: ${field.operators.join(', ')}`}
                      aria-expanded={fieldIsExpanded}
                      aria-controls={valuesId}
                    >
                      <span><HaFieldTypeIcon type={field.type} className="hunt-field-row__type-icon" /><span className="hunt-field-row__text"><strong>{field.name}</strong><small>{field.type}</small></span></span>
                    </button>
                    <button type="button" className="hunt-field-row__add" onClick={() => onAddField(field.name)} disabled={selectedFields.includes(field.name)} aria-label={`Add ${field.name} as a result column`} title="Add result column">
                      <Plus size={12} aria-hidden="true" />
                    </button>
                    {fieldIsExpanded && <div className="hunt-field-values-panel" id={valuesId}>
                      <div className="hunt-field-values-panel__summary">
                        <span>{valuesQuery.data?.totalDistinctApproximate !== null && valuesQuery.data?.totalDistinctApproximate !== undefined
                          ? `${valuesQuery.data.totalIsExact ? '' : 'About '}${valuesQuery.data.totalDistinctApproximate.toLocaleString()} values`
                          : 'Top values'}</span>
                        <button type="button" onClick={() => onInsertCondition(field.name)} title={`Filter to events where ${field.name} exists`}>Exists</button>
                      </div>
                      {searchId ? <>
                        <label className="hunt-field-value-search">
                          <Search size={12} aria-hidden="true" />
                          <span className="hunt-sr-only">Find a value for {field.label}</span>
                          <input value={valueFilter} onChange={(event) => setValueFilter(event.target.value)} placeholder="Find a value" />
                        </label>
                        {valuesQuery.isLoading && <div className="hunt-field-values-state">Loading values…</div>}
                        {valuesQuery.isError && <div className="hunt-field-values-state" role="status">Values are unavailable for this field.</div>}
                        {!valuesQuery.isLoading && !valuesQuery.isError && valuesQuery.data?.state !== 'available' && <div className="hunt-field-values-state" role="status">Value statistics are {valuesQuery.data?.state.replace('_', ' ')}.</div>}
                        {!valuesQuery.isLoading && !valuesQuery.isError && valuesQuery.data?.state === 'available' && (() => {
                          const items = valuesQuery.data.items;
                          const maxCount = items.reduce((max, it) => Math.max(max, it.count), 0) || 1;
                          return <>
                          <div className="hunt-field-value-list">
                            {items.length === 0 && <div className="hunt-field-values-state">No values match this filter.</div>}
                            {items.map((item) => {
                              const includeActive = appliedFilters.has(item.includeQuery);
                              const excludeActive = appliedFilters.has(item.excludeQuery);
                              const pct = Math.round((item.count / maxCount) * 100);
                              return <div key={item.value} className="hunt-field-value-row" style={{ ['--hunt-value-bar' as string]: `${pct}%` }}>
                                <code title={item.value}>{item.value}</code>
                                <span className="hunt-field-value-count" title={item.countIsExact ? 'Exact event count' : 'Approximate event count'}>{item.countIsExact ? '' : '~'}{item.count.toLocaleString()}</span>
                                <button type="button" className="hunt-field-value-pill" data-active={includeActive || undefined} aria-pressed={includeActive} onClick={() => applyToggle(item.includeQuery, item.excludeQuery)} aria-label={`${includeActive ? 'Remove include filter for' : 'Include'} ${item.value}`} title={includeActive ? 'Remove include filter' : 'Include value'}><CirclePlus size={13} /></button>
                                <button type="button" className="hunt-field-value-pill" data-active={excludeActive || undefined} aria-pressed={excludeActive} onClick={() => applyToggle(item.excludeQuery, item.includeQuery)} aria-label={`${excludeActive ? 'Remove exclude filter for' : 'Exclude'} ${item.value}`} title={excludeActive ? 'Remove exclude filter' : 'Exclude value'}><CircleMinus size={13} /></button>
                              </div>;
                            })}
                          </div>
                          {(valuePageIndex > 0 || valuesQuery.data.hasMore) && <div className="hunt-field-value-pagination">
                            <button type="button" onClick={() => setValuePageIndex((current) => Math.max(0, current - 1))} disabled={valuePageIndex === 0 || valuesQuery.isFetching} aria-label="Previous field values"><ChevronLeft size={13} /></button>
                            <span>Page {valuePageIndex + 1}</span>
                            <button type="button" onClick={nextValuePage} disabled={!valuesQuery.data.nextCursor || valuesQuery.isFetching} aria-label="Next field values"><ChevronRight size={13} /></button>
                          </div>}
                        </>;
                        })()}
                      </> : <div className="hunt-field-values-state">Run a hunt to calculate values for the authorized result snapshot.</div>}
                    </div>}
                  </li>
                );
              })}</ul>}
            </section>
          );
        })}
      </div>
    </aside>
  );
}
