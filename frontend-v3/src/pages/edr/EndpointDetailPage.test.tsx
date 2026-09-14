/**
 * EndpointDetailPage tests (SPEC-03, W3).
 *
 * Covers, per the spec's gate (per-tab loading/empty/error + a11y):
 *   - Access gate: ROLE_USER → AccessDeniedState (no per-agent fetch).
 *   - Loading: skeleton while the detail query is pending.
 *   - Not-found / error: honest ErrorState, no faked row.
 *   - Loaded header: hostname, OS/IP, tenant echo, composite health badge.
 *   - Health honesty: a degraded agent shows the failing dimension (never green).
 *   - Tab semantics (a11y): role=tablist/tab, aria-selected, tab switching.
 *   - Per-tab honesty: Security/Commands/Configuration render the capability
 *     note + empty state instead of a faked list; Logs renders the ATT&CK note.
 *   - Action safety (SPEC-01): actions disabled in the all-tenants aggregate
 *     view; enabled + confirm modal echoing host + agent id + tenant +
 *     reversibility when a concrete tenant is selected.
 *
 * The vitals sparkline wraps HaChart (ECharts + getComputedStyle) — mocked to a
 * plain element so jsdom never touches canvas.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EndpointDetailPage } from './EndpointDetailPage';

import type { AgentDetail } from '@/services/agentDetail.service';
import type { AgentVitalsSample } from '@/services/telemetryService';
import { useAuthStore } from '@/store/auth.store';

// ── Mocks ──────────────────────────────────────────────────────────────────
const mocks = vi.hoisted(() => ({
  fetchAgentDetail: vi.fn(),
  fetchAgentEnrollmentAudit: vi.fn(),
  fetchAgentVitals: vi.fn(),
  fetchEndpointAiAssessment: vi.fn(),
  useMastheadTenants: vi.fn(),
}));

vi.mock('@/services/agentDetail.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/agentDetail.service')>();
  return {
    ...actual, // keep the real capability-note constants
    fetchAgentDetail: mocks.fetchAgentDetail,
    fetchAgentEnrollmentAudit: mocks.fetchAgentEnrollmentAudit,
  };
});

vi.mock('@/services/endpointAiAssessment.service', () => ({
  fetchEndpointAiAssessment: mocks.fetchEndpointAiAssessment,
}));

vi.mock('@/services/telemetryService', () => ({
  fetchAgentVitals: mocks.fetchAgentVitals,
}));

vi.mock('@/hooks/useMastheadTenants', () => ({
  useMastheadTenants: () => mocks.useMastheadTenants(),
}));

// HaChart wraps ECharts — render a plain element so the sparkline is inert in jsdom.
vi.mock('@/components/ha-chart/HaChart', () => ({
  HaChart: ({ ariaLabel }: { ariaLabel?: string }) => <div role="img" aria-label={ariaLabel} />,
}));

// The Logs tab embeds the timeline body (heavy: monaco/echarts) — stub it.
vi.mock('./EndpointTimelineBody', () => ({
  EndpointTimelineBody: ({ agentId }: { agentId: string }) => (
    <div data-testid="timeline-body">timeline for {agentId}</div>
  ),
}));

// ── Fixtures ─────────────────────────────────────────────────────────────
function makeAgent(overrides: Partial<AgentDetail> = {}): AgentDetail {
  return {
    agentId: 'agent-77',
    hostname: 'db-prod-02',
    platform: 'linux',
    osVersion: 'Ubuntu 22.04',
    agentVersion: '3.1.0',
    connectionStatus: 'ONLINE',
    lastSeen: new Date().toISOString(),
    cpuUsage: null,
    memUsage: null,
    diskUsage: null,
    collectorType: 'agent',
    mode: null,
    bundleVersion: '2026.09.1',
    ip: '10.20.30.42',
    mac: '02:42:0a:14:1e:2a',
    ...overrides,
  };
}

function healthyVitals(): AgentVitalsSample[] {
  return [
    {
      cpuPct: 18,
      ramMb: 512,
      queueDepth: 40,
      eventsPerSec: 120,
      droppedTotal: 0,
      lastError: null,
      appliedPolicyId: 1,
      appliedPolicyVersion: 3,
      sampledAt: new Date().toISOString(),
    },
  ];
}

function degradedVitals(): AgentVitalsSample[] {
  return [
    {
      cpuPct: 97, // red
      ramMb: 1024,
      queueDepth: 3200,
      eventsPerSec: 60,
      droppedTotal: 12,
      lastError: null,
      appliedPolicyId: 1,
      appliedPolicyVersion: 3,
      sampledAt: new Date().toISOString(),
    },
  ];
}

const ANALYST = {
  id: 1,
  login: 'analyst',
  firstName: 'Ari',
  lastName: 'Patel',
  email: 'ari@example.test',
  roles: ['ROLE_ANALYST'],
  langKey: 'en',
};

function setUser(roles: string[], selectedTenantId: number | null): void {
  useAuthStore.setState({
    user: { ...ANALYST, roles },
    token: 'test-token',
    isAuthenticated: true,
    isLoading: false,
    selectedTenantId,
  });
}

function renderPage(): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/edr/endpoints/agent-77']}>
        <Routes>
          <Route path="/edr/endpoints/:agentId" element={<EndpointDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('EndpointDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: a concrete tenant is selected (actions enabled) and inventory resolves.
    mocks.useMastheadTenants.mockReturnValue({
      tenants: [
        { id: null, prefix: '', label: 'All authorized tenants', description: '' },
        { id: 7, prefix: 'acme', label: 'Acme Corp', description: '' },
      ],
      inventory: undefined,
      isLoading: false,
      isError: false,
      notice: null,
    });
    mocks.fetchAgentVitals.mockResolvedValue(healthyVitals());
    mocks.fetchAgentEnrollmentAudit.mockResolvedValue([]);
    mocks.fetchEndpointAiAssessment.mockResolvedValue({
      outcome: 'answered',
      answer: 'Elevated process-creation activity from an unsigned binary; recommend isolating for triage.',
      confidence: 72,
      sources: ['process.create · unsigned binary', 'network.connection · low-reputation host'],
      durationMs: 1180,
      steps: [
        { label: 'Signal review', detail: '2 grounded sources cited' },
        { label: 'Assessment', detail: 'Model responded in 1180 ms' },
      ],
    });
  });

  it('shows AccessDeniedState and does not fetch when the user lacks the required roles', () => {
    setUser(['ROLE_USER'], 7);
    renderPage();
    expect(screen.getByRole('alert')).toBeDefined();
    expect(
      screen.getByText(/Required permission: Analyst, SOC Manager, or Platform Administrator/i),
    ).toBeDefined();
    expect(mocks.fetchAgentDetail).not.toHaveBeenCalled();
  });

  it('renders a loading skeleton while the detail query is pending', () => {
    setUser(['ROLE_ANALYST'], 7);
    mocks.fetchAgentDetail.mockReturnValue(new Promise(() => {})); // never resolves
    renderPage();
    expect(screen.getByText(/Loading endpoint…/i)).toBeDefined();
  });

  it('renders an honest not-found error when the agent does not resolve', async () => {
    setUser(['ROLE_ANALYST'], 7);
    mocks.fetchAgentDetail.mockRejectedValue(new Error('Agent not found'));
    renderPage();
    await waitFor(() => expect(screen.getByText(/Endpoint not found/i)).toBeDefined(), { timeout: 4000 });
    expect(screen.getByText(/No agent matches this identifier/i)).toBeDefined();
  });

  it('renders the persistent header with hostname, OS/IP and tenant echo when loaded', async () => {
    setUser(['ROLE_ANALYST'], 7);
    mocks.fetchAgentDetail.mockResolvedValue(makeAgent());
    renderPage();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'db-prod-02' })).toBeDefined());
    // OS + IP subid
    expect(screen.getByText(/linux · Ubuntu 22.04 · 10.20.30.42/i)).toBeDefined();
    // tenant echo in the identity eyebrow
    expect(screen.getByText(/Endpoint · Acme Corp/i)).toBeDefined();
  });

  it('shows the failing dimension in the composite health badge for a degraded agent (never a bare green)', async () => {
    setUser(['ROLE_ANALYST'], 7);
    mocks.fetchAgentDetail.mockResolvedValue(makeAgent());
    mocks.fetchAgentVitals.mockResolvedValue(degradedVitals());
    renderPage();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'db-prod-02' })).toBeDefined());
    // CPU 97% is red → composite is "Critical" and the reason names CPU.
    expect(screen.getByText(/Critical/i)).toBeDefined();
    expect(screen.getByText(/CPU 97%/i)).toBeDefined();
  });

  it('exposes accessible tab semantics and switches tabs', async () => {
    setUser(['ROLE_ANALYST'], 7);
    mocks.fetchAgentDetail.mockResolvedValue(makeAgent());
    renderPage();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'db-prod-02' })).toBeDefined());

    const tablist = screen.getByRole('tablist');
    expect(tablist).toBeDefined();
    // 6 tab panels (Overview/Security/Logs/Commands/Configuration/Audit); the
    // 7th "surface" in the spec is the persistent header above the tab strip.
    const tabs = within(tablist).getAllByRole('tab');
    expect(tabs.length).toBe(6);

    const overviewTab = within(tablist).getByRole('tab', { name: /Overview/i });
    expect(overviewTab.getAttribute('aria-selected')).toBe('true');

    // Switch to Security → its honesty note appears and aria-selected moves.
    const securityTab = within(tablist).getByRole('tab', { name: /Security/i });
    await userEvent.click(securityTab);
    expect(securityTab.getAttribute('aria-selected')).toBe('true');
    expect(overviewTab.getAttribute('aria-selected')).toBe('false');
    expect(screen.getByText(/Host-scoped alert filtering is not yet available/i)).toBeDefined();
  });

  it('renders the ATT&CK honesty note (no fake tag) on the Logs tab', async () => {
    setUser(['ROLE_ANALYST'], 7);
    mocks.fetchAgentDetail.mockResolvedValue(makeAgent());
    renderPage();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'db-prod-02' })).toBeDefined());
    await userEvent.click(screen.getByRole('tab', { name: /Logs/i }));
    expect(screen.getByText(/No ATT&CK mapping is emitted for endpoint/i)).toBeDefined();
    expect(screen.getByTestId('timeline-body')).toBeDefined();
  });

  it('disables destructive actions in the all-tenants aggregate view (SPEC-01 fail-closed)', async () => {
    setUser(['ROLE_ANALYST'], null); // aggregate scope
    mocks.fetchAgentDetail.mockResolvedValue(makeAgent());
    renderPage();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'db-prod-02' })).toBeDefined());
    expect(screen.getByText(/Select a specific tenant to enable response actions/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /Isolate/i })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: /Kill process/i })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: /Quarantine/i })).toHaveProperty('disabled', true);
  });

  it('gates a destructive action behind an ApprovalCard, then the SPEC-01 confirm modal echoing host + agent id + tenant + reversibility', async () => {
    setUser(['ROLE_ANALYST'], 7);
    mocks.fetchAgentDetail.mockResolvedValue(makeAgent());
    renderPage();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'db-prod-02' })).toBeDefined());

    await userEvent.click(screen.getByRole('button', { name: /Isolate/i }));

    // Phase 1 — human approval gate (SPEC-08): the confirm modal is NOT shown yet.
    expect(screen.getByRole('dialog', { name: /Approve response action/i })).toBeDefined();
    expect(screen.getByText(/Isolate endpoint from the network/i)).toBeDefined();
    expect(screen.getByText(/1 endpoint · all network traffic except HiveArmor/i)).toBeDefined();
    expect(screen.queryByText(/Isolate this endpoint\?/i)).toBeNull();

    // Approve → phase 2 — SPEC-01 confirm modal with tenant + target + reversibility.
    await userEvent.click(screen.getByRole('button', { name: /^Approve$/i }));
    expect(screen.getByText(/Isolate this endpoint\?/i)).toBeDefined();
    expect(screen.getByText(/Target: db-prod-02 \(agent agent-77\) · Tenant: Acme Corp/i)).toBeDefined();
    expect(screen.getByText(/reversible — you can release the host afterward/i)).toBeDefined();
  });

  it('cancels a governed action when the ApprovalCard is rejected (no confirm modal, nothing fired)', async () => {
    setUser(['ROLE_ANALYST'], 7);
    mocks.fetchAgentDetail.mockResolvedValue(makeAgent());
    renderPage();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'db-prod-02' })).toBeDefined());

    await userEvent.click(screen.getByRole('button', { name: /Kill process/i }));
    // Critical-risk approval gate with irreversible blast radius.
    expect(screen.getByText(/Terminate a running process/i)).toBeDefined();
    expect(screen.getByText(/1 process on 1 endpoint · cannot be undone/i)).toBeDefined();

    await userEvent.click(screen.getByRole('button', { name: /^Reject$/i }));
    expect(screen.queryByRole('dialog', { name: /Approve response action/i })).toBeNull();
    expect(screen.queryByText(/Terminate a process on this endpoint\?/i)).toBeNull();
  });

  it('wires the AI verdict spine on the Security tab from a real assessment (SPEC-08)', async () => {
    setUser(['ROLE_ANALYST'], 7);
    mocks.fetchAgentDetail.mockResolvedValue(makeAgent());
    renderPage();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'db-prod-02' })).toBeDefined());

    await userEvent.click(screen.getByRole('tab', { name: /Security/i }));

    // AI provenance is explicit, and the verdict card renders the model's answer.
    await waitFor(() =>
      expect(screen.getByText(/Elevated process-creation activity from an unsigned binary/i)).toBeDefined(),
    );
    expect(screen.getByText('AI Verdict')).toBeDefined();
    expect(screen.getByRole('group', { name: /assessment content/i })).toBeDefined();
    // Honest disclaimer: assistive, not a formal detection verdict.
    expect(screen.getByText(/not a formal detection verdict/i)).toBeDefined();
    // The host-scoped alerts honesty note is still present.
    expect(screen.getByText(/Host-scoped alerts unavailable/i)).toBeDefined();
  });

  it('shows an honest "AI not active" state when the assessment is unavailable (never a fabricated verdict)', async () => {
    setUser(['ROLE_ANALYST'], 7);
    mocks.fetchAgentDetail.mockResolvedValue(makeAgent());
    mocks.fetchEndpointAiAssessment.mockResolvedValue({
      outcome: 'unavailable',
      answer: 'AI service not configured. Set SOC_AI_BASE_URL to enable Hive Intelligence.',
      confidence: 0,
      sources: [],
      durationMs: 0,
      steps: [],
    });
    renderPage();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'db-prod-02' })).toBeDefined());

    await userEvent.click(screen.getByRole('tab', { name: /Security/i }));

    await waitFor(() => expect(screen.getByText(/AI assessment is not active for this endpoint/i)).toBeDefined());
    // No verdict card, no fabricated verdict text.
    expect(screen.queryByText('AI Verdict')).toBeNull();
  });
});
