import { api } from "@/lib/api";

// ── Domain types ─────────────────────────────────────────────────────────────

export type AssetStatus = "NEW" | "CHECK" | string;
export type AssetRegisteredMode = "DYNAMIC" | "CUSTOM" | string;

export interface AssetPort {
  port: number;
  tcp?: string;
  udp?: string;
}

export interface AssetGroup {
  id: number;
  groupName: string;
  groupDescription?: string;
  createdDate?: string;
}

export interface NetworkScanAsset {
  id: number;
  assetIp?: string;
  assetName?: string;
  assetAlias?: string;
  assetAliases?: string;
  assetOs?: string;
  assetOsPlatform?: string;
  assetOsVersion?: string;
  assetOsArch?: string;
  assetOsMajorVersion?: string;
  assetOsMinorVersion?: string;
  assetMac?: string;
  assetAddresses?: string;
  assetAlive?: boolean;
  assetStatus?: AssetStatus;
  assetSeverityMetric?: number;
  registeredMode?: AssetRegisteredMode;
  discoveredAt?: string;
  modifiedAt?: string;
  assetNotes?: string;
  serverName?: string;
  isAgent?: boolean;
  ports?: AssetPort[];
  group?: AssetGroup;
  metrics?: Record<string, number>;
}

export interface AssetGroupDTO {
  id: number;
  groupName: string;
  groupDescription?: string;
  createdDate?: string;
  assetsCount: number;
  metrics?: Record<string, number>;
}

export interface NetworkScanFilter {
  assetIpMacName?: string;
  os?: string[];
  alive?: boolean[];
  status?: AssetStatus[];
  type?: string[];
  groups?: string[];
  openPorts?: number[];
  osPlatform?: string[];
}

export interface ScanListParams {
  page?: number;
  size?: number;
  assetIpMacName?: string;
  alive?: boolean;
  status?: AssetStatus;
}

export interface PagedResponse<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
}

// Derived KPI shape computed client-side from asset data
export interface ScanOverview {
  totalAssets: number;
  aliveAssets: number;
  newAssets: number;
  criticalAssets: number;
  lastDiscoveredAt: string | null;
}

class ScannerService {
  // ── Assets ────────────────────────────────────────────────────────────────

  async listAssets(params: ScanListParams = {}): Promise<{ assets: NetworkScanAsset[]; total: number }> {
    const { page = 0, size = 50, assetIpMacName, alive, status } = params;
    const qs = new URLSearchParams();
    qs.set("page", String(page));
    qs.set("size", String(size));
    qs.set("sort", "discoveredAt,desc");
    if (assetIpMacName) qs.set("assetName.contains", assetIpMacName);
    if (alive !== undefined) qs.set("assetAlive.equals", String(alive));
    if (status) qs.set("assetStatus.equals", status);

    try {
      const { data, headers } = await api.getWithHeaders<NetworkScanAsset[]>(
        `/api/ha-network-scans?${qs}`
      );
      const total = parseInt(headers.get("X-Total-Count") || "0", 10);
      return { assets: Array.isArray(data) ? data : [], total };
    } catch {
      return { assets: [], total: 0 };
    }
  }

  async searchAssetsByFilters(
    filters: NetworkScanFilter,
    page = 0,
    size = 50
  ): Promise<{ assets: NetworkScanAsset[]; total: number }> {
    const qs = new URLSearchParams();
    qs.set("page", String(page));
    qs.set("size", String(size));
    if (filters.assetIpMacName) qs.set("assetIpMacName", filters.assetIpMacName);
    if (filters.alive?.length) filters.alive.forEach(v => qs.append("alive", String(v)));
    if (filters.status?.length) filters.status.forEach(v => qs.append("status", v));
    if (filters.groups?.length) filters.groups.forEach(v => qs.append("groups", v));
    if (filters.osPlatform?.length) filters.osPlatform.forEach(v => qs.append("osPlatform", v));

    try {
      const { data, headers } = await api.getWithHeaders<NetworkScanAsset[]>(
        `/api/ha-network-scans/search-by-filters?${qs}`
      );
      const total = parseInt(headers.get("X-Total-Count") || "0", 10);
      return { assets: Array.isArray(data) ? data : [], total };
    } catch {
      return { assets: [], total: 0 };
    }
  }

  async getAsset(id: number): Promise<NetworkScanAsset | null> {
    try {
      return await api.get<NetworkScanAsset>(`/api/ha-network-scans/${id}`);
    } catch {
      return null;
    }
  }

  async countNewAssets(): Promise<number> {
    try {
      return (await api.get<number>("/api/ha-network-scans/countNewAssets")) ?? 0;
    } catch {
      return 0;
    }
  }

  async countAssets(filter?: Partial<{ "assetAlive.equals": string; "assetStatus.equals": string }>): Promise<number> {
    try {
      const qs = new URLSearchParams(filter as Record<string, string>);
      return (await api.get<number>(`/api/ha-network-scans/count?${qs}`)) ?? 0;
    } catch {
      return 0;
    }
  }

  async saveOrUpdateAsset(asset: Partial<NetworkScanAsset>): Promise<void> {
    await api.post<void>("/api/ha-network-scans/saveOrUpdateCustomAsset", asset);
  }

  async deleteAsset(id: number): Promise<void> {
    await api.delete<void>(`/api/ha-network-scans/deleteCustomAsset/${id}`);
  }

  // ── Asset Groups ──────────────────────────────────────────────────────────

  async listGroups(page = 0, size = 100): Promise<AssetGroupDTO[]> {
    try {
      const qs = new URLSearchParams({ page: String(page), size: String(size) });
      const { data } = await api.getWithHeaders<AssetGroupDTO[]>(
        `/api/ha-asset-groups/searchGroupsByFilter?${qs}`
      );
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  async createGroup(groupName: string, groupDescription?: string): Promise<AssetGroup> {
    return api.post<AssetGroup>("/api/ha-asset-groups", { groupName, groupDescription });
  }

  async deleteGroup(id: number): Promise<void> {
    await api.delete<void>(`/api/ha-asset-groups/${id}`);
  }

  async assignAssetsToGroup(assetsIds: number[], assetGroupId: number | null): Promise<void> {
    await api.put<void>("/api/ha-network-scans/updateGroup", { assetsIds, assetGroupId });
  }

  // ── Overview KPIs (derived from asset data) ───────────────────────────────

  async getOverview(): Promise<ScanOverview> {
    try {
      const [totalRes, aliveRes, newCount] = await Promise.all([
        this.listAssets({ page: 0, size: 1 }),
        this.listAssets({ page: 0, size: 1, alive: true }),
        this.countNewAssets(),
      ]);

      // Fetch a small page of assets to derive lastDiscoveredAt & critical count
      const { assets } = await this.listAssets({ page: 0, size: 50 });
      const critical = assets.filter(a => (a.assetSeverityMetric ?? 0) >= 7).length;
      const lastDiscoveredAt =
        assets.length > 0
          ? assets.reduce((latest, a) => {
              const t = a.discoveredAt ?? "";
              return t > latest ? t : latest;
            }, "")
          : null;

      return {
        totalAssets: totalRes.total,
        aliveAssets: aliveRes.total,
        newAssets: newCount,
        criticalAssets: critical,
        lastDiscoveredAt,
      };
    } catch {
      return { totalAssets: 0, aliveAssets: 0, newAssets: 0, criticalAssets: 0, lastDiscoveredAt: null };
    }
  }
}

export const scannerService = new ScannerService();
