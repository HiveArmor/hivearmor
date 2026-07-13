import { api } from "@/lib/api";

// ── Types ──────────────────────────────────────────────────────────────────

export interface UtmModuleGroupConf {
  id?: number;
  groupId: number;
  confKey: string;
  confValue: string;
  confName?: string;
  confDescription?: string;
  confDataType?: string;
  confRequired?: boolean;
  confOptions?: string;
  confVisibility?: string;
}

export interface UtmModuleGroup {
  id: number;
  groupName: string;
  groupDescription?: string;
  moduleId: number;
  moduleGroupConfigurations: UtmModuleGroupConf[];
}

export interface UtmModule {
  id: number;
  moduleName: string;
  prettyName?: string;
  moduleActive?: boolean;
  moduleCategory?: string;
  moduleDescription?: string;
  moduleIcon?: string;
  serverId?: number;
  configGroups?: UtmModuleGroup[];
}

// ── Service ────────────────────────────────────────────────────────────────

class ModuleService {
  /** Find the module ID for a given module name (e.g. "SOC_AI"). */
  async getModuleByName(moduleName: string): Promise<UtmModule | null> {
    try {
      const res = await api.get<UtmModule[]>(
        `/api/ha-modules?moduleName.equals=${moduleName}&page=0&size=1`
      );
      return res?.[0] ?? null;
    } catch {
      return null;
    }
  }

  /** Get all groups (with nested config rows) for a module. */
  async getGroups(moduleId: number): Promise<UtmModuleGroup[]> {
    try {
      const res = await api.get<UtmModuleGroup[]>(
        `/api/ha-configuration-groups/module-groups?moduleId=${moduleId}`
      );
      return res ?? [];
    } catch {
      return [];
    }
  }

  /** Create a config group for a module, which seeds the default key rows. */
  async createGroup(moduleId: number, name = "default", description = ""): Promise<UtmModuleGroup> {
    return api.post<UtmModuleGroup>("/api/ha-configuration-groups", {
      moduleId,
      groupName: name,
      groupDescription: description,
    });
  }

  /**
   * Bulk-update config key-value rows for a module.
   * Unchanged password fields whose value is still masked should be sent as-is;
   * the backend will skip them if the value hasn't changed.
   */
  async saveConfig(moduleId: number, keys: UtmModuleGroupConf[]): Promise<void> {
    await api.put("/api/module-group-configurations/update", { moduleId, keys });
  }

  /** Activate or deactivate a module. */
  async setActive(moduleId: number, serverId: number, active: boolean): Promise<void> {
    await api.put("/api/ha-modules/activateDeactivate", {
      id: moduleId,
      serverId,
      moduleActive: active,
    });
  }
}

export const moduleService = new ModuleService();
