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
    canEnableRemoteSensorActions: vi.fn(() => false),
  };
});

import { apiClient } from '@/lib/apiClient';
import { canEnableRemoteSensorActions } from './sensorRemoteActions.capabilities';
import {
  hasRemoteSensorActionRole,
  isolateSensor,
  killSensorProcess,
} from './sensorRemoteActions.service';
import {
  REMOTE_SENSOR_ACTION_ROLES,
  REMOTE_SENSOR_ACTIONS_LIVE_VERIFIED,
  REMOTE_SENSOR_ACTIONS_REST_GATED,
} from './sensorRemoteActions.capabilities';

describe('sensorRemoteActions.capabilities', () => {
  it('documents REST as gated and live verify as off by default', () => {
    expect(REMOTE_SENSOR_ACTIONS_REST_GATED).toBe(true);
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
    vi.mocked(canEnableRemoteSensorActions).mockReturnValue(false);
    vi.mocked(apiClient.post).mockReset();
  });

  it('refuses isolate when live-verify flag is off', async () => {
    await expect(
      isolateSensor({ agentId: '1', hostname: 'host-a' })
    ).rejects.toThrow(/live-verified/i);
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('refuses kill when live-verify flag is off', async () => {
    await expect(
      killSensorProcess({ agentId: '1', pid: 4242 })
    ).rejects.toThrow(/live-verified/i);
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('posts isolate to role-gated EDR path when enabled', async () => {
    vi.mocked(canEnableRemoteSensorActions).mockReturnValue(true);
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

  it('posts kill-process to role-gated EDR path when enabled', async () => {
    vi.mocked(canEnableRemoteSensorActions).mockReturnValue(true);
    vi.mocked(apiClient.post).mockResolvedValue({ result: 'ok' });

    await killSensorProcess({ agentId: '7', pid: 99, processName: 'evil.exe' });

    expect(apiClient.post).toHaveBeenCalledWith('/edr/actions/kill-process', {
      agentId: '7',
      pid: 99,
      processName: 'evil.exe',
    });
  });
});
