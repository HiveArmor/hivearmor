/**
 * Typed Connector SDK API client (P1).
 * Secrets are write-only — list/get never return secret values.
 */

import { apiClient } from '@/lib/apiClient';

export interface ConnectorFieldSchema {
  name: string;
  type: string;
  label: string;
  required: boolean;
  secret: boolean;
  defaultValue?: string;
  helpText?: string;
}

export interface ConnectorCatalogEntry {
  connectorId: string;
  connectorName: string;
  category: string;
  description: string;
  fields: ConnectorFieldSchema[];
  capabilities: string[];
}

export interface ConnectorInstance {
  id: number;
  connectorId: string;
  connectorName: string;
  category: string;
  name: string;
  enabled: boolean;
  configPublic: Record<string, string>;
  secretFieldsConfigured: string[];
  capabilities: string[];
  allowedCapabilities: string[];
  createdAt: string;
  updatedAt: string;
  lastTestedAt: string | null;
  lastTestOk: boolean | null;
  lastTestMessage: string | null;
}

export interface ConnectorInstanceWrite {
  connectorId?: string;
  name: string;
  enabled?: boolean;
  config: Record<string, string>;
  allowedCapabilities?: string[];
}

export interface ConnectionTestResult {
  ok: boolean;
  message: string;
  httpStatus?: number;
}

export const connectorService = {
  listCatalog(signal?: AbortSignal): Promise<ConnectorCatalogEntry[]> {
    return apiClient.get<ConnectorCatalogEntry[]>('/ha-connectors/catalog', { signal });
  },

  listInstances(signal?: AbortSignal): Promise<ConnectorInstance[]> {
    return apiClient.get<ConnectorInstance[]>('/ha-connectors/instances', { signal });
  },

  create(body: ConnectorInstanceWrite): Promise<ConnectorInstance> {
    return apiClient.post<ConnectorInstance>('/ha-connectors/instances', body);
  },

  update(id: number, body: ConnectorInstanceWrite): Promise<ConnectorInstance> {
    return apiClient.put<ConnectorInstance>(`/ha-connectors/instances/${id}`, body);
  },

  remove(id: number): Promise<void> {
    return apiClient.delete(`/ha-connectors/instances/${id}`);
  },

  test(id: number): Promise<ConnectionTestResult> {
    return apiClient.post<ConnectionTestResult>(`/ha-connectors/instances/${id}/test`, {});
  },
};
