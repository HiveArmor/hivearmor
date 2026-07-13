import { api } from "@/lib/api";

// Shapes returned by /api/ha-auditor-users-by-src
export interface ADUserAttribute {
  id: number;
  attributeKey: string;
  attributeValue: string;
  createdDate?: string;
  modifiedDate?: string;
}

export interface ADUserSource {
  id: number;
  indexPattern?: string;
  indexName?: string;
  isActive?: boolean;
}

export interface ADUserRaw {
  name: string;
  sid: string;
  source?: ADUserSource;
  attributes?: ADUserAttribute[];
}

// Normalised shape used by the page
export interface AdUser {
  id: string;
  username: string;
  displayName: string;
  email: string;
  department: string;
  riskScore: number;
  lastLogin: string;
  status: "active" | "locked" | "disabled";
  groups: string[];
}

// Shapes returned by /api/winlogbeat-info-by-filter (raw ES doc maps)
export type WinlogbeatDoc = Record<string, unknown>;

export interface AdLoginEvent {
  id: string;
  username: string;
  sourceIp: string;
  timestamp: string;
  success: boolean;
  anomaly: boolean;
  anomalyReason?: string;
  domain: string;
  workstation: string;
}

// Derived overview from user list
export interface AdOverview {
  totalUsers: number;
  activeUsers: number;
  lockedUsers: number;
  failedLoginsLast24h: number;
  anomaliesDetected: number;
  privilegedAccounts: number;
}

export interface AdReport {
  id: number;
  name: string;
  type: string;
  schedule: string;
  lastRun: string;
  nextRun: string;
  status: "pending" | "running" | "completed" | "failed";
}

// Pull a named attribute value out of the attributes array
function attr(raw: ADUserRaw, key: string): string {
  return raw.attributes?.find(a => a.attributeKey === key)?.attributeValue ?? "";
}

function mapUser(raw: ADUserRaw, index: number): AdUser {
  const statusRaw = attr(raw, "userAccountControl") || attr(raw, "status") || "active";
  const statusLower = statusRaw.toLowerCase();
  const status: AdUser["status"] =
    statusLower.includes("lock") ? "locked" :
    statusLower.includes("disab") ? "disabled" : "active";

  const groupsRaw = attr(raw, "memberOf");
  const groups = groupsRaw
    ? groupsRaw.split(";").map(g => g.trim()).filter(Boolean)
    : [];

  return {
    id: raw.sid || String(index),
    username: raw.name || "",
    displayName: attr(raw, "displayName") || raw.name || "",
    email: attr(raw, "mail") || attr(raw, "email") || "",
    department: attr(raw, "department") || "",
    riskScore: 0,
    lastLogin: attr(raw, "lastLogon") || attr(raw, "lastLogonTimestamp") || "",
    status,
    groups,
  };
}

function mapEvent(doc: WinlogbeatDoc, index: number): AdLoginEvent {
  const evId = (doc["_id"] ?? doc["id"] ?? String(index)) as string;
  const ts = (doc["@timestamp"] ?? doc["timestamp"] ?? "") as string;
  const winlog = (doc["winlog"] ?? {}) as Record<string, unknown>;
  const eventData = (winlog["event_data"] ?? {}) as Record<string, unknown>;
  const system = (winlog["computer_name"] ?? doc["host.name"] ?? "") as string;
  const eventId = Number(winlog["event_id"] ?? doc["event.code"] ?? 0);
  // Logon events: 4624=success, 4625=failure, 4740=lockout, 4648=explicit logon
  const success = eventId === 4624 || eventId === 4648;
  const anomaly = eventId === 4740 || eventId === 4776; // lockout or NTLM
  return {
    id: String(evId),
    username: String(eventData["TargetUserName"] ?? doc["user.name"] ?? (winlog["user"] as Record<string, unknown> | undefined)?.["name"] ?? ""),
    sourceIp: String(eventData["IpAddress"] ?? doc["source.ip"] ?? ""),
    timestamp: String(ts),
    success,
    anomaly,
    anomalyReason: anomaly ? (eventId === 4740 ? "Account locked — too many failures" : "NTLM authentication") : undefined,
    domain: String(eventData["TargetDomainName"] ?? eventData["WorkstationName"] ?? ""),
    workstation: String(system),
  };
}

class ActiveDirectoryService {
  async listUsers(params: {
    sourceId?: number;
    page?: number;
    size?: number;
  } = {}): Promise<{ data: AdUser[]; total: number }> {
    const q = new URLSearchParams();
    q.set("page", String(params.page ?? 0));
    q.set("size", String(params.size ?? 25));
    q.set("sort", "name,asc");
    if (params.sourceId !== undefined) q.set("id", String(params.sourceId));

    try {
      const { data, headers } = await api.getWithHeaders<ADUserRaw[]>(
        `/api/ha-auditor-users-by-src?${q}`
      );
      const rows = Array.isArray(data) ? data : [];
      const total = parseInt(headers.get("x-total-count") ?? String(rows.length), 10);
      return { data: rows.map(mapUser), total };
    } catch {
      return { data: [], total: 0 };
    }
  }

  // Derive overview stats from a user page + total count.
  // Active/locked counts are extrapolated proportionally from the current page sample.
  deriveOverview(users: AdUser[], total: number): AdOverview {
    const activeUsers = users.filter(u => u.status === "active").length;
    const lockedUsers = users.filter(u => u.status === "locked").length;
    const ratio = total > 0 && users.length > 0 ? total / users.length : 1;
    return {
      totalUsers: total,
      activeUsers: Math.round(activeUsers * ratio),
      lockedUsers: Math.round(lockedUsers * ratio),
      failedLoginsLast24h: 0,
      anomaliesDetected: 0,
      privilegedAccounts: 0,
    };
  }

  async listEvents(params: {
    sid?: string;
    from?: string;
    to?: string;
    indexPattern?: string;
    sort?: string;
    page?: number;
    size?: number;
  } = {}): Promise<{ data: AdLoginEvent[]; total: number }> {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const q = new URLSearchParams({
      sid: params.sid ?? "",
      from: params.from ?? yesterday.toISOString(),
      to: params.to ?? now.toISOString(),
      indexPattern: params.indexPattern ?? "winlogbeat-*",
      sort: params.sort ?? "@timestamp,desc",
      page: String(params.page ?? 0),
      size: String(params.size ?? 25),
    });

    try {
      const { data, headers } = await api.getWithHeaders<WinlogbeatDoc[]>(
        `/api/winlogbeat-info-by-filter?${q}`
      );
      const rows = Array.isArray(data) ? data : [];
      const total = parseInt(headers.get("x-total-count") ?? String(rows.length), 10);
      return { data: rows.map(mapEvent), total };
    } catch {
      return { data: [], total: 0 };
    }
  }
}

export const activeDirectoryService = new ActiveDirectoryService();
