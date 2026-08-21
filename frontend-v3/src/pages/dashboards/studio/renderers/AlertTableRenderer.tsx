/**
 * AlertTableRenderer — Live alert table renderer using AG Grid
 * Session S33 — Dashboard Studio widget renderers (§8, DSH-03)
 */

import type React from 'react';
import { useMemo } from 'react';

import type { ColDef } from 'ag-grid-community';

import { SiemDataGrid } from '@/components/siem-data-grid';

export interface AlertTableRendererProps {
  data: unknown;
  config: AlertTableWidgetConfig;
  height?: string | number;
}

export interface AlertTableWidgetConfig {
  maxRows: number;
  severityFilter?: number[];
  statusFilter?: string[];
}

export function AlertTableRenderer({ data, config, height = '100%' }: AlertTableRendererProps): React.JSX.Element {
  const alerts = parseAlertData(data);

  const columnDefs = useMemo<ColDef[]>(
    () => [
      {
        field: 'timestamp',
        headerName: 'Time',
        width: 140,
        cellRenderer: (params: { value: string }) => {
          const date = new Date(params.value);
          return date.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          });
        },
      },
      {
        field: 'severity',
        headerName: 'Severity',
        width: 100,
        cellRenderer: (params: { value: number }) => {
          const severityMap: Record<number, { label: string; color: string }> = {
            1: { label: 'Critical', color: 'var(--ha-critical)' },
            2: { label: 'High', color: 'var(--ha-high)' },
            3: { label: 'Medium', color: 'var(--ha-medium)' },
            4: { label: 'Low', color: 'var(--ha-positive)' },
          };
          const sev = severityMap[params.value] || { label: 'Unknown', color: 'var(--ha-text-secondary)' };
          return `<span style="color: ${sev.color}; font-weight: 500;">${sev.label}</span>`;
        },
      },
      {
        field: 'title',
        headerName: 'Alert',
        flex: 1,
        cellStyle: {
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        },
      },
      {
        field: 'status',
        headerName: 'Status',
        width: 100,
      },
    ],
    []
  );

  // Apply filters
  const filteredAlerts = useMemo(() => {
    let filtered = alerts;

    if (config.severityFilter && config.severityFilter.length > 0) {
      filtered = filtered.filter((a) => config.severityFilter?.includes(a.severity));
    }

    if (config.statusFilter && config.statusFilter.length > 0) {
      filtered = filtered.filter((a) => config.statusFilter?.includes(a.status));
    }

    return filtered.slice(0, config.maxRows);
  }, [alerts, config.severityFilter, config.statusFilter, config.maxRows]);

  return (
    <SiemDataGrid
      columnDefs={columnDefs}
      rowData={filteredAlerts}
      height={height}
      rowSelection="single"
      defaultColDef={{
        sortable: true,
        resizable: true,
        filter: false,
      }}
      paginationPageSize={config.maxRows}
    />
  );
}

interface Alert {
  id: string;
  timestamp: string;
  severity: number;
  title: string;
  status: string;
}

function parseAlertData(data: unknown): Alert[] {
  if (!Array.isArray(data)) return [];

  return data
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item) => ({
      id: typeof item.id === 'string' || typeof item.id === 'number' ? String(item.id) : '',
      timestamp: typeof item.timestamp === 'string' ? item.timestamp : new Date().toISOString(),
      severity: typeof item.severity === 'number' ? item.severity : 4,
      title: typeof item.title === 'string' ? item.title : 'Untitled Alert',
      status: typeof item.status === 'string' ? item.status : 'Open',
    }));
}
