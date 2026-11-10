import type { SceneMeshRegistration } from '@ardudeck/module-sdk';
import { basename } from 'node:path';
import { ASSET_SCHEME, type SceneMeshEntry } from '../../shared/tile-source-types.js';

const entries = new Map<string, SceneMeshEntry>();
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

export function subscribeSceneMeshes(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function registerSceneMesh(slug: string, reg: SceneMeshRegistration): SceneMeshEntry {
  if (!reg?.id) throw new Error(`[module:${slug}] scene mesh needs an id`);
  const files = [reg.glb, reg.tileset, reg.pointCloud].filter((f) => !!f);
  if (files.length > 1) throw new Error(`[module:${slug}] scene mesh ${reg.id} takes exactly one of glb, tileset or pointCloud`);
  const file = files[0];
  if (!file) throw new Error(`[module:${slug}] scene mesh ${reg.id} needs a glb, tileset or pointCloud path`);
  if (reg.pointSizePx !== undefined && !(Number.isFinite(reg.pointSizePx) && reg.pointSizePx > 0)) {
    throw new Error(`[module:${slug}] scene mesh ${reg.id} needs a positive pointSizePx`);
  }
  const key = `${slug}::${reg.id}`;
  const url = `${ASSET_SCHEME}://mesh/${encodeURIComponent(key)}/${encodeURIComponent(basename(file))}`;
  const entry: SceneMeshEntry = { ...reg, slug, key, url };
  entries.set(key, entry);
  emit();
  return entry;
}

export function unregisterSceneMesh(slug: string, id: string): void {
  if (entries.delete(`${slug}::${id}`)) emit();
}

export function unregisterSceneMeshesFor(slug: string): void {
  let changed = false;
  for (const [k, e] of entries) {
    if (e.slug === slug) {
      entries.delete(k);
      changed = true;
    }
  }
  if (changed) emit();
}

export function listSceneMeshes(): SceneMeshEntry[] {
  return [...entries.values()];
}

export function sceneMeshByKey(key: string): SceneMeshEntry | undefined {
  return entries.get(key);
}
