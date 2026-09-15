/**
 * Agent provisioning service — API calls for the Add Agent one-click UX.
 * All requests route through the Vite /api/* proxy.
 */

import { apiClient } from '@/lib/apiClient';
import type {
  AgentKeyCreatedDTO,
  AgentKeyListItemDTO,
  CreateAgentKeyRequest,
} from '@/types/agentProvisioning.types';

const fixtureMode =
  import.meta.env.DEV && import.meta.env.VITE_USE_FOUNDATION_FIXTURES === 'true';

/**
 * Create a new agent provisioning key.
 * Returns the raw key and install scripts — treat them as secrets.
 */
export async function createAgentKey(
  req: CreateAgentKeyRequest
): Promise<AgentKeyCreatedDTO> {
  return apiClient.post<AgentKeyCreatedDTO>('/ha-agent-keys', req);
}

/**
 * List all agent provisioning keys for the current admin.
 * Does NOT return raw keys or scripts.
 */
export async function listAgentKeys(): Promise<AgentKeyListItemDTO[]> {
  if (fixtureMode) {
    const { getFixtureAgentKeys } = await import('./enrollmentTokens.fixtures');
    return getFixtureAgentKeys();
  }
  return apiClient.get<AgentKeyListItemDTO[]>('/ha-agent-keys');
}

/**
 * Revoke (immediately expire) an agent provisioning key by ID.
 */
export async function revokeAgentKey(id: string): Promise<void> {
  if (fixtureMode) return;
  return apiClient.delete<void>(`/ha-agent-keys/${id}`);
}
