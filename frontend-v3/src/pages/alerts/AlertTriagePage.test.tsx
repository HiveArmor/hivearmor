import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render } from '@testing-library/react';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { createAlertTriageColumns } from './alertColumns';
import { AlertDetailDrawer } from './AlertDetailDrawer';
import { normalizePayload, sortAlertRows } from './alertsListDatasource';
import {
  filterFoundationAlertQueue,
  foundationAlertQueue,
  foundationAlertQueueSummary,
  getFoundationAlertDetail,
} from './alertTriage.fixtures';
import { normalizeAlertTriageDetail } from './alertTriage.service';

import type { AlertDetailDTO } from '@/components/alert-context-drawer/alertContextDrawer.types';

vi.mock('./alertTriage.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./alertTriage.service')>();
  const fixtures = await import('./alertTriage.fixtures');
  return {
    ...actual,
    // Fixture-off drawer behavior: live action gating against real contracts.
    alertTriageFixtureMode: false,
    fetchAlertTriageDetail: vi.fn((id: string) => Promise.resolve(fixtures.getFoundationAlertDetail(id))),
  };
});

function renderDrawer(onRequestAction = vi.fn()): ReturnType<typeof render> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AlertDetailDrawer
          alertId="ALT-7F3A91"
          onClose={vi.fn()}
          onRequestAction={onRequestAction}
          width={480}
          onWidthChange={vi.fn()}
          hasNext
          onNext={vi.fn()}
        />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('Alert triage fixture integrity', () => {
  it('keeps IDs unique and summary counts derived from the records', () => {
    expect(new Set(foundationAlertQueue.map((alert) => alert.id)).size).toBe(foundationAlertQueue.length);
    expect(foundationAlertQueueSummary.totalApproximate).toBe(foundationAlertQueue.length);
    expect(foundationAlertQueueSummary.criticalOpen).toBe(
      foundationAlertQueue.filter((alert) => alert.severity >= 9 && alert.status < 5).length
    );
  });

  it('supports combined structured filters without mutating the source records', () => {
    const before = foundationAlertQueue.map((alert) => alert.id);
    const filtered = filterFoundationAlertQueue({
      status: 'active',
      severity: 'critical',
      threatIntel: 'matched',
    });
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.every((alert) => alert.status < 5 && alert.severity >= 9 && alert.threatIntelMatched)).toBe(true);
    expect(foundationAlertQueue.map((alert) => alert.id)).toEqual(before);
  });

  it('evaluates AND before OR in the fixture Boolean query model', () => {
    const filtered = filterFoundationAlertQueue({
      queryExpression: 'severity:critical OR severity:high AND status:in_review',
    });
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.every((alert) => (
      alert.severity >= 9 || (alert.severity >= 7 && alert.severity < 9 && alert.status === 3)
    ))).toBe(true);
  });

  it('keeps the hero alert consistent between queue and drawer projections', () => {
    const row = foundationAlertQueue.find((alert) => alert.id === 'ALT-7F3A91');
    const detail = getFoundationAlertDetail('ALT-7F3A91');
    expect(detail.title).toBe(row?.name);
    expect(detail.riskScore).toBe(row?.riskScore);
    expect(detail.primaryEntity?.label).toBe(row?.primaryEntity?.label);
  });
});

describe('Alert triage production boundaries', () => {
  it('normalizes raw-array and envelope list responses without inventing rows', () => {
    const rows = foundationAlertQueue.slice(0, 2);
    const cursorMetadata = { nextCursor: null, hasMore: null };
    expect(normalizePayload(rows)).toEqual({ rows, total: null, ...cursorMetadata });
    expect(normalizePayload({ items: rows, total: 42 })).toEqual({ rows, total: 42, ...cursorMetadata });
    expect(normalizePayload({ alerts: rows, totalApproximate: 84 })).toEqual({ rows, total: 84, ...cursorMetadata });
    expect(normalizePayload({ unexpected: true })).toEqual({ rows: [], total: null, ...cursorMetadata });
  });

  it('uses a deterministic ID tie-breaker when server sort values match', () => {
    const rows = foundationAlertQueue.slice(0, 2).map((row) => ({ ...row, riskScore: 80 }));
    const sorted = sortAlertRows(rows, [{ colId: 'riskScore', sort: 'desc' }]);
    expect(sorted.map((row) => row.id)).toEqual([...rows].sort((a, b) => a.id.localeCompare(b.id)).map((row) => row.id));
  });

  it('does not infer triage context from the current core detail DTO', () => {
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
    const result = normalizeAlertTriageDetail(alert);
    expect(result.dataCompleteness).toBe('core');
    expect(result.reason).toBeNull();
    expect(result.primaryEntity).toBeNull();
    expect(result.activity).toEqual([]);
    expect(result.evidenceFields).toHaveLength(1);
  });

  it('pins an icon-only action column to the right edge of the queue', () => {
    const columns = createAlertTriageColumns(vi.fn());
    const actions = columns[columns.length - 1];
    expect(actions.colId).toBe('actions');
    expect(actions.pinned).toBe('right');
    expect(actions.sortable).toBe(false);
    expect(actions.width).toBe(136);
  });
});

describe('Alert triage drawer experience', () => {
  it('moves between accessible views and routes response decisions through confirmation', async () => {
    const onRequestAction = vi.fn();
    const { findByRole, getByRole } = renderDrawer(onRequestAction);
    expect(await findByRole('heading', { name: /Signed utility spawned/ })).toBeInTheDocument();

    fireEvent.click(getByRole('tab', { name: 'Evidence' }));
    expect(getByRole('heading', { name: 'Highlighted evidence' })).toBeInTheDocument();

    fireEvent.click(getByRole('tab', { name: 'Response' }));
    fireEvent.click(getByRole('button', { name: /Acknowledge and review/ }));
    expect(onRequestAction).toHaveBeenCalledWith('acknowledge', ['ALT-7F3A91']);
  });

  it('enables tag and gates assign by SOC Manager permission when fixtures are off', async () => {
    const onRequestAction = vi.fn();
    const authStore = await import('@/store/auth.store');
    authStore.useAuthStore.setState({
      user: {
        id: 7,
        login: 'analyst',
        firstName: 'Ana',
        lastName: 'Lyst',
        email: 'ana@example.test',
        roles: ['ROLE_ANALYST'],
        langKey: 'en',
      },
      isAuthenticated: true,
    });

    const { findByRole, getByRole } = renderDrawer(onRequestAction);
    expect(await findByRole('heading', { name: /Signed utility spawned/ })).toBeInTheDocument();

    fireEvent.click(getByRole('tab', { name: 'Response' }));
    const tagButton = getByRole('button', { name: /Add triage tags/ });
    expect(tagButton).not.toBeDisabled();
    fireEvent.click(tagButton);
    expect(onRequestAction).toHaveBeenCalledWith('tag', ['ALT-7F3A91']);

    const assignButton = getByRole('button', { name: /Assign owner/ });
    expect(assignButton).toBeDisabled();
    expect(assignButton).toHaveAttribute('title', 'Required permission: SOC Manager');
  });

  it('has no serious or critical WCAG violations in the default triage view', async () => {
    const { container, findByRole } = renderDrawer();
    await findByRole('heading', { name: /Signed utility spawned/ });
    const result = await axe.run(container, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag22aa'] },
      rules: { 'color-contrast': { enabled: false } },
    });
    const serious = result.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
    expect(serious.map(({ id, impact, help }) => ({ id, impact, help }))).toEqual([]);
  });
});

describe('Alert triage performance invariants', () => {
  it('keeps the route lazy, the block bounded, and large visualization libraries out of the queue', async () => {
    const routerSource = await import('@/router/index.tsx?raw');
    const pageSource = await import('./AlertsListPage.tsx?raw');
    const datasourceSource = await import('./alertsListDatasource.ts?raw');
    expect(routerSource.default).toContain("import('@/pages/alerts/AlertsListPage')");
    expect(pageSource.default).not.toContain('reactflow');
    expect(pageSource.default).not.toContain('echarts');
    expect(pageSource.default).toContain('alert-view-strip');
    expect(pageSource.default).not.toContain('alert-view-rail');
    expect(pageSource.default).toContain('useState<string | null>(null)');
    expect(pageSource.default).not.toContain("matchMedia('(min-width: 1100px)')");
    expect(pageSource.default).toContain('className="alert-queue-sticky"');
    expect(pageSource.default).toContain('cacheBlockSize={100}');
    expect(pageSource.default).toContain('maxBlocksInCache={10}');
    expect(datasourceSource.default).toContain('Math.min(blockSize, 100)');
    expect(datasourceSource.default).toContain('AbortController');
  });

  it('uses document scrolling for the page while retaining one bounded virtual grid viewport', () => {
    const cssSource = readFileSync(join(__dirname, 'AlertsListPage.css'), 'utf8');

    expect(cssSource).toContain('.alert-queue-sticky {');
    expect(cssSource).toContain('position: sticky');
    expect(cssSource).toContain('.alert-queue-workspace { position: relative; height: clamp(');
    expect(cssSource).toContain('.alert-grid-region { position: relative;');
  });
});
