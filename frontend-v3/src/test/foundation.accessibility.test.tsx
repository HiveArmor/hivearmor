import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LoginPage } from '@/pages/auth/LoginPage';
import { CommandCenterPage } from '@/pages/command-center/CommandCenterPage';

const a11yMocks = vi.hoisted(() => ({
  getAlertSummary: vi.fn(),
  getIncidents: vi.fn(),
}));

vi.mock('@/hooks/useSsoProviders', () => ({ useEnabledSsoProviders: () => ({ data: [], isLoading: false, isError: false }) }));
vi.mock('@/services/auth.service', () => ({ authenticate: vi.fn(), getAccount: vi.fn() }));
vi.mock('@/pages/command-center/commandCenter.service', () => ({ getAlertSummary: a11yMocks.getAlertSummary }));
vi.mock('@/services/incidents.service', () => ({ getIncidents: a11yMocks.getIncidents }));
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
    a11yMocks.getIncidents.mockResolvedValue({ items: [], total: 0 });
  });

  it('has no serious automated WCAG violations on the login page', async () => {
    const { container } = render(provider(<LoginPage />));
    await expectNoSeriousViolations(container);
  });

  it('has no serious automated WCAG violations on the dashboard structure', async () => {
    const { container, findByText } = render(provider(<CommandCenterPage />));
    await findByText('Critical alert volume');
    await expectNoSeriousViolations(container);
  });
});
