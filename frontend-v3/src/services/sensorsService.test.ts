import { describe, expect, it } from 'vitest';

import { adaptAgentWireToSensor } from './sensorsService';

describe('adaptAgentWireToSensor (B1-SENS-01 / B1-EP-02)', () => {
  it('maps AgentDTO id/status/version into SensorDTO', () => {
    const sensor = adaptAgentWireToSensor({
      id: 19,
      hostname: 'EC2AMAZ-8F0Q7DL',
      platform: 'WINDOWS',
      status: 'ONLINE',
      version: '1.2.3',
      os: 'Windows Server',
      lastSeen: '2026-08-25T00:00:00Z',
    });

    expect(sensor).toEqual({
      agentId: '19',
      hostname: 'EC2AMAZ-8F0Q7DL',
      platform: 'windows',
      osVersion: 'Windows Server',
      agentVersion: '1.2.3',
      connectionStatus: 'ONLINE',
      lastSeen: '2026-08-25T00:00:00Z',
      cpuUsage: null,
      memUsage: null,
      diskUsage: null,
      collectorType: 'agent',
      mode: null,
      bundleVersion: null,
    });
  });

  it('prefers numeric id over legacy agentId and drops rows without a key', () => {
    expect(adaptAgentWireToSensor({ agentId: 'legacy', id: 7, hostname: 'h' })?.agentId).toBe('7');
    expect(adaptAgentWireToSensor({ hostname: 'orphan' })).toBeNull();
  });

  it('normalizes ACTIVE/INACTIVE aliases to ONLINE/OFFLINE', () => {
    expect(adaptAgentWireToSensor({ id: 1, status: 'ACTIVE' })?.connectionStatus).toBe('ONLINE');
    expect(adaptAgentWireToSensor({ id: 2, status: 'INACTIVE' })?.connectionStatus).toBe('OFFLINE');
  });
});
