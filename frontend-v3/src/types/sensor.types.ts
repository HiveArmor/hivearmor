/**
 * Sensor (Agent/Collector) Types
 */

export interface SensorDTO {
  agentId: string;
  hostname: string;
  platform: 'windows' | 'linux' | 'macos' | 'unknown';
  osVersion: string | null;
  agentVersion: string | null;
  connectionStatus: 'ACTIVE' | 'INACTIVE' | 'UNREACHABLE' | 'UNKNOWN';
  lastSeen: string | null;
  cpuUsage: number | null;
  memUsage: number | null;
  diskUsage: number | null;
  collectorType: 'agent' | 'collector' | 'unknown';
}

export interface SensorHealthDetailDTO {
  agentId: string;
  hostname: string;
  platform: string;
  osVersion: string | null;
  agentVersion: string | null;
  connectionStatus: 'ACTIVE' | 'INACTIVE' | 'UNREACHABLE' | 'UNKNOWN';
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
