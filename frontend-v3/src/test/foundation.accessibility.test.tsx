import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LoginPage } from '@/pages/auth/LoginPage';
import { CommandCenterPage } from '@/pages/command-center/CommandCenterPage';

const a11yMocks = vi.hoisted(() => ({
  getAlertSummary: vi.fn(),
  getAlertTimeline: vi.fn(),
  getDetectionHealthSummary: vi.fn(),
  getPostureScore: vi.fn(),
  getIncidents: vi.fn(),
  getMissionControlIncidentKpis: vi.fn(),
  fetchSensors: vi.fn(),
}));

vi.mock('@/hooks/useSsoProviders', () => ({ useEnabledSsoProviders: () => ({ data: [], isLoading: false, isError: false }) }));
vi.mock('@/services/auth.service', () => ({ authenticate: vi.fn(), getAccount: vi.fn() }));
vi.mock('@/pages/command-center/commandCenter.service', () => ({
  getAlertSummary: a11yMocks.getAlertSummary,
  getAlertTimeline: a11yMocks.getAlertTimeline,
  getDetectionHealthSummary: a11yMocks.getDetectionHealthSummary,
  getPostureScore: a11yMocks.getPostureScore,
}));
vi.mock('@/services/incidents.service', () => ({
  getIncidents: a11yMocks.getIncidents,
  getMissionControlIncidentKpis: a11yMocks.getMissionControlIncidentKpis,
}));
vi.mock('@/services/sensorsService', () => ({ fetchSensors: a11yMocks.fetchSensors }));
vi.mock('@/hooks/useAlertStream', () => ({ useAlertStream: vi.fn() }));
vi.mock('@/hooks/useEpsStream', () => ({ useEpsStream: () => ({ eps: 1840, connected: true }) }));
vi.mock('@/components/ha-chart', () => ({ HaChart: ({ ariaLabel }: { ariaLabel: string }) => <div role="img" aria-label={ariaLabel} /> }));

function provider(children: React.ReactNode): JSX.Element {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={client}><MemoryRouter>{children}</MemoryRouter></QueryClientProvider>;
}

async function expectNoSeriousViolations(container: HTMLElement): Promise<void> {
  const result = await axe.run(container, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag22aa'] },
    rules: { 'color-contrast': { enabled: false } },
  });
  const serious = result.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
  expect(serious.map(({ id, impact, help }) => ({ id, impact, help }))).toEqual([]);
}

describe('HiveArmor foundation accessibility', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    a11yMocks.getAlertSummary.mockResolvedValue({ critical: 0, high: 0, medium: 0, low: 0, total: 0 });
    a11yMocks.getAlertTimeline.mockResolvedValue([
      { hour: '2026-08-18T16:00:00.000Z', low: 0, medium: 0, high: 0 },
    ]);
    a11yMocks.getDetectionHealthSummary.mockResolvedValue({ activeRules: 12, totalRules: 40 });
    a11yMocks.getPostureScore.mockResolvedValue({
      overallScore: 72,
      totalFrameworks: 3,
      controlsPassed: 10,
      controlsFailed: 4,
      controlsTotal: 14,
      lastAssessed: null,
      trend: 'stable',
    });
    a11yMocks.getIncidents.mockResolvedValue({ items: [], total: 0 });
    a11yMocks.getMissionControlIncidentKpis.mockResolvedValue({
      openTotal: 0,
      criticalP1: 0,
      slaBreached: 0,
      unassigned: 0,
      partial: false,
    });
    a11yMocks.fetchSensors.mockResolvedValue({ total: 0, sensors: [] });
  });

  it('has no serious automated WCAG violations on the login page', async () => {
    const { container } = render(provider(<LoginPage />));
    await expectNoSeriousViolations(container);
  });

  it('has no serious automated WCAG violations on the dashboard structure', async () => {
    const { container, findByText } = render(provider(<CommandCenterPage />));
    await findByText('Mission Control');
    await expectNoSeriousViolations(container);
  });
});
