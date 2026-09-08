import { useCallback, useEffect, useMemo, useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';

import type { PivotCellAction } from './PivotCellMenu';
import { PivotMatrix } from './PivotMatrix';
import { PivotShelves } from './PivotShelves';
import { buildCrosstabCsv, crosstabCsvFilename } from '../pivotCsv';
import { fetchHuntCrosstab } from '../searchHunt.service';
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
  /** Cell action: Keep/Exclude modify the hunt query; Drill switches to Table; Copy is clipboard. */
  onCellAction: (action: PivotCellAction, rowField: string, colField: string, rowValue: string, colValue: string, value: number) => void;
}

function defaultConfig(tenantId: number | null): HuntPivotConfig {
  return { v: CONFIG_VERSION, tenantId, rowField: 'host.name', colField: 'event.action', valueFn: 'count', distinctField: null };
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
export function HuntPivotView({ committed, fields, tenantId, onCellAction }: HuntPivotViewProps): JSX.Element {
  const [config, setConfig] = useState<HuntPivotConfig>(() => loadConfig(tenantId));
  const [heat, setHeat] = useState(true);

  // Re-seed when the tenant changes (cache is flushed elsewhere; local config must not leak across tenants).
  useEffect(() => {
    setConfig((cur) => (cur.tenantId === tenantId ? cur : loadConfig(tenantId)));
  }, [tenantId]);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(config)); } catch { /* ignore */ }
  }, [config]);

  const ready = Boolean(
    config.rowField && config.colField &&
    (config.valueFn === 'count' || (config.valueFn === 'distinct' && config.distinctField)),
  );

  const request: HuntCrosstabRequest | null = useMemo(() => {
    if (!ready) return null;
    return {
      query: committed.query,
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
    };
  }, [ready, committed, config]);

  const crosstabQuery = useQuery({
    queryKey: ['hunt-pivot', committed, config.rowField, config.colField, config.valueFn, config.distinctField],
    queryFn: ({ signal }) => fetchHuntCrosstab(request as HuntCrosstabRequest, signal),
    enabled: ready && committed.query.length > 0,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    placeholderData: (previous) => previous,
    retry: false,
  });

  const data = crosstabQuery.data ?? null;

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
    setConfig((c) => ({ ...c, rowField: c.colField, colField: c.rowField }));
  }, []);

  // ---- states ----
  if (committed.query.length === 0) {
    return <div className="pivot-state">Run a hunt first, then break the results down by two fields.</div>;
  }

  return (
    <div className="pivot-view">
      <PivotShelves
        fields={fields}
        rowField={config.rowField}
        colField={config.colField}
        valueFn={config.valueFn}
        distinctField={config.distinctField}
        onSetRow={(f) => setConfig((c) => ({ ...c, rowField: f }))}
        onSetCol={(f) => setConfig((c) => ({ ...c, colField: f }))}
        onSetValueFn={(fn) => setConfig((c) => ({ ...c, valueFn: fn }))}
        onSetDistinctField={(f) => setConfig((c) => ({ ...c, distinctField: f }))}
        onSwap={swap}
      />

      <div className="pivot-toolbar">
        <label className="pivot-toolbar__heat">
          <input type="checkbox" checked={heat} onChange={(e) => setHeat(e.target.checked)} /> Heat
        </label>
        <button type="button" className="pivot-toolbar__export" onClick={onExport} disabled={!data} title="Export the crosstab as CSV">
          <Download size={13} aria-hidden="true" /> Export CSV
        </button>
      </div>

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
            onCellAction(action, config.rowField as string, config.colField as string, rowValue, colValue, value)}
        />
      ) : null}
    </div>
  );
}
