/**
 * retention.types.ts — Data Retention Policy types
 */

export type DataType =
  | 'ALERT'
  | 'INCIDENT'
  | 'AUDIT'
  | 'AUTH_LOG'
  | 'NETWORK_FLOW'
  | 'ENDPOINT_EVENT'
  | 'VULNERABILITY'
  | 'COMPLIANCE'
  | 'CUSTOM';

export type ArchiveTarget = 'NONE' | 'S3' | 'LOCAL';

export interface RetentionPolicyDTO {
  id: number;
  name: string;
  dataType: DataType;
  retentionDays: number; // 1–3650 (1 day to 10 years)
  compressionEnabled: boolean;
  archiveTarget: ArchiveTarget;
  archivePath: string | null; // S3 bucket path or local path; null if archiveTarget is NONE
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}
