import { create } from 'zustand';

/** Ask the mission planner to show one of its dock tabs, e.g. from the toolbar. */
export const useMissionPanelRequestStore = create<{
  request: { id: string; seq: number } | null;
  open: (id: string) => void;
}>((set, get) => ({
  request: null,
  open: (id) => set({ request: { id, seq: (get().request?.seq ?? 0) + 1 } }),
}));
