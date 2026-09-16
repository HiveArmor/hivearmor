import { useQuery } from '@tanstack/react-query';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import type { EChartsOption } from 'echarts';
import { Activity, AlertTriangle, CircleSlash2, Radio, ShieldCheck } from 'lucide-react';

import './LogCollectionObservability.css';
import {
  AGENT_LIVENESS_BACKEND_NOTE,
  DETECTION_CONSUMPTION_NOTE,
  OPERATOR_QUESTIONS,
  REACHABLE_NOT_HEALTHY_NOTE,
} from './logCollection.observability';
import type { QuestionAnswerability } from './logCollection.observability';
import { logCollectionObservabilityService } from './logCollectionObservability.service';
import type { CollectionSourceRow, LogCollectionObservability } from './logCollectionObservability.service';

import { HaChart } from '@/components/ha-chart';
import { SiemDataGrid } from '@/components/siem-data-grid';
import { useAuthStore } from '@/store/auth.store';

const fmtNum = (value: number | null | undefined): string =>
  value === null || value === undefined ? 'Not reported' : new Intl.NumberFormat().format(value);
const fmtDate = (value: string | null | undefined): string =>
  value
    ? new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
    : 'Not reported';

const answerTone: Record<QuestionAnswerability, string> = {
  answered: 'answered',
  partial: 'partial',
  backend_needed: 'backend',
};
const answerLabel: Record<QuestionAnswerability, string> = {
  answered: 'Answered',
  partial: 'Partial',
  backend_needed: 'Backend needed',
};

/** Reachable ≠ healthy: derive a coarse reachability state from the two binary adapter flags. */
function reachabilityState(row: CollectionSourceRow): { state: string; label: string } {
  if (!row.enabled) return { state: 'not_reported', label: 'Disabled' };
  if (row.grpcStatus === 'unreachable' && row.opensearchStatus === 'unreachable')
    return { state: 'unavailable', label: 'Unreachable' };
  if (row.grpcStatus === 'unreachable' || row.opensearchStatus === 'unreachable')
    return { state: 'attention', label: 'Partial reachability' };
  return { state: 'observed', label: 'Adapters reachable' };
}

export function LogCollectionObservabilityView(): JSX.Element {
  const { hasAnyRole, selectedTenantId } = useAuthStore();
  const canView = hasAnyRole(['ROLE_ADMIN', 'ROLE_ANALYST']);
  const fixture = logCollectionObservabilityService.fixtureMode;

  const query = useQuery({
    // Tenant-keyed: every underlying call is X-Tenant-ID scoped, so a tenant
    // switch must not serve the previous tenant's cached rows.
    queryKey: ['log-collection-observability', selectedTenantId],
    queryFn: () => logCollectionObservabilityService.load(),
    enabled: canView,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const data = query.data;

  if (!canView) {
    return (
      <section className="lco" aria-label="Log-collection observability">
        <State icon={<CircleSlash2 size={28} />} title="Collection observability access restricted" detail="Required permission: Analyst or Platform Administrator." />
      </section>
    );
  }

  return (
    <section className="lco" aria-label="Log-collection observability" data-fixture={fixture ? 'true' : undefined}>
      <header className="lco__head">
        <div>
          <span className="lco__eyebrow">OPERATE · COLLECTION HEALTH</span>
          <h2>Collection observability</h2>
          <p className="lco__job">Answer each link of Agent → Collector → Source → Collection → Parsing → Ingestion → Detection from measured signals — no inferred pipeline health.</p>
        </div>
        {fixture && (
          <div className="lco__trust" role="note"><ShieldCheck size={13} /><strong>Design fixture:</strong> fictional records for visual review. Production never receives these.</div>
        )}
      </header>

      {query.isLoading ? (
        <State icon={<Activity size={26} />} title="Loading collection signals" detail="Retrieving the authorized source, fleet and detection projections." />
      ) : query.isError ? (
        <State error icon={<AlertTriangle size={26} />} title="Collection observability unavailable" detail={query.error instanceof Error ? query.error.message : 'The projection could not be loaded.'} />
      ) : data ? (
        <Body data={data} />
      ) : null}
    </section>
  );
}

function Body({ data }: { data: LogCollectionObservability }): JSX.Element {
  const enabled = data.sources.filter((s) => s.enabled).length;
  const reachable = data.sources.filter((s) => s.enabled && s.grpcStatus === 'ok' && s.opensearchStatus === 'ok').length;
  const totalEps = data.sources.reduce((sum, s) => sum + (s.eps ?? 0), 0);

  return (
    <>
      {/* Summary strip */}
      <section className="lco__summary" aria-label="Collection summary">
        <div><span>Configured sources</span><strong className="lco__num">{fmtNum(data.sources.length)}</strong><small>{enabled} collecting</small></div>
        <div data-tone={reachable === enabled ? 'healthy' : 'warning'}><span>Adapters reachable</span><strong className="lco__num">{fmtNum(reachable)}</strong><small>of {enabled} enabled</small></div>
        <div><span>Aggregate EPS</span><strong className="lco__num">{fmtNum(totalEps)}</strong><small>live sum</small></div>
        <div data-tone={data.fleet.unavailable ? 'warning' : undefined}><span>Fleet online</span><strong className="lco__num">{data.fleet.unavailable ? '—' : `${data.fleet.online}/${data.fleet.total}`}</strong><small>{data.fleet.unavailable ? 'agent-manager unavailable' : 'fleet-level (not per-source)'}</small></div>
      </section>

      {/* 10-question answerability board */}
      <section className="lco__panel" aria-label="Operator question answerability">
        <header className="lco__panel-head"><div><strong>Operator answerability</strong><span>What this view can establish for each link — honestly</span></div></header>
        <ul className="lco__board" role="list">
          {OPERATOR_QUESTIONS.map((q) => (
            <li key={q.id} className="lco__q" data-answer={answerTone[q.answerability]}>
              <div className="lco__q-top"><span className="lco__q-link">{q.link}</span><span className="lco__q-tag" data-answer={answerTone[q.answerability]}>{answerLabel[q.answerability]}</span></div>
              <strong className="lco__q-text">{q.question}</strong>
              <small className="lco__q-basis">{q.basis}</small>
            </li>
          ))}
        </ul>
      </section>

      {/* Ingest volume chart */}
      <section className="lco__panel" aria-label="Ingest volume">
        <header className="lco__panel-head"><div><strong>Ingest volume</strong><span>Aggregate EPS across enabled sources over the reported window</span></div><span className="lco__snapshot">Snapshot {fmtDate(data.snapshotAt)}</span></header>
        <div className="lco__chart">
          {data.aggregateEpsHistory.length === 0 ? (
            <State icon={<Activity size={22} />} title="No EPS history reported" detail="Enabled sources have not reported an events-per-second window yet." />
          ) : (
            <HaChart ariaLabel="Aggregate events-per-second over the reported window" ariaDescription="Area chart of summed events-per-second samples across enabled sources." height={220} option={epsChartOption(data.aggregateEpsHistory)} />
          )}
        </div>
      </section>

      {/* Source health table */}
      <section className="lco__panel lco__panel--grid" aria-label="Source collection health">
        <header className="lco__panel-head"><div><strong>Source collection health</strong><span>Reachability, throughput, freshness and detection coverage per source</span></div></header>
        <div className="lco__grid">
          <SiemDataGrid
            ariaLabel="Source collection health"
            rowData={data.sources}
            columnDefs={sourceColumns}
            getRowId={(p) => (p.data as CollectionSourceRow).id}
            rowHeight={46}
            headerHeight={34}
          />
        </div>
      </section>

      {/* Honesty notes — verbatim, always visible */}
      <section className="lco__notes" aria-label="Measurement honesty notes">
        <p><ShieldCheck size={12} /><span>{REACHABLE_NOT_HEALTHY_NOTE}</span></p>
        <p><Radio size={12} /><span>{AGENT_LIVENESS_BACKEND_NOTE}</span></p>
        <p><ShieldCheck size={12} /><span>{DETECTION_CONSUMPTION_NOTE}</span></p>
      </section>
    </>
  );
}

// ── AG Grid columns ──────────────────────────────────────────────────────────

const sourceColumns: ColDef[] = [
  {
    headerName: 'Source', field: 'name', flex: 2, minWidth: 200,
    cellRenderer: (p: ICellRendererParams) => {
      const row = p.data as CollectionSourceRow;
      return `${row.name} · ${row.type}`;
    },
  },
  {
    headerName: 'Reachability', field: 'grpcStatus', width: 150,
    cellRenderer: (p: ICellRendererParams) => reachabilityState(p.data as CollectionSourceRow).label,
  },
  {
    headerName: 'EPS', field: 'eps', width: 100, type: 'numericColumn',
    cellClass: 'lco-cell-num',
    valueFormatter: (p) => fmtNum(p.value as number),
  },
  {
    headerName: 'Last event', field: 'lastEventAt', width: 150,
    cellClass: 'lco-cell-num',
    valueFormatter: (p) => fmtDate(p.value as string | null),
  },
  {
    headerName: 'Detections consuming', field: 'detection', flex: 2, minWidth: 220,
    cellRenderer: (p: ICellRendererParams) => {
      const row = p.data as CollectionSourceRow;
      const d = row.detection;
      if (d.mapping.kind !== 'matched') return d.mapping.note ?? 'Not rule-addressable';
      if (d.errored) return 'Not reported';
      return `${fmtNum(d.ruleCount)} rules · dataType ${d.mapping.dataType}`;
    },
  },
];

// ── ECharts option (theme-driven — no raw hex) ────────────────────────────────

function epsChartOption(series: number[]): EChartsOption {
  return {
    grid: { top: 16, right: 16, bottom: 24, left: 52 },
    tooltip: { trigger: 'axis', valueFormatter: (v) => fmtNum(v as number) },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: series.map((_, i) => `${series.length - i}`),
      axisLabel: { show: false },
    },
    yAxis: { type: 'value', name: 'EPS', axisLabel: { formatter: (v: number) => fmtNum(v) } },
    series: [
      {
        type: 'line',
        smooth: true,
        showSymbol: false,
        areaStyle: { opacity: 0.18 },
        data: series,
        name: 'Aggregate EPS',
      },
    ],
  };
}

// ── Shared empty/error state ──────────────────────────────────────────────────

function State({ icon, title, detail, error = false }: { icon: JSX.Element; title: string; detail: string; error?: boolean }): JSX.Element {
  return (
    <div className={`lco__empty ${error ? 'lco__empty--error' : ''}`} role={error ? 'alert' : 'status'}>
      {icon}
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  );
}
