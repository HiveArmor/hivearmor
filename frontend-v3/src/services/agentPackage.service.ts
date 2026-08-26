/**
 * Agent package catalog + published version summary (Sensors / Add Agent).
 */

import { apiClient } from '@/lib/apiClient';

export interface AgentPackageStatus {
  filename: string;
  href: string;
  available: boolean;
  sizeBytes: number | null;
}

export interface AgentPackageSummary {
  latestVersion: string | null;
  updaterVersion: string | null;
  publishedCount: number;
  totalCount: number;
  packages: AgentPackageStatus[];
}

export async function fetchAgentPackageCatalog(): Promise<AgentPackageStatus[]> {
  return apiClient.get<AgentPackageStatus[]>('/ha-agent-packages');
}

export async function fetchAgentPackageSummary(): Promise<AgentPackageSummary> {
  return apiClient.get<AgentPackageSummary>('/ha-agent-packages/summary');
}

/** True when running agent version does not match the published package version. */
export function isAgentVersionBehind(
  agentVersion: string | null | undefined,
  latestVersion: string | null | undefined
): boolean {
  const current = agentVersion?.trim() ?? '';
  const latest = latestVersion?.trim() ?? '';
  if (!current || !latest) return false;
  return current !== latest;
}
