import React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ResponseLibraryPage } from './ResponseLibraryPage';

import type { ResponseAction } from '@/types/responseAction';

const navigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

const hasAnyRole = vi.fn(() => true);
vi.mock('@/store/auth.store', () => ({ useAuthStore: () => ({ hasAnyRole }) }));
vi.mock('@/hooks/useEpsStream', () => ({ useEpsStream: () => ({ connected: true, eps: 12840 }) }));
vi.mock('@/services/responseActionService', () => ({ fetchResponseActionLibrary: vi.fn() }));

const useQuery = vi.fn();
vi.mock('@tanstack/react-query', () => ({ useQuery: (...args: unknown[]) => useQuery(...args) }));

vi.mock('@/components/status-dock/StatusDock', () => ({ StatusDock: () => <div data-testid="status-dock">Connected</div> }));
vi.mock('@/components/ha-drawer/HaDrawer', () => ({
  HaDrawer: ({ isOpen, title, children, footer }: { isOpen: boolean; title: string; children: React.ReactNode; footer?: React.ReactNode }) => isOpen ? <aside role="dialog" aria-label={title}>{children}{footer}</aside> : null,
}));

const ACTIONS: ResponseAction[] = [
  { id: 'isolate_host', name: 'Isolate Host', category: 'containment', description: 'Isolate a host.', targetType: 'host', integrationStatus: 'healthy', riskLevel: 'critical', requiredRole: 'ROLE_SOC_MANAGER', integrationName: 'Endpoint control', requiresApproval: true, rollbackSupported: true, usageCount: 9, params: [{ name: 'duration', type: 'string', required: true, description: 'Isolation duration.', defaultValue: '4h', options: null }] },
  { id: 'block_ip', name: 'Block IP Address', category: 'containment', description: 'Block an IP.', targetType: 'ip', integrationStatus: 'healthy', riskLevel: 'medium', requiredRole: 'ROLE_SOC_ANALYST', integrationName: 'Network enforcement', requiresApproval: false, rollbackSupported: true, usageCount: 11, params: [] },
  { id: 'collect_forensics', name: 'Collect Forensic Artifacts', category: 'investigation', description: 'Collect evidence.', targetType: 'host', integrationStatus: 'degraded', riskLevel: 'low', requiredRole: 'ROLE_SOC_ANALYST', integrationName: 'Endpoint telemetry', requiresApproval: false, rollbackSupported: null, usageCount: 4, params: [] },
];

function queryState(overrides: Record<string, unknown> = {}) {
  return { data: ACTIONS, isLoading: false, isFetching: false, isError: false, error: null, dataUpdatedAt: Date.now(), refetch: vi.fn(), ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  hasAnyRole.mockReturnValue(true);
  useQuery.mockReturnValue(queryState());
});

describe('ResponseLibraryPage', () => {
  it('renders the governed action inventory and status dock', () => {
    render(<ResponseLibraryPage />);
    expect(screen.getByRole('heading', { name: 'Action & Connector Library' })).toBeDefined();
    expect(screen.getAllByRole('row')).toHaveLength(4);
    expect(screen.getByText('Network enforcement')).toBeDefined();
    expect(screen.getByTestId('status-dock')).toBeDefined();
  });

  it('filters the inventory across action names and parameter schema', () => {
    render(<ResponseLibraryPage />);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search actions' }), { target: { value: 'duration' } });
    expect(screen.getByText('Isolate Host')).toBeDefined();
    expect(screen.queryByText('Block IP Address')).toBeNull();
  });

  it('filters by category and readiness', () => {
    render(<ResponseLibraryPage />);
    fireEvent.click(screen.getByRole('button', { name: /Investigation 1/i }));
    expect(screen.getByText('Collect Forensic Artifacts')).toBeDefined();
    expect(screen.queryByText('Isolate Host')).toBeNull();
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter by readiness' }), { target: { value: 'healthy' } });
    expect(screen.getByText('No matching actions')).toBeDefined();
  });

  it('opens a full action inspector with schema and governed builder pivot', () => {
    render(<ResponseLibraryPage />);
    fireEvent.click(screen.getByRole('row', { name: /Isolate Host/ }));
    expect(screen.getByRole('dialog', { name: 'Isolate Host' })).toBeDefined();
    fireEvent.click(screen.getByRole('tab', { name: 'Inputs 1' }));
    expect(screen.getByText('Isolation duration.')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Add to playbook' }).getAttribute('href')).toBe('/response/playbooks/new?action=isolate_host');
  });

  it('supports slash keyboard focus for analyst navigation', () => {
    render(<ResponseLibraryPage />);
    fireEvent.keyDown(window, { key: '/' });
    expect(document.activeElement).toBe(screen.getByRole('searchbox', { name: 'Search actions' }));
  });

  it('renders loading, error, and access-denied states without exposing fixtures', () => {
    useQuery.mockReturnValue(queryState({ data: undefined, isLoading: true }));
    const { rerender } = render(<ResponseLibraryPage />);
    expect(screen.getByText('Loading governed action catalog')).toBeDefined();

    useQuery.mockReturnValue(queryState({ data: undefined, isError: true, error: new Error('catalog offline') }));
    rerender(<ResponseLibraryPage />);
    expect(screen.getByText('Could not load the action catalog')).toBeDefined();

    hasAnyRole.mockReturnValue(false);
    rerender(<ResponseLibraryPage />);
    expect(screen.getByText('Response library restricted')).toBeDefined();
  });
});
