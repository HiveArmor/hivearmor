import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  MarkerType,
  ReactFlow,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
} from '@reactflow/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  Braces,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Clock3,
  FilePenLine,
  FlaskConical,
  LayoutTemplate,
  Maximize2,
  Minimize2,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Play,
  Redo2,
  Save,
  Send,
  ShieldCheck,
  Undo2,
  WandSparkles,
  Wifi,
  XCircle,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import type {
  Connection,
  Edge,
  EdgeChange,
  Node,
  NodeChange,
  ReactFlowInstance,
} from 'reactflow';

import 'reactflow/dist/style.css';
import './PlaybookBuilderPage.css';

import { ActionPalette } from './components/ActionPalette';
import { NodeConfigPanel } from './components/NodeConfigPanel';
import {
  defaultApprovalConfig,
  defaultConditionConfig,
  hydrateConditionConfig,
  resolveBuilderNodeType,
  serializeStepConfig,
  toEngineStepType,
} from './playbookBuilder.serialize';
import { PlaybookNode } from './playbookNodes';
import type {
  AiPlaybookRecommendation,
  PaletteNodeDefinition,
  PlaybookNodeData,
  PlaybookNodeType,
  PlaybookRisk,
} from './playbookNodes.types';

import { HaIconButton } from '@/components/ha-icon-button';
import { HaModal } from '@/components/ha-modal/HaModal';
import { HaSwitch } from '@/components/ha-switch/HaSwitch';
import { StatusDock } from '@/components/status-dock/StatusDock';
import { useEpsStream } from '@/hooks/useEpsStream';
import { fixtureAiRecommendations, fixturePlaybookGraph, fixturePlaybookMetadata } from '@/pages/response/playbookBuilder.fixtures';
import { createPlaybook, fetchPlaybook, updatePlaybook } from '@/services/playbookService';
import { fetchResponseActionLibrary } from '@/services/responseActionService';
import type { Playbook, PlaybookStep, PlaybookTriggerType } from '@/types/playbook';
import type { ResponseAction } from '@/types/responseAction';

const fixtureMode = import.meta.env.DEV && import.meta.env.VITE_USE_FOUNDATION_FIXTURES === 'true';
const intelligencePreviewAvailable = fixtureMode || import.meta.env.MODE === 'test';

type BuilderNode = Node<PlaybookNodeData>;
type BuilderEdge = Edge;
type InspectorMode = 'readiness' | 'test' | 'variables' | 'ai';
type AiIntelligenceState = 'idle' | 'thinking' | 'ready';
type IssueSeverity = 'error' | 'warning' | 'info';

interface BuilderIssue {
  id: string;
  severity: IssueSeverity;
  title: string;
  detail: string;
  nodeId?: string;
}

interface GraphSnapshot {
  nodes: BuilderNode[];
  edges: BuilderEdge[];
}

const nodeTypes = { playbook: PlaybookNode };

function CanvasOverview({ nodes, onFit }: { nodes: BuilderNode[]; onFit: () => void }): JSX.Element {
  const bounds = useMemo(() => {
    const xs = nodes.map((node) => node.position.x);
    const ys = nodes.map((node) => node.position.y);
    return {
      minX: Math.min(...xs, 0),
      minY: Math.min(...ys, 0),
      width: Math.max(Math.max(...xs, 1) - Math.min(...xs, 0), 1),
      height: Math.max(Math.max(...ys, 1) - Math.min(...ys, 0), 1),
    };
  }, [nodes]);

  return (
    <button type="button" className="soar-canvas-overview" onClick={onFit} aria-label="Fit the complete workflow in view">
      <span className="soar-canvas-overview__label">Overview</span>
      <span className="soar-canvas-overview__map" aria-hidden="true">
        {nodes.map((node) => (
          <span
            key={node.id}
            className="soar-canvas-overview__node"
            data-node-type={node.data.nodeType}
            style={{
              left: `${8 + ((node.position.x - bounds.minX) / bounds.width) * 82}%`,
              top: `${12 + ((node.position.y - bounds.minY) / bounds.height) * 70}%`,
            }}
          />
        ))}
      </span>
    </button>
  );
}

const defaultEdgeOptions = {
  type: 'smoothstep',
  animated: true,
  style: { stroke: 'var(--ha-border-strong)', strokeWidth: 1.5 },
  markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--ha-border-strong)', width: 15, height: 15 },
};

let nodeCounter = 0;
function nextNodeId(type: PlaybookNodeType): string {
  nodeCounter += 1;
  return `${type}-${Date.now()}-${nodeCounter}`;
}

function terminalNodes(triggerType: PlaybookTriggerType): BuilderNode[] {
  return [
    {
      id: 'trigger',
      type: 'playbook',
      position: { x: 360, y: 40 },
      data: {
        nodeType: 'trigger',
        label: triggerType === 'manual' ? 'Manual analyst launch' : triggerType === 'scheduled' ? 'Scheduled response' : 'High-risk alert created',
        description: triggerType === 'manual' ? 'Analyst supplies approved inputs' : triggerType === 'scheduled' ? 'Runs on the configured cadence' : 'Authorized alert projection enters the flow',
        configured: true,
        triggerType,
        risk: 'none',
        config: { severity: 'high', category: 'all' },
      },
      deletable: false,
    },
    {
      id: 'end',
      type: 'playbook',
      position: { x: 360, y: 520 },
      data: {
        nodeType: 'end',
        label: 'Response complete',
        description: 'Record outcome and preserve the audit trail',
        configured: true,
        risk: 'none',
        config: { outcome: 'completed' },
      },
      deletable: false,
    },
  ];
}

function emptyGraph(triggerType: PlaybookTriggerType): GraphSnapshot {
  return {
    nodes: terminalNodes(triggerType),
    edges: [{ id: 'edge-trigger-end', source: 'trigger', target: 'end', ...defaultEdgeOptions }],
  };
}

function riskForAction(action: ResponseAction | undefined): PlaybookRisk {
  if (!action) return 'low';
  const value = `${action.category} ${action.name}`.toLowerCase();
  if (/isolate|disable|block|quarantine|kill|delete|revoke/.test(value)) return 'high';
  if (/ticket|contain|reset|collect|script/.test(value)) return 'medium';
  return 'low';
}

function graphFromPlaybook(playbook: Playbook, actions: ResponseAction[]): GraphSnapshot {
  const terminals = terminalNodes(playbook.triggerType);
  const stepNodes: BuilderNode[] = playbook.steps.map((step, index) => {
    const rawConfig = step.config ?? {};
    const nodeType = resolveBuilderNodeType(step);
    const config = nodeType === 'condition' ? hydrateConditionConfig(rawConfig) : rawConfig;
    const actionId = typeof config['actionId'] === 'string' ? config['actionId'] : undefined;
    const action = actions.find((item) => item.id === actionId);
    const position = config['builderPosition'] && typeof config['builderPosition'] === 'object'
      ? config['builderPosition'] as { x: number; y: number }
      : { x: 360, y: 170 + index * 145 };
    return {
      id: typeof config['builderNodeId'] === 'string' ? config['builderNodeId'] : `step-${index}`,
      type: 'playbook',
      position,
      data: {
        nodeType,
        label: step.label,
        description: typeof config['builderDescription'] === 'string' ? config['builderDescription'] : action?.description ?? 'Configured response step',
        configured: nodeType === 'action' ? Boolean(actionId) : true,
        actionId: nodeType === 'approval' ? undefined : actionId,
        actionCategory: action?.category,
        risk: nodeType === 'action' ? riskForAction(action) : 'none',
        config,
      },
    };
  });

  const allNodes = [...terminals, ...stepNodes];
  const end = allNodes.find((node) => node.id === 'end');
  if (end) end.position = { x: 360, y: Math.max(520, 170 + stepNodes.length * 145) };

  const storedEdges: BuilderEdge[] = [];
  stepNodes.forEach((node) => {
    const next = node.data.config['builderNext'];
    if (Array.isArray(next)) {
      next.forEach((value, index) => {
        if (!value || typeof value !== 'object') return;
        const edge = value as { target?: string; sourceHandle?: string; label?: string };
        if (!edge.target) return;
        storedEdges.push({ id: `edge-${node.id}-${edge.target}-${index}`, source: node.id, target: edge.target, sourceHandle: edge.sourceHandle, label: edge.label, ...defaultEdgeOptions });
      });
    }
  });

  if (storedEdges.length > 0 && stepNodes.length > 0) {
    storedEdges.unshift({ id: 'edge-trigger-entry', source: 'trigger', target: stepNodes[0].id, ...defaultEdgeOptions });
    return { nodes: allNodes, edges: storedEdges };
  }

  const ordered = ['trigger', ...stepNodes.map((node) => node.id), 'end'];
  return {
    nodes: allNodes,
    edges: ordered.slice(0, -1).map((source, index) => ({ id: `edge-${source}-${ordered[index + 1]}`, source, target: ordered[index + 1], ...defaultEdgeOptions })),
  };
}

function graphToSteps(nodes: BuilderNode[], edges: BuilderEdge[]): PlaybookStep[] {
  return nodes
    .filter((node) => node.data.nodeType !== 'trigger' && node.data.nodeType !== 'end')
    .sort((left, right) => left.position.y - right.position.y || left.position.x - right.position.x)
    .map((node, index) => ({
      stepIndex: index,
      stepType: toEngineStepType(node.data.nodeType),
      label: node.data.label,
      config: serializeStepConfig(node.data.nodeType, node.data.config, {
        actionId: node.data.actionId,
        nodeId: node.id,
        description: node.data.description,
        position: node.position,
        next: edges
          .filter((edge) => edge.source === node.id)
          .map((edge) => ({
            target: edge.target,
            sourceHandle: edge.sourceHandle ?? undefined,
            label: typeof edge.label === 'string' ? edge.label : undefined,
          })),
      }),
    }));
}

function validateGraph(name: string, nodes: BuilderNode[], edges: BuilderEdge[]): BuilderIssue[] {
  const issues: BuilderIssue[] = [];
  const workflowNodes = nodes.filter((node) => !['trigger', 'end'].includes(node.data.nodeType));
  if (!name.trim()) issues.push({ id: 'name-required', severity: 'error', title: 'Name is required', detail: 'Give this playbook a clear operational name before saving.' });
  if (workflowNodes.length === 0) issues.push({ id: 'steps-required', severity: 'error', title: 'Add at least one block', detail: 'A trigger connected directly to an outcome does not perform a response.' });

  nodes.forEach((node) => {
    const incoming = edges.filter((edge) => edge.target === node.id);
    const outgoing = edges.filter((edge) => edge.source === node.id);
    if (node.data.nodeType !== 'trigger' && incoming.length === 0) issues.push({ id: `incoming-${node.id}`, severity: 'error', nodeId: node.id, title: `${node.data.label} is disconnected`, detail: 'Connect an upstream block so this path can execute.' });
    if (node.data.nodeType !== 'end' && outgoing.length === 0) issues.push({ id: `outgoing-${node.id}`, severity: 'error', nodeId: node.id, title: `${node.data.label} has no outcome`, detail: 'Connect the block to a downstream path.' });
    if (node.data.nodeType === 'action' && !node.data.actionId) issues.push({ id: `action-${node.id}`, severity: 'error', nodeId: node.id, title: `${node.data.label} needs an action`, detail: 'Select an authorized connector action in the configuration panel.' });
    if (node.data.nodeType === 'condition' && outgoing.length < 2) issues.push({ id: `branch-${node.id}`, severity: 'warning', nodeId: node.id, title: `${node.data.label} needs both paths`, detail: 'Connect explicit Yes and No outcomes to avoid an ambiguous branch.' });
    if (node.data.nodeType === 'condition' && !node.data.config['field']) issues.push({ id: `condition-${node.id}`, severity: 'error', nodeId: node.id, title: `${node.data.label} is incomplete`, detail: 'Choose a field, operator, and comparison value.' });
    if (node.data.nodeType === 'action' && node.data.risk === 'high') {
      const hasApproval = incoming.some((edge) => nodes.find((item) => item.id === edge.source)?.data.nodeType === 'approval');
      if (!hasApproval) issues.push({ id: `approval-${node.id}`, severity: 'error', nodeId: node.id, title: `${node.data.label} requires approval`, detail: 'Place a governed approval block immediately before this high-impact action.' });
    }
  });
  issues.push({ id: 'publish-contract', severity: 'info', title: 'Authoritative publish gate required', detail: 'Server validation, connector readiness, preview token, version, and approval policy must pass before activation.' });
  return issues;
}

function autoLayout(nodes: BuilderNode[], edges: BuilderEdge[]): BuilderNode[] {
  const depths = new Map<string, number>([['trigger', 0]]);
  for (let pass = 0; pass < nodes.length; pass += 1) {
    edges.forEach((edge) => {
      const sourceDepth = depths.get(edge.source);
      if (sourceDepth != null) depths.set(edge.target, Math.max(depths.get(edge.target) ?? 0, sourceDepth + 1));
    });
  }
  const groups = new Map<number, BuilderNode[]>();
  nodes.forEach((node) => {
    const depth = depths.get(node.id) ?? 1;
    groups.set(depth, [...(groups.get(depth) ?? []), node]);
  });
  return nodes.map((node) => {
    const depth = depths.get(node.id) ?? 1;
    const siblings = groups.get(depth) ?? [node];
    const index = siblings.findIndex((item) => item.id === node.id);
    return { ...node, position: { x: 350 + (index - (siblings.length - 1) / 2) * 260, y: 40 + depth * 155 } };
  });
}

function WorkspaceInspector({
  mode,
  issues,
  nodes,
  onModeChange,
  onSelectIssue,
  testState,
  onRunTest,
  aiPrompt,
  aiState,
  aiRecommendations,
  aiAvailable,
  onAiPromptChange,
  onGenerateAiDraft,
  onApplyAiRecommendation,
  onDismissAiRecommendation,
}: {
  mode: InspectorMode;
  issues: BuilderIssue[];
  nodes: BuilderNode[];
  onModeChange: (mode: InspectorMode) => void;
  onSelectIssue: (nodeId: string) => void;
  testState: 'idle' | 'running' | 'passed';
  onRunTest: () => void;
  aiPrompt: string;
  aiState: AiIntelligenceState;
  aiRecommendations: AiPlaybookRecommendation[];
  aiAvailable: boolean;
  onAiPromptChange: (value: string) => void;
  onGenerateAiDraft: () => void;
  onApplyAiRecommendation: (recommendation: AiPlaybookRecommendation) => void;
  onDismissAiRecommendation: (recommendationId: string) => void;
}): JSX.Element {
  const errorCount = issues.filter((issue) => issue.severity === 'error').length;
  const warningCount = issues.filter((issue) => issue.severity === 'warning').length;
  return (
    <aside className="soar-inspector" aria-label="Playbook inspector">
      <header className="soar-panel-heading soar-inspector__heading">
        <span><ShieldCheck size={15} /> Inspector</span>
      </header>
      <div className="soar-inspector__tabs" role="tablist" aria-label="Inspector views">
        <button type="button" role="tab" aria-selected={mode === 'readiness'} onClick={() => onModeChange('readiness')}>Readiness <small>{errorCount + warningCount}</small></button>
        <button type="button" role="tab" aria-selected={mode === 'test'} onClick={() => onModeChange('test')}>Test</button>
        <button type="button" role="tab" aria-selected={mode === 'variables'} onClick={() => onModeChange('variables')}>Data</button>
        <button type="button" role="tab" aria-selected={mode === 'ai'} onClick={() => onModeChange('ai')}><Bot size={12} /> Intelligence</button>
      </div>

      <div className="soar-inspector__scroll">
        {mode === 'readiness' && (
          <>
            <section className="soar-readiness-summary" data-ready={errorCount === 0 || undefined}>
              {errorCount === 0 ? <CheckCircle2 size={22} /> : <CircleAlert size={22} />}
              <div><strong>{errorCount === 0 ? 'Draft is structurally ready' : `${errorCount} blocking issue${errorCount === 1 ? '' : 's'}`}</strong><span>{warningCount} warnings · client validation</span></div>
            </section>
            <section className="soar-config-section"><header>Validation</header><div className="soar-issue-list">{issues.map((issue) => (
              <button key={issue.id} type="button" data-severity={issue.severity} onClick={() => issue.nodeId && onSelectIssue(issue.nodeId)} disabled={!issue.nodeId}>
                {issue.severity === 'error' ? <XCircle size={14} /> : issue.severity === 'warning' ? <AlertTriangle size={14} /> : <ShieldCheck size={14} />}
                <span><strong>{issue.title}</strong><small>{issue.detail}</small></span>
                {issue.nodeId && <ChevronDown size={13} />}
              </button>
            ))}</div></section>
            <section className="soar-config-section"><header>Publish gates</header><ul className="soar-gate-list"><li data-state="ready"><CheckCircle2 size={13} /> Graph structure</li><li data-state="pending"><Clock3 size={13} /> Connector readiness</li><li data-state="pending"><Clock3 size={13} /> Blast-radius preview</li><li data-state="pending"><Clock3 size={13} /> Authoritative validation</li></ul></section>
          </>
        )}

        {mode === 'test' && (
          <>
            <section className="soar-test-boundary"><FlaskConical size={19} /><div><strong>Safe simulation</strong><span>Uses one fictional alert and never executes connectors.</span></div></section>
            <section className="soar-config-section"><header>Test input</header><label className="soar-field"><span>Sample</span><select aria-label="Playbook test sample"><option>Critical endpoint alert</option><option>High-risk identity alert</option><option>Benign enrichment result</option></select></label><div className="soar-test-record"><span>alert.id</span><code>ALT-84021</code><span>entity</span><code>FIN-WKS-044</code><span>severity</span><code>critical</code></div><button type="button" className="soar-primary-wide" onClick={onRunTest} disabled={testState === 'running'}><Play size={14} /> {testState === 'running' ? 'Running simulation…' : testState === 'passed' ? 'Run again' : 'Run safe test'}</button></section>
            <section className="soar-config-section"><header>Execution trace</header><ol className="soar-trace">{nodes.filter((node) => node.data.nodeType !== 'end').map((node, index) => <li key={node.id} data-state={testState === 'passed' ? 'passed' : testState === 'running' && index < 2 ? 'running' : 'idle'}><span>{index + 1}</span><div><strong>{node.data.label}</strong><small>{testState === 'passed' ? 'Simulated · no side effects' : 'Waiting'}</small></div></li>)}</ol></section>
          </>
        )}

        {mode === 'variables' && (
          <>
            <section className="soar-config-section"><header>Trigger data</header><div className="soar-variable-list"><button type="button"><Braces size={13} /><code>alert.*</code><span>24 fields</span></button><button type="button"><Braces size={13} /><code>entity.*</code><span>12 fields</span></button><button type="button"><Braces size={13} /><code>incident.*</code><span>9 fields</span></button></div></section>
            <section className="soar-config-section"><header>Prior block outputs</header><div className="soar-variable-list">{nodes.filter((node) => node.data.nodeType === 'action').map((node) => <button key={node.id} type="button"><Network size={13} /><code>{`steps.${node.id}.*`}</code><span>dynamic</span></button>)}</div></section>
            <section className="soar-policy-note"><ShieldCheck size={14} /><span>Sensitive output fields are permission-filtered before they enter the workflow context.</span></section>
          </>
        )}

        {mode === 'ai' && (
          <>
            <section className="soar-ai-boundary">
              <div className="soar-ai-boundary__mark"><Bot size={18} /></div>
              <div><strong>Hive Intelligence</strong><span>Governed playbook coauthor</span></div>
              <small>Review required</small>
            </section>
            <section className="soar-config-section">
              <header>Describe the response outcome</header>
              <label className="soar-field">
                <span className="sr-only">Hive Intelligence request</span>
                <textarea
                  value={aiPrompt}
                  onChange={(event) => onAiPromptChange(event.target.value)}
                  rows={4}
                  placeholder="Example: preserve evidence, enrich the indicators, and contain the endpoint only after approval."
                  aria-label="Hive Intelligence playbook request"
                />
              </label>
              <div className="soar-ai-context" aria-label="Hive Intelligence context boundary">
                <span>Current graph</span><span>Authorized actions</span><span>Alert schema</span><span>Tenant policy</span>
              </div>
              {!aiAvailable && <div className="soar-ai-unavailable"><CircleAlert size={13} /><span>AI graph coauthoring is unavailable until the governed RESP-019 service is connected.</span></div>}
              <button type="button" className="soar-primary-wide" onClick={onGenerateAiDraft} disabled={!aiAvailable || aiState === 'thinking' || !aiPrompt.trim()}>
                <WandSparkles size={14} /> {aiState === 'thinking' ? 'Analyzing governed context…' : 'Generate reviewable changes'}
              </button>
            </section>
            <section className="soar-config-section soar-ai-proposals">
              <header>Proposed changes <span>{aiRecommendations.length}</span></header>
              {aiState === 'idle' && <div className="soar-ai-empty"><Bot size={21} /><strong>Ask for a safer response path</strong><span>Hive Intelligence returns discrete graph changes—not an autonomous playbook.</span></div>}
              {aiState === 'thinking' && <div className="soar-ai-thinking" role="status"><WandSparkles size={18} /><span>Checking graph structure, action permissions, and response policy…</span></div>}
              {aiState === 'ready' && aiRecommendations.length === 0 && <div className="soar-ai-empty"><CheckCircle2 size={21} /><strong>No pending proposals</strong><span>Every generated change was reviewed or dismissed.</span></div>}
              {aiRecommendations.map((recommendation) => (
                <article key={recommendation.id} className="soar-ai-card" data-risk={recommendation.risk}>
                  <header><span><WandSparkles size={13} /> {recommendation.title}</span><strong>{recommendation.confidence}%</strong></header>
                  <p>{recommendation.summary}</p>
                  <details><summary>Why this is suggested</summary><p>{recommendation.rationale}</p><ul>{recommendation.reviewPoints.map((point) => <li key={point}>{point}</li>)}</ul></details>
                  <footer><button type="button" onClick={() => onDismissAiRecommendation(recommendation.id)}>Dismiss</button><button type="button" onClick={() => onApplyAiRecommendation(recommendation)}><CheckCircle2 size={13} /> Apply to draft</button></footer>
                </article>
              ))}
            </section>
            <section className="soar-ai-safety"><ShieldCheck size={14} /><span>Suggestions are untrusted drafts. Hive Intelligence cannot save, approve, publish, or execute. Secrets and raw event bodies are excluded.</span></section>
          </>
        )}
      </div>
    </aside>
  );
}

export function PlaybookBuilderPage(): JSX.Element {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const epsStream = useEpsStream();
  const numericId = id ? Number.parseInt(id, 10) : NaN;
  const isEditMode = Boolean(id) && Number.isFinite(numericId);
  const initialGraph = useMemo(() => fixtureMode && !isEditMode ? fixturePlaybookGraph() : emptyGraph('manual'), [isEditMode]);

  const [name, setName] = useState(fixtureMode && !isEditMode ? fixturePlaybookMetadata.name : '');
  const [description, setDescription] = useState(fixtureMode && !isEditMode ? fixturePlaybookMetadata.description : '');
  const [active, setActive] = useState(false);
  const [triggerType, setTriggerType] = useState<PlaybookTriggerType>(fixtureMode && !isEditMode ? fixturePlaybookMetadata.triggerType : 'manual');
  const [nodes, setNodes] = useState<BuilderNode[]>(initialGraph.nodes);
  const [edges, setEdges] = useState<BuilderEdge[]>(initialGraph.edges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [inspectorMode, setInspectorMode] = useState<InspectorMode>('readiness');
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('Preserve evidence, enrich the indicators, and contain the endpoint only after governed approval.');
  const [aiState, setAiState] = useState<AiIntelligenceState>('idle');
  const [aiRecommendations, setAiRecommendations] = useState<AiPlaybookRecommendation[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [testState, setTestState] = useState<'idle' | 'running' | 'passed'>('idle');
  const [lastValidatedAt, setLastValidatedAt] = useState<string | null>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
  const undoStack = useRef<GraphSnapshot[]>([]);
  const redoStack = useRef<GraphSnapshot[]>([]);
  const panelsBeforeFocus = useRef({ paletteOpen: true, inspectorOpen: true });

  const actionQuery = useQuery<ResponseAction[], Error>({
    queryKey: ['response-action-library'],
    queryFn: fetchResponseActionLibrary,
    staleTime: 300_000,
  });

  const playbookQuery = useQuery<Playbook, Error>({
    queryKey: ['playbook', numericId],
    queryFn: () => fetchPlaybook(numericId),
    enabled: isEditMode,
    staleTime: 300_000,
  });

  useEffect(() => {
    if (!playbookQuery.data) return;
    const playbook = playbookQuery.data;
    const graph = graphFromPlaybook(playbook, actionQuery.data ?? []);
    setName(playbook.name);
    setDescription(playbook.description ?? '');
    setActive(playbook.active);
    setTriggerType(playbook.triggerType);
    setNodes(graph.nodes);
    setEdges(graph.edges);
    setIsDirty(false);
  }, [actionQuery.data, playbookQuery.data]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent): void => {
      if (!isDirty) return;
      event.preventDefault();
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [isDirty]);

  const issues = useMemo(() => validateGraph(name, nodes, edges), [edges, name, nodes]);
  const errorCount = issues.filter((issue) => issue.severity === 'error').length;
  const warningCount = issues.filter((issue) => issue.severity === 'warning').length;
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? null;

  const pushUndo = useCallback(() => {
    undoStack.current = [...undoStack.current.slice(-39), { nodes, edges }];
    redoStack.current = [];
  }, [edges, nodes]);

  const commitGraph = useCallback((nextNodes: BuilderNode[], nextEdges: BuilderEdge[]): void => {
    pushUndo();
    setNodes(nextNodes);
    setEdges(nextEdges);
    setIsDirty(true);
  }, [pushUndo]);

  const undo = useCallback((): void => {
    const previous = undoStack.current[undoStack.current.length - 1];
    if (!previous) return;
    redoStack.current = [...redoStack.current, { nodes, edges }];
    undoStack.current = undoStack.current.slice(0, -1);
    setNodes(previous.nodes);
    setEdges(previous.edges);
    setIsDirty(true);
  }, [edges, nodes]);

  const redo = useCallback((): void => {
    const next = redoStack.current[redoStack.current.length - 1];
    if (!next) return;
    undoStack.current = [...undoStack.current, { nodes, edges }];
    redoStack.current = redoStack.current.slice(0, -1);
    setNodes(next.nodes);
    setEdges(next.edges);
    setIsDirty(true);
  }, [edges, nodes]);

  const onNodesChange = useCallback((changes: NodeChange[]): void => {
    setNodes((current) => applyNodeChanges(changes, current));
    if (changes.some((change) => change.type === 'remove' || (change.type === 'position' && !change.dragging))) setIsDirty(true);
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange[]): void => {
    setEdges((current) => applyEdgeChanges(changes, current));
    if (changes.some((change) => change.type === 'remove')) setIsDirty(true);
  }, []);

  const onConnect = useCallback((connection: Connection): void => {
    if (!connection.source || !connection.target || connection.source === connection.target) return;
    pushUndo();
    setEdges((current) => addEdge({ ...connection, id: `edge-${connection.source}-${connection.target}-${Date.now()}`, ...defaultEdgeOptions }, current));
    setIsDirty(true);
  }, [pushUndo]);

  const addNode = useCallback((definition: PaletteNodeDefinition, requestedPosition?: { x: number; y: number }): void => {
    const id = nextNodeId(definition.nodeType);
    const selected = nodes.find((node) => node.id === selectedNodeId);
    const position = requestedPosition ?? (selected
      ? { x: selected.position.x, y: selected.position.y + 155 }
      : { x: 360, y: 250 + nodes.length * 16 });
    const newNode: BuilderNode = {
      id,
      type: 'playbook',
      position,
      data: {
        nodeType: definition.nodeType,
        label: definition.label,
        description: definition.description,
        configured: definition.nodeType !== 'action' || Boolean(definition.actionId),
        actionId: definition.actionId,
        actionCategory: definition.category,
        risk: definition.risk,
        config: definition.nodeType === 'condition'
          ? defaultConditionConfig()
          : definition.nodeType === 'approval'
            ? defaultApprovalConfig()
            : definition.nodeType === 'delay'
              ? { duration: 5, unit: 'minutes', resume: 'timer' }
            : definition.nodeType === 'loop'
                ? { collection: 'alert.entities', maxIterations: 25, concurrency: 3, onItemFailure: 'continue' }
                : definition.nodeType === 'parallel'
                  ? { concurrency: 3, joinPolicy: 'all', failurePolicy: 'collect' }
                  : definition.nodeType === 'subplaybook'
                    ? { playbookId: '', versionPolicy: 'pinned' }
                    : definition.nodeType === 'transform'
                      ? { source: 'alert.entities', expression: 'map(item => { id: item.id, type: item.type })', output: 'normalized_entities' }
                      : definition.nodeType === 'intelligence'
                        ? { task: 'summarize', context: 'normalized', schema: 'soc.assessment.v1', minimumConfidence: 85, belowThreshold: 'human-review' }
                        : { params: {}, timeoutSeconds: 120, retries: 1, onFailure: 'stop' },
      },
    };

    const sourceId = selected && selected.data.nodeType !== 'end'
      ? selected.id
      : edges.find((edge) => edge.target === 'end')?.source ?? 'trigger';
    const outgoing = edges.find((edge) => edge.source === sourceId && edge.sourceHandle !== 'no');
    const targetId = outgoing?.target ?? 'end';
    const nextEdges = edges.filter((edge) => edge.id !== outgoing?.id);
    nextEdges.push({ id: `edge-${sourceId}-${id}`, source: sourceId, target: id, sourceHandle: selected?.data.nodeType === 'condition' ? 'yes' : undefined, ...defaultEdgeOptions });
    nextEdges.push({ id: `edge-${id}-${targetId}`, source: id, target: targetId, ...defaultEdgeOptions });
    commitGraph([...nodes, newNode], nextEdges);
    setSelectedNodeId(id);
    setInspectorOpen(true);
  }, [commitGraph, edges, nodes, selectedNodeId]);

  const generateAiDraft = useCallback((): void => {
    if (!intelligencePreviewAvailable || !aiPrompt.trim() || aiState === 'thinking') return;
    setAiState('thinking');
    window.setTimeout(() => {
      setAiRecommendations(fixtureAiRecommendations);
      setAiState('ready');
    }, 720);
  }, [aiPrompt, aiState]);

  const applyAiRecommendation = useCallback((recommendation: AiPlaybookRecommendation): void => {
    addNode(recommendation.definition);
    setAiRecommendations((current) => current.filter((item) => item.id !== recommendation.id));
  }, [addNode]);

  const dismissAiRecommendation = useCallback((recommendationId: string): void => {
    setAiRecommendations((current) => current.filter((item) => item.id !== recommendationId));
  }, []);

  const deleteNode = useCallback((nodeId: string): void => {
    const node = nodes.find((item) => item.id === nodeId);
    if (!node || node.data.nodeType === 'trigger' || node.data.nodeType === 'end') return;
    const incoming = edges.filter((edge) => edge.target === nodeId);
    const outgoing = edges.filter((edge) => edge.source === nodeId);
    const remaining = edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId);
    if (incoming.length === 1 && outgoing.length === 1) remaining.push({ id: `edge-${incoming[0].source}-${outgoing[0].target}-${Date.now()}`, source: incoming[0].source, sourceHandle: incoming[0].sourceHandle, target: outgoing[0].target, ...defaultEdgeOptions });
    commitGraph(nodes.filter((item) => item.id !== nodeId), remaining);
    setSelectedNodeId(null);
  }, [commitGraph, edges, nodes]);

  const updateNode = useCallback((nodeId: string, data: Partial<PlaybookNodeData>): void => {
    setNodes((current) => current.map((node) => node.id === nodeId ? { ...node, data: { ...node.data, ...data } } : node));
    setIsDirty(true);
  }, []);

  const updateTriggerType = useCallback((value: PlaybookTriggerType): void => {
    setTriggerType(value);
    setNodes((current) => current.map((node) => node.id === 'trigger' ? {
      ...node,
      data: {
        ...node.data,
        triggerType: value,
        label: value === 'manual' ? 'Manual analyst launch' : value === 'scheduled' ? 'Scheduled response' : 'Alert matches criteria',
        description: value === 'manual' ? 'Analyst supplies approved inputs' : value === 'scheduled' ? 'Runs on the configured cadence' : 'Authorized alert projection enters the flow',
      },
    } : node));
    setIsDirty(true);
  }, []);

  const onDrop = useCallback((event: React.DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    const raw = event.dataTransfer.getData('application/hivearmor-playbook-node');
    if (!raw || !reactFlowInstance) return;
    try {
      const definition = JSON.parse(raw) as PaletteNodeDefinition;
      const bounds = event.currentTarget.getBoundingClientRect();
      addNode(definition, reactFlowInstance.project({ x: event.clientX - bounds.left, y: event.clientY - bounds.top }));
    } catch {
      // Ignore malformed drag payloads. Palette click remains available.
    }
  }, [addNode, reactFlowInstance]);

  const layoutGraph = useCallback((): void => {
    commitGraph(autoLayout(nodes, edges), edges);
    window.setTimeout(() => reactFlowInstance?.fitView({ padding: 0.2, duration: 260 }), 0);
  }, [commitGraph, edges, nodes, reactFlowInstance]);

  const runValidation = useCallback((): void => {
    setSelectedNodeId(null);
    setInspectorOpen(true);
    setInspectorMode('readiness');
    setLastValidatedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
  }, []);

  const runTest = useCallback((): void => {
    setTestState('running');
    window.setTimeout(() => setTestState('passed'), 900);
  }, []);

  const saveMutation = useMutation({
    mutationFn: async (): Promise<Playbook> => {
      const steps = graphToSteps(nodes, edges);
      const payload = { name: name.trim(), description: description.trim(), active, triggerType, steps };
      return isEditMode ? updatePlaybook(numericId, payload) : createPlaybook(payload);
    },
    onSuccess: (saved) => {
      setIsDirty(false);
      void queryClient.invalidateQueries({ queryKey: ['playbooks'] });
      void queryClient.invalidateQueries({ queryKey: ['playbook', saved.id] });
      navigate(`/response/playbooks/${saved.id}`);
    },
  });

  const saveDraft = useCallback((): void => {
    runValidation();
    if (errorCount > 0) return;
    saveMutation.mutate();
  }, [errorCount, runValidation, saveMutation]);

  const enterFocusMode = useCallback((): void => {
    panelsBeforeFocus.current = { paletteOpen, inspectorOpen };
    setPaletteOpen(false);
    setInspectorOpen(false);
    setSelectedNodeId(null);
    setIsFocusMode(true);
    window.setTimeout(() => reactFlowInstance?.fitView({ padding: 0.14, duration: 240 }), 0);
  }, [inspectorOpen, paletteOpen, reactFlowInstance]);

  const exitFocusMode = useCallback((): void => {
    setPaletteOpen(panelsBeforeFocus.current.paletteOpen);
    setInspectorOpen(panelsBeforeFocus.current.inspectorOpen);
    setIsFocusMode(false);
    window.setTimeout(() => reactFlowInstance?.fitView({ padding: 0.18, duration: 240 }), 0);
  }, [reactFlowInstance]);

  useEffect(() => {
    const handleKeyboard = (event: KeyboardEvent): void => {
      const target = event.target;
      const isEditing = target instanceof Element && target.matches('input, textarea, select, [contenteditable="true"]');
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        saveDraft();
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z' && !event.shiftKey) {
        event.preventDefault();
        undo();
      } else if ((event.metaKey || event.ctrlKey) && (event.key.toLowerCase() === 'y' || (event.shiftKey && event.key.toLowerCase() === 'z'))) {
        event.preventDefault();
        redo();
      } else if (!isEditing && (event.key === 'Delete' || event.key === 'Backspace') && selectedNodeId) {
        event.preventDefault();
        deleteNode(selectedNodeId);
      } else if (event.key === 'Escape' && isFocusMode) {
        exitFocusMode();
      } else if (event.key === 'Escape') {
        setSelectedNodeId(null);
      } else if (!isEditing && event.key === '/') {
        event.preventDefault();
        document.querySelector<HTMLInputElement>('[aria-label="Find playbook blocks"]')?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyboard);
    return () => window.removeEventListener('keydown', handleKeyboard);
  }, [deleteNode, exitFocusMode, isFocusMode, redo, saveDraft, selectedNodeId, undo]);

  if (isEditMode && playbookQuery.isLoading) {
    return <div className="soar-builder-page" aria-busy="true"><div className="soar-builder-skeleton soar-builder-skeleton--header" /><div className="soar-builder-skeleton soar-builder-skeleton--body" /></div>;
  }

  return (
    <section className={`soar-builder-page${isFocusMode ? ' soar-builder-page--focus' : ''}`} aria-label="SOAR playbook builder">
      <header className="soar-builder-header">
        <div className="soar-builder-header__identity">
          <HaIconButton className="soar-icon-button" onClick={() => isDirty ? setShowLeaveModal(true) : navigate("/response/playbooks")} aria-label="Back to playbooks" icon={<ArrowLeft size={16} />} />
          <span className="soar-builder-header__mark"><Network size={18} /></span>
          <div><small>{isEditMode ? 'EDIT RESPONSE PLAYBOOK' : 'RESPONSE AUTOMATION'}</small><h1>{name.trim() || 'Untitled playbook'}</h1></div>
          <span className="soar-draft-chip">Draft</span>
        </div>
        <div className="soar-builder-header__status" aria-live="polite">
          <span data-tone={errorCount ? 'error' : 'healthy'}>{errorCount ? <CircleAlert size={13} /> : <CheckCircle2 size={13} />}{errorCount} errors</span>
          <span>{warningCount} warnings</span>
          {lastValidatedAt && <span>Validated {lastValidatedAt}</span>}
        </div>
        <div className="soar-builder-header__actions">
          <button type="button" className="soar-toolbar-button" onClick={undo} disabled={undoStack.current.length === 0} aria-label="Undo"><Undo2 size={15} /></button>
          <button type="button" className="soar-toolbar-button" onClick={redo} disabled={redoStack.current.length === 0} aria-label="Redo"><Redo2 size={15} /></button>
          <button type="button" className="soar-toolbar-button soar-toolbar-button--label" onClick={() => { setSelectedNodeId(null); setInspectorOpen(true); setInspectorMode('test'); }}><FlaskConical size={15} /> Test</button>
          <button type="button" className="soar-toolbar-button soar-toolbar-button--label" onClick={() => { setSelectedNodeId(null); setInspectorOpen(true); setInspectorMode('ai'); }}><Bot size={15} /> Intelligence</button>
          <button type="button" className="soar-toolbar-button soar-toolbar-button--label" onClick={runValidation}><ShieldCheck size={15} /> Validate</button>
          <button type="button" className="soar-toolbar-button soar-toolbar-button--label" onClick={enterFocusMode} aria-label="Open full screen builder"><Maximize2 size={15} /> Full screen</button>
          <button type="button" className="soar-toolbar-button soar-toolbar-button--label" onClick={saveDraft} disabled={saveMutation.isPending}><Save size={15} /> {saveMutation.isPending ? 'Saving…' : 'Save draft'}</button>
          <button type="button" className="soar-publish-button" onClick={runValidation} aria-describedby="publish-contract-note"><Send size={15} /> Publish</button>
        </div>
      </header>

      <div className="soar-definition-bar">
        <button type="button" className="soar-definition-summary" onClick={() => setShowDetailsModal(true)} aria-label="Edit playbook identity and purpose">
          <FilePenLine size={14} aria-hidden="true" />
          <span><strong>Playbook details</strong><small>{description.trim() || 'Add purpose, owner, and operating notes'}</small></span>
        </button>
        <label className="soar-definition-select"><span>Trigger</span><select value={triggerType} onChange={(event) => updateTriggerType(event.target.value as PlaybookTriggerType)} aria-label="Playbook trigger"><option value="manual">Manual</option><option value="alert-triggered">Alert event</option><option value="scheduled">Scheduled</option></select></label>
        <label className="soar-definition-select"><span>Scope</span><select aria-label="Playbook tenant scope" defaultValue="authorized"><option value="authorized">All authorized tenants</option><option value="selected">Selected tenants</option></select></label>
        <HaSwitch id="playbook-active" label="Enable after publish" isChecked={active} onChange={(value) => { setActive(value); setIsDirty(true); }} />
      </div>

      {saveMutation.isError && <div className="soar-builder-banner" role="alert"><AlertTriangle size={14} />{saveMutation.error instanceof Error ? saveMutation.error.message : 'Playbook draft could not be saved.'}</div>}
      {playbookQuery.isError && <div className="soar-builder-banner" role="alert"><AlertTriangle size={14} />The playbook definition is unavailable or outside your authorized scope.</div>}

      <main className="soar-builder-workspace">
        {paletteOpen && <ActionPalette actions={actionQuery.data ?? []} isLoading={actionQuery.isLoading} isError={actionQuery.isError} onAddNode={addNode} />}

        <section className="soar-canvas-stage" aria-label="Visual playbook canvas">
          <div className="soar-canvas-toolbar">
            <button type="button" onClick={() => setPaletteOpen((value) => !value)} aria-label={paletteOpen ? 'Close block library' : 'Open block library'}>{paletteOpen ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}</button>
            <span className="soar-canvas-toolbar__divider" />
            <button type="button" onClick={layoutGraph}><WandSparkles size={15} /> Auto arrange</button>
            <button type="button" onClick={() => reactFlowInstance?.fitView({ padding: 0.2, duration: 220 })}><LayoutTemplate size={15} /> Fit</button>
            <button type="button" onClick={() => reactFlowInstance?.zoomOut({ duration: 160 })} aria-label="Zoom out"><ZoomOut size={15} /></button>
            <button type="button" onClick={() => reactFlowInstance?.zoomIn({ duration: 160 })} aria-label="Zoom in"><ZoomIn size={15} /></button>
            <span className="soar-canvas-toolbar__summary"><Network size={13} /> {nodes.length} blocks · {edges.length} paths</span>
            {isFocusMode && <span className="soar-focus-status"><Maximize2 size={12} /> Full screen canvas <kbd>Esc</kbd> exit</span>}
            <button type="button" className="soar-canvas-toolbar__right" onClick={() => { setSelectedNodeId(null); setInspectorOpen(true); setInspectorMode('ai'); }} aria-label="Open Hive Intelligence"><Bot size={15} /> Intelligence</button>
            {isFocusMode ? (
              <button type="button" onClick={exitFocusMode} aria-label="Exit full screen builder"><Minimize2 size={15} /> Exit full screen</button>
            ) : (
              <button type="button" onClick={enterFocusMode} aria-label="Open full screen builder"><Maximize2 size={15} /></button>
            )}
            <button type="button" onClick={() => setInspectorOpen((value) => !value)} aria-label={inspectorOpen ? 'Close inspector' : 'Open inspector'}>{inspectorOpen ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}</button>
          </div>
          <div className="soar-canvas" onDrop={onDrop} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; }}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              defaultEdgeOptions={defaultEdgeOptions}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onInit={setReactFlowInstance}
              onNodeClick={(_, node) => { setSelectedNodeId(node.id); setInspectorOpen(true); }}
              onPaneClick={() => setSelectedNodeId(null)}
              onNodesDelete={(deleted) => deleted.forEach((node) => deleteNode(node.id))}
              fitView
              fitViewOptions={{ padding: 0.18, maxZoom: 1 }}
              minZoom={0.35}
              maxZoom={1.65}
              proOptions={{ hideAttribution: true }}
              snapToGrid
              snapGrid={[16, 16]}
              nodesFocusable
              edgesFocusable
              elementsSelectable
              deleteKeyCode={['Backspace', 'Delete']}
              aria-label="Low-code SOAR playbook workflow"
            />
            <CanvasOverview nodes={nodes} onFit={() => reactFlowInstance?.fitView({ padding: 0.2, duration: 220 })} />
            {nodes.filter((node) => !['trigger', 'end'].includes(node.data.nodeType)).length === 0 && (
              <div className="soar-canvas-empty"><Network size={26} /><strong>Build the response path</strong><span>Drag an action or logic block here, or select one from the library.</span><button type="button" onClick={() => setPaletteOpen(true)}>Browse blocks</button></div>
            )}
          </div>
        </section>

        {inspectorOpen ? (
          selectedNode ? (
            <NodeConfigPanel node={selectedNode} actions={actionQuery.data ?? []} triggerType={triggerType} onTriggerTypeChange={updateTriggerType} onUpdate={updateNode} onDelete={deleteNode} onClose={() => setSelectedNodeId(null)} />
          ) : (
            <WorkspaceInspector
              mode={inspectorMode}
              issues={issues}
              nodes={nodes}
              onModeChange={setInspectorMode}
              onSelectIssue={(nodeId) => { setSelectedNodeId(nodeId); setInspectorOpen(true); }}
              testState={testState}
              onRunTest={runTest}
              aiPrompt={aiPrompt}
              aiState={aiState}
              aiRecommendations={aiRecommendations}
              aiAvailable={intelligencePreviewAvailable}
              onAiPromptChange={setAiPrompt}
              onGenerateAiDraft={generateAiDraft}
              onApplyAiRecommendation={applyAiRecommendation}
              onDismissAiRecommendation={dismissAiRecommendation}
            />
          )
        ) : null}
      </main>

      <footer className="soar-builder-footer">
        <StatusDock sseConnected={epsStream.connected} eps={epsStream.eps} mode={fixtureMode ? 'historical' : 'live'} />
        <span><Wifi size={12} /> Draft stored locally until saved</span>
        <span><Network size={12} /> {nodes.length} blocks · {edges.length} paths</span>
        <span id="publish-contract-note" className="soar-builder-footer__right"><ShieldCheck size={12} /> Publish requires authoritative backend gates</span>
      </footer>

      <HaModal isOpen={showLeaveModal} onClose={() => setShowLeaveModal(false)} title="Leave without saving?" width={460} className="soar-confirm-modal">
        <div className="soar-confirm-content"><p>Your unsaved playbook changes will be lost.</p><footer><button type="button" onClick={() => setShowLeaveModal(false)}>Keep editing</button><button type="button" data-tone="danger" onClick={() => navigate('/response/playbooks')}>Discard changes</button></footer></div>
      </HaModal>

      <HaModal isOpen={showDetailsModal} onClose={() => setShowDetailsModal(false)} title="Playbook details" width={560} className="soar-details-modal">
        <form className="soar-details-form" onSubmit={(event) => { event.preventDefault(); setShowDetailsModal(false); }}>
          <p>Describe the operational outcome here; trigger, scope, and activation stay visible in the builder.</p>
          <label className="soar-field"><span>Playbook name <em>Required</em></span><input autoFocus value={name} onChange={(event) => { setName(event.target.value); setIsDirty(true); }} placeholder="Name this playbook" aria-label="Playbook name" /></label>
          <label className="soar-field"><span>Purpose and analyst outcome</span><textarea rows={4} value={description} onChange={(event) => { setDescription(event.target.value); setIsDirty(true); }} placeholder="Explain when this automation should run, the expected outcome, and its safety boundary." aria-label="Playbook purpose" /></label>
          <div className="soar-details-form__meta">
            <label className="soar-field"><span>Owner</span><select defaultValue="soc-automation"><option value="soc-automation">SOC Automation</option><option value="incident-response">Incident Response</option><option value="detection-engineering">Detection Engineering</option></select></label>
            <label className="soar-field"><span>Change reference</span><input placeholder="Optional ticket or incident ID" /></label>
          </div>
          <footer><button type="button" onClick={() => setShowDetailsModal(false)}>Cancel</button><button type="submit" className="soar-publish-button">Apply details</button></footer>
        </form>
      </HaModal>
    </section>
  );
}
