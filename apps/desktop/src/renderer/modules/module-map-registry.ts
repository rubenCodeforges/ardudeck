/**
 * Registry of map layers contributed by modules (host.map). The host owns the
 * map library, the layer control and the stacking, as it owns the panel dock.
 * Drawing only: nothing here can change what the aircraft does.
 *
 * Kept out of the module host API so MapPanel can import it alone.
 */

import type { MapFeature, MapLayerRegistration } from '@ardudeck/module-sdk';

export interface ModuleMapLayer {
  /** Namespaced so two modules may both register an id of "volumes". */
  key: string;
  slug: string;
  reg: MapLayerRegistration;
}

const registry = new Map<string, ModuleMapLayer>();
const bySlug = new Map<string, Set<string>>();
const listeners = new Set<() => void>();
/** Unsubscribes from each layer's own change feed, so live layers redraw. */
const watchers = new Map<string, () => void>();

function emit(): void {
  for (const l of listeners) l();
}

function keyFor(slug: string, id: string): string {
  return `${slug}::${id}`;
}

/** Subscribe to registry changes, and to any live layer's own changes. */
export function subscribeModuleMapLayers(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function registerModuleMapLayer(slug: string, reg: MapLayerRegistration): void {
  if (!reg?.id) throw new Error(`[module:${slug}] map layer needs an id`);
  if (typeof reg.features !== 'function') {
    throw new Error(`[module:${slug}] map layer ${reg.id} needs a features()`);
  }
  const key = keyFor(slug, reg.id);
  // Replacing an id must drop the old watcher or it fires for a dead layer.
  watchers.get(key)?.();
  watchers.delete(key);

  registry.set(key, { key, slug, reg });
  if (reg.defaultVisible === false && !hidden.has(key)) hidden.add(key);
  let ids = bySlug.get(slug);
  if (!ids) {
    ids = new Set();
    bySlug.set(slug, ids);
  }
  ids.add(reg.id);

  if (typeof reg.subscribe === 'function') {
    try {
      watchers.set(key, reg.subscribe(emit));
    } catch (err) {
      // Losing live updates, not the layer: static features still draw.
      console.warn(`[module:${slug}] map layer ${reg.id} subscribe failed`, err);
    }
  }
  emit();
}

export function unregisterModuleMapLayer(slug: string, id: string): void {
  if (!bySlug.get(slug)?.has(id)) return;
  const key = keyFor(slug, id);
  watchers.get(key)?.();
  watchers.delete(key);
  registry.delete(key);
  hidden.delete(key);
  bySlug.get(slug)?.delete(id);
  emit();
}

/** Drop everything a module registered, for unload. */
export function unregisterModuleMapLayersFor(slug: string): void {
  const ids = bySlug.get(slug);
  if (!ids) return;
  for (const id of [...ids]) unregisterModuleMapLayer(slug, id);
  bySlug.delete(slug);
}

/** Hidden by the pilot. Host-owned, so the control and the drawing agree. */
const hidden = new Set<string>();

export function isLayerVisible(key: string): boolean {
  return !hidden.has(key);
}

export function setLayerVisible(key: string, visible: boolean): void {
  if (visible) hidden.delete(key);
  else hidden.add(key);
  emit();
}

/** Registered layers, in draw order (low first, then by key for stability). */
export function getModuleMapLayers(): ModuleMapLayer[] {
  return [...registry.values()].sort((a, b) => {
    const d = (a.reg.order ?? 0) - (b.reg.order ?? 0);
    return d !== 0 ? d : a.key.localeCompare(b.key);
  });
}

/** Features for one layer; a module that throws loses its frame, not the map. */
export function featuresOf(layer: ModuleMapLayer): MapFeature[] {
  try {
    const out = layer.reg.features();
    return Array.isArray(out) ? out : [];
  } catch (err) {
    console.warn(`[module:${layer.slug}] map layer ${layer.reg.id} features() threw`, err);
    return [];
  }
}
