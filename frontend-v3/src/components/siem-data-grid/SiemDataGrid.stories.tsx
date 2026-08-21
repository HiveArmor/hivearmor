import type { Meta, StoryObj } from '@storybook/react';
import type { ColDef } from 'ag-grid-community';

import { SiemDataGrid } from './SiemDataGrid';

interface AlertRow {
  id: string;
  name: string;
  severity: string;
  status: string;
  source: string;
  timestamp: string;
}

const columnDefs: ColDef<AlertRow>[] = [
  { field: 'id', headerName: 'ID', width: 100 },
  { field: 'name', headerName: 'Alert Name', flex: 2 },
  { field: 'severity', headerName: 'Severity', width: 120 },
  { field: 'status', headerName: 'Status', width: 120 },
  { field: 'source', headerName: 'Source', flex: 1 },
  { field: 'timestamp', headerName: 'Time', width: 160 },
];

const rowData: AlertRow[] = [
  { id: 'HA-001', name: 'Suspicious PowerShell Execution', severity: 'Critical', status: 'Open', source: 'Windows', timestamp: '2024-07-26 10:23:15' },
  { id: 'HA-002', name: 'Brute Force Login Attempt', severity: 'High', status: 'In Progress', source: 'Auth', timestamp: '2024-07-26 10:15:02' },
  { id: 'HA-003', name: 'Outbound DNS Anomaly', severity: 'Medium', status: 'Open', source: 'Network', timestamp: '2024-07-26 09:58:47' },
  { id: 'HA-004', name: 'Port Scan Detected', severity: 'Medium', status: 'Resolved', source: 'Firewall', timestamp: '2024-07-26 09:32:11' },
  { id: 'HA-005', name: 'Scheduled Task Created', severity: 'Low', status: 'Open', source: 'Windows', timestamp: '2024-07-26 09:01:55' },
];

const meta = {
  title: 'HiveArmor/SiemDataGrid',
  component: SiemDataGrid,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof SiemDataGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    columnDefs: columnDefs as ColDef[],
    rowData,
    height: 400,
    rowHeight: 32,
  },
};

export const Loading: Story = {
  args: {
    columnDefs: columnDefs as ColDef[],
    rowData: [],
    height: 400,
    loading: true,
  },
};

export const Empty: Story = {
  args: {
    columnDefs: columnDefs as ColDef[],
    rowData: [],
    height: 400,
  },
};

export const WithRowSelection: Story = {
  args: {
    columnDefs: columnDefs as ColDef[],
    rowData,
    height: 400,
    rowHeight: 32,
    rowSelection: 'multiple',
  },
};
