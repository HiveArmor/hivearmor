import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('Wave C2 Platform admin honesty', () => {
  it('C2-02: inputs/sources AuthGuard matches BE ADMIN|ANALYST (no ROLE_OPERATOR)', () => {
    const router = readFileSync(join(process.cwd(), 'src/router/index.tsx'), 'utf8');
    expect(router).toMatch(
      /path: 'inputs\/sources'[\s\S]*?allowedRoles=\{\['ROLE_ADMIN', 'ROLE_ANALYST'\]\}/,
    );
    expect(router).not.toContain('ROLE_OPERATOR');
  });

  it('C2-02: PipelineOperationsPage drops ROLE_OPERATOR', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/pages/admin/pipeline-operations/PipelineOperationsPage.tsx'),
      'utf8',
    );
    expect(source).not.toContain('ROLE_OPERATOR');
    expect(source).toContain("hasAnyRole(['ROLE_ADMIN','ROLE_ANALYST'])");
  });

  it('C2-01: vite aliases fixture-disabled for admin hubs', () => {
    const vite = readFileSync(join(process.cwd(), 'vite.config.ts'), 'utf8');
    expect(vite).toContain('identityAdministration.fixture-disabled.ts');
    expect(vite).toContain('integrationOperations.fixture-disabled.ts');
    expect(vite).toContain('pipelineOperations.fixture-disabled.ts');
    expect(vite).toContain('governanceOperations.fixture-disabled.ts');
  });

  it('C2-10: governance audit drawer does not stringify payload', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/pages/admin/governance-operations/GovernanceOperationsPage.tsx'),
      'utf8',
    );
    expect(source).not.toContain('JSON.stringify(value.payload');
    expect(source).toContain('Omitted from UI');
  });

  it('C2-04: connection-keys redirects to api-keys', () => {
    const router = readFileSync(join(process.cwd(), 'src/router/index.tsx'), 'utf8');
    expect(router).toMatch(
      /path: 'admin\/connection-keys'[\s\S]*?Navigate to="\/settings\/api-keys"/,
    );
  });

  it('C2-11: UtmIntegrationResource GET methods have ADMIN PreAuthorize', () => {
    const source = readFileSync(
      join(process.cwd(), '../backend/src/main/java/com/hivearmor/web/rest/UtmIntegrationResource.java'),
      'utf8',
    );
    expect(source).toMatch(/@GetMapping\("\/ha-integrations"\)\s*\n\s*@PreAuthorize/);
    expect(source).toMatch(/@GetMapping\("\/ha-integrations\/\{id\}"\)\s*\n\s*@PreAuthorize/);
  });

  it('C2-12: aiStatus uses ROLE_ authorities', () => {
    const source = readFileSync(
      join(
        process.cwd(),
        '../backend/src/main/java/com/hivearmor/web/rest/admin/HaSystemSettingsController.java',
      ),
      'utf8',
    );
    expect(source).toContain("AuthoritiesConstants.ANALYST");
    expect(source).not.toContain("hasAuthority('ANALYST')");
  });
});
