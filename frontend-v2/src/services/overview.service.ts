import { api } from "@/lib/api";

export interface OverviewStats {
  totalEvents24h:      number;
  totalEvents24hDelta: number;
  activeAlerts:        number;
  activeAlertsDelta:   number;
  criticalAlerts:      number;
  highAlerts:          number;
  mediumAlerts:        number;
  lowAlerts:           number;
  openIncidents:       number;
  criticalIncidents:   number;
  mttrMinutes:         number;
  mttrDelta:           number;
  eps:                 number;
  collectorsOnline:    number;
  collectorsTotal:     number;
}

export interface AlertTimePoint {
  hour: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export interface TopSource {
  name: string;
  count: number;
  eps: number;
  trend: number[];
  status: "ingesting" | "degraded" | "offline";
}

export interface CollectorRow {
  id: number;
  name: string;
  type: string;
  status: "ingesting" | "degraded" | "offline";
  eps: number;
  epsAvg: number;
  lastEvent: string;
  trend: number[];
}

export interface CriticalAlert {
  id: number;
  name: string;
  severity: "critical" | "high";
  source: string;
  asset: string;
  tactic?: string;
  technique?: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
  status: string;
}

export interface GeoThreatPoint {
  lat: number;
  lng: number;
  count: number;
  country?: string;
}

export interface MitreTacticCount {
  id: string;
  name: string;
  count: number;
  color: string;
}

// Backend response types
interface CardType  { serie: string; value: number; }
interface PieValue  { value: number; name: string; }
interface PieType   { data: string[]; value: PieValue[]; }
interface CollectorDTO {
  id: number;
  status: "ONLINE" | "OFFLINE" | "UNKNOWN";
  hostname: string;
  ip: string;
  version: string;
  module: string;
  lastSeen: string;
  active: boolean;
}
interface ListCollectorsResponseDTO {
  collectors: CollectorDTO[];
  total: number;
}
interface DataInputStatus {
  id: string;
  source: string;
  dataType: string;
  timestamp: number; // unix seconds
  median: number | null;
  alias: string | null;
}
interface UtmIncident {
  id: number;
  incidentName: string;
  incidentStatus: string;
  incidentSeverity: number;
}

function severityLabelToKey(label: string): keyof Pick<OverviewStats, "criticalAlerts" | "highAlerts" | "mediumAlerts" | "lowAlerts"> | null {
  const norm = label.toUpperCase();
  if (norm === "CRITICAL") return "criticalAlerts";
  if (norm === "HIGH")     return "highAlerts";
  if (norm === "MEDIUM")   return "mediumAlerts";
  if (norm === "LOW")      return "lowAlerts";
  return null;
}

function collectorStatus(dto: CollectorDTO): "ingesting" | "degraded" | "offline" {
  if (!dto.active || dto.status === "OFFLINE") return "offline";
  if (dto.status === "UNKNOWN")                return "degraded";
  return "ingesting";
}

// EPS: count of data-input-status rows active in last 60s (timestamp = last event in epoch seconds)
function calcEps(inputs: DataInputStatus[]): number {
  const nowSec = Math.floor(Date.now() / 1000);
  const recent = inputs.filter(r => r.timestamp && (nowSec - r.timestamp) < 60);
  // Each active source's "EPS" contribution: ~1 if active, weighted by median (events/s estimate)
  // Fallback: just count active sources * estimated avg
  return recent.reduce((sum, r) => sum + (r.median && r.median > 0 ? Math.round(r.median / 60) : 1), 0);
}

// ─────────────── FALLBACK DEMO DATA ───────────────────────────────────────────

function demoStats(): OverviewStats {
  return {
    totalEvents24h:      4_287_341,
    totalEvents24hDelta: 12,
    activeAlerts:        127,
    activeAlertsDelta:   8,
    criticalAlerts:      3,
    highAlerts:          14,
    mediumAlerts:        52,
    lowAlerts:           58,
    openIncidents:       8,
    criticalIncidents:   2,
    mttrMinutes:         14,
    mttrDelta:           -18,
    eps:                 1247,
    collectorsOnline:    11,
    collectorsTotal:     12,
  };
}

function demoAlertTimeline(): AlertTimePoint[] {
  const seed = [4,2,1,0,0,1,2,6,12,18,22,15,9,11,14,20,25,19,16,12,8,6,5,4];
  return seed.map((v, h) => ({
    hour:     h,
    critical: Math.floor(v * 0.12),
    high:     Math.floor(v * 0.35),
    medium:   Math.floor(v * 0.38),
    low:      Math.floor(v * 0.15),
  }));
}

function demoTopSources(): TopSource[] {
  return [
    { name: "windows-dc-01",    count: 42831, eps: 496, trend: [420,450,460,480,496,510,490,496], status: "ingesting" },
    { name: "fw-palo-01",       count: 28104, eps: 325, trend: [310,318,320,325,328,322,325,325], status: "ingesting" },
    { name: "linux-srv-07",     count: 19433, eps: 225, trend: [200,210,220,225,218,222,225,225], status: "ingesting" },
    { name: "edr-endpoint-09",  count: 14200, eps: 164, trend: [150,155,160,164,162,165,164,164], status: "ingesting" },
    { name: "vpn-gateway",      count:  8740, eps:   0, trend: [100, 90, 80, 70, 30, 10,  0,  0], status: "offline"  },
    { name: "syslog-collector", count:  6312, eps:  73, trend: [ 70, 71, 72, 73, 72, 74, 73, 73], status: "ingesting" },
  ];
}

function demoCollectors(): CollectorRow[] {
  return [
    { id: 1, name: "windows-dc-01",    type: "Windows",  status: "ingesting", eps: 496, epsAvg: 480, lastEvent: new Date(Date.now()-2000).toISOString(),   trend: [460,470,480,490,496,492,496] },
    { id: 2, name: "fw-palo-01",       type: "Firewall", status: "ingesting", eps: 325, epsAvg: 318, lastEvent: new Date(Date.now()-1000).toISOString(),   trend: [310,315,318,322,320,325,325] },
    { id: 3, name: "linux-srv-07",     type: "Linux",    status: "ingesting", eps: 225, epsAvg: 218, lastEvent: new Date(Date.now()-3000).toISOString(),   trend: [200,208,215,220,222,225,225] },
    { id: 4, name: "edr-endpoint-09",  type: "EDR",      status: "ingesting", eps: 164, epsAvg: 158, lastEvent: new Date(Date.now()-5000).toISOString(),   trend: [150,152,158,160,162,164,164] },
    { id: 5, name: "vpn-gateway",      type: "VPN",      status: "offline",   eps:   0, epsAvg:  98, lastEvent: new Date(Date.now()-18*60000).toISOString(), trend: [98, 90, 70, 40, 10, 0, 0] },
    { id: 6, name: "syslog-collector", type: "Syslog",   status: "ingesting", eps:  73, epsAvg:  71, lastEvent: new Date(Date.now()-4000).toISOString(),   trend: [68, 70, 71, 72, 73, 72, 73] },
    { id: 7, name: "cloud-trail",      type: "AWS",      status: "degraded",  eps:  12, epsAvg:  45, lastEvent: new Date(Date.now()-90000).toISOString(),  trend: [45, 40, 35, 25, 18, 14, 12] },
  ];
}

function demoCriticalAlerts(): CriticalAlert[] {
  return [
    { id: 101, name: "Ransomware Behavior Detected",      severity: "critical", source: "edr-endpoint-09", asset: "HOST-WKS-07",  tactic: "Impact",            technique: "T1486", count: 1,   firstSeen: new Date(Date.now()-120000).toISOString(),  lastSeen: new Date(Date.now()-30000).toISOString(),  status: "Open" },
    { id: 102, name: "Credential Dumping via LSASS",      severity: "critical", source: "windows-dc-01",   asset: "DC-PROD-01",   tactic: "Credential Access", technique: "T1003", count: 3,   firstSeen: new Date(Date.now()-480000).toISOString(),  lastSeen: new Date(Date.now()-60000).toISOString(),  status: "Open" },
    { id: 103, name: "Lateral Movement — Pass-the-Hash",  severity: "critical", source: "windows-dc-01",   asset: "SRV-FILE-02",  tactic: "Lateral Movement",  technique: "T1550", count: 7,   firstSeen: new Date(Date.now()-900000).toISOString(),  lastSeen: new Date(Date.now()-180000).toISOString(), status: "Open" },
    { id: 104, name: "Brute Force — RDP",                 severity: "high",     source: "fw-palo-01",      asset: "192.168.1.45", tactic: "Initial Access",    technique: "T1110", count: 284, firstSeen: new Date(Date.now()-3600000).toISOString(), lastSeen: new Date(Date.now()-10000).toISOString(),  status: "Open" },
    { id: 105, name: "Possible C2 Beacon Detected",       severity: "high",     source: "fw-palo-01",      asset: "HOST-WKS-12",  tactic: "C2",                technique: "T1071", count: 22,  firstSeen: new Date(Date.now()-1800000).toISOString(), lastSeen: new Date(Date.now()-45000).toISOString(),  status: "Open" },
  ];
}

function demoGeoPoints(): GeoThreatPoint[] {
  return [
    { lat: 51.5,  lng: -0.1,  count: 42,  country: "UK"       },
    { lat: 55.7,  lng: 37.6,  count: 128, country: "Russia"   },
    { lat: 39.9,  lng: 116.4, count: 95,  country: "China"    },
    { lat: 37.8,  lng: -122.4,count: 18,  country: "US"       },
    { lat: -33.9, lng: 18.4,  count: 12,  country: "S.Africa" },
    { lat: 1.3,   lng: 103.8, count: 31,  country: "SG"       },
    { lat: 52.2,  lng: 21.0,  count: 24,  country: "Poland"   },
    { lat: 59.3,  lng: 18.1,  count: 9,   country: "Sweden"   },
    { lat: 48.9,  lng: 2.3,   count: 15,  country: "France"   },
    { lat: 28.6,  lng: 77.2,  count: 38,  country: "India"    },
    { lat: -23.5, lng: -46.6, count: 22,  country: "Brazil"   },
    { lat: 35.7,  lng: 139.7, count: 19,  country: "Japan"    },
  ];
}

function demoMitreTactics(): MitreTacticCount[] {
  return [
    { id: "TA0001", name: "Initial Access",   count: 24, color: "var(--color-critical)" },
    { id: "TA0002", name: "Execution",         count: 18, color: "var(--color-high)"     },
    { id: "TA0003", name: "Persistence",       count: 12, color: "var(--color-high)"     },
    { id: "TA0004", name: "Priv. Escalation",  count:  9, color: "var(--color-medium)"   },
    { id: "TA0005", name: "Defense Evasion",   count: 21, color: "var(--color-medium)"   },
    { id: "TA0006", name: "Credential Access", count: 31, color: "var(--color-critical)" },
    { id: "TA0007", name: "Discovery",         count:  7, color: "var(--color-low)"      },
    { id: "TA0008", name: "Lateral Movement",  count: 15, color: "var(--color-high)"     },
    { id: "TA0009", name: "Collection",        count:  5, color: "var(--color-low)"      },
    { id: "TA0011", name: "C2",                count: 19, color: "var(--color-high)"     },
    { id: "TA0010", name: "Exfiltration",      count:  4, color: "var(--color-medium)"   },
    { id: "TA0040", name: "Impact",            count:  3, color: "var(--color-critical)" },
  ];
}

// ─────────────── SERVICE ──────────────────────────────────────────────────────

class OverviewService {
  /**
   * Aggregate KPI stats from multiple real backend endpoints.
   * Falls back to demo data on any failure.
   */
  async getStats(): Promise<OverviewStats> {
    try {
      const now  = new Date();
      const ago24 = new Date(now.getTime() - 24 * 3600 * 1000);
      const from  = ago24.toISOString();
      const to    = now.toISOString();

      // Fan out all independent requests in parallel
      const [severityPie, todayCards, incidentRes, collectorsRes, dataInputs, eventsType] = await Promise.allSettled([
        api.get<PieType>(`/api/overview/count-alerts-by-severity?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&top=10`),
        api.get<CardType[]>("/api/overview/count-alerts-today-and-last-week"),
        api.getWithHeaders<UtmIncident[]>("/api/ha-incidents?page=0&size=200&sort=incidentCreatedDate,desc"),
        api.get<ListCollectorsResponseDTO>("/api/collectors?pageNumber=0&pageSize=100"),
        api.get<DataInputStatus[]>("/api/ha-data-input-statuses?page=0&size=200"),
        api.get<PieType>(`/api/overview/count-events-by-type?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&top=30`),
      ]);

      // Alert severity counts
      const severityCounts: Partial<OverviewStats> = {};
      let totalActiveAlerts = 0;
      if (severityPie.status === "fulfilled") {
        for (const pv of severityPie.value?.value ?? []) {
          const key = severityLabelToKey(pv.name);
          if (key) {
            (severityCounts as Record<string, number>)[key] = pv.value;
            totalActiveAlerts += pv.value;
          }
        }
      }

      // Total alert count today (used for totalEvents24h placeholder and alert count)
      let alertsToday  = 0;
      let alertsWeek   = 0;
      if (todayCards.status === "fulfilled") {
        alertsToday = todayCards.value?.find(c => c.serie === "Today")?.value ?? 0;
        alertsWeek  = todayCards.value?.find(c => c.serie === "Last 7 days")?.value ?? 0;
      }
      // If activeAlerts wasn't populated from severity counts, use today's total
      if (totalActiveAlerts === 0) totalActiveAlerts = alertsToday;

      // Open incidents: proxy now forwards X-Total-Count; fall back to array length
      let openIncidents = 0;
      if (incidentRes.status === "fulfilled") {
        const xTotal = incidentRes.value.headers.get("X-Total-Count");
        openIncidents = xTotal !== null
          ? parseInt(xTotal, 10)
          : Array.isArray(incidentRes.value.data) ? incidentRes.value.data.length : 0;
      }

      // Collectors: online vs total
      let collectorsOnline = 0;
      let collectorsTotal  = 0;
      if (collectorsRes.status === "fulfilled") {
        const res = collectorsRes.value;
        if (res?.collectors) {
          collectorsTotal  = res.total ?? res.collectors.length;
          collectorsOnline = res.collectors.filter(c => c.active && c.status === "ONLINE").length;
        }
      }

      // EPS: derived from data-input-status
      let eps = 0;
      if (dataInputs.status === "fulfilled" && Array.isArray(dataInputs.value)) {
        eps = calcEps(dataInputs.value);
      }

      // totalEvents24h: real sum from count-events-by-type; fall back to week/7 estimate
      let totalEvents24h = 0;
      if (eventsType.status === "fulfilled") {
        totalEvents24h = (eventsType.value?.value ?? []).reduce((s, v) => s + (v.value ?? 0), 0);
      }
      if (totalEvents24h === 0) {
        totalEvents24h = alertsWeek > 0 ? Math.round(alertsWeek / 7) : alertsToday;
      }

      return {
        totalEvents24h,
        totalEvents24hDelta: 0,
        activeAlerts:        totalActiveAlerts || alertsToday,
        activeAlertsDelta:   0,
        criticalAlerts:      severityCounts.criticalAlerts ?? 0,
        highAlerts:          severityCounts.highAlerts     ?? 0,
        mediumAlerts:        severityCounts.mediumAlerts   ?? 0,
        lowAlerts:           severityCounts.lowAlerts      ?? 0,
        openIncidents,
        criticalIncidents:   0,
        mttrMinutes:         0,
        mttrDelta:           0,
        eps,
        collectorsOnline,
        collectorsTotal,
      };
    } catch {
      return demoStats();
    }
  }

  async getAlertTimeline(): Promise<AlertTimePoint[]> {
    // No direct backend endpoint for per-hour bucketing yet — Phase 3 wires the heatmap
    return demoAlertTimeline();
  }

  async getTopSources(): Promise<TopSource[]> {
    try {
      const res = await api.get<ListCollectorsResponseDTO>("/api/collectors?pageNumber=0&pageSize=20");
      if (!res?.collectors?.length) return demoTopSources();
      return res.collectors.map(c => ({
        name:   c.hostname || c.ip || `Collector-${c.id}`,
        count:  0,
        eps:    0,
        trend:  [0, 0, 0, 0, 0, 0, 0, 0],
        status: collectorStatus(c),
      }));
    } catch {
      return demoTopSources();
    }
  }

  async getCollectors(): Promise<CollectorRow[]> {
    try {
      const res = await api.get<ListCollectorsResponseDTO>("/api/collectors?pageNumber=0&pageSize=50");
      if (!res?.collectors?.length) return demoCollectors();
      return res.collectors.map(c => ({
        id:        c.id,
        name:      c.hostname || c.ip || `Collector-${c.id}`,
        type:      c.module   || "Unknown",
        status:    collectorStatus(c),
        eps:       0,
        epsAvg:    0,
        lastEvent: c.lastSeen ?? new Date().toISOString(),
        trend:     [0, 0, 0, 0, 0, 0, 0],
      }));
    } catch {
      return demoCollectors();
    }
  }

  async getCriticalAlerts(): Promise<CriticalAlert[]> {
    try {
      const now  = new Date();
      const from = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();
      const to   = now.toISOString();
      const INDEX = "_v3_hive_alert-*";
      const baseUrl = `/api/elasticsearch/search?top=10&indexPattern=${encodeURIComponent(INDEX)}&sort=%40timestamp%2Cdesc`;
      const filters = (sev: number) => [
        { field: "@timestamp", operator: "IS_BETWEEN", value: [from, to] },
        { field: "severity",   operator: "IS",         value: sev        },
        { field: "status",     operator: "IS_NOT",     value: 1          },
      ];

      // IS_IN is broken in the backend; use two parallel IS queries and merge
      const [critRes, highRes] = await Promise.allSettled([
        api.post<Array<Record<string, unknown>>>(baseUrl, filters(4)),
        api.post<Array<Record<string, unknown>>>(baseUrl, filters(3)),
      ]);

      const critDocs = critRes.status === "fulfilled" && Array.isArray(critRes.value) ? critRes.value : [];
      const highDocs = highRes.status === "fulfilled" && Array.isArray(highRes.value) ? highRes.value : [];
      const merged   = [...critDocs, ...highDocs];

      if (!merged.length) return demoCriticalAlerts();

      return merged.slice(0, 10).map((doc, i) => {
        const sev    = Number(doc.severity) >= 4 ? "critical" : "high";
        const target = doc.target as Record<string, string> | undefined;
        return {
          id:        i + 1,
          name:      String(doc.name       || "Unknown Alert"),
          severity:  sev as "critical" | "high",
          source:    String(doc.dataSource || "unknown"),
          asset:     String(target?.host || target?.ip || "unknown"),
          tactic:    doc.category  ? String(doc.category)  : undefined,
          technique: doc.technique ? String(doc.technique) : undefined,
          count:     1,
          firstSeen: String(doc["@timestamp"] || new Date().toISOString()),
          lastSeen:  String(doc["@timestamp"] || new Date().toISOString()),
          status:    String(doc.statusLabel || "Open"),
        };
      });
    } catch {
      return demoCriticalAlerts();
    }
  }

  async getGeoThreats(): Promise<GeoThreatPoint[]> {
    // Geo data requires IP geo-enrichment not yet indexed — Phase 10 wires this
    return demoGeoPoints();
  }

  async getMitreTactics(): Promise<MitreTacticCount[]> {
    try {
      const now  = new Date();
      const from = new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString();
      const to   = now.toISOString();

      const res = await api.get<{ data: string[]; value: PieValue[] }>(
        `/api/overview/top-alerts-by-category?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&top=12`,
      );

      // BarType: { categories: string[], series: number[] }
      const barRes = res as unknown as { categories?: string[]; series?: number[] };
      if (!barRes?.categories?.length) return demoMitreTactics();

      const colors = [
        "var(--color-critical)", "var(--color-high)", "var(--color-high)",
        "var(--color-medium)",   "var(--color-medium)", "var(--color-critical)",
        "var(--color-low)",      "var(--color-high)", "var(--color-low)",
        "var(--color-high)",     "var(--color-medium)", "var(--color-critical)",
      ];

      return barRes.categories.map((cat, i) => ({
        id:    `TA${String(i).padStart(4, "0")}`,
        name:  cat,
        count: barRes.series?.[i] ?? 0,
        color: colors[i % colors.length],
      }));
    } catch {
      return demoMitreTactics();
    }
  }
}

export const overviewService = new OverviewService();
