import { api } from "@/lib/api";

export interface MenuPayload {
  name: string;
  url: string;
  dashboardId?: number;
  menuActive: boolean;
  menuAction: boolean;
  position?: number;
  type?: number;
  menuIcon?: string;
  parentId?: number;
}

class MenuService {
  async create(payload: MenuPayload): Promise<unknown> {
    try {
      return await api.post("/api/menu", payload);
    } catch (error) {
      console.error("Failed to create menu item:", error);
      return null;
    }
  }

  async deleteByUrl(url: string): Promise<void> {
    try {
      await api.delete(`/api/menu/delete-by-url?url=${encodeURIComponent(url)}`);
    } catch {
      // Ignore — menu item may not exist
    }
  }
}

export const menuService = new MenuService();
