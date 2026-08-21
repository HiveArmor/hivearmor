/**
 * Notifications Service — API client for notification rules (ADM-03)
 */

import { apiClient } from '@/lib/apiClient';
import type {
  CreateNotificationRuleRequest,
  NotificationRuleDTO,
  NotificationTestRequest,
  NotificationTestResult,
  UpdateNotificationRuleRequest,
} from '@/types/notification.types';

// TODO: confirm /api/ha-notification-rules endpoint exists

export async function getNotificationRules(): Promise<NotificationRuleDTO[]> {
  return apiClient.get<NotificationRuleDTO[]>('/ha-notification-rules');
}

export async function createNotificationRule(
  req: CreateNotificationRuleRequest
): Promise<NotificationRuleDTO> {
  return apiClient.post<NotificationRuleDTO>('/ha-notification-rules', req);
}

export async function updateNotificationRule(
  req: UpdateNotificationRuleRequest
): Promise<NotificationRuleDTO> {
  return apiClient.put<NotificationRuleDTO>(`/ha-notification-rules/${req.id}`, req);
}

export async function deleteNotificationRule(id: string): Promise<void> {
  return apiClient.delete<void>(`/ha-notification-rules/${id}`);
}

export async function testNotification(req: NotificationTestRequest): Promise<NotificationTestResult> {
  return apiClient.post<NotificationTestResult>('/ha-notification-rules/test', req);
}
