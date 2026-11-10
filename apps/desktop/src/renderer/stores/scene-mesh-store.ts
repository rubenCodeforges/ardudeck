import { create } from 'zustand';
import type { SceneName } from '@ardudeck/module-sdk';
import type { SceneMeshEntry } from '../../shared/tile-source-types';

interface SceneMeshStore {
  entries: SceneMeshEntry[];
  version: number;
  refresh(): Promise<void>;
  start(): () => void;
}

export const useSceneMeshStore = create<SceneMeshStore>((set, get) => ({
  entries: [],
  version: 0,
  refresh: async () => {
    try {
      set({ entries: await window.electronAPI.sceneMeshesList(), version: get().version + 1 });
    } catch {
      // older main process: no meshes
    }
  },
  start: () => {
    void get().refresh();
    return window.electronAPI.onSceneMeshesChanged((entries) => set({ entries, version: get().version + 1 }));
  },
}));

/** Entries shown in a scene; an entry without a scene list is in all of them. */
export function meshesFor(scene: SceneName): SceneMeshEntry[] {
  return useSceneMeshStore.getState().entries.filter((e) => !e.scenes || e.scenes.includes(scene));
}
