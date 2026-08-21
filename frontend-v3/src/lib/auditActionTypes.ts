/**
 * auditActionTypes.ts — AuditActionType display labels and badge styling
 */

import type { AuditActionType } from '@/types/auditLog.types';

export interface ActionTypeBadgeStyle {
  label: string;
  background: string;
  color: string;
}

export const AUDIT_ACTION_TYPE_STYLES: Record<string, ActionTypeBadgeStyle> = {
  ALERT_STATUS_CHANGE: {
    label: 'Alert Status',
    background: 'var(--ha-fill-medium-muted)',
    color: 'var(--ha-medium)',
  },
  INCIDENT_STATUS_CHANGE: {
    label: 'Incident',
    background: 'var(--ha-fill-intelligence-muted)',
    color: 'var(--ha-intelligence)',
  },
  USER_LOGIN: {
    label: 'Login',
    background: 'var(--ha-fill-low-muted)',
    color: 'var(--ha-positive)',
  },
  USER_LOGOUT: {
    label: 'Logout',
    background: 'transparent',
    color: 'var(--ha-text-secondary)',
  },
  USER_CREATED: {
    label: 'User Created',
    background: 'var(--ha-fill-primary-muted)',
    color: 'var(--ha-primary)',
  },
  USER_DEACTIVATED: {
    label: 'User Deactivated',
    background: 'var(--ha-fill-critical-subtle)',
    color: 'var(--ha-critical)',
  },
  AGENT_COMMAND: {
    label: 'Agent Command',
    background: 'var(--ha-fill-high-muted)',
    color: 'var(--ha-high)',
  },
  API_KEY_CREATED: {
    label: 'API Key',
    background: 'var(--ha-fill-primary-muted)',
    color: 'var(--ha-primary)',
  },
  API_KEY_REVOKED: {
    label: 'Key Revoked',
    background: 'var(--ha-fill-critical-subtle)',
    color: 'var(--ha-critical)',
  },
  SETTINGS_CHANGE: {
    label: 'Settings',
    background: 'var(--ha-fill-high-subtle)',
    color: 'var(--ha-high)',
  },
  RULE_CREATED: {
    label: 'Rule Created',
    background: 'var(--ha-fill-primary-muted)',
    color: 'var(--ha-primary)',
  },
  RULE_UPDATED: {
    label: 'Rule Updated',
    background: 'var(--ha-fill-medium-subtle)',
    color: 'var(--ha-medium)',
  },
  RULE_DELETED: {
    label: 'Rule Deleted',
    background: 'var(--ha-fill-critical-subtle)',
    color: 'var(--ha-critical)',
  },
  INTEGRATION_CHANGE: {
    label: 'Integration',
    background: 'var(--ha-fill-medium-subtle)',
    color: 'var(--ha-medium)',
  },
  RETENTION_CHANGE: {
    label: 'Retention',
    background: 'var(--ha-fill-high-subtle)',
    color: 'var(--ha-high)',
  },
};

export function getActionTypeStyle(actionType: AuditActionType): ActionTypeBadgeStyle {
  return (
    AUDIT_ACTION_TYPE_STYLES[actionType] ?? {
      label: actionType,
      background: 'transparent',
      color: 'var(--ha-text-secondary)',
    }
  );
}
