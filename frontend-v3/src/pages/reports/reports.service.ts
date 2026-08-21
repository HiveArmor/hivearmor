/**
 * Reports Service
 * API calls for scheduled reports and report templates.
 */

import type {
  CreateReportDTO,
  CreateScheduledReportDTO,
  ReportDTO,
  ReportType,
  UpdateScheduledReportDTO,
  UtmReportDTO,
} from './reports.types';

import { apiClient } from '@/lib/apiClient';

// Generic Reports
export async function fetchReportsByType(type?: ReportType): Promise<ReportDTO[]> {
  const params = type ? { repType: type } : undefined;
  return apiClient.get<ReportDTO[]>('/ha-reports', { params });
}

export async function fetchReportById(id: number): Promise<ReportDTO> {
  return apiClient.get<ReportDTO>(`/ha-reports/${id}`);
}

export async function createReport(dto: CreateReportDTO): Promise<ReportDTO> {
  return apiClient.post<ReportDTO>('/ha-reports', dto);
}

export async function updateReport(id: number, dto: Partial<CreateReportDTO>): Promise<ReportDTO> {
  return apiClient.put<ReportDTO>('/ha-reports', { id, ...dto });
}

export async function deleteReport(id: number): Promise<void> {
  return apiClient.delete<void>(`/ha-reports/${id}`);
}

export async function countReports(type?: ReportType): Promise<number> {
  const params = type ? { repType: type } : undefined;
  return apiClient.get<number>('/ha-reports/count', { params });
}

// Scheduled Reports
export async function fetchScheduledReports(): Promise<UtmReportDTO[]> {
  return apiClient.get<UtmReportDTO[]>('/ha-reports/scheduled');
}

export async function createScheduledReport(dto: CreateScheduledReportDTO): Promise<UtmReportDTO> {
  return apiClient.post<UtmReportDTO>('/ha-reports/scheduled', dto);
}

export async function updateScheduledReport(id: number, dto: UpdateScheduledReportDTO): Promise<UtmReportDTO> {
  return apiClient.put<UtmReportDTO>(`/ha-reports/scheduled/${id}`, dto);
}

export async function deleteScheduledReport(id: number): Promise<void> {
  return apiClient.delete<void>(`/ha-reports/scheduled/${id}`);
}

export async function runScheduledReport(id: number): Promise<void> {
  return apiClient.post<void>(`/ha-reports/scheduled/${id}/run`);
}

export async function pauseScheduledReport(id: number): Promise<void> {
  return apiClient.patch<void>(`/ha-reports/scheduled/${id}/pause`);
}

export async function resumeScheduledReport(id: number): Promise<void> {
  return apiClient.patch<void>(`/ha-reports/scheduled/${id}/resume`);
}
