/**
 * Notification Types — Notification rules and channels (ADM-03)
 */

export interface NotificationRuleDTO {
  id: string;
  name: string;
  severityThreshold: number;
  destinationType: 'email' | 'webhook' | 'slack' | 'teams' | 'pagerduty';
  destinationConfig: Record<string, string>;
  enabled: boolean;
  createdAt?: string;
  updatedAt?: string;
  tenantId?: number;
}

export interface CreateNotificationRuleRequest {
  name: string;
  severityThreshold: number;
  destinationType: 'email' | 'webhook' | 'slack' | 'teams' | 'pagerduty';
  destinationConfig: Record<string, string>;
  enabled: boolean;
  tenantId?: number;
}

export interface UpdateNotificationRuleRequest extends CreateNotificationRuleRequest {
  id: string;
}

export interface NotificationTestRequest {
  destinationType: string;
  destinationConfig: Record<string, string>;
}

export interface NotificationTestResult {
  success: boolean;
  message: string;
}
