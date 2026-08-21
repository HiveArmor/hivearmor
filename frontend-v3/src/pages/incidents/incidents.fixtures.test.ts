import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { fetchFixtureIncidentSummary, fetchFixtureIncidents } from './incidents.fixtures';
import { fixtureFindSimilar, fixtureListResponseActions, fixtureListTasks } from './incidentWorkbench.fixtures';

describe('incident command fixtures', () => {
  it('returns bounded pages and applies operational filters before pagination', async () => {
    const active = await fetchFixtureIncidents({ status: 'open,in_progress', page: 0, size: 50 });
    const critical = await fetchFixtureIncidents({ status: 'open,in_progress', priority: 'P1', page: 0, size: 50 });
    const breached = await fetchFixtureIncidents({ status: 'open,in_progress', slaBreached: true, page: 0, size: 50 });

    expect(active.items.length).toBeLessThanOrEqual(50);
    expect(active.items.every((item) => ['open', 'in_progress'].includes(item.incidentStatus))).toBe(true);
    expect(critical.items.every((item) => item.incidentPriority === 'P1')).toBe(true);
    expect(breached.items.every((item) => item.slaBreached)).toBe(true);
    expect(new Set(active.items.map((item) => item.id)).size).toBe(active.items.length);
  });

  it('keeps the summary internally consistent with the fictional queue', async () => {
    const summary = await fetchFixtureIncidentSummary('maya.chen');
    expect(summary.active).toBeGreaterThan(0);
    expect(summary.critical).toBeGreaterThan(0);
    expect(summary.unassigned).toBeGreaterThan(0);
    expect(summary.partial).toBe(false);
  });

  it('keeps fictional incident records behind the production alias boundary', () => {
    const viteConfig = readFileSync(join(process.cwd(), 'vite.config.ts'), 'utf8');
    const buildScript = readFileSync(join(process.cwd(), 'scripts/build.mjs'), 'utf8');
    expect(viteConfig).toContain('incidents.fixture-disabled.ts');
    expect(viteConfig).toContain('incidentDetail.fixture-disabled.ts');
    expect(viteConfig).toContain('incidentWorkbench.fixture-disabled.ts');
    expect(buildScript).toContain('--alias:@/pages/incidents/incidents.fixtures=./src/pages/incidents/incidents.fixture-disabled.ts');
    expect(buildScript).toContain('--alias:@/pages/incidents/incidentDetail.fixtures=./src/pages/incidents/incidentDetail.fixture-disabled.ts');
    expect(buildScript).toContain('--alias:@/pages/incidents/incidentWorkbench.fixtures=./src/pages/incidents/incidentWorkbench.fixture-disabled.ts');
  });

  it('provides a coherent fixture workflow for tasks, response and related cases', async () => {
    const [taskPage, actions, related] = await Promise.all([
      fixtureListTasks(),
      fixtureListResponseActions(),
      fixtureFindSimilar(),
    ]);
    expect(taskPage.total).toBe(taskPage.items.length);
    expect(taskPage.items.some((task) => task.status === 'in_progress')).toBe(true);
    expect(actions.some((action) => action.category === 'containment')).toBe(true);
    expect(related.items.every((incident) => incident.reasons.length > 0)).toBe(true);
  });
});

describe('incident command design contract', () => {
  it('provides sticky operations, keyboard navigation, bounded paging and semantic colours', () => {
    const page = readFileSync(join(process.cwd(), 'src/pages/incidents/IncidentListPage.tsx'), 'utf8');
    const styles = readFileSync(join(process.cwd(), 'src/pages/incidents/IncidentListPage.css'), 'utf8');
    expect(page).toContain('Incident Command');
    expect(page).toContain("event.key === 'j'");
    expect(page).toContain('PAGE_SIZE = 50');
    expect(page).toContain('incident-pagination');
    expect(page).toContain('StatusDock');
    expect(page).toContain('queryFn: ({ signal })');
    expect(styles).not.toMatch(/#[0-9a-f]{3,8}/i);
  });
});
