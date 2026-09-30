/**
 * Type definitions for the Lua Graph Editor node system.
 */

// ── Port & Value Types ──────────────────────────────────────────

export type PortValueType = 'number' | 'boolean' | 'string' | 'vector3' | 'any';

export type PortDirection = 'input' | 'output';

/** Defines a port on a node definition (template) */
export interface PortDefinition {
  id: string;
  label: string;
  type: PortValueType;
  direction: PortDirection;
  /** Default value for input ports */
  defaultValue?: number | boolean | string;
}

/** A configurable property on a node (editable in inspector) */
export interface NodeProperty {
  id: string;
  label: string;
  /** 'code' renders as a multiline monospace editor in the inspector */
  type: 'number' | 'boolean' | 'string' | 'select' | 'channel' | 'code';
  defaultValue: number | boolean | string;
  options?: { label: string; value: string | number }[];
  min?: number;
  max?: number;
  step?: number;
}

// ── Node Categories ─────────────────────────────────────────────

export type NodeCategory = 'sensors' | 'logic' | 'math' | 'actions' | 'timing' | 'variables' | 'flow';

export const CATEGORY_COLORS: Record<NodeCategory, string> = {
  sensors: '#3b82f6',   // blue
  logic: '#a855f7',     // purple
  math: '#22c55e',      // green
  actions: '#ef4444',   // red
  timing: '#eab308',    // yellow
  variables: '#f97316', // orange
  flow: '#6b7280',      // gray
};

export const CATEGORY_LABELS: Record<NodeCategory, string> = {
  sensors: 'Sensors',
  logic: 'Logic',
  math: 'Math',
  actions: 'Actions',
  timing: 'Timing',
  variables: 'Variables',
  flow: 'Flow',
};

// ── Node Definition (Template) ──────────────────────────────────

/** A registered node type in the library */
export interface NodeDefinition {
  /** Unique type key, e.g. "sensor-gps" */
  type: string;
  label: string;
  description: string;
  /**
   * Keys under `lua.auto.*`, added by tools/i18n-codemod.mjs. Optional on
   * purpose: strings needing no translation (all-caps acronyms like 'AND',
   * unit-only labels) are skipped, so a component must fall back to the literal
   * when the key is absent. `label`/`description` stay until every consumer is
   * migrated to the keys.
   */
  labelKey?: string;
  descriptionKey?: string;
  category: NodeCategory;
  inputs: PortDefinition[];
  outputs: PortDefinition[];
  /** Configurable properties shown in inspector */
  properties: NodeProperty[];
  /** Lua code generation hint */
  luaTemplate?: string;
}

// ── Graph Instance Data ─────────────────────────────────────────

/** Data stored on each React Flow node instance */
export interface GraphNodeData {
  /** Reference to the NodeDefinition.type */
  definitionType: string;
  label: string;
  category: NodeCategory;
  /** Current property values (key = property id) */
  propertyValues: Record<string, number | boolean | string>;
  [key: string]: unknown;
}

/** Data stored on each React Flow edge instance */
export interface GraphEdgeData {
  /** Port type for color coding */
  sourcePortType: PortValueType;
  [key: string]: unknown;
}

// ── Graph File Format (.adgraph) ────────────────────────────────

export interface GraphFile {
  version: 1;
  name: string;
  description: string;
  /** Script run interval in milliseconds (how often `update()` is called) */
  runIntervalMs: number;
  createdAt: string;
  updatedAt: string;
  nodes: SerializedNode[];
  edges: SerializedEdge[];
  viewport: { x: number; y: number; zoom: number };
}

export interface SerializedNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: GraphNodeData;
}

export interface SerializedEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle: string;
  targetHandle: string;
  data?: GraphEdgeData;
}
