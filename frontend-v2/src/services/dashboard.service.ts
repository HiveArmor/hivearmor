import { api } from "@/lib/api";

export interface Dashboard {
  id: number;
  name: string;
  description?: string;
  filters?: string;
  refreshTime?: number;
  systemOwner?: boolean;
  createdDate?: string;
  modifiedDate?: string;
  userCreated?: string;
  userModified?: string;
  sidebarPinned?: boolean;
  sidebarOrder?: number;
}

export interface Visualization {
  id: number;
  name: string;
  chartType?: string;
  chartConfig?: string;
  idPattern?: number;
  description?: string;
  filterType?: unknown[];
  eventType?: string;
  modifiedDate?: string;
  systemOwner?: boolean;
  showTime?: boolean;
}

export interface DashboardVisualization {
  id: number;
  idDashboard: number;
  idVisualization: number;
  visualization: Visualization;
  dashboard?: Dashboard;
  gridInfo: string; // JSON: {cols, rows, x, y}
  height?: number;
  width?: number;
  order?: number;
  showTimeFilter?: boolean;
}

class DashboardService {
  // Dashboards
  async list(page = 0, size = 50, sort = "modifiedDate,desc", search?: string): Promise<{ content: Dashboard[]; total: number }> {
    try {
      const params = new URLSearchParams({ page: String(page), size: String(size), sort });
      if (search) params.set("name.contains", search);
      const res = await api.get<Dashboard[]>(`/api/ha-dashboards?${params.toString()}`);
      return { content: res || [], total: res?.length || 0 };
    } catch {
      return { content: [], total: 0 };
    }
  }

  async getById(id: number): Promise<Dashboard | null> {
    try { return await api.get<Dashboard>(`/api/ha-dashboards/${id}`); } catch { return null; }
  }

  async create(dashboard: Partial<Dashboard>): Promise<Dashboard | null> {
    try { return await api.post<Dashboard>("/api/ha-dashboards", dashboard); } catch { return null; }
  }

  async update(dashboard: Partial<Dashboard>): Promise<Dashboard | null> {
    try { return await api.put<Dashboard>("/api/ha-dashboards", dashboard); } catch { return null; }
  }

  async delete(id: number) { return api.delete(`/api/ha-dashboards/${id}`); }

  async listPinned(): Promise<Dashboard[]> {
    try {
      const res = await api.get<Dashboard[]>(
        "/api/ha-dashboards?sidebarPinned.equals=true&sort=sidebarOrder,asc&size=50"
      );
      return res || [];
    } catch {
      return [];
    }
  }

  async updateSidebarOrder(items: { id: number; sidebarOrder: number }[]): Promise<void> {
    try { await api.put("/api/ha-dashboards/sidebar-order", items); } catch { /* ignore */ }
  }

  // Dashboard Visualizations (get visualizations for a dashboard)
  async getVisualizationsForDashboard(dashboardId: number): Promise<DashboardVisualization[]> {
    try {
      const res = await api.get<DashboardVisualization[]>(
        `/api/ha-dashboard-visualizations?idDashboard.equals=${dashboardId}&size=10000&sort=order,asc`
      );
      return res || [];
    } catch {
      return [];
    }
  }

  // Visualizations
  async listVisualizations(page = 0, size = 50, sort = "modifiedDate,desc", search?: string): Promise<{ content: Visualization[]; total: number }> {
    try {
      const params = new URLSearchParams({ page: String(page), size: String(size), sort });
      if (search) params.set("name.contains", search);
      const res = await api.get<Visualization[]>(`/api/ha-visualizations?${params.toString()}`);
      return { content: res || [], total: res?.length || 0 };
    } catch {
      return { content: [], total: 0 };
    }
  }

  async deleteVisualization(id: number) { return api.delete(`/api/ha-visualizations/${id}`); }

  // Dashboard Visualization write methods
  async createDashboardVisualization(dv: Partial<DashboardVisualization>): Promise<DashboardVisualization | null> {
    try { return await api.post<DashboardVisualization>("/api/ha-dashboard-visualizations", dv); } catch { return null; }
  }

  async updateDashboardVisualization(dv: Partial<DashboardVisualization>): Promise<DashboardVisualization | null> {
    try { return await api.put<DashboardVisualization>("/api/ha-dashboard-visualizations", dv); } catch { return null; }
  }

  async deleteDashboardVisualization(id: number): Promise<void> {
    try { await api.delete(`/api/ha-dashboard-visualizations/${id}`); } catch { /* ignore */ }
  }

  async getDashboardVisualizationsByDashboard(dashboardId: number): Promise<DashboardVisualization[]> {
    return this.getVisualizationsForDashboard(dashboardId);
  }
}

export const dashboardService = new DashboardService();
