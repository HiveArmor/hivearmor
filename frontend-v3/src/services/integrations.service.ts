/**
 * Integrations Service — API client for integrations (ADM-02)
 */

import { apiClient } from '@/lib/apiClient';
import type {
  CreateIntegrationRequest,
  IntegrationDTO,
  IntegrationTestResult,
  UpdateIntegrationRequest,
} from '@/types/integration.types';

// TODO: confirm /api/ha-integrations endpoint exists

export async function getIntegrations(): Promise<IntegrationDTO[]> {
  return apiClient.get<IntegrationDTO[]>('/ha-integrations');
}

export async function createIntegration(req: CreateIntegrationRequest): Promise<IntegrationDTO> {
  return apiClient.post<IntegrationDTO>('/ha-integrations', req);
}

export async function updateIntegration(req: UpdateIntegrationRequest): Promise<IntegrationDTO> {
  return apiClient.put<IntegrationDTO>(`/ha-integrations/${req.id}`, req);
}

export async function deleteIntegration(id: string): Promise<void> {
  return apiClient.delete<void>(`/ha-integrations/${id}`);
}

export async function testIntegration(id: string): Promise<IntegrationTestResult> {
  return apiClient.post<IntegrationTestResult>(`/ha-integrations/${id}/test`);
}
