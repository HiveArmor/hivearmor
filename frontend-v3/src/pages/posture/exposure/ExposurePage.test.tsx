import { forwardRef } from 'react';

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ExposurePage } from './ExposurePage';

import type { AttackPathDTO, ExposurePageDTO, ExposureRow } from '@/types/exposure.types';

vi.mock('@/hooks/useEpsStream', () => ({ useEpsStream: () => ({ connected: true, eps: 12840 }) }));
vi.mock('@/components/status-dock', () => ({ StatusDock: () => <div data-testid="status-dock">Connected · Live</div> }));
vi.mock('@/components/ha-drawer/HaDrawer', () => ({ HaDrawer: ({ isOpen, title, children, footer }: { isOpen: boolean; title: string; children: React.ReactNode; footer?: React.ReactNode }) => isOpen ? <aside role="dialog" aria-label={title}>{children}{footer}</aside> : null }));
function rowLabel(row: ExposureRow): string { return 'title' in row ? row.title : row.name; }
vi.mock('@/components/siem-data-grid', () => ({ SiemDataGrid: forwardRef(function TestGrid(_props: { rowData: ExposureRow[]; onRowClicked: (event: { data: ExposureRow }) => void; ariaLabel: string }, _ref) { const { rowData, onRowClicked, ariaLabel } = _props; return <div role="grid" aria-label={ariaLabel}>{rowData.map((row) => <button key={row.id} type="button" role="row" onClick={() => onRowClicked({ data: row })}>{rowLabel(row)}</button>)}</div>; }) }));

const useQuery = vi.fn();
vi.mock('@tanstack/react-query', () => ({ useQuery: (...args: unknown[]) => useQuery(...args) }));

const path: AttackPathDTO = {
  id: 'path-1', title: 'Internet-facing VPN reaches Tier-0 directory services', summary: 'A verified path reaches the primary domain controller.', riskLevel: 'critical', riskScore: 96, state: 'active', scope: 'hybrid',
  entryPoint: { id: 'ip-1', name: '203.0.113.18', type: 'ip', criticality: 'standard' }, target: { id: 'host-1', name: 'IDM-DC-02', type: 'host', criticality: 'critical' },
  pathNodes: [{ id: 'ip-1', name: '203.0.113.18', type: 'ip', criticality: 'standard', relationship: 'Internet reachable' }, { id: 'host-1', name: 'IDM-DC-02', type: 'host', criticality: 'critical', relationship: 'Controls domain' }],
  hopCount: 1, weakPointCount: 2, criticalAssetCount: 1, exploitability: 'verified', techniques: ['T1190'], evidence: [{ id: 'ev-1', label: 'Reachability validated', value: 'Service responded from two probes.', source: 'External attack surface', observedAt: '2026-08-12T07:58:00Z', confidence: 98 }], recommendedAction: 'Restrict exposure and remove standing privilege.', owner: null, firstSeenAt: '2026-08-11T07:58:00Z', lastCalculatedAt: '2026-08-12T07:58:00Z',
};
const page: ExposurePageDTO = { items: [path], nextCursor: '50', total: 37, summary: { exposureScore: 78, activeAttackPaths: 37, criticalAssetsAtRisk: 14, internetEntryPoints: 9, chokePoints: 12, reduciblePaths: 26 }, snapshotAt: '2026-08-12T07:58:00Z', freshness: 'fresh', contractState: 'complete', partialFailures: [] };
function state(overrides: Record<string, unknown> = {}) { return { data: page, isLoading: false, isFetching: false, isError: false, error: null, dataUpdatedAt: Date.now(), refetch: vi.fn(), ...overrides }; }

beforeEach(() => { vi.clearAllMocks(); useQuery.mockReturnValue(state()); window.history.replaceState({}, '', '/posture/exposure'); });

describe('ExposurePage', () => {
  it('renders prioritized exposure KPIs, coordinated views, filters and the dock', () => {
    render(<ExposurePage />);
    expect(screen.getByRole('heading', { name: 'Exposure Management' })).toBeDefined();
    expect(screen.getByText('Exposure score')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Choke points' })).toBeDefined();
    expect(screen.getByRole('combobox', { name: 'Filter by exposure scope' })).toBeDefined();
    expect(screen.getByRole('grid', { name: 'Attack paths exposure inventory' })).toBeDefined();
    expect(screen.getByTestId('status-dock')).toBeDefined();
  });

  it('opens path, evidence and remediation context without executing a change', () => {
    render(<ExposurePage />);
    fireEvent.click(screen.getByRole('row', { name: path.title }));
    expect(screen.getByRole('dialog', { name: path.title })).toBeDefined();
    expect(screen.getByText('Hive Intelligence')).toBeDefined();
    fireEvent.click(screen.getByRole('tab', { name: 'path' }));
    expect(screen.getByText('Controls domain')).toBeDefined();
    fireEvent.click(screen.getByRole('tab', { name: 'evidence' }));
    expect(screen.getByText('Service responded from two probes.')).toBeDefined();
    fireEvent.click(screen.getByRole('tab', { name: 'remediation' }));
    expect(screen.getByText(/Creating a plan does not change production/)).toBeDefined();
  });

  it('supports slash focus and icon-based row density', () => {
    render(<ExposurePage />);
    fireEvent.keyDown(window, { key: '/' });
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Search exposure records' }));
    expect(screen.getByRole('button', { name: 'Compact rows' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Standard rows' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Comfortable rows' })).toBeDefined();
  });

  it('keeps missing backend, zero paths, stale, and errors distinct', () => {
    useQuery.mockReturnValue(state({ data: { ...page, items: [], total: 0, contractState: 'missing', partialFailures: [{ source: 'graph', message: 'Backend required.' }] } }));
    const { rerender } = render(<ExposurePage />);
    expect(screen.getByText('Exposure graph integration required')).toBeDefined();
    useQuery.mockReturnValue(state({ data: { ...page, items: [], total: 0 } }));
    rerender(<ExposurePage />);
    expect(screen.getByText('No active attack paths were generated')).toBeDefined();
    useQuery.mockReturnValue(state({ data: { ...page, freshness: 'stale' } }));
    rerender(<ExposurePage />);
    expect(screen.getByText(/exposure projection is stale/)).toBeDefined();
    useQuery.mockReturnValue(state({ data: undefined, isError: true, error: new Error('403 forbidden') }));
    rerender(<ExposurePage />);
    expect(screen.getByText('Exposure projection unavailable')).toBeDefined();
  });
});
