/**
 * Sensor remote containment — JWT → role-gated EDR REST → ProcessCommand.
 * Callers must gate with canEnableKillProcess / canEnableIsolateHost + ROLE_ADMIN|ROLE_SOC_MANAGER.
 */

import {
  canEnableIsolateHost,
  canEnableKillProcess,
  REMOTE_SENSOR_ACTION_ROLES,
  REMOTE_SENSOR_ISOLATE_BLOCKED_TITLE,
  REMOTE_SENSOR_ACTIONS_BLOCKED_TITLE,
} from './sensorRemoteActions.capabilities';

import { apiClient } from '@/lib/apiClient';

export interface IsolateSensorRequest {
  agentId: string;
  hostname: string;
  reason?: string;
  isolationType?: 'FULL' | 'PARTIAL';
}

export interface IsolateSensorResponse {
  id?: number;
  agentId?: string;
  hostname?: string;
  status?: string;
  isolationType?: string;
}

export interface KillProcessRequest {
  agentId: string;
  pid: number;
  processName?: string;
}

export interface KillProcessResponse {
  result: string;
}

export function hasRemoteSensorActionRole(authorities: readonly string[]): boolean {
  return REMOTE_SENSOR_ACTION_ROLES.some((role) => authorities.includes(role));
}

/**
 * Isolate host via POST /api/edr/isolation (@PreAuthorize ADMIN|SOC_MANAGER).
 * Backend EdrService → IncidentResponseCommandService → ProcessCommand (EDR_ISOLATE).
 */
export async function isolateSensor(
  request: IsolateSensorRequest
): Promise<IsolateSensorResponse> {
  if (!canEnableIsolateHost()) {
    throw new Error(REMOTE_SENSOR_ISOLATE_BLOCKED_TITLE);
  }
  return apiClient.post<IsolateSensorResponse>('/edr/isolation', {
    agentId: request.agentId,
    hostname: request.hostname,
    reason: request.reason ?? 'SensorGrid isolate',
    isolationType: request.isolationType ?? 'FULL',
  });
}

/**
 * Kill process via POST /api/edr/actions/kill-process (@PreAuthorize ADMIN|SOC_MANAGER).
 * Backend EdrService → ProcessCommand (EDR_KILL:<pid>).
 */
export async function killSensorProcess(
  request: KillProcessRequest
): Promise<KillProcessResponse> {
  if (!canEnableKillProcess()) {
    throw new Error(REMOTE_SENSOR_ACTIONS_BLOCKED_TITLE);
  }
  return apiClient.post<KillProcessResponse>('/edr/actions/kill-process', {
    agentId: request.agentId,
    pid: request.pid,
    processName: request.processName ?? '',
  });
}
