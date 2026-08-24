/**
 * Starter SOAR playbook templates for empty-state onboarding.
 * Shapes match POST /api/ha-playbooks (PlaybookDTO).
 * EDR actions require config.agentId (and path/pid where applicable) at execute time —
 * never hardcode agentId in starters.
 *
 * Label: STAGING CANDIDATE — executable steps only (webhook / delay / condition / EDR /
 * webhook-to-ticket). Do not seed Okta disable_user / connector.disable_user or SMTP-dependent
 * send-email here (CI may lack SMTP).
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
  {
    id: 'ransomware-containment',
    name: 'Ransomware Containment',
    description:
      'Ransomware staging: severity gate, notify SOC, quarantine sample path, then isolate. Supply agentId and path at execute time.',
    triggerType: 'alert-triggered',
    active: false,
    categoryHint: 'EDR',
    steps: [
      {
        stepIndex: 0,
        stepType: 'condition',
        label: 'Severity is critical',
        config: { field: 'alert.severity', op: 'eq', value: 'critical' },
      },
      {
        stepIndex: 1,
        stepType: 'action',
        label: 'Notify SOC of ransomware alert',
        config: {
          actionId: 'send-webhook',
          method: 'POST',
          body: '{"source":"hivearmor","event":"ransomware-containment","theme":"ransomware"}',
        },
      },
      {
        stepIndex: 2,
        stepType: 'delay',
        label: 'Analyst confirm window',
        config: { delaySeconds: 3 },
      },
      {
        stepIndex: 3,
        stepType: 'action',
        label: 'Quarantine ransomware artifact',
        config: {
          actionId: 'quarantine_file',
          params: { path: '/tmp/ransom_sample.bin' },
        },
      },
      {
        stepIndex: 4,
        stepType: 'action',
        label: 'Isolate compromised host',
        config: { actionId: 'isolate_host', params: { duration: '24h' } },
      },
    ],
  },
  {
    id: 'phishing-triage',
    name: 'Phishing Alert Triage',
    description:
      'Phishing report triage: pause for mailbox context, pass MVP condition, notify SOC webhook. Provide inputs.url at execute time.',
    triggerType: 'alert-triggered',
    active: true,
    categoryHint: 'Triage',
    steps: [
      {
        stepIndex: 0,
        stepType: 'delay',
        label: 'Collect mailbox context',
        config: { delaySeconds: 2 },
      },
      {
        stepIndex: 1,
        stepType: 'condition',
        label: 'Phishing indicators present',
        config: { field: 'alert.category', op: 'eq', value: 'phishing' },
      },
      {
        stepIndex: 2,
        stepType: 'action',
        label: 'POST phishing triage webhook',
        config: {
          actionId: 'send-webhook',
          method: 'POST',
          body: '{"source":"hivearmor","event":"phishing-triage","theme":"phishing"}',
        },
      },
    ],
  },
  {
    id: 'ato-response',
    name: 'Account Takeover Response',
    description:
      'Suspected ATO: severity gate, review delay, then SOC webhook. Identity disable connectors are out of scope (no Okta) — escalate via webhook only.',
    triggerType: 'alert-triggered',
    active: true,
    categoryHint: 'Identity',
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
        label: 'Identity analyst review',
        config: { delaySeconds: 2 },
      },
      {
        stepIndex: 2,
        stepType: 'action',
        label: 'Notify identity response channel',
        config: {
          actionId: 'send-webhook',
          method: 'POST',
          body: '{"source":"hivearmor","event":"ato-response","theme":"account-takeover"}',
        },
      },
    ],
  },
  {
    id: 'lateral-movement-containment',
    name: 'Lateral Movement Containment',
    description:
      'East-west movement: condition gate, review delay, then EDR isolate. Supply agentId at execute time.',
    triggerType: 'alert-triggered',
    active: false,
    categoryHint: 'EDR',
    steps: [
      {
        stepIndex: 0,
        stepType: 'condition',
        label: 'Lateral movement technique matched',
        config: { field: 'alert.technique', op: 'eq', value: 'lateral-movement' },
      },
      {
        stepIndex: 1,
        stepType: 'delay',
        label: 'Confirm pivot before isolate',
        config: { delaySeconds: 3 },
      },
      {
        stepIndex: 2,
        stepType: 'action',
        label: 'Isolate pivot host',
        config: { actionId: 'isolate_host', params: { duration: '8h' } },
      },
      {
        stepIndex: 3,
        stepType: 'action',
        label: 'Notify SOC of containment',
        config: {
          actionId: 'send-webhook',
          method: 'POST',
          body: '{"source":"hivearmor","event":"lateral-movement-contained","theme":"lateral-movement"}',
        },
      },
    ],
  },
  {
    id: 'brute-force-triage',
    name: 'Brute-Force Login Triage',
    description:
      'Auth brute-force: condition, short delay, webhook escalate. Provide inputs.url at execute time. No identity disable steps.',
    triggerType: 'alert-triggered',
    active: true,
    categoryHint: 'Triage',
    steps: [
      {
        stepIndex: 0,
        stepType: 'condition',
        label: 'Failed login threshold exceeded',
        config: { field: 'alert.category', op: 'eq', value: 'brute-force' },
      },
      {
        stepIndex: 1,
        stepType: 'delay',
        label: 'Corroborate source IP',
        config: { delaySeconds: 2 },
      },
      {
        stepIndex: 2,
        stepType: 'action',
        label: 'POST brute-force triage webhook',
        config: {
          actionId: 'send-webhook',
          method: 'POST',
          body: '{"source":"hivearmor","event":"brute-force-triage","theme":"brute-force"}',
        },
      },
    ],
  },
  {
    id: 'suspicious-process-kill',
    name: 'Suspicious Process Kill',
    description:
      'Kill a malicious process then notify. Requires agentId and pid at execute time — inactive until EDR context is supplied.',
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
        label: 'Confirm process identity',
        config: { delaySeconds: 2 },
      },
      {
        stepIndex: 2,
        stepType: 'action',
        label: 'Kill suspicious process',
        config: {
          actionId: 'kill_process',
          params: {},
        },
      },
      {
        stepIndex: 3,
        stepType: 'action',
        label: 'Notify SOC of process kill',
        config: {
          actionId: 'send-webhook',
          method: 'POST',
          body: '{"source":"hivearmor","event":"process-killed","theme":"containment"}',
        },
      },
    ],
  },
  {
    id: 'webhook-escalation-chain',
    name: 'Webhook Escalation Chain',
    description:
      'Two-stage SOC notification with a delay between pages. Provide inputs.url at execute time for both webhook steps.',
    triggerType: 'manual',
    active: true,
    categoryHint: 'Notification',
    steps: [
      {
        stepIndex: 0,
        stepType: 'action',
        label: 'Primary SOC webhook',
        config: {
          actionId: 'send-webhook',
          method: 'POST',
          body: '{"source":"hivearmor","event":"escalation-primary","stage":1}',
        },
      },
      {
        stepIndex: 1,
        stepType: 'delay',
        label: 'Wait before secondary page',
        config: { delaySeconds: 5 },
      },
      {
        stepIndex: 2,
        stepType: 'action',
        label: 'Secondary on-call webhook',
        config: {
          actionId: 'send-webhook',
          method: 'POST',
          body: '{"source":"hivearmor","event":"escalation-secondary","stage":2}',
        },
      },
    ],
  },
  {
    id: 'high-severity-triage-gate',
    name: 'High-Severity Triage Gate',
    description:
      'Pure triage starter: severity condition, analyst delay, continue gate. Safe to activate — no EDR or webhook side effects.',
    triggerType: 'alert-triggered',
    active: true,
    categoryHint: 'Triage',
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
        label: 'Analyst triage window',
        config: { delaySeconds: 3 },
      },
      {
        stepIndex: 2,
        stepType: 'condition',
        label: 'Continue after triage',
        config: { field: 'input.ready', op: 'eq', value: true },
      },
    ],
  },
  {
    id: 'file-quarantine-notify',
    name: 'File Quarantine and Notify',
    description:
      'Quarantine a suspicious file then webhook SOC. Requires agentId and path at execute time.',
    triggerType: 'alert-triggered',
    active: false,
    categoryHint: 'EDR',
    steps: [
      {
        stepIndex: 0,
        stepType: 'condition',
        label: 'Malware category alert',
        config: { field: 'alert.category', op: 'eq', value: 'malware' },
      },
      {
        stepIndex: 1,
        stepType: 'action',
        label: 'Quarantine suspicious file',
        config: {
          actionId: 'quarantine_file',
          params: { path: '/tmp/suspicious.bin' },
        },
      },
      {
        stepIndex: 2,
        stepType: 'action',
        label: 'Notify SOC of quarantine',
        config: {
          actionId: 'send-webhook',
          method: 'POST',
          body: '{"source":"hivearmor","event":"file-quarantined","theme":"containment"}',
        },
      },
    ],
  },
  {
    id: 'soc-pager-webhook',
    name: 'SOC Pager Webhook',
    description:
      'Minimal one-shot pager webhook for on-call. Provide inputs.url at execute time (public HTTPS only).',
    triggerType: 'manual',
    active: true,
    categoryHint: 'Notification',
    steps: [
      {
        stepIndex: 0,
        stepType: 'action',
        label: 'Page on-call via webhook',
        config: {
          actionId: 'send-webhook',
          method: 'POST',
          body: '{"source":"hivearmor","event":"soc-pager","priority":"high"}',
        },
      },
    ],
  },
  {
    id: 'ransomware-notify-first',
    name: 'Ransomware Notify-Then-Isolate',
    description:
      'Notify SOC before containment so responders are in the loop. Isolate requires agentId at execute time; playbook stays inactive by default.',
    triggerType: 'alert-triggered',
    active: false,
    categoryHint: 'Multi-step',
    steps: [
      {
        stepIndex: 0,
        stepType: 'condition',
        label: 'Ransomware indicators present',
        config: { field: 'alert.category', op: 'eq', value: 'ransomware' },
      },
      {
        stepIndex: 1,
        stepType: 'action',
        label: 'Immediate ransomware notify',
        config: {
          actionId: 'send-webhook',
          method: 'POST',
          body: '{"source":"hivearmor","event":"ransomware-notify-first","theme":"ransomware"}',
        },
      },
      {
        stepIndex: 2,
        stepType: 'delay',
        label: 'Short confirm before isolate',
        config: { delaySeconds: 2 },
      },
      {
        stepIndex: 3,
        stepType: 'action',
        label: 'Isolate host',
        config: { actionId: 'isolate_host', params: { duration: '24h' } },
      },
    ],
  },
  {
    id: 'scheduled-health-webhook',
    name: 'Scheduled Health Webhook',
    description:
      'Scheduled heartbeat to an external monitor. Provide inputs.url at execute time.',
    triggerType: 'scheduled',
    active: true,
    categoryHint: 'Notification',
    steps: [
      {
        stepIndex: 0,
        stepType: 'delay',
        label: 'Jitter before heartbeat',
        config: { delaySeconds: 1 },
      },
      {
        stepIndex: 1,
        stepType: 'action',
        label: 'POST health heartbeat',
        config: {
          actionId: 'send-webhook',
          method: 'POST',
          body: '{"source":"hivearmor","event":"playbook-health","status":"ok"}',
        },
      },
    ],
  },
  {
    id: 'webhook-ticket-open',
    name: 'Open Ticket via Webhook',
    description:
      'Creates a ticket by POSTing project/summary/priority/description to a ticketing webhook (SSRF-safe). Provide inputs.url or webhookUrl at execute time — no SMTP required.',
    triggerType: 'alert-triggered',
    active: true,
    categoryHint: 'Ticketing',
    steps: [
      {
        stepIndex: 0,
        stepType: 'condition',
        label: 'Severity warrants a ticket',
        config: { field: 'alert.severity', op: 'in', value: ['high', 'critical'] },
      },
      {
        stepIndex: 1,
        stepType: 'action',
        label: 'Create ticket via webhook',
        config: {
          actionId: 'create-jira-ticket',
          project: 'SOC',
          summary: 'HiveArmor alert triage ticket',
          priority: 'High',
          description: 'Opened by SOAR playbook — review alert context in HiveArmor.',
        },
      },
    ],
  },
];
