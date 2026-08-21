import type { AlertSlaState } from './alertTriage.types';

import type { SeverityLevel } from '@/lib/severity';

export type SeverityBoardScope = 'active' | 'all';
export type SeverityBoardOwnership = 'all' | 'mine' | 'unassigned';
export type SeverityBoardAlertStatus = 'open' | 'in_review' | 'true_positive' | 'false_positive' | 'benign_positive' | 'closed';

export interface SeverityBoardFilters {
  from: string;
  to: string;
  scope: SeverityBoardScope;
  ownership: SeverityBoardOwnership;
}

export interface SeverityBoardAlert {
  id: string;
  title: string;
  summary: string | null;
  severity: SeverityLevel;
  riskScore: number | null;
  confidence: number | null;
  detectedAt: string;
  status: SeverityBoardAlertStatus;
  statusLabel: string;
  category: string | null;
  primaryEntity: { type: string; label: string } | null;
  assigneeName: string | null;
  slaStatus: AlertSlaState;
  threatIntelMatched: boolean;
  relatedAlertCount: number;
  mitreTechniqueId: string | null;
  tenantName: string | null;
  tags: string[];
}

export interface SeverityBoardLane {
  severity: SeverityLevel;
  count: number;
  activeCount: number;
  slaPressure: number;
  unassigned: number;
  alerts: SeverityBoardAlert[];
}

export interface SeverityTrendBucket {
  start: string;
  end: string;
  label: string;
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
}

export interface SeverityBoardOverview {
  total: number;
  active: number;
  criticalOpen: number;
  needsTriage: number;
  slaPressure: number;
  unassigned: number;
  threatIntelMatched: number;
  highestRisk: number | null;
}

export interface SeverityBoardResponse {
  overview: SeverityBoardOverview;
  lanes: SeverityBoardLane[];
  trend: SeverityTrendBucket[];
  snapshotAt: string;
  totalApproximate: boolean;
  dataCompleteness: 'complete' | 'projection';
}
