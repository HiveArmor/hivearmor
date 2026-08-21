import { Handle, Position } from '@reactflow/core';
import {
  BellRing,
  CheckCircle2,
  Clock3,
  GitBranch,
  GitFork,
  BrainCircuit,
  Braces,
  Workflow,
  Play,
  Repeat2,
  ShieldCheck,
  Sparkles,
  UserCheck,
} from 'lucide-react';
import type { NodeProps } from 'reactflow';

import type { PlaybookNodeData, PlaybookNodeType } from './playbookNodes.types';
import { TYPE_LABELS } from './playbookNodes.types';

const NODE_ICONS: Record<PlaybookNodeType, typeof Play> = {
  trigger: BellRing,
  action: Sparkles,
  condition: GitBranch,
  approval: UserCheck,
  delay: Clock3,
  loop: Repeat2,
  parallel: GitFork,
  subplaybook: Workflow,
  transform: Braces,
  intelligence: BrainCircuit,
  end: CheckCircle2,
};

function statusLabel(data: PlaybookNodeData): string {
  if (data.nodeType === 'trigger') return data.triggerType === 'scheduled' ? 'Scheduled' : data.triggerType === 'manual' ? 'Manual' : 'Alert event';
  if (data.nodeType === 'end') return 'Path complete';
  return data.configured ? 'Configured' : 'Needs setup';
}

export function PlaybookNode({ data, selected }: NodeProps<PlaybookNodeData>): JSX.Element {
  const Icon = NODE_ICONS[data.nodeType];
  const isCondition = data.nodeType === 'condition';

  return (
    <article
      className="soar-node"
      data-node-type={data.nodeType}
      data-selected={selected || undefined}
      data-risk={data.risk ?? 'none'}
      aria-label={`${TYPE_LABELS[data.nodeType]} node: ${data.label}`}
    >
      {data.nodeType !== 'trigger' && (
        <Handle type="target" position={Position.Top} className="soar-node__handle" />
      )}

      <header className="soar-node__header">
        <span className="soar-node__icon" aria-hidden="true"><Icon size={15} /></span>
        <span className="soar-node__type">{TYPE_LABELS[data.nodeType]}</span>
        {data.risk && data.risk !== 'none' && (
          <span className="soar-node__risk">{data.risk}</span>
        )}
      </header>
      <div className="soar-node__body">
        <strong>{data.label}</strong>
        <span>{data.description}</span>
      </div>
      <footer className="soar-node__footer">
        {data.configured || data.nodeType === 'trigger' || data.nodeType === 'end'
          ? <CheckCircle2 size={12} aria-hidden="true" />
          : <ShieldCheck size={12} aria-hidden="true" />}
        <span>{statusLabel(data)}</span>
      </footer>

      {data.nodeType !== 'end' && !isCondition && (
        <Handle type="source" position={Position.Bottom} className="soar-node__handle" />
      )}
      {isCondition && (
        <>
          <span className="soar-node__branch-label soar-node__branch-label--yes">Yes</span>
          <Handle id="yes" type="source" position={Position.Right} className="soar-node__handle soar-node__handle--yes" />
          <span className="soar-node__branch-label soar-node__branch-label--no">No</span>
          <Handle id="no" type="source" position={Position.Left} className="soar-node__handle soar-node__handle--no" />
        </>
      )}
    </article>
  );
}
