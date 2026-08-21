/**
 * dataSourceTypes.ts — DataSourceType enum display label mapping
 */

import type { DataSourceType } from '@/types/dataFilter.types';

export const DATA_SOURCE_TYPE_LABELS: Record<DataSourceType, string> = {
  SYSLOG: 'Syslog',
  WINDOWS_EVENT: 'Windows Event',
  LINUX_AUDIT: 'Linux Audit',
  AWS_CLOUDTRAIL: 'AWS CloudTrail',
  AZURE_MONITOR: 'Azure Monitor',
  GCP_LOGGING: 'GCP Logging',
  FIREWALL: 'Firewall',
  ENDPOINT_AGENT: 'Endpoint Agent',
  CUSTOM: 'Custom',
};

export function getDataSourceTypeLabel(dataSourceType: DataSourceType): string {
  return DATA_SOURCE_TYPE_LABELS[dataSourceType] ?? dataSourceType;
}
