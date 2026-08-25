import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/apiClient', () => ({
  apiClient: {
    post: vi.fn(),
  },
}));

vi.mock('./sensorRemoteActions.capabilities', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./sensorRemoteActions.capabilities')>();
  return {
    ...actual,
    canEnableKillProcess: vi.fn(() => false),
    canEnableIsolateHost: vi.fn(() => false),
    canEnableRemoteSensorActions: vi.fn(() => false),
  };
});

import {
  canEnableIsolateHost,
  canEnableKillProcess,
  REMOTE_SENSOR_ACTION_ROLES,
  REMOTE_SENSOR_ACTIONS_LIVE_VERIFIED,
  REMOTE_SENSOR_ACTIONS_REST_GATED,
  REMOTE_SENSOR_ISOLATE_LIVE_VERIFIED,
  REMOTE_SENSOR_KILL_LIVE_VERIFIED,
} from './sensorRemoteActions.capabilities';
import {
  hasRemoteSensorActionRole,
  isolateSensor,
  killSensorProcess,
} from './sensorRemoteActions.service';

import { apiClient } from '@/lib/apiClient';

describe('sensorRemoteActions.capabilities', () => {
  it('documents kill verified and isolate fail-closed (B1-SENS-02)', () => {
    expect(REMOTE_SENSOR_ACTIONS_REST_GATED).toBe(true);
    expect(REMOTE_SENSOR_KILL_LIVE_VERIFIED).toBe(true);
    expect(REMOTE_SENSOR_ISOLATE_LIVE_VERIFIED).toBe(false);
    expect(REMOTE_SENSOR_ACTIONS_LIVE_VERIFIED).toBe(false);
    expect(REMOTE_SENSOR_ACTION_ROLES).toEqual(['ROLE_ADMIN', 'ROLE_SOC_MANAGER']);
  });
});

describe('hasRemoteSensorActionRole', () => {
  it('allows Admin and SOC Manager only', () => {
    expect(hasRemoteSensorActionRole(['ROLE_ADMIN'])).toBe(true);
    expect(hasRemoteSensorActionRole(['ROLE_SOC_MANAGER'])).toBe(true);
    expect(hasRemoteSensorActionRole(['ROLE_ANALYST'])).toBe(false);
    expect(hasRemoteSensorActionRole(['ROLE_USER'])).toBe(false);
  });
});

describe('sensorRemoteActions.service', () => {
  beforeEach(() => {
    vi.mocked(canEnableKillProcess).mockReturnValue(false);
    vi.mocked(canEnableIsolateHost).mockReturnValue(false);
    vi.mocked(apiClient.post).mockReset();
  });

  it('refuses isolate when isolate live-verify flag is off', async () => {
    await expect(
      isolateSensor({ agentId: '1', hostname: 'host-a' })
    ).rejects.toThrow(/isolation stays blocked/i);
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('refuses kill when kill live-verify flag is off', async () => {
    await expect(
      killSensorProcess({ agentId: '1', pid: 4242 })
    ).rejects.toThrow(/live-verified/i);
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('posts isolate to role-gated EDR path when isolate enabled', async () => {
    vi.mocked(canEnableIsolateHost).mockReturnValue(true);
    vi.mocked(apiClient.post).mockResolvedValue({ status: 'ACTIVE' });

    await isolateSensor({
      agentId: '42',
      hostname: 'wks-01',
      reason: 'containment',
    });

    expect(apiClient.post).toHaveBeenCalledWith('/edr/isolation', {
      agentId: '42',
      hostname: 'wks-01',
      reason: 'containment',
      isolationType: 'FULL',
    });
  });

  it('posts kill-process to role-gated EDR path when kill enabled', async () => {
    vi.mocked(canEnableKillProcess).mockReturnValue(true);
    vi.mocked(apiClient.post).mockResolvedValue({ result: 'ok' });

    await killSensorProcess({ agentId: '7', pid: 99, processName: 'evil.exe' });

    expect(apiClient.post).toHaveBeenCalledWith('/edr/actions/kill-process', {
      agentId: '7',
      pid: 99,
      processName: 'evil.exe',
    });
  });
});
