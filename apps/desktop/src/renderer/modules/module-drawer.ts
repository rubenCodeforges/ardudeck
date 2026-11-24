import { useSyncExternalStore } from 'react';

const KEY = 'ardudeck.moduleDrawer';
export const DRAWER_MIN = 340;
export const DRAWER_MAX = 760;
const DEFAULT_WIDTH = 420;

interface DrawerState { openKey: string | null; lastKey: string | null; width: number }

function load(): DrawerState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { openKey: null, lastKey: null, width: DEFAULT_WIDTH, ...JSON.parse(raw) };
  } catch {
    /* storage unavailable */
  }
  return { openKey: null, lastKey: null, width: DEFAULT_WIDTH };
}

let state = load();
const listeners = new Set<() => void>();

function set(next: Partial<DrawerState>) {
  state = { ...state, ...next };
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable */
  }
  listeners.forEach((l) => l());
}

export const openDrawer = (key: string) => set({ openKey: key, lastKey: key });
export const closeDrawer = () => set({ openKey: null });
export const resizeDrawer = (width: number) => set({ width: Math.max(DRAWER_MIN, Math.min(DRAWER_MAX, width)) });

export function useDrawer(): DrawerState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
  );
}
