import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { foundationAlertQueue } from './alertTriage.fixtures';
import { buildSeverityBoardFixture } from './severityBoard.service';

const fullFixtureWindow = {
  from: '2026-07-25T00:00:00.000Z',
  to: '2026-08-03T00:00:00.000Z',
  scope: 'active' as const,
  ownership: 'all' as const,
};

describe('Severity Board workload projection', () => {
  it('keeps critical-first lane order and derives every count from one filtered snapshot', () => {
    const board = buildSeverityBoardFixture(foundationAlertQueue, fullFixtureWindow);

    expect(board.lanes.map((lane) => lane.severity)).toEqual([
      'critical',
      'high',
      'medium',
      'low',
      'info',
    ]);
    expect(board.lanes.reduce((sum, lane) => sum + lane.count, 0)).toBe(board.overview.total);
    expect(board.trend.reduce((sum, bucket) => sum + bucket.total, 0)).toBe(board.overview.total);
    expect(board.overview.active).toBe(board.overview.total);
  });

  it('bounds lane payloads and orders visible work by risk with deterministic ties', () => {
    const board = buildSeverityBoardFixture(foundationAlertQueue, fullFixtureWindow);

    board.lanes.forEach((lane) => {
      expect(lane.alerts.length).toBeLessThanOrEqual(4);
      const riskScores = lane.alerts.map((alert) => alert.riskScore ?? 0);
      expect(riskScores).toEqual([...riskScores].sort((left, right) => right - left));
    });
  });

  it('applies ownership before aggregating lane and response-pressure totals', () => {
    const board = buildSeverityBoardFixture(foundationAlertQueue, {
      ...fullFixtureWindow,
      ownership: 'unassigned',
    });

    expect(board.overview.unassigned).toBe(board.overview.total);
    expect(board.lanes.flatMap((lane) => lane.alerts).every((alert) => !alert.assigneeName)).toBe(true);
  });
});

describe('Severity Board performance boundaries', () => {
  it('keeps the route lazy and uses a single bounded board projection', async () => {
    const routerSource = await import('@/router/index.tsx?raw');
    const pageSource = await import('./AlertSeverityBoardPage.tsx?raw');
    const serviceSource = await import('./severityBoard.service.ts?raw');

    expect(routerSource.default).toContain("import('@/pages/alerts/AlertSeverityBoardPage')");
    expect(pageSource.default).not.toContain('reactflow');
    expect(pageSource.default).not.toContain('echarts');
    expect(pageSource.default).toContain("queryKey: ['alerts', 'severity-board', filters]");
    expect(serviceSource.default).toContain("'/ha-alerts/severity-board'");
    expect(serviceSource.default).toContain('const BOARD_ALERT_LIMIT = 4');
  });

  it('uses the shared select treatment and a document-scroll sticky operations stack', async () => {
    const pageSource = await import('./AlertSeverityBoardPage.tsx?raw');
    const cssSource = readFileSync(join(__dirname, 'AlertSeverityBoardPage.css'), 'utf8');
    const laneCssSource = readFileSync(join(__dirname, 'SeverityTile.css'), 'utf8');

    expect(pageSource.default).toContain('<HaCompactSelect');
    expect(pageSource.default).toContain('className="severity-board-sticky"');
    expect(cssSource).toContain('.severity-board-sticky { position: sticky');
    expect(cssSource).toContain('overflow: visible');
    expect(laneCssSource).toContain('overflow: visible');
  });
});
