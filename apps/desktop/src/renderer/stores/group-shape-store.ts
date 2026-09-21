/** Global preference for how a docked group's backdrop bulges round gauges. */

import { create } from 'zustand';

export type GroupShapeMode = 'square' | 'roundedAll' | 'edgesOnly';

export const GROUP_SHAPE_MODES: readonly GroupShapeMode[] = ['square', 'roundedAll', 'edgesOnly'];

export const GROUP_SHAPE_LABELS: Record<GroupShapeMode, string> = {
  square: 'Square',
  roundedAll: 'Rounded (every gauge)',
  edgesOnly: 'Rounded (ends only)',
};

export const GROUP_SHAPE_DESCRIPTIONS: Record<GroupShapeMode, string> = {
  square: 'Flat card, no bulge - the original look',
  roundedAll: 'Every round gauge bulges its own circle',
  edgesOnly: "Only the run's ends bulge, gauges in the middle stay flush",
};

const KEY = 'ardudeck.groupShapeMode';
const DEFAULT_MODE: GroupShapeMode = 'edgesOnly';

function load(): GroupShapeMode {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw && (GROUP_SHAPE_MODES as readonly string[]).includes(raw)) return raw as GroupShapeMode;
  } catch { /* ignore */ }
  return DEFAULT_MODE;
}

interface State {
  mode: GroupShapeMode;
  setMode: (mode: GroupShapeMode) => void;
}

export const useGroupShapeStore = create<State>((set) => ({
  mode: load(),
  setMode: (mode) => {
    set({ mode });
    try { localStorage.setItem(KEY, mode); } catch { /* ignore */ }
  },
}));
