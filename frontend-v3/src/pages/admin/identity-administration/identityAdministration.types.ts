export type IdentityAdministrationView = 'directory' | 'tenants' | 'access' | 'federation' | 'activity';

export type IdentityState = 'active' | 'inactive' | 'invited' | 'suspended' | 'unknown';

export interface IdentityPrincipal {
  readonly id: string;
  readonly login: string;
  readonly displayName: string;
  readonly email: string;
  readonly state: IdentityState;
  readonly source: 'local' | 'oidc' | 'scim' | 'unknown';
  readonly roles: readonly string[];
  readonly tenantCount: number | null;
  readonly mfaState: 'enforced' | 'registered' | 'not_registered' | 'unknown';
  readonly lastSignInAt: string | null;
  readonly createdAt: string | null;
  readonly modifiedAt: string | null;
  readonly reviewState: 'current' | 'due' | 'overdue' | 'not_configured' | 'unknown';
}

export interface AdminTenant {
  readonly id: string;
  readonly name: string;
  readonly prefix: string;
  readonly domain: string | null;
  readonly state: 'active' | 'suspended' | 'provisioning' | 'deprovisioned' | 'unknown';
  readonly administration: 'platform' | 'mssp' | 'tenant_local' | 'unknown';
  readonly members: number | null;
  readonly privilegedMembers: number | null;
  readonly identityProviders: number | null;
  readonly lastActivityAt: string | null;
  readonly licenceExpiresAt: string | null;
}

export interface FederationConnection {
  readonly id: string;
  readonly name: string;
  readonly protocol: 'OIDC' | 'SCIM';
  readonly state: 'enabled' | 'disabled' | 'not_configured' | 'unknown';
  readonly scope: string;
  readonly endpointLabel: string;
  readonly lastActivityAt: string | null;
  readonly owner: string | null;
  readonly secretState: 'protected' | 'not_configured' | 'unknown';
}

export interface AccessReview {
  readonly id: string;
  readonly name: string;
  readonly scope: string;
  readonly reviewer: string;
  readonly cadence: string;
  readonly dueAt: string;
  readonly decisionsComplete: number;
  readonly decisionsTotal: number;
  readonly state: 'active' | 'due' | 'overdue' | 'complete';
  readonly highPrivilege: boolean;
}

export interface IdentityAuditEvent {
  readonly id: string;
  readonly occurredAt: string;
  readonly actor: string;
  readonly action: string;
  readonly target: string;
  readonly scope: string;
  readonly result: 'success' | 'denied' | 'failed' | 'warning';
  readonly reason: string;
  readonly correlationId: string | null;
}

export interface IdentityAdministrationInventory {
  readonly users: readonly IdentityPrincipal[];
  readonly tenants: readonly AdminTenant[];
  readonly federation: readonly FederationConnection[];
  readonly reviews: readonly AccessReview[];
  readonly activity: readonly IdentityAuditEvent[];
  readonly totalUsers: number | null;
  readonly totalTenants: number | null;
  readonly privilegedUsers: number | null;
  readonly inactiveUsers: number | null;
  readonly reviewsDue: number | null;
  readonly snapshotAt: string;
  readonly bounded: boolean;
  readonly platformScoped: boolean;
  readonly partial: boolean;
  readonly warnings: readonly string[];
}

export type IdentitySelection =
  | { readonly kind: 'user'; readonly value: IdentityPrincipal }
  | { readonly kind: 'tenant'; readonly value: AdminTenant }
  | { readonly kind: 'federation'; readonly value: FederationConnection }
  | { readonly kind: 'review'; readonly value: AccessReview }
  | { readonly kind: 'activity'; readonly value: IdentityAuditEvent };
