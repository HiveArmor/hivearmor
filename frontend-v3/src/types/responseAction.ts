/**
 * HiveArmor SOAR Response Action types.
 * Sprint 18 — T03 · frontend-v3/src/types/responseAction.ts
 */

export type ActionParamType = 'string' | 'integer' | 'text' | 'select' | 'boolean';

export type ResponseActionRisk = 'critical' | 'high' | 'medium' | 'low' | 'unknown';
export type ResponseIntegrationStatus = 'healthy' | 'degraded' | 'unavailable' | 'unknown';

export interface ResponseActionParam {
  name: string;
  type: ActionParamType;
  required: boolean;
  description?: string | null;
  defaultValue: string | number | boolean | null;
  options: string[] | null;
}

export interface ResponseAction {
  id: string;
  name: string;
  category: string;
  description: string;
  params: ResponseActionParam[];
  usageCount: number;
  targetType?: string | null;
  integrationStatus?: ResponseIntegrationStatus;
  riskLevel?: ResponseActionRisk;
  requiredRole?: string | null;
  /** Reported only when the canonical action catalog supports it. */
  integrationName?: string | null;
  requiresApproval?: boolean | null;
  rollbackSupported?: boolean | null;
  outputs?: Array<{ name: string; type: string; description?: string | null }>;
}
