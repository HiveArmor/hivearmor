export interface AuditEvent {
  "@timestamp": string;
  type: string;
  message: string;
  source: string;
}

export interface AuditQueryParams {
  eventType?: string;
  actor?: string;
  from?: string;
  to?: string;
  page?: number;
  size?: number;
}

class AuditService {
  async getEvents(params: AuditQueryParams = {}): Promise<{ data: AuditEvent[]; total: number }> {
    const query = new URLSearchParams();
    if (params.eventType) query.set("eventType", params.eventType);
    if (params.actor)     query.set("actor", params.actor);
    if (params.from)      query.set("from", params.from);
    if (params.to)        query.set("to", params.to);
    query.set("page", String(params.page ?? 0));
    query.set("size", String(params.size ?? 50));

    const token = typeof window !== "undefined" ? localStorage.getItem("hivearmor_auth_token") : null;
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(`/api/ha-audit-events?${query.toString()}`, { headers });
    if (!res.ok) throw new Error(`Audit events fetch failed: ${res.status}`);

    const total = parseInt(res.headers.get("X-Total-Count") || "0", 10);
    const data: AuditEvent[] = await res.json();
    return { data, total };
  }
}

export const auditService = new AuditService();
