import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  convertFixtureInvestigation,
  createFixtureInvestigation,
  getFixtureInvestigation,
  getFixtureInvestigationItems,
  listFixtureInvestigations,
  pinFixtureInvestigationItem,
  unpinFixtureInvestigationItem,
} from './investigation.fixtures';

describe('investigation fixture workflow', () => {
  it('filters before bounded pagination and keeps a stable exact total', async () => {
    const result = await listFixtureInvestigations({
      page: 0,
      size: 2,
      status: 'ACTIVE',
      search: 'powerShell',
      ownership: 'all',
    });

    expect(result.filtering).toBe('authoritative');
    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].sessionName).toContain('PowerShell');
  });

  it('keeps hypothesis, scope, activity, and preserved artifacts coherent', async () => {
    const detail = await getFixtureInvestigation(9001);
    const items = await getFixtureInvestigationItems(9001);

    expect(detail.phase).toBe('assess');
    expect(detail.hypotheses).toHaveLength(3);
    expect(detail.hypotheses.some((hypothesis) => hypothesis.denyingEvidence.length > 0)).toBe(true);
    expect(detail.dataSources.length).toBeGreaterThan(2);
    expect(detail.activity.length).toBeGreaterThan(0);
    expect(items.some((item) => item.itemType === 'LOG_EVENT')).toBe(true);
    expect(items.every((item) => item.sessionId === 9001)).toBe(true);
  });

  it('supports the full fixture create, note, unpin, and promotion path', async () => {
    const created = await createFixtureInvestigation({
      sessionName: 'Bounded fixture workflow validation',
      description: 'Confirm a specific hypothesis within a bounded window.',
      assignedTo: 'maya.chen',
    });
    const note = await pinFixtureInvestigationItem(created.id, {
      itemType: 'NOTE',
      itemRef: 'note-contract-check',
      note: 'Validated the competing hypothesis and recorded the result.',
    });

    expect(await getFixtureInvestigationItems(created.id)).toEqual(expect.arrayContaining([expect.objectContaining({ id: note.id })]));
    await unpinFixtureInvestigationItem(created.id, note.id);
    expect(await getFixtureInvestigationItems(created.id)).toHaveLength(0);

    const promotion = await convertFixtureInvestigation(created.id);
    const converted = await getFixtureInvestigation(created.id);
    expect(promotion.incidentId).toBe(4901);
    expect(converted.status).toBe('CONVERTED');
    expect(converted.incidentId).toBe(4901);
  });
});

describe('investigation design and fixture boundary', () => {
  it('provides evidence-session list, pin/unpin, promote honesty, and accessible controls', () => {
    const queue = readFileSync(join(process.cwd(), 'src/pages/investigations/InvestigationsPage.tsx'), 'utf8');
    const detail = readFileSync(join(process.cwd(), 'src/pages/investigations/InvestigationDetailPage.tsx'), 'utf8');
    const queueStyles = readFileSync(join(process.cwd(), 'src/pages/investigations/InvestigationsPage.css'), 'utf8');
    const detailStyles = readFileSync(join(process.cwd(), 'src/pages/investigations/InvestigationDetailPage.css'), 'utf8');

    expect(queue).toContain('INVESTIGATIONS_JOB_SENTENCE');
    expect(queue).toContain('aria-label="Investigation pagination"');
    expect(queue).toContain('Working sessions');
    expect(detail).toContain('PINNED EVIDENCE');
    expect(detail).toContain('unpinInvestigationItem');
    expect(detail).toContain('Promote investigation to incident');
    expect(detail).toContain('Governed INV-012');
    expect(detail).not.toContain('Hive Intelligence');
    expect(detail).not.toContain('investigation-phase-rail');
    expect(queueStyles).not.toMatch(/#[0-9a-f]{3,8}/i);
    expect(detailStyles).not.toMatch(/#[0-9a-f]{3,8}/i);
    expect(queueStyles).toContain('min-height: 50vh');
  });

  it('keeps fictional records out of production bundles', () => {
    const service = readFileSync(join(process.cwd(), 'src/pages/investigations/investigation.service.ts'), 'utf8');
    const viteConfig = readFileSync(join(process.cwd(), 'vite.config.ts'), 'utf8');
    const buildScript = readFileSync(join(process.cwd(), 'scripts/build.mjs'), 'utf8');

    expect(service).toContain("import.meta.env.DEV && import.meta.env.VITE_USE_FOUNDATION_FIXTURES === 'true'");
    expect(viteConfig).toContain('investigation.fixture-disabled.ts');
    expect(buildScript).toContain('--alias:@/pages/investigations/investigation.fixtures=./src/pages/investigations/investigation.fixture-disabled.ts');
  });
});
