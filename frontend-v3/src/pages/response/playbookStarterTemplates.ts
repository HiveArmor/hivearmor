/**
 * Starter SOAR playbook templates for empty-state onboarding.
 * Shapes match POST /api/ha-playbooks (PlaybookDTO).
 * EDR actions require config.agentId at execute time.
 */

export interface StarterPlaybookTemplate {
  id: string;
  name: string;
  description: string;
  triggerType: 'manual' | 'alert-triggered' | 'scheduled';
  active: boolean;
  categoryHint: string;
  steps: Array<{
    stepIndex: number;
    stepType: 'condition' | 'action' | 'delay' | 'loop';
    label: string;
    config: Record<string, unknown>;
  }>;
}

export const STARTER_PLAYBOOK_TEMPLATES: StarterPlaybookTemplate[] = [
  {
    id: 'endpoint-isolation',
    name: 'Endpoint Isolation Response',
    description:
      'High-severity host compromise: delay gate, then EDR isolate when agentId is supplied at run time.',
    triggerType: 'alert-triggered',
    active: false,
    categoryHint: 'EDR',
    steps: [
      {
        stepIndex: 0,
        stepType: 'condition',
        label: 'Severity is high or critical',
        config: { field: 'alert.severity', op: 'in', value: ['high', 'critical'] },
      },
      {
        stepIndex: 1,
        stepType: 'delay',
        label: 'Brief analyst review window',
        config: { delaySeconds: 2 },
      },
      {
        stepIndex: 2,
        stepType: 'action',
        label: 'Isolate host via EDR',
        config: {
          actionId: 'isolate_host',
          builderNodeType: 'action',
          params: { duration: '4h' },
        },
      },
    ],
  },
  {
    id: 'webhook-notify',
    name: 'SOC Webhook Notify',
    description:
      'Sends an SSRF-safe HTTPS webhook. Provide inputs.url at execute time (public hosts only).',
    triggerType: 'manual',
    active: true,
    categoryHint: 'Notification',
    steps: [
      {
        stepIndex: 0,
        stepType: 'delay',
        label: 'Pre-notify pause',
        config: { delaySeconds: 1 },
      },
      {
        stepIndex: 1,
        stepType: 'action',
        label: 'POST SOC webhook',
        config: {
          actionId: 'send-webhook',
          method: 'POST',
          body: '{"source":"hivearmor","event":"playbook-notify"}',
        },
      },
    ],
  },
  {
    id: 'malware-containment',
    name: 'Malware Execution Containment',
    description:
      'Quarantine malicious file then isolate host. Requires agentId and file path at execute time.',
    triggerType: 'alert-triggered',
    active: false,
    categoryHint: 'EDR',
    steps: [
      {
        stepIndex: 0,
        stepType: 'action',
        label: 'Quarantine malicious file',
        config: {
          actionId: 'quarantine_file',
          params: { path: '/tmp/sample.bin' },
        },
      },
      {
        stepIndex: 1,
        stepType: 'action',
        label: 'Isolate host',
        config: { actionId: 'isolate_host', params: { duration: '24h' } },
      },
      {
        stepIndex: 2,
        stepType: 'delay',
        label: 'Wait before follow-up',
        config: { delaySeconds: 5 },
      },
    ],
  },
  {
    id: 'manual-host-triage',
    name: 'Manual Host Triage',
    description:
      'Analyst-launched delay then optional isolate. Safe starter — delay-only until agentId is configured.',
    triggerType: 'manual',
    active: true,
    categoryHint: 'Multi-step',
    steps: [
      {
        stepIndex: 0,
        stepType: 'delay',
        label: 'Collect context pause',
        config: { delaySeconds: 1 },
      },
      {
        stepIndex: 1,
        stepType: 'condition',
        label: 'Continue after pause',
        config: { field: 'input.ready', op: 'eq', value: true },
      },
    ],
  },
];
