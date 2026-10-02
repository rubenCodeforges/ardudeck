/** Global preference for how a docked group's backdrop bulges round gauges. */

import { create } from 'zustand';

export type GroupShapeMode = 'square' | 'roundedAll' | 'edgesOnly';

export const GROUP_SHAPE_MODES: readonly GroupShapeMode[] = ['square', 'roundedAll', 'edgesOnly'];

export const GROUP_SHAPE_LABEL_KEYS: Record<GroupShapeMode, string> = {
  square: 'stores:groupShapeStore.label.square',
  roundedAll: 'stores:groupShapeStore.label.roundedAll',
  edgesOnly: 'stores:groupShapeStore.label.edgesOnly',
};

export const GROUP_SHAPE_DESCRIPTION_KEYS: Record<GroupShapeMode, string> = {
  square: 'stores:groupShapeStore.description.square',
  roundedAll: 'stores:groupShapeStore.description.roundedAll',
  edgesOnly: 'stores:groupShapeStore.description.edgesOnly',
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
