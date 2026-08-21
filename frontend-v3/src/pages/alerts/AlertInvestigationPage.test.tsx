import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, waitFor } from '@testing-library/react';
import axe from 'axe-core';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { foundationAlertInvestigation } from './alertInvestigation.fixtures';
import { normalizeAlertInvestigation } from './alertInvestigation.service';
import { AlertInvestigationPage } from './AlertInvestigationPage';

import type { AlertDetailDTO } from '@/components/alert-context-drawer/alertContextDrawer.types';

vi.mock('./alertInvestigation.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./alertInvestigation.service')>();
  const fixtures = await import('./alertInvestigation.fixtures');
  return {
    ...actual,
    fetchAlertInvestigation: vi.fn().mockResolvedValue(fixtures.foundationAlertInvestigation),
    fetchAlertStory: vi.fn().mockResolvedValue({
      stages: fixtures.foundationAlertInvestigation.stages,
      items: fixtures.foundationAlertInvestigation.story,
    }),
  };
});

function renderInvestigation(): ReturnType<typeof render> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/alerts/ALT-7F3A91']}>
        <Routes>
          <Route path="/alerts/:id" element={<AlertInvestigationPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('Alert Investigation data integrity', () => {
  it('keeps every fixture process and evidence reference resolvable', () => {
    const processIds = new Set(foundationAlertInvestigation.processes.map((process) => process.id));
    const storyIds = new Set(foundationAlertInvestigation.story.map((event) => event.id));

    for (const process of foundationAlertInvestigation.processes) {
      if (process.parentId) expect(processIds.has(process.parentId)).toBe(true);
    }
    for (const event of foundationAlertInvestigation.story) {
      if (event.processId) expect(processIds.has(event.processId)).toBe(true);
    }
    for (const indicator of foundationAlertInvestigation.indicators) {
      expect(indicator.evidenceIds.every((id) => storyIds.has(id))).toBe(true);
    }
  });

  it('does not invent extended telemetry when normalizing the current core alert DTO', () => {
    const alert: AlertDetailDTO = {
      id: 'ALT-core',
      severity: 8,
      timestamp: '2026-08-02T03:42:11Z',
      title: 'Core alert',
      category: 'Endpoint',
      status: 'open',
      adversary: null,
      target: null,
      tags: [],
      ruleId: null,
      ruleName: null,
      rawFields: { 'host.name': 'FIN-WKS-044' },
    };

    const result = normalizeAlertInvestigation(alert);
    expect(result.dataCompleteness).toBe('core');
    expect(result.story).toEqual([]);
    expect(result.processes).toEqual([]);
    expect(result.network).toEqual([]);
    expect(result.rawEvent).toEqual({ 'host.name': 'FIN-WKS-044' });
    expect(result.missingDataNotice).toMatch(/not available/i);
  });
});

describe('Alert Investigation workspace', () => {
  it('synchronizes the selected story event and process lineage with J/K navigation', async () => {
    const { findByRole, getByRole } = renderInvestigation();

    expect(await findByRole('heading', { name: foundationAlertInvestigation.title })).toBeInTheDocument();
    expect(getByRole('button', { name: /Disguised attachment executed/ })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'j' });
    await waitFor(() => expect(getByRole('button', { name: /Encoded PowerShell launched/ })).toHaveAttribute('data-selected', 'true'));
    expect(getByRole('button', { name: /powershell.exe PID 9120/ })).toHaveAttribute('data-selected', 'true');
  });

  it('has no serious or critical WCAG 2.2 violations in the default board', async () => {
    const { container, findByRole } = renderInvestigation();
    await findByRole('heading', { name: foundationAlertInvestigation.title });

    const result = await axe.run(container, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag22aa'] },
      rules: { 'color-contrast': { enabled: false } },
    });
    const serious = result.violations.filter(
      (violation) => violation.impact === 'serious' || violation.impact === 'critical'
    );
    expect(serious.map(({ id, impact, help }) => ({ id, impact, help }))).toEqual([]);
  });
});

describe('Alert Investigation performance invariants', () => {
  it('keeps the route lazy and extended telemetry bounded by contract', async () => {
    const routerSource = await import('@/router/index.tsx?raw');
    const pageSource = await import('./AlertInvestigationPage.tsx?raw');

    expect(routerSource.default).toContain("import('@/pages/alerts/AlertInvestigationPage')");
    expect(routerSource.default).toContain("path: 'alerts/:id'");
    expect(pageSource.default).not.toContain('reactflow');
    expect(pageSource.default).toContain("staleTime: 30_000");
    expect(pageSource.default).toContain('DataUnavailable');
  });
});
