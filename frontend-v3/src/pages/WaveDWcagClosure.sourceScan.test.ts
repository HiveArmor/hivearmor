import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('Wave D WCAG closure (Prompt 50)', () => {
  it('D-13: AppLayout exposes skip navigation to main content', () => {
    const layout = readFileSync(join(process.cwd(), 'src/router/AppLayout.tsx'), 'utf8');
    expect(layout).toContain('href="#main-content"');
    expect(layout).toContain('Skip to main content');
    expect(layout).toContain('id="main-content"');
    expect(layout).toMatch(/<main[\s\S]*id="main-content"/);
  });

  it('D-14: skip-nav focus styles live in global.css', () => {
    const globalCss = readFileSync(join(process.cwd(), 'src/styles/global.css'), 'utf8');
    expect(globalCss).toContain('.skip-nav');
    expect(globalCss).toContain('.skip-nav:focus');
  });

  it('D-15: HaChart exposes accessible chart description', () => {
    const chart = readFileSync(join(process.cwd(), 'src/components/ha-chart/HaChart.tsx'), 'utf8');
    expect(chart).toContain('role="img"');
    expect(chart).toContain('aria-label');
    expect(chart).toContain('ariaDescription');
  });

  it('D-16: StatusDock announces connection and mode without colour-only status', () => {
    const dock = readFileSync(join(process.cwd(), 'src/components/status-dock/StatusDock.tsx'), 'utf8');
    expect(dock).toContain('role="status"');
    expect(dock).toContain('aria-label={statusSummary}');
    expect(dock).toContain('aria-hidden="true"');
    expect(dock).toContain('connection-text');
  });

  it('D-17: LiveAlertStream uses polite live region for incoming alerts', () => {
    const stream = readFileSync(
      join(process.cwd(), 'src/pages/command-center/components/LiveAlertStream.tsx'),
      'utf8',
    );
    expect(stream).toContain('aria-live="polite"');
    expect(stream).toContain('role="status"');
  });

  it('D-18: HaNavigation is a labelled landmark', () => {
    const nav = readFileSync(join(process.cwd(), 'src/components/ha-navigation/HaNavigation.tsx'), 'utf8');
    expect(nav).toMatch(/<nav[\s\S]*aria-label="Primary navigation"/);
  });

  it('D-19: foundation accessibility test mocks detection health summary', () => {
    const test = readFileSync(join(process.cwd(), 'src/test/foundation.accessibility.test.tsx'), 'utf8');
    expect(test).toContain('getDetectionHealthSummary');
    expect(test).toContain('expectNoSeriousViolations');
  });
});
