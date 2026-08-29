import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  REMOTE_SENSOR_ISOLATE_LIVE_VERIFIED,
  REMOTE_SENSOR_KILL_LIVE_VERIFIED,
} from '@/services/sensorRemoteActions.capabilities';

describe('Wave B1 Endpoint defense honesty', () => {
  it('B1-SENS-02: isolate stays fail-closed while kill may be verified', () => {
    expect(REMOTE_SENSOR_KILL_LIVE_VERIFIED).toBe(true);
    expect(REMOTE_SENSOR_ISOLATE_LIVE_VERIFIED).toBe(false);
  });

  it('B1-EP-01 / B1-FIM-01: endpoints and FIM routes are Analyst-gated', () => {
    const router = readFileSync(join(process.cwd(), 'src/router/index.tsx'), 'utf8');
    const nav = readFileSync(join(process.cwd(), 'src/components/ha-navigation/HaNavigation.tsx'), 'utf8');
    expect(nav).toContain("route: '/edr/endpoints', roles: ['ROLE_ANALYST', 'ROLE_SOC_MANAGER', 'ROLE_ADMIN']");
    expect(router).toMatch(/path:\s*'edr\/fim'[\s\S]*?allowedRoles=\{\['ROLE_ANALYST'/);
    expect(router).toMatch(/path:\s*'edr\/endpoints'[\s\S]*?allowedRoles=\{\['ROLE_ANALYST'/);
    expect(router).toMatch(/path:\s*'edr\/quarantine'[\s\S]*?allowedRoles=\{\['ROLE_ANALYST'/);
  });

  it('B1-SENS-01: sensorsService adapts AgentDTO wire fields', () => {
    const source = readFileSync(join(process.cwd(), 'src/services/sensorsService.ts'), 'utf8');
    expect(source).toContain('adaptAgentWireToSensor');
    expect(source).toContain("connectionStatus: 'ONLINE' | 'OFFLINE' | 'UNKNOWN'");
  });

  it('B1-EP-03: endpoints timeline navigation requires agentId', () => {
    const source = readFileSync(join(process.cwd(), 'src/pages/edr/endpoints/EndpointsListPage.tsx'), 'utf8');
    expect(source).toContain('event.data?.agentId');
    expect(source).not.toContain('event.data?.agentId ?? event.data?.hostname');
  });

  it('B1-FIM-02: FIM dashboard uses summary-only honesty chrome (Prompt 22)', () => {
    const page = readFileSync(join(process.cwd(), 'src/pages/edr/FimDashboardPage.tsx'), 'utf8');
    const styles = readFileSync(join(process.cwd(), 'src/pages/edr/FimDashboardPage.css'), 'utf8');
    expect(page).toContain('FIM_DASHBOARD_JOB_SENTENCE');
    expect(page).toContain('STAGING CANDIDATE');
    expect(page).toContain('fim-empty-honesty');
    expect(page).toContain('/api/ha-edr/fim/summary');
    expect(page).not.toMatch(/\/api\/ha-edr\/fim\/events/);
    expect(styles).toContain('min-height: 50vh');
  });
});
