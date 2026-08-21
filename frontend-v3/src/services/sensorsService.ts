/**
 * sensorsService — agent / sensor list API.
 * Extracted from SensorGridPage's inline apiClient call into a proper service file.
 */

export interface SensorDTO {
  agentId: string;
  hostname: string;
  platform: string;
  osVersion: string | null;
  agentVersion: string | null;
  connectionStatus: 'ONLINE' | 'OFFLINE' | 'UNKNOWN';
  lastSeen: string | null;
  cpuUsage: number | null;
  memUsage: number | null;
  diskUsage: number | null;
  collectorType: string | null;
  mode: string | null;        // "log" | "edr"
  bundleVersion: string | null;
}

export interface SensorVitalsDTO {
  agentId: string;
  cpuPct: number | null;
  ramMb: number | null;
  queueDepth: number | null;
  eventsPerSec: number | null;
  droppedTotal: number;
  lastError: string | null;
  sampledAt: string;
}

export interface SensorsQuery {
  page?: number;
  size?: number;
  q?: string;
  platform?: string;
  connectionStatus?: string;
}

async function get<T>(path: string, params?: URLSearchParams): Promise<{ data: T; total: number }> {
  const url = `/api${path}${params && params.toString() ? '?' + params.toString() : ''}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${localStorage.getItem('hivearmor_auth_token') ?? ''}`,
    },
  });
  if (!res.ok) throw new Error(`GET ${url}: ${res.status}`);
  const total = parseInt(res.headers.get('X-Total-Count') ?? '0', 10);
  return { data: (await res.json()) as T, total };
}

/**
 * Fetch all registered agents / sensors.
 */
export async function fetchSensors(query: SensorsQuery = {}): Promise<{
  sensors: SensorDTO[];
  total: number;
}> {
  const p = new URLSearchParams();
  if (query.page !== undefined) p.set('pageNumber', String(query.page));
  if (query.size !== undefined) p.set('pageSize', String(query.size));
  if (query.q) p.set('searchQuery', query.q);

  const { data, total } = await get<SensorDTO[]>('/agent-manager/agents', p);
  return { sensors: data, total };
}

/**
 * Fetch recent vitals samples for a single agent (last N rows from ha_agent_vitals).
 */
export async function fetchAgentVitals(agentId: string): Promise<SensorVitalsDTO[]> {
  const { data } = await get<SensorVitalsDTO[]>(
    `/ha-telemetry/vitals/${encodeURIComponent(agentId)}`,
  );
  return data;
}
