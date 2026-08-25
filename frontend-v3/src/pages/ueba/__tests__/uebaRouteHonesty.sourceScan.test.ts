/**
 * Source-scan honesty: UEBA routes register ROLE_ANALYST | ROLE_SOC_MANAGER | ROLE_ADMIN
 * and `/ueba/entity-timeline` is wired (not an orphan constant).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../../../..');

function readSrc(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8');
}

describe('UEBA route honesty (source scan)', () => {
  it('registers /ueba/entity-timeline with Analyst | SOC Manager | Admin AuthGuard', () => {
    const router = readSrc('src/router/index.tsx');
    expect(router).toContain("path: 'ueba/entity-timeline'");
    expect(router).toContain('EntityTimelineRoutePage');

    const riskBlock = router.slice(
      router.indexOf("path: 'ueba/risk'"),
      router.indexOf("path: 'ueba/entity-timeline'") + 400,
    );
    expect(riskBlock).toContain("'ROLE_ANALYST'");
    expect(riskBlock).toContain("'ROLE_SOC_MANAGER'");
    expect(riskBlock).toContain("'ROLE_ADMIN'");
  });

  it('nav UEBA Risk includes SOC Manager alongside Analyst and Admin', () => {
    const nav = readSrc('src/components/ha-navigation/HaNavigation.tsx');
    const uebaLine = nav
      .split('\n')
      .find((line) => line.includes("label: 'UEBA Risk'"));
    expect(uebaLine).toBeDefined();
    expect(uebaLine).toContain('ROLE_ANALYST');
    expect(uebaLine).toContain('ROLE_SOC_MANAGER');
    expect(uebaLine).toContain('ROLE_ADMIN');
  });
});
