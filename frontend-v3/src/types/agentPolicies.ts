/**
 * Utm agent-policy plane (`/api/agent-policies`) — push SoT for agent schema v1.
 * Distinct from Ha EDR policies (`/api/ha-edr/policies`) which edit legacy columns only.
 * STAGING CANDIDATE — not a production-readiness claim.
 */

/** Agent-supported policy document version (mirrors agent `AgentPolicySchemaVersion`). */
export const AGENT_POLICY_SCHEMA_VERSION = 1 as const;

export type FimApplyMode = 'merge' | 'replace';

export interface FimWatchRule {
  path: string;
  recursive: boolean;
  exclude?: string[];
}

export interface FimPolicySection {
  mode?: FimApplyMode;
  rules?: FimWatchRule[];
}

export type CollectorKey =
  | 'fim'
  | 'dns'
  | 'netconn'
  | 'usb'
  | 'netflow'
  | 'syslog'
  | 'file';

export interface ResponsePolicySection {
  allow_shell: boolean;
}

/**
 * Forward-compatible agent policy JSON stored in `policyConfig`.
 * Unknown fields are ignored by the agent.
 */
export interface AgentPolicyDocument {
  schema_version: number;
  fim?: FimPolicySection;
  collectors?: Partial<Record<CollectorKey, boolean>>;
  response?: ResponsePolicySection;
}

/** REST DTO from GET/POST/PUT `/api/agent-policies`. */
export interface UtmAgentPolicyDTO {
  id?: number;
  policyName: string;
  description?: string | null;
  platform?: string | null;
  /** JSON string — prefer schema v1 via {@link AgentPolicyDocument}. */
  policyConfig?: string | null;
  versionNum?: number | null;
  isActive?: boolean | null;
  createdBy?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  assignedGroupIds?: number[] | null;
}

/** REST DTO from GET `/api/agent-groups` (Platform Administrator only today). */
export interface UtmAgentGroupDTO {
  id?: number;
  groupName: string;
  description?: string | null;
  platform?: string | null;
  createdBy?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  memberCount?: number;
  memberAgentIds?: number[] | null;
}

/** Push log row from GET `/api/agent-policies/{id}/push-log`. */
export interface PolicyPushLogDTO {
  id?: number;
  policyId?: number;
  policyName?: string | null;
  agentId?: string | null;
  pushedAt?: string | null;
  pushStatus?: string | null;
  errorMsg?: string | null;
  ackAt?: string | null;
}

/** Agent-reported state from GET `/api/agent-policies/{id}/states`. */
export interface UtmAgentPolicyStateDTO {
  id?: number;
  agentId?: string | null;
  policyId?: number | null;
  appliedVersion?: number | null;
  desiredVersion?: number | null;
  state?: string | null;
  lastCheckedAt?: string | null;
  lastAppliedAt?: string | null;
  driftDetails?: string | null;
}

/** Editor form values used to build schema v1 `policyConfig`. */
export interface AgentFimPolicyFormValues {
  policyName: string;
  description: string;
  platform: string;
  isActive: boolean;
  fimMode: FimApplyMode;
  rules: FimWatchRule[];
  allowShell: boolean;
  collectors: Partial<Record<CollectorKey, boolean>>;
}
