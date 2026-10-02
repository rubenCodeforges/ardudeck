/**
 * Zustand store for the Lua Graph Editor.
 * Manages React Flow nodes/edges, selection, undo/redo, and graph metadata.
 */
import { create } from 'zustand';
import {
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  type Connection,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
} from '@xyflow/react';
import type { GraphNodeData, GraphEdgeData, GraphFile, NodeCategory } from '../components/lua-graph/lua-graph-types';
import { getNodeDefinition, getEffectivePorts } from '../components/lua-graph/node-library';

// ── Undo / Redo Snapshot ────────────────────────────────────────

interface Snapshot {
  nodes: Node<GraphNodeData>[];
  edges: Edge<GraphEdgeData>[];
}

const MAX_HISTORY = 50;

// ── Store Interface ─────────────────────────────────────────────

interface LuaGraphStore {
  // Graph data
  nodes: Node<GraphNodeData>[];
  edges: Edge<GraphEdgeData>[];

  // Metadata
  graphName: string;
  graphDescription: string;
  /** Script run interval in ms — how often `update()` is called */
  runIntervalMs: number;
  filePath: string | null;
  isDirty: boolean;

  // Selection
  selectedNodeId: string | null;

  // Undo / Redo
  history: Snapshot[];
  historyIndex: number;

  // Actions — React Flow callbacks
  onNodesChange: OnNodesChange<Node<GraphNodeData>>;
  onEdgesChange: OnEdgesChange<Edge<GraphEdgeData>>;
  onConnect: OnConnect;

  // Actions — graph manipulation
  addNode: (definitionType: string, position: { x: number; y: number }) => void;
  removeSelectedNodes: () => void;
  setSelectedNode: (id: string | null) => void;
  updateNodeProperty: (nodeId: string, propertyId: string, value: number | boolean | string) => void;
  updateNodeLabel: (nodeId: string, label: string) => void;

  // Actions — file operations
  newGraph: () => void;
  loadGraph: (file: GraphFile) => void;
  setFilePath: (path: string | null) => void;
  setGraphName: (name: string) => void;
  setGraphDescription: (desc: string) => void;
  setRunIntervalMs: (ms: number) => void;
  toGraphFile: () => GraphFile;

  // Actions — undo / redo
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

let nodeIdCounter = 0;

function nextNodeId(): string {
  nodeIdCounter += 1;
  return `node_${nodeIdCounter}`;
}

const DEFAULT_STATE = {
  nodes: [] as Node<GraphNodeData>[],
  edges: [] as Edge<GraphEdgeData>[],
  graphName: 'Untitled Script', // i18n-exempt: persisted graph data
  graphDescription: '',
  runIntervalMs: 1000,
  filePath: null as string | null,
  isDirty: false,
  selectedNodeId: null as string | null,
  history: [] as Snapshot[],
  historyIndex: -1,
};

export const useLuaGraphStore = create<LuaGraphStore>((set, get) => ({
  ...DEFAULT_STATE,

  // ── React Flow Callbacks ────────────────────────────────────

  onNodesChange: (changes) => {
    set((state) => ({
      nodes: applyNodeChanges(changes, state.nodes) as Node<GraphNodeData>[],
      isDirty: true,
    }));
  },

  onEdgesChange: (changes) => {
    set((state) => ({
      edges: applyEdgeChanges(changes, state.edges) as Edge<GraphEdgeData>[],
      isDirty: true,
    }));
  },

  onConnect: (connection: Connection) => {
    const { edges, nodes } = get();

    // Find source node to determine port type for edge coloring
    const sourceNode = nodes.find((n) => n.id === connection.source);
    let sourcePortType: GraphEdgeData['sourcePortType'] = 'any';
    if (sourceNode) {
      const def = getNodeDefinition(sourceNode.data.definitionType);
      const port = def?.outputs.find((p) => p.id === connection.sourceHandle);
      if (port) sourcePortType = port.type;
    }

    get().pushHistory();

    const newEdge = addEdge(
      {
        ...connection,
        type: 'smoothstep',
        data: { sourcePortType },
      },
      edges,
    ) as Edge<GraphEdgeData>[];

    set({ edges: newEdge, isDirty: true });
  },

  // ── Node Manipulation ───────────────────────────────────────

  addNode: (definitionType, position) => {
    const def = getNodeDefinition(definitionType);
    if (!def) return;

    get().pushHistory();

    const id = nextNodeId();
    const propertyValues: Record<string, number | boolean | string> = {};
    for (const prop of def.properties) {
      propertyValues[prop.id] = prop.defaultValue;
    }

    const newNode: Node<GraphNodeData> = {
      id,
      type: 'graphNode',
      position,
      data: {
        definitionType: def.type,
        label: def.label,
        category: def.category,
        propertyValues,
      },
    };

    set((state) => ({
      nodes: [...state.nodes, newNode],
      isDirty: true,
      selectedNodeId: id,
    }));
  },

  removeSelectedNodes: () => {
    const { nodes, edges, selectedNodeId } = get();

    // Collect selected edges
    const selectedEdgeIds = edges.filter((e) => e.selected).map((e) => e.id);

    // Collect selected nodes
    const selectedNodeIds = nodes.filter((n) => n.selected).map((n) => n.id);
    if (selectedNodeIds.length === 0 && selectedNodeId) {
      selectedNodeIds.push(selectedNodeId);
    }

    if (selectedNodeIds.length === 0 && selectedEdgeIds.length === 0) return;

    get().pushHistory();

    const nodeIdSet = new Set(selectedNodeIds);
    const edgeIdSet = new Set(selectedEdgeIds);
    set({
      nodes: nodes.filter((n) => !nodeIdSet.has(n.id)),
      edges: edges.filter(
        (e) => !edgeIdSet.has(e.id) && !nodeIdSet.has(e.source) && !nodeIdSet.has(e.target),
      ),
      selectedNodeId: null,
      isDirty: true,
    });
  },

  setSelectedNode: (id) => set({ selectedNodeId: id }),

  updateNodeProperty: (nodeId, propertyId, value) => {
    set((state) => {
      const nodes = state.nodes.map((n) =>
        n.id === nodeId
          ? {
              ...n,
              data: {
                ...n.data,
                propertyValues: { ...n.data.propertyValues, [propertyId]: value },
              },
            }
          : n,
      );

      // Custom Lua pin lists define the node's ports; drop edges whose
      // handle no longer exists after a pin rename/removal.
      let edges = state.edges;
      const node = nodes.find((n) => n.id === nodeId);
      const def = node && getNodeDefinition(node.data.definitionType);
      if (node && def && def.type === 'flow-custom-lua' && (propertyId === 'inputs' || propertyId === 'outputs')) {
        const ports = getEffectivePorts(def, node.data.propertyValues);
        const inputIds = new Set(ports.inputs.map((p) => p.id));
        const outputIds = new Set(ports.outputs.map((p) => p.id));
        edges = edges.filter((e) => {
          if (e.target === nodeId && !inputIds.has(e.targetHandle ?? '')) return false;
          if (e.source === nodeId && !outputIds.has(e.sourceHandle ?? '')) return false;
          return true;
        });
      }

      return { nodes, edges, isDirty: true };
    });
  },

  updateNodeLabel: (nodeId, label) => {
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, label } } : n,
      ),
      isDirty: true,
    }));
  },

  // ── File Operations ─────────────────────────────────────────

  newGraph: () => {
    nodeIdCounter = 0;
    set({
      ...DEFAULT_STATE,
      history: [],
      historyIndex: -1,
    });
  },

  loadGraph: (file) => {
    // Reset counter to avoid collisions
    let maxId = 0;
    for (const n of file.nodes) {
      const match = /node_(\d+)/.exec(n.id);
      if (match?.[1]) {
        const num = parseInt(match[1], 10);
        if (num > maxId) maxId = num;
      }
    }
    nodeIdCounter = maxId;

    const nodes: Node<GraphNodeData>[] = file.nodes.map((n) => ({
      id: n.id,
      type: 'graphNode',
      position: n.position,
      data: n.data,
    }));

    const edges: Edge<GraphEdgeData>[] = file.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
      type: 'smoothstep',
      data: e.data,
    }));

    set({
      nodes,
      edges,
      graphName: file.name,
      graphDescription: file.description,
      runIntervalMs: file.runIntervalMs ?? 1000,
      isDirty: false,
      selectedNodeId: null,
      history: [],
      historyIndex: -1,
    });
  },

  setFilePath: (path) => set({ filePath: path }),
  setGraphName: (name) => set({ graphName: name, isDirty: true }),
  setGraphDescription: (desc) => set({ graphDescription: desc, isDirty: true }),
  setRunIntervalMs: (ms) => set({ runIntervalMs: Math.max(50, Math.min(60000, ms)), isDirty: true }),

  toGraphFile: (): GraphFile => {
    const { nodes, edges, graphName, graphDescription, runIntervalMs } = get();
    const now = new Date().toISOString();
    return {
      version: 1,
      name: graphName,
      description: graphDescription,
      runIntervalMs,
      createdAt: now,
      updatedAt: now,
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.data.definitionType,
        position: n.position,
        data: n.data,
      })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle ?? '',
        targetHandle: e.targetHandle ?? '',
        data: e.data,
      })),
      viewport: { x: 0, y: 0, zoom: 1 },
    };
  },

  // ── Undo / Redo ─────────────────────────────────────────────

  pushHistory: () => {
    const { nodes, edges, history, historyIndex } = get();
    const snapshot: Snapshot = {
      nodes: structuredClone(nodes),
      edges: structuredClone(edges),
    };
    // Trim future if we've undone
    const trimmed = history.slice(0, historyIndex + 1);
    trimmed.push(snapshot);
    // Cap at max
    if (trimmed.length > MAX_HISTORY) trimmed.shift();

    set({
      history: trimmed,
      historyIndex: trimmed.length - 1,
    });
  },

  undo: () => {
    const { history, historyIndex } = get();
    if (historyIndex < 0) return;

    const snapshot = history[historyIndex];
    if (!snapshot) return;

    set({
      nodes: structuredClone(snapshot.nodes),
      edges: structuredClone(snapshot.edges),
      historyIndex: historyIndex - 1,
      isDirty: true,
    });
  },

  redo: () => {
    const { history, historyIndex } = get();
    const nextIdx = historyIndex + 2; // +1 for current, +1 for next
    if (nextIdx >= history.length) return;

    const snapshot = history[nextIdx];
    if (!snapshot) return;

    set({
      nodes: structuredClone(snapshot.nodes),
      edges: structuredClone(snapshot.edges),
      historyIndex: nextIdx - 1,
      isDirty: true,
    });
  },

  canUndo: () => get().historyIndex >= 0,
  canRedo: () => get().historyIndex + 2 < get().history.length,
}));
