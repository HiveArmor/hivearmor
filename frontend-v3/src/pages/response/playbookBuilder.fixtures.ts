import type { Edge, Node } from 'reactflow';

import type { AiPlaybookRecommendation, PlaybookNodeData } from './playbookNodes.types';

interface FixturePlaybookGraph {
  nodes: Array<Node<PlaybookNodeData>>;
  edges: Edge[];
}

export const fixturePlaybookMetadata = {
  name: 'Endpoint containment with approval',
  description: 'Enriches a high-risk alert, requests governed approval, and isolates the affected endpoint.',
  triggerType: 'alert-triggered' as const,
};

/** Fictional, review-only Hive Intelligence proposals. Vite replaces this module in production. */
export const fixtureAiRecommendations: AiPlaybookRecommendation[] = [
  {
    id: 'ai-preserve-context',
    title: 'Preserve volatile endpoint context',
    summary: 'Collect a bounded endpoint snapshot before the containment approval.',
    rationale: 'Containment can change network and process state. Capturing authorized volatile context first improves evidence quality without changing the endpoint.',
    confidence: 94,
    risk: 'low',
    definition: {
      id: 'edr-collect-context',
      nodeType: 'action',
      label: 'Collect endpoint context',
      description: 'Capture bounded process, network, and identity context',
      category: 'EDR',
      risk: 'low',
      actionId: 'edr.collect-telemetry',
    },
    reviewPoints: ['Read-only connector action', 'Uses the selected alert entity', 'Outputs are available to later blocks'],
  },
  {
    id: 'ai-approval-expiry',
    title: 'Make approval expiry explicit',
    summary: 'Add a governed approval gate with a stop-on-expiry policy.',
    rationale: 'The draft contains a high-impact isolation action. A time-bounded human approval prevents unattended execution when the analyst context is stale.',
    confidence: 91,
    risk: 'none',
    definition: {
      id: 'governed-approval',
      nodeType: 'approval',
      label: 'SOC manager approval',
      description: 'Require an authorized reviewer before containment',
      category: 'Logic',
      risk: 'none',
    },
    reviewPoints: ['SOC manager authority', '15-minute decision SLA', 'Stops safely when approval expires'],
  },
  {
    id: 'ai-soc-notification',
    title: 'Notify the SOC of the containment decision',
    summary: 'Send a structured decision update to the authorized SOC channel.',
    rationale: 'A bounded notification gives the next analyst the verdict, approval state, and containment outcome without exposing raw event bodies.',
    confidence: 86,
    risk: 'low',
    definition: {
      id: 'notify-containment-outcome',
      nodeType: 'action',
      label: 'Notify SOC channel',
      description: 'Send a structured containment outcome to the SOC',
      category: 'Notification',
      risk: 'low',
      actionId: 'notify.soc-channel',
    },
    reviewPoints: ['Authorized channel only', 'Structured fields are redacted by policy', 'Includes the playbook and model version'],
  },
];

/** Fictional visual-review graph. Vite replaces this module in production. */
export function fixturePlaybookGraph(): FixturePlaybookGraph {
  return {
    nodes: [
      {
        id: 'trigger', type: 'playbook', position: { x: 360, y: 40 }, deletable: false,
        data: { nodeType: 'trigger', label: 'High-risk alert created', description: 'Authorized alert projection enters the flow', configured: true, triggerType: 'alert-triggered', risk: 'none', config: { severity: 'high', category: 'all' } },
      },
      {
        id: 'end', type: 'playbook', position: { x: 360, y: 760 }, deletable: false,
        data: { nodeType: 'end', label: 'Response complete', description: 'Record outcome and preserve the audit trail', configured: true, risk: 'none', config: { outcome: 'completed' } },
      },
      {
        id: 'enrich-ip', type: 'playbook', position: { x: 360, y: 170 },
        data: { nodeType: 'action', label: 'Enrich IP reputation', description: 'Normalize threat-intelligence verdicts', configured: true, actionId: 'intel.lookup-ip', actionCategory: 'Enrichment', risk: 'low', config: { params: { ipAddress: '{{ alert.source.ip }}', minimumConfidence: 70 }, timeoutSeconds: 45, retries: 1, onFailure: 'continue' } },
      },
      {
        id: 'verdict-check', type: 'playbook', position: { x: 360, y: 320 },
        data: { nodeType: 'condition', label: 'Malicious with high confidence?', description: 'Branch using the enrichment output', configured: true, risk: 'none', config: { field: 'steps.previous.verdict', operator: 'eq', value: 'malicious' } },
      },
      {
        id: 'manager-approval', type: 'playbook', position: { x: 620, y: 455 },
        data: { nodeType: 'approval', label: 'Containment approval', description: 'SOC manager reviews blast radius', configured: true, risk: 'none', config: { authority: 'ROLE_SOC_MANAGER', sla: '15m', onExpiry: 'stop' } },
      },
      {
        id: 'isolate-host', type: 'playbook', position: { x: 620, y: 610 },
        data: { nodeType: 'action', label: 'Isolate endpoint', description: 'Preserve EDR management connectivity', configured: true, actionId: 'edr.isolate-host', actionCategory: 'EDR', risk: 'high', config: { params: { hostId: '{{ alert.entity.id }}', duration: '4 hours', justification: 'High-confidence malicious activity' }, timeoutSeconds: 120, retries: 1, onFailure: 'stop' } },
      },
    ],
    edges: [
      { id: 'edge-trigger-enrich', source: 'trigger', target: 'enrich-ip' },
      { id: 'edge-enrich-verdict', source: 'enrich-ip', target: 'verdict-check' },
      { id: 'edge-verdict-approval', source: 'verdict-check', sourceHandle: 'yes', target: 'manager-approval', label: 'Malicious' },
      { id: 'edge-approval-isolate', source: 'manager-approval', target: 'isolate-host' },
      { id: 'edge-isolate-end', source: 'isolate-host', target: 'end' },
      { id: 'edge-verdict-end', source: 'verdict-check', sourceHandle: 'no', target: 'end', label: 'Benign' },
    ],
  };
}
