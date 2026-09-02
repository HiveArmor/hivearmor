import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { IdentitiesPage, POSTURE_IDENTITIES_JOB_SENTENCE } from './IdentitiesPage';
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
  pivots: [{ type: 'dossier', label: 'Open dossier', route: '/entities/identity-human-00001' }, { type: 'hunt', label: 'Hunt activity', route: '/search?q=sarah.chen' }],
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

function renderPage(): ReturnType<typeof render> {
  return render(
    <MemoryRouter>
      <IdentitiesPage />
    </MemoryRouter>,
  );
}

describe('IdentitiesPage', () => {
  it('renders inventory-first honesty chrome, inline stats, and operational dock', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'Identities' })).toBeDefined();
    expect(screen.getByText(POSTURE_IDENTITIES_JOB_SENTENCE)).toBeDefined();
    expect(screen.getByText('STAGING CANDIDATE')).toBeDefined();
    expect(screen.getByText('186 total')).toBeDefined();
    expect(screen.getByText('71 high risk')).toBeDefined();
    expect(screen.getByRole('grid', { name: 'Posture identity inventory' })).toBeDefined();
    expect(screen.getByTestId('status-dock')).toBeDefined();
  });

  it('provides compact risk, identity kind, authentication and sort filters', () => {
    renderPage();
    expect(screen.getByRole('combobox', { name: 'Filter by risk' })).toBeDefined();
    expect(screen.getByRole('combobox', { name: 'Filter by identity kind' })).toBeDefined();
    expect(screen.getByRole('combobox', { name: 'Filter by authentication strength' })).toBeDefined();
    expect(screen.getByRole('combobox', { name: 'Sort identity posture' })).toBeDefined();
  });

  it('opens progressive identity context with risk signals and access paths', () => {
    renderPage();
    fireEvent.click(screen.getByRole('row', { name: /Sarah Chen/ }));
    expect(screen.getByRole('dialog', { name: 'Sarah Chen' })).toBeDefined();
    expect(screen.getByText('Hive Intelligence')).toBeDefined();
    fireEvent.click(screen.getByRole('tab', { name: 'risk' }));
    expect(screen.getByText('Credential exposure signal')).toBeDefined();
    fireEvent.click(screen.getByRole('tab', { name: 'controls' }));
    expect(screen.getByText('Global Administrator')).toBeDefined();
  });

  it('supports slash focus and icon-based density controls', () => {
    renderPage();
    fireEvent.keyDown(window, { key: '/' });
    expect(document.activeElement).toBe(screen.getByRole('searchbox', { name: 'Search identities' }));
    expect(screen.getByRole('button', { name: 'Compact rows' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Standard rows' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Comfortable rows' })).toBeDefined();
  });

  it('keeps error, partial-contract, empty-inventory and filtered-empty states distinct', () => {
    useQuery.mockReturnValue(queryState({ data: undefined, isError: true, error: new Error('403 forbidden') }));
    const { rerender } = renderPage();
    expect(screen.getByText('Identity posture access denied')).toBeDefined();

    useQuery.mockReturnValue(queryState({
      data: { ...page, items: [], total: 0, summary: { ...page.summary, total: 0, highRisk: 0 } },
    }));
    rerender(
      <MemoryRouter>
        <IdentitiesPage />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('identities-empty-honesty')).toBeDefined();

    useQuery.mockReturnValue(queryState({
      data: {
        ...page,
        contractState: 'partial',
        partialFailures: [{ source: 'identity-posture', message: 'Authentication projection unavailable.' }],
      },
    }));
    rerender(
      <MemoryRouter>
        <IdentitiesPage />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Authentication projection unavailable/)).toBeDefined();
  });
});
