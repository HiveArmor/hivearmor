/**
 * dataFilter.types.ts — Data Parsing Filter types
 */

export type DataSourceType =
  | 'SYSLOG'
  | 'WINDOWS_EVENT'
  | 'LINUX_AUDIT'
  | 'AWS_CLOUDTRAIL'
  | 'AZURE_MONITOR'
  | 'GCP_LOGGING'
  | 'FIREWALL'
  | 'ENDPOINT_AGENT'
  | 'CUSTOM';

export interface DataFilterDTO {
  id: number;
  name: string;
  dataSourceType: DataSourceType;
  filterDefinition: string; // YAML string; the filter definition content
  active: boolean;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}
