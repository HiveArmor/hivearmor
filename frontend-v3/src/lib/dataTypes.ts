/**
 * dataTypes.ts — DataType enum display label mapping
 */

import type { DataType } from '@/types/retention.types';

export const DATA_TYPE_LABELS: Record<DataType, string> = {
  ALERT: 'Alerts',
  INCIDENT: 'Incidents',
  AUDIT: 'Audit Logs',
  AUTH_LOG: 'Auth Logs',
  NETWORK_FLOW: 'Network Flows',
  ENDPOINT_EVENT: 'Endpoint Events',
  VULNERABILITY: 'Vulnerabilities',
  COMPLIANCE: 'Compliance',
  CUSTOM: 'Custom',
};

export function getDataTypeLabel(dataType: DataType): string {
  return DATA_TYPE_LABELS[dataType] ?? dataType;
}
