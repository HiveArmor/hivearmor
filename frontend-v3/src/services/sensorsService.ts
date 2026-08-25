/**
 * sensorsService — agent / sensor list API.
 * Adapts AgentManager AgentDTO (id, status, version) into SensorDTO.
 */

import { apiClient } from '@/lib/apiClient';

/** Canonical UI projection after adapting AgentDTO. */
export interface SensorDTO {
  agentId: string;
  hostname: string;
  platform: string;
  osVersion: string | null;
  agentVersion: string | null;
  /** Matches AgentStatusEnum from agent-manager. */
  connectionStatus: 'ONLINE' | 'OFFLINE' | 'UNKNOWN';
  lastSeen: string | null;
  cpuUsage: number | null;
  memUsage: number | null;
  diskUsage: number | null;
  collectorType: string | null;
  /** Not projected by AgentDTO — always null until a secured field exists. */
  mode: string | null;
  bundleVersion: string | null;
}

/** Raw AgentDTO wire shape from GET /api/agent-manager/agents. */
export interface AgentWireDTO {
  id?: number | string;
  agentId?: string;
  hostname?: string | null;
  ip?: string | null;
  os?: string | null;
  platform?: string | null;
  status?: string | null;
  connectionStatus?: string | null;
  version?: string | null;
  agentVersion?: string | null;
  lastSeen?: string | null;
  osMajorVersion?: string | null;
  osMinorVersion?: string | null;
  mac?: string | null;
}

export interface SensorsQuery {
  page?: number;
  size?: number;
  q?: string;
  platform?: string;
  connectionStatus?: string;
}

function normalizeStatus(raw: string | null | undefined): SensorDTO['connectionStatus'] {
  const value = (raw ?? '').toUpperCase();
  if (value === 'ONLINE' || value === 'ACTIVE') return 'ONLINE';
  if (value === 'OFFLINE' || value === 'INACTIVE') return 'OFFLINE';
  return 'UNKNOWN';
}

function buildOsVersion(wire: AgentWireDTO): string | null {
  if (wire.osMajorVersion || wire.osMinorVersion) {
    return [wire.osMajorVersion, wire.osMinorVersion].filter(Boolean).join('.');
  }
  return wire.os?.trim() || null;
}

/**
 * Maps agent-manager AgentDTO (and legacy FE field names) into SensorDTO.
 * Prefer numeric `id` as agentId for ProcessCommand / timeline keys.
 */
export function adaptAgentWireToSensor(wire: AgentWireDTO): SensorDTO | null {
  const agentId =
    wire.id !== undefined && wire.id !== null && String(wire.id).trim() !== ''
      ? String(wire.id)
      : wire.agentId?.trim()
        ? String(wire.agentId)
        : null;
  if (!agentId) return null;

  return {
    agentId,
    hostname: wire.hostname?.trim() || agentId,
    platform: (wire.platform ?? 'unknown').toLowerCase(),
    osVersion: buildOsVersion(wire),
    agentVersion: wire.version?.trim() || wire.agentVersion?.trim() || null,
    connectionStatus: normalizeStatus(wire.status ?? wire.connectionStatus),
    lastSeen: wire.lastSeen ?? null,
    cpuUsage: null,
    memUsage: null,
    diskUsage: null,
    collectorType: 'agent',
    mode: null,
    bundleVersion: null,
  };
}

/**
 * Fetch all registered agents / sensors.
 */
export async function fetchSensors(query: SensorsQuery = {}): Promise<{
  sensors: SensorDTO[];
  total: number;
}> {
  const params: Record<string, string | number> = {};
  if (query.page !== undefined) params.pageNumber = query.page;
  if (query.size !== undefined) params.pageSize = query.size;
  if (query.q) params.searchQuery = query.q;

  const data = await apiClient.get<AgentWireDTO[]>('/agent-manager/agents', { params });
  const adapted = (Array.isArray(data) ? data : [])
    .map(adaptAgentWireToSensor)
    .filter((row): row is SensorDTO => row !== null);
  return { sensors: adapted, total: adapted.length };
}
