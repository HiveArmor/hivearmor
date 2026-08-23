import { useQuery } from '@tanstack/react-query';
import type { EChartsOption } from 'echarts';
import { AlertTriangle } from 'lucide-react';

import {
  canExecuteDashboardPanels,
  executePanelVisualization,
  mapVisualizationRunToPanelData,
} from './dashboardOperations.service';
import type { DashboardPanel, DashboardPanelData } from './dashboardOperations.types';

import { HaChart } from '@/components/ha-chart';
import { useAuthStore } from '@/store/auth.store';

function StaticPanelBody({ panel, data }: { panel: DashboardPanel; data: DashboardPanelData }): JSX.Element {
  if (data.kind === 'metric') {
    return (
      <div className="dsh-metric">
        <strong>{data.value}</strong>
        <span>
          {data.context}
          {data.delta && <em>{data.delta}</em>}
        </span>
      </div>
    );
  }
  if (data.kind === 'table') {
    return (
      <table className="dsh-table">
        <thead>
          <tr>
            {data.columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, index) => (
            <tr key={index}>
              {data.columns.map((column) => (
                <td key={column}>{row[column]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  if (data.kind === 'feed') {
    return (
      <div className="dsh-feed">
        {data.rows.map((row, index) => (
          <div key={`${row.time}-${index}`}>
            <time>{row.time}</time>
            <strong>{row.severity}</strong>
            <span>{row.summary}</span>
          </div>
        ))}
      </div>
    );
  }
  if (data.kind === 'text') {
    return <p>{data.body}</p>;
  }
  const option: EChartsOption =
    data.kind === 'series'
      ? {
          tooltip: { trigger: 'axis' },
          grid: { left: 32, right: 12, top: 14, bottom: 26 },
          xAxis: { type: 'category', data: data.labels, boundaryGap: false },
          yAxis: { type: 'value' },
          series: data.series.map((series) => ({
            name: series.name,
            type: panel.kind === 'bar' ? 'bar' : 'line',
            data: series.values,
            smooth: true,
            showSymbol: false,
          })),
        }
      : {
          tooltip: { trigger: 'item' },
          legend: { bottom: 0 },
          series: [
            {
              type: 'pie',
              radius: ['48%', '72%'],
              center: ['50%', '43%'],
              data: data.labels.map((name, index) => ({ name, value: data.values[index] })),
              label: { show: false },
            },
          ],
        };
  return <HaChart option={option} height="100%" ariaLabel={panel.title} ariaDescription={panel.description} />;
}

function ContractUnavailable(): JSX.Element {
  return (
    <div className="dsh-contract-panel">
      <AlertTriangle size={18} />
      <strong>Execution contract unavailable</strong>
      <span>Panel metadata is visible; production data is not inferred.</span>
    </div>
  );
}

function ExecutablePanel({ panel }: { panel: DashboardPanel }): JSX.Element {
  const userRoles = useAuthStore((state) => state.user?.roles);
  const canRun = canExecuteDashboardPanels(userRoles);
  const visualizationId = panel.visualizationId;

  const query = useQuery({
    queryKey: ['dashboard-panel-run', visualizationId, panel.kind],
    queryFn: async (): Promise<DashboardPanelData> => {
      if (visualizationId === undefined) {
        throw new Error('Panel has no visualization id');
      }
      const raw = await executePanelVisualization(visualizationId);
      const mapped = mapVisualizationRunToPanelData(panel.kind, raw);
      if (!mapped) {
        throw new Error('Visualization result could not be projected for this panel kind');
      }
      return mapped;
    },
    enabled: visualizationId !== undefined && canRun,
    staleTime: 30_000,
  });

  if (!canRun) {
    return (
      <div className="dsh-contract-panel">
        <AlertTriangle size={18} />
        <strong>Visualization run not authorized</strong>
        <span>Required permission: Analyst, SOC Manager, or Platform Administrator</span>
      </div>
    );
  }

  if (query.isLoading) {
    return (
      <div className="dsh-contract-panel">
        <strong>Running visualization…</strong>
        <span>Executing the authorized panel query.</span>
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div className="dsh-contract-panel">
        <AlertTriangle size={18} />
        <strong>Panel execution failed</strong>
        <span>{query.error instanceof Error ? query.error.message : 'The visualization could not be executed.'}</span>
        <button className="dsh-button" type="button" onClick={() => void query.refetch()}>
          Retry
        </button>
      </div>
    );
  }

  return <StaticPanelBody panel={panel} data={query.data} />;
}

export function DashboardPanelRenderer({ panel }: { panel: DashboardPanel }): JSX.Element {
  // Fixture / pre-projected data wins — never invent rows when neither data nor a run id exists.
  if (panel.data) {
    return <StaticPanelBody panel={panel} data={panel.data} />;
  }

  if (panel.visualizationId !== undefined) {
    return <ExecutablePanel panel={panel} />;
  }

  return <ContractUnavailable />;
}
