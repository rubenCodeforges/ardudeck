/**
 * Position of the free-floating flight control panel docked in the 3D Sim World
 * (left/top pixel coords within that window). Same shape as minimap-store.ts:
 * `setPos` updates in memory on every drag frame, `persist` writes to localStorage
 * once, on drop. Null until first placed; the panel then defaults to the lower right.
 */

import { create } from 'zustand';

const KEY = 'ardudeck.simFlightControlPanelPos';

function load(): { x: number | null; y: number | null } {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (typeof p.x === 'number' && typeof p.y === 'number') return p;
    }
  } catch {
    /* ignore */
  }
  return { x: null, y: null };
}

interface State {
  x: number | null;
  y: number | null;
  setPos: (x: number, y: number) => void;
  persist: () => void;
}

export const useSimFlightControlPanelStore = create<State>((set, get) => ({
  ...load(),
  setPos: (x, y) => set({ x, y }),
  persist: () => {
    const { x, y } = get();
    try {
      localStorage.setItem(KEY, JSON.stringify({ x, y }));
    } catch {
      /* ignore */
    }
  },
}));
