import { useCallback, useEffect, useMemo, useState } from 'react';

import { useMutation, useQuery } from '@tanstack/react-query';
import { Download, Info, Save } from 'lucide-react';

import { PivotBreadcrumb, type PivotStep } from './PivotBreadcrumb';
import type { PivotCellAction } from './PivotCellMenu';
import { PivotFiltersShelf } from './PivotFiltersShelf';
import { PivotMatrix } from './PivotMatrix';
import { PivotShelves } from './PivotShelves';
import { PivotTemplatesMenu } from './PivotTemplatesMenu';
import { SuggestedPivots } from './SuggestedPivots';
import { explainPivot, explainCell } from '../lib/explainPivot';
import { validatePivotTemplate, type PivotTemplate } from '../lib/pivotTemplates';
import { buildSavedPivotFilters } from '../lib/savedPivot';
import { suggestPivots, type SuggestedPivot } from '../lib/suggestedPivots';
import { buildCrosstabCsv, crosstabCsvFilename } from '../pivotCsv';
import { createSavedHunt, fetchHuntCrosstab, fetchHuntFieldStats } from '../searchHunt.service';
import type {
  HuntCrosstabRequest,
  HuntFieldDefinition,
  HuntPivotConfig,
  HuntSearchRequest,
} from '../searchHunt.types';

const STORAGE_KEY = 'ha_hunt_pivot_config';
const CONFIG_VERSION = 1;

export interface HuntPivotViewProps {
  /** The committed hunt request — supplies query/time/index/tenant scope inherited by the crosstab. */
  committed: HuntSearchRequest;
  /** Schema fields for the builder shelves (from fetchHuntSchema). */
  fields: HuntFieldDefinition[];
  /** Current tenant id — guards the remembered config across tenant switches. */
  tenantId: number | null;
  /** Active completed search snapshot id — enables per-field coverage/cardinality on the shelves (P1.1). */
  searchId?: string | null;
  /** Optional config to seed the shelves from — e.g. a loaded Saved Pivot. Overrides localStorage. */
  initialConfig?: HuntPivotConfig | null;
  /** Whether the current user may save (create) a Saved Pivot. */
  canSave?: boolean;
  /** Cell action: Keep/Exclude modify the hunt query; Drill switches to Table; Copy is clipboard. */
  onCellAction: (action: PivotCellAction, rowField: string, colField: string, rowValue: string, colValue: string, value: number) => void;
}

function defaultConfig(tenantId: number | null): HuntPivotConfig {
  return { v: CONFIG_VERSION, tenantId, rowField: 'host.name', colField: 'event.action', valueFn: 'count', distinctField: null };
}

/** Safely quote a KQL value (mirrors the hunt page's cell-quoting). */
function quoteKql(value: string): string {
  const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return /[\s:()]/.test(value) ? `"${escaped}"` : escaped;
}

/** Compose the committed query with the pivot-local filter clauses (all AND-ed). */
function composePivotQuery(baseQuery: string, filters: string[]): string {
  const parts = [baseQuery.trim(), ...filters].filter((p) => p.length > 0);
  return parts.join(' AND ');
}

function loadConfig(tenantId: number | null): HuntPivotConfig {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return defaultConfig(tenantId);
    const parsed = JSON.parse(saved) as HuntPivotConfig;
    // Drop stale (version bump) or foreign-tenant config — never restore across a tenant boundary.
    if (parsed.v !== CONFIG_VERSION || parsed.tenantId !== tenantId) return defaultConfig(tenantId);
    return parsed;
  } catch {
    return defaultConfig(tenantId);
  }
}

/**
 * Investigation Pivot view (PR-B P1): the third Search & Hunt result mode.
 *
 * <p>Owns the crosstab builder config, runs the server-side crosstab over the full pivot-eligible
 * matched set, and renders shelves + toolbar + honest scope note + matrix + every state. The matrix
 * never sums cells to totals (totalSemantics.additive is false).
 */
export function HuntPivotView({ committed, fields, tenantId, searchId, initialConfig, canSave = true, onCellAction }: HuntPivotViewProps): JSX.Element {
  const [config, setConfig] = useState<HuntPivotConfig>(() => initialConfig ?? loadConfig(tenantId));
  const [heat, setHeat] = useState(true);
  // P2: compare each cell against the previous period (same width, immediately prior window).
  const [compare, setCompare] = useState(false);
  // P2 Strand B: mark user.name rows with their existing UEBA z-score (no-op for other row axes).
  const [deviate, setDeviate] = useState(false);
  // P3 PR 2: show a deterministic plain-language explanation of the current pivot.
  const [explainOpen, setExplainOpen] = useState(false);
  // P3 PR 2: a one-line explanation of a specific cell, shown when the analyst picks "Explain this cell".
  const [cellExplanation, setCellExplanation] = useState<string | null>(null);
  // Pivot-local scratch filters: extra KQL clauses AND-ed into the crosstab request query only.
  // They narrow the crosstab without touching the committed hunt query. Ephemeral (not persisted).
  const [pivotFilters, setPivotFilters] = useState<string[]>([]);

  // P1.1 investigation path: the Pivot Further breadcrumb. steps[0] is the root (un-narrowed) pivot; each
  // Pivot Further pushes a step capturing the scope + config being left. Ephemeral (not persisted / saved).
  const [steps, setSteps] = useState<PivotStep[]>([]);

  // P1.1 field intelligence: per-field coverage %/cardinality for the active search snapshot, shown on
  // the shelves so the analyst can predict a sparse or heavily-truncated pivot before running it. Same
  // query key as FieldBrowser → TanStack dedupes to one network call and a shared cache.
  const fieldStatsQuery = useQuery({
    queryKey: ['hunt-field-stats', searchId],
    queryFn: ({ signal }) => fetchHuntFieldStats(searchId ?? '', signal),
    enabled: Boolean(searchId),
    staleTime: 30_000,
    gcTime: 2 * 60_000,
    retry: false,
  });
  const statByField = useMemo(() => {
    const map = new Map<string, { coverage: number | null; cardinality: number }>();
    for (const stat of fieldStatsQuery.data?.fields ?? []) {
      map.set(stat.name, { coverage: stat.coverage, cardinality: stat.cardinality });
    }
    return map;
  }, [fieldStatsQuery.data]);

  // P1.1 templates: applying a curated template validates its fields against the live schema, drops any
  // ineligible axis (never applies a broken pivot), sets the config, and surfaces dropped-field warnings.
  // A template only sets axes/measure — it never touches the committed hunt query.
  const [templateWarnings, setTemplateWarnings] = useState<string[]>([]);
  const applyTemplate = useCallback((template: PivotTemplate) => {
    const { config: applied, warnings } = validatePivotTemplate(template, fields, tenantId);
    setConfig(applied);
    setTemplateWarnings(warnings);
  }, [fields, tenantId]);

  // P3 PR 1: deterministic Suggested Pivots — ranked from the field stats + template catalogue (no LLM).
  // Applying a suggestion fills the shelves via the same path as a template; it never auto-runs.
  const suggestions = useMemo(
    () => suggestPivots(fields, statByField, tenantId, 3),
    [fields, statByField, tenantId],
  );
  const applySuggestion = useCallback((s: SuggestedPivot) => {
    setConfig(s.config);
    setTemplateWarnings([]);
  }, []);

  // Save-pivot dialog state.
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveShared, setSaveShared] = useState(false);
  const saveMutation = useMutation({
    mutationFn: () => createSavedHunt({
      name: saveName.trim(),
      query: committed.query,
      tags: [],
      shared: saveShared,
      filters: buildSavedPivotFilters(config) as unknown as Record<string, unknown>,
    }),
    onSuccess: () => {
      setSaveOpen(false);
      setSaveName('');
      setSaveShared(false);
    },
  });

  // Adopt a newly-supplied initialConfig (e.g. loading a different Saved Pivot).
  useEffect(() => {
    if (initialConfig) setConfig(initialConfig);
  }, [initialConfig]);

  // Re-seed when the tenant changes (cache is flushed elsewhere; local config must not leak across tenants).
  useEffect(() => {
    setConfig((cur) => (cur.tenantId === tenantId ? cur : loadConfig(tenantId)));
  }, [tenantId]);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(config)); } catch { /* ignore */ }
  }, [config]);

  // Which axis fields are dates — a date axis requires a bucket interval before it can run.
  const dateFieldNames = useMemo(
    () => new Set(fields.filter((f) => f.type === 'date').map((f) => f.name)),
    [fields],
  );
  const rowIsDate = config.rowField != null && dateFieldNames.has(config.rowField);
  const colIsDate = config.colField != null && dateFieldNames.has(config.colField);

  const ready = Boolean(
    config.rowField && config.colField &&
    (config.valueFn === 'count' || (config.valueFn === 'distinct' && config.distinctField)) &&
    // A date axis is only runnable once an interval is chosen (server rejects an unbucketed date axis).
    (!rowIsDate || config.rowBucketInterval) &&
    (!colIsDate || config.colBucketInterval),
  );

  const request: HuntCrosstabRequest | null = useMemo(() => {
    if (!ready) return null;
    return {
      query: composePivotQuery(committed.query, pivotFilters),
      language: 'kql',
      timeRange: committed.timeRange,
      tenantScope: committed.tenantScope,
      indexType: committed.indexPattern ?? 'all',
      rowField: config.rowField as string,
      colField: config.colField as string,
      valueFn: config.valueFn,
      distinctField: config.valueFn === 'distinct' ? (config.distinctField ?? undefined) : undefined,
      rowSize: 20,
      colSize: 20,
      rowBucket: rowIsDate && config.rowBucketInterval ? { interval: config.rowBucketInterval } : undefined,
      colBucket: colIsDate && config.colBucketInterval ? { interval: config.colBucketInterval } : undefined,
      rowMissing: config.rowMissing ?? 'omit',
      colMissing: config.colMissing ?? 'omit',
      comparison: compare ? { mode: 'previous_period' } : undefined,
      deviation: deviate ? true : undefined,
    };
  }, [ready, committed, config, pivotFilters, rowIsDate, colIsDate, compare, deviate]);

  const crosstabQuery = useQuery({
    queryKey: ['hunt-pivot', committed, config.rowField, config.colField, config.valueFn, config.distinctField, config.rowBucketInterval, config.colBucketInterval, config.rowMissing, config.colMissing, pivotFilters, compare, deviate],
    queryFn: ({ signal }) => fetchHuntCrosstab(request as HuntCrosstabRequest, signal),
    enabled: ready && committed.query.length > 0,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    placeholderData: (previous) => previous,
    retry: false,
  });

  const data = crosstabQuery.data ?? null;

  // P3 PR 2: deterministic plain-language explanation of the current pivot (no AI provider needed).
  const explanation = useMemo(
    () => (data && config.rowField && config.colField ? explainPivot(data, config.rowField, config.colField) : []),
    [data, config.rowField, config.colField],
  );

  const onExport = useCallback(() => {
    if (!data || !config.rowField || !config.colField) return;
    const csv = buildCrosstabCsv(data, config.rowField, config.colField);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = crosstabCsvFilename(config.rowField, config.colField, config.valueFn);
    a.click();
    URL.revokeObjectURL(url);
  }, [data, config]);

  const swap = useCallback(() => {
    setConfig((c) => ({
      ...c,
      rowField: c.colField, colField: c.rowField,
      rowBucketInterval: c.colBucketInterval ?? null, colBucketInterval: c.rowBucketInterval ?? null,
      rowMissing: c.colMissing ?? 'omit', colMissing: c.rowMissing ?? 'omit',
    }));
  }, []);

  // Intercept the pivot-local "Filter this Pivot" + "Pivot further" actions here (state lives in this
  // view); forward every other action (drill/keep/exclude/copy/entity/timeline/evidence/incident) up.
  const handleCell = useCallback(
    (action: PivotCellAction, rowField: string, colField: string, rowValue: string, colValue: string, value: number) => {
      if (action === 'filter_pivot') {
        const clause = `(${rowField}:${quoteKql(rowValue)} AND ${colField}:${quoteKql(colValue)})`;
        setPivotFilters((cur) => (cur.includes(clause) ? cur : [...cur, clause]));
        return;
      }
      if (action === 'explain_cell') {
        if (data) {
          const cell = data.cells.find((c) => c.row === rowValue && c.col === colValue);
          setCellExplanation(explainCell(data, rowField, colField, rowValue, colValue, value, cell));
          setExplainOpen(true);
        }
        return;
      }
      if (action === 'pivot_further') {
        // Pin the cell as a pivot-local scope, record the step being LEFT, then reset the axes so the
        // analyst picks a new breakdown WITHIN the scoped subset. Never touches the committed hunt query.
        const clause = `(${rowField}:${quoteKql(rowValue)} AND ${colField}:${quoteKql(colValue)})`;
        const label = `${rowField} = ${rowValue} × ${colField} = ${colValue}`;
        setSteps((cur) => {
          const base: PivotStep[] = cur.length === 0
            ? [{ id: 'root', label: 'All results', scopeFilters: pivotFilters, config }]
            : cur;
          return [...base, { id: `step-${base.length}-${Date.now()}`, label, scopeFilters: [...(base[base.length - 1].scopeFilters), clause], config }];
        });
        setPivotFilters((cur) => (cur.includes(clause) ? cur : [...cur, clause]));
        setConfig((c) => ({ ...c, rowField: null, colField: null, rowBucketInterval: null, colBucketInterval: null, rowMissing: 'omit', colMissing: 'omit' }));
        return;
      }
      onCellAction(action, rowField, colField, rowValue, colValue, value);
    },
    [onCellAction, pivotFilters, config, data],
  );

  // Restore an earlier breadcrumb step: reinstate its scope + config and truncate the deeper trail.
  const navigateToStep = useCallback((index: number) => {
    setSteps((cur) => {
      const target = cur[index];
      if (!target) return cur;
      setPivotFilters(target.scopeFilters);
      setConfig(target.config);
      // Truncating to a single remaining step (the root) collapses the breadcrumb entirely.
      return index === 0 ? [] : cur.slice(0, index + 1);
    });
  }, []);

  // A fresh committed-query change starts a new investigation — reset the breadcrumb to root.
  useEffect(() => {
    setSteps([]);
  }, [committed.query]);

  // ---- states ----
  if (committed.query.length === 0) {
    return <div className="pivot-state">Run a hunt first, then break the results down by two fields.</div>;
  }

  return (
    <div className="pivot-view">
      <PivotBreadcrumb steps={steps} onNavigate={navigateToStep} />
      <SuggestedPivots suggestions={suggestions} onApply={applySuggestion} />
      <PivotShelves
        fields={fields}
        rowField={config.rowField}
        colField={config.colField}
        valueFn={config.valueFn}
        distinctField={config.distinctField}
        rowBucketInterval={config.rowBucketInterval ?? null}
        colBucketInterval={config.colBucketInterval ?? null}
        rowMissing={config.rowMissing ?? 'omit'}
        colMissing={config.colMissing ?? 'omit'}
        statByField={statByField}
        onSetRow={(f) => setConfig((c) => ({ ...c, rowField: f, rowBucketInterval: null, rowMissing: 'omit' }))}
        onSetCol={(f) => setConfig((c) => ({ ...c, colField: f, colBucketInterval: null, colMissing: 'omit' }))}
        onSetValueFn={(fn) => setConfig((c) => ({ ...c, valueFn: fn }))}
        onSetDistinctField={(f) => setConfig((c) => ({ ...c, distinctField: f }))}
        onSetRowBucketInterval={(i) => setConfig((c) => ({ ...c, rowBucketInterval: i }))}
        onSetColBucketInterval={(i) => setConfig((c) => ({ ...c, colBucketInterval: i }))}
        onSetRowMissing={(m) => setConfig((c) => ({ ...c, rowMissing: m }))}
        onSetColMissing={(m) => setConfig((c) => ({ ...c, colMissing: m }))}
        onSwap={swap}
      />

      <PivotFiltersShelf
        filters={pivotFilters}
        onRemove={(index) => setPivotFilters((cur) => cur.filter((_, i) => i !== index))}
        onClear={() => setPivotFilters([])}
      />

      <div className="pivot-toolbar">
        <label className="pivot-toolbar__heat">
          <input type="checkbox" checked={heat} onChange={(e) => setHeat(e.target.checked)} /> Heat
        </label>
        <label className="pivot-toolbar__heat">
          <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} /> Compare to previous period
        </label>
        {config.rowField === 'user.name' && (
          <label className="pivot-toolbar__heat" title="Mark each user row with its existing UEBA peer-baseline z-score">
            <input type="checkbox" checked={deviate} onChange={(e) => setDeviate(e.target.checked)} /> UEBA deviation
          </label>
        )}
        <PivotTemplatesMenu fields={fields} onApply={applyTemplate} />
        <button
          type="button"
          className="pivot-toolbar__templates"
          aria-pressed={explainOpen}
          onClick={() => setExplainOpen((o) => { if (o) setCellExplanation(null); return !o; })}
          disabled={!data}
          title="Explain this pivot in plain language"
        >
          <Info size={13} aria-hidden="true" /> Explain
        </button>
        {canSave && (
          <button type="button" className="pivot-toolbar__save" onClick={() => setSaveOpen(true)} disabled={!ready} title="Save this pivot for later">
            <Save size={13} aria-hidden="true" /> Save pivot
          </button>
        )}
        <button type="button" className="pivot-toolbar__export" onClick={onExport} disabled={!data} title="Export the crosstab as CSV">
          <Download size={13} aria-hidden="true" /> Export CSV
        </button>
      </div>

      {templateWarnings.length > 0 && (
        <p className="pivot-template-warning" role="note">
          {templateWarnings.join(' ')}
        </p>
      )}

      {explainOpen && explanation.length > 0 && (
        <div className="pivot-explain" role="note" aria-label="Pivot explanation">
          <ul>
            {cellExplanation && <li className="pivot-explain__cell">{cellExplanation}</li>}
            {explanation.map((line, i) => <li key={i}>{line}</li>)}
          </ul>
        </div>
      )}

      {saveOpen && (
        <div className="pivot-save" role="dialog" aria-modal="true" aria-label="Save pivot">
          <input
            type="text"
            className="pivot-save__name"
            placeholder="Name this pivot…"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            aria-label="Pivot name"
            autoFocus
          />
          <label className="pivot-save__shared">
            <input type="checkbox" checked={saveShared} onChange={(e) => setSaveShared(e.target.checked)} /> Share with my team
          </label>
          <div className="pivot-save__actions">
            <button type="button" onClick={() => saveMutation.mutate()} disabled={!saveName.trim() || saveMutation.isPending}>
              {saveMutation.isPending ? 'Saving…' : 'Save'}
            </button>
            <button type="button" onClick={() => setSaveOpen(false)}>Cancel</button>
          </div>
          {saveMutation.isError && <p className="pivot-save__error" role="alert">Could not save the pivot.</p>}
        </div>
      )}

      {data && (
        <div className="pivot-scope-note" aria-live="polite">
          {data.pivotEligibleMatched.toLocaleString()} pivot-eligible of {data.totalMatched.toLocaleString()} matched
          {' · '}{data.rowKeys.length}×{data.colKeys.length}
          {' · '}{data.execution.tookMs} ms
          {data.axisSelection.approximate ? ' · top values ≈' : ''}
          {data.status === 'PARTIAL' ? ' · partial data' : ''}
        </div>
      )}

      {(data?.rowTruncated || data?.colTruncated) && (
        <div className="pivot-truncation" role="note">
          Showing top {data.rowKeys.length} of {data.rowCardinalityEstimate.toLocaleString()} {config.rowField} and
          top {data.colKeys.length} of {data.colCardinalityEstimate.toLocaleString()} {config.colField} — narrow the query to see all.
        </div>
      )}

      {data?.status === 'PARTIAL' && (
        <div className="pivot-partial" role="alert">
          Pivot computed with partial data — {data.partialFailures.length} source(s) reported issues.
        </div>
      )}

      {!ready ? (
        <div className="pivot-state">Drag a field into Rows and Columns{config.valueFn === 'distinct' ? ', and choose a distinct-count field' : ''} to build the crosstab.</div>
      ) : crosstabQuery.isError ? (
        <div className="pivot-state pivot-state--error">
          Could not compute the crosstab. <button type="button" onClick={() => crosstabQuery.refetch()}>Retry</button>
        </div>
      ) : crosstabQuery.isFetching && !data ? (
        <div className="pivot-state pivot-state--loading" aria-label="Computing crosstab"><span /><span /><span /></div>
      ) : data && data.rowKeys.length === 0 ? (
        <div className="pivot-state">No combinations matched — every matching event is missing {config.rowField} or {config.colField}.</div>
      ) : data ? (
        <PivotMatrix
          data={data}
          rowField={config.rowField as string}
          colField={config.colField as string}
          heat={heat}
          onCellAction={(action, rowValue, colValue, value) =>
            handleCell(action, config.rowField as string, config.colField as string, rowValue, colValue, value)}
        />
      ) : null}
    </div>
  );
}
