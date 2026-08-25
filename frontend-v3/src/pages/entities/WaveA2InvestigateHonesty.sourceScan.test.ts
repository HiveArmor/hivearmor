import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('Wave A2 Investigate router honesty', () => {
  const routerSource = readFileSync(join(process.cwd(), 'src/router/index.tsx'), 'utf8');

  it('gates Search & Hunt with ALERT_QUEUE_ROLES (A2-AUTH-01)', () => {
    expect(routerSource).toMatch(/path:\s*'search'[\s\S]*?ALERT_QUEUE_ROLES/);
  });

  it('redirects /entities/:id to dossier (A2-ENT-01)', () => {
    expect(routerSource).toContain('EntityIdToDossierRedirect');
    expect(routerSource).toContain('/entities/${encodeURIComponent(id)}/dossier');
    expect(routerSource).not.toContain('EntityDetailPage');
  });

  it('gates Constellation with ALERT_QUEUE_ROLES including SOC_ANALYST (A2-AUTH-04)', () => {
    expect(routerSource).toMatch(/path:\s*'constellation'[\s\S]*?ALERT_QUEUE_ROLES/);
  });
});
