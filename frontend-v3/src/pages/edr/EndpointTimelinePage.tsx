/**
 * EndpointTimelinePage — T02
 *
 * Chronological EDR events page at /edr/timeline/:agentId.
 *
 * Layout:
 *   • Filter bar — date range, event type multi-select, severity filter
 *   • TimelineChart (ECharts scatter)
 *   • AG Grid events table (rowHeight=32)
 *   • Detail Drawer (400 px) — read-only Monaco JSON editor + optional process tree
 *
 * Key constraints:
 *   - No `any` type annotations
 *   - No raw hex colour literals
 *   - No `var(--ha-*)` strings passed into ECharts
 *   - No absolute backend URLs
 */

import { lazy, Suspense, useCallback, useMemo, useState } from 'react';

import { Alert } from '@patternfly/react-core';
import type { ColDef } from 'ag-grid-community';
import { Activity } from 'lucide-react';
import { useParams } from 'react-router-dom';

import { ProcessTree } from '@/components/edr/ProcessTree';
import { TimelineChart } from '@/components/edr/TimelineChart';
import { HaDrawer } from '@/components/ha-drawer/HaDrawer';
import { HaModal } from '@/components/ha-modal/HaModal';
import { SiemDataGrid } from '@/components/siem-data-grid';
import { useEdrTimeline } from '@/hooks/useEdrTimeline';
import { useProcessTree } from '@/hooks/useProcessTree';
import { ROW_HEIGHTS, useRowDensity } from '@/hooks/useRowDensity';
import { defineHiveArmorMonacoTheme } from '@/lib/monacoTheme';
import { useThemeStore } from '@/store/theme.store';
import type { EdrEventDTO, EdrEventType, EdrTimelineQuery } from '@/types/edr';

// Lazy-load Monaco to avoid blocking the initial bundle
const Editor = lazy(() => import('@monaco-editor/react'));

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EDR_EVENT_TYPES: EdrEventType[] = [
  'process_start',
  'process_end',
  'network_connect',
  'network_listen',
  'file_create',
  'file_modify',
  'file_delete',
  'registry_set',
  'registry_delete',
  'user_logon',
  'user_logoff',
];

const DEFAULT_PAGE_SIZE = 50;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nowIso(): string {
  return new Date().toISOString();
}

function minus24hIso(): string {
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function severityLabel(severity: number): string {
  if (severity >= 90) return 'Critical';
  if (severity >= 70) return 'High';
  if (severity >= 40) return 'Medium';
  return 'Low';
}

// ---------------------------------------------------------------------------
// Skeleton rows for loading state
// ---------------------------------------------------------------------------

function SkeletonRow(): JSX.Element {
  return (
    <div
      style={{
        height: 32,
        background: 'var(--ha-surface-raised)',
        borderRadius: 4,
        marginBottom: 4,
        animation: 'ha-pulse 1.4s ease-in-out infinite',
        opacity: 0.6,
      }}
    />
  );
}

function SkeletonRows({ count }: { count: number }): JSX.Element {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonRow key={i} />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// ProcessTree modal (inner component — only mounts when an event is selected)
// ---------------------------------------------------------------------------

interface ProcessTreeModalProps {
  agentId: string;
  event: EdrEventDTO;
  onClose: () => void;
}

function ProcessTreeModal({ agentId, event, onClose }: ProcessTreeModalProps): JSX.Element {
  const { roots, isLoading, isError } = useProcessTree({
    agentId,
    timestamp: event.timestamp,
    windowMinutes: 10,
  });

  return (
    <HaModal
      isOpen
      onClose={onClose}
      title="Process Tree"
      width={800}
    >
      <div style={{ minHeight: 400 }}>
        <ProcessTree
          processes={roots}
          isLoading={isLoading}
          isError={isError}
        />
      </div>
    </HaModal>
  );
}

// ---------------------------------------------------------------------------
// Detail drawer
// ---------------------------------------------------------------------------

interface DetailDrawerProps {
  agentId: string;
  event: EdrEventDTO;
  onClose: () => void;
}

function DetailDrawer({ agentId, event, onClose }: DetailDrawerProps): JSX.Element {
  const theme = useThemeStore((state) => state.theme);
  const [processTreeOpen, setProcessTreeOpen] = useState(false);
  const isProcessEvent = event.eventType.startsWith('process_');
  const jsonValue = JSON.stringify(event.details, null, 2);

  return (
    <>
      <HaDrawer
        isOpen
        onClose={onClose}
        title={event.eventType}
        subtitle={`${event.processName} · PID ${event.pid} · ${formatTimestamp(event.timestamp)}`}
        width={400}
        footer={
          isProcessEvent ? (
            <button
              onClick={() => setProcessTreeOpen(true)}
              style={{
                background: 'var(--ha-primary)',
                color: 'var(--ha-background)',
                border: 'none',
                borderRadius: 'var(--ha-radius-base)',
                padding: '6px 14px',
                fontSize: 'var(--ha-text-sm)',
                fontWeight: 600,
                cursor: 'pointer',
              }}
              aria-label="Show Process Tree"
            >
              Show Process Tree
            </button>
          ) : undefined
        }
      >
        <div style={{ height: 'calc(100% - 32px)', minHeight: 320, border: '1px solid var(--ha-border)', borderRadius: 4, overflow: 'hidden' }}>
          <Suspense fallback={<div style={{ padding: 16, color: 'var(--ha-text-secondary)' }}>Loading editor…</div>}>
            <Editor
              height="100%"
              language="json"
              value={jsonValue}
              theme={`hivearmor-${theme}`}
              beforeMount={defineHiveArmorMonacoTheme}
              options={{
                readOnly: true,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                fontSize: 12,
                lineNumbers: 'on',
                wordWrap: 'on',
                folding: true,
                renderLineHighlight: 'line',
                scrollbar: {
                  verticalScrollbarSize: 8,
                  horizontalScrollbarSize: 8,
                },
                padding: { top: 12, bottom: 12 },
              }}
            />
          </Suspense>
        </div>
      </HaDrawer>

      {processTreeOpen && (
        <ProcessTreeModal
          agentId={agentId}
          event={event}
          onClose={() => setProcessTreeOpen(false)}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// AG Grid column definitions
// ---------------------------------------------------------------------------

const TIMELINE_COL_DEFS: ColDef[] = [
  {
    headerName: 'Timestamp',
    field: 'timestamp',
    minWidth: 160,
    flex: 1,
    sortable: true,
    resizable: true,
    valueFormatter: (params: { value: string }) => formatTimestamp(params.value),
    cellStyle: {
      fontFamily: 'var(--ha-font-mono)',
      fontSize: 'var(--ha-text-xs)',
      fontVariantNumeric: 'tabular-nums',
      color: 'var(--ha-text-secondary)',
    } as Record<string, string>,
  },
  {
    headerName: 'Event Type',
    field: 'eventType',
    width: 150,
    sortable: true,
    resizable: true,
    cellStyle: {
      fontFamily: 'var(--ha-font-mono)',
      fontSize: 'var(--ha-text-xs)',
      color: 'var(--ha-primary)',
    } as Record<string, string>,
  },
  {
    headerName: 'Process',
    field: 'processName',
    flex: 1,
    minWidth: 120,
    sortable: true,
    resizable: true,
    cellStyle: {
      color: 'var(--ha-text-primary)',
      fontSize: 'var(--ha-text-sm)',
    } as Record<string, string>,
  },
  {
    headerName: 'PID',
    field: 'pid',
    width: 80,
    sortable: true,
    resizable: true,
    cellStyle: {
      fontFamily: 'var(--ha-font-mono)',
      fontVariantNumeric: 'tabular-nums',
      fontSize: 'var(--ha-text-xs)',
      color: 'var(--ha-text-secondary)',
    } as Record<string, string>,
  },
  {
    headerName: 'User',
    field: 'user',
    width: 130,
    sortable: true,
    resizable: true,
    cellStyle: {
      fontSize: 'var(--ha-text-sm)',
      color: 'var(--ha-text-primary)',
    } as Record<string, string>,
  },
  {
    headerName: 'Severity',
    field: 'severity',
    width: 100,
    sortable: true,
    resizable: true,
    cellRenderer: (params: { value: number }) => {
      const sev = params.value ?? 0;
      let color = 'var(--ha-positive)';
      if (sev >= 90) color = 'var(--ha-critical)';
      else if (sev >= 70) color = 'var(--ha-high)';
      else if (sev >= 40) color = 'var(--ha-medium)';
      return (
        <span
          style={{
            color,
            fontWeight: 600,
            fontSize: 'var(--ha-text-xs)',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          {severityLabel(sev)}
        </span>
      );
    },
  },
];

// ---------------------------------------------------------------------------
// Filter bar
// ---------------------------------------------------------------------------

interface FilterBarProps {
  from: string;
  to: string;
  selectedTypes: EdrEventType[];
  minSeverity: number;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  onTypesChange: (v: EdrEventType[]) => void;
  onMinSeverityChange: (v: number) => void;
}

function FilterBar({
  from,
  to,
  selectedTypes,
  minSeverity,
  onFromChange,
  onToChange,
  onTypesChange,
  onMinSeverityChange,
}: FilterBarProps): JSX.Element {
  const handleTypeToggle = (type: EdrEventType): void => {
    if (selectedTypes.includes(type)) {
      onTypesChange(selectedTypes.filter((t) => t !== type));
    } else {
      onTypesChange([...selectedTypes, type]);
    }
  };

  return (
    <div
      style={{
        padding: '8px 24px',
        background: 'var(--ha-surface-primary)',
        borderBottom: '1px solid var(--ha-border)',
        display: 'flex',
        flexWrap: 'wrap',
        gap: 12,
        alignItems: 'center',
      }}
    >
      {/* Date range */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <label style={{ fontSize: 'var(--ha-text-xs)', color: 'var(--ha-text-secondary)' }}>From</label>
        <input
          type="datetime-local"
          value={from.slice(0, 16)}
          onChange={(e) => onFromChange(new Date(e.target.value).toISOString())}
          aria-label="From date"
          style={{
            background: 'var(--ha-surface-raised)',
            border: '1px solid var(--ha-border)',
            borderRadius: 'var(--ha-radius-base)',
            color: 'var(--ha-text-primary)',
            fontSize: 'var(--ha-text-sm)',
            padding: '3px 8px',
            outline: 'none',
          }}
        />
        <label style={{ fontSize: 'var(--ha-text-xs)', color: 'var(--ha-text-secondary)' }}>To</label>
        <input
          type="datetime-local"
          value={to.slice(0, 16)}
          onChange={(e) => onToChange(new Date(e.target.value).toISOString())}
          aria-label="To date"
          style={{
            background: 'var(--ha-surface-raised)',
            border: '1px solid var(--ha-border)',
            borderRadius: 'var(--ha-radius-base)',
            color: 'var(--ha-text-primary)',
            fontSize: 'var(--ha-text-sm)',
            padding: '3px 8px',
            outline: 'none',
          }}
        />
      </div>

      {/* Min severity */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <label htmlFor="min-severity" style={{ fontSize: 'var(--ha-text-xs)', color: 'var(--ha-text-secondary)', whiteSpace: 'nowrap' }}>
          Min severity
        </label>
        <select
          id="min-severity"
          value={minSeverity}
          onChange={(e) => onMinSeverityChange(Number(e.target.value))}
          aria-label="Minimum severity filter"
          style={{
            background: 'var(--ha-surface-raised)',
            border: '1px solid var(--ha-border)',
            borderRadius: 'var(--ha-radius-base)',
            color: 'var(--ha-text-primary)',
            fontSize: 'var(--ha-text-sm)',
            padding: '3px 8px',
            outline: 'none',
          }}
        >
          <option value={0}>All</option>
          <option value={40}>Medium+</option>
          <option value={70}>High+</option>
          <option value={90}>Critical</option>
        </select>
      </div>

      {/* Event type multi-select */}
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 'var(--ha-text-xs)', color: 'var(--ha-text-secondary)', marginRight: 4 }}>
          Types:
        </span>
        {EDR_EVENT_TYPES.map((type) => {
          const active = selectedTypes.length === 0 || selectedTypes.includes(type);
          return (
            <button
              key={type}
              onClick={() => handleTypeToggle(type)}
              aria-pressed={active}
              style={{
                background: active ? 'var(--ha-primary)' : 'var(--ha-surface-raised)',
                color: active ? 'var(--ha-background)' : 'var(--ha-text-secondary)',
                border: '1px solid var(--ha-border)',
                borderRadius: 'var(--ha-radius-sm)',
                padding: '2px 8px',
                fontSize: 'var(--ha-text-xs)',
                fontFamily: 'var(--ha-font-mono)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {type}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export function EndpointTimelinePage(): JSX.Element {
  const [density] = useRowDensity();
  const { agentId = '' } = useParams<{ agentId: string }>();

  // ── Filter state ──────────────────────────────────────────────────────────
  const [from, setFrom] = useState<string>(minus24hIso);
  const [to, setTo] = useState<string>(nowIso);
  const [selectedTypes, setSelectedTypes] = useState<EdrEventType[]>([]);
  const [minSeverity, setMinSeverity] = useState<number>(0);

  // ── Drawer / modal state ──────────────────────────────────────────────────
  const [selectedEvent, setSelectedEvent] = useState<EdrEventDTO | null>(null);

  // ── Build query ───────────────────────────────────────────────────────────
  const query = useMemo<EdrTimelineQuery | null>(() => {
    if (!agentId) return null;
    return {
      agentId,
      from,
      to,
      types: selectedTypes.length > 0 ? selectedTypes : undefined,
      page: 0,
      size: DEFAULT_PAGE_SIZE,
    };
  }, [agentId, from, to, selectedTypes]);

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const { data, isLoading, isError, error } = useEdrTimeline(query);

  // ── Filtered events (client-side severity filter) ─────────────────────────
  const events = useMemo<EdrEventDTO[]>(() => {
    const content = data?.content ?? [];
    if (minSeverity === 0) return content;
    return content.filter((ev) => ev.severity >= minSeverity);
  }, [data, minSeverity]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleEventClick = useCallback((event: EdrEventDTO): void => {
    setSelectedEvent(event);
  }, []);

  const handleCloseDrawer = useCallback((): void => {
    setSelectedEvent(null);
  }, []);

  // ── Column defs (stable reference) ───────────────────────────────────────
  const columnDefs = useMemo(() => TIMELINE_COL_DEFS, []);

  // ── Error state ───────────────────────────────────────────────────────────
  const errorMessage =
    error instanceof Error ? error.message : 'An error occurred while loading events.';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        background: 'var(--ha-background)',
      }}
    >
      {/* Page header */}
      <div
        style={{
          height: 48,
          borderBottom: '1px solid var(--ha-border)',
          background: 'var(--ha-surface-raised)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '0 24px',
          flexShrink: 0,
        }}
      >
        <Activity size={20} color="var(--ha-primary)" />
        <h1
          style={{
            fontSize: 'var(--ha-text-xl)',
            color: 'var(--ha-text-primary)',
            margin: 0,
            fontWeight: 600,
          }}
        >
          Endpoint Timeline
        </h1>
        {agentId && (
          <span
            style={{
              fontSize: 'var(--ha-text-sm)',
              color: 'var(--ha-text-secondary)',
              fontFamily: 'var(--ha-font-mono)',
              padding: '2px 8px',
              background: 'var(--ha-surface-primary)',
              border: '1px solid var(--ha-border)',
              borderRadius: 'var(--ha-radius-sm)',
            }}
          >
            {agentId}
          </span>
        )}
      </div>

      {/* Filter bar */}
      <FilterBar
        from={from}
        to={to}
        selectedTypes={selectedTypes}
        minSeverity={minSeverity}
        onFromChange={setFrom}
        onToChange={setTo}
        onTypesChange={setSelectedTypes}
        onMinSeverityChange={setMinSeverity}
      />

      {/* Error state */}
      {isError && (
        <div style={{ padding: '12px 24px', flexShrink: 0 }}>
          <Alert variant="danger" isInline title="Failed to load events">
            {errorMessage}
          </Alert>
        </div>
      )}

      {/* Chart section */}
      <div
        style={{
          padding: '12px 24px 0',
          flexShrink: 0,
          background: 'var(--ha-surface-primary)',
          borderBottom: '1px solid var(--ha-border)',
        }}
      >
        {/* Loading indicator above the chart */}
        {isLoading && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 8,
              fontSize: 'var(--ha-text-sm)',
              color: 'var(--ha-text-secondary)',
            }}
            role="status"
            aria-label="Loading events"
          >
            <span
              style={{
                display: 'inline-block',
                width: 14,
                height: 14,
                border: '2px solid var(--ha-border)',
                borderTopColor: 'var(--ha-primary)',
                borderRadius: '50%',
                animation: 'ha-spin 0.75s linear infinite',
              }}
            />
            Loading events…
          </div>
        )}
        <TimelineChart
          events={events}
          onEventClick={handleEventClick}
          isLoading={isLoading}
        />
      </div>

      {/* Grid section */}
      <div style={{ flex: 1, minHeight: 0, padding: '0 24px 24px', paddingTop: 12, position: 'relative' }}>
        {/* Loading skeleton rows */}
        {isLoading && (
          <div style={{ padding: '8px 0' }}>
            <SkeletonRows count={8} />
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !isError && events.length === 0 && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              minHeight: 200,
              color: 'var(--ha-text-secondary)',
              gap: 8,
            }}
            role="status"
          >
            <Activity size={40} style={{ opacity: 0.3 }} />
            <p style={{ margin: 0, fontSize: 'var(--ha-text-md)' }}>
              No events found in the selected range
            </p>
            <p style={{ margin: 0, fontSize: 'var(--ha-text-sm)', opacity: 0.7 }}>
              Try adjusting the date range or event type filters
            </p>
          </div>
        )}

        {/* Events grid */}
        {!isLoading && events.length > 0 && (
          <div
            style={{
              height: '100%',
              paddingRight: selectedEvent ? '420px' : 0,
              transition: 'padding-right 200ms ease',
            }}
          >
            <SiemDataGrid
              columnDefs={columnDefs}
              rowData={events}
              rowHeight={ROW_HEIGHTS[density]}
              height="100%"
              getRowId={(params) => String((params.data as EdrEventDTO).id)}
              onRowClicked={(event) => {
                const row = event.data as EdrEventDTO | undefined;
                if (row) handleEventClick(row);
              }}
              defaultColDef={{ sortable: true, resizable: true, filter: false }}
            />
          </div>
        )}

        {/* Detail drawer */}
        {selectedEvent && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              bottom: 0,
              width: 400,
            }}
          >
            <DetailDrawer
              agentId={agentId}
              event={selectedEvent}
              onClose={handleCloseDrawer}
            />
          </div>
        )}
      </div>

      {/* Animation keyframes */}
      <style>{`
        @keyframes ha-spin { to { transform: rotate(360deg); } }
        @keyframes ha-pulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
