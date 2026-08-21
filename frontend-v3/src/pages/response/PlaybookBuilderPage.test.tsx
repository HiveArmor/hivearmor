import React from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PlaybookBuilderPage } from './PlaybookBuilderPage';
import type { PlaybookNodeData } from './playbookNodes.types';

import type { Playbook } from '@/types/playbook';
import type { ResponseAction } from '@/types/responseAction';

const mockNavigate = vi.fn();
const mockUseParams = vi.fn(() => ({} as { id?: string }));
const mockFetchPlaybook = vi.fn();
const mockCreatePlaybook = vi.fn();
const mockUpdatePlaybook = vi.fn();
const mockFetchActions = vi.fn();

interface MockCanvasNode {
  id: string;
  type: string;
  data: PlaybookNodeData;
}

interface MockReactFlowProps {
  nodes: MockCanvasNode[];
  nodeTypes: Record<string, React.ComponentType<{ id: string; data: PlaybookNodeData; selected: boolean }>>;
  onNodeClick?: (event: React.MouseEvent<HTMLButtonElement>, node: MockCanvasNode) => void;
  children?: React.ReactNode;
  'aria-label'?: string;
}

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useParams: () => mockUseParams(),
}));

vi.mock('@/services/playbookService', () => ({
  fetchPlaybook: (...args: unknown[]) => mockFetchPlaybook(...args),
  createPlaybook: (...args: unknown[]) => mockCreatePlaybook(...args),
  updatePlaybook: (...args: unknown[]) => mockUpdatePlaybook(...args),
}));

vi.mock('@/services/responseActionService', () => ({
  fetchResponseActionLibrary: (...args: unknown[]) => mockFetchActions(...args),
}));

vi.mock('@/hooks/useEpsStream', () => ({
  useEpsStream: () => ({ connected: true, eps: 12840 }),
}));

vi.mock('@/components/status-dock/StatusDock', () => ({
  StatusDock: () => <div data-testid="status-dock">Connected · Live</div>,
}));

vi.mock('@/components/ha-switch/HaSwitch', () => ({
  HaSwitch: ({ id, label, isChecked, onChange }: { id: string; label: string; isChecked: boolean; onChange: (value: boolean) => void }) => (
    <label htmlFor={id}><input id={id} type="checkbox" checked={isChecked} onChange={(event) => onChange(event.target.checked)} />{label}</label>
  ),
}));

vi.mock('@/components/ha-modal/HaModal', () => ({
  HaModal: ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) => isOpen ? <div role="dialog">{children}</div> : null,
}));

vi.mock('@/components/response-action/ActionParamForm', () => ({
  ActionParamForm: () => <div data-testid="action-parameters" />,
}));

vi.mock('@reactflow/core', async () => {
  const ReactModule = await import('react');
  return {
    MarkerType: { ArrowClosed: 'arrow-closed' },
    Position: { Top: 'top', Right: 'right', Bottom: 'bottom', Left: 'left' },
    Handle: () => <span data-testid="node-handle" />,
    addEdge: (edge: unknown, edges: unknown[]) => [...edges, edge],
    applyEdgeChanges: (_changes: unknown[], edges: unknown[]) => edges,
    applyNodeChanges: (changes: Array<{ type: string; id?: string }>, nodes: Array<{ id: string }>) => {
      const removed = new Set(changes.filter((change) => change.type === 'remove').map((change) => change.id));
      return nodes.filter((node) => !removed.has(node.id));
    },
    ReactFlow: ({ nodes, nodeTypes, onNodeClick, children, 'aria-label': ariaLabel }: MockReactFlowProps) => (
      <div aria-label={ariaLabel}>
        {nodes.map((node) => {
          const NodeComponent = nodeTypes[node.type];
          return (
            <button key={node.id} type="button" aria-label={`${node.data.nodeType} canvas block ${node.data.label}`} onClick={(event) => onNodeClick?.(event, node)}>
              <NodeComponent id={node.id} data={node.data} selected={false} />
            </button>
          );
        })}
        {ReactModule.Children.toArray(children)}
      </div>
    ),
  };
});

const ACTIONS: ResponseAction[] = [
  { id: 'intel.lookup-ip', name: 'Enrich IP reputation', category: 'Enrichment', description: 'Query authorized intelligence providers.', params: [], usageCount: 4 },
  { id: 'edr.isolate-host', name: 'Isolate endpoint', category: 'EDR', description: 'Restrict host network access.', params: [], usageCount: 2 },
];

function playbook(overrides: Partial<Playbook> = {}): Playbook {
  return {
    id: 7,
    name: 'Existing containment playbook',
    description: 'Governed endpoint response',
    triggerType: 'alert-triggered',
    active: false,
    runCount: 0,
    lastRunAt: null,
    lastRunStatus: null,
    steps: [{
      stepIndex: 0,
      stepType: 'action',
      label: 'Enrich IP reputation',
      config: {
        actionId: 'intel.lookup-ip',
        builderNodeType: 'action',
        builderNodeId: 'enrich-ip',
        builderDescription: 'Query reputation',
        builderPosition: { x: 360, y: 220 },
        builderNext: [{ target: 'end' }],
      },
    }],
    ...overrides,
  };
}

function renderBuilder(): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={queryClient}><PlaybookBuilderPage /></QueryClientProvider>);
}

function setPlaybookName(value: string): void {
  fireEvent.click(screen.getByRole('button', { name: 'Edit playbook identity and purpose' }));
  fireEvent.change(screen.getByLabelText('Playbook name'), { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: 'Apply details' }));
}

describe('PlaybookBuilderPage low-code authoring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseParams.mockReturnValue({});
    mockFetchActions.mockResolvedValue(ACTIONS);
    mockCreatePlaybook.mockResolvedValue(playbook({ id: 18, name: 'New governed playbook' }));
    mockUpdatePlaybook.mockResolvedValue(playbook());
  });

  it('starts production authoring with bounded trigger and outcome terminals, not fixture records', async () => {
    renderBuilder();

    expect(screen.getByRole('heading', { name: 'Untitled playbook' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Edit playbook identity and purpose' }));
    expect(screen.getByLabelText('Playbook name')).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'trigger canvas block Manual analyst launch' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'end canvas block Response complete' })).toBeTruthy();
    expect(screen.getByText('Add at least one block')).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Add Enrich IP reputation block' })).toBeTruthy();
  });

  it('adds action and logic blocks into the path and exposes their configuration', async () => {
    renderBuilder();

    fireEvent.click(await screen.findByRole('button', { name: 'Add Enrich IP reputation block' }));
    expect(screen.getByRole('complementary', { name: 'Configure Enrich IP reputation' })).toBeTruthy();
    expect(screen.getByText(/^Block ID · action-/)).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: 'Logic' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Wait block' }));
    expect(screen.getByRole('complementary', { name: 'Configure Wait' })).toBeTruthy();
    expect(screen.getByRole('spinbutton', { name: 'Duration' })).toHaveValue(5);
  });

  it('flags an unapproved high-impact action with a node-addressable readiness issue', async () => {
    renderBuilder();

    setPlaybookName('Emergency host containment');
    fireEvent.click(await screen.findByRole('button', { name: 'Add Isolate endpoint block' }));
    fireEvent.click(screen.getByRole('button', { name: 'Validate' }));

    expect(screen.getByText('Isolate endpoint requires approval')).toBeTruthy();
    expect(screen.getByText(/governed approval block immediately before/i)).toBeTruthy();
  });

  it('persists graph metadata through the existing draft mutation and routes to the saved playbook', async () => {
    renderBuilder();

    setPlaybookName('New governed playbook');
    fireEvent.click(await screen.findByRole('button', { name: 'Add Enrich IP reputation block' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));

    await waitFor(() => expect(mockCreatePlaybook).toHaveBeenCalledTimes(1));
    const payload = mockCreatePlaybook.mock.calls[0][0];
    expect(payload.name).toBe('New governed playbook');
    expect(payload.steps[0].config.builderNodeId).toMatch(/^action-/);
    expect(payload.steps[0].config.builderNext).toEqual([{ target: 'end' }]);
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/response/playbooks/18'));
  });

  it('hydrates and updates an existing graph-backed playbook', async () => {
    mockUseParams.mockReturnValue({ id: '7' });
    mockFetchPlaybook.mockResolvedValue(playbook());
    renderBuilder();

    expect(await screen.findByRole('heading', { name: 'Existing containment playbook' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'action canvas block Enrich IP reputation' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));

    await waitFor(() => expect(mockUpdatePlaybook).toHaveBeenCalledWith(7, expect.objectContaining({ name: 'Existing containment playbook' })));
  });

  it('opens an in-app full screen canvas and restores the builder with Escape', () => {
    renderBuilder();

    fireEvent.click(screen.getAllByRole('button', { name: 'Open full screen builder' })[0]);
    const builder = screen.getByLabelText('SOAR playbook builder');
    expect(builder).toHaveClass('soar-builder-page--focus');
    expect(screen.getByText(/Full screen canvas/i)).toBeTruthy();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(builder).not.toHaveClass('soar-builder-page--focus');
    expect(screen.getByRole('heading', { name: 'Untitled playbook' })).toBeTruthy();
  });

  it('presents governed Hive Intelligence proposals as explicit analyst-reviewed draft changes', async () => {
    renderBuilder();

    fireEvent.click(screen.getByRole('button', { name: 'Intelligence' }));
    expect(screen.getByText('Governed playbook coauthor')).toBeTruthy();
    expect(screen.getByText(/cannot save, approve, publish, or execute/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Generate reviewable changes' }));

    expect(await screen.findByText('Preserve volatile endpoint context', {}, { timeout: 1500 })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /Apply to draft/i }).length).toBeGreaterThan(0);
  });
});
