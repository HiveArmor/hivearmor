import type { ResponseAction } from '@/types/responseAction';

export const fixtureResponseActions: ResponseAction[] = [
  {
    id: 'isolate_host', name: 'Isolate Host', category: 'Containment',
    description: 'Isolate a host from the network while preserving its management channel.', usageCount: 9,
    targetType: 'host', integrationStatus: 'healthy', riskLevel: 'critical', requiredRole: 'ROLE_SOC_MANAGER', integrationName: 'Endpoint control', requiresApproval: true, rollbackSupported: true,
    params: [
      { name: 'duration', type: 'string', required: true, description: 'Bounded isolation duration.', defaultValue: '4h', options: null },
      { name: 'allowDns', type: 'boolean', required: false, description: 'Allow DNS during isolation.', defaultValue: false, options: null },
    ],
    outputs: [{ name: 'jobId', type: 'string', description: 'Trackable response job identifier.' }],
  },
  {
    id: 'kill_process', name: 'Kill Process', category: 'Containment',
    description: 'Terminate a selected process and optionally its descendants.', usageCount: 14,
    targetType: 'process', integrationStatus: 'healthy', riskLevel: 'high', requiredRole: 'ROLE_SOC_ANALYST', integrationName: 'Endpoint control', requiresApproval: false, rollbackSupported: false,
    params: [
      { name: 'pid', type: 'integer', required: true, description: 'Process identifier on the target host.', defaultValue: null, options: null },
      { name: 'includeChildren', type: 'boolean', required: false, description: 'Terminate child processes.', defaultValue: true, options: null },
    ],
  },
  {
    id: 'block_ip', name: 'Block IP Address', category: 'Containment',
    description: 'Add an IP address to an authorized network enforcement block list.', usageCount: 22,
    targetType: 'ip', integrationStatus: 'healthy', riskLevel: 'medium', requiredRole: 'ROLE_SOC_ANALYST', integrationName: 'Network enforcement', requiresApproval: false, rollbackSupported: true,
    params: [
      { name: 'direction', type: 'select', required: true, description: 'Inbound, outbound, or both.', defaultValue: 'both', options: ['inbound', 'outbound', 'both'] },
      { name: 'duration', type: 'string', required: false, description: 'Optional bounded block duration.', defaultValue: null, options: null },
    ],
  },
  {
    id: 'disable_account', name: 'Disable User Account', category: 'Eradication',
    description: 'Disable a directory identity and optionally revoke its active sessions.', usageCount: 7,
    targetType: 'user', integrationStatus: 'healthy', riskLevel: 'high', requiredRole: 'ROLE_SOC_MANAGER', integrationName: 'Identity control', requiresApproval: true, rollbackSupported: true,
    params: [
      { name: 'revokeTokens', type: 'boolean', required: false, description: 'Revoke active sessions after disabling.', defaultValue: true, options: null },
    ],
  },
  {
    id: 'quarantine_file', name: 'Quarantine File', category: 'Eradication',
    description: 'Move a file to an isolated location and optionally preserve a sample.', usageCount: 11,
    targetType: 'file', integrationStatus: 'degraded', riskLevel: 'medium', requiredRole: 'ROLE_SOC_ANALYST', integrationName: 'Endpoint control', requiresApproval: false, rollbackSupported: true,
    params: [
      { name: 'path', type: 'string', required: true, description: 'Full path on the target host.', defaultValue: null, options: null },
      { name: 'collectSample', type: 'boolean', required: false, description: 'Preserve a sample for analysis.', defaultValue: true, options: null },
    ],
  },
  {
    id: 'revoke_sessions', name: 'Revoke All Sessions', category: 'Eradication',
    description: 'Terminate active sessions for a selected identity.', usageCount: 18,
    targetType: 'user', integrationStatus: 'healthy', riskLevel: 'medium', requiredRole: 'ROLE_SOC_ANALYST', integrationName: 'Identity control', requiresApproval: false, rollbackSupported: true, params: [],
  },
  {
    id: 'collect_forensics', name: 'Collect Forensic Artifacts', category: 'Investigation',
    description: 'Collect bounded memory, event log, registry, and prefetch artifacts.', usageCount: 31,
    targetType: 'host', integrationStatus: 'healthy', riskLevel: 'low', requiredRole: 'ROLE_SOC_ANALYST', integrationName: 'Endpoint telemetry', requiresApproval: false, rollbackSupported: true,
    params: [
      { name: 'artifacts', type: 'select', required: true, description: 'Artifact groups to collect.', defaultValue: 'eventlogs,registry', options: ['memory', 'eventlogs', 'registry', 'prefetch'] },
    ],
  },
  {
    id: 'run_scan', name: 'Run Antivirus Scan', category: 'Investigation',
    description: 'Trigger a bounded antivirus scan on the target host.', usageCount: 12,
    targetType: 'host', integrationStatus: 'unavailable', riskLevel: 'low', requiredRole: 'ROLE_SOC_ANALYST', integrationName: 'Endpoint protection', requiresApproval: false, rollbackSupported: true,
    params: [
      { name: 'scanType', type: 'select', required: false, description: 'Quick or full scan.', defaultValue: 'quick', options: ['quick', 'full'] },
    ],
  },
];
