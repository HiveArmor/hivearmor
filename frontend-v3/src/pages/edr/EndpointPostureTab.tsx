/**
 * EndpointPostureTab — per-host CIS benchmark + vulnerability posture (PT-5, Option A).
 *
 * The minimal, PER-HOST posture surface the PT-5 spec scopes: CIS pass/fail by
 * control for THIS host's latest scan, plus THIS host's vulnerability findings by
 * severity. Cross-fleet trend/reporting is PT-6 and is deliberately NOT built here.
 *
 * Honesty (the page's core rule):
 *   - A host with no CIS scan renders an explicit "not scanned yet" state —
 *     NEVER a fabricated 100% / all-green. The backend summary carries scanned=false.
 *   - A host the agent cannot CIS-scan (no OpenSCAP content / unsupported platform)
 *     still shows not-scanned rather than inventing a result.
 *   - Vuln findings reuse the SHIPPED /ha-vuln per-host endpoint; an empty result is
 *     shown as "no findings", distinct from "not scanned".
 *
 * Reuse (no new visual language): HaCard, HaChart (donut), SiemDataGrid, the shared
 * LoadingState/EmptyState/ErrorState. foundation.css --ha-* tokens only; no raw hex.
 */

import { useMemo } from 'react';

import { useQuery } from '@tanstack/react-query';
import type { ColDef } from 'ag-grid-community';
import type { EChartsOption } from 'echarts';
import { ShieldCheck, BugOff, FileSearch } from 'lucide-react';

import { EmptyState } from '@/components/empty-state/EmptyState';
import { ErrorState } from '@/components/error-state';
import { HaCard } from '@/components/ha-card/HaCard';
import { HaChart } from '@/components/ha-chart/HaChart';
import { LoadingState } from '@/components/loading-state/LoadingState';
import { SiemDataGrid } from '@/components/siem-data-grid/SiemDataGrid';
import { formatBoundedRelativeTime } from '@/lib/threatIntelFreshness';
import {
  fetchCisScanResultsByAgent,
  fetchCisScanSummaryByAgent,
} from '@/services/cisScanService';
import { fetchVulnFindingsByAgent } from '@/services/vulnService';
import type { CisScanResultDTO } from '@/types/cisScan.types';
import type { VulnFindingDTO, VulnSeverity } from '@/types/vuln.types';

// CIS status → themed CSS variable. Pass/fail/error/na use the shared status tokens;
// never a literal hex (foundation.css only).
const CIS_STATUS_COLOR: Record<string, string> = {
  PASS: 'var(--ha-state-success)',
  FAIL: 'var(--ha-state-danger)',
  ERROR: 'var(--ha-warning)',
  NOT_APPLICABLE: 'var(--ha-text-tertiary)',
  NOT_CHECKED: 'var(--ha-text-tertiary)',
};

const SEVERITY_ORDER: VulnSeverity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];
const SEVERITY_COLOR: Record<VulnSeverity, string> = {
  CRITICAL: 'var(--ha-severity-critical)',
  HIGH: 'var(--ha-severity-high)',
  MEDIUM: 'var(--ha-severity-medium)',
  LOW: 'var(--ha-severity-low)',
  INFO: 'var(--ha-severity-info)',
};

function cisControlColumns(): ColDef[] {
  return [
    { headerName: 'Control', field: 'controlId', flex: 2, sortable: true, filter: true, tooltipField: 'title' },
    { headerName: 'Title', field: 'title', flex: 3, sortable: true, filter: true },
    { headerName: 'Severity', field: 'severity', width: 120, sortable: true, filter: true },
    {
      headerName: 'Status',
      field: 'status',
      width: 150,
      sortable: true,
      filter: true,
      cellStyle: (p: { value?: string }) => ({
        color: CIS_STATUS_COLOR[p.value ?? ''] ?? 'var(--ha-text-primary)',
        fontVariantNumeric: 'tabular-nums',
      }),
    },
  ];
}

function vulnColumns(): ColDef[] {
  return [
    { headerName: 'CVE', field: 'cveId', flex: 2, sortable: true, filter: true },
    { headerName: 'Package', field: 'packageName', flex: 2, sortable: true, filter: true },
    { headerName: 'Installed', field: 'installedVersion', width: 140, sortable: true },
    { headerName: 'Fixed in', field: 'fixedVersion', width: 140, sortable: true },
    {
      headerName: 'Severity',
      field: 'severity',
      width: 130,
      sortable: true,
      filter: true,
      cellStyle: (p: { value?: string }) => ({
        color: SEVERITY_COLOR[(p.value as VulnSeverity) ?? 'INFO'] ?? 'var(--ha-text-primary)',
        fontVariantNumeric: 'tabular-nums',
      }),
    },
    {
      headerName: 'CVSS',
      field: 'cvssV3',
      width: 100,
      sortable: true,
      cellStyle: { fontVariantNumeric: 'tabular-nums' },
    },
  ];
}

function CisPanel({ agentId }: { agentId: string }): JSX.Element {
  const summaryQuery = useQuery({
    queryKey: ['cis-scan-summary', agentId],
    queryFn: ({ signal }) => fetchCisScanSummaryByAgent(agentId, signal),
    retry: 1,
  });
  const resultsQuery = useQuery({
    queryKey: ['cis-scan-results', agentId],
    queryFn: ({ signal }) => fetchCisScanResultsByAgent(agentId, undefined, signal),
    enabled: summaryQuery.data?.scanned === true,
    retry: 1,
  });

  const donutOption: EChartsOption | null = useMemo(() => {
    const s = summaryQuery.data;
    if (!s || !s.scanned) return null;
    const data = [
      { name: 'Pass', value: s.passCount, itemStyle: { color: CIS_STATUS_COLOR.PASS } },
      { name: 'Fail', value: s.failCount, itemStyle: { color: CIS_STATUS_COLOR.FAIL } },
      { name: 'Error', value: s.errorCount, itemStyle: { color: CIS_STATUS_COLOR.ERROR } },
      { name: 'N/A', value: s.naCount, itemStyle: { color: CIS_STATUS_COLOR.NOT_APPLICABLE } },
      { name: 'Not checked', value: s.notCheckedCount, itemStyle: { color: CIS_STATUS_COLOR.NOT_CHECKED } },
    ].filter((d) => d.value > 0);
    return {
      tooltip: { trigger: 'item' },
      legend: { bottom: 0 },
      series: [
        {
          type: 'pie',
          radius: ['52%', '74%'],
          avoidLabelOverlap: true,
          label: { show: true, formatter: '{b}: {c}' },
          data,
        },
      ],
    };
  }, [summaryQuery.data]);

  if (summaryQuery.isLoading) {
    return <LoadingState message="Loading CIS posture…" rows={4} />;
  }
  if (summaryQuery.isError) {
    return (
      <ErrorState
        title="Could not load CIS posture"
        message="The CIS scan store could not be reached. Nothing has been changed."
        onRetry={() => void summaryQuery.refetch()}
      />
    );
  }

  const summary = summaryQuery.data;
  if (!summary || !summary.scanned) {
    return (
      <EmptyState
        icon={<FileSearch size={38} />}
        title="Not scanned yet"
        description="This host has not reported a CIS benchmark scan. Enable scans.cis in the host's policy template (OpenSCAP content must be distributed to the host). HiveArmor never shows a fabricated compliance score for an unscanned host."
      />
    );
  }

  const assessable = summary.passCount + summary.failCount + summary.errorCount;

  return (
    <div className="endpoint-detail__posture-cis">
      <div className="endpoint-detail__posture-score">
        <div className="endpoint-detail__posture-chart">
          {donutOption && (
            <HaChart
              option={donutOption}
              height={220}
              ariaLabel={`CIS control outcomes for ${summary.hostname ?? agentId}`}
            />
          )}
        </div>
        <div className="endpoint-detail__posture-meta">
          {assessable > 0 ? (
            <>
              <div className="endpoint-detail__posture-score-big" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {summary.scorePct.toFixed(1)}%
              </div>
              <div className="endpoint-detail__muted">
                {summary.profile || 'CIS profile'} · {summary.passCount}/{assessable} passing
              </div>
            </>
          ) : (
            <>
              <div className="endpoint-detail__posture-score-big endpoint-detail__muted">N/A</div>
              <div className="endpoint-detail__muted">
                {summary.profile || 'CIS profile'} · no assessable controls (all not-applicable/not-checked)
              </div>
            </>
          )}
          <div className="endpoint-detail__muted endpoint-detail__hint">
            {summary.benchmark ? `${summary.benchmark} · ` : ''}
            {summary.mode ? `${summary.mode} · ` : ''}
            scanned {summary.scannedAt ? formatBoundedRelativeTime(summary.scannedAt) : '—'}
          </div>
        </div>
      </div>

      <div className="endpoint-detail__posture-grid">
        {resultsQuery.isLoading && <LoadingState message="Loading control results…" rows={5} />}
        {resultsQuery.isError && (
          <ErrorState
            title="Could not load control results"
            message="The scan summary loaded but its control rows could not be retrieved."
            onRetry={() => void resultsQuery.refetch()}
          />
        )}
        {!resultsQuery.isLoading && !resultsQuery.isError && (
          <SiemDataGrid
            columnDefs={cisControlColumns()}
            rowData={(resultsQuery.data ?? []) as CisScanResultDTO[]}
            rowModelType="clientSide"
            height={360}
          />
        )}
      </div>
    </div>
  );
}

function VulnPanel({ agentId }: { agentId: string }): JSX.Element {
  const query = useQuery({
    queryKey: ['agent-vuln-findings', agentId],
    queryFn: () => fetchVulnFindingsByAgent(agentId, 0, 100),
    retry: 1,
  });

  const bySeverity = useMemo(() => {
    const counts: Record<VulnSeverity, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
    for (const f of query.data?.findings ?? []) {
      const sev = (f.severity as VulnSeverity) ?? 'INFO';
      if (sev in counts) counts[sev] += 1;
    }
    return counts;
  }, [query.data]);

  const barOption: EChartsOption = useMemo(
    () => ({
      tooltip: { trigger: 'axis' },
      grid: { left: 8, right: 8, top: 12, bottom: 24, containLabel: true },
      xAxis: { type: 'category', data: SEVERITY_ORDER },
      yAxis: { type: 'value', minInterval: 1 },
      series: [
        {
          type: 'bar',
          data: SEVERITY_ORDER.map((sev) => ({
            value: bySeverity[sev],
            itemStyle: { color: SEVERITY_COLOR[sev] },
          })),
        },
      ],
    }),
    [bySeverity],
  );

  if (query.isLoading) {
    return <LoadingState message="Loading vulnerability findings…" rows={4} />;
  }
  if (query.isError) {
    return (
      <ErrorState
        title="Could not load vulnerability findings"
        message="The vulnerability store could not be reached for this host. Nothing has been changed."
        onRetry={() => void query.refetch()}
      />
    );
  }

  const findings = query.data?.findings ?? [];
  if (findings.length === 0) {
    return (
      <EmptyState
        icon={<BugOff size={38} />}
        title="No vulnerability findings"
        description="This host's agent SBOM inventory produced no CVE matches. Findings appear here as the agent inventories packages on its scans.vuln cadence."
      />
    );
  }

  return (
    <div className="endpoint-detail__posture-vuln">
      <div className="endpoint-detail__posture-chart endpoint-detail__posture-chart--bar">
        <HaChart option={barOption} height={200} ariaLabel={`Vulnerability findings by severity for ${agentId}`} />
      </div>
      <SiemDataGrid
        columnDefs={vulnColumns()}
        rowData={findings as VulnFindingDTO[]}
        rowModelType="clientSide"
        height={360}
      />
    </div>
  );
}

export function EndpointPostureTab({ agentId }: { agentId: string }): JSX.Element {
  return (
    <div className="endpoint-detail__tabpane endpoint-detail__posture">
      <HaCard as="section" className="endpoint-detail__card">
        <HaCard.Header>
          <span className="endpoint-detail__card-title">
            <ShieldCheck size={15} aria-hidden="true" /> CIS benchmark
          </span>
        </HaCard.Header>
        <HaCard.Body>
          <CisPanel agentId={agentId} />
        </HaCard.Body>
      </HaCard>

      <HaCard as="section" className="endpoint-detail__card">
        <HaCard.Header>
          <span className="endpoint-detail__card-title">
            <BugOff size={15} aria-hidden="true" /> Vulnerabilities (this host)
          </span>
        </HaCard.Header>
        <HaCard.Body>
          <VulnPanel agentId={agentId} />
        </HaCard.Body>
      </HaCard>
    </div>
  );
}
