import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  GitBranch,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import type { Node } from 'reactflow';

import type { PlaybookNodeData } from '../playbookNodes.types';
import { TYPE_LABELS } from '../playbookNodes.types';

import { ActionParamForm } from '@/components/response-action/ActionParamForm';
import type { PlaybookTriggerType } from '@/types/playbook';
import type { ResponseAction } from '@/types/responseAction';

interface NodeConfigPanelProps {
  node: Node<PlaybookNodeData>;
  actions: ResponseAction[];
  triggerType: PlaybookTriggerType;
  onTriggerTypeChange: (value: PlaybookTriggerType) => void;
  onUpdate: (nodeId: string, data: Partial<PlaybookNodeData>) => void;
  onDelete: (nodeId: string) => void;
  onClose: () => void;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' ? value : fallback;
}

export function NodeConfigPanel({
  node,
  actions,
  triggerType,
  onTriggerTypeChange,
  onUpdate,
  onDelete,
  onClose,
}: NodeConfigPanelProps): JSX.Element {
  const data = node.data;
  const config = data.config;
  const selectedAction = actions.find((action) => action.id === data.actionId) ?? null;
  const updateConfig = (patch: Record<string, unknown>): void => onUpdate(node.id, { config: { ...config, ...patch } });

  const updateAction = (actionId: string): void => {
    const action = actions.find((item) => item.id === actionId);
    onUpdate(node.id, {
      actionId,
      label: action?.name ?? data.label,
      description: action?.description ?? data.description,
      actionCategory: action?.category,
      configured: Boolean(action),
      config: { ...config, params: {} },
    });
  };

  return (
    <aside className="soar-inspector" aria-label={`Configure ${data.label}`}>
      <header className="soar-panel-heading soar-inspector__heading">
        <span><GitBranch size={15} aria-hidden="true" /> Configure block</span>
        <button type="button" onClick={onClose} aria-label="Return to playbook inspector"><ArrowLeft size={15} /></button>
      </header>

      <div className="soar-inspector__summary" data-type={data.nodeType}>
        <span>{TYPE_LABELS[data.nodeType]}</span>
        <strong>{data.label}</strong>
        <small>Block ID · {node.id}</small>
      </div>

      <div className="soar-inspector__scroll">
        <section className="soar-config-section" aria-labelledby="config-general">
          <header id="config-general">General</header>
          <label className="soar-field">
            <span>Block label</span>
            <input
              value={data.label}
              onChange={(event) => onUpdate(node.id, { label: event.target.value })}
              aria-label="Block label"
            />
          </label>
          <label className="soar-field">
            <span>Analyst note</span>
            <textarea
              rows={2}
              value={asString(config['note'])}
              onChange={(event) => updateConfig({ note: event.target.value })}
              placeholder="Why this block exists"
            />
          </label>
        </section>

        {data.nodeType === 'trigger' && (
          <section className="soar-config-section" aria-labelledby="config-trigger">
            <header id="config-trigger">Trigger</header>
            <label className="soar-field">
              <span>Starts when</span>
              <select value={triggerType} onChange={(event) => onTriggerTypeChange(event.target.value as PlaybookTriggerType)}>
                <option value="manual">Analyst starts manually</option>
                <option value="alert-triggered">Alert matches criteria</option>
                <option value="scheduled">Schedule fires</option>
              </select>
            </label>
            {triggerType === 'alert-triggered' && (
              <>
                <label className="soar-field"><span>Minimum severity</span><select value={asString(config['severity'], 'high')} onChange={(event) => updateConfig({ severity: event.target.value })}><option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></label>
                <label className="soar-field"><span>Alert category</span><select value={asString(config['category'], 'all')} onChange={(event) => updateConfig({ category: event.target.value })}><option value="all">All authorized categories</option><option value="endpoint">Endpoint</option><option value="identity">Identity</option><option value="cloud">Cloud</option><option value="network">Network</option></select></label>
              </>
            )}
            {triggerType === 'scheduled' && <label className="soar-field"><span>Schedule</span><input value={asString(config['schedule'], 'Every 15 minutes')} onChange={(event) => updateConfig({ schedule: event.target.value })} /></label>}
            <div className="soar-policy-note"><ShieldAlert size={14} /><span>Tenant scope and trigger authorization are revalidated at execution time.</span></div>
          </section>
        )}

        {data.nodeType === 'action' && (
          <>
            <section className="soar-config-section" aria-labelledby="config-action">
              <header id="config-action">Action</header>
              <label className="soar-field">
                <span>Authorized action</span>
                <select value={data.actionId ?? ''} onChange={(event) => updateAction(event.target.value)}>
                  <option value="" disabled>Select an action</option>
                  {actions.map((action) => <option key={action.id} value={action.id}>{action.name}</option>)}
                </select>
              </label>
              {selectedAction && (
                <ActionParamForm
                  params={selectedAction.params}
                  values={(config['params'] as Record<string, unknown> | undefined) ?? {}}
                  onChange={(name, value) => updateConfig({ params: { ...((config['params'] as Record<string, unknown> | undefined) ?? {}), [name]: value } })}
                />
              )}
            </section>
            <section className="soar-config-section" aria-labelledby="config-execution">
              <header id="config-execution">Execution policy</header>
              <div className="soar-field-row">
                <label className="soar-field"><span>Timeout</span><input type="number" min={5} max={3600} value={asNumber(config['timeoutSeconds'], 120)} onChange={(event) => updateConfig({ timeoutSeconds: Number(event.target.value) })} /></label>
                <label className="soar-field"><span>Retries</span><input type="number" min={0} max={5} value={asNumber(config['retries'], 1)} onChange={(event) => updateConfig({ retries: Number(event.target.value) })} /></label>
              </div>
              <label className="soar-field"><span>If this block fails</span><select value={asString(config['onFailure'], 'stop')} onChange={(event) => updateConfig({ onFailure: event.target.value })}><option value="stop">Stop and notify owner</option><option value="continue">Continue with warning</option><option value="branch">Follow failure branch</option></select></label>
            </section>
          </>
        )}

        {data.nodeType === 'condition' && (
          <section className="soar-config-section" aria-labelledby="config-condition">
            <header id="config-condition">Decision rule</header>
            <label className="soar-field"><span>Field or prior output</span><select value={asString(config['field'], 'alert.severity')} onChange={(event) => updateConfig({ field: event.target.value, configured: true })}><option value="alert.severity">alert.severity</option><option value="alert.category">alert.category</option><option value="entity.riskScore">entity.riskScore</option><option value="steps.previous.verdict">steps.previous.verdict</option><option value="incident.status">incident.status</option></select></label>
            <label className="soar-field"><span>Operator</span><select value={asString(config['operator'], 'gte')} onChange={(event) => updateConfig({ operator: event.target.value })}><option value="eq">equals</option><option value="neq">does not equal</option><option value="gte">is at least</option><option value="contains">contains</option><option value="exists">exists</option></select></label>
            <label className="soar-field"><span>Value</span><input value={asString(config['value'], 'high')} onChange={(event) => updateConfig({ value: event.target.value })} /></label>
            <div className="soar-branch-summary"><span><i data-branch="yes" /> Yes path</span><span><i data-branch="no" /> No path</span></div>
          </section>
        )}

        {data.nodeType === 'approval' && (
          <section className="soar-config-section" aria-labelledby="config-approval">
            <header id="config-approval">Approval gate</header>
            <label className="soar-field"><span>Required authority</span><select value={asString(config['authority'], 'ROLE_SOC_MANAGER')} onChange={(event) => updateConfig({ authority: event.target.value })}><option value="ROLE_SOC_MANAGER">SOC manager</option><option value="ROLE_INCIDENT_COMMANDER">Incident commander</option><option value="ROLE_ADMIN">Platform administrator</option></select></label>
            <label className="soar-field"><span>Decision SLA</span><select value={asString(config['sla'], '15m')} onChange={(event) => updateConfig({ sla: event.target.value })}><option value="5m">5 minutes</option><option value="15m">15 minutes</option><option value="30m">30 minutes</option><option value="1h">1 hour</option></select></label>
            <label className="soar-field"><span>If approval expires</span><select value={asString(config['onExpiry'], 'stop')} onChange={(event) => updateConfig({ onExpiry: event.target.value })}><option value="stop">Stop safely</option><option value="escalate">Escalate to incident commander</option></select></label>
            <div className="soar-policy-note"><CheckCircle2 size={14} /><span>Target, blast radius, rollback guidance, and justification are shown to the approver.</span></div>
          </section>
        )}

        {data.nodeType === 'delay' && (
          <section className="soar-config-section" aria-labelledby="config-delay">
            <header id="config-delay">Wait policy</header>
            <div className="soar-field-row"><label className="soar-field"><span>Duration</span><input type="number" min={1} value={asNumber(config['duration'], 5)} onChange={(event) => updateConfig({ duration: Number(event.target.value) })} /></label><label className="soar-field"><span>Unit</span><select value={asString(config['unit'], 'minutes')} onChange={(event) => updateConfig({ unit: event.target.value })}><option value="seconds">Seconds</option><option value="minutes">Minutes</option><option value="hours">Hours</option></select></label></div>
            <label className="soar-field"><span>Resume strategy</span><select value={asString(config['resume'], 'timer')} onChange={(event) => updateConfig({ resume: event.target.value })}><option value="timer">After elapsed time</option><option value="poll">Poll until condition</option><option value="event">On external callback</option></select></label>
          </section>
        )}

        {data.nodeType === 'loop' && (
          <section className="soar-config-section" aria-labelledby="config-loop">
            <header id="config-loop">Iteration</header>
            <label className="soar-field"><span>Collection</span><input value={asString(config['collection'], 'alert.entities')} onChange={(event) => updateConfig({ collection: event.target.value })} /></label>
            <div className="soar-field-row"><label className="soar-field"><span>Maximum items</span><input type="number" min={1} max={100} value={asNumber(config['maxIterations'], 25)} onChange={(event) => updateConfig({ maxIterations: Number(event.target.value) })} /></label><label className="soar-field"><span>Concurrency</span><input type="number" min={1} max={10} value={asNumber(config['concurrency'], 3)} onChange={(event) => updateConfig({ concurrency: Number(event.target.value) })} /></label></div>
            <label className="soar-field"><span>On item failure</span><select value={asString(config['onItemFailure'], 'continue')} onChange={(event) => updateConfig({ onItemFailure: event.target.value })}><option value="continue">Continue remaining items</option><option value="stop">Stop loop</option></select></label>
          </section>
        )}

        {data.nodeType === 'parallel' && (
          <section className="soar-config-section" aria-labelledby="config-parallel">
            <header id="config-parallel">Parallel execution</header>
            <label className="soar-field"><span>Maximum concurrent paths</span><input type="number" min={2} max={10} value={asNumber(config['concurrency'], 3)} onChange={(event) => updateConfig({ concurrency: Number(event.target.value) })} /></label>
            <label className="soar-field"><span>Join policy</span><select value={asString(config['joinPolicy'], 'all')} onChange={(event) => updateConfig({ joinPolicy: event.target.value })}><option value="all">Wait for every path</option><option value="any">Continue after first success</option><option value="quorum">Continue after quorum</option></select></label>
            <label className="soar-field"><span>Failure policy</span><select value={asString(config['failurePolicy'], 'collect')} onChange={(event) => updateConfig({ failurePolicy: event.target.value })}><option value="collect">Collect failures and continue</option><option value="stop">Cancel remaining paths</option></select></label>
          </section>
        )}

        {data.nodeType === 'subplaybook' && (
          <section className="soar-config-section" aria-labelledby="config-subplaybook">
            <header id="config-subplaybook">Reusable workflow</header>
            <label className="soar-field"><span>Playbook</span><select value={asString(config['playbookId'])} onChange={(event) => updateConfig({ playbookId: event.target.value, configured: Boolean(event.target.value) })}><option value="">Select a published playbook</option><option value="pb-evidence-preservation">Evidence preservation</option><option value="pb-identity-containment">Identity containment</option><option value="pb-ticket-handoff">ITSM handoff</option></select></label>
            <label className="soar-field"><span>Version policy</span><select value={asString(config['versionPolicy'], 'pinned')} onChange={(event) => updateConfig({ versionPolicy: event.target.value })}><option value="pinned">Pin current published version</option><option value="latest-compatible">Latest compatible version</option></select></label>
            <div className="soar-policy-note"><ShieldAlert size={14} /><span>Inputs, outputs, tenant scope, and permissions are validated across the sub-playbook boundary.</span></div>
          </section>
        )}

        {data.nodeType === 'transform' && (
          <section className="soar-config-section" aria-labelledby="config-transform">
            <header id="config-transform">Data mapping</header>
            <label className="soar-field"><span>Source collection</span><input value={asString(config['source'], 'alert.entities')} onChange={(event) => updateConfig({ source: event.target.value })} /></label>
            <label className="soar-field"><span>Expression</span><textarea rows={4} value={asString(config['expression'], 'map(item => { id: item.id, type: item.type })')} onChange={(event) => updateConfig({ expression: event.target.value })} /></label>
            <label className="soar-field"><span>Output variable</span><input value={asString(config['output'], 'normalized_entities')} onChange={(event) => updateConfig({ output: event.target.value })} /></label>
          </section>
        )}

        {data.nodeType === 'intelligence' && (
          <>
            <section className="soar-config-section" aria-labelledby="config-intelligence">
              <header id="config-intelligence">Hive Intelligence task</header>
              <label className="soar-field"><span>Task</span><select value={asString(config['task'], 'summarize')} onChange={(event) => updateConfig({ task: event.target.value })}><option value="summarize">Summarize evidence</option><option value="classify">Classify alert disposition</option><option value="extract">Extract indicators</option><option value="recommend">Recommend response options</option></select></label>
              <label className="soar-field"><span>Authorized context</span><select value={asString(config['context'], 'normalized')} onChange={(event) => updateConfig({ context: event.target.value })}><option value="normalized">Normalized fields only</option><option value="evidence">Selected evidence projection</option><option value="incident">Incident summary projection</option></select></label>
              <label className="soar-field"><span>Structured output schema</span><input value={asString(config['schema'], 'soc.assessment.v1')} onChange={(event) => updateConfig({ schema: event.target.value })} /></label>
            </section>
            <section className="soar-config-section" aria-labelledby="config-intelligence-policy">
              <header id="config-intelligence-policy">AI governance</header>
              <label className="soar-field"><span>Minimum confidence</span><input type="number" min={0} max={100} value={asNumber(config['minimumConfidence'], 85)} onChange={(event) => updateConfig({ minimumConfidence: Number(event.target.value) })} /></label>
              <label className="soar-field"><span>Below threshold</span><select value={asString(config['belowThreshold'], 'human-review')} onChange={(event) => updateConfig({ belowThreshold: event.target.value })}><option value="human-review">Require analyst review</option><option value="fallback">Follow deterministic fallback</option><option value="stop">Stop safely</option></select></label>
              <div className="soar-policy-note"><ShieldAlert size={14} /><span>Prompt-injection screening, redaction, model/version provenance, token limits, and deterministic output validation are mandatory.</span></div>
            </section>
          </>
        )}

        {data.risk === 'high' && (
          <section className="soar-blast-card" aria-label="Blast radius requirement">
            <header><AlertTriangle size={14} /> High-impact action</header>
            <p>Publish requires an upstream approval gate, target preview, permission check, and rollback guidance.</p>
          </section>
        )}
      </div>

      {data.nodeType !== 'trigger' && data.nodeType !== 'end' && (
        <footer className="soar-inspector__actions">
          <button type="button" className="soar-danger-button" onClick={() => onDelete(node.id)}><Trash2 size={14} /> Delete block</button>
          <span><Clock3 size={12} /> Changes are local until saved</span>
        </footer>
      )}
    </aside>
  );
}
