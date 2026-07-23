/**
 * Position of the free-floating flight control panel docked in the 3D Sim World
 * (left/top pixel coords within that window). Same shape as minimap-store.ts:
 * `setPos` updates in memory on every drag frame, `persist` writes to localStorage
 * once, on drop. Null until first placed; the panel then defaults to the lower right.
 */

import { create } from 'zustand';

const KEY = 'ardudeck.simFlightControlPanelPos';

function load(): { x: number | null; y: number | null; collapsed: boolean } {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw);
      const collapsed = typeof p.collapsed === 'boolean' ? p.collapsed : false;
      if (typeof p.x === 'number' && typeof p.y === 'number') return { x: p.x, y: p.y, collapsed };
      return { x: null, y: null, collapsed };
    }
  } catch {
    /* ignore */
  }
  return { x: null, y: null, collapsed: false };
}

interface State {
  x: number | null;
  y: number | null;
  /** Collapsed to just the header sliver (keeps the 3D world clear). Persisted. */
  collapsed: boolean;
  setPos: (x: number, y: number) => void;
  persist: () => void;
  toggleCollapsed: () => void;
}

export const useSimFlightControlPanelStore = create<State>((set, get) => ({
  ...load(),
  setPos: (x, y) => set({ x, y }),
  persist: () => {
    const { x, y, collapsed } = get();
    try {
      localStorage.setItem(KEY, JSON.stringify({ x, y, collapsed }));
    } catch {
      /* ignore */
    }
  },
  toggleCollapsed: () => {
    set({ collapsed: !get().collapsed });
    get().persist();
  },
}));
