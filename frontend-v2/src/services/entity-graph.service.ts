import { api } from "@/lib/api";
import { EntityGraphDTO } from "@/types/alert";

class EntityGraphService {
  async getGraph(entityType: string, entityId: string, depth = 2): Promise<EntityGraphDTO | null> {
    try {
      const res = await api.get<EntityGraphDTO>(
        `/api/ha-entities/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}/graph?depth=${depth}`
      );
      return res;
    } catch {
      return null;
    }
  }
}

export const entityGraphService = new EntityGraphService();
