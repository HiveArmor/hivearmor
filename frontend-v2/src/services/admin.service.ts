import { api } from "@/lib/api";

export interface User {
  id: number;
  login: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  activated: boolean;
  authorities: string[];
  createdDate?: string;
  lastModifiedDate?: string;
}

export interface ConfigSection {
  id: number;
  section: string;
  description?: string;
  shortName?: string;
  parameters?: ConfigParameter[];
}

export interface ConfigParameter {
  id: number;
  sectionId: number;
  confParamShort: string;
  confParamLarge?: string;
  confParamValue?: string;
  confParamRequired?: boolean;
  confParamDescription?: string;
  confParamDatatype?: string;
  confParamRegexp?: string;
  confParamOption?: string;
  section?: { id: number; section: string };
}

class AdminService {
  // Users
  async listUsers(page = 0, size = 50): Promise<{ content: User[]; total: number }> {
    try {
      const res = await api.get<User[]>(`/api/users?page=${page}&size=${size}`);
      return { content: res || [], total: res?.length || 0 };
    } catch {
      return { content: [], total: 0 };
    }
  }

  async createUser(user: Partial<User>) { return api.post("/api/users", user); }
  async updateUser(user: Partial<User>) { return api.put("/api/users", user); }
  async deleteUser(login: string) { return api.delete(`/api/users/${login}`); }
  async activateUser(login: string) { return api.put(`/api/users/${login}/activate`, {}); }
  async deactivateUser(login: string) { return api.put(`/api/users/${login}/deactivate`, {}); }

  // Configuration
  async getConfigSections(): Promise<ConfigSection[]> {
    try {
      const sections = await api.get<ConfigSection[]>("/api/ha-configuration-sections?page=0&size=100") || [];
      const withParams = await Promise.all(
        sections.map(async (s) => {
          try {
            const params = await api.get<ConfigParameter[]>(
              `/api/ha-configuration-parameters?sectionId.equals=${s.id}&page=0&size=200`
            ) || [];
            return { ...s, parameters: params };
          } catch {
            return { ...s, parameters: [] };
          }
        })
      );
      return withParams;
    } catch { return []; }
  }

  async updateConfigParam(param: ConfigParameter) {
    return api.put("/api/ha-configuration-parameters", [param]);
  }

  // Notifications
  async getNotificationSettings(): Promise<ConfigSection | null> {
    try {
      const sections = await this.getConfigSections();
      return sections.find(s => s.section?.toLowerCase().includes("email") || s.section?.toLowerCase().includes("smtp")) || null;
    } catch { return null; }
  }
}

export const adminService = new AdminService();
