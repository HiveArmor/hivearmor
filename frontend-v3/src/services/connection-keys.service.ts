/**
 * Connection Keys Service — API client for connection keys (ADM-06)
 */

import { apiClient } from '@/lib/apiClient';
import type {
  ConnectionKeyDTO,
  CreateConnectionKeyRequest,
  CreateConnectionKeyResponse,
} from '@/types/connection-key.types';

// TODO: confirm /api/ha-connection-keys endpoint exists

export async function getConnectionKeys(): Promise<ConnectionKeyDTO[]> {
  return apiClient.get<ConnectionKeyDTO[]>('/ha-connection-keys');
}

export async function createConnectionKey(
  req: CreateConnectionKeyRequest
): Promise<CreateConnectionKeyResponse> {
  return apiClient.post<CreateConnectionKeyResponse>('/ha-connection-keys', req);
}

export async function deleteConnectionKey(id: string): Promise<void> {
  return apiClient.delete<void>(`/ha-connection-keys/${id}`);
}
