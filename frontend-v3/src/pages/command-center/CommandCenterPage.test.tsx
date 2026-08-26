import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CommandCenterPage } from './CommandCenterPage';

const serviceMocks = vi.hoisted(() => ({
  getAlertSummary: vi.fn(),
  getAlertTimeline: vi.fn(),
  getDetectionHealthSummary: vi.fn(),
  getPostureScore: vi.fn(),
  getIncidents: vi.fn(),
  getMissionControlIncidentKpis: vi.fn(),
  fetchSensors: vi.fn(),
}));

vi.mock('./commandCenter.service', () => ({
  getAlertSummary: serviceMocks.getAlertSummary,
  getAlertTimeline: serviceMocks.getAlertTimeline,
  getDetectionHealthSummary: serviceMocks.getDetectionHealthSummary,
  getPostureScore: serviceMocks.getPostureScore,
}));
vi.mock('@/services/incidents.service', () => ({
  getIncidents: serviceMocks.getIncidents,
  getMissionControlIncidentKpis: serviceMocks.getMissionControlIncidentKpis,
}));
vi.mock('@/services/sensorsService', () => ({
  fetchSensors: serviceMocks.fetchSensors,
}));
vi.mock('@/hooks/useAlertStream', () => ({ useAlertStream: vi.fn() }));
vi.mock('@/hooks/useEpsStream', () => ({ useEpsStream: () => ({ eps: 1840, connected: false }) }));
vi.mock('@/components/ha-chart', () => ({
  HaChart: ({ ariaLabel }: { ariaLabel: string }) => <div role="img" aria-label={ariaLabel} />,
}));

function renderDashboard(): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <CommandCenterPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('CommandCenterPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serviceMocks.getAlertSummary.mockResolvedValue({ critical: 4, high: 11, medium: 18, low: 22, total: 55 });
    serviceMocks.getAlertTimeline.mockResolvedValue([
      { hour: '2026-08-18T16:00:00.000Z', low: 0, medium: 4, high: 0 },
    ]);
    serviceMocks.getIncidents.mockResolvedValue({ items: [], total: 0 });
    serviceMocks.getMissionControlIncidentKpis.mockResolvedValue({
      openTotal: 42,
      criticalP1: 7,
      slaBreached: 3,
      unassigned: 11,
      partial: false,
    });
    serviceMocks.fetchSensors.mockResolvedValue({
      total: 3,
      sensors: [
        { id: '20', hostname: 'EC2AMAZ-8F0Q7DL', connectionStatus: 'ONLINE' },
        { id: '19', hostname: 'EC2AMAZ-8F0Q7DL', connectionStatus: 'OFFLINE' },
        { id: '18', hostname: 'other', connectionStatus: 'UNKNOWN' },
      ],
    });
    serviceMocks.getDetectionHealthSummary.mockResolvedValue({ activeRules: 12, totalRules: 40 });
    serviceMocks.getPostureScore.mockResolvedValue({
      overallScore: 72,
      totalFrameworks: 3,
      controlsPassed: 10,
      controlsFailed: 4,
      controlsTotal: 14,
      lastAssessed: null,
      trend: 'stable',
    });
  });

  it('renders loading metrics before queries settle', () => {
    serviceMocks.getAlertSummary.mockReturnValue(new Promise(() => undefined));
    serviceMocks.getIncidents.mockReturnValue(new Promise(() => undefined));
    serviceMocks.getMissionControlIncidentKpis.mockReturnValue(new Promise(() => undefined));
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <CommandCenterPage />
        </MemoryRouter>
      </QueryClientProvider>
    );
    expect(container.querySelectorAll('.mission-skeleton')).toHaveLength(8);
  });

  it('renders SOC home job sentence and primary CTA strip', async () => {
    renderDashboard();
    expect(
      await screen.findByText(/Command center for detect → triage → investigate/)
    ).toBeVisible();
    const cta = screen.getByRole('navigation', { name: 'Primary triage destinations' });
    expect(cta).toBeVisible();
    expect(cta.querySelector('a[href="/queue"]')).not.toBeNull();
    expect(cta.querySelector('a[href="/alerts"]')).not.toBeNull();
    expect(cta.querySelector('a[href="/incidents"]')).not.toBeNull();
    expect(cta.querySelector('a[href="/posture/sensors"]')).not.toBeNull();
  });

  it('renders population KPI totals instead of size=5 sample counts', async () => {
    renderDashboard();
    expect(await screen.findByText('Critical open incidents')).toBeVisible();
    expect(screen.getByText('7')).toBeVisible();
    expect(screen.getByText(/42 active open\/in-review/)).toBeVisible();
    expect(screen.getByText('SLA breached')).toBeVisible();
    expect(screen.getByText('3')).toBeVisible();
    expect(screen.getByText('11')).toBeVisible();
    expect(serviceMocks.getMissionControlIncidentKpis).toHaveBeenCalled();
  });

  it('renders loaded operational metrics, sensor signal, and AI honesty', async () => {
    renderDashboard();
    expect(await screen.findByText('Critical alerts (7d)')).toBeVisible();
    expect(screen.getByText('Live feed delayed.')).toBeVisible();
    expect(screen.getByRole('img', { name: 'Alert volume by severity for the last 24 hours' })).toBeVisible();
    expect(screen.getByText('No open priority work is available for the current scope.')).toBeVisible();
    expect(await screen.findByText('Online')).toBeVisible();
    expect(screen.getByText(/3 registered/)).toBeVisible();
    expect(screen.getByText(/Assistive evidence only/)).toBeVisible();
    expect(screen.getByText('STAGING CANDIDATE')).toBeVisible();
    expect(screen.getByText('Stub')).toBeVisible();
    expect(screen.getByText(/No per-analyst capacity API/)).toBeVisible();
  });

  it('renders priority work from the real incident response and labels sample honesty', async () => {
    serviceMocks.getIncidents.mockResolvedValue({
      total: 1,
      items: [
        {
          id: 12,
          title: 'Suspicious privileged-account login',
          severity: 'CRITICAL',
          status: 'OPEN',
          assignee: null,
          createdAt: '2026-08-02T05:30:00Z',
          updatedAt: '2026-08-02T05:30:00Z',
          closedAt: null,
          slaDueAt: '2026-08-02T06:30:00Z',
          alertCount: 3,
          evidenceCount: 4,
          noteCount: 1,
          description: '',
          tenant: { id: 1, name: 'Northwind Financial' },
          mitreTechniques: [],
        },
      ],
    });
    renderDashboard();
    expect(await screen.findByText('Suspicious privileged-account login')).toBeVisible();
    expect(screen.getByText('Unassigned')).toBeVisible();
    expect(screen.getByText(/Top 5 open sample · KPI tiles use population totals/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Open' })).toHaveAttribute('href', '/incidents/12');
  });

  it('renders a full failure with a retry action', async () => {
    serviceMocks.getAlertSummary.mockRejectedValue(new Error('offline'));
    serviceMocks.getIncidents.mockRejectedValue(new Error('offline'));
    serviceMocks.getMissionControlIncidentKpis.mockRejectedValue(new Error('offline'));
    renderDashboard();
    await waitFor(() =>
      expect(
        screen.getByText('Operational data could not be loaded. Verify connectivity and try again.')
      ).toBeVisible()
    );
    expect(screen.getByRole('button', { name: 'Retry dashboard' })).toBeVisible();
  });
});
