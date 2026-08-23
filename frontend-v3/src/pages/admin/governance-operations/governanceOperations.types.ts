import type { SystemSettings } from '@/types/systemSettings.types';

export type GovernanceView = 'audit' | 'retention' | 'configuration' | 'changes' | 'lifecycle';
export type GovernanceState = 'healthy' | 'attention' | 'critical' | 'pending' | 'approved' | 'rejected' | 'failed' | 'unknown';

export interface GovernanceAuditEvent {
  readonly id: string;
  readonly occurredAt: string;
  readonly actor: string;
  readonly action: string;
  readonly resourceType: string | null;
  readonly resourceId: string | null;
  readonly details: string;
  readonly ipAddress: string | null;
  readonly result: GovernanceState;
  readonly correlationId: string | null;
  readonly scope: string;
  readonly payload: Record<string, unknown> | null;
}

export interface GovernanceRetentionPolicy {
  readonly id: string;
  readonly name: string;
  readonly dataType: string;
  readonly retentionDays: number;
  readonly compressionEnabled: boolean;
  readonly archiveTarget: string;
  readonly archivePath: string | null;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
  readonly sourceImmutable: boolean;
  readonly legalHoldCount: number | null;
  readonly estimatedVolume: string | null;
  readonly lifecycleState: GovernanceState;
}

export interface GovernanceChangeRequest {
  readonly id: string;
  readonly requestedAt: string;
  readonly requestedBy: string;
  readonly title: string;
  readonly category: 'configuration' | 'retention' | 'security' | 'ai' | 'migration';
  readonly scope: string;
  readonly risk: 'low' | 'medium' | 'high' | 'critical';
  readonly state: GovernanceState;
  readonly approvals: string;
  readonly window: string;
  readonly rollback: string;
  readonly version: string;
}

export interface ApiLifecycleEntry {
  readonly id: string;
  readonly surface: string;
  readonly status: 'current' | 'deprecated' | 'sunsetting' | 'unknown';
  readonly successor: string | null;
  readonly deprecatedAt: string | null;
  readonly sunsetAt: string | null;
  readonly consumers: number | null;
  readonly owner: string | null;
}

export interface GovernanceInventory {
  readonly audit: readonly GovernanceAuditEvent[];
  readonly retention: readonly GovernanceRetentionPolicy[];
  readonly settings: SystemSettings | null;
  readonly changes: readonly GovernanceChangeRequest[];
  readonly lifecycle: readonly ApiLifecycleEntry[];
  readonly snapshotAt: string;
  readonly auditTotal: number | null;
  readonly denied24h: number | null;
  readonly activeHolds: number | null;
  readonly pendingChanges: number | null;
  readonly configurationDrift: number | null;
  readonly deprecatedSurfaces: number | null;
  readonly bounded: boolean;
  readonly immutableAuditProven: boolean;
  readonly partial: boolean;
  readonly warnings: readonly string[];
}

export type GovernanceSelection =
  | { readonly kind: 'audit'; readonly value: GovernanceAuditEvent }
  | { readonly kind: 'retention'; readonly value: GovernanceRetentionPolicy }
  | { readonly kind: 'change'; readonly value: GovernanceChangeRequest }
  | { readonly kind: 'lifecycle'; readonly value: ApiLifecycleEntry };
