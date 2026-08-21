import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ActiveDirectoryPage } from './ActiveDirectoryPage';

import type { AdAssessmentDTO, AdPosturePage, AdRow } from '@/types/active-directory.types';

vi.mock('@/hooks/useEpsStream', () => ({ useEpsStream: () => ({ connected: true, eps: 12840 }) }));
vi.mock('@/components/status-dock', () => ({ StatusDock: () => <div data-testid="status-dock">Connected · Live</div> }));
vi.mock('@/components/ha-drawer/HaDrawer', () => ({ HaDrawer: ({ isOpen, title, children, footer }: { isOpen: boolean; title: string; children: React.ReactNode; footer?: React.ReactNode }) => isOpen ? <aside role="dialog" aria-label={title}>{children}{footer}</aside> : null }));
function rowLabel(row: AdRow): string {
  if ('title' in row) return row.title;
  if ('postureScore' in row) return row.domainName;
  if ('monitoringState' in row) return row.name;
  return row.action;
}

vi.mock('@/components/siem-data-grid', () => ({ SiemDataGrid: ({ rowData, onRowClicked, ariaLabel }: { rowData: AdRow[]; onRowClicked: (event: { data: AdRow }) => void; ariaLabel: string }) => <div role="grid" aria-label={ariaLabel}>{rowData.map((row) => <button key={row.id} type="button" role="row" onClick={() => onRowClicked({ data: row })}>{rowLabel(row)}</button>)}</div> }));

const useQuery = vi.fn();
vi.mock('@tanstack/react-query', () => ({ useQuery: (...args: unknown[]) => useQuery(...args) }));

const assessment: AdAssessmentDTO = {
  id: 'assessment-1', title: 'Service accounts retain nested Tier-0 membership', summary: 'Nested privileged access increases domain compromise risk.', category: 'accounts', riskLevel: 'critical', state: 'open', domainId: 'domain-1', domainName: 'northstar.corp', exposedEntityCount: 12, scoreImpact: 14, attackTechniques: ['T1098'],
  evidence: [{ id: 'e-1', label: 'Directory configuration', value: 'Nested membership observed', source: 'Directory sensor', observedAt: '2026-08-03T13:00:00Z' }],
  affectedEntities: [{ id: 'entity-1', name: 'svc-backup', type: 'user', criticality: 'tier_0', path: 'Account → group → Domain Admins' }], recommendation: 'Validate and remove unnecessary nested privilege.', owner: null, dueAt: null, firstDetectedAt: '2026-07-03T13:00:00Z', lastEvaluatedAt: '2026-08-03T13:00:00Z',
};
const page: AdPosturePage = { items: [assessment], cursor: 'ad-fixture-50', total: 78, domains: [{ value: 'domain-1', label: 'northstar.corp' }], summary: { postureScore: 64, criticalAssessments: 12, tierZeroPaths: 33, riskyChanges24h: 18, unhealthySensors: 4, replicationIssues: 3 }, snapshotAt: '2026-08-03T13:16:18Z', contractState: 'complete', partialFailures: [] };
function state(overrides: Record<string, unknown> = {}) { return { data: page, isLoading: false, isFetching: false, isError: false, error: null, dataUpdatedAt: Date.now(), refetch: vi.fn(), ...overrides }; }

beforeEach(() => { vi.clearAllMocks(); useQuery.mockReturnValue(state()); });

describe('ActiveDirectoryPage', () => {
  it('renders domain posture KPIs, coordinated views, filters and the operational dock', () => {
    render(<ActiveDirectoryPage />);
    expect(screen.getByRole('heading', { name: 'Active Directory Security' })).toBeDefined();
    expect(screen.getByText('Posture score')).toBeDefined();
    expect(screen.getByRole('button', { name: /Domains & trusts/ })).toBeDefined();
    expect(screen.getByRole('combobox', { name: 'Filter by domain' })).toBeDefined();
    expect(screen.getByRole('grid', { name: 'Active Directory posture inventory' })).toBeDefined();
    expect(screen.getByTestId('status-dock')).toBeDefined();
  });

  it('opens progressive assessment detail with evidence and exposure paths', () => {
    render(<ActiveDirectoryPage />);
    fireEvent.click(screen.getByRole('row', { name: assessment.title }));
    expect(screen.getByRole('dialog', { name: assessment.title })).toBeDefined();
    expect(screen.getByText('Hive Intelligence')).toBeDefined();
    fireEvent.click(screen.getByRole('tab', { name: 'evidence' }));
    expect(screen.getByText('Nested membership observed')).toBeDefined();
    fireEvent.click(screen.getByRole('tab', { name: 'exposure' }));
    expect(screen.getByText('svc-backup')).toBeDefined();
  });

  it('supports slash focus and icon row-density controls', () => {
    render(<ActiveDirectoryPage />);
    fireEvent.keyDown(window, { key: '/' });
    expect(document.activeElement).toBe(screen.getByRole('searchbox', { name: 'Search directory posture' }));
    expect(screen.getByRole('button', { name: 'Compact rows' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Standard rows' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Comfortable rows' })).toBeDefined();
  });

  it('keeps missing backend, empty and error states distinct', () => {
    useQuery.mockReturnValue(state({ data: { ...page, items: [], total: 0, contractState: 'missing', partialFailures: [{ source: 'ad', message: 'Backend required.' }] } }));
    const { rerender } = render(<ActiveDirectoryPage />);
    expect(screen.getByText('Active Directory backend integration required')).toBeDefined();
    useQuery.mockReturnValue(state({ data: { ...page, items: [], total: 0 } }));
    rerender(<ActiveDirectoryPage />);
    expect(screen.getByText('No directory observations available')).toBeDefined();
    useQuery.mockReturnValue(state({ data: undefined, isError: true, error: new Error('403 forbidden') }));
    rerender(<ActiveDirectoryPage />);
    expect(screen.getByText('Directory posture unavailable')).toBeDefined();
  });
});
