/**
 * Fleet Posture Report — cross-fleet compliance / posture reporting (SPEC-PT-6).
 *
 * Production: GET /api/ha-posture-report/{overview,cis,trend}. Aggregates the PT-5
 * per-host CIS (v3-hive-cis-*) and vuln (ha_vuln_finding) stores into fleet-wide
 * posture, a CIS pass-rate trend with drift, and coverage honesty. This is the
 * cross-fleet reporting layer deferred from PT-5 — it does NOT rebuild the per-host
 * Posture tab (EndpointDetailPage) or the compliance-framework assurance view
 * (CompliancePage). Report packs export via /export/{pdf,cis.csv,vuln.csv}.
 *
 * Honesty: a null fleet score or scanned=false host renders "not covered", never a
 * fabricated 100%. An empty fleet is not proof of compliance.
 */

import { useCallback, useMemo, useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import type { EChartsOption } from 'echarts';
import {
  AlertTriangle,
  Download,
  FileText,
  RefreshCw,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import { HaChart } from '@/components/ha-chart';
import { SiemDataGrid } from '@/components/siem-data-grid';
import { ROUTES } from '@/constants/routes.constants';
import { useHaThemeTokens, withHaAlpha } from '@/hooks/useHaThemeTokens';
import {
  downloadPostureExport,
  fetchFleetCis,
  fetchPostureOverview,
  fetchPostureTrend,
} from '@/services/postureReport.service';
import type { HostCisPosture } from '@/types/postureReport.types';

import './FleetPosturePage.css';

/** Bundle-visible job sentence — cross-fleet posture reporting, not per-host scans or framework assurance. */
export const POSTURE_FLEET_REPORT_JOB_SENTENCE =
  'Fleet posture reporting — aggregate CIS benchmark pass/fail and vulnerability exposure across the whole fleet, track drift over time, and export compliance report packs. Per-host scan detail lives on each endpoint; framework assurance lives on Compliance.';

const TREND_TOKENS = [
  '--ha-primary',
  '--ha-positive',
  '--ha-critical',
  '--ha-high',
  '--ha-medium',
  '--ha-text-secondary',
  '--ha-border',
  '--ha-surface-raised',
  '--ha-text-primary',
] as const;

const TREND_WINDOWS: Array<{ value: number; label: string }> = [
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
  { value: 180, label: '180 days' },
];

function pct(value: number | null): string {
  return value === null ? '—' : `${value}%`;
}

function formatInstant(iso: string | null): string {
  if (!iso) {
    return 'Never';
  }
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export function FleetPosturePage() {
  const [trendDays, setTrendDays] = useState(90);
  const [exporting, setExporting] = useState<string | null>(null);
  const tokens = useHaThemeTokens(TREND_TOKENS);
  const prefersReducedMotion =
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;

  const overviewQuery = useQuery({
    queryKey: ['posture-report', 'overview'],
    queryFn: ({ signal }) => fetchPostureOverview(signal),
  });
  const cisQuery = useQuery({
    queryKey: ['posture-report', 'cis'],
    queryFn: ({ signal }) => fetchFleetCis(signal),
  });
  const trendQuery = useQuery({
    queryKey: ['posture-report', 'trend', trendDays],
    queryFn: ({ signal }) => fetchPostureTrend(trendDays, signal),
  });

  const handleExport = useCallback(async (kind: 'pdf' | 'cis-csv' | 'vuln-csv') => {
    setExporting(kind);
    try {
      const { blob, filename } = await downloadPostureExport(kind);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(null);
    }
  }, []);

  const overview = overviewQuery.data;
  const cis = cisQuery.data;
  const trend = trendQuery.data;

  // --- CIS donut: pass / fail / error across scanned hosts -----------------
  const cisDonutOption = useMemo<EChartsOption>(() => {
    const pass = cis?.passCount ?? 0;
    const fail = cis?.failCount ?? 0;
    const error = cis?.errorCount ?? 0;
    const score = cis?.fleetScorePct ?? null;
    return {
      animation: !prefersReducedMotion,
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        backgroundColor: tokens['--ha-surface-raised'],
        borderColor: tokens['--ha-border'],
        textStyle: { color: tokens['--ha-text-primary'], fontSize: 12 },
      },
      series: [
        {
          type: 'pie',
          radius: ['58%', '85%'],
          center: ['50%', '50%'],
          label: { show: false },
          emphasis: { scale: false },
          data: [
            { value: pass, name: 'Pass', itemStyle: { color: tokens['--ha-positive'] } },
            { value: fail, name: 'Fail', itemStyle: { color: tokens['--ha-critical'] } },
            { value: error, name: 'Error', itemStyle: { color: tokens['--ha-medium'] } },
          ],
        },
      ],
      graphic: [
        {
          type: 'text',
          left: 'center',
          top: 'center',
          style: {
            text: pct(score),
            fontSize: 22,
            fontWeight: 700,
            fill: tokens['--ha-text-primary'],
          },
        },
      ],
    };
  }, [cis, tokens, prefersReducedMotion]);

  // --- Vuln-by-severity bars -----------------------------------------------
  const vulnBarOption = useMemo<EChartsOption>(() => {
    const v = overview?.vuln;
    return {
      animation: !prefersReducedMotion,
      backgroundColor: 'transparent',
      grid: { top: 12, right: 12, bottom: 28, left: 40, containLabel: false },
      xAxis: {
        type: 'category',
        data: ['Critical', 'High', 'Medium', 'Low', 'Info'],
        axisLabel: { color: tokens['--ha-text-secondary'], fontSize: 11 },
        axisLine: { lineStyle: { color: tokens['--ha-border'] } },
      },
      yAxis: {
        type: 'value',
        minInterval: 1,
        axisLabel: { color: tokens['--ha-text-secondary'], fontSize: 11 },
        splitLine: { lineStyle: { color: tokens['--ha-border'], type: 'dashed' } },
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: tokens['--ha-surface-raised'],
        borderColor: tokens['--ha-border'],
        textStyle: { color: tokens['--ha-text-primary'], fontSize: 12 },
      },
      series: [
        {
          type: 'bar',
          barWidth: '55%',
          data: [
            { value: v?.critical ?? 0, itemStyle: { color: tokens['--ha-critical'] } },
            { value: v?.high ?? 0, itemStyle: { color: tokens['--ha-high'] } },
            { value: v?.medium ?? 0, itemStyle: { color: tokens['--ha-medium'] } },
            { value: v?.low ?? 0, itemStyle: { color: tokens['--ha-positive'] } },
            { value: v?.info ?? 0, itemStyle: { color: tokens['--ha-text-secondary'] } },
          ],
        },
      ],
    };
  }, [overview, tokens, prefersReducedMotion]);

  // --- Trend line: CIS fleet pass-rate over time ---------------------------
  const trendOption = useMemo<EChartsOption>(() => {
    const points = trend?.cisScore ?? [];
    const primary = tokens['--ha-primary'];
    return {
      animation: !prefersReducedMotion,
      backgroundColor: 'transparent',
      grid: { top: 16, right: 16, bottom: 32, left: 44, containLabel: false },
      xAxis: {
        type: 'category',
        data: points.map((p) => p.bucket),
        axisLabel: { color: tokens['--ha-text-secondary'], fontSize: 11 },
        axisLine: { lineStyle: { color: tokens['--ha-border'] } },
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: 100,
        axisLabel: { color: tokens['--ha-text-secondary'], fontSize: 11, formatter: '{value}%' },
        splitLine: { lineStyle: { color: tokens['--ha-border'], type: 'dashed' } },
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: tokens['--ha-surface-raised'],
        borderColor: tokens['--ha-border'],
        textStyle: { color: tokens['--ha-text-primary'], fontSize: 12 },
      },
      series: [
        {
          name: 'CIS pass rate',
          type: 'line',
          smooth: true,
          showSymbol: points.length < 30,
          data: points.map((p) => p.scorePct),
          lineStyle: { color: primary, width: 2 },
          itemStyle: { color: primary },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: withHaAlpha(primary, 0.16) },
                { offset: 1, color: withHaAlpha(primary, 0) },
              ],
            },
          },
        },
      ],
    };
  }, [trend, tokens, prefersReducedMotion]);

  // --- Host grid -----------------------------------------------------------
  const hostColumns = useMemo<ColDef[]>(
    () => [
      {
        field: 'hostname',
        headerName: 'Host',
        minWidth: 180,
        flex: 1,
        pinned: 'left',
        cellRenderer: ({ data }: ICellRendererParams<HostCisPosture>) =>
          data ? (
            <span className="fpr-host">
              <strong>{data.hostname ?? data.agentId ?? 'Unknown'}</strong>
              {data.platform ? <small>{data.platform}</small> : null}
            </span>
          ) : null,
      },
      {
        field: 'scanned',
        headerName: 'Coverage',
        width: 130,
        cellRenderer: ({ data }: ICellRendererParams<HostCisPosture>) =>
          data ? (
            <span className={data.scanned ? 'fpr-badge fpr-badge--ok' : 'fpr-badge fpr-badge--none'}>
              {data.scanned ? 'Scanned' : 'Not covered'}
            </span>
          ) : null,
      },
      {
        field: 'scorePct',
        headerName: 'Score',
        width: 100,
        cellClass: 'fpr-num',
        valueGetter: ({ data }) =>
          data?.scanned && data.scorePct !== null ? `${(data as HostCisPosture).scorePct}%` : '—',
      },
      { field: 'passCount', headerName: 'Pass', width: 90, cellClass: 'fpr-num',
        valueGetter: ({ data }) => ((data as HostCisPosture)?.scanned ? (data as HostCisPosture).passCount : '—') },
      { field: 'failCount', headerName: 'Fail', width: 90, cellClass: 'fpr-num',
        valueGetter: ({ data }) => ((data as HostCisPosture)?.scanned ? (data as HostCisPosture).failCount : '—') },
      { field: 'errorCount', headerName: 'Error', width: 90, cellClass: 'fpr-num',
        valueGetter: ({ data }) => ((data as HostCisPosture)?.scanned ? (data as HostCisPosture).errorCount : '—') },
      { field: 'scannedAt', headerName: 'Last scanned', width: 170,
        valueGetter: ({ data }) => formatInstant((data as HostCisPosture)?.scannedAt ?? null) },
    ],
    [],
  );

  const hosts = cis?.hosts ?? [];
  const isLoading = overviewQuery.isLoading || cisQuery.isLoading;
  const isError = overviewQuery.isError || cisQuery.isError;
  const coverage = overview?.coverage;
  const hasScans = (cis?.hostsScanned ?? 0) > 0;

  const refetchAll = useCallback(() => {
    void overviewQuery.refetch();
    void cisQuery.refetch();
    void trendQuery.refetch();
  }, [overviewQuery, cisQuery, trendQuery]);

  return (
    <section className="fpr-page" aria-label="Fleet posture report">
      <header className="fpr-page__header">
        <div>
          <h1 className="fpr-page__title">Fleet Posture Report</h1>
          <p className="fpr-page__subtitle">
            Cross-fleet CIS benchmark and vulnerability exposure, aggregated from live scan
            data. Per-host detail lives on each endpoint; framework assurance lives on{' '}
            <Link to={ROUTES.COMPLIANCE}>Compliance</Link>.
          </p>
        </div>
        <div className="fpr-page__actions">
          <button
            type="button"
            className="fpr-btn"
            onClick={() => void handleExport('pdf')}
            disabled={exporting !== null}
          >
            <FileText size={14} /> {exporting === 'pdf' ? 'Preparing…' : 'PDF report'}
          </button>
          <button
            type="button"
            className="fpr-btn"
            onClick={() => void handleExport('cis-csv')}
            disabled={exporting !== null}
          >
            <Download size={14} /> CIS CSV
          </button>
          <button
            type="button"
            className="fpr-btn"
            onClick={() => void handleExport('vuln-csv')}
            disabled={exporting !== null}
          >
            <Download size={14} /> Vuln CSV
          </button>
          <button type="button" className="fpr-btn" onClick={refetchAll} aria-label="Refresh">
            <RefreshCw size={14} />
          </button>
        </div>
      </header>

      {isError ? (
        <div className="fpr-error" role="alert">
          <AlertTriangle size={16} />
          <span>Fleet posture could not be loaded from the telemetry store.</span>
          <button type="button" className="fpr-btn" onClick={refetchAll}>
            Retry
          </button>
        </div>
      ) : null}

      {/* Coverage honesty block */}
      {coverage ? (
        <div className="fpr-coverage" role="status">
          <span>
            <strong>{coverage.fleetHostCount}</strong> hosts in fleet
          </span>
          <span>
            <strong>{coverage.hostsWithCis}</strong> with CIS data
          </span>
          <span>
            <strong>{coverage.hostsWithVuln}</strong> with vulnerability data
          </span>
          <span className="fpr-coverage__gap">
            <strong>{coverage.hostsUncovered}</strong> with no posture data
          </span>
          <small>
            Hosts with no scan are shown as not covered — never counted as compliant. An empty
            result is not proof of zero exposure.
          </small>
        </div>
      ) : null}

      <div className="fpr-grid">
        {/* CIS fleet donut */}
        <article className="fpr-card" aria-label="Fleet CIS benchmark posture">
          <h2 className="fpr-card__title">
            <ShieldCheck size={15} /> CIS benchmark
          </h2>
          {hasScans ? (
            <>
              <div className="fpr-donut">
                <HaChart option={cisDonutOption} ariaLabel="Fleet CIS pass/fail/error distribution" />
              </div>
              <dl className="fpr-stats">
                <div><dt>Pass</dt><dd className="fpr-num">{cis?.passCount ?? 0}</dd></div>
                <div><dt>Fail</dt><dd className="fpr-num">{cis?.failCount ?? 0}</dd></div>
                <div><dt>Error</dt><dd className="fpr-num">{cis?.errorCount ?? 0}</dd></div>
                <div><dt>Scanned</dt><dd className="fpr-num">{cis?.hostsScanned ?? 0}/{cis?.fleetHostCount ?? 0}</dd></div>
              </dl>
            </>
          ) : (
            <div className="fpr-empty-honesty" role="status" data-testid="fpr-cis-not-covered">
              <strong>No CIS scans across the fleet yet.</strong>
              <span>
                No host has an ingested CIS benchmark scan. This is not proof of secure
                configuration — HiveArmor will not invent a fleet pass rate.
              </span>
            </div>
          )}
        </article>

        {/* Vuln by severity */}
        <article className="fpr-card" aria-label="Fleet vulnerability exposure by severity">
          <h2 className="fpr-card__title">
            <AlertTriangle size={15} /> Vulnerability exposure
          </h2>
          {(overview?.vuln.affectedAgents ?? 0) > 0 ? (
            <>
              <div className="fpr-bars">
                <HaChart option={vulnBarOption} ariaLabel="Fleet vulnerabilities by severity" />
              </div>
              <dl className="fpr-stats">
                <div><dt>KEV</dt><dd className="fpr-num">{overview?.vuln.kevCount ?? 0}</dd></div>
                <div><dt>Affected hosts</dt><dd className="fpr-num">{overview?.vuln.affectedAgents ?? 0}</dd></div>
              </dl>
            </>
          ) : (
            <div className="fpr-empty-honesty" role="status" data-testid="fpr-vuln-empty">
              <strong>No vulnerability findings in authorized scanner coverage.</strong>
              <span>
                An empty inventory is not proof of zero exposure. Review{' '}
                <Link to={ROUTES.VULNERABILITIES}>Vulnerabilities</Link> for coverage detail.
              </span>
            </div>
          )}
        </article>

        {/* CIS pass-rate trend over time */}
        <article className="fpr-card fpr-card--wide" aria-label="CIS pass-rate trend over time">
          <div className="fpr-card__head-row">
            <h2 className="fpr-card__title">
              {trend?.driftAvailable && (trend.cisScoreDrift ?? 0) >= 0 ? (
                <TrendingUp size={15} />
              ) : (
                <TrendingDown size={15} />
              )}{' '}
              CIS pass-rate trend
            </h2>
            <div className="fpr-window" role="group" aria-label="Trend window">
              {TREND_WINDOWS.map((w) => (
                <button
                  key={w.value}
                  type="button"
                  className={w.value === trendDays ? 'fpr-chip fpr-chip--on' : 'fpr-chip'}
                  onClick={() => setTrendDays(w.value)}
                >
                  {w.label}
                </button>
              ))}
            </div>
          </div>
          {trend && trend.cisScore.length > 0 ? (
            <>
              <div className="fpr-trend">
                <HaChart option={trendOption} ariaLabel="CIS fleet pass rate over time" />
              </div>
              <p className="fpr-drift" role="note">
                {trend.driftAvailable && trend.cisScoreDrift !== null ? (
                  <>
                    Drift since previous scan:{' '}
                    <strong className={trend.cisScoreDrift >= 0 ? 'fpr-up' : 'fpr-down'}>
                      {trend.cisScoreDrift >= 0 ? '+' : ''}
                      {trend.cisScoreDrift}%
                    </strong>
                    {trend.failCountDrift !== null ? (
                      <> · failing controls {trend.failCountDrift >= 0 ? '+' : ''}{trend.failCountDrift}</>
                    ) : null}
                  </>
                ) : (
                  'Drift needs at least two scan points — a single scan cannot establish a trend.'
                )}
              </p>
            </>
          ) : (
            <div className="fpr-empty-honesty" role="status" data-testid="fpr-trend-empty">
              <strong>No scan history in this window.</strong>
              <span>No CIS scans were ingested in the selected window, so no trend can be shown.</span>
            </div>
          )}
        </article>
      </div>

      {/* Per-host grid */}
      <article className="fpr-card fpr-card--grid" aria-label="Per-host CIS posture">
        <h2 className="fpr-card__title">Per-host CIS posture</h2>
        {hosts.length > 0 ? (
          <div className="fpr-grid-wrap">
            <SiemDataGrid
              columnDefs={hostColumns}
              rowData={hosts}
              loading={isLoading}
              rowHeight={44}
              getRowId={(params) => String((params.data as HostCisPosture).agentId)}
              defaultColDef={{ sortable: true, filter: false, resizable: true }}
              ariaLabel="Per-host CIS posture"
            />
          </div>
        ) : (
          <div className="fpr-empty-honesty" role="status" data-testid="fpr-hosts-empty">
            <strong>No hosts in the fleet registry.</strong>
            <span>
              No agents are enrolled for this tenant, so there is no posture to report. This is
              not proof of compliance.
            </span>
          </div>
        )}
      </article>
    </section>
  );
}

export default FleetPosturePage;
