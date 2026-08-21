/**
 * Reports Types
 * Types for scheduled reports and report templates.
 */

export type ReportType = 'SITREP' | 'INCIDENT' | 'AFTER_ACTION' | 'TEMPLATE' | 'CUSTOM_PDF' | 'CUSTOM_LIST';
export type ReportStatus = 'PENDING' | 'GENERATING' | 'COMPLETED' | 'FAILED';

export interface ReportDTO {
  id: number;
  repName: string;
  repDescription: string | null;
  repType: ReportType;
  repUrl: string | null;
  creationDate: string;
  modificationDate: string | null;
  creationUser: string;
  modificationUser: string | null;
  reportSectionId: number | null;
  dashboardId: number | null;
  repModule: string | null;
  repShortName: string | null;
  repHttpMethod: string | null;
}

export interface CreateReportDTO {
  repName: string;
  repDescription: string | null;
  repType: ReportType;
  reportSectionId?: number | null;
  dashboardId?: number | null;
  repModule?: string | null;
}

export interface UtmReportDTO {
  id: number;
  name: string;
  description: string | null;
  type: string;
  createdAt: string;
  schedule: string;
  lastRun: string | null;
  nextRun: string | null;
  recipients: string[];
  format: 'PDF' | 'CSV' | 'JSON';
  active: boolean;
}

export interface CreateScheduledReportDTO {
  name: string;
  description: string | null;
  type: string;
  schedule: string;
  recipients: string[];
  format: 'PDF' | 'CSV' | 'JSON';
}

export interface UpdateScheduledReportDTO extends CreateScheduledReportDTO {
  active: boolean;
}
