import { api } from "@/lib/api";

export interface UtmMenu {
  id?: number;
  name: string;
  url?: string;
  type?: number;
  menuIcon?: string;
  parentId?: number | null;
  position?: number;
  menuActive: boolean;
  menuAction?: boolean;
  dashboardId?: number;
  moduleNameShort?: string;
  authorities?: string[];
}

export const menuManagementService = {
  async list(): Promise<UtmMenu[]> {
    return (await api.get<UtmMenu[]>("/api/menu")) ?? [];
  },

  async getMenuTypes(): Promise<number[]> {
    return (await api.get<number[]>("/api/menu/all?includeModulesMenus=false")) ?? [];
  },

  async create(menu: UtmMenu): Promise<UtmMenu> {
    return api.post<UtmMenu>("/api/menu", menu);
  },

  async update(menu: UtmMenu): Promise<UtmMenu> {
    return api.put<UtmMenu>("/api/menu", menu);
  },

  async saveStructure(items: UtmMenu[]): Promise<void> {
    // Backend iterates menu.getChildrens() for items with parentId != null — must not be null
    const payload = items.map((item) => ({ ...item, childrens: [] }));
    await api.post("/api/menu/save-menu-structure", payload);
  },

  async delete(id: number): Promise<void> {
    await api.delete(`/api/menu/${id}`);
  },
};
