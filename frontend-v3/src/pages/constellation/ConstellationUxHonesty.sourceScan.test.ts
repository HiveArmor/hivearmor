import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { CONSTELLATION_JOB_SENTENCE } from './ThreatConstellationPage';

describe('threat constellation UX honesty (Prompt 15)', () => {
  const page = readFileSync(join(process.cwd(), 'src/pages/constellation/ThreatConstellationPage.tsx'), 'utf8');
  const styles = readFileSync(join(process.cwd(), 'src/pages/constellation/ThreatConstellationPage.css'), 'utf8');

  it('states relationship-graph job sentence distinct from entity inventory and UEBA', () => {
    expect(CONSTELLATION_JOB_SENTENCE).toMatch(/Relationship graph/i);
    expect(CONSTELLATION_JOB_SENTENCE).toMatch(/investigation|evidence-backed/i);
    expect(CONSTELLATION_JOB_SENTENCE).not.toMatch(/Entity inventory/i);
    expect(CONSTELLATION_JOB_SENTENCE).not.toMatch(/UEBA risk overview/i);
    expect(page).toContain('CONSTELLATION_JOB_SENTENCE');
  });

  it('wires staging honesty, meta links, and human role labels', () => {
    expect(page).toContain('STAGING CANDIDATE');
    expect(page).toContain('constellation-empty-honesty');
    expect(page).toContain('Mission Control');
    expect(page).toContain('/entities');
    expect(page).toContain('/investigations');
    expect(page).toContain('/search');
    expect(page).toContain('/intelligence');
    expect(page).toContain('Platform Administrator');
    expect(page).not.toContain('constellation-summary');
  });

  it('keeps graph workspace primary with reduced header chrome', () => {
    expect(styles).toContain('min-height: 50vh');
    expect(styles).toContain('.constellation-workspace');
    expect(styles).not.toContain('.constellation-summary');
  });
});
