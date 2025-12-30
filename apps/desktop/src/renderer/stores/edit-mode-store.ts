import { create } from 'zustand';

/**
 * Edit mode determines which type of data the user is editing:
 * - mission: Waypoints (blue)
 * - geofence: Fence polygons/circles (green)
 * - rally: Rally points (orange)
 */
export type EditMode = 'mission' | 'geofence' | 'rally';

interface EditModeStore {
  activeMode: EditMode;
  setActiveMode: (mode: EditMode) => void;
  reset: () => void;
}

export const useEditModeStore = create<EditModeStore>((set) => ({
  activeMode: 'mission',

  setActiveMode: (mode) => {
    set({ activeMode: mode });
  },

  reset: () => {
    set({ activeMode: 'mission' });
  },
}));
