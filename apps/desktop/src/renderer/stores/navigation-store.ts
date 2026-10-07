import { create } from 'zustand';

// Single source of truth for view ids. The ViewId type is derived from it so a
// runtime guard (isViewId) can validate untrusted strings (e.g. a deep-link
// `view` param) without duplicating the union.
export const VIEW_IDS = [
  'telemetry', 'parameters', 'mission', 'library', 'settings', 'firmware', 'cli',
  'sitl', 'sim', 'osd', 'radio-hud', 'report', 'calibration', 'lua-graph', 'modules',
  'companion', 'logs', 'inspector', 'vault', 'weather', 'trainer', 'production',
] as const;

export type ViewId = (typeof VIEW_IDS)[number];

export function isViewId(value: string): value is ViewId {
  return (VIEW_IDS as readonly string[]).includes(value);
}

interface NavigationStore {
  // State
  currentView: ViewId;
  /**
   * Pending in-view scroll target. When a caller deep-links to a view (e.g. a
   * "settings" quick link from the survey panel), it sets the element id here;
   * the target view scrolls to it on mount and clears it.
   */
  scrollTarget: string | null;

  // Actions
  setView: (view: ViewId, scrollTarget?: string) => void;
  clearScrollTarget: () => void;
}

export const useNavigationStore = create<NavigationStore>((set) => ({
  currentView: 'telemetry',
  scrollTarget: null,

  setView: (view, scrollTarget) => set({ currentView: view, scrollTarget: scrollTarget ?? null }),
  clearScrollTarget: () => set({ scrollTarget: null }),
}));
