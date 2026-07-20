export enum AlertStatus {
  AUTOMATIC_REVIEW = 1,
  OPEN = 2,
  IN_REVIEW = 3,
  IGNORED = 4,
  COMPLETED = 5,
}

export enum AlertSeverity {
  LOW = 1,
  MEDIUM = 2,
  HIGH = 3,
  CRITICAL = 4,
}

export interface AlertHost {
  user?: string;
  host?: string;
  ip?: string;
  port?: number;
  country?: string;
  countryCode?: string;
  city?: string;
  coordinates?: number[];
  asn?: number;
  aso?: string;
}

export interface AlertTarget {
  ip?: string;
  host?: string;
  user?: string;
  file?: string;
  url?: string;
  domain?: string;
  bytesSent?: string;
  geolocation?: {
    asn?: string;
    aso?: string;
    city?: string;
    country?: string;
    countryCode?: string;
    latitude?: number;
    longitude?: number;
  };
}

export interface IncidentDetail {
  createdBy?: string;
  creationDate?: string;
  incidentId?: string;
  incidentName?: string;
  incidentObservation?: string;
  incidentSource?: string;
}

export interface AlertImpact {
  availability?: number;
  confidentiality?: number;
  integrity?: number;
}

export interface GraphNode {
  id: string;
  type: string;
  label: string;
  properties?: Record<string, unknown>;
}

export interface GraphEdge {
  source: string;
  target: string;
  relation: string;
}

export interface EntityGraphDTO {
  nodes: GraphNode[];
  edges: GraphEdge[];
  alertCount: number;
}

export interface UtmAlert {
  id: string;
  name: string;
  description?: string;
  category?: string;
  severity: number;
  severityLabel: string;
  status: AlertStatus;
  statusLabel?: string;
  statusObservation?: string;
  timestamp: string;
  protocol?: string;
  dataType?: string;
  dataSource?: string;
  source?: AlertHost;
  destination?: AlertHost;
  target?: AlertTarget;
  adversary?: AlertTarget;
  impact?: AlertImpact;
  technique?: string;
  tactic?: string;
  solution?: string;
  reference?: string[];
  logs?: string[];
  events?: Record<string, unknown>[];
  tags?: string[];
  notes?: string;
  tagRulesApplied?: number[];
  isIncident?: boolean;
  incidentDetail?: IncidentDetail;
  parentId?: string;
  hasChildren?: boolean;
  echoes?: number;
  last_echo?: string;
  assetGroupName?: string;
  // graph context — populated by event-processor enrichment
  sourceIpRiskScore?: number;
  sourceIpMalicious?: boolean;
  sourceIpCountry?: string;
  relatedUsers?: string[];
  relatedHosts?: string[];
  recentAlertCount?: number;
}

export interface AlertTag {
  id: number;
  tagName: string;
  tagColor: string;
  systemOwner?: boolean;
}

export interface SocAiResponse {
  status: "queued" | "Processing" | "Completed" | "Error" | "error";
  alertId?: string | number;
  message?: string;
  classification?: string;
  reasoning?: string[];
  nextSteps?: { action: string; details: string }[];
}

export interface TriageResult {
  id: number;
  alertId: string;
  classification?: string;
  confidenceScore?: number;
  reasoning?: string;  // JSON string: string[]
  nextSteps?: string;  // JSON string: {action,details}[]
  modelVersion?: string;
  analyzedAt: string;
  requestedBy?: string;
  status: "PENDING" | "COMPLETED" | "FAILED";
}

export type SeverityLevel = "critical" | "high" | "medium" | "low" | "info";

// Backend severity: 4=critical, 3=high, 2=medium, 1=low
export function severityToLevel(s: number): SeverityLevel {
  if (s >= 4) return "critical";
  if (s >= 3) return "high";
  if (s >= 2) return "medium";
  if (s >= 1) return "low";
  return "info";
}

export function statusToLabel(status: AlertStatus): string {
  switch (status) {
    case AlertStatus.AUTOMATIC_REVIEW: return "Auto Review";
    case AlertStatus.OPEN: return "Open";
    case AlertStatus.IN_REVIEW: return "In Review";
    case AlertStatus.IGNORED: return "Ignored";
    case AlertStatus.COMPLETED: return "Completed";
    default: return "Unknown";
  }
}

export function statusToColor(status: AlertStatus): string {
  switch (status) {
    case AlertStatus.OPEN: return "text-severity-low";
    case AlertStatus.IN_REVIEW: return "text-info";
    case AlertStatus.COMPLETED: return "text-brand";
    case AlertStatus.IGNORED: return "text-warning";
    default: return "text-muted";
  }
}
