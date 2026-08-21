/**
 * Integration Types — Data source integrations (ADM-02)
 */

export interface IntegrationDTO {
  id: string;
  name: string;
  type: string;
  status: 'connected' | 'degraded' | 'disconnected' | 'pending';
  lastSeen?: string;
  eventsPerSecond?: number;
  tenantId?: number;
  config?: Record<string, string>;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateIntegrationRequest {
  name: string;
  type: string;
  config: Record<string, string>;
  tenantId?: number;
}

export interface UpdateIntegrationRequest extends CreateIntegrationRequest {
  id: string;
}

export interface IntegrationTestResult {
  success: boolean;
  message: string;
  latencyMs?: number;
}
