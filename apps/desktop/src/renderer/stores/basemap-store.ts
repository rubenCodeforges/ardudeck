import { create } from 'zustand';
import type { ModuleBasemapInfo } from '../../shared/basemap-types';

interface BasemapStore {
  basemaps: ModuleBasemapInfo[];
}

export const useBasemapStore = create<BasemapStore>(() => ({ basemaps: [] }));

let started = false;

/** Cargo base maps for the layer pickers; follows cargos loading and unloading. */
export function useModuleBasemaps(): ModuleBasemapInfo[] {
  if (!started && typeof window !== 'undefined' && window.electronAPI?.basemapsList) {
    started = true;
    window.electronAPI.onBasemapsChanged((basemaps) => useBasemapStore.setState({ basemaps }));
    window.electronAPI.basemapsList()
      .then((basemaps) => useBasemapStore.setState({ basemaps }))
      .catch(() => { /* older main process: no cargo base maps */ });
  }
  return useBasemapStore((s) => s.basemaps);
}

export function findModuleBasemap(list: ModuleBasemapInfo[], key: string): ModuleBasemapInfo | undefined {
  return list.find((b) => b.key === key);
}

/** One row per cargo for compact pickers: its `primary` layer, else its first. */
export function compactBasemaps(list: ModuleBasemapInfo[]): ModuleBasemapInfo[] {
  const bySlug = new Map<string, ModuleBasemapInfo>();
  for (const b of list) {
    const cur = bySlug.get(b.slug);
    if (!cur || (b.primary && !cur.primary)) bySlug.set(b.slug, b);
  }
  return [...bySlug.values()];
}
