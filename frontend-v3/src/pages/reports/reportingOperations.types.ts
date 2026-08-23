export type ReportingView = 'generated' | 'scheduled' | 'templates';
export type OperationalReportType = 'SITREP' | 'INCIDENT' | 'AFTER_ACTION' | 'EXECUTIVE' | 'COMPLIANCE';
export type ReportLifecycleStatus = 'ready' | 'generating' | 'review' | 'failed' | 'expired';
export type DeliveryHealth = 'healthy' | 'warning' | 'failed' | 'not_configured';

export interface OperationalReport {
  id: string;
  title: string;
  type: OperationalReportType;
  status: ReportLifecycleStatus;
  classification: 'Internal' | 'Restricted' | 'Executive';
  scope: string;
  period: string;
  generatedAt?: string;
  generatedBy: string;
  version: number;
  format: 'PDF' | 'CSV' | 'JSON';
  evidenceCount: number;
  incidentCount: number;
  redactionProfile: string;
  approval: 'approved' | 'pending' | 'not_required';
  freshness: 'current' | 'stale' | 'unknown';
}

export interface ReportSchedule {
  id: string;
  title: string;
  type: OperationalReportType;
  cadence: string;
  timezone: string;
  recipients: string[];
  channels: Array<'email' | 'webhook' | 'archive'>;
  active: boolean;
  lastRunAt?: string;
  nextRunAt?: string;
  lastDurationMs?: number;
  deliveryHealth: DeliveryHealth;
  owner: string;
  runAs: string;
  format: 'PDF' | 'CSV' | 'JSON';
}

export interface ReportTemplate {
  id: string;
  name: string;
  type: OperationalReportType;
  description: string;
  version: number;
  owner: string;
  managed: boolean;
  sections: number;
  dataSources: number;
  redactionProfile: string;
  updatedAt: string;
  status: 'published' | 'draft' | 'retired';
}

export interface ReportingInventory {
  reports: OperationalReport[];
  schedules: ReportSchedule[];
  templates: ReportTemplate[];
  total: number;
  tenantScoped: boolean;
  bounded: boolean;
  snapshotAt: string;
  partial: boolean;
  warnings: string[];
}
