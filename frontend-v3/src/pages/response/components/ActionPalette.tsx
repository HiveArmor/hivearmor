import { useMemo, useState } from 'react';

import {
  Blocks,
  BrainCircuit,
  Braces,
  Clock3,
  GitBranch,
  GitFork,
  GripVertical,
  Repeat2,
  Search,
  ShieldCheck,
  Sparkles,
  UserCheck,
  Workflow,
} from 'lucide-react';

import type { PaletteNodeDefinition, PlaybookNodeType, PlaybookRisk } from '../playbookNodes.types';

import type { ResponseAction } from '@/types/responseAction';

const LOGIC_ITEMS: PaletteNodeDefinition[] = [
  { id: 'logic-condition', nodeType: 'condition', label: 'Decision', description: 'Route by field, output, or risk', category: 'Flow', risk: 'none' },
  { id: 'logic-approval', nodeType: 'approval', label: 'Analyst approval', description: 'Pause for governed authorization', category: 'Governance', risk: 'none' },
  { id: 'logic-delay', nodeType: 'delay', label: 'Wait', description: 'Pause or poll before continuing', category: 'Flow', risk: 'none' },
  { id: 'logic-loop', nodeType: 'loop', label: 'For each', description: 'Iterate over entities or indicators', category: 'Flow', risk: 'none' },
  { id: 'logic-parallel', nodeType: 'parallel', label: 'Parallel paths', description: 'Run independent response paths concurrently', category: 'Flow', risk: 'none' },
  { id: 'logic-subplaybook', nodeType: 'subplaybook', label: 'Sub-playbook', description: 'Call a reusable, version-pinned workflow', category: 'Composition', risk: 'none' },
  { id: 'logic-transform', nodeType: 'transform', label: 'Transform data', description: 'Map, filter, and normalize bounded outputs', category: 'Data', risk: 'none' },
  { id: 'logic-intelligence', nodeType: 'intelligence', label: 'Hive Intelligence', description: 'Classify or summarize with governed AI', category: 'Intelligence', risk: 'low' },
];

const ITEM_ICONS: Record<Exclude<PlaybookNodeType, 'trigger' | 'end'>, typeof Sparkles> = {
  action: Sparkles,
  condition: GitBranch,
  approval: UserCheck,
  delay: Clock3,
  loop: Repeat2,
  parallel: GitFork,
  subplaybook: Workflow,
  transform: Braces,
  intelligence: BrainCircuit,
};

function inferRisk(action: ResponseAction): PlaybookRisk {
  const value = `${action.category} ${action.name}`.toLowerCase();
  if (/isolate|disable|block|quarantine|kill|delete|revoke/.test(value)) return 'high';
  if (/ticket|contain|reset|collect|script/.test(value)) return 'medium';
  return 'low';
}

interface ActionPaletteProps {
  actions: ResponseAction[];
  isLoading: boolean;
  isError: boolean;
  onAddNode: (definition: PaletteNodeDefinition) => void;
}

export function ActionPalette({ actions, isLoading, isError, onAddNode }: ActionPaletteProps): JSX.Element {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'actions' | 'logic'>('actions');

  const actionItems = useMemo<PaletteNodeDefinition[]>(() => actions.map((action) => ({
    id: `action-${action.id}`,
    nodeType: 'action',
    label: action.name,
    description: action.description,
    category: action.category,
    risk: inferRisk(action),
    actionId: action.id,
  })), [actions]);

  const visibleItems = useMemo(() => {
    const source = mode === 'actions' ? actionItems : LOGIC_ITEMS;
    const normalized = query.trim().toLowerCase();
    if (!normalized) return source;
    return source.filter((item) => `${item.label} ${item.description} ${item.category}`.toLowerCase().includes(normalized));
  }, [actionItems, mode, query]);

  const categories = useMemo(() => {
    const grouped = new Map<string, PaletteNodeDefinition[]>();
    visibleItems.forEach((item) => grouped.set(item.category, [...(grouped.get(item.category) ?? []), item]));
    return Array.from(grouped.entries());
  }, [visibleItems]);

  const beginDrag = (event: React.DragEvent<HTMLButtonElement>, item: PaletteNodeDefinition): void => {
    event.dataTransfer.setData('application/hivearmor-playbook-node', JSON.stringify(item));
    event.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <aside className="soar-palette" aria-label="Playbook block library">
      <div className="soar-panel-heading">
        <span><Blocks size={15} aria-hidden="true" /> Blocks</span>
        <small>{actions.length} actions</small>
      </div>
      <div className="soar-palette__search">
        <Search size={14} aria-hidden="true" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find actions or logic"
          aria-label="Find playbook blocks"
        />
        <kbd>/</kbd>
      </div>
      <div className="soar-palette__tabs" role="tablist" aria-label="Block types">
        <button type="button" role="tab" aria-selected={mode === 'actions'} onClick={() => setMode('actions')}>Actions</button>
        <button type="button" role="tab" aria-selected={mode === 'logic'} onClick={() => setMode('logic')}>Logic</button>
      </div>

      <div className="soar-palette__list">
        {isLoading && <div className="soar-palette__state" role="status">Loading authorized actions…</div>}
        {isError && mode === 'actions' && (
          <div className="soar-palette__state" role="alert">
            <ShieldCheck size={16} aria-hidden="true" />
            Action catalog is unavailable. Logic blocks remain usable.
          </div>
        )}
        {!isLoading && !isError && categories.length === 0 && (
          <div className="soar-palette__state">No blocks match this search.</div>
        )}
        {categories.map(([category, items]) => (
          <section key={category} className="soar-palette-group" aria-labelledby={`palette-${category}`}>
            <header id={`palette-${category}`}>
              <span>{category}</span>
              <small>{items.length}</small>
            </header>
            {items.map((item) => {
              const Icon = ITEM_ICONS[item.nodeType];
              return (
                <button
                  key={item.id}
                  type="button"
                  className="soar-palette-item"
                  draggable
                  onDragStart={(event) => beginDrag(event, item)}
                  onClick={() => onAddNode(item)}
                  aria-label={`Add ${item.label} block`}
                >
                  <GripVertical className="soar-palette-item__grip" size={13} aria-hidden="true" />
                  <span className="soar-palette-item__icon" data-type={item.nodeType}><Icon size={15} /></span>
                  <span className="soar-palette-item__copy">
                    <strong>{item.label}</strong>
                    <small>{item.description}</small>
                  </span>
                  {item.risk !== 'none' && <span className="soar-palette-item__risk" data-risk={item.risk}>{item.risk}</span>}
                </button>
              );
            })}
          </section>
        ))}
      </div>
      <footer className="soar-palette__footer">
        <span>Drag to canvas or select to add</span>
        <kbd>⌘ B</kbd>
      </footer>
    </aside>
  );
}
