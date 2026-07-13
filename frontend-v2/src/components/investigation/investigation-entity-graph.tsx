"use client";

import { useState, useRef, useEffect, useCallback, type ReactNode } from "react";
import {
  Monitor, User, Globe, Terminal, FileText, Shield,
  RefreshCw, ZoomIn, ZoomOut, Maximize2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

export type EntityKind = "host" | "user" | "ip" | "process" | "file" | "domain";

export interface EntityNode {
  id: string;
  kind: EntityKind;
  label: string;
  sublabel?: string;
  suspicious?: boolean;
  compromised?: boolean;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
}

export interface EntityEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  suspicious?: boolean;
}

export interface EntityGraph {
  nodes: EntityNode[];
  edges: EntityEdge[];
}

// ── Metadata ──────────────────────────────────────────────────────────────────

const KIND_META: Record<EntityKind, { icon: ReactNode; color: string; fill: string; stroke: string }> = {
  host:    { icon: <Monitor className="w-4 h-4" />,  color: "text-brand",        fill: "var(--brand-subtle)",        stroke: "var(--brand-primary)" },
  user:    { icon: <User className="w-4 h-4" />,     color: "text-warning",      fill: "rgba(245,158,11,0.12)",      stroke: "rgba(245,158,11,0.7)" },
  ip:      { icon: <Globe className="w-4 h-4" />,    color: "text-brand-accent", fill: "var(--brand-accent-subtle)", stroke: "var(--brand-accent)" },
  process: { icon: <Terminal className="w-4 h-4" />, color: "text-secondary",    fill: "var(--surface-tertiary)",    stroke: "var(--surface-border-strong)" },
  file:    { icon: <FileText className="w-4 h-4" />, color: "text-muted",        fill: "var(--surface-tertiary)",    stroke: "var(--surface-border)" },
  domain:  { icon: <Shield className="w-4 h-4" />,   color: "text-critical",     fill: "rgba(239,68,68,0.08)",       stroke: "rgba(239,68,68,0.5)" },
};

// ── Demo graph ────────────────────────────────────────────────────────────────

export const DEMO_GRAPH: EntityGraph = {
  nodes: [
    { id: "h1", kind: "host",    label: "srv-db-01",      sublabel: "10.0.0.12", compromised: true },
    { id: "h2", kind: "host",    label: "srv-app-02",     sublabel: "10.0.0.14", compromised: true },
    { id: "h3", kind: "host",    label: "workstation-07", sublabel: "10.0.0.47" },
    { id: "u1", kind: "user",    label: "backup",         sublabel: "local",     compromised: true },
    { id: "u2", kind: "user",    label: "root",           sublabel: "srv-db-01", compromised: true },
    { id: "u3", kind: "user",    label: "svc_backup",     sublabel: "srv-app-02", suspicious: true },
    { id: "i1", kind: "ip",      label: "192.168.4.21",   sublabel: "attacker",  suspicious: true },
    { id: "i2", kind: "ip",      label: "185.220.101.45", sublabel: "C2",        suspicious: true },
    { id: "i3", kind: "ip",      label: "45.33.32.156",   sublabel: "exfil dst", suspicious: true },
    { id: "p1", kind: "process", label: "curl",           sublabel: "cmd exec" },
    { id: "p2", kind: "process", label: "bash",           sublabel: "shell" },
    { id: "f1", kind: "file",    label: "/etc/shadow",    sublabel: "credential dump" },
    { id: "d1", kind: "domain",  label: "malware[.]cc",   sublabel: "payload host", suspicious: true },
  ],
  edges: [
    { id: "e1",  source: "i1", target: "h1", label: "SSH brute force",  suspicious: true },
    { id: "e2",  source: "i1", target: "u1", label: "authenticated as", suspicious: true },
    { id: "e3",  source: "u1", target: "h1", label: "logged into" },
    { id: "e4",  source: "u1", target: "u2", label: "escalated to",     suspicious: true },
    { id: "e5",  source: "h1", target: "p1", label: "executed" },
    { id: "e6",  source: "p1", target: "i2", label: "downloaded from",  suspicious: true },
    { id: "e7",  source: "p1", target: "d1", label: "resolved",         suspicious: true },
    { id: "e8",  source: "u2", target: "f1", label: "read",             suspicious: true },
    { id: "e9",  source: "h1", target: "h2", label: "SMB lateral move", suspicious: true },
    { id: "e10", source: "u2", target: "u3", label: "created user",     suspicious: true },
    { id: "e11", source: "h2", target: "i3", label: "data exfil",       suspicious: true },
  ],
};

// ── Force simulation ──────────────────────────────────────────────────────────

interface SimNode extends EntityNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

function initPositions(nodes: EntityNode[], w: number, h: number): SimNode[] {
  return nodes.map((n, i) => ({
    ...n,
    x: n.x ?? w / 2 + Math.cos((i / nodes.length) * Math.PI * 2) * (w * 0.3),
    y: n.y ?? h / 2 + Math.sin((i / nodes.length) * Math.PI * 2) * (h * 0.3),
    vx: 0,
    vy: 0,
  }));
}

function runTick(nodes: SimNode[], edges: EntityEdge[], w: number, h: number): SimNode[] {
  const REPULSION = 4200;
  const SPRING_K  = 0.04;
  const IDEAL_LEN = 145;
  const DAMPEN    = 0.82;
  const CENTER_K  = 0.01;

  const next = nodes.map((n) => ({ ...n }));
  const idx = new Map(next.map((n, i) => [n.id, i]));

  for (let i = 0; i < next.length; i++) {
    for (let j = i + 1; j < next.length; j++) {
      const dx = next[i].x - next[j].x;
      const dy = next[i].y - next[j].y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const force = REPULSION / (dist * dist);
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      next[i].vx += fx; next[i].vy += fy;
      next[j].vx -= fx; next[j].vy -= fy;
    }
  }

  for (const e of edges) {
    const si = idx.get(e.source); const ti = idx.get(e.target);
    if (si == null || ti == null) continue;
    const dx = next[ti].x - next[si].x;
    const dy = next[ti].y - next[si].y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
    const force = (dist - IDEAL_LEN) * SPRING_K;
    const fx = (dx / dist) * force;
    const fy = (dy / dist) * force;
    next[si].vx += fx; next[si].vy += fy;
    next[ti].vx -= fx; next[ti].vy -= fy;
  }

  for (const n of next) {
    n.vx += (w / 2 - n.x) * CENTER_K;
    n.vy += (h / 2 - n.y) * CENTER_K;
  }

  for (const n of next) {
    n.vx *= DAMPEN; n.vy *= DAMPEN;
    n.x = Math.max(55, Math.min(w - 55, n.x + n.vx));
    n.y = Math.max(45, Math.min(h - 45, n.y + n.vy));
  }

  return next;
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

function NodeTooltip({ node, x, y }: { node: EntityNode; x: number; y: number }) {
  const meta = KIND_META[node.kind];
  return (
    <div
      className="absolute z-50 pointer-events-none bg-surface-primary border border-surface-border rounded-lg shadow-dropdown p-2.5 min-w-[140px] animate-scale-in"
      style={{ left: x + 16, top: y - 10 }}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className={meta.color}>{meta.icon}</span>
        <p className="text-small font-semibold text-primary">{node.label}</p>
      </div>
      {node.sublabel && <p className="text-tiny text-muted font-mono">{node.sublabel}</p>}
      {node.compromised && <p className="text-tiny text-critical font-medium mt-1">COMPROMISED</p>}
      {node.suspicious && !node.compromised && <p className="text-tiny text-warning font-medium mt-1">SUSPICIOUS</p>}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface InvestigationEntityGraphProps {
  graph?: EntityGraph;
}

const NODE_R = 22;
const ARROW_LEN = 9;

export function InvestigationEntityGraph({ graph = DEMO_GRAPH }: InvestigationEntityGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const animRef = useRef<number>(0);
  const [dims, setDims] = useState({ w: 800, h: 520 });
  const [nodes, setNodes] = useState<SimNode[]>([]);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 });
  const [simRunning, setSimRunning] = useState(true);
  const tickRef = useRef(0);

  // Refs to avoid stale closures in event handlers
  const panRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  useEffect(() => { panRef.current = pan; }, [pan]);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);

  const isPanning = useRef(false);
  const panMoved = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const panOrig = useRef({ x: 0, y: 0 });
  const draggingId = useRef<string | null>(null);
  const dragMoved = useRef(false);
  const dragStartPos = useRef({ x: 0, y: 0 });

  // Smooth zoom lerp
  const targetZoomRef = useRef(1);
  const smoothZoomRafRef = useRef(0);
  const mouseZoomPos = useRef({ x: 0, y: 0 });

  // Observe container size
  useEffect(() => {
    const el = svgRef.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setDims({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    setNodes(initPositions(graph.nodes, dims.w, dims.h));
    tickRef.current = 0;
    setSimRunning(true);
  }, [graph, dims]);

  useEffect(() => {
    if (!simRunning) return;
    let running = true;
    const step = () => {
      if (!running) return;
      setNodes((n) => runTick(n, graph.edges, dims.w, dims.h));
      tickRef.current++;
      if (tickRef.current < 130) animRef.current = requestAnimationFrame(step);
      else setSimRunning(false);
    };
    animRef.current = requestAnimationFrame(step);
    return () => { running = false; cancelAnimationFrame(animRef.current); };
  }, [simRunning, graph.edges, dims]);

  const resetLayout = useCallback(() => {
    setNodes(initPositions(graph.nodes, dims.w, dims.h));
    tickRef.current = 0;
    setSimRunning(true);
    targetZoomRef.current = 1;
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [graph, dims]);

  // ── Node drag ──────────────────────────────────────────────────────────────
  const handleNodeMouseDown = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    draggingId.current = id;
    dragMoved.current = false;
    dragStartPos.current = { x: e.clientX, y: e.clientY };

    const onMove = (me: MouseEvent) => {
      if (!draggingId.current || !svgRef.current) return;
      const dx = me.clientX - dragStartPos.current.x;
      const dy = me.clientY - dragStartPos.current.y;
      if (!dragMoved.current && Math.sqrt(dx * dx + dy * dy) > 4) {
        dragMoved.current = true;
      }
      const rect = svgRef.current.getBoundingClientRect();
      const x = (me.clientX - rect.left - panRef.current.x) / zoomRef.current;
      const y = (me.clientY - rect.top - panRef.current.y) / zoomRef.current;
      setNodes((ns) => ns.map((n) => n.id === draggingId.current ? { ...n, x, y, vx: 0, vy: 0 } : n));
    };
    const onUp = () => {
      if (!dragMoved.current) {
        // Pure click — toggle selection
        setSelectedId((prev) => prev === id ? null : id);
      }
      draggingId.current = null;
      dragMoved.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

  // ── Pan ────────────────────────────────────────────────────────────────────
  const handleSvgMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as Element).closest("[data-node]")) return;
    isPanning.current = true;
    panMoved.current = false;
    panStart.current = { x: e.clientX, y: e.clientY };
    panOrig.current = { ...panRef.current };
  }, []);

  const handleSvgMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning.current) return;
    const dx = e.clientX - panStart.current.x;
    const dy = e.clientY - panStart.current.y;
    if (Math.sqrt(dx * dx + dy * dy) > 4) panMoved.current = true;
    setPan({
      x: panOrig.current.x + dx,
      y: panOrig.current.y + dy,
    });
  }, []);

  const handleSvgMouseUp = useCallback(() => {
    if (isPanning.current && !panMoved.current) {
      // Click on canvas background — clear selection
      setSelectedId(null);
    }
    isPanning.current = false;
    panMoved.current = false;
  }, []);

  // ── Smooth cursor-centred zoom ─────────────────────────────────────────────
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    mouseZoomPos.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    targetZoomRef.current = Math.max(0.25, Math.min(3.5, targetZoomRef.current * (1 - e.deltaY * 0.001)));

    cancelAnimationFrame(smoothZoomRafRef.current);
    const animate = () => {
      const curr = zoomRef.current;
      const target = targetZoomRef.current;
      const diff = target - curr;
      if (Math.abs(diff) < 0.0005) { setZoom(target); return; }
      const next = curr + diff * 0.18;
      const scale = next / curr;
      const mx = mouseZoomPos.current.x;
      const my = mouseZoomPos.current.y;
      setPan((prev) => ({ x: mx - scale * (mx - prev.x), y: my - scale * (my - prev.y) }));
      setZoom(next);
      smoothZoomRafRef.current = requestAnimationFrame(animate);
    };
    smoothZoomRafRef.current = requestAnimationFrame(animate);
  }, []);

  const selectedNode = nodes.find((n) => n.id === selectedId);
  const nodeIdx = new Map(nodes.map((n) => [n.id, n]));

  const neighborIds = selectedId
    ? new Set([
        selectedId,
        ...graph.edges
          .filter((e) => e.source === selectedId || e.target === selectedId)
          .flatMap((e) => [e.source, e.target]),
      ])
    : null;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-surface-border shrink-0 bg-surface-primary">
        <div className="flex items-center gap-3 text-tiny text-muted">
          <span>{graph.nodes.length} entities</span>
          <span>{graph.edges.length} relationships</span>
          {simRunning && (
            <span className="flex items-center gap-1 text-brand">
              <RefreshCw className="w-3 h-3 animate-spin" /> Simulating…
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              const next = Math.min(3.5, zoomRef.current + 0.2);
              targetZoomRef.current = next;
              setZoom(next);
            }}
            className="toolbar-btn"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              const next = Math.max(0.25, zoomRef.current - 0.2);
              targetZoomRef.current = next;
              setZoom(next);
            }}
            className="toolbar-btn"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button onClick={resetLayout} title="Reset layout" className="toolbar-btn">
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Graph + detail */}
      <div className="flex flex-1 overflow-hidden">
        {/* SVG canvas */}
        <div className="flex-1 relative overflow-hidden bg-surface-ground">
          <svg
            ref={svgRef}
            width="100%"
            height="100%"
            className="cursor-grab active:cursor-grabbing"
            onMouseDown={handleSvgMouseDown}
            onMouseMove={handleSvgMouseMove}
            onMouseUp={handleSvgMouseUp}
            onMouseLeave={handleSvgMouseUp}
            onWheel={handleWheel}
          >
            <defs>
              {/* Flowing dash animation */}
              <style>{`
                @keyframes dashflow {
                  to { stroke-dashoffset: -22; }
                }
                @keyframes dashflow-sus {
                  to { stroke-dashoffset: -26; }
                }
                .eg-edge { stroke-dasharray: 7 5; animation: dashflow 2.8s linear infinite; }
                .eg-edge-sus { stroke-dasharray: 10 5; animation: dashflow-sus 0.9s linear infinite; }
              `}</style>

              {/* Arrow markers — refX=0 because endpoint is pre-trimmed */}
              <marker id="eg-arr"     markerWidth="7" markerHeight="5" refX="0" refY="2.5" orient="auto">
                <polygon points="0 0, 7 2.5, 0 5" fill="var(--surface-border-strong)" />
              </marker>
              <marker id="eg-arr-sus" markerWidth="7" markerHeight="5" refX="0" refY="2.5" orient="auto">
                <polygon points="0 0, 7 2.5, 0 5" fill="rgba(239,68,68,0.85)" />
              </marker>

              {/* Glow filter for compromised nodes */}
              <filter id="glow-red" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              <filter id="glow-yellow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="2.5" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>

            <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
              {/* Grid dots */}
              <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
                <circle cx="0" cy="0" r="0.9" fill="var(--surface-border)" />
              </pattern>
              <rect
                x={-pan.x / zoom - 3000} y={-pan.y / zoom - 3000}
                width={dims.w / zoom + 6000} height={dims.h / zoom + 6000}
                fill="url(#grid)"
              />

              {/* Edges */}
              {graph.edges.map((edge) => {
                const s = nodeIdx.get(edge.source);
                const t = nodeIdx.get(edge.target);
                if (!s || !t) return null;

                const dx = t.x - s.x;
                const dy = t.y - s.y;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                const ux = dx / dist;
                const uy = dy / dist;
                // Trim to node boundary + arrow clearance
                const x1 = s.x + ux * (NODE_R + 3);
                const y1 = s.y + uy * (NODE_R + 3);
                const x2 = t.x - ux * (NODE_R + ARROW_LEN);
                const y2 = t.y - uy * (NODE_R + ARROW_LEN);
                const midX = (x1 + x2) / 2;
                const midY = (y1 + y2) / 2;
                const isDimmed = neighborIds && !neighborIds.has(edge.source) && !neighborIds.has(edge.target);

                return (
                  <g
                    key={edge.id}
                    style={{ opacity: isDimmed ? 0.08 : 1, transition: "opacity 200ms ease" }}
                  >
                    <path
                      d={`M${x1},${y1} L${x2},${y2}`}
                      stroke={edge.suspicious ? "rgba(239,68,68,0.65)" : "var(--surface-border-strong)"}
                      strokeWidth={edge.suspicious ? 1.8 : 1.2}
                      fill="none"
                      markerEnd={edge.suspicious ? "url(#eg-arr-sus)" : "url(#eg-arr)"}
                      className={edge.suspicious ? "eg-edge-sus" : "eg-edge"}
                    />
                    {/* Edge label on a slight offset to avoid overlap with line */}
                    <text
                      x={midX}
                      y={midY - 6}
                      textAnchor="middle"
                      fontSize="9"
                      fill="var(--text-muted)"
                      className="pointer-events-none select-none"
                      style={{ fontFamily: "var(--font-mono, monospace)" }}
                    >
                      {edge.label}
                    </text>
                  </g>
                );
              })}

              {/* Nodes */}
              {nodes.map((node) => {
                const meta = KIND_META[node.kind];
                const isSelected = selectedId === node.id;
                const isDimmed = neighborIds && !neighborIds.has(node.id);
                const truncLabel = node.label.length > 14 ? node.label.slice(0, 13) + "…" : node.label;

                return (
                  <g
                    key={node.id}
                    data-node="true"
                    transform={`translate(${node.x},${node.y})`}
                    style={{
                      opacity: isDimmed ? 0.12 : 1,
                      transition: "opacity 200ms ease",
                      cursor: "pointer",
                    }}
                    onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                    onMouseEnter={(e) => {
                      setHoverId(node.id);
                      const rect = svgRef.current!.getBoundingClientRect();
                      setHoverPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
                    }}
                    onMouseLeave={() => setHoverId(null)}
                  >
                    {/* Outer glow ring for compromised/suspicious */}
                    {(node.compromised || node.suspicious) && (
                      <circle
                        r={NODE_R + 8}
                        fill="none"
                        stroke={node.compromised ? "rgba(239,68,68,0.3)" : "rgba(245,158,11,0.3)"}
                        strokeWidth={node.compromised ? 2.5 : 1.5}
                        filter={node.compromised ? "url(#glow-red)" : "url(#glow-yellow)"}
                        className={node.compromised ? "animate-pulse" : ""}
                      />
                    )}
                    {/* Selection ring */}
                    {isSelected && (
                      <circle
                        r={NODE_R + 6}
                        fill="none"
                        stroke="var(--brand-primary)"
                        strokeWidth={2}
                        strokeDasharray="4 2"
                      />
                    )}
                    {/* Node body */}
                    <circle
                      r={NODE_R}
                      fill={meta.fill}
                      stroke={
                        isSelected ? "var(--brand-primary)"
                          : node.compromised ? "rgba(239,68,68,0.8)"
                          : node.suspicious  ? "rgba(245,158,11,0.7)"
                          : meta.stroke
                      }
                      strokeWidth={isSelected ? 2 : 1.5}
                    />
                    {/* Label below */}
                    <text
                      y={NODE_R + 15}
                      textAnchor="middle"
                      fontSize="10"
                      fill={isDimmed ? "var(--text-muted)" : "var(--text-secondary)"}
                      className="pointer-events-none select-none"
                    >
                      {truncLabel}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>

          {/* Icon HTML overlays (crisp rendering) */}
          {nodes.map((node) => {
            const meta = KIND_META[node.kind];
            const sx = node.x * zoom + pan.x;
            const sy = node.y * zoom + pan.y;
            const isDimmed = neighborIds && !neighborIds.has(node.id);
            return (
              <div
                key={`icon-${node.id}`}
                className={cn("absolute pointer-events-none flex items-center justify-center", meta.color)}
                style={{
                  left: sx - 8,
                  top: sy - 8,
                  width: 16,
                  height: 16,
                  opacity: isDimmed ? 0.1 : 1,
                  transition: "opacity 200ms ease",
                }}
              >
                {meta.icon}
              </div>
            );
          })}

          {/* Hover tooltip */}
          {hoverId && (() => {
            const hn = nodes.find((n) => n.id === hoverId);
            return hn ? <NodeTooltip node={hn} x={hoverPos.x} y={hoverPos.y} /> : null;
          })()}
        </div>

        {/* Detail sidebar */}
        {selectedNode && (
          <div className="w-[220px] shrink-0 border-l border-surface-border bg-surface-primary overflow-y-auto">
            <div className="px-3 py-3 border-b border-surface-border">
              <div className={cn("flex items-center gap-2", KIND_META[selectedNode.kind].color)}>
                {KIND_META[selectedNode.kind].icon}
                <p className="text-small font-semibold text-primary">{selectedNode.label}</p>
              </div>
              {selectedNode.sublabel && (
                <p className="text-tiny text-muted font-mono mt-0.5">{selectedNode.sublabel}</p>
              )}
              {selectedNode.compromised && (
                <div className="mt-2 px-2 py-1 rounded bg-critical/10 border border-critical/20 text-tiny text-critical font-medium">
                  COMPROMISED
                </div>
              )}
              {selectedNode.suspicious && !selectedNode.compromised && (
                <div className="mt-2 px-2 py-1 rounded bg-warning/10 border border-warning/20 text-tiny text-warning font-medium">
                  SUSPICIOUS
                </div>
              )}
            </div>
            <div className="p-3 space-y-2">
              <p className="text-tiny text-muted uppercase tracking-wider font-medium">Connections</p>
              {graph.edges
                .filter((e) => e.source === selectedNode.id || e.target === selectedNode.id)
                .map((e) => {
                  const otherId = e.source === selectedNode.id ? e.target : e.source;
                  const other = nodeIdx.get(otherId);
                  if (!other) return null;
                  const direction = e.source === selectedNode.id ? "→" : "←";
                  return (
                    <button
                      key={e.id}
                      onClick={() => setSelectedId(otherId)}
                      className="w-full flex items-center gap-2 text-left p-2 rounded hover:bg-surface-tertiary transition-colors"
                    >
                      <span className={cn("shrink-0", KIND_META[other.kind].color)}>
                        {KIND_META[other.kind].icon}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-tiny text-primary font-medium truncate">{other.label}</p>
                        <p className="text-tiny text-muted truncate">{direction} {e.label}</p>
                      </div>
                      {e.suspicious && <Shield className="w-3 h-3 text-critical shrink-0" />}
                    </button>
                  );
                })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
