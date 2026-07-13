import { api } from "@/lib/api";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ReportTemplate {
  id: number;
  // Backend returns camelCase of DB column names (rep_name → repName, etc.)
  repName?: string;
  repDescription?: string;
  repModule?: string;
  repType?: string;
  repShortName?: string;
  repUrl?: string;
  // Aliases for backwards-compat with page.tsx field references
  reportName: string;
  reportDescription?: string;
  reportCategory?: string;
  reportFrequency?: string;
}

export interface ReportSection {
  id: number;
  reportSectionName: string;
  reportSectionDescription?: string;
  reportId: number;
}

/** Matches UtmComplianceReportExport entity */
export interface GeneratedReport {
  id: number;
  reportName: string;
  standard: string;
  status: string;       // "Pending" | "Completed" | "Failed"
  createdDate?: string;
  createdBy?: string;
  pdfPath?: string;
}

/** Matches UtmComplianceReportSchedule entity returned by the backend */
export interface ReportSchedule {
  id: number;
  complianceId: number;
  scheduleString: string;
  urlWithParams?: string;
  lastExecutionTime?: string;
  userId?: number;
  filters?: string;
}

/** Matches UtmComplianceReportSchedule entity — used when creating */
export interface ReportSchedulePayload {
  complianceId: number;
  scheduleString: string;   // cron expression
  urlWithParams: string;
  lastExecutionTime: string; // ISO instant required by @NotNull
}

// ─── Service ─────────────────────────────────────────────────────────────────

class ReportService {
  async getTemplates(): Promise<ReportTemplate[]> {
    try {
      const token = api.getToken();
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch("/api/ha-reports", { headers });
      if (!res.ok) return [];
      const data = await res.json();
      if (!Array.isArray(data)) return [];
      // Normalize backend camelCase (repName) to UI field names (reportName)
      return data.map((t: ReportTemplate) => ({
        ...t,
        reportName: t.reportName || t.repName || "",
        reportDescription: t.reportDescription || t.repDescription,
        reportCategory: t.reportCategory || t.repModule,
      }));
    } catch {
      return [];
    }
  }

  async getSections(reportId: number): Promise<ReportSection[]> {
    try {
      return await api.get<ReportSection[]>(`/api/ha-report-sections?reportId=${reportId}`);
    } catch {
      return [];
    }
  }

  /** GET /api/compliance-report-schedules-by-user */
  async getSchedules(): Promise<ReportSchedule[]> {
    try {
      const token = api.getToken();
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch("/api/compliance-report-schedules-by-user", { headers });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  /** POST /api/compliance-report-schedules */
  async createSchedule(payload: ReportSchedulePayload): Promise<ReportSchedule> {
    const result = await api.post<ReportSchedule>("/api/compliance-report-schedules", payload);
    return result;
  }

  /** DELETE /api/compliance-report-schedules/{id} */
  async deleteSchedule(id: number): Promise<void> {
    await api.delete(`/api/compliance-report-schedules/${id}`);
  }

  /** GET /api/ha-compliance-report-config */
  async getGeneratedReports(): Promise<GeneratedReport[]> {
    try {
      const token = api.getToken();
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch("/api/ha-compliance-report-config", { headers });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  /** POST /api/ha-compliance-report-config — backend expects { reportName, standard } */
  async generateReport(payload: { reportName: string; standard: string }): Promise<GeneratedReport> {
    return api.post<GeneratedReport>("/api/ha-compliance-report-config", payload);
  }

  /** GET /api/ha-compliance-report-config/{id}/export → blob download */
  async exportReport(id: number, fileName?: string): Promise<void> {
    const token = api.getToken();
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`/api/ha-compliance-report-config/${id}/export`, { headers });
    if (!res.ok) throw new Error("Export failed");

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const disposition = res.headers.get("Content-Disposition");
    const match = disposition?.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
    a.download = match?.[1]?.replace(/['"]/g, "") ?? fileName ?? `compliance-report-${id}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

export const reportService = new ReportService();
