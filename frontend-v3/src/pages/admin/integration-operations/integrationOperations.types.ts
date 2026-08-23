import type { HaApiKeyRecord } from '@/types/apiKey.types';

export type IntegrationView = 'overview' | 'connectors' | 'delivery' | 'access' | 'activity';
export type IntegrationState = 'healthy' | 'degraded' | 'offline' | 'unconfigured' | 'not_reported';
export type ConnectorRole = 'ingest' | 'response' | 'bidirectional' | 'notification';

export interface IntegrationConnector {
  id: string;
  name: string;
  vendor: string;
  kind: string;
  role: ConnectorRole;
  state: IntegrationState;
  stateLabel: string;
  version: string | null;
  environment: string;
  endpointLabel: string;
  credentialAlias: string | null;
  owner: string | null;
  support: string;
  lastObservedAt: string | null;
  lastSuccessAt: string | null;
  latencyMs: number | null;
  operations24h: number | null;
  failures24h: number | null;
  capabilities: string[];
  evidence: string;
}

export interface DeliveryDestination {
  id: string;
  name: string;
  channelType: 'email' | 'webhook' | 'slack' | 'teams' | 'pagerduty' | 'other';
  state: IntegrationState;
  stateLabel: string;
  credentialAlias: string | null;
  endpointLabel: string;
  routes: number;
  delivered24h: number | null;
  failed24h: number | null;
  lastTestedAt: string | null;
  lastTestReceipt: string | null;
  secretProtected: boolean | null;
}

export interface DeliveryRoute {
  id: string;
  name: string;
  destinationId: string;
  destinationName: string;
  enabled: boolean;
  minimumSeverity: string;
  sources: string[];
  eventTypes: string[];
  throttleMinutes: number | null;
  escalation: string | null;
  lastFiredAt: string | null;
}

export interface IntegrationActivity {
  id: string;
  occurredAt: string;
  category: 'connector' | 'delivery' | 'credential' | 'configuration';
  operation: string;
  target: string;
  result: 'success' | 'warning' | 'failed';
  durationMs: number | null;
  actor: string;
  correlationId: string | null;
  detail: string;
}

export interface IntegrationOperationsInventory {
  connectors: IntegrationConnector[];
  destinations: DeliveryDestination[];
  routes: DeliveryRoute[];
  keys: HaApiKeyRecord[];
  activity: IntegrationActivity[];
  snapshotAt: string;
  bounded: boolean;
  tenantScoped: boolean;
  partial: boolean;
  warnings: string[];
}
