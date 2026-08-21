import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { IdentitiesPage } from './IdentitiesPage';
import type { IdentityPostureItem, IdentityPosturePage, IdentityPosturePreview } from './identity.types';

vi.mock('@/hooks/useEpsStream', () => ({ useEpsStream: () => ({ connected: true, eps: 12840 }) }));
vi.mock('@/components/status-dock', () => ({ StatusDock: () => <div data-testid="status-dock">Connected · Live</div> }));
vi.mock('@/components/ha-drawer/HaDrawer', () => ({
  HaDrawer: ({ isOpen, title, children, footer }: { isOpen: boolean; title: string; children: React.ReactNode; footer?: React.ReactNode }) => isOpen ? <aside role="dialog" aria-label={title}>{children}{footer}</aside> : null,
}));
vi.mock('@/components/siem-data-grid', () => ({
  SiemDataGrid: ({ rowData, onRowClicked, ariaLabel }: { rowData: IdentityPostureItem[]; onRowClicked: (event: { data: IdentityPostureItem }) => void; ariaLabel: string }) => <div role="grid" aria-label={ariaLabel}>{rowData.map((row) => <button key={row.id} type="button" role="row" onClick={() => onRowClicked({ data: row })}>{row.displayName} {row.value}</button>)}</div>,
}));

const useQuery = vi.fn();
vi.mock('@tanstack/react-query', () => ({ useQuery: (...args: unknown[]) => useQuery(...args) }));

const identity: IdentityPostureItem = {
  id: 'identity-human-00001', value: 'sarah.chen', displayName: 'Sarah Chen', kind: 'human', riskScore: 94,
  riskLevel: 'critical', riskTrend: 'rising', privilege: 'tier_0', authStrength: 'single_factor',
  accountState: 'active', controlState: 'exposed', alertCount: 7, lastSeen: '2026-08-03T13:00:00Z',
  firstSeen: '2026-01-03T13:00:00Z', tenantName: 'Northstar Finance', department: 'Finance Operations',
  observationSources: ['Identity provider'], tags: ['privileged'],
  pivots: [{ type: 'dossier', label: 'Open dossier', route: '/entities/identity-human-00001' }, { type: 'hunt', label: 'Hunt activity', route: '/search?query=sarah.chen' }],
};

const page: IdentityPosturePage = {
  items: [identity], cursor: 'identity-fixture-50', total: 186,
  summary: { total: 186, highRisk: 71, privileged: 43, nonHuman: 32, controlGaps: 29, stale: 9 },
  snapshotAt: '2026-08-03T13:16:18Z', contractState: 'complete', partialFailures: [],
};

const preview: IdentityPosturePreview = {
  ...identity, email: 'sarah.chen@example.invalid', manager: 'Maya Chen', jobTitle: 'Senior Finance Analyst',
  riskCalculatedAt: '2026-08-03T13:16:18Z', activeSessions: 4, riskySignIns30d: 7,
  credentialExposure: 'suspected', mfaRegistered: false, passwordlessCapable: false, conditionalAccess: 'missing',
  riskSignals: [{ id: 'signal', label: 'Credential exposure signal', description: 'Credential exposure correlated.', severity: 'critical', contribution: 34, evidenceCount: 3, source: 'Credential intelligence', observedAt: identity.lastSeen }],
  accessPaths: [{ id: 'path', label: 'Global Administrator', type: 'role', criticality: 'critical', inherited: false }],
  activity: [{ id: 'event', occurredAt: identity.lastSeen, title: 'Risky sign-in correlated', detail: 'First-seen device', state: 'risk', source: 'Identity provider' }],
  intelligenceSummary: 'Credential and authentication anomalies overlap with privileged access.',
  recommendedActions: ['Validate the recent sign-in'], permissions: { hunt: true, openDossier: true, requestRemediation: true }, dataCompleteness: 'full',
};

function queryState(overrides: Record<string, unknown> = {}) {
  return { data: page, isLoading: false, isFetching: false, isError: false, error: null, dataUpdatedAt: Date.now(), refetch: vi.fn(), ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  useQuery.mockImplementation((options: { queryKey?: string[] }) => options.queryKey?.[0] === 'identity-posture-preview'
    ? { ...queryState(), data: preview }
    : queryState());
});

describe('IdentitiesPage', () => {
  it('renders the identity-risk queue, posture summary and operational dock', () => {
    render(<IdentitiesPage />);
    expect(screen.getByRole('heading', { name: 'Identity Security' })).toBeDefined();
    expect(screen.getByText('Known identities')).toBeDefined();
    expect(screen.getByRole('grid', { name: 'Identity security posture inventory' })).toBeDefined();
    expect(screen.getByTestId('status-dock')).toBeDefined();
  });

  it('provides compact risk, identity kind, authentication and sort filters', () => {
    render(<IdentitiesPage />);
    expect(screen.getByRole('combobox', { name: 'Filter by risk' })).toBeDefined();
    expect(screen.getByRole('combobox', { name: 'Filter by identity kind' })).toBeDefined();
    expect(screen.getByRole('combobox', { name: 'Filter by authentication strength' })).toBeDefined();
    expect(screen.getByRole('combobox', { name: 'Sort identity posture' })).toBeDefined();
  });

  it('opens progressive identity context with risk signals and access paths', () => {
    render(<IdentitiesPage />);
    fireEvent.click(screen.getByRole('row', { name: /Sarah Chen/ }));
    expect(screen.getByRole('dialog', { name: 'Sarah Chen' })).toBeDefined();
    expect(screen.getByText('Hive Intelligence')).toBeDefined();
    fireEvent.click(screen.getByRole('tab', { name: 'signals' }));
    expect(screen.getByText('Credential exposure signal')).toBeDefined();
    fireEvent.click(screen.getByRole('tab', { name: 'access' }));
    expect(screen.getByText('Global Administrator')).toBeDefined();
  });

  it('supports slash focus and icon-based density controls', () => {
    render(<IdentitiesPage />);
    fireEvent.keyDown(window, { key: '/' });
    expect(document.activeElement).toBe(screen.getByRole('searchbox', { name: 'Search identities' }));
    expect(screen.getByRole('button', { name: 'Compact rows' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Standard rows' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Comfortable rows' })).toBeDefined();
  });

  it('keeps error, partial-contract and filtered-empty states distinct', () => {
    useQuery.mockReturnValue(queryState({ data: undefined, isError: true, error: new Error('403 forbidden') }));
    const { rerender } = render(<IdentitiesPage />);
    expect(screen.getByText('Identity posture access denied')).toBeDefined();

    useQuery.mockReturnValue(queryState({ data: { ...page, items: [], total: 0 } }));
    rerender(<IdentitiesPage />);
    expect(screen.getByText('No identities observed')).toBeDefined();

    useQuery.mockReturnValue(queryState({ data: { ...page, partialFailures: [{ source: 'identity-posture', message: 'Authentication projection unavailable.' }] } }));
    rerender(<IdentitiesPage />);
    expect(screen.getByText('Authentication projection unavailable.')).toBeDefined();
  });
});
