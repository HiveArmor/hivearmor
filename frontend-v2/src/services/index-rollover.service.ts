import { api } from "@/lib/api";

export interface RolloverPolicy {
  snapshotActive: boolean;
  deleteAfter: string;
}

export const indexRolloverService = {
  get(): Promise<RolloverPolicy> {
    return api.get<RolloverPolicy>("/api/index-policy/policy");
  },

  update(policy: RolloverPolicy): Promise<void> {
    return api.put<void>("/api/index-policy/policy", policy);
  },
};
