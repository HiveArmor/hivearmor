/**
 * Sensor remote containment — JWT → role-gated EDR REST → ProcessCommand.
 * Callers must gate with canEnableRemoteSensorActions() + ROLE_ADMIN|ROLE_SOC_MANAGER.
 */

import { apiClient } from '@/lib/apiClient';

import {
  canEnableRemoteSensorActions,
  REMOTE_SENSOR_ACTION_ROLES,
} from './sensorRemoteActions.capabilities';

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
  assertRemoteActionsCallable();
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
  assertRemoteActionsCallable();
  return apiClient.post<KillProcessResponse>('/edr/actions/kill-process', {
    agentId: request.agentId,
    pid: request.pid,
    processName: request.processName ?? '',
  });
}

function assertRemoteActionsCallable(): void {
  if (!canEnableRemoteSensorActions()) {
    throw new Error(
      'Remote sensor actions are not live-verified; refusing to call mutate APIs'
    );
  }
}
