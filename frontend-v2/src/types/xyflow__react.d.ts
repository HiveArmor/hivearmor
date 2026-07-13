declare module "@xyflow/react" {
  import type { ComponentType, CSSProperties, ReactNode, MouseEvent } from "react";

  export type Position = "top" | "right" | "bottom" | "left";
  export const Position: { Top: "top"; Right: "right"; Bottom: "bottom"; Left: "left" };

  export interface XYPosition {
    x: number;
    y: number;
  }

  export interface NodeBase {
    id: string;
    type?: string;
    position: XYPosition;
    style?: CSSProperties;
    className?: string;
    selected?: boolean;
    dragging?: boolean;
    draggable?: boolean;
    selectable?: boolean;
    connectable?: boolean;
    deletable?: boolean;
    hidden?: boolean;
    zIndex?: number;
    [key: string]: unknown;
  }

  export interface Node<T = Record<string, unknown>> extends NodeBase {
    data: T;
  }

  export interface Edge<T = Record<string, unknown>> {
    id: string;
    source: string;
    target: string;
    sourceHandle?: string | null;
    targetHandle?: string | null;
    type?: string;
    animated?: boolean;
    style?: CSSProperties;
    className?: string;
    label?: ReactNode;
    data?: T;
    selected?: boolean;
    hidden?: boolean;
    deletable?: boolean;
    [key: string]: unknown;
  }

  export interface Connection {
    source: string | null;
    target: string | null;
    sourceHandle?: string | null;
    targetHandle?: string | null;
  }

  export type NodeChange =
    | { type: "position"; id: string; position?: XYPosition; dragging?: boolean }
    | { type: "select"; id: string; selected: boolean }
    | { type: "remove"; id: string }
    | { type: "dimensions"; id: string; dimensions?: { width: number; height: number } };

  export type EdgeChange =
    | { type: "select"; id: string; selected: boolean }
    | { type: "remove"; id: string };

  export interface NodeProps<T = Record<string, unknown>> {
    id: string;
    data: T;
    selected: boolean;
    type?: string;
    dragging?: boolean;
    xPos?: number;
    yPos?: number;
    isConnectable?: boolean;
    zIndex?: number;
    sourcePosition?: Position;
    targetPosition?: Position;
  }

  export interface HandleProps {
    type: "source" | "target";
    position: Position;
    id?: string;
    style?: CSSProperties;
    className?: string;
    isConnectable?: boolean;
    isConnectableStart?: boolean;
    isConnectableEnd?: boolean;
    onConnect?: (connection: Connection) => void;
    onClick?: (event: MouseEvent, handle: unknown) => void;
  }

  export const Handle: ComponentType<HandleProps>;

  export type NodeTypes = Record<string, ComponentType<NodeProps<unknown>>>;
  export type EdgeTypes = Record<string, ComponentType<unknown>>;

  export interface ReactFlowProps {
    nodes?: Node[];
    edges?: Edge[];
    nodeTypes?: NodeTypes;
    edgeTypes?: EdgeTypes;
    onNodesChange?: (changes: NodeChange[]) => void;
    onEdgesChange?: (changes: EdgeChange[]) => void;
    onConnect?: (connection: Connection) => void;
    onInit?: (instance: ReactFlowInstance) => void;
    fitView?: boolean;
    fitViewOptions?: { padding?: number };
    minZoom?: number;
    maxZoom?: number;
    defaultViewport?: { x: number; y: number; zoom: number };
    snapToGrid?: boolean;
    snapGrid?: [number, number];
    nodesDraggable?: boolean;
    nodesConnectable?: boolean;
    elementsSelectable?: boolean;
    selectNodesOnDrag?: boolean;
    onNodeClick?: (event: MouseEvent, node: Node) => void;
    onNodeDoubleClick?: (event: MouseEvent, node: Node) => void;
    onEdgeClick?: (event: MouseEvent, edge: Edge) => void;
    onPaneClick?: (event: MouseEvent) => void;
    children?: ReactNode;
    style?: CSSProperties;
    className?: string;
    proOptions?: { hideAttribution?: boolean };
    [key: string]: unknown;
  }

  export interface ReactFlowInstance {
    zoomIn: () => void;
    zoomOut: () => void;
    fitView: (opts?: { padding?: number; duration?: number }) => void;
    getNodes: () => Node[];
    getEdges: () => Edge[];
    setNodes: (nodes: Node[] | ((nodes: Node[]) => Node[])) => void;
    setEdges: (edges: Edge[] | ((edges: Edge[]) => Edge[])) => void;
    addNodes: (nodes: Node | Node[]) => void;
    addEdges: (edges: Edge | Edge[]) => void;
    toObject: () => { nodes: Node[]; edges: Edge[]; viewport: unknown };
  }

  export const ReactFlow: ComponentType<ReactFlowProps>;

  export interface BackgroundProps {
    color?: string;
    gap?: number | [number, number];
    size?: number;
    variant?: "dots" | "lines" | "cross";
    style?: CSSProperties;
    className?: string;
  }
  export const Background: ComponentType<BackgroundProps>;

  export interface ControlsProps {
    showZoom?: boolean;
    showFitView?: boolean;
    showInteractive?: boolean;
    style?: CSSProperties;
    className?: string;
    onZoomIn?: () => void;
    onZoomOut?: () => void;
    onFitView?: () => void;
  }
  export const Controls: ComponentType<ControlsProps>;

  export interface MiniMapProps {
    nodeColor?: string | ((node: Node) => string);
    nodeStrokeColor?: string | ((node: Node) => string);
    nodeBorderRadius?: number;
    maskColor?: string;
    style?: CSSProperties;
    className?: string;
  }
  export const MiniMap: ComponentType<MiniMapProps>;

  export interface PanelProps {
    position?: "top-left" | "top-right" | "top-center" | "bottom-left" | "bottom-right" | "bottom-center";
    children?: ReactNode;
    style?: CSSProperties;
    className?: string;
  }
  export const Panel: ComponentType<PanelProps>;

  export function applyNodeChanges(changes: NodeChange[], nodes: Node[]): Node[];
  export function applyEdgeChanges(changes: EdgeChange[], edges: Edge[]): Edge[];
  export function addEdge(connection: Connection | Edge, edges: Edge[]): Edge[];

  export function useReactFlow(): ReactFlowInstance;
  export function useNodes(): Node[];
  export function useEdges(): Edge[];
}
