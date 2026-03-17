import { create } from 'zustand';

export type ViewId = 'telemetry' | 'parameters' | 'mission' | 'library' | 'settings' | 'firmware' | 'cli' | 'sitl' | 'osd' | 'report' | 'calibration' | 'lua-graph' | 'modules' | 'companion';

interface NavigationStore {
  // State
  currentView: ViewId;

  // Actions
  setView: (view: ViewId) => void;
}

export const useNavigationStore = create<NavigationStore>((set) => ({
  currentView: 'telemetry',

  setView: (view) => set({ currentView: view }),
}));
