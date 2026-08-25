import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('Wave A2 remaining gaps honesty', () => {
  it('A2-SRCH-02: hunt service does not call legacy /v1/threat-intel', () => {
    const source = readFileSync(join(process.cwd(), 'src/pages/search-hunt/searchHunt.service.ts'), 'utf8');
    expect(source).not.toContain('/v1/threat-intel');
    expect(source).not.toContain('getThreatIntel');
    expect(source).not.toContain('translateNlToQuery');
  });

  it('A2-UEBA-02: risk dashboard guides to Search & Hunt instead of a dead window event', () => {
    const source = readFileSync(join(process.cwd(), 'src/pages/ueba/risk/RiskDashboardPage.tsx'), 'utf8');
    expect(source).not.toContain('window.dispatchEvent');
    expect(source).toContain('ueba-create-incident-guidance');
    expect(source).toContain('/search?q=');
  });
});
