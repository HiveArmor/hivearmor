"use client";

import { useState, useCallback, useRef, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
// @xyflow/react types available after npm install
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Node<T = any> = { id: string; type?: string; position: { x: number; y: number }; data: T; [k: string]: unknown };
type Edge = { id: string; source: string; target: string; sourceHandle?: string; [k: string]: unknown };
type Connection = { source: string | null; target: string | null; sourceHandle?: string | null; targetHandle?: string | null };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NodeChange = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EdgeChange = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ReactFlowInstance = { zoomIn: () => void; zoomOut: () => void; fitView: (opts?: { padding?: number }) => void; onReady?: (instance: any) => void };
import { PLAYBOOK_NODE_TYPES, type PlaybookNodeData, type NodeKind } from "@/components/builder/playbook-nodes";
import { PlaybookConfigPanel } from "@/components/builder/playbook-config-panel";
import { PlaybookTemplateLibrary, type PlaybookTemplate } from "@/components/builder/playbook-template-library";
import { PlaybookExecutionLog, type PlaybookRun } from "@/components/builder/playbook-execution-log";
import { PlaybookToolbar, type BuilderView } from "@/components/builder/playbook-toolbar";
import { playbookService } from "@/services/playbook.service";

// Load React Flow dynamically to avoid SSR issues
const ReactFlowDynamic = dynamic(
  async () => {
    const { ReactFlow, Background, Controls, MiniMap } = await import("@xyflow/react");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function WrappedFlow(props: any) {
      return (
        <ReactFlow {...props}>
          <Background color="var(--surface-border)" gap={24} size={1} />
          <Controls
            showInteractive={false}
            className="!bg-surface-secondary !border-surface-border !rounded-lg !shadow-sm [&_button]:!bg-surface-secondary [&_button]:!border-surface-border [&_button]:!text-secondary [&_button:hover]:!bg-surface-elevated"
          />
          <MiniMap
            nodeColor={() => "var(--brand-primary)"}
            maskColor="rgba(0,0,0,0.4)"
            className="!bg-surface-secondary !border-surface-border !rounded-lg"
          />
        </ReactFlow>
      );
    }
    return { default: WrappedFlow };
  },
  { ssr: false, loading: () => <FlowLoadingState /> }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
) as React.ComponentType<any>;

// ── Seed playbook ────────────────────────────────────────────────────────────

const INITIAL_NODES: Node<PlaybookNodeData>[] = [
  {
    id: "t1",
    type: "trigger",
    position: { x: 260, y: 60 },
    data: { kind: "trigger", label: "Alert Received", sublabel: "alert.created", status: "idle", triggerType: "alert.created" },
  },
  {
    id: "c1",
    type: "condition",
    position: { x: 260, y: 200 },
    data: { kind: "condition", label: "Severity ≥ High?", sublabel: "alert.severity >= 7", status: "idle", conditionField: "alert.severity", conditionOp: ">=", conditionValue: "7" },
  },
  {
    id: "a1",
    type: "action",
    position: { x: 380, y: 360 },
    data: { kind: "action", label: "Enrich IOC", sublabel: "Threat Intel → query_ip", status: "idle", actionIntegration: "threat-intel", actionName: "query_ip" },
  },
  {
    id: "a2",
    type: "action",
    position: { x: 260, y: 520 },
    data: { kind: "action", label: "Block IP", sublabel: "Firewall → block_ip", status: "idle", actionIntegration: "firewall", actionName: "block_ip" },
  },
];

const INITIAL_EDGES: Edge[] = [
  { id: "e1", source: "t1", target: "c1", animated: true, style: { stroke: "var(--brand-primary)", strokeWidth: 1.5 } },
  { id: "e2", source: "c1", target: "a1", sourceHandle: "true", animated: true, style: { stroke: "#22c55e", strokeWidth: 1.5 } },
  { id: "e3", source: "a1", target: "a2", animated: true, style: { stroke: "var(--brand-primary)", strokeWidth: 1.5 } },
];

function FlowLoadingState() {
  return (
    <div className="w-full h-full flex items-center justify-center">
      <div className="text-tiny text-muted">Loading canvas…</div>
    </div>
  );
}

let nodeIdCounter = 10;
function nextId() { return `node-${++nodeIdCounter}`; }

// ── Inner builder (needs useSearchParams) ────────────────────────────────────

function PlaybookBuilderInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [nodes, setNodes] = useState<Node<PlaybookNodeData>[]>(INITIAL_NODES);
  const [edges, setEdges] = useState<Edge[]>(INITIAL_EDGES);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [playbookName, setPlaybookName] = useState("Brute Force Response");
  const [playbookId, setPlaybookId] = useState<number | null>(null);
  const [view, setView] = useState<BuilderView>("build");
  const [saveLabel, setSaveLabel] = useState<string>("idle");
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [activeRun, setActiveRun] = useState<PlaybookRun | null>(null);
  const [showExecLog, setShowExecLog] = useState(false);
  const rfRef = useRef<ReactFlowInstance | null>(null);

  // Load existing playbook from ?id=N
  useEffect(() => {
    const idParam = searchParams.get("id");
    if (!idParam) return;
    const numId = Number(idParam);
    if (!numId) return;
    playbookService.getById(numId)
      .then((pb) => {
        try {
          const def = JSON.parse(pb.definitionJson);
          setNodes(def.nodes ?? INITIAL_NODES);
          setEdges(def.edges ?? INITIAL_EDGES);
        } catch {
          // keep initial nodes if JSON is unparseable
        }
        setPlaybookName(pb.name);
        setPlaybookId(numId);
      })
      .catch((err) => console.error("Failed to load playbook:", err));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // History stack for undo/redo
  const history = useRef<{ nodes: Node<PlaybookNodeData>[]; edges: Edge[] }[]>([]);
  const future = useRef<{ nodes: Node<PlaybookNodeData>[]; edges: Edge[] }[]>([]);

  const snapshot = useCallback(() => {
    history.current.push({ nodes: [...nodes], edges: [...edges] });
    future.current = [];
  }, [nodes, edges]);

  const handleUndo = useCallback(() => {
    const prev = history.current.pop();
    if (!prev) return;
    future.current.push({ nodes, edges });
    setNodes(prev.nodes);
    setEdges(prev.edges);
  }, [nodes, edges]);

  const handleRedo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    history.current.push({ nodes, edges });
    setNodes(next.nodes);
    setEdges(next.edges);
  }, [nodes, edges]);

  // ── Node / edge changes ──────────────────────────────────────────────────
  const onNodesChange = useCallback(async (changes: NodeChange[]) => {
    const { applyNodeChanges } = await import("@xyflow/react");
    setNodes((n) => applyNodeChanges(changes, n) as Node<PlaybookNodeData>[]);
  }, []);

  const onEdgesChange = useCallback(async (changes: EdgeChange[]) => {
    const { applyEdgeChanges } = await import("@xyflow/react");
    setEdges((e) => applyEdgeChanges(changes, e) as Edge[]);
  }, []);

  const onConnect = useCallback(async (connection: Connection) => {
    const { addEdge } = await import("@xyflow/react");
    snapshot();
    setEdges((e) =>
      addEdge(
        { ...connection, animated: true, style: { stroke: "var(--brand-primary)", strokeWidth: 1.5 } },
        e
      ) as Edge[]
    );
  }, [snapshot]);

  // ── Node selection ────────────────────────────────────────────────────────
  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  // ── Config panel update ───────────────────────────────────────────────────
  const handleUpdateNode = useCallback((nodeId: string, patch: Partial<PlaybookNodeData>) => {
    setNodes((n) =>
      n.map((node) =>
        node.id === nodeId ? { ...node, data: { ...node.data, ...patch } } : node
      )
    );
  }, []);

  // ── Template load ─────────────────────────────────────────────────────────
  const handleLoadTemplate = useCallback((tpl: PlaybookTemplate) => {
    snapshot();
    setPlaybookName(tpl.name);
    setNodes(tpl.nodes as Node<PlaybookNodeData>[]);
    setEdges(tpl.edges as Edge[]);
    setSelectedNodeId(null);
    setTimeout(() => rfRef.current?.fitView({ padding: 0.2 }), 100);
  }, [snapshot]);

  // ── Add node from palette ─────────────────────────────────────────────────
  const handleAddNode = useCallback((kind: NodeKind) => {
    snapshot();
    const LABELS: Record<NodeKind, string> = {
      trigger: "Trigger", condition: "Condition",
      action: "Action", ai: "AI Step", subflow: "Subflow",
    };
    const id = nextId();
    const newNode: Node<PlaybookNodeData> = {
      id,
      type: kind,
      position: { x: 100 + (nodes.length % 4) * 50, y: 50 + (nodes.length * 90) },
      data: { kind, label: LABELS[kind], sublabel: "", status: "idle" },
    };
    setNodes((n) => [...n, newNode]);
    setSelectedNodeId(id);
  }, [snapshot, nodes]);

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    try {
      const definitionJson = JSON.stringify({ nodes, edges });
      if (!playbookId) {
        const result = await playbookService.create({
          name: playbookName || "Untitled",
          definitionJson,
          isActive: true,
        });
        setPlaybookId(result.id);
        router.replace(`/soar/flows?id=${result.id}`);
      } else {
        await playbookService.update(playbookId, {
          name: playbookName,
          definitionJson,
        });
      }
      setSaveLabel("saved");
      setTimeout(() => setSaveLabel("idle"), 2500);
    } catch (err) {
      console.error("Save failed:", err);
      setSaveLabel("error");
      setTimeout(() => setSaveLabel("idle"), 2500);
    } finally {
      setSaving(false);
    }
  };

  // ── Run ───────────────────────────────────────────────────────────────────
  const handleRun = async () => {
    setRunning(true);
    setView("execute");
    setShowExecLog(true);

    const runId = `run-${Date.now()}`;
    const steps = nodes.map((n) => ({
      stepId: n.id,
      nodeLabel: n.data.label,
      nodeKind: n.data.kind,
      status: "idle" as const,
      startedAt: Date.now(),
    }));

    const run: PlaybookRun = {
      runId,
      playbookName,
      trigger: "Manual execution",
      startedAt: Date.now(),
      status: "running",
      steps,
    };
    setActiveRun(run);

    // Simulate step-by-step execution
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      setNodes((ns) =>
        ns.map((n) => n.id === node.id ? { ...n, data: { ...n.data, status: "running" } } : n)
      );
      await new Promise((r) => setTimeout(r, 500 + Math.random() * 700));
      const success = Math.random() > 0.1;
      setNodes((ns) =>
        ns.map((n) => n.id === node.id ? { ...n, data: { ...n.data, status: success ? "success" : "error" } } : n)
      );
      if (!success) {
        setActiveRun((r) => r ? { ...r, status: "error", endedAt: Date.now() } : r);
        setRunning(false);
        return;
      }
    }

    setActiveRun((r) => r ? { ...r, status: "success", endedAt: Date.now() } : r);
    setRunning(false);

    // Record execution to backend (fire-and-forget)
    if (playbookId) {
      playbookService.execute(playbookId).catch((err) =>
        console.error("Failed to record execution:", err)
      );
    }

    setTimeout(() => {
      setNodes((ns) => ns.map((n) => ({ ...n, data: { ...n.data, status: "idle" } })));
    }, 3000);
  };

  const handleStop = () => {
    setRunning(false);
    setNodes((ns) =>
      ns.map((n) =>
        n.data.status === "running" ? { ...n, data: { ...n.data, status: "skipped" } } : n
      )
    );
    setActiveRun((r) => r ? { ...r, status: "aborted", endedAt: Date.now() } : r);
  };

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;

  return (
    <div
      className="flex flex-col overflow-hidden"
      style={{ height: "calc(100vh - var(--spacing-shell-top, 80px))" }}
    >
      {/* ── Toolbar ──────────────────────────────────────────── */}
      <PlaybookToolbar
        name={playbookName}
        onNameChange={setPlaybookName}
        canUndo={history.current.length > 0}
        canRedo={future.current.length > 0}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onZoomIn={() => rfRef.current?.zoomIn()}
        onZoomOut={() => rfRef.current?.zoomOut()}
        onFitView={() => rfRef.current?.fitView({ padding: 0.2 })}
        onSave={handleSave}
        onRun={handleRun}
        onStop={handleStop}
        onAddNode={handleAddNode}
        view={view}
        onViewChange={setView}
        running={running}
        saving={saving}
        saveLabel={saveLabel}
      />

      {/* ── Body: template | canvas | config ──────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Template library — left */}
        <div className="w-[220px] shrink-0 overflow-hidden">
          <PlaybookTemplateLibrary onLoad={handleLoadTemplate} className="h-full" />
        </div>

        {/* Canvas center + execution log bottom */}
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* React Flow canvas */}
          <div className="flex-1 overflow-hidden bg-surface-ground" style={{ backgroundImage: "radial-gradient(circle, var(--surface-border) 1px, transparent 1px)", backgroundSize: "24px 24px" }}>
            <ReactFlowDynamic
              nodes={nodes}
              edges={edges}
              nodeTypes={PLAYBOOK_NODE_TYPES}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={onNodeClick}
              onPaneClick={onPaneClick}
              onReady={(instance: ReactFlowInstance) => { rfRef.current = instance; }}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              minZoom={0.2}
              maxZoom={2}
              deleteKeyCode="Delete"
              proOptions={{ hideAttribution: true }}
              className="h-full"
            />
          </div>

          {/* Execution log panel — slides up */}
          {(showExecLog || view === "execute") && (
            <div className="h-[220px] shrink-0">
              <PlaybookExecutionLog activeRun={activeRun} />
            </div>
          )}
        </div>

        {/* Config panel — right */}
        <div className="w-[280px] shrink-0 overflow-hidden border-l border-surface-border bg-surface-primary">
          <PlaybookConfigPanel
            nodeId={selectedNodeId}
            data={selectedNode?.data ?? null}
            onUpdate={handleUpdateNode}
            onClose={() => setSelectedNodeId(null)}
          />
        </div>
      </div>
    </div>
  );
}

// ── Page export (Suspense required for useSearchParams) ───────────────────────

export default function PlaybookBuilderPage() {
  return (
    <Suspense fallback={<FlowLoadingState />}>
      <PlaybookBuilderInner />
    </Suspense>
  );
}
