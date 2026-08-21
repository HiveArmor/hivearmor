/**
 * Stable fictional SOAR/Response data used only by the authenticated foundation fixture build.
 *
 * Enabled only when:  import.meta.env.DEV && import.meta.env.VITE_USE_FOUNDATION_FIXTURES === 'true'
 *
 * Every function exported from this module is for fixture injection only — never call them from
 * production routes.  The service layer gates them behind the fixtureMode check.
 *
 * All names, IPs, hostnames, and account identifiers are entirely fictional.
 */

import type {
  PlaybookListItem,
  PlaybookCategory,
  PlaybookDTO,
  PlaybookNodeDTO,
  PlaybookEdgeDTO,
  PlaybookStatus,
  TriggerType,
  PlaybookRunStatus,
  ResponseActivityDTO,
  ActivityStepDTO,
  ResponseActivityStatus,
  ActionCatalogEntry,
  ActionCatalogSummary,
  ActionCategory,
  QuarantineRecord,
  QuarantineStatus,
  ApprovalRecord,
  ApprovalStatus,
  PlaybookMetricsSummary,
  PlaybookPreviewResponse,
  PlaybookListParams,
  ResponseActivityListParams,
  ResponseActivityPageResult,
  ResponseExecutionTraceResult,
  ResponseApprovalDecisionRequest,
  ResponseApprovalListParams,
  ResponseApprovalRequest,
  ResponseAuthorityDelegate,
  ResponseAuthorityDelegateSaveRequest,
  ResponseAuthorityPolicy,
  ResponseAuthorityPolicySaveRequest,
  ResponseGovernanceResult,
  CursorPageResult,
} from './response.types';

// ─── Seed data ────────────────────────────────────────────────────────────────

const analysts = ['Maya Chen', 'Omar Haddad', 'Elena Rossi', 'James Okafor', 'SOAR Automation'];

const playbookSeeds: Array<{
  name: string;
  description: string;
  category: PlaybookCategory;
  trigger: TriggerType;
  approvalRequired: boolean;
  riskLevel: 'HIGH' | 'MEDIUM' | 'LOW';
}> = [
  {
    name: 'Host Isolation — Endpoint Compromise',
    description:
      'Isolates an endpoint via EDR, notifies the incident owner, creates a linked case, and schedules an artifact collection job.',
    category: 'EDR',
    trigger: 'AUTOMATIC',
    approvalRequired: true,
    riskLevel: 'HIGH',
  },
  {
    name: 'Account Suspension — Credential Theft',
    description:
      'Disables the compromised account in Active Directory, revokes all active sessions, resets MFA enrollment, and pages the identity owner.',
    category: 'Identity',
    trigger: 'AUTOMATIC',
    approvalRequired: true,
    riskLevel: 'HIGH',
  },
  {
    name: 'Network Block — C2 Destination',
    description:
      'Pushes a deny rule to the perimeter firewall for the discovered C2 destination, updates the threat-intel block list, and notifies the SOC channel.',
    category: 'Network',
    trigger: 'AUTOMATIC',
    approvalRequired: false,
    riskLevel: 'MEDIUM',
  },
  {
    name: 'Enrichment — IP Reputation Lookup',
    description:
      'Queries VirusTotal, Shodan, and the internal threat-intel feed for the alert source IP. Updates alert tags with risk score and geo data.',
    category: 'Enrichment',
    trigger: 'AUTOMATIC',
    approvalRequired: false,
    riskLevel: 'LOW',
  },
  {
    name: 'ServiceNow Incident — High Severity Alert',
    description:
      'Creates a linked ServiceNow incident, assigns it to the on-call resolver group, and synchronises severity and status bidirectionally.',
    category: 'Ticketing',
    trigger: 'MANUAL',
    approvalRequired: false,
    riskLevel: 'LOW',
  },
  {
    name: 'Cloud Role Revocation — Privilege Escalation',
    description:
      'Removes elevated IAM role bindings from the implicated principal, logs the change to the cloud SIEM account, and triggers a posture re-scan.',
    category: 'Cloud',
    trigger: 'AUTOMATIC',
    approvalRequired: true,
    riskLevel: 'HIGH',
  },
  {
    name: 'Slack Notification — Critical Alert Digest',
    description:
      'Posts a formatted alert summary to the designated #soc-critical Slack channel and mentions the current on-call analyst.',
    category: 'Notification',
    trigger: 'AUTOMATIC',
    approvalRequired: false,
    riskLevel: 'LOW',
  },
  {
    name: 'Process Termination — Malicious Execution',
    description:
      'Terminates the identified malicious process, captures a memory dump for forensic review, and quarantines the parent executable.',
    category: 'EDR',
    trigger: 'AUTOMATIC',
    approvalRequired: false,
    riskLevel: 'MEDIUM',
  },
  {
    name: 'Password Reset — Brute Force Detection',
    description:
      'Forces a password reset for the targeted account, triggers a step-up MFA challenge, and records the event in the audit trail.',
    category: 'Identity',
    trigger: 'MANUAL',
    approvalRequired: false,
    riskLevel: 'MEDIUM',
  },
  {
    name: 'DNS Sinkhole — Domain Block',
    description:
      'Adds the suspicious domain to the internal DNS sinkhole, propagates the block to all recursive resolvers, and logs the request to investigation notes.',
    category: 'Network',
    trigger: 'MANUAL',
    approvalRequired: false,
    riskLevel: 'MEDIUM',
  },
  {
    name: 'Alert Enrichment — User Risk Scoring',
    description:
      'Calculates a composite risk score from recent authentication events, privilege usage, and peer-group deviations. Updates the alert entity risk field.',
    category: 'Enrichment',
    trigger: 'AUTOMATIC',
    approvalRequired: false,
    riskLevel: 'LOW',
  },
  {
    name: 'Full Response — Ransomware Containment',
    description:
      'Orchestrates host isolation, lateral-movement network blocks, AD account suspension, executive notification, and evidence collection in a coordinated sequence.',
    category: 'Multi-step',
    trigger: 'MANUAL',
    approvalRequired: true,
    riskLevel: 'HIGH',
  },
];

const runStatusCycle: PlaybookRunStatus[] = [
  'success',
  'success',
  'success',
  'success',
  'failure',
  'success',
  'success',
  'success',
  'awaiting_approval',
  'cancelled',
];

const activityStatusCycle: ResponseActivityStatus[] = [
  'SUCCESS',
  'SUCCESS',
  'RUNNING',
  'FAILED',
  'SUCCESS',
  'AWAITING_APPROVAL',
  'PARTIAL',
  'CANCELLED',
  'BLOCKED',
  'QUEUED',
];

// ─── Playbook list items ──────────────────────────────────────────────────────

export const foundationPlaybookListItems: PlaybookListItem[] = playbookSeeds.map((seed, index) => {
  const status: PlaybookStatus = index % 8 === 5 ? 'INACTIVE' : index % 8 === 7 ? 'DRAFT' : 'ACTIVE';
  const lastRunOffset = index % 5;
  return {
    id: String(index + 1),
    name: seed.name,
    description: seed.description,
    status,
    triggerType: seed.trigger,
    category: seed.category,
    runCount: status === 'DRAFT' ? 0 : 12 + index * 7,
    lastRunAt:
      status === 'DRAFT'
        ? null
        : `2026-08-0${3 - lastRunOffset < 1 ? 1 : 3 - lastRunOffset}T${String(14 - index).padStart(2, '0')}:${String(((index * 13) % 60)).padStart(2, '0')}:00Z`,
    lastRunStatus: status === 'DRAFT' ? null : runStatusCycle[index % runStatusCycle.length],
    approvalRequired: seed.approvalRequired,
    createdBy: analysts[index % analysts.length],
    updatedAt: `2026-07-${String(28 - (index % 10)).padStart(2, '0')}T10:00:00Z`,
  };
});

// ─── Playbook detail DTOs ─────────────────────────────────────────────────────

function buildPlaybookNodes(index: number): PlaybookNodeDTO[] {
  const nodes: PlaybookNodeDTO[] = [
    {
      id: `${index}-trigger`,
      type: 'TRIGGER',
      position: { x: 200, y: 20 },
      data: {
        label: 'Alert trigger',
        triggerType: playbookSeeds[index].trigger,
        filter: 'severity >= 3',
      },
    },
    {
      id: `${index}-enrich`,
      type: 'ACTION',
      position: { x: 200, y: 150 },
      data: {
        label: 'Enrich alert',
        actionId: 'enrichment.ip_lookup',
        paramValues: { fields: ['source.ip', 'destination.ip'] },
      },
    },
    {
      id: `${index}-condition`,
      type: 'CONDITION',
      position: { x: 200, y: 280 },
      data: {
        label: 'Risk score ≥ 80?',
        cel: 'threat.score >= 80',
      },
    },
    {
      id: `${index}-action-high`,
      type: 'ACTION',
      position: { x: 60, y: 410 },
      data: {
        label: 'Isolate host',
        actionId: 'edr.isolate_host',
        paramValues: { notifyOwner: true },
      },
    },
    {
      id: `${index}-action-low`,
      type: 'ACTION',
      position: { x: 340, y: 410 },
      data: {
        label: 'Create ticket',
        actionId: 'ticketing.create_incident',
        paramValues: { severity: 'medium', queue: 'soc-l2' },
      },
    },
    {
      id: `${index}-notify`,
      type: 'ACTION',
      position: { x: 200, y: 540 },
      data: {
        label: 'Notify on-call',
        actionId: 'notification.slack_message',
        paramValues: { channel: '#soc-critical' },
      },
    },
    {
      id: `${index}-end`,
      type: 'END',
      position: { x: 200, y: 670 },
      data: { label: 'Complete' },
    },
  ];
  return nodes;
}

function buildPlaybookEdges(index: number): PlaybookEdgeDTO[] {
  return [
    { id: `${index}-e1`, source: `${index}-trigger`, target: `${index}-enrich` },
    { id: `${index}-e2`, source: `${index}-enrich`, target: `${index}-condition` },
    { id: `${index}-e3`, source: `${index}-condition`, target: `${index}-action-high`, label: 'Yes' },
    { id: `${index}-e4`, source: `${index}-condition`, target: `${index}-action-low`, label: 'No' },
    { id: `${index}-e5`, source: `${index}-action-high`, target: `${index}-notify` },
    { id: `${index}-e6`, source: `${index}-action-low`, target: `${index}-notify` },
    { id: `${index}-e7`, source: `${index}-notify`, target: `${index}-end` },
  ];
}

export const foundationPlaybooks: PlaybookDTO[] = playbookSeeds.map((seed, index) => ({
  id: `pb-${1000 + index}`,
  name: seed.name,
  description: seed.description,
  status: foundationPlaybookListItems[index].status,
  triggerType: seed.trigger,
  executionCount: foundationPlaybookListItems[index].runCount,
  lastExecutedAt: foundationPlaybookListItems[index].lastRunAt ?? undefined,
  nodes: buildPlaybookNodes(index),
  edges: buildPlaybookEdges(index),
}));

// ─── Response activity log ────────────────────────────────────────────────────

const stepTemplates: Array<Omit<ActivityStepDTO, 'id'>> = [
  {
    actionName: 'IP Reputation Lookup',
    status: 'success',
    resultSummary: 'Risk score 94/100. 3 threat-intel sources confirmed malicious.',
    durationMs: 812,
  },
  {
    actionName: 'Host Isolation',
    status: 'success',
    resultSummary: 'EDR isolation applied to FIN-WKS-044. Network access removed.',
    durationMs: 1450,
  },
  {
    actionName: 'Slack Notification',
    status: 'success',
    resultSummary: 'Alert posted to #soc-critical. On-call analyst notified.',
    durationMs: 312,
  },
  {
    actionName: 'Create ServiceNow Ticket',
    status: 'success',
    resultSummary: 'INC0087432 created and assigned to SOC-L2 resolver group.',
    durationMs: 678,
  },
  {
    actionName: 'Account Suspension',
    status: 'error',
    resultSummary: undefined,
    errorMessage: 'AD connector timeout after 5000ms. Account suspension did not complete.',
    durationMs: 5042,
  },
  {
    actionName: 'Domain Sinkhole Push',
    status: 'success',
    resultSummary: 'Block rule propagated to 4 recursive resolvers.',
    durationMs: 924,
  },
  {
    actionName: 'Risk Score Update',
    status: 'skipped',
    resultSummary: 'Skipped — entity risk already at maximum (100).',
    durationMs: 40,
  },
];

const alertIds = [
  'ALT-20240401-00177',
  'ALT-20240401-00183',
  'ALT-20240401-00201',
  'ALT-20240402-00014',
  'ALT-20240402-00022',
];
const incidentIds = ['INC-2026-0084', 'INC-2026-0091', 'INC-2026-0098'];

export const foundationResponseActivity: ResponseActivityDTO[] = Array.from({ length: 36 }, (_, index) => {
  const seed = playbookSeeds[index % playbookSeeds.length];
  const listItem = foundationPlaybookListItems[index % foundationPlaybookListItems.length];
  const status: ResponseActivityStatus = activityStatusCycle[index % activityStatusCycle.length];
  const durationMs = 1200 + index * 389;
  const observedAt = new Date(Date.now() - 60_000 - index * 23 * 60_000);
  const isLinkedToAlert = index % 3 !== 2;
  const steps: ActivityStepDTO[] = stepTemplates
    .slice(0, 2 + (index % 5))
    .map((t, si) => {
      const isCurrent = status === 'RUNNING' && si === Math.min(2, 1 + (index % 2));
      const isPending = (status === 'RUNNING' || status === 'QUEUED' || status === 'AWAITING_APPROVAL') && si > 1;
      return {
        ...t,
        id: `step-${index}-${si}`,
        nodeType: si === 0 ? 'trigger' : si === 2 ? 'condition' : 'action',
        status: isCurrent ? 'running' : isPending ? 'queued' : t.status,
        inputSummary: si === 0 ? 'Authorized alert projection · 6 normalized fields' : 'Bounded normalized projection',
        outputSummary: t.resultSummary,
        redactedFields: si === 1 ? ['connector.secretRef', 'event.raw'] : [],
        retryCount: status === 'PARTIAL' && si === 1 ? 2 : 0,
      } satisfies ActivityStepDTO;
    });

  return {
    id: `exec-${2000 + index}`,
    timestamp: observedAt.toISOString(),
    playbookName: seed.name,
    playbookId: listItem.id,
    trigger: seed.trigger,
    linkedEntityId: isLinkedToAlert
      ? alertIds[index % alertIds.length]
      : incidentIds[index % incidentIds.length],
    linkedEntityType: isLinkedToAlert ? 'ALERT' : 'INCIDENT',
    executedBy: status === 'BLOCKED' ? 'Policy engine' : analysts[index % analysts.length],
    status,
    durationMs: ['BLOCKED', 'QUEUED', 'AWAITING_APPROVAL'].includes(status) ? 0 : durationMs,
    startedAt: ['QUEUED', 'AWAITING_APPROVAL'].includes(status) ? undefined : observedAt.toISOString(),
    completedAt: ['RUNNING', 'QUEUED', 'AWAITING_APPROVAL'].includes(status)
      ? undefined
      : new Date(observedAt.getTime() + durationMs).toISOString(),
    playbookVersion: 3 + (index % 5),
    tenantLabel: index % 4 === 0 ? 'Finance Production' : index % 4 === 1 ? 'Corporate IT' : 'Shared Security',
    currentStep: status === 'RUNNING' ? steps.find((step) => step.status === 'running')?.actionName : undefined,
    progressPercent: status === 'RUNNING' ? 42 + (index % 4) * 11 : status === 'SUCCESS' ? 100 : undefined,
    correlationId: `corr-${String(8000 + index).padStart(6, '0')}`,
    auditId: `audit-${String(6000 + index).padStart(6, '0')}`,
    approvalReference: status === 'AWAITING_APPROVAL' ? `apr-${3000 + index}` : undefined,
    connectorState: status === 'PARTIAL' ? 'DEGRADED' : status === 'FAILED' && index % 2 === 0 ? 'UNAVAILABLE' : 'HEALTHY',
    retryCount: status === 'PARTIAL' ? 2 : 0,
    warningCount: status === 'PARTIAL' ? 2 : status === 'FAILED' ? 1 : 0,
    stepCount: steps.length,
    capabilities: {
      canCancel: status === 'RUNNING' || status === 'QUEUED' || status === 'AWAITING_APPROVAL',
      canRetry: status === 'FAILED' || status === 'PARTIAL' || status === 'CANCELLED',
      canViewInputs: true,
      canViewOutputs: true,
    },
    steps,
    rawLog:
      status !== 'BLOCKED'
        ? `[${observedAt.toISOString()}] Playbook '${seed.name}' started.\n` +
          steps
            .map((s) => `  [${s.status.toUpperCase()}] ${s.actionName}: ${s.resultSummary ?? s.errorMessage ?? 'skipped'}`)
            .join('\n') +
          `\n[COMPLETE] Total duration: ${durationMs}ms`
        : 'Execution blocked — endpoint is missing @PreAuthorize (GAP-SEC-08). See docs/frontend-backend-contract-register.md.',
  };
});

// ─── Approval queue ───────────────────────────────────────────────────────────

const approvalStatusCycle: ApprovalStatus[] = ['PENDING', 'PENDING', 'APPROVED', 'REJECTED', 'PENDING', 'AUTO_APPROVED'];

export const foundationApprovalQueue: ApprovalRecord[] = foundationPlaybookListItems
  .filter((pb) => pb.approvalRequired)
  .map((pb, index) => {
    const approvalStatus: ApprovalStatus = approvalStatusCycle[index % approvalStatusCycle.length];
    const requestedAt = `2026-08-03T${String(13 - index).padStart(2, '0')}:00:00Z`;
    return {
      approvalId: `apr-${3000 + index}`,
      executionId: `exec-${2200 + index}`,
      playbookId: pb.id,
      playbookName: pb.name,
      requestedBy: analysts[index % analysts.length],
      requestedAt,
      approvalStatus,
      approvedBy: approvalStatus === 'APPROVED' ? 'Omar Haddad' : approvalStatus === 'AUTO_APPROVED' ? 'SYSTEM' : null,
      approvedAt: approvalStatus === 'APPROVED' || approvalStatus === 'AUTO_APPROVED'
        ? `2026-08-03T${String(13 - index + 1).padStart(2, '0')}:05:00Z`
        : null,
      rejectionReason: approvalStatus === 'REJECTED' ? 'Blast radius too broad — manual containment preferred for this incident scope.' : null,
      expiresAt: `2026-08-03T${String(13 - index + 4).padStart(2, '0')}:00:00Z`,
      blastRadius: {
        affectedTargets: index % 2 === 0
          ? ['FIN-WKS-044', 'FIN-WKS-051', 'All shared-drive mounts']
          : ['svc-finance (AD account)', 'All active sessions (4)', 'MFA enrollment'],
        riskLevel: 'HIGH',
        reversible: index % 3 !== 0,
        rollbackGuidance: index % 3 !== 0
          ? 'Run the Host Release playbook or manually remove the isolation policy in the EDR console.'
          : null,
        requiredPermission: 'ROLE_SOC_MANAGER',
        mitreReference: index % 2 === 0 ? 'T1059.001' : 'T1078',
      },
    };
  });

// ─── Quarantine records ───────────────────────────────────────────────────────

const quarantineStatusCycle: QuarantineStatus[] = ['ACTIVE', 'ACTIVE', 'RELEASED', 'ACTIVE', 'EXPIRED'];

export const foundationQuarantineRecords: QuarantineRecord[] = [
  'FIN-WKS-044',
  'OPS-SRV-012',
  'svc-finance',
  'FIN-WKS-051',
  'MKT-LPT-009',
].map((target, index) => ({
  quarantineId: `qrn-${4000 + index}`,
  targetType: index < 2 || index === 3 || index === 4 ? 'HOST' : 'ACCOUNT',
  targetId: target.toLowerCase().replace(/ /g, '-'),
  targetDisplayName: target,
  status: quarantineStatusCycle[index % quarantineStatusCycle.length],
  initiatedBy: analysts[index % analysts.length],
  initiatedAt: `2026-08-0${3 - (index % 3)}T${String(10 + index).padStart(2, '0')}:00:00Z`,
  expiresAt: `2026-08-${String(10 + index).padStart(2, '0')}T10:00:00Z`,
  releasedBy: quarantineStatusCycle[index % quarantineStatusCycle.length] === 'RELEASED' ? 'Elena Rossi' : null,
  releasedAt: quarantineStatusCycle[index % quarantineStatusCycle.length] === 'RELEASED' ? '2026-08-03T15:30:00Z' : null,
  linkedExecutionId: `exec-${2000 + index}`,
  linkedAlertId: alertIds[index % alertIds.length],
  blastRadius: {
    affectedTargets: [target, 'Network access', 'Remote management'],
    riskLevel: 'HIGH',
    reversible: true,
    rollbackGuidance: 'Run the Host Release playbook or remove isolation from the EDR console.',
    requiredPermission: 'ROLE_SOC_MANAGER',
    mitreReference: 'T1059',
  },
  notes: index % 2 === 0 ? 'Isolated as part of ransomware containment effort INC-2026-0084.' : null,
}));

// ─── Action catalog ───────────────────────────────────────────────────────────

type CatalogSeed = { id: string; name: string; category: ActionCategory; integration: string; risk: 'HIGH' | 'MEDIUM' | 'LOW'; approval: boolean; rollback: boolean };

const catalogSeeds: CatalogSeed[] = [
  { id: 'edr.isolate_host', name: 'Isolate Host', category: 'ISOLATION', integration: 'EDR Platform', risk: 'HIGH', approval: true, rollback: true },
  { id: 'edr.kill_process', name: 'Kill Process', category: 'REMEDIATION', integration: 'EDR Platform', risk: 'MEDIUM', approval: false, rollback: false },
  { id: 'edr.collect_artifact', name: 'Collect Artifact', category: 'INVESTIGATION', integration: 'EDR Platform', risk: 'LOW', approval: false, rollback: false },
  { id: 'identity.suspend_account', name: 'Suspend Account', category: 'ISOLATION', integration: 'Active Directory', risk: 'HIGH', approval: true, rollback: true },
  { id: 'identity.reset_password', name: 'Force Password Reset', category: 'REMEDIATION', integration: 'Active Directory', risk: 'MEDIUM', approval: false, rollback: false },
  { id: 'identity.revoke_sessions', name: 'Revoke All Sessions', category: 'ISOLATION', integration: 'Active Directory', risk: 'MEDIUM', approval: false, rollback: false },
  { id: 'network.block_ip', name: 'Block IP on Firewall', category: 'ISOLATION', integration: 'Perimeter Firewall', risk: 'MEDIUM', approval: false, rollback: true },
  { id: 'network.dns_sinkhole', name: 'DNS Sinkhole Domain', category: 'ISOLATION', integration: 'DNS Resolver', risk: 'MEDIUM', approval: false, rollback: true },
  { id: 'enrichment.ip_lookup', name: 'IP Reputation Lookup', category: 'ENRICHMENT', integration: 'Threat Intelligence Feed', risk: 'LOW', approval: false, rollback: false },
  { id: 'enrichment.user_risk', name: 'User Risk Score Update', category: 'ENRICHMENT', integration: 'HiveArmor', risk: 'LOW', approval: false, rollback: false },
  { id: 'ticketing.create_incident', name: 'Create ServiceNow Incident', category: 'NOTIFICATION', integration: 'ServiceNow', risk: 'LOW', approval: false, rollback: false },
  { id: 'notification.slack_message', name: 'Send Slack Message', category: 'NOTIFICATION', integration: 'Slack', risk: 'LOW', approval: false, rollback: false },
  { id: 'cloud.revoke_role', name: 'Revoke IAM Role Binding', category: 'ISOLATION', integration: 'Cloud Provider', risk: 'HIGH', approval: true, rollback: true },
  { id: 'cloud.snapshot_instance', name: 'Snapshot Instance', category: 'INVESTIGATION', integration: 'Cloud Provider', risk: 'LOW', approval: false, rollback: false },
];

export const foundationActionCatalog: ActionCatalogEntry[] = catalogSeeds.map((seed) => ({
  actionId: seed.id,
  name: seed.name,
  description: `Performs a ${seed.name.toLowerCase()} operation via the ${seed.integration} integration. Check blast radius before executing on production assets.`,
  category: seed.category,
  integrationName: seed.integration,
  integrationLogoUrl: null,
  parameters: [
    { key: 'target', label: 'Target', type: 'STRING', required: true },
    { key: 'reason', label: 'Justification', type: 'STRING', required: true },
  ],
  blastRisk: seed.risk,
  requiresApproval: seed.approval,
  rollbackSupported: seed.rollback,
  docsUrl: null,
}));

export const foundationActionCatalogSummary: ActionCatalogSummary = {
  categories: [
    { category: 'ISOLATION', actionCount: 6, integrationCount: 4 },
    { category: 'REMEDIATION', actionCount: 2, integrationCount: 2 },
    { category: 'ENRICHMENT', actionCount: 2, integrationCount: 2 },
    { category: 'NOTIFICATION', actionCount: 2, integrationCount: 2 },
    { category: 'INVESTIGATION', actionCount: 2, integrationCount: 2 },
  ],
  totalActions: catalogSeeds.length,
  lastUpdatedAt: '2026-08-03T08:00:00Z',
};

// ─── Metrics summary ──────────────────────────────────────────────────────────

export const foundationPlaybookMetrics: PlaybookMetricsSummary = {
  total: foundationPlaybookListItems.length,
  active: foundationPlaybookListItems.filter((p) => p.status === 'ACTIVE').length,
  executionsLast24h: 47,
  successRate24h: 93.6,
  pendingApprovals: foundationApprovalQueue.filter((a) => a.approvalStatus === 'PENDING').length,
  activeQuarantines: foundationQuarantineRecords.filter((q) => q.status === 'ACTIVE').length,
  snapshotAt: '2026-08-03T13:16:00Z',
};

export function foundationPreviewPlaybookExecution(playbookId: string): PlaybookPreviewResponse {
  const playbook = foundationPlaybookListItems.find((item) => item.id === playbookId);
  const disruptive = playbook?.approvalRequired ?? false;
  return {
    previewToken: `fixture-preview-${playbookId}`,
    playbookId,
    estimatedDurationSeconds: disruptive ? 48 : 18,
    stepCount: disruptive ? 6 : 4,
    blastRadius: {
      affectedTargets: disruptive ? ['1 selected endpoint', '1 authorized tenant'] : ['Read-only enrichment services'],
      riskLevel: disruptive ? 'HIGH' : 'LOW',
      reversible: disruptive,
      rollbackGuidance: disruptive ? 'Release the endpoint isolation from Response Activity.' : null,
      requiredPermission: disruptive ? 'ROLE_SOC_MANAGER' : 'ROLE_ANALYST',
      mitreReference: disruptive ? 'T1059.001' : null,
    },
    approvalRequired: disruptive,
    validationResult: { valid: true, errors: [], warnings: [] },
    stepSummaries: Array.from({ length: disruptive ? 6 : 4 }, (_, index) => ({ stepOrder: index + 1, actionName: `Authorized response step ${index + 1}`, targetDescription: index === 0 ? 'Selected trigger context' : 'Prior bounded output', estimatedDurationMs: 900 + index * 350 })),
  };
}

// ─── Response governance fixtures ───────────────────────────────────────────

const governanceNow = Date.now();
const governanceIso = (offsetMinutes: number): string => new Date(governanceNow + offsetMinutes * 60_000).toISOString();

const approvalSeeds: Array<Pick<ResponseApprovalRequest,
  'playbookName' | 'actionName' | 'actionCategory' | 'riskLevel' | 'targetType' | 'targets' |
  'affectedUserCount' | 'estimatedDowntime' | 'reversible' | 'rollbackGuidance' |
  'approvalPolicy' | 'approvalTier' | 'approvalsRequired' | 'approvalsReceived' |
  'connectorName' | 'connectorState' | 'confidence' | 'evidenceSummary' |
  'changeWindowState' | 'separationOfDutiesSatisfied'>> = [
  {
    playbookName: 'Host Isolation — Endpoint Compromise', actionName: 'Isolate endpoint', actionCategory: 'ENDPOINT', riskLevel: 'CRITICAL',
    targetType: 'Managed endpoint', targets: ['FIN-WKS-044'], affectedUserCount: 1, estimatedDowntime: 'Until analyst release', reversible: true,
    rollbackGuidance: 'Release isolation through the EDR control channel and verify network policy restoration.', approvalPolicy: 'Critical endpoint containment',
    approvalTier: 2, approvalsRequired: 2, approvalsReceived: 1, connectorName: 'CrowdStrike Falcon', connectorState: 'HEALTHY', confidence: 96,
    evidenceSummary: 'Encoded PowerShell, credential access and confirmed C2 traffic are linked to the selected endpoint.', changeWindowState: 'OPEN', separationOfDutiesSatisfied: true,
  },
  {
    playbookName: 'Account Suspension — Credential Theft', actionName: 'Disable privileged identity', actionCategory: 'IDENTITY', riskLevel: 'CRITICAL',
    targetType: 'Privileged identity', targets: ['svc-finance-prod'], affectedUserCount: 4, estimatedDowntime: '30–60 minutes', reversible: true,
    rollbackGuidance: 'Re-enable the account after credential rotation and revoke all outstanding sessions.', approvalPolicy: 'Privileged identity disruption',
    approvalTier: 3, approvalsRequired: 2, approvalsReceived: 0, connectorName: 'Microsoft Entra ID', connectorState: 'HEALTHY', confidence: 92,
    evidenceSummary: 'Impossible travel, token replay and abnormal administrative API access were observed.', changeWindowState: 'RESTRICTED', separationOfDutiesSatisfied: true,
  },
  {
    playbookName: 'Network Block — C2 Destination', actionName: 'Publish perimeter deny rule', actionCategory: 'NETWORK', riskLevel: 'HIGH',
    targetType: 'Network indicator', targets: ['198.51.100.42', 'cdn-sync.example'], affectedUserCount: 0, estimatedDowntime: 'No expected business impact', reversible: true,
    rollbackGuidance: 'Remove the generated rule from the perimeter policy and invalidate the enforcement cache.', approvalPolicy: 'External indicator enforcement',
    approvalTier: 1, approvalsRequired: 1, approvalsReceived: 0, connectorName: 'Palo Alto Networks', connectorState: 'DEGRADED', confidence: 89,
    evidenceSummary: 'The destination is confirmed by three threat-intelligence sources and two internal observations.', changeWindowState: 'OPEN', separationOfDutiesSatisfied: true,
  },
  {
    playbookName: 'Cloud Role Revocation — Privilege Escalation', actionName: 'Revoke cloud administrator role', actionCategory: 'CLOUD', riskLevel: 'HIGH',
    targetType: 'Cloud principal', targets: ['cloud-audit-reader'], affectedUserCount: 2, estimatedDowntime: '15–30 minutes', reversible: true,
    rollbackGuidance: 'Restore the previous role assignment from the captured IAM policy version.', approvalPolicy: 'Cloud privileged access',
    approvalTier: 2, approvalsRequired: 2, approvalsReceived: 1, connectorName: 'AWS Organizations', connectorState: 'HEALTHY', confidence: 87,
    evidenceSummary: 'A dormant principal assumed an administrative role outside its baseline and approved change window.', changeWindowState: 'EMERGENCY_ONLY', separationOfDutiesSatisfied: true,
  },
  {
    playbookName: 'Process Termination — Malicious Execution', actionName: 'Terminate process tree', actionCategory: 'ENDPOINT', riskLevel: 'MEDIUM',
    targetType: 'Process tree', targets: ['powershell.exe · PID 9044'], affectedUserCount: 1, estimatedDowntime: 'Under 2 minutes', reversible: false,
    rollbackGuidance: null, approvalPolicy: 'Irreversible process response', approvalTier: 1, approvalsRequired: 1, approvalsReceived: 0,
    connectorName: 'Microsoft Defender for Endpoint', connectorState: 'HEALTHY', confidence: 94,
    evidenceSummary: 'The selected process tree contains a signed-binary proxy execution and encoded network retrieval.', changeWindowState: 'OPEN', separationOfDutiesSatisfied: true,
  },
];

let foundationResponseApprovals: ResponseApprovalRequest[] = Array.from({ length: 14 }, (_, index) => {
  const seed = approvalSeeds[index % approvalSeeds.length];
  const pending = index < 5;
  const states: ResponseApprovalRequest['state'][] = ['APPROVED', 'APPROVED', 'REJECTED', 'EXPIRED'];
  const state = pending ? 'PENDING' : states[(index - 5) % states.length];
  const requestedAt = governanceIso(-(index * 19 + 6));
  const expiresAt = governanceIso(22 - index * 7);
  return {
    id: `approval-${3100 + index}`,
    executionId: `exec-governed-${6100 + index}`,
    playbookId: `playbook-${210 + (index % 8)}`,
    playbookName: seed.playbookName,
    playbookVersion: 3 + (index % 4),
    actionName: seed.actionName,
    actionCategory: seed.actionCategory,
    state,
    riskLevel: seed.riskLevel,
    requestedBy: ['Maya Chen', 'Omar Haddad', 'Elena Rossi', 'James Okafor'][index % 4],
    requesterRole: index % 2 ? 'SOC Analyst' : 'Senior Analyst',
    requestedAt,
    expiresAt,
    tenantId: index % 3 ? 'tenant-northstar' : 'tenant-meridian',
    tenantLabel: index % 3 ? 'Northstar Finance' : 'Meridian Health',
    linkedEntityType: index % 3 === 1 ? 'INCIDENT' : 'ALERT',
    linkedEntityId: index % 3 === 1 ? `INC-2026-${String(98 + index).padStart(4, '0')}` : `ALT-20260809-${String(177 + index).padStart(5, '0')}`,
    targetType: seed.targetType,
    targets: seed.targets,
    affectedUserCount: seed.affectedUserCount,
    estimatedDowntime: seed.estimatedDowntime,
    reversible: seed.reversible,
    rollbackGuidance: seed.rollbackGuidance,
    requiredPermission: seed.approvalTier >= 3 ? 'ROLE_ADMIN' : 'ROLE_SOC_MANAGER',
    approvalPolicy: seed.approvalPolicy,
    approvalTier: seed.approvalTier,
    approvalsRequired: seed.approvalsRequired,
    approvalsReceived: pending ? seed.approvalsReceived : seed.approvalsRequired,
    eligibleApproverGroups: seed.approvalTier >= 3 ? ['Platform Administrators', 'Identity Security Leads'] : ['SOC Managers', 'Incident Commanders'],
    connectorName: seed.connectorName,
    connectorState: seed.connectorState,
    confidence: seed.confidence,
    evidenceSummary: seed.evidenceSummary,
    changeWindowState: seed.changeWindowState,
    separationOfDutiesSatisfied: seed.separationOfDutiesSatisfied,
    decisionBy: state === 'PENDING' || state === 'EXPIRED' ? null : ['Priya Nair', 'Marcus Cole'][index % 2],
    decisionAt: state === 'PENDING' || state === 'EXPIRED' ? null : governanceIso(-(index * 12 + 2)),
    decisionComment: state === 'REJECTED' ? 'Target ownership could not be confirmed. Escalated to the incident commander.' : state === 'APPROVED' ? 'Evidence and rollback path reviewed.' : null,
    auditId: `AUD-RESP-${String(8000 + index)}`,
    correlationId: `corr-governance-${String(4100 + index)}`,
  };
});

export let foundationResponsePolicies: ResponseAuthorityPolicy[] = [
  { id: 'policy-endpoint-critical', version: 4, name: 'Critical endpoint containment', actionCategory: 'ENDPOINT', riskFloor: 'HIGH', tenantScope: 'All authorized tenants', requiredApprovals: 2, approverGroups: ['SOC Managers', 'Incident Commanders'], selfApprovalAllowed: false, changeWindow: 'Any time', rollbackRequired: true, status: 'ENFORCED', lastChangedAt: governanceIso(-1_440), lastChangedBy: 'Priya Nair' },
  { id: 'policy-identity-privileged', version: 3, name: 'Privileged identity disruption', actionCategory: 'IDENTITY', riskFloor: 'MEDIUM', tenantScope: 'Production tenants', requiredApprovals: 2, approverGroups: ['Identity Security Leads', 'Platform Administrators'], selfApprovalAllowed: false, changeWindow: 'Emergency approval outside window', rollbackRequired: true, status: 'ENFORCED', lastChangedAt: governanceIso(-2_880), lastChangedBy: 'Marcus Cole' },
  { id: 'policy-network-block', version: 6, name: 'External indicator enforcement', actionCategory: 'NETWORK', riskFloor: 'HIGH', tenantScope: 'All authorized tenants', requiredApprovals: 1, approverGroups: ['SOC Managers'], selfApprovalAllowed: false, changeWindow: 'Any time', rollbackRequired: true, status: 'ENFORCED', lastChangedAt: governanceIso(-4_320), lastChangedBy: 'Priya Nair' },
  { id: 'policy-cloud-privilege', version: 2, name: 'Cloud privileged access', actionCategory: 'CLOUD', riskFloor: 'MEDIUM', tenantScope: 'Production cloud accounts', requiredApprovals: 2, approverGroups: ['Cloud Security Leads', 'Platform Administrators'], selfApprovalAllowed: false, changeWindow: 'Approved maintenance window', rollbackRequired: true, status: 'ENFORCED', lastChangedAt: governanceIso(-5_760), lastChangedBy: 'Anika Shah' },
];

export let foundationResponseDelegates: ResponseAuthorityDelegate[] = [
  { id: 'delegate-01', version: 5, principal: 'SOC Managers', principalType: 'GROUP', authorityTier: 2, actionScopes: ['Endpoint', 'Network', 'Case'], tenantScope: 'All authorized tenants', validFrom: governanceIso(-43_200), validUntil: governanceIso(43_200), emergencyAccess: false, status: 'ACTIVE' },
  { id: 'delegate-02', version: 2, principal: 'Identity Security Leads', principalType: 'GROUP', authorityTier: 3, actionScopes: ['Identity'], tenantScope: 'Production tenants', validFrom: governanceIso(-43_200), validUntil: governanceIso(43_200), emergencyAccess: false, status: 'ACTIVE' },
  { id: 'delegate-03', version: 7, principal: 'Incident Commanders', principalType: 'GROUP', authorityTier: 3, actionScopes: ['Endpoint', 'Identity', 'Network', 'Cloud'], tenantScope: 'All authorized tenants', validFrom: governanceIso(-7_200), validUntil: governanceIso(720), emergencyAccess: true, status: 'EXPIRING' },
];

export function getFoundationResponseGovernance(params: ResponseApprovalListParams): ResponseGovernanceResult {
  const query = params.search?.trim().toLowerCase();
  const approvals = foundationResponseApprovals.filter((item) => {
    if (params.state && params.state !== 'ALL' && item.state !== params.state) return false;
    if (params.risk && params.risk !== 'ALL' && item.riskLevel !== params.risk) return false;
    if (query && ![item.playbookName, item.actionName, item.requestedBy, item.linkedEntityId ?? '', ...item.targets].some((value) => value.toLowerCase().includes(query))) return false;
    return true;
  }).slice(0, params.limit ?? 100);
  const pending = foundationResponseApprovals.filter((item) => item.state === 'PENDING');
  const completed = foundationResponseApprovals.filter((item) => item.decisionAt);
  return {
    approvals,
    policies: foundationResponsePolicies,
    delegates: foundationResponseDelegates,
    snapshotAt: new Date().toISOString(),
    stale: false,
    partialFailures: [],
    summary: {
      pending: pending.length,
      dueSoon: pending.filter((item) => new Date(item.expiresAt).getTime() - Date.now() < 30 * 60_000).length,
      critical: pending.filter((item) => item.riskLevel === 'CRITICAL').length,
      restrictedWindow: pending.filter((item) => item.changeWindowState !== 'OPEN').length,
      approved24h: foundationResponseApprovals.filter((item) => item.state === 'APPROVED').length,
      rejected24h: foundationResponseApprovals.filter((item) => item.state === 'REJECTED').length,
      medianDecisionMs: completed.length ? 8 * 60_000 : 0,
      connectorWarnings: pending.filter((item) => item.connectorState !== 'HEALTHY').length,
      snapshotAt: new Date().toISOString(),
    },
  };
}

export function decideFoundationResponseApproval(request: ResponseApprovalDecisionRequest): ResponseApprovalRequest {
  const current = foundationResponseApprovals.find((item) => item.id === request.approvalId);
  if (!current || current.state !== request.expectedState) throw new Error('Approval is no longer pending. Refresh the queue.');
  const updated: ResponseApprovalRequest = {
    ...current,
    state: request.decision,
    approvalsReceived: request.decision === 'APPROVED' ? current.approvalsRequired : current.approvalsReceived,
    decisionBy: 'Morgan Cole',
    decisionAt: new Date().toISOString(),
    decisionComment: request.comment,
  };
  foundationResponseApprovals = foundationResponseApprovals.map((item) => item.id === updated.id ? updated : item);
  return updated;
}

export function saveFoundationResponseAuthorityPolicy(request: ResponseAuthorityPolicySaveRequest): ResponseAuthorityPolicy {
  const current = request.id ? foundationResponsePolicies.find((item) => item.id === request.id) : undefined;
  if (current && request.expectedVersion !== current.version) throw new Error('This policy changed after you opened it. Refresh before saving.');
  const saved: ResponseAuthorityPolicy = {
    id: current?.id ?? `policy-fixture-${foundationResponsePolicies.length + 1}`,
    version: (current?.version ?? 0) + 1,
    name: request.name,
    actionCategory: request.actionCategory,
    riskFloor: request.riskFloor,
    tenantScope: request.tenantScope,
    requiredApprovals: request.requiredApprovals,
    approverGroups: request.approverGroups,
    selfApprovalAllowed: request.selfApprovalAllowed,
    changeWindow: request.changeWindow,
    rollbackRequired: request.rollbackRequired,
    status: request.publish ? request.status : 'MONITOR',
    lastChangedAt: new Date().toISOString(),
    lastChangedBy: 'Morgan Cole',
  };
  foundationResponsePolicies = current
    ? foundationResponsePolicies.map((item) => item.id === current.id ? saved : item)
    : [...foundationResponsePolicies, saved];
  return saved;
}

export function saveFoundationResponseAuthorityDelegate(request: ResponseAuthorityDelegateSaveRequest): ResponseAuthorityDelegate {
  const current = request.id ? foundationResponseDelegates.find((item) => item.id === request.id) : undefined;
  if (current && request.expectedVersion !== current.version) throw new Error('This delegation changed after you opened it. Refresh before saving.');
  const saved: ResponseAuthorityDelegate = {
    id: current?.id ?? `delegate-fixture-${foundationResponseDelegates.length + 1}`,
    version: (current?.version ?? 0) + 1,
    principal: request.principal,
    principalType: request.principalType,
    authorityTier: request.authorityTier,
    actionScopes: request.actionScopes,
    tenantScope: request.tenantScope,
    validFrom: request.validFrom,
    validUntil: request.validUntil,
    emergencyAccess: request.emergencyAccess,
    status: request.publish ? request.status : 'INACTIVE',
  };
  foundationResponseDelegates = current
    ? foundationResponseDelegates.map((item) => item.id === current.id ? saved : item)
    : [...foundationResponseDelegates, saved];
  return saved;
}

// ─── Filtered query helpers (mirror the real service signatures) ──────────────

export function filterFoundationPlaybooks(
  params: PlaybookListParams & { search?: string; category?: string; cursor?: string }
): CursorPageResult<PlaybookListItem> {
  const query = (params as { search?: string }).search?.trim().toLowerCase();
  const filtered = foundationPlaybookListItems.filter((pb) => {
    if (query && !pb.name.toLowerCase().includes(query) && !pb.description.toLowerCase().includes(query)) return false;
    if (params.status && params.status !== 'ALL' && pb.status !== params.status) return false;
    if (params.triggerType && params.triggerType !== 'ALL' && pb.triggerType !== params.triggerType) return false;
    if ((params as { category?: string }).category && (params as { category?: string }).category !== 'ALL' && pb.category !== (params as { category?: string }).category) return false;
    return true;
  });
  const size = params.size ?? 25;
  const offset = Number(params.cursor ?? '0');
  const page = filtered.slice(offset, offset + size);
  return {
    items: page,
    nextCursor: offset + size < filtered.length ? String(offset + size) : null,
    total: filtered.length,
    hasMore: offset + size < filtered.length,
  };
}

export function filterFoundationResponseActivity(
  params: ResponseActivityListParams & { search?: string }
): ResponseActivityPageResult {
  const query = (params as { search?: string }).search?.trim().toLowerCase();
  const filtered = foundationResponseActivity.filter((rec) => {
    if (query && !rec.playbookName.toLowerCase().includes(query) && !rec.linkedEntityId?.toLowerCase().includes(query)) return false;
    if (params.status && params.status !== 'ALL' && rec.status !== params.status) return false;
    if (params.trigger && params.trigger !== 'ALL' && rec.trigger !== params.trigger) return false;
    if (params.triggeredBy && rec.executedBy !== params.triggeredBy) return false;
    if (params.timeFrom && rec.timestamp < params.timeFrom) return false;
    if (params.timeTo && rec.timestamp > params.timeTo) return false;
    return true;
  });
  const size = params.size ?? 50;
  const offset = Number(params.cursor ?? '0');
  const page = filtered.slice(offset, offset + size);
  const completed = filtered.filter((item) => ['SUCCESS', 'PARTIAL', 'FAILED', 'CANCELLED', 'BLOCKED'].includes(item.status));
  const successful = filtered.filter((item) => item.status === 'SUCCESS').length;
  const durations = completed.map((item) => item.durationMs ?? 0).filter(Boolean).sort((a, b) => a - b);
  return {
    items: page,
    nextCursor: offset + size < filtered.length ? String(offset + size) : null,
    previousCursor: offset > 0 ? String(Math.max(0, offset - size)) : null,
    total: filtered.length,
    hasMore: offset + size < filtered.length,
    snapshotAt: new Date().toISOString(),
    stale: false,
    summary: {
      total: filtered.length,
      running: filtered.filter((item) => item.status === 'RUNNING' || item.status === 'QUEUED').length,
      awaitingApproval: filtered.filter((item) => item.status === 'AWAITING_APPROVAL').length,
      failed: filtered.filter((item) => item.status === 'FAILED').length,
      partial: filtered.filter((item) => item.status === 'PARTIAL').length,
      successRate: completed.length ? Math.round((successful / completed.length) * 100) : 0,
      medianDurationMs: durations.length ? durations[Math.floor(durations.length / 2)] : 0,
      degradedConnectors: filtered.filter((item) => item.connectorState && item.connectorState !== 'HEALTHY').length,
      snapshotAt: new Date().toISOString(),
      totalIsExact: true,
      partialFailures: [],
    },
  };
}

export function getFoundationResponseExecutionTrace(executionId: string): ResponseExecutionTraceResult {
  const execution = foundationResponseActivity.find((item) => item.id === executionId);
  const items = execution?.steps ?? [];
  return {
    items,
    nextCursor: null,
    total: items.length,
    hasMore: false,
    snapshotAt: execution?.timestamp ?? new Date(0).toISOString(),
    stale: false,
    partialFailures: [],
  };
}
