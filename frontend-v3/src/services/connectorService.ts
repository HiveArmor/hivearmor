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

/** Staging row from PostgreSQL queue (ADR-20260824) — not an OpenSearch alert doc. */
export type ConnectorStagedAlertStatus = 'PENDING' | 'PROMOTED' | 'FAILED' | string;

export interface ConnectorStagedAlert {
  id: number;
  connectorInstanceId: number;
  connectorId: string;
  externalId: string;
  title: string | null;
  severity: string | null;
  hostname: string | null;
  srcIp: string | null;
  alertCreatedAt: string | null;
  ingestBatchId: string;
  ingestedAt: string | null;
  status: ConnectorStagedAlertStatus;
  destination: string;
}

export interface ConnectorStagedAlertsResponse {
  alerts: ConnectorStagedAlert[];
  count: number;
  destination: string;
  persisted: boolean;
  note: string;
}

export interface ConnectorPromoteItemResult {
  id: number;
  status: string;
  error?: string;
  promotedIndex?: string;
  promotedDocId?: string;
}

/**
 * Promote writes labeled `connector-promoted` docs only
 * (`v3-hive-connector-promoted-*`) — never `v3-hive-alert-*`.
 */
export interface ConnectorPromoteResult {
  promoteBatchId: string;
  requested: number;
  promoted: number;
  failed: number;
  skipped: number;
  destinationIndex: string;
  indexType: string;
  documentKind: string;
  correlationStatus: string;
  note: string;
  results: ConnectorPromoteItemResult[];
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

  listStagedAlerts(
    instanceId: number,
    options?: { limit?: number; signal?: AbortSignal }
  ): Promise<ConnectorStagedAlertsResponse> {
    const limit = options?.limit ?? 50;
    return apiClient.get<ConnectorStagedAlertsResponse>(
      `/ha-connectors/instances/${instanceId}/staged-alerts`,
      { signal: options?.signal, params: { limit } }
    );
  },

  promoteStagedAlert(id: number): Promise<ConnectorPromoteResult> {
    return apiClient.post<ConnectorPromoteResult>(
      `/ha-connectors/staged-alerts/${id}/promote`,
      {}
    );
  },

  promoteStagedAlerts(ids: number[]): Promise<ConnectorPromoteResult> {
    return apiClient.post<ConnectorPromoteResult>('/ha-connectors/staged-alerts/promote', {
      ids,
    });
  },
};
