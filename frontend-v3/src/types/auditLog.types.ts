/**
 * auditLog.types.ts — Audit Log types
 */

export type AuditActionType =
  | 'ALERT_STATUS_CHANGE'
  | 'INCIDENT_STATUS_CHANGE'
  | 'USER_LOGIN'
  | 'USER_LOGOUT'
  | 'USER_CREATED'
  | 'USER_DEACTIVATED'
  | 'AGENT_COMMAND'
  | 'API_KEY_CREATED'
  | 'API_KEY_REVOKED'
  | 'SETTINGS_CHANGE'
  | 'RULE_CREATED'
  | 'RULE_UPDATED'
  | 'RULE_DELETED'
  | 'INTEGRATION_CHANGE'
  | 'RETENTION_CHANGE'
  | string; // future action types must not crash the renderer

export interface AuditLogEntryDTO {
  id: number;
  timestamp: string; // ISO 8601
  actor: string; // user login
  actionType: AuditActionType;
  resourceType: string | null;
  resourceId: string | null;
  details: string; // human-readable summary
  ipAddress: string | null;
  payload: Record<string, unknown> | null; // full event payload (sensitive)
}
