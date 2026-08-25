/**
 * Sensor (Agent/Collector) Types — re-export adapted projection.
 * Prefer importing SensorDTO from `@/services/sensorsService`.
 */

export type { SensorDTO } from '@/services/sensorsService';

export interface SensorHealthDetailDTO {
  agentId: string;
  hostname: string;
  platform: string;
  osVersion: string | null;
  agentVersion: string | null;
  connectionStatus: 'ONLINE' | 'OFFLINE' | 'UNKNOWN';
  lastSeen: string | null;
  uptime: number | null;
  cpuUsage: number | null;
  memUsage: number | null;
  diskUsage: number | null;
  logEventRate: number | null;
  lastHeartbeat: string | null;
  errorLog: string[] | null;
}

export interface SensorFilters {
  platform?: string[];
  connectionStatus?: string[];
  version?: string;
  q?: string;
}
