// node-library.ts labels stay English: they are copied into saved graphs.
import type { TFunction } from 'i18next';
import type { GraphTemplate } from './graph-templates';
import type { GraphNodeData, NodeDefinition, NodeProperty, PortDefinition } from './lua-graph-types';

const base = (def: NodeDefinition) => `lua-graph:nodeLibrary.${def.type}`;

export function nodeLabel(t: TFunction, def: NodeDefinition): string {
  return t(`${base(def)}.label`, { defaultValue: def.label });
}

export function nodeDescription(t: TFunction, def: NodeDefinition): string {
  return t(`${base(def)}.description`, { defaultValue: def.description });
}

/** The user's own node title, or the translated default while it still matches the definition. */
export function nodeInstanceLabel(t: TFunction, def: NodeDefinition | undefined, data: GraphNodeData): string {
  return def && data.label === def.label ? nodeLabel(t, def) : data.label;
}

export function portLabel(t: TFunction, def: NodeDefinition, port: PortDefinition): string {
  const group = port.direction === 'input' ? 'inputs' : 'outputs';
  return t(`${base(def)}.${group}.${port.id}`, { defaultValue: port.label });
}

export function propertyLabel(t: TFunction, def: NodeDefinition, prop: NodeProperty): string {
  return t(`${base(def)}.props.${prop.id}`, { defaultValue: prop.label });
}

export function optionLabel(t: TFunction, def: NodeDefinition, prop: NodeProperty, index: number): string {
  const opt = prop.options?.[index];
  return t(`${base(def)}.options.${prop.id}.${index}`, { defaultValue: opt?.label ?? '' });
}

export function templateName(t: TFunction, tpl: GraphTemplate): string {
  return t(`lua-graph:templates.${tpl.id}.name`, { defaultValue: tpl.name });
}

export function templateDescription(t: TFunction, tpl: GraphTemplate): string {
  return t(`lua-graph:templates.${tpl.id}.description`, { defaultValue: tpl.description });
}

export function templateCategory(t: TFunction, category: string): string {
  return t(`lua-graph:templateCategories.${category.replace(/\s+/g, '')}`, { defaultValue: category });
}
