import { api } from "@/lib/api";

export interface IocResult {
  value: string;
  type: "ip" | "domain" | "hash" | "url" | "email";
  firstSeen: string;
  lastSeen: string;
  threatScore: number;
  classification: string;
  description: string;
  country?: string;
  asn?: string;
  tags: string[];
  sourceFeds: Array<{ name: string; confidence: number; reportedAt: string }>;
  mitreTechniques: Array<{ id: string; name: string; tactic: string }>;
  relatedIocs: Array<{ value: string; type: "ip" | "domain" | "hash" | "url" | "email"; threatScore: number }>;
  alertCount: number;
}

export interface ThreatFeed {
  id: string;
  name: string;
  type: string;
  source: string;
  lastUpdated: string;
  iocCount: number;
  status: "active" | "paused" | "error";
  enabled: boolean;
  description: string;
}

class ThreatIntelService {
  async lookupIoc(value: string): Promise<IocResult | null> {
    try {
      return await api.get<IocResult>(
        `/api/v1/threat-intel/ioc?value=${encodeURIComponent(value)}`
      );
    } catch (err: unknown) {
      if (err instanceof Error && err.message === "Not Found") return null;
      // api.request throws on non-2xx; 404 from Spring comes back as an error
      // Treat any network/not-found error as null (IOC not in DB)
      const status = (err as { status?: number })?.status;
      if (status === 404) return null;
      throw err;
    }
  }

  async getFeeds(): Promise<ThreatFeed[]> {
    return api.get<ThreatFeed[]>("/api/v1/threat-intel/feeds");
  }

  async toggleFeed(id: string, enabled: boolean): Promise<ThreatFeed> {
    return api.put<ThreatFeed>(`/api/v1/threat-intel/feeds/${id}`, { enabled });
  }

  async syncFeed(id: string): Promise<ThreatFeed> {
    return api.post<ThreatFeed>(`/api/v1/threat-intel/feeds/${id}/sync`, {});
  }
}

export const threatIntelService = new ThreatIntelService();
