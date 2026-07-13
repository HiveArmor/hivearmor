import { api } from "@/lib/api";

const BASE = "/api/opensearch";

export interface IndexInfo {
  index: string;
  health: "green" | "yellow" | "red";
  status: "open" | "close";
  pri: string;
  rep: string;
  "docs.count": string;
  "store.size": string;
  "creation.date.string": string;
}

export interface ClusterHealth {
  cluster_name: string;
  status: "green" | "yellow" | "red";
  number_of_nodes: number;
  number_of_data_nodes: number;
  active_primary_shards: number;
  active_shards: number;
  relocating_shards: number;
  initializing_shards: number;
  unassigned_shards: number;
}

export interface ClusterStats {
  _nodes: { total: number; successful: number; failed: number };
  cluster_name: string;
  status: string;
  indices: {
    count: number;
    docs: { count: number; deleted: number };
    store: { size_in_bytes: number };
    shards: { total: number; primaries: number };
  };
  nodes: {
    count: { total: number };
    os: { mem: { total_in_bytes: number; free_in_bytes: number } };
    jvm: { mem: { heap_used_in_bytes: number; heap_max_in_bytes: number } };
  };
}

export interface IndexTemplate {
  name: string;
  index_template: {
    index_patterns: string[];
    priority?: number;
    template?: {
      settings?: Record<string, unknown>;
      mappings?: Record<string, unknown>;
    };
  };
}

export interface IsmPolicy {
  _id: string;
  _seq_no: number;
  _primary_term: number;
  policy: {
    policy_id: string;
    description?: string;
    default_state: string;
    states: unknown[];
  };
}

export interface SnapshotRepository {
  [name: string]: {
    type: string;
    settings: Record<string, string>;
  };
}

export interface Snapshot {
  snapshot: string;
  uuid: string;
  version_id: number;
  version: string;
  state: string;
  start_time: string;
  end_time?: string;
  duration_in_millis?: number;
  indices: string[];
  shards?: { total: number; failed: number; successful: number };
}

class OpenSearchManagementService {
  private async raw<T>(path: string): Promise<T> {
    const res = await api.get<T>(path);
    return res;
  }

  // Cluster
  async getClusterHealth(): Promise<ClusterHealth> {
    return this.raw<ClusterHealth>(`${BASE}/cluster/health`);
  }

  async getClusterStats(): Promise<ClusterStats> {
    return this.raw<ClusterStats>(`${BASE}/cluster/stats`);
  }

  // Indices
  async listIndices(pattern = ""): Promise<IndexInfo[]> {
    const q = pattern ? `?pattern=${encodeURIComponent(pattern)}` : "";
    return this.raw<IndexInfo[]>(`${BASE}/indices${q}`);
  }

  async getIndexSettings(index: string): Promise<Record<string, unknown>> {
    return this.raw<Record<string, unknown>>(`${BASE}/indices/${index}/settings`);
  }

  async getIndexMappings(index: string): Promise<Record<string, unknown>> {
    return this.raw<Record<string, unknown>>(`${BASE}/indices/${index}/mappings`);
  }

  async deleteIndex(index: string): Promise<void> {
    await api.delete(`${BASE}/indices/${index}`);
  }

  async forceMerge(index: string): Promise<void> {
    await api.post(`${BASE}/indices/${index}/forcemerge`, {});
  }

  async refreshIndex(index: string): Promise<void> {
    await api.post(`${BASE}/indices/${index}/refresh`, {});
  }

  // Templates
  async listTemplates(): Promise<{ index_templates: IndexTemplate[] }> {
    return this.raw<{ index_templates: IndexTemplate[] }>(`${BASE}/templates`);
  }

  async getTemplate(name: string): Promise<{ index_templates: IndexTemplate[] }> {
    return this.raw<{ index_templates: IndexTemplate[] }>(`${BASE}/templates/${name}`);
  }

  async upsertTemplate(name: string, body: unknown): Promise<void> {
    await api.put(`${BASE}/templates/${name}`, body);
  }

  async deleteTemplate(name: string): Promise<void> {
    await api.delete(`${BASE}/templates/${name}`);
  }

  // ISM Policies
  async listIsmPolicies(): Promise<{ policies: IsmPolicy[] }> {
    return this.raw<{ policies: IsmPolicy[] }>(`${BASE}/ism/policies`);
  }

  async getIsmPolicy(id: string): Promise<IsmPolicy> {
    return this.raw<IsmPolicy>(`${BASE}/ism/policies/${id}`);
  }

  async explainIsmState(index: string): Promise<Record<string, unknown>> {
    return this.raw<Record<string, unknown>>(`${BASE}/ism/explain/${index}`);
  }

  // Snapshots
  async listRepositories(): Promise<SnapshotRepository> {
    return this.raw<SnapshotRepository>(`${BASE}/snapshots/repositories`);
  }

  async listSnapshots(repository: string): Promise<{ snapshots: Snapshot[] }> {
    return this.raw<{ snapshots: Snapshot[] }>(`${BASE}/snapshots/${repository}`);
  }

  async createSnapshot(repository: string, snapshot: string, body?: unknown): Promise<void> {
    await api.post(`${BASE}/snapshots/${repository}/${snapshot}`, body ?? {});
  }

  async deleteSnapshot(repository: string, snapshot: string): Promise<void> {
    await api.delete(`${BASE}/snapshots/${repository}/${snapshot}`);
  }

  async restoreSnapshot(repository: string, snapshot: string, body?: unknown): Promise<void> {
    await api.post(`${BASE}/snapshots/${repository}/${snapshot}/restore`, body ?? {});
  }
}

export const opensearchService = new OpenSearchManagementService();
