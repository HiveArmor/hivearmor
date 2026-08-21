/**
 * Alert Context Drawer Types
 */

import type { AlertStatus } from '@/constants/status.constants';

export interface AlertDetailDTO {
  id: string;
  severity: number; // mapped to label via src/lib/severity.ts
  timestamp: string;
  title: string;
  category: string;
  status: AlertStatus;
  adversary: AlertSideDTO | null;
  target: AlertSideDTO | null;
  tags: string[];
  ruleId: string | null;
  ruleName: string | null;
  rawFields: Record<string, string>; // observable key:value pairs
  // Sprint 13 — MITRE ATT&CK metadata fields (T01)
  mitreTacticId?: string;
  mitreTacticName?: string;
  mitreTechniqueId?: string;
  mitreTechniqueName?: string;
  mitreTechniqueUrl?: string;
  killChainPhase?: string;
  // Sprint 13 — Risk score and detection confidence (T02)
  riskScore?: number;
  confidence?: number;
  // Sprint 13 — Threat intelligence match fields (T03)
  threatIntelMatched?: boolean;
  threatIntelIndicatorType?: 'ip' | 'domain' | 'hash' | 'url' | 'email';
  threatIntelSource?: string;
  threatIntelTlp?: string;         // narrowed to a union in Sprint 19 (TlpBadge)
  threatIntelConfidence?: number;
  // Sprint 13 — MSSP/SLA/Asset/SOAR fields (T04)
  tenantId?: string;
  tenantName?: string;
  slaDeadline?: string;
  slaBreached?: boolean;
  assetId?: string;
  assetCriticality?: number;
  assetOwner?: string;
  soarPlaybookId?: string;
  soarExecutionStatus?: 'triggered' | 'running' | 'completed' | 'failed';
  // Sprint 18 — SOAR Response tab: playbook executions triggered for this alert
  playbookExecutions?: AlertPlaybookExecution[];
}

export interface AlertPlaybookExecution {
  executionId: string;
  playbookName: string;
  status: string;
}

export interface AlertSideDTO {
  ip: string | null;
  hostname: string | null;
  processName: string | null;
  username: string | null;
  networkIds: string[];
}

export interface RelatedAlertDTO {
  id: string;
  severity: number;
  title: string;
  timestamp: string;
}
